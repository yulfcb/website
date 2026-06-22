"""
流量同步守护线程 —— 每 60s 拉一次 xray 流量统计，累加写入 SQLite

多 worker 共享状态：
- 原本的 4 个内存 dict 沉到 vpn_session_state 表，所有 gunicorn worker 看到同一份
  "在线 / 会话起点" 状态（修复多 worker 各自判定新会话 / 归档不到的问题）
- get_db() 已开 WAL + busy_timeout，多 worker 写并发安全

xray stats 内部按 user.email（即 xray 看到的 user 标识）记录流量
本系统用 username 作为 email 传给 xray
"""
import logging
import threading
import time

import xray_client

log = logging.getLogger("traffic-sync")

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

# 同步并发控制：_sync_once() 跑的时候（守护线程 60s 一轮 + 请求线程 trigger_sync_now）
# 可能撞车，用 _sync_lock 做互斥；acquire(blocking=False) 实现"已在跑就跳过"。
# threading 已在文件顶部 import
_sync_lock = threading.Lock()

# 通过导入触发 get_db 解析（personal-website 的 app 暴露了 DATABASE_PATH）
# 留作延迟导入避免循环：traffic_sync → app → traffic_sync
def _get_db():
    from app import get_db
    return get_db()


# ===== vpn_session_state 表读写 =====
# 该表是 gunicorn 多 worker 共享的"在线 + 会话起点"真相源。
# 一行 = 一个用户：last_cum_* 是上次读到的 xray 累计值；last_seen_at 是最近活跃时间；
# session_start_at / session_start_cum_* 是当前活跃会话的起点（NULL = 不在会话中）。
# 注意：_sync_once 不会预创建空行——只有"之前有过流量"或"本轮有流量"才写。

