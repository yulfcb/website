"""
一次性数据迁移脚本：从 vpn-server/data/vpn.db 读取 users / traffic_records /
login_logs，写入 personal-website 的 SQLite 数据库。

要求：
- vpn_users.id 保留与原 vpn.db 相同的 id（避免 xray email 关联错乱）
- 字段映射写在每段注释里

用法：
    cd /root/yulei/code/personal-website
    venv/bin/python3 scripts/migrate_vpn_data.py
"""
import os
import sqlite3
import sys

# 默认路径
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DB = os.environ.get("VPN_SRC_DB", "/root/yulei/code/vpn-server/data/vpn.db")
DST_DB = os.environ.get("DST_DB", os.path.join(PROJECT_ROOT, "data", "visitors.db"))


def now_ts() -> int:
    import time
    return int(time.time())


def migrate_users(src, dst):
    """users → vpn_users（保留 id，password_hash 直接复制）"""
    rows = src.execute("SELECT * FROM users").fetchall()
    inserted = 0
    for r in rows:
        try:
            dst.execute(
                """INSERT OR IGNORE INTO vpn_users
                       (id, username, password_hash, uuid, is_admin, enabled,
                        traffic_limit_bytes, speed_limit_bps, remark, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    r["id"],
                    r["username"],
                    r["password_hash"],
                    r["uuid"],
                    r["is_admin"],
                    r["enabled"],
                    r["traffic_limit_bytes"],
                    r["speed_limit_bps"],
                    r["remark"],
                    r["created_at"],
                ),
            )
            inserted += 1
        except sqlite3.IntegrityError as e:
            print(f"  [WARN] user {r['username']} (id={r['id']}): {e}", file=sys.stderr)
    # 同步 sqlite_sequence，保证后续 AUTOINCREMENT 不冲突
    max_id = src.execute("SELECT COALESCE(MAX(id), 0) FROM users").fetchone()[0]
    dst.execute(
        "INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES ('vpn_users', ?)",
        (max_id,),
    )
    return inserted


def migrate_traffic(src, dst):
    """traffic_records → vpn_traffic_records"""
    rows = src.execute("SELECT * FROM traffic_records").fetchall()
    inserted = 0
    for r in rows:
        try:
            dst.execute(
                """INSERT OR REPLACE INTO vpn_traffic_records
                       (user_id, total_upload, total_download, last_sync_at)
                   VALUES (?, ?, ?, ?)""",
                (r["user_id"], r["total_upload"], r["total_download"], r["last_sync_at"]),
            )
            inserted += 1
        except sqlite3.IntegrityError as e:
            print(f"  [WARN] traffic user_id={r['user_id']}: {e}", file=sys.stderr)
    return inserted


def migrate_login_logs(src, dst):
    """login_logs → vpn_login_logs（只保留 task 规范列：id, user_id, ip, created_at）"""
    rows = src.execute("SELECT id, user_id, ip, created_at FROM login_logs").fetchall()
    inserted = 0
    for r in rows:
        try:
            dst.execute(
                """INSERT OR IGNORE INTO vpn_login_logs
                       (id, user_id, ip, created_at)
                   VALUES (?, ?, ?, ?)""",
                (r["id"], r["user_id"], r["ip"], r["created_at"]),
            )
            inserted += 1
        except sqlite3.IntegrityError as e:
            print(f"  [WARN] login_log id={r['id']}: {e}", file=sys.stderr)
    max_id = src.execute("SELECT COALESCE(MAX(id), 0) FROM login_logs").fetchone()[0]
    if max_id:
        dst.execute(
            "INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES ('vpn_login_logs', ?)",
            (max_id,),
        )
    return inserted


def main():
    if not os.path.isfile(SRC_DB):
        print(f"[ERROR] 源数据库不存在: {SRC_DB}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(DST_DB):
        print(f"[ERROR] 目标数据库不存在: {DST_DB}", file=sys.stderr)
        sys.exit(1)

    # 确保目标库已建 vpn_* 表
    import importlib.util
    import sys as _sys
    if PROJECT_ROOT not in _sys.path:
        _sys.path.insert(0, PROJECT_ROOT)
    spec = importlib.util.spec_from_file_location("app", os.path.join(PROJECT_ROOT, "app.py"))
    app_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(app_mod)  # 这会执行 init_db

    src = sqlite3.connect(SRC_DB)
    src.row_factory = sqlite3.Row
    dst = sqlite3.connect(DST_DB)
    dst.row_factory = sqlite3.Row

    try:
        dst.execute("PRAGMA foreign_keys = OFF")
        n_users = migrate_users(src, dst)
        n_traffic = migrate_traffic(src, dst)
        n_logs = migrate_login_logs(src, dst)
        dst.commit()
    finally:
        dst.execute("PRAGMA foreign_keys = ON")
        src.close()
        dst.close()

    print(f"已迁移 {n_users} 个 vpn_users, {n_traffic} 个 traffic_records, "
          f"{n_logs} 个 login_logs")


if __name__ == "__main__":
    main()
