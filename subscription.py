"""
订阅链接生成 —— 同一份用户配置，三种格式输出：
- base64: V2RayN / V2Box / Shadowrocket 通用
- clash: Clash / Clash Verge / Clash Meta (YAML)
- shadowrocket: 本质是 vless:// URI 列表（和 base64 装的内容一样），专门给 Shadowrocket
"""
import base64
import os
import yaml
import urllib.parse


# 服务器配置（从环境变量读）
def _server():
    return {
        "addr": os.environ.get("PUBLIC_HOST", "47.99.155.204"),
        "port": int(os.environ.get("PUBLIC_PORT", "443")),
        "name": os.environ.get("SERVER_NAME", "MyVPN"),
    }


def _vless_uri(user: dict) -> str:
    """构造 vless://reality@host:port?params#name 形式的 URI"""
    s = _server()
    params = {
        "type": "tcp",
        "security": "reality",
        "pbk": os.environ.get("XRAY_PUBLIC_KEY", ""),  # Reality public key
        "fp": "chrome",
        "sni": "www.microsoft.com",
        "sid": os.environ.get("XRAY_SHORT_ID", "3e1ac0442faff96a"),
        "flow": "",
        "spx": "/",
    }
    # 真实代码里硬编码 shortId 不可取，应该支持多 shortId 列表
    # 简化：使用一个即可
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v})
    name = urllib.parse.quote(s["name"] + "-" + user["username"])
    return f"vless://{user['uuid']}@{s['addr']}:{s['port']}?{query}#{name}"


def gen_base64(user: dict) -> str:
    """V2RayN/Shadowrocket 通用：每行一条 vless://"""
    s = _server()
    lines = []
    for short_id in os.environ.get("XRAY_SHORT_IDS", "3e1ac0442faff96a,af31f48d2e8778f7").split(","):
        params = {
            "type": "tcp",
            "security": "reality",
            "pbk": os.environ.get("XRAY_PUBLIC_KEY", ""),
            "fp": "chrome",
            "sni": "www.microsoft.com",
            "sid": short_id.strip(),
        }
        q = urllib.parse.urlencode(params)
        name = urllib.parse.quote(f"{s['name']}-{user['username']}-{short_id.strip()[:6]}")
        lines.append(f"vless://{user['uuid']}@{s['addr']}:{s['port']}?{q}#{name}")
    raw = "\n".join(lines).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def gen_shadowrocket(user: dict) -> str:
    """Shadowrocket 用的就是 vless:// 列表（与 base64 一样）"""
    return gen_base64(user)


def gen_clash(user: dict) -> str:
    """Clash Meta 配置（VLESS + Reality）"""
    s = _server()
    short_ids = os.environ.get("XRAY_SHORT_IDS", "3e1ac0442faff96a,af31f48d2e8778f7").split(",")
    proxies = []
    for sid in short_ids:
        sid = sid.strip()
        proxy = {
            "name": f"{s['name']}-{user['username']}-{sid[:6]}",
            "type": "vless",
            "server": s["addr"],
            "port": s["port"],
            "uuid": user["uuid"],
            "network": "tcp",
            "tls": False,  # Reality 不走传统 TLS
            "flow": "",
            "client-fingerprint": "chrome",
            "reality-opts": {
                "public-key": os.environ.get("XRAY_PUBLIC_KEY", ""),
                "short-id": sid,
            },
        }
        proxies.append(proxy)
    cfg = {
        "port": 7890,
        "socks-port": 7891,
        "allow-lan": False,
        "mode": "rule",
        "log-level": "info",
        "proxies": proxies,
        "proxy-groups": [
            {
                "name": "Proxy",
                "type": "select",
                "proxies": [p["name"] for p in proxies] + ["DIRECT"],
            }
        ],
        "rules": [
            "GEOIP,CN,DIRECT",
            "MATCH,Proxy",
        ],
    }
    return yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False)