def _load_state(username: str):
    """读一行 state，没有返回 None。"""
    conn = _get_db()
    try:
        row = conn.execute(
            'SELECT last_cum_up, last_cum_dn, last_seen_at, '
            'session_start_at, session_start_cum_up, session_start_cum_dn, '
            'idle_rounds '
            'FROM vpn_session_state WHERE username=?', (username,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _upsert_state(username, *, last_cum_up, last_cum_dn,
                  last_seen_at=None, session_start_at=None,
                  session_start_cum_up=None, session_start_cum_dn=None,
                  idle_rounds=0):
    """INSERT OR REPLACE，state 表只有 username 是 key。所有列都写一遍便于全量替换。

    idle_rounds：连续无流量轮数（仅在 has_traffic 写时传 0）。
    上一轮无流量 → idle_rounds 累加的分支走 _update_state_partial，不进这里。
    """
    conn = _get_db()
    try:
        conn.execute('''
            INSERT INTO vpn_session_state
              (username, last_cum_up, last_cum_dn, last_seen_at,
               session_start_at, session_start_cum_up, session_start_cum_dn,
               idle_rounds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
              last_cum_up=excluded.last_cum_up,
              last_cum_dn=excluded.last_cum_dn,
              last_seen_at=excluded.last_seen_at,
              session_start_at=excluded.session_start_at,
              session_start_cum_up=excluded.session_start_cum_up,
              session_start_cum_dn=excluded.session_start_cum_dn,
              idle_rounds=excluded.idle_rounds
        ''', (username, last_cum_up, last_cum_dn, last_seen_at,
              session_start_at, session_start_cum_up, session_start_cum_dn,
              idle_rounds))
        conn.commit()
    finally:
        conn.close()


def _update_state_partial(username: str, **fields):
    """只更新指定字段（last_seen_at / session_start_at 等），保留其他字段。
    fields 里出现的 key 才写。"""
    if not fields:
        return
    cols = ', '.join(f'{k}=?' for k in fields)
    vals = list(fields.values()) + [username]
    conn = _get_db()
    try:
        conn.execute(
            f'UPDATE vpn_session_state SET {cols} WHERE username=?', vals
        )
        conn.commit()
    finally:
        conn.close()


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
    """返回当前在线用户列表（username 列表）。

    数据来源：vpn_session_state 表的 last_seen_at（NULL 或 > active window 算离线）。
    之前是 list[(username, up, dn, last_seen)]，但当前唯一调用方 (app.py:1920) 只用
    len(active)，改成 list[str] 即可。
    """
    now = time.time()
    window = _get_active_window_sec()
    conn = _get_db()
    try:
        rows = conn.execute(
            'SELECT username FROM vpn_session_state '
            'WHERE last_seen_at IS NOT NULL AND last_seen_at > ?',
            (now - window,)
        ).fetchall()
        return [r['username'] for r in rows]
    finally:
        conn.close()


def get_active_sessions():
    """返回当前活跃会话的详情列表，每个会话包含：
        username, uuid, session_start, session_up, session_dn,
        total_up, total_dn, last_seen

    "活跃"指 last_seen_at 距今 ≤ 当前 active window（动态读 settings）。
    设备列（OS / 客户端类型）xray 不暴露（VLESS 协议不传 User-Agent），
    此处暂不返回，前端用 '—' 占位。
    """
    now = time.time()
    window = _get_active_window_sec()
    conn = _get_db()
    try:
        rows = conn.execute(
            'SELECT username, last_cum_up, last_cum_dn, last_seen_at, '
            'session_start_at, session_start_cum_up, session_start_cum_dn '
            'FROM vpn_session_state '
            'WHERE last_seen_at IS NOT NULL AND last_seen_at > ?',
            (now - window,)
        ).fetchall()
    finally:
        conn.close()

    result = []
    for r in rows:
        sess_start = r['session_start_at'] or r['last_seen_at']
        sess_start_cum_up = r['session_start_cum_up'] or 0
        sess_start_cum_dn = r['session_start_cum_dn'] or 0
        curr_up = r['last_cum_up']
        curr_dn = r['last_cum_dn']
        sess_up = max(0, curr_up - sess_start_cum_up)
        sess_dn = max(0, curr_dn - sess_start_cum_dn)
        summary = _get_user_summary(r['username'])
        if not summary:
            continue
        result.append({
            'username': r['username'],
            'uuid': summary['uuid'],
            'session_start': sess_start,
            'session_up': sess_up,
            'session_dn': sess_dn,
            'total_up': summary['total_up'] or 0,
            'total_dn': summary['total_dn'] or 0,
            'last_seen': int(r['last_seen_at']),
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

    只在 _sync_once 里调用：判定用户上一轮还在活跃集合、本轮消失了。
    写入字段：user_id / username / uuid / started_at / ended_at / duration_sec /
              session_up / session_dn / last_ip / last_seen_at（device 暂时 NULL）。
    写完后调用 evict_session_history_lru() 触发上限清理。

    VPN_SESSION_HISTORY_MAX <= 0 表示归档功能完全停用：直接 return，不写新记录
    （清表动作交给 evict_session_history_lru 处理）。

    数据来源：vpn_session_state（多 worker 共享），不再读内存 dict。
    """
    # 上限 <= 0 → 完全停用归档
    try:
        from app import get_setting
        max_n = int(get_setting('VPN_SESSION_HISTORY_MAX', 5000))
    except Exception:
        max_n = 5000
    if max_n <= 0:
        return

    state = _load_state(username)
    if not state:
        return
    started_at = state['session_start_at']
    sess_start_cum_up = state['session_start_cum_up']
    sess_start_cum_dn = state['session_start_cum_dn']
    if started_at is None or sess_start_cum_up is None or sess_start_cum_dn is None:
        # 从未真正"开始"过会话（比如首次拉流量就是 0，或 state 行被外部污染）
        return

    summary = _get_user_summary(username)
    if not summary:
        return

    curr_up = state['last_cum_up']
    curr_dn = state['last_cum_dn']
    sess_up = max(0, int(curr_up) - int(sess_start_cum_up))
    sess_dn = max(0, int(curr_dn) - int(sess_start_cum_dn))
    duration_sec = max(0, int(ended_at) - int(started_at))

    # last_ip + last_seen_at 来自 vpn_users（access log tailer 写入）
    import sqlite3
    conn = _get_db()
    try:
        row = conn.execute(
            'SELECT id, last_ip, last_seen_at FROM vpn_users WHERE username=?',
            (username,)
        ).fetchone()
        if not row:
            return
        try:
            conn.execute(
                '''INSERT INTO vpn_session_history
                     (user_id, username, uuid, started_at, ended_at, duration_sec,
                      session_up, session_dn, last_ip, last_seen_at, device)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)''',
                (row['id'], username, summary['uuid'],
                 int(started_at), int(ended_at), duration_sec,
                 sess_up, sess_dn, row['last_ip'], row['last_seen_at']),
            )
            conn.commit()
            log.info(
                f"[traffic-sync] 归档会话: {username} "
                f"{duration_sec}s ↑{sess_up}/↓{sess_dn} ip={row['last_ip']}"
            )
        except sqlite3.IntegrityError as e:
            # 唯一索引 (username, started_at, ended_at) 撞了 → 多 worker 重复归档。
            # 这是预期行为（兜底，不是错误），debug 级别即可。
            log.debug(
                f"[traffic-sync] 归档 {username} 已被另一 worker 写入，跳过: {e}"
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


def _sync_once():
    """核心同步循环。

    边界判定（修复接入时间跳变 + 归档不触发）：
    - 离线判定：连续 idle_rounds >= OFFLINE_IDLE_ROUNDS（默认 2 = 120s）才算离线。
    - 新会话判定：本轮有流量 + (idle_rounds>=1 或 session_start_at is None) → 起新会话。
    - 在线中：本轮有流量 + 上一轮有流量（idle_rounds=0 + session_start_at 存在）→ 续约旧会话。

    xray 的累计值只在重启时归零，所以客户端下线后 up/dn 不会自己变 0，
    不能用"up==0 and dn==0"判定离线。改用 idle_rounds：连续 N 轮没新增流量就算离线。
    """
    users = _list_vpn_users()
    active_window = _get_active_window_sec()
    now = time.time()
    OFFLINE_IDLE_ROUNDS = 2  # 连续 2 轮（默认 2*60s=120s）无流量 = 离线

    for u in users:
        if not u["enabled"]:
            continue
        try:
            up, dn = xray_client.query_user_traffic_by_email(u["username"])
        except Exception as e:
            log.warning(f"[traffic-sync] 拉取用户 {u['username']} 流量失败: {e}")
            continue

        username = u["username"]
        state = _load_state(username)
        prev_cum_up = state['last_cum_up'] if state else 0
        prev_cum_dn = state['last_cum_dn'] if state else 0
        prev_sess_start = state['session_start_at'] if state else None
        prev_sess_cum_up = state['session_start_cum_up'] if state else None
        prev_sess_cum_dn = state['session_start_cum_dn'] if state else None
        prev_idle_rounds = state['idle_rounds'] if state else 0

        # 防御 xray 重启归零：用 max(0, ...) 兜底
        delta_up = max(0, up - prev_cum_up)
        delta_dn = max(0, dn - prev_cum_dn)
        has_traffic_this_round = (delta_up > 0 or delta_dn > 0)

        if not has_traffic_this_round:
            # 本轮无流量：仅 state 行已存在时累加 idle_rounds（从没建过 state 的用户跳过）。
            if not state:
                continue
            new_idle = prev_idle_rounds + 1
            _update_state_partial(username, idle_rounds=new_idle)
            # 连续 idle >= 阈值且之前确实有会话 → 触发归档
            if new_idle >= OFFLINE_IDLE_ROUNDS and prev_sess_start is not None:
                _archive_session(username, ended_at=now)
                # 清掉 session 起点（保留 last_cum_* 给下次"复活"判断）
                _update_state_partial(
                    username,
                    last_seen_at=None,
                    session_start_at=None,
                    session_start_cum_up=None,
                    session_start_cum_dn=None,
                )
            continue

        # 本轮有流量：累加 delta 到 traffic 表
        try:
            _update_traffic(u["id"], delta_up, delta_dn)
            if delta_up or delta_dn:
                log.info(f"[traffic-sync] {username} +↑{delta_up}/+↓{delta_dn}")
        except Exception as e:
            log.error(f"[traffic-sync] 写库失败: {e}")
            # 仍写 state：避免反复触发新会话判定 / 丢失会话起点

        # 新会话判定：idle 复活 或 从未起过会话
        is_new_session = (prev_idle_rounds >= 1) or (prev_sess_start is None)
        if is_new_session:
            new_sess_start = int(now)
            new_sess_cum_up = up
            new_sess_cum_dn = dn
            log.info(
                f"[traffic-sync] {username} 新会话开始（{new_sess_start}）"
            )
        else:
            new_sess_start = prev_sess_start
            new_sess_cum_up = prev_sess_cum_up
            new_sess_cum_dn = prev_sess_cum_dn

        # 写 state：last_cum_* 更新，idle_rounds 归 0，last_seen_at = now
        _upsert_state(
            username,
            last_cum_up=up,
            last_cum_dn=dn,
            last_seen_at=int(now),
            session_start_at=new_sess_start,
            session_start_cum_up=new_sess_cum_up,
            session_start_cum_dn=new_sess_cum_dn,
            idle_rounds=0,
        )


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
