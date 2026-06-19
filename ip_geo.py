"""
IP 地理位置查询 —— ip-api.com 免费档

设计要点：
- 单进程内串行调用（免费档限速 45 req/min，间隔由 settings 控制）
- 命中 vpn_ip_geo 缓存直接返回，不打外网
- 调用失败返回 None，由调用方降级显示"未知"
- 不传任何敏感 header，避免被 ip-api 关联账户
"""
from __future__ import annotations

import json
import logging
import threading
import time

import requests

log = logging.getLogger("ip-geo")

API_URL = "http://ip-api.com/json/{ip}?lang=zh-CN"
TIMEOUT = 5  # 秒

# 串行化：进程内只有 1 个线程打 ip-api
_api_lock = threading.Lock()
_last_call_ts = 0.0


def _get_db():
    from app import get_db
    return get_db()


def _get_api_interval() -> float:
    """从 settings 读 api 间隔（秒）；拿不到用默认 2"""
    from app import get_setting
    try:
        return float(get_setting('VPN_IP_GEO_API_INTERVAL', 2))
    except Exception:
        return 2.0


def _throttle():
    """按间隔下限串行等待，避免打爆免费档"""
    global _last_call_ts
    interval = _get_api_interval()
    with _api_lock:
        now = time.time()
        wait = interval - (now - _last_call_ts)
        if wait > 0:
            time.sleep(wait)
        _last_call_ts = time.time()


def _fetch_remote(ip: str):
    """实际打 ip-api。返回 dict 或 None。"""
    # 跳过明显非公网 IP，避免浪费额度
    if ip in ('127.0.0.1', '::1', 'localhost') or ip.startswith('127.'):
        return {'country': '本地', 'region': '本地', 'city': '本地', 'isp': '本地'}
    if ip.startswith(('10.', '192.168.', '172.16.', '172.17.', '172.18.',
                      '172.19.', '172.20.', '172.21.', '172.22.', '172.23.',
                      '172.24.', '172.25.', '172.26.', '172.27.', '172.28.',
                      '172.29.', '172.30.', '172.31.')):
        # 局域网/容器网段 —— 不查
        return {'country': '内网', 'region': '内网', 'city': '内网', 'isp': '内网'}
    _throttle()
    try:
        resp = requests.get(API_URL.format(ip=ip), timeout=TIMEOUT)
        if resp.status_code != 200:
            log.warning(f"[ip-geo] {ip} HTTP {resp.status_code}")
            return None
        data = resp.json()
        if data.get('status') == 'fail':
            log.warning(f"[ip-geo] {ip} 查询失败: {data.get('message')}")
            return None
        return {
            'country': data.get('country', '未知') or '未知',
            'region': data.get('regionName', '未知') or '未知',
            'city': data.get('city', '未知') or '未知',
            'isp': data.get('isp', '未知') or '未知',
        }
    except requests.RequestException as e:
        log.warning(f"[ip-geo] {ip} 请求异常: {e}")
        return None
    except (ValueError, json.JSONDecodeError) as e:
        log.warning(f"[ip-geo] {ip} 解析异常: {e}")
        return None


def get_geo(ip: str, refresh: bool = False):
    """取 IP 的地理位置。先查 vpn_ip_geo 表，miss 或 refresh=True 时打 ip-api。

    返回 dict {country, region, city, isp} 或 None（彻底失败）。
    调用方负责把返回 dict 写入 vpn_ip_geo（即便 None 也写入以记住"已知失败"——用 fetched_at 标记）。
    """
    if not ip:
        return None
    conn = _get_db()
    try:
        row = conn.execute(
            'SELECT country, region, city, isp, fetched_at FROM vpn_ip_geo WHERE ip = ?',
            (ip,),
        ).fetchone()
    finally:
        conn.close()

    if row and not refresh:
        # 命中缓存：刷新 last_seen_at，位置直接返回
        conn = _get_db()
        try:
            conn.execute(
                'UPDATE vpn_ip_geo SET last_seen_at = ? WHERE ip = ?',
                (int(time.time()), ip),
            )
            conn.commit()
        finally:
            conn.close()
        return {
            'country': row['country'],
            'region': row['region'],
            'city': row['city'],
            'isp': row['isp'],
        }

    info = _fetch_remote(ip)
    return info  # None 或 dict


def upsert_geo(ip: str, info: dict):
    """写 vpn_ip_geo（last_seen_at 同步更新）"""
    now = int(time.time())
    conn = _get_db()
    try:
        conn.execute(
            '''INSERT INTO vpn_ip_geo (ip, country, region, city, isp, last_seen_at, fetched_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(ip) DO UPDATE SET
                   country = excluded.country,
                   region = excluded.region,
                   city = excluded.city,
                   isp = excluded.isp,
                   last_seen_at = excluded.last_seen_at,
                   fetched_at = excluded.fetched_at''',
            (ip,
             info.get('country', '未知'),
             info.get('region', '未知'),
             info.get('city', '未知'),
             info.get('isp', '未知'),
             now, now),
        )
        conn.commit()
    finally:
        conn.close()


def evict_lru():
    """超过 VPN_IP_GEO_CACHE_MAX 时，按 last_seen_at ASC 删最老的条目"""
    from app import get_setting, get_db
    try:
        max_n = int(get_setting('VPN_IP_GEO_CACHE_MAX', 500))
    except Exception:
        max_n = 500
    if max_n <= 0:
        return 0
    conn = get_db()
    try:
        row = conn.execute('SELECT COUNT(*) AS cnt FROM vpn_ip_geo').fetchone()
        cnt = row['cnt'] if row else 0
        if cnt <= max_n:
            return 0
        excess = cnt - max_n
        # 删 last_seen_at 最老的 excess 条
        cur = conn.execute(
            '''DELETE FROM vpn_ip_geo WHERE ip IN (
                 SELECT ip FROM vpn_ip_geo ORDER BY last_seen_at ASC LIMIT ?
               )''',
            (excess,),
        )
        conn.commit()
        log.info(f"[ip-geo] LRU 淘汰 {cur.rowcount} 条（{cnt} → {max_n}）")
        return cur.rowcount
    finally:
        conn.close()


def lookup_for_users():
    """给 geo-sync daemon 用：扫描 vpn_users.last_ip IS NOT NULL 但 vpn_ip_geo 没记录的 IP。

    返回 [(ip, last_seen_at)] 列表。
    """
    conn = _get_db()
    try:
        rows = conn.execute(
            '''SELECT DISTINCT u.last_ip, MAX(u.last_seen_at) AS last_seen_at
               FROM vpn_users u
               WHERE u.last_ip IS NOT NULL AND u.last_ip != ''
                 AND NOT EXISTS (SELECT 1 FROM vpn_ip_geo g WHERE g.ip = u.last_ip)
               GROUP BY u.last_ip
               ORDER BY last_seen_at DESC'''
        ).fetchall()
        return [(r['last_ip'], r['last_seen_at']) for r in rows]
    finally:
        conn.close()