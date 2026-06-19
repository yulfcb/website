"""
流量同步守护线程 —— 每 60s 拉一次 xray 流量统计，累加写入 SQLite

迁移到 personal-website 后：
- 直接用 personal-website 的 get_db() 查 vpn_users / vpn_traffic_records
- 不再依赖 vpn-server 的 models.py
- xray stats 内部按 user.email（即 xray 看到的 user 标识）记录流量
  本系统用 username 作为 email 传给 xray
"""
import logging
import threading
import time

import xray_client

log = logging.getLogger("traffic-sync")

_last_cumulative = {}  # username -> (up, dn) 上次读到的累计值
_recent_active = {}    # username -> 最近一次流量增加的时间戳（用于判断"近期活跃"）

# 在线判定窗口（秒）。从 settings.VPN_ACTIVE_WINDOW_SEC 动态读，默认 60s。
# 每次取用都查一次 settings（不是缓存为常量），这样 admin 后台改值后立即生效
# —— 但要注意：app.get_setting 自己有 30s 内存缓存，所以"改完 → 立即重启服务"
# 才能保证所有路径读到新值。这是已知行为，UI 上会提示用户。
def _get_active_window_sec() -> int:
    """在线终端判定窗口（秒），默认 60。最小 10s（防误填 0）。重启服务后立刻生效。"""
    try:
        from app import get_setting
        n = int(get_setting('VPN_ACTIVE_WINDOW_SEC', 60))
        return max(10, n)
    except Exception:
        return 60

# 会话追踪：每个用户最近一次"上线"的起点。判定规则——
#   1. 首次出现（_last_cumulative 没记录）→ 记为新会话起点
#   2. _recent_active 上一次活跃距今 > 当前 active window（即"刚复活"）→ 记为新会话起点
# 这样短暂掉线再回来不会反复重置，但长时间离线后回来会重新起算
_session_start_ts = {}              # username -> 本次会话开始的 unix 时间戳
_session_start_cumulative = {}      # username -> 会话开始时的 (up, dn) 累计值（不归零）

# 同步并发控制：_sync_once() 跑的时候（守护线程 60s 一轮 + 请求线程 trigger_sync_now）
# 可能撞车，用 _sync_lock 做互斥；acquire(blocking=False) 实现"已在跑就跳过"。
# threading 已在文件顶部 import
_sync_lock = threading.Lock()

# 通过导入触发 get_db 解析（personal-website 的 app 暴露了 DATABASE_PATH）
# 留作延迟导入避免循环：traffic_sync → app → traffic_sync
def _get_db():
    from app import get_db
    return get_db()


