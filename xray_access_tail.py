"""
xray access log tailer
======================
读 /root/yulei/code/vpn-server/xray/logs/access.log，
逐行解析出 (email, source_ip) 写入 vpn_users.last_ip / last_seen_at。

xray access log 行格式（来源：xray-core/common/log/access.go AccessMessage.String()）：

    2026/06/18 23:50:00.123456 from <ip>:<port> accepted <proto>:<dest> [<in_tag> -> <out_tag>] email: <email>

注：
- `<ip>:<port>` 是 VLESS 客户端的源 IP:端口（NAT 后）
- `email:` 段只在 VLESS inbound（我们配置里叫 vless-in）才会出现；
  gRPC API inbound（api tag，dokodemo-door）没有 email
- timestamp 是 `[YYYY/MM/DD HH:MM:SS.microseconds]`，accessLevel=Info 时
  VLESS 已 accepted 才会写 log

守护线程策略：
- 轮询 + 偏移量记忆（inotify 在 bind mount 上不稳定，故采用 2s 轮询）
- 文件 truncate / rotate 后从头读（last_pos 自动回到 0）
- 文件不存在 / 读失败时 sleep 5s 重试（xray 还没启动 / docker 重启中）
- 单行解析失败直接跳过，不抛异常（不污染 daemon）

防御：
- 任何 IO 异常都吞掉，仅 log.error
- 写库用独立的短连接，避免和主线程争 conn
"""
from __future__ import annotations

import logging
import re
import threading
import time
from pathlib import Path

log = logging.getLogger("access-tail")

# 关键正则：必须能从一行里同时抽出 (source_ip, email)
# 匹配示例：
#   "2026/06/18 23:50:00.123456 from 1.2.3.4:54321 accepted tcp:google.com:443 [vless-in -> direct] email: yulei"
# 兼容 ipv4 + port；email 段是 xray 写死的 "email: <str>" 后面到行尾
# 末尾的 \S+ 可能含空格（如 display name），但 xray 实际写的是 username 无空格
_LINE_RE = re.compile(
    r'^(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+'  # 1: 时间戳
    r'from\s+(\d+\.\d+\.\d+\.\d+):\d+\s+'                      # 2: source IP
    r'(?:accepted|rejected)\s+'                                # status 段（accepted/rejected 都记）
    r'\S+\s+'                                                  # <proto>:<dest>
    r'\[[^\]]+\]'                                              # [<in_tag> -> <out_tag>]
    r'(?:\s+\S+)*?'                                            # 可选 reason
    r'\s+email:\s*(\S+)\s*$',                                  # 3: email
)


def _get_db():
    from app import get_db
    return get_db()


def _get_log_path() -> Path:
    from app import get_setting
    p = get_setting('VPN_ACCESS_LOG_PATH',
                    '/root/yulei/code/vpn-server/xray/logs/access.log')
    return Path(p)


def _update_user_last_ip(email: str, ip: str, ts: int) -> bool:
    """写 vpn_users.last_ip / last_seen_at；email 不存在时返回 False（被删/未同步）"""
    conn = _get_db()
    try:
        cur = conn.execute(
            'UPDATE vpn_users SET last_ip=?, last_seen_at=? WHERE username=?',
            (ip, ts, email),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def _parse_line(line: str):
    """返回 (ip, email, ts_unix) 或 None。解析失败的行返回 None（不抛异常）"""
    line = line.rstrip('\n').rstrip('\r')
    if not line:
        return None
    m = _LINE_RE.match(line)
    if not m:
        return None
    ts_str, ip, email = m.group(1), m.group(2), m.group(3)
    # 把 "2026/06/18 23:50:00[.123456]" 转 unix 时间戳（用本地时区，与 xray 容器的 TZ 对齐）
    try:
        ts = int(time.mktime(time.strptime(ts_str.split('.')[0], '%Y/%m/%d %H:%M:%S')))
    except ValueError:
        ts = int(time.time())
    return ip, email, ts


def _tail_loop(interval: int, stop_evt: threading.Event):
    log_path = _get_log_path()
    log.info(f"[access-tail] 启动，日志路径={log_path}, 间隔={interval}s")
    last_pos = 0
    last_inode = None
    while not stop_evt.is_set():
        try:
            if not log_path.exists():
                time.sleep(5)
                continue
            # 检测 rotate / truncate：用 inode
            try:
                st = log_path.stat()
            except OSError:
                time.sleep(5)
                continue
            if last_inode is not None and st.st_ino != last_inode:
                log.info("[access-tail] 检测到日志 rotate/truncate，从头读")
                last_pos = 0
            last_inode = st.st_ino
            if st.st_size < last_pos:
                # 文件被截断（truncate -s 0 等）
                log.info("[access-tail] 文件变小（truncate），重置位置")
                last_pos = 0

            with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
                f.seek(last_pos)
                lines = f.readlines()
                last_pos = f.tell()

            for line in lines:
                parsed = _parse_line(line)
                if not parsed:
                    continue
                ip, email, ts = parsed
                # 只更新到 _recent_active 近期活跃的用户对应的 vpn_users
                # 注意：这里写 vpn_users 表而不是只内存，
                # 是为了 geo-sync daemon 能扫到 last_ip
                if _update_user_last_ip(email, ip, ts):
                    log.debug(f"[access-tail] {email} → {ip}")
                # else: 收到陌生 email（罕见，可能是 docker 网络内部残留），跳过
        except Exception as e:
            log.error(f"[access-tail] 循环异常: {e}")
        # 用 stop_evt.wait 替代 sleep，可以被干净关停
        if stop_evt.wait(interval):
            break
    log.info("[access-tail] 已停止")


_stop_evt: threading.Event | None = None
_thread: threading.Thread | None = None


def start_daemon(interval: int = 2):
    """启动 access log tailer 守护线程（幂等）"""
    global _stop_evt, _thread
    if _thread and _thread.is_alive():
        return _thread
    _stop_evt = threading.Event()
    _thread = threading.Thread(
        target=_tail_loop,
        args=(interval, _stop_evt),
        daemon=True,
        name='access-tail',
    )
    _thread.start()
    return _thread


def stop_daemon(timeout: float = 5):
    """干净停止（一般 daemon 进程退出时不需要显式调）"""
    global _stop_evt, _thread
    if _stop_evt:
        _stop_evt.set()
    if _thread:
        _thread.join(timeout=timeout)
        _thread = None
        _stop_evt = None