def _list_vpn_users():
    conn = _get_db()
    try:
        rows = conn.execute(
            """SELECT u.id, u.username, u.uuid, u.enabled,
                      t.total_upload, t.total_download, t.last_sync_at
               FROM vpn_users u
               LEFT JOIN vpn_traffic_records t ON t.user_id = u.id
               WHERE u.enabled = 1
               ORDER BY u.id"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _update_traffic(user_id: int, delta_up: int, delta_dn: int):
    conn = _get_db()
    try:
        conn.execute(
            """UPDATE vpn_traffic_records
               SET total_upload = total_upload + ?,
                   total_download = total_download + ?,
                   last_sync_at = ?
               WHERE user_id = ?""",
            (delta_up, delta_dn, int(time.time()), user_id),
        )
        conn.commit()
    finally:
        conn.close()


def get_active_users():
    """返回最近 N 秒内有流量的用户列表 [(username, up, dn, last_seen)]，N 由 settings 控制"""
    now = time.time()
    window = _get_active_window_sec()
    result = []
    for username, ts in list(_recent_active.items()):
        if now - ts > window:
            _recent_active.pop(username, None)
            continue
        up, dn = _last_cumulative.get(username, (0, 0))
        result.append((username, up, dn, int(ts)))
    return result


def get_active_sessions():
    """返回当前活跃会话的详情列表，每个会话包含：
        username, uuid, session_start_ts, session_up, session_dn,
        total_up, total_dn, last_seen

    "活跃"指 _recent_active 距今 ≤ 当前 active window（动态读 settings）。
    设备列（OS / 客户端类型）xray 不暴露（VLESS 协议不传 User-Agent），
    此处暂不返回，前端用 '—' 占位。
    """
    now = time.time()
    window = _get_active_window_sec()
    result = []
    for username, ts in list(_recent_active.items()):
        if now - ts > window:
            _recent_active.pop(username, None)
            continue
        sess_start = _session_start_ts.get(username, ts)
        sess_start_cum = _session_start_cumulative.get(username, (0, 0))
        curr_cum = _last_cumulative.get(username, (0, 0))
        sess_up = max(0, curr_cum[0] - sess_start_cum[0])
        sess_dn = max(0, curr_cum[1] - sess_start_cum[1])
        summary = _get_user_summary(username)
        if not summary:
            continue
        result.append({
            'username': username,
            'uuid': summary['uuid'],
            'session_start': sess_start,
            'session_up': sess_up,
            'session_dn': sess_dn,
            'total_up': summary['total_up'] or 0,
            'total_dn': summary['total_dn'] or 0,
            'last_seen': int(ts),
        })
    return result


def _get_user_summary(username):
    """查询 vpn_users + vpn_traffic_records 一次 JOIN，返回 (uuid, total_up, total_dn)"""
    conn = _get_db()
    try:
        row = conn.execute(
            """SELECT u.uuid, t.total_upload, t.total_download
               FROM vpn_users u
               LEFT JOIN vpn_traffic_records t ON t.user_id = u.id
               WHERE u.username = ?""",
            (username,),
        ).fetchone()
        if row is None:
            return None
        return {
            'uuid': row['uuid'],
            'total_up': row['total_upload'] or 0,
            'total_dn': row['total_download'] or 0,
        }
    finally:
        conn.close()


def get_inbound_total():
    """获取整个 inbound 的累计流量（调用 xray API）"""
    return xray_client.query_inbound_total()


def _sync_once():
    global _last_cumulative
    users = _list_vpn_users()
    # 记录本轮开始时的"活跃集合"——本轮结束后如果某个用户从这个集合里掉出来，
    # 说明 ta 没有再产生流量，即"会话刚结束"，需要归档到 vpn_session_history。
    active_before = set(_recent_active.keys())
    for u in users:
        if not u["enabled"]:
            continue
        try:
            up, dn = xray_client.query_user_traffic_by_email(u["username"])
        except Exception as e:
            log.warning(f"[traffic-sync] 拉取用户 {u['username']} 流量失败: {e}")
            continue

        username = u["username"]
        if up == 0 and dn == 0:
            # 用户本轮流量为 0（通常是因为已下线/超过 active window）：
            # 从 _recent_active 移除，让本轮结尾的归档分支能感知到 ta "刚结束"。
            # 上一版这里直接 continue，导致 _recent_active 永远留着这个用户，
            # 归档分支的 `if username in _recent_active: continue` 永远命中，
            # 离线的历史会话就再也写不进 vpn_session_history。
            if username in _recent_active:
                log.info(
                    f"[traffic-sync] {username} 本轮无流量，从活跃集合移除（准备归档）"
                )
                _recent_active.pop(username, None)
            continue

        prev = _last_cumulative.get(username)
        prev_ts = _recent_active.get(username)

        # 新会话判定：
        # 1) 首次见到（prev 为 None）；
        # 2) 上次活跃距今 > 当前 active window（即用户离线过，再次复活）。
        # 满足任一即视为新会话起点。
        is_new_session = False
        if prev is None:
            is_new_session = True
        elif prev_ts is not None and (time.time() - prev_ts) > _get_active_window_sec():
            is_new_session = True

        # xray 重启会让 stats 归零，prev 可能 > current，此时按 current 处理（=0 delta）
        delta_up = max(0, up - (prev[0] if prev else 0))
        delta_dn = max(0, dn - (prev[1] if prev else 0))

        if delta_up > 0 or delta_dn > 0:
            try:
                _update_traffic(u["id"], delta_up, delta_dn)
                _recent_active[username] = time.time()  # 标记活跃
                log.info(f"[traffic-sync] {username} +↑{delta_up}/+↓{delta_dn}")
            except Exception as e:
                log.error(f"[traffic-sync] 写库失败: {e}")

        # 更新会话起点（无论本轮是否有 delta，都要更新累计值，
        # 否则下一次比较会拿到陈旧的 prev）
        if is_new_session:
            _session_start_ts[username] = time.time()
            _session_start_cumulative[username] = (up, dn)
            log.info(f"[traffic-sync] {username} 新会话开始（{_session_start_ts[username]:.0f}）")

        _last_cumulative[username] = (up, dn)

    # 归档：本轮结束后仍未在 _recent_active 里的用户 → 视为"会话刚结束"
    # （覆盖：被禁用、流量为 0、用户被删除等所有"不再活跃"的路径）
    now = time.time()
    for username in active_before:
        if username in _recent_active:
            continue
        _archive_session(username, ended_at=now)
        # 从"曾经活跃"集合里清掉，避免重复归档（虽然下次 _sync_once 还会重做）
        _session_start_ts.pop(username, None)
        _session_start_cumulative.pop(username, None)


def trigger_sync_now() -> bool:
    """在请求线程里立即触发一次 _sync_once()，不等下一个 daemon 周期（60s）。
    用于"访问 /vpn/connections 或 /vpn/sessions 时主动同步"。

    用 _sync_lock 做互斥：acquire(blocking=False) → 已有同步在跑就跳过。
    返回 True 表示真的跑了，False 表示被跳过。
    注意：调用方在请求线程里跑，xray API 调用 + sqlite 写库一般 1-2s，
    不会长时间阻塞（除非 xray 卡住）。如果担心超时可以让前端在后台异步触发，
    但当前实现选择"同步执行以保证数据立即一致"。
    """
    if not _sync_lock.acquire(blocking=False):
        log.debug("[traffic-sync] trigger_sync_now skipped: sync already running")
        return False
    try:
        _sync_once()
        return True
    except Exception as e:
        log.warning(f"[traffic-sync] trigger_sync_now failed: {e}")
        return False
    finally:
        _sync_lock.release()


def _archive_session(username: str, ended_at: float):
    """把刚结束的会话归档到 vpn_session_history。

    只在 _sync_once 里调用：判定用户上一轮还在 _recent_active、本轮消失了。
    写入字段：user_id / username / uuid / started_at / ended_at / duration_sec /
              session_up / session_dn / last_ip / last_seen_at（device 暂时 NULL）。
    写完后调用 evict_session_history_lru() 触发上限清理。

    VPN_SESSION_HISTORY_MAX <= 0 表示归档功能完全停用：直接 return，不写新记录
    （清表动作交给 evict_session_history_lru 处理）。
    """
    # 上限 <= 0 → 完全停用归档
    try:
        from app import get_setting
        max_n = int(get_setting('VPN_SESSION_HISTORY_MAX', 5000))
    except Exception:
        max_n = 5000
    if max_n <= 0:
        return

    started_at = _session_start_ts.get(username)
    sess_start_cum = _session_start_cumulative.get(username)
    summary = _get_user_summary(username)
    if not summary:
        return
    # 起始时间缺失（用户从未真正"开始"过会话，比如首次拉流量就是 0）→ 跳过
    if started_at is None or sess_start_cum is None:
        return

    curr_cum = _last_cumulative.get(username, sess_start_cum)
    sess_up = max(0, int(curr_cum[0]) - int(sess_start_cum[0]))
    sess_dn = max(0, int(curr_cum[1]) - int(sess_start_cum[1]))
    duration_sec = max(0, int(ended_at) - int(started_at))

    # last_ip + last_seen_at 来自 vpn_users（access log tailer 写入）
    conn = _get_db()
    try:
        row = conn.execute(
            'SELECT id, last_ip, last_seen_at FROM vpn_users WHERE username=?',
            (username,),
        ).fetchone()
        if not row:
            return
        user_id = row['id']
        last_ip = row['last_ip']
        last_seen_at = row['last_seen_at']
    finally:
        conn.close()

    conn = _get_db()
    try:
        conn.execute(
            '''INSERT INTO vpn_session_history
                 (user_id, username, uuid, started_at, ended_at, duration_sec,
                  session_up, session_dn, last_ip, last_seen_at, device)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)''',
            (user_id, username, summary['uuid'],
             int(started_at), int(ended_at), duration_sec,
             sess_up, sess_dn, last_ip, last_seen_at),
        )
        conn.commit()
        log.info(
            f"[traffic-sync] 归档会话: {username} "
            f"{duration_sec}s ↑{sess_up}/↓{sess_dn} ip={last_ip}"
        )
    except Exception as e:
        log.error(f"[traffic-sync] 归档会话失败 {username}: {e}")
    finally:
        conn.close()
    # 触发 LRU 清理
    try:
        evict_session_history_lru()
    except Exception as e:
        log.warning(f"[traffic-sync] history LRU 清理失败: {e}")


def evict_session_history_lru():
    """vpn_session_history 上限管理。

    - VPN_SESSION_HISTORY_MAX <= 0：完全停用归档 → 清空整张表。
    - MAX > 0：超过上限时按 ended_at ASC 删最老记录。
    返回被删除的行数。
    """
    try:
        from app import get_setting, get_db
        max_n = int(get_setting('VPN_SESSION_HISTORY_MAX', 5000))
    except Exception:
        max_n = 5000
    conn = get_db()
    try:
        if max_n <= 0:
            # 完全停用归档：清空现有表
            cur = conn.execute('DELETE FROM vpn_session_history')
            conn.commit()
            log.info(
                f"[traffic-sync] VPN_SESSION_HISTORY_MAX<=0，已清空 vpn_session_history "
                f"({cur.rowcount} 条)"
            )
            return cur.rowcount
        row = conn.execute('SELECT COUNT(*) AS cnt FROM vpn_session_history').fetchone()
        cnt = row['cnt'] if row else 0
        if cnt <= max_n:
            return 0
        excess = cnt - max_n
        cur = conn.execute(
            '''DELETE FROM vpn_session_history WHERE id IN (
                 SELECT id FROM vpn_session_history ORDER BY ended_at ASC LIMIT ?
               )''',
            (excess,),
        )
        conn.commit()
        log.info(f"[traffic-sync] session history LRU 淘汰 {cur.rowcount} 条（{cnt} → {max_n}）")
        return cur.rowcount
    finally:
        conn.close()


# ===== 启动时同步 =====
# vpn-xray 容器一旦重启，xray 内存里所有动态加的 user 全部丢失。
# 这里在 daemon 启动时把 vpn_users 表里的 enabled=1 用户重新推到 xray，
# 同时把 enabled=0 但还在 xray 里的用户清掉（防绕过封禁）。
_STARTUP_SYNC_INTERVAL = 5   # 秒
_STARTUP_SYNC_MAX_WAIT = 60  # 秒


def _all_vpn_users():
    """不分 enabled 状态列出所有 vpn 用户（含 disabled），用于启动时反向同步"""
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT id, username, uuid, enabled, last_xray_sync_at "
            "FROM vpn_users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _mark_xray_synced(user_ids):
    """把指定 user 的 last_xray_sync_at 设为当前时间"""
    if not user_ids:
        return
    conn = _get_db()
    try:
        now = int(time.time())
        conn.executemany(
            "UPDATE vpn_users SET last_xray_sync_at = ? WHERE id = ?",
            [(now, uid) for uid in user_ids],
        )
        conn.commit()
    except Exception as e:
        log.error(f"[xray-startup-sync] 写 last_xray_sync_at 失败: {e}")
    finally:
        conn.close()


def _do_sync_users_to_xray(already_synced):
    """执行一次完整的 user 同步（不带重试）。跳过 already_synced 中的 email（防 xray 报"重复用户"）。
    返回 (added_count, removed_count, failed_emails)。
    """
    users = _all_vpn_users()
    added_ids = []
    removed = 0
    failed = []
    for u in users:
        if u["enabled"]:
            if u["username"] in already_synced:
                # 本次启动同步里之前已经成功，跳过避免 xray "user already exists" 报错
                continue
            try:
                if xray_client.add_user(u["uuid"], u["username"]):
                    added_ids.append(u["id"])
                    already_synced.add(u["username"])
                else:
                    failed.append(u["username"])
            except Exception as e:
                log.error(f"[xray-startup-sync] add_user {u['username']} 异常: {e}")
                failed.append(u["username"])
        else:
            # 反向同步：enabled=0 但 xray 里可能还有残留
            try:
                if xray_client.remove_user(u["username"]):
                    removed += 1
                    log.info(f"[xray-startup-sync] 已清理 disabled 用户 {u['username']}")
            except Exception as e:
                log.warning(f"[xray-startup-sync] remove_user {u['username']} 异常: {e}")
    _mark_xray_synced(added_ids)
    return len(added_ids), removed, failed


def _sync_users_to_xray():
    """启动时把 vpn_users 表同步到 xray。带重试：每 5s 试一次，最多等 60s。
    失败不抛异常，daemon 继续往下跑（流量同步会按 60s 间隔继续）。
    """
    log.info("[xray-startup-sync] 开始 vpn-users → xray 同步")
    deadline = time.time() + _STARTUP_SYNC_MAX_WAIT
    attempt = 0
    # 本次启动同步里已成功推过的 email，重试时跳过，避免 xray 报 "user already exists"
    already_synced = set()
    while True:
        attempt += 1
        try:
            added, removed, failed = _do_sync_users_to_xray(already_synced)
        except Exception as e:
            log.error(f"[xray-startup-sync] 第 {attempt} 次尝试异常: {e}")
            added = removed = 0
            failed = ["__exception__"]

        # 至少一次成功的依据：test_connection 通过 + add/remove 全成功
        if not failed:
            log.info(
                f"[xray-startup-sync] 完成：新增/确认 {added} 个 enabled 用户，"
                f"清理 {removed} 个 disabled 用户"
            )
            return True

        if time.time() >= deadline:
            log.error(
                f"[xray-startup-sync] 超过 {_STARTUP_SYNC_MAX_WAIT}s 仍失败 "
                f"（第 {attempt} 次），放弃同步。失败用户: {failed}"
            )
            return False

        log.warning(
            f"[xray-startup-sync] 第 {attempt} 次未完全成功（失败 {len(failed)} 个），"
            f"{_STARTUP_SYNC_INTERVAL}s 后重试"
        )
        time.sleep(_STARTUP_SYNC_INTERVAL)


def _run_loop(interval: int):
    log.info(f"[traffic-sync] 启动，间隔 {interval}s")
    # 启动后等 5 秒让 xray 准备好
    time.sleep(5)
    # 第一次 _sync_once 之前先做一次 user 同步：xray 容器重启后内存用户清空，
    # 把 vpn_users 表里 enabled=1 的用户重新推回去，同时清掉 enabled=0 的残留
    _sync_users_to_xray()
    while True:
        try:
            # 守护线程也用 _sync_lock 包住 _sync_once：
            # 如果请求线程的 trigger_sync_now 正在跑（一般 1-2s），daemon 阻塞等一下，
            # 避免两边同时查 xray + 写 sqlite。阻塞时间可控。
            with _sync_lock:
                _sync_once()
        except Exception as e:
            log.error(f"[traffic-sync] 同步出错: {e}")
        time.sleep(interval)


# ===== Geo 同步守护线程 =====
# access log tailer 写入 vpn_users.last_ip 后，这里定期把 last_ip 没位置的 IP
# 用 ip-api.com 查出来写到 vpn_ip_geo。LRU 上限由 settings VPN_IP_GEO_CACHE_MAX 控制。

def _run_geo_sync(interval: int):
    import ip_geo
    log.info(f"[geo-sync] 启动，间隔 {interval}s")
    while True:
        try:
            targets = ip_geo.lookup_for_users()
            if targets:
                log.info(f"[geo-sync] 待补全 IP: {len(targets)} 个")
                for ip, _last_seen in targets:
                    info = ip_geo.get_geo(ip, refresh=False)
                    if info:
                        ip_geo.upsert_geo(ip, info)
                        log.info(f"[geo-sync] {ip} → {info['country']}/{info['city']}")
            ip_geo.evict_lru()
        except Exception as e:
            log.error(f"[geo-sync] 出错: {e}")
        time.sleep(interval)


def _run_access_tail(interval: int):
    """启动 access log tailer（来自 xray_access_tail 模块）"""
    import xray_access_tail
    xray_access_tail.start_daemon(interval=interval)


def start(interval: int = 60):
    """启动后台线程（应用启动时调用）"""
    t = threading.Thread(target=_run_loop, args=(interval,), daemon=True, name="traffic-sync")
    t.start()
    # geo-sync daemon：间隔从 settings 读，默认 60s
    try:
        from app import get_setting
        geo_interval = int(get_setting('VPN_GEO_SYNC_INTERVAL', 60))
    except Exception:
        geo_interval = 60
    g = threading.Thread(target=_run_geo_sync, args=(geo_interval,), daemon=True, name="geo-sync")
    g.start()
    # access log tailer：间隔从 settings 读，默认 2s
    try:
        from app import get_setting
        tail_interval = int(get_setting('VPN_ACCESS_TAIL_INTERVAL', 2))
    except Exception:
        tail_interval = 2
    a = threading.Thread(target=_run_access_tail, args=(tail_interval,), daemon=True, name="access-tail")
    a.start()
    return t
