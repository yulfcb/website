"""
Personal Website - Flask Application
A minimalist personal website with built-in Tetris game, visitor analytics, and Feishu notifications.
"""
import os
import sqlite3
import subprocess
import time
import json
import threading
import logging
import calendar

log = logging.getLogger(__name__)
from datetime import datetime, date, timedelta
from functools import wraps
import re

import requests
from flask import (Flask, render_template, request, jsonify, redirect,
                   url_for, session, send_from_directory, Response, send_file, flash)
from flask_cors import CORS
from user_agents import parse as parse_ua

from config import Config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# In-memory cache for rate limiting Feishu notifications
_notification_cache = {}
_cache_lock = threading.Lock()

# Settings cache: {key: (value, timestamp)} with 30-second TTL
_settings_cache = {}
_settings_cache_lock = threading.Lock()
_SETTINGS_CACHE_TTL = 30  # seconds


def get_setting(key, default=None):
    """Read a setting from the database with a short-lived cache.

    Each gunicorn worker has its own app.config copy, so we read from the
    database (the single source of truth) instead.  A 30-second per-key
    cache avoids hitting SQLite on every request.
    """
    now = time.time()
    with _settings_cache_lock:
        cached = _settings_cache.get(key)
        if cached and (now - cached[1]) < _SETTINGS_CACHE_TTL:
            return cached[0]

    # Cache miss or expired – fetch from DB
    try:
        conn = get_db()
        row = conn.execute('SELECT value FROM settings WHERE key = ?', (key,)).fetchone()
        conn.close()
        if row is None:
            value = default
        else:
            raw = row['value']
            # Convert known boolean keys
            if key in ('FEISHU_NOTIFY_ENABLED',):
                value = raw.lower() == 'true'
            else:
                value = raw
    except Exception:
        value = default

    with _settings_cache_lock:
        _settings_cache[key] = (value, now)
    return value

# =============================================================================
# Database Setup
# =============================================================================

def get_db():
    """Get a database connection."""
    db_path = app.config['DATABASE_PATH']
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # 让 vpn_users / vpn_traffic_records 的 ON DELETE CASCADE 真正生效
    conn.execute('PRAGMA foreign_keys = ON')
    # 多 worker 并发写：WAL 让 reader/writer 不互斥；synchronous=NORMAL 折衷安全和性能
    # PRAGMA journal_mode=WAL 是持久设置（写到文件头），这里每次执行 noop；safe to repeat
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    # 多 worker 同时写同一行时（如 traffic_sync 跨 worker 共享 state），
    # 让 writer 短暂等待锁而不是立即 SQLITE_BUSY；2s 够短不阻塞用户，够长覆盖一轮
    conn.execute('PRAGMA busy_timeout=2000')
    return conn


def init_db():
    """Initialize the database tables."""
    conn = get_db()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip TEXT NOT NULL,
            user_agent TEXT,
            browser TEXT,
            os TEXT,
            referrer TEXT,
            page TEXT,
            geo_info TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip)
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_visits_timestamp ON visits(timestamp)
    ''')
    # Accounts table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Minesweeper users table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS mine_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Minesweeper scores table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS mine_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            time_seconds INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES mine_users(id)
        )
    ''')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_mine_scores_diff ON mine_scores(difficulty, time_seconds)')
    # Settings table (persistent configuration)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Anniversaries table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS anniversaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date DATE NOT NULL,
            description TEXT,
            emoji TEXT DEFAULT '💕',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Reminder rules table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS reminder_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anniversary_id INTEGER NOT NULL,
            rule_type TEXT NOT NULL,
            expression TEXT NOT NULL,
            enabled BOOLEAN DEFAULT 1,
            last_triggered DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (anniversary_id) REFERENCES anniversaries(id) ON DELETE CASCADE
        )
    ''')
    # VPN tables (migrated from vpn-server; independent of accounts/users)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            uuid TEXT UNIQUE NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            enabled INTEGER NOT NULL DEFAULT 1,
            traffic_limit_bytes INTEGER,
            speed_limit_bps INTEGER,
            remark TEXT,
            created_at INTEGER NOT NULL,
            last_xray_sync_at INTEGER
        )
    ''')
    # 兼容旧库：如果 vpn_users 是迁移前建的，没 last_xray_sync_at 列就补上
    _vpn_users_cols = {row['name'] for row in conn.execute('PRAGMA table_info(vpn_users)').fetchall()}
    if 'last_xray_sync_at' not in _vpn_users_cols:
        conn.execute('ALTER TABLE vpn_users ADD COLUMN last_xray_sync_at INTEGER')
    # 兼容旧库：access log tailer 写入的"最近一次接入 IP/时间"
    if 'last_ip' not in _vpn_users_cols:
        conn.execute('ALTER TABLE vpn_users ADD COLUMN last_ip TEXT')
    if 'last_seen_at' not in _vpn_users_cols:
        conn.execute('ALTER TABLE vpn_users ADD COLUMN last_seen_at INTEGER')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_traffic_records (
            user_id INTEGER PRIMARY KEY,
            total_upload INTEGER NOT NULL DEFAULT 0,
            total_download INTEGER NOT NULL DEFAULT 0,
            last_sync_at INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES vpn_users(id) ON DELETE CASCADE
        )
    ''')
    # IP 地理位置缓存（geo-sync daemon 写，前端读）
    # 一行 = 一个 IP 的地理位置记录。命中 LRU 用 last_seen_at 排序淘汰。
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_ip_geo (
            ip TEXT PRIMARY KEY,
            country TEXT,
            region TEXT,
            city TEXT,
            isp TEXT,
            last_seen_at INTEGER NOT NULL,
            fetched_at INTEGER NOT NULL
        )
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_vpn_ip_geo_last_seen
            ON vpn_ip_geo(last_seen_at)
    ''')
    # 当前会话状态（traffic_sync 守护进程读/写；gunicorn 多 worker 共享）：
    # 把之前 4 个内存 dict 沉到表里，跨 worker 看到同一份"在线/会话起点"状态。
    # 一行 = 一个用户最近一次的累计流量 + 最近活跃时间 + 当前会话起点。
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_session_state (
            username TEXT PRIMARY KEY,
            last_cum_up INTEGER NOT NULL DEFAULT 0,
            last_cum_dn INTEGER NOT NULL DEFAULT 0,
            last_seen_at INTEGER,                  -- NULL 或距今 > active window = 不活跃
            session_start_at INTEGER,              -- 当前活跃会话的起点；NULL = 不在会话中
            session_start_cum_up INTEGER,          -- 会话开始时 xray 累计 up
            session_start_cum_dn INTEGER           -- 会话开始时 xray 累计 dn
        )
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_vpn_session_state_last_seen
            ON vpn_session_state(last_seen_at)
    ''')
    # 历史终端：每次"会话刚结束"由 traffic_sync 写一行。供 /vpn/sessions 页面查询、筛选、分页。
    # 上限由 VPN_SESSION_HISTORY_MAX 控制（默认 5000），超限按 ended_at ASC 删最老。
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_session_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            uuid TEXT,
            started_at INTEGER NOT NULL,
            ended_at INTEGER NOT NULL,
            duration_sec INTEGER NOT NULL,
            session_up INTEGER NOT NULL DEFAULT 0,
            session_dn INTEGER NOT NULL DEFAULT 0,
            last_ip TEXT,
            last_seen_at INTEGER,
            device TEXT,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        )
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_vpn_session_history_user
            ON vpn_session_history(username)
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_vpn_session_history_started
            ON vpn_session_history(started_at DESC)
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_vpn_session_history_ended
            ON vpn_session_history(ended_at)
    ''')
    # 多 worker 并发归档的去重索引：同一 (username, started_at, ended_at) 唯一
    # （gunicorn 4 个 worker 各自跑 daemon，多 worker 可能同时尝试插同一会话记录）
    conn.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_vpn_session_history_user_session
            ON vpn_session_history(username, started_at, ended_at)
    ''')
    # 兼容老库：vpn_session_state 在前一轮新增了 idle_rounds / last_delta_* 字段。
    # 用 try/except 跳过已存在的列（重复 ADD COLUMN 会报错）。
    for col, decl in (
        ('last_delta_up', 'INTEGER NOT NULL DEFAULT 0'),
        ('last_delta_dn', 'INTEGER NOT NULL DEFAULT 0'),
        ('idle_rounds',  'INTEGER NOT NULL DEFAULT 0'),
    ):
        try:
            conn.execute(f'ALTER TABLE vpn_session_state ADD COLUMN {col} {decl}')
        except Exception:
            pass  # 已存在
    # 邀请码功能已废弃：清理旧表（幂等，下次启动自动 DROP）
    conn.execute('DROP TABLE IF EXISTS vpn_invite_codes')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS vpn_login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            ip TEXT,
            created_at INTEGER NOT NULL
        )
    ''')
    # 丝绸之路生日游戏（silk-road）：一次游玩会话
    conn.execute('''
        CREATE TABLE IF NOT EXISTS game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            nickname TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # 关卡通关 / 失败复活的元数据日志。
    # ⚠️ 绝不存女朋友的"秘密"原文：kind='fail_secret' 时只记 message_length（字符数），仅用于去重。
    conn.execute('''
        CREATE TABLE IF NOT EXISTS game_reward_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            level_id INTEGER NOT NULL,
            triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            message_length INTEGER,
            kind TEXT NOT NULL
        )
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_game_reward_log_dedup
            ON game_reward_log(session_id, level_id, kind)
    ''')
    # 失败标记（M3）：玩家在 can_fail 关卡 10s 内未达成时，前端打这里 + 弹复活 modal。
    # 仅用于"是否已失败过"判定，**不发飞书**，**不阻止后续 reward/claim**（容错优先）。
    conn.execute('''
        CREATE TABLE IF NOT EXISTS game_fail_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            level_id INTEGER NOT NULL,
            failed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(session_id, level_id)
        )
    ''')
    conn.execute('PRAGMA foreign_keys = ON')
    conn.commit()
    # 默认设置（仅当 settings 表里没值时插入）
    _default_settings = [
        # access log 路径：xray 容器的 access.log 挂到 host 的位置
        # 修改后需重启 personal-website.service 才能生效（Python 模块不会热加载）
        ('VPN_ACCESS_LOG_PATH', '/root/yulei/code/vpn-server/xray/logs/access.log'),
        # access log tailer 轮询间隔（秒）
        ('VPN_ACCESS_TAIL_INTERVAL', '2'),
        # geo-sync daemon 间隔（秒）：定期把 last_ip 没位置的补全
        ('VPN_GEO_SYNC_INTERVAL', '60'),
        # vpn_ip_geo LRU 上限：超过按 last_seen_at 删最老的
        ('VPN_IP_GEO_CACHE_MAX', '500'),
        # ip-api.com 调用间隔下限（秒）：免费档 45 req/min，按 2s 间隔够稳
        ('VPN_IP_GEO_API_INTERVAL', '2'),
        # 历史终端表 LRU 上限：超过按 ended_at ASC 删最老的记录
        ('VPN_SESSION_HISTORY_MAX', '5000'),
        # 历史终端页每页条数
        ('VPN_SESSION_HISTORY_PAGE_SIZE', '50'),
        # 在线终端判定窗口（秒）：N 秒内无流量算下线 / 归档
        # 修改后需重启 personal-website.service 才能生效（traffic_sync 启动时 import settings）
        ('VPN_ACTIVE_WINDOW_SEC', '60'),
    ]
    for k, v in _default_settings:
        existing = conn.execute('SELECT 1 FROM settings WHERE key=?', (k,)).fetchone()
        if not existing:
            conn.execute(
                '''INSERT INTO settings (key, value, updated_at)
                   VALUES (?, ?, CURRENT_TIMESTAMP)''',
                (k, v),
            )
    conn.commit()
    # Initialize default account if no accounts exist
    count = conn.execute('SELECT COUNT(*) as cnt FROM accounts').fetchone()['cnt']
    if count == 0:
        from werkzeug.security import generate_password_hash
        default_hash = generate_password_hash('yulei')
        conn.execute(
            'INSERT OR IGNORE INTO accounts (username, password_hash) VALUES (?, ?)',
            ('yulei', default_hash)
        )
        conn.commit()
    conn.close()


def load_settings_from_db():
    """Load persistent settings from database into app.config."""
    conn = get_db()
    rows = conn.execute('SELECT key, value FROM settings').fetchall()
    conn.close()
    for row in rows:
        key, value = row['key'], row['value']
        if key == 'FEISHU_NOTIFY_ENABLED':
            app.config['FEISHU_NOTIFY_ENABLED'] = value.lower() == 'true'
        elif key == 'FEISHU_WEBHOOK_URL':
            app.config['FEISHU_WEBHOOK_URL'] = value


def save_setting_to_db(key, value):
    """Save a setting to the database (upsert)."""
    conn = get_db()
    conn.execute(
        '''INSERT INTO settings (key, value, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP''',
        (key, str(value))
    )
    conn.commit()
    conn.close()
    # Invalidate cache for this key so all workers pick up the new value
    with _settings_cache_lock:
        _settings_cache.pop(key, None)


# =============================================================================
# Visitor Tracking & Feishu Notification
# =============================================================================

def get_geo_info(ip):
    """Fetch geographic information for an IP address."""
    if ip in ('127.0.0.1', '::1', 'localhost'):
        return json.dumps({'city': '本地', 'country': '本地', 'isp': '本地'})
    try:
        resp = requests.get(f'http://ip-api.com/json/{ip}?lang=zh-CN', timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            return json.dumps({
                'country': data.get('country', '未知'),
                'city': data.get('city', '未知'),
                'region': data.get('regionName', '未知'),
                'isp': data.get('isp', '未知'),
            })
    except Exception:
        pass
    return json.dumps({'city': '未知', 'country': '未知', 'isp': '未知'})


def send_feishu_notification(visit_info):
    """Send visitor info to Feishu via webhook bot."""
    try:
        if not get_setting('FEISHU_NOTIFY_ENABLED', False):
            return
        
        webhook_url = get_setting('FEISHU_WEBHOOK_URL', '')
        if not webhook_url or 'placeholder' in webhook_url:
            app.logger.warning("Feishu webhook URL is empty or placeholder, skipping notification")
            return
        
        geo = json.loads(visit_info.get('geo_info', '{}'))
        ua = parse_ua(visit_info.get('user_agent', ''))
        
        card = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": "🌐 新访客来了"},
                    "template": "blue"
                },
                "elements": [
                    {
                        "tag": "div",
                        "fields": [
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**IP地址:** {visit_info['ip']}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**地理位置:** {geo.get('city', '未知')}, {geo.get('country', '未知')}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**浏览器:** {ua.browser.family} {ua.browser.version_string}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**操作系统:** {ua.os.family} {ua.os.version_string}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**访问页面:** {visit_info['page']}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**来源:** {visit_info.get('referrer', '直接访问')}"}},
                        ]
                    },
                    {
                        "tag": "note",
                        "elements": [
                            {"tag": "plain_text", "content": f"⏰ {visit_info['timestamp']}"}
                        ]
                    }
                ]
            }
        }
        
        resp = requests.post(webhook_url, json=card, timeout=5)
        app.logger.info(f"Feishu notification sent: status={resp.status_code}")
    except Exception as e:
        app.logger.error(f"Failed to send Feishu notification: {e}")


def track_visit():
    """Track a visitor and optionally send Feishu notification."""
    ip = request.headers.get('X-Forwarded-For', request.remote_addr) or '0.0.0.0'
    ip = ip.split(',')[0].strip()
    user_agent = request.user_agent.string
    referrer = request.referrer or ''
    page = request.path
    
    ua = parse_ua(user_agent)
    browser = f"{ua.browser.family} {ua.browser.version_string}"
    os_name = f"{ua.os.family} {ua.os.version_string}"
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    # Store visit in database
    try:
        conn = get_db()
        # Get geo info
        geo_info = get_geo_info(ip)
        conn.execute(
            'INSERT INTO visits (ip, user_agent, browser, os, referrer, page, geo_info, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (ip, user_agent, browser, os_name, referrer, page, geo_info, timestamp)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        app.logger.error(f"Failed to store visit: {e}")
        geo_info = '{}'
    
    # Rate-limited Feishu notification
    with _cache_lock:
        now = time.time()
        # Clean old entries
        expired = [k for k, v in _notification_cache.items() if now - v > app.config['NOTIFY_RATE_LIMIT']]
        for k in expired:
            del _notification_cache[k]
        
        if ip not in _notification_cache:
            _notification_cache[ip] = now
            # Send notification in background thread
            visit_info = {
                'ip': ip,
                'user_agent': user_agent,
                'page': page,
                'referrer': referrer,
                'geo_info': geo_info,
                'timestamp': timestamp,
            }
            thread = threading.Thread(target=send_feishu_notification, args=(visit_info,))
            thread.daemon = True
            thread.start()


# =============================================================================
# Anniversary Helpers
# =============================================================================

def validate_rule_expression(expression):
    """Validate a reminder rule expression. Returns (is_valid, error_message)."""
    expr = expression.strip()
    if not expr:
        return False, '表达式不能为空'

    # before:Nd - trigger N days before the anniversary date each year
    if re.match(r'^before:\d+d$', expr):
        n = int(expr.split(':')[1].rstrip('d'))
        if n < 1 or n > 365:
            return False, '提前天数应在 1-365 之间'
        return True, None

    # every:Nd - trigger every N days from the anniversary date
    if re.match(r'^every:\d+d$', expr):
        n = int(expr.split(':')[1].rstrip('d'))
        if n < 1:
            return False, '周期天数应大于 0'
        return True, None

    # yearly:m{M}d{D}:pre:{N}d - trigger N days before a fixed date each year
    m = re.match(r'^yearly:m(\d{1,2})d(\d{1,2}):pre:(\d+)d$', expr)
    if m:
        month, day, pre = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if month < 1 or month > 12:
            return False, '月份应在 1-12 之间'
        if day < 1 or day > 31:
            return False, '日期应在 1-31 之间'
        if pre < 0 or pre > 365:
            return False, '提前天数应在 0-365 之间'
        return True, None

    # anniversary:pre:Nd - trigger N days before the anniversary date each year
    m = re.match(r'^anniversary:pre:(\d+)d$', expr)
    if m:
        n = int(m.group(1))
        if n < 1 or n > 365:
            return False, '提前天数应在 1-365 之间'
        return True, None

    # days_after:N - trigger on the Nth day after the anniversary
    m = re.match(r'^days_after:(\d+)$', expr)
    if m:
        n = int(m.group(1))
        if n < 1:
            return False, '天数应大于 0'
        return True, None

    # monthly:d{D} - trigger on day D of each month (clamped to month end)
    m = re.match(r'^monthly:d(\d{1,2})$', expr)
    if m:
        day = int(m.group(1))
        if day < 1 or day > 31:
            return False, '日期应在 1-31 之间'
        return True, None

    # monthly:d{D}:pre:{N}d - trigger N days before day D of each month
    m = re.match(r'^monthly:d(\d{1,2}):pre:(\d+)d$', expr)
    if m:
        day, pre = int(m.group(1)), int(m.group(2))
        if day < 1 or day > 31:
            return False, '日期应在 1-31 之间'
        if pre < 0 or pre > 30:
            return False, '提前天数应在 0-30 之间'
        return True, None

    return False, f'无法识别的表达式格式: {expr}'


def rule_type_from_expression(expression):
    """Infer rule_type from expression string."""
    expr = expression.strip()
    if expr.startswith('before:'):
        return 'before'
    if expr.startswith('every:'):
        return 'periodic'
    if expr.startswith('yearly:'):
        return 'fixed'
    if expr.startswith('anniversary:'):
        return 'before'
    if expr.startswith('days_after:'):
        return 'periodic'
    if expr.startswith('monthly:'):
        return 'fixed'
    return 'expression'


def check_rule_matches_today(expression, anniversary_date, today):
    """Check if a rule expression matches today for a given anniversary date.

    Returns (matches: bool, message_type: str|None, context: dict|None).
    message_type: 'anniversary_day', 'upcoming', 'milestone'
    """
    expr = expression.strip()
    anniv = anniversary_date  # date object

    # Calculate total days from anniversary to today
    total_days = (today - anniv).days

    # before:Nd -- trigger N days before the anniversary date each year
    m = re.match(r'^before:(\d+)d$', expr)
    if m:
        n = int(m.group(1))
        # Check this year and next year's anniversary
        for year in [today.year, today.year + 1]:
            try:
                anniv_this_year = anniv.replace(year=year)
            except ValueError:
                continue
            days_until = (anniv_this_year - today).days
            if days_until == n:
                return True, 'upcoming', {
                    'days_until': n,
                    'target_date': anniv_this_year.isoformat(),
                    'total_days_at_target': (anniv_this_year - anniv).days,
                }
        return False, None, None

    # every:Nd -- trigger every N days from the anniversary date
    m = re.match(r'^every:(\d+)d$', expr)
    if m:
        n = int(m.group(1))
        if total_days > 0 and total_days % n == 0:
            return True, 'milestone', {'days': total_days}
        return False, None, None

    # yearly:m{M}d{D}:pre:{N}d -- trigger N days before a fixed date each year
    m = re.match(r'^yearly:m(\d{1,2})d(\d{1,2}):pre:(\d+)d$', expr)
    if m:
        month, day, pre = int(m.group(1)), int(m.group(2)), int(m.group(3))
        for year in [today.year, today.year + 1]:
            try:
                target = date(year, month, day)
            except ValueError:
                continue
            days_until = (target - today).days
            if days_until == pre:
                return True, 'upcoming', {
                    'days_until': pre,
                    'target_date': target.isoformat(),
                    'total_days_at_target': (target - anniv).days,
                }
        return False, None, None

    # anniversary:pre:Nd -- same as before:Nd
    m = re.match(r'^anniversary:pre:(\d+)d$', expr)
    if m:
        n = int(m.group(1))
        for year in [today.year, today.year + 1]:
            try:
                anniv_this_year = anniv.replace(year=year)
            except ValueError:
                continue
            days_until = (anniv_this_year - today).days
            if days_until == n:
                return True, 'upcoming', {
                    'days_until': n,
                    'target_date': anniv_this_year.isoformat(),
                    'total_days_at_target': (anniv_this_year - anniv).days,
                }
        return False, None, None

    # days_after:N -- trigger on the Nth day after the anniversary
    m = re.match(r'^days_after:(\d+)$', expr)
    if m:
        n = int(m.group(1))
        if total_days == n:
            return True, 'milestone', {'days': n}
        return False, None, None

    # monthly:d{D} -- trigger on day D of each month (clamped to month end).
    # Check this month and next month so month-end rollovers don't get missed.
    m = re.match(r'^monthly:d(\d{1,2})$', expr)
    if m:
        day = int(m.group(1))
        # Iterate candidate (year, month) pairs: this month + next month.
        if today.month == 12:
            candidates = [(today.year, 12), (today.year + 1, 1)]
        else:
            candidates = [(today.year, today.month), (today.year, today.month + 1)]
        for year, month in candidates:
            last_day = calendar.monthrange(year, month)[1]
            effective_day = min(day, last_day)
            try:
                target = date(year, month, effective_day)
            except ValueError:
                continue
            if target == today:
                return True, 'anniversary_day', {
                    'day': effective_day,
                    'target_date': target.isoformat(),
                    'is_clamped': day > last_day,
                }
        return False, None, None

    # monthly:d{D}:pre:{N}d -- trigger N days before day D of each month
    # (clamped to month end). Check this month and next month.
    m = re.match(r'^monthly:d(\d{1,2}):pre:(\d+)d$', expr)
    if m:
        day, pre = int(m.group(1)), int(m.group(2))
        if today.month == 12:
            candidates = [(today.year, 12), (today.year + 1, 1)]
        else:
            candidates = [(today.year, today.month), (today.year, today.month + 1)]
        for year, month in candidates:
            last_day = calendar.monthrange(year, month)[1]
            effective_day = min(day, last_day)
            try:
                target = date(year, month, effective_day)
            except ValueError:
                continue
            days_until = (target - today).days
            if days_until == pre:
                return True, 'upcoming', {
                    'days_until': pre,
                    'target_date': target.isoformat(),
                    'is_clamped': day > last_day,
                }
        return False, None, None

    return False, None, None


def build_anniversary_message(name, anniv_date_str, message_type, context, emoji='💕'):
    """Build a romantic-style anniversary notification message.

    The last line is driven by the simple date diff (today - anniversary)
    rather than a cross-year "days_until" calculation. The same logic applies
    to all three message_types: anniversary_day, upcoming, milestone.

        total_days > 0  → "{name}已经{total_days}天"
        total_days < 0  → "距离{name}还有{-total_days}天"
        total_days == 0 → "今天是{name}纪念日"

    `context` is accepted for API compatibility but unused — message_type
    doesn't influence the wording.
    """
    anniv = datetime.strptime(anniv_date_str, '%Y-%m-%d').date()
    today = date.today()
    total_days = (today - anniv).days

    if total_days > 0:
        days_line = f"{name}已经{total_days}天"
    elif total_days < 0:
        days_line = f"距离{name}还有{-total_days}天"
    else:
        days_line = f"今天是{name}纪念日"

    message = (
        f"{emoji} {name}\n"
        f"📅 {anniv_date_str}\n"
        f"{days_line}"
    )
    app.logger.info(f"anniversary message: {message}")
    return message


def send_anniversary_feishu(message_text):
    """Send an anniversary notification to Feishu via webhook bot."""
    try:
        webhook_url = get_setting('FEISHU_WEBHOOK_URL', '')
        if not webhook_url or 'placeholder' in webhook_url:
            app.logger.warning("Feishu webhook URL is empty or placeholder, skipping anniversary notification")
            return False

        card = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": "💕 纪念日提醒"},
                    "template": "pink"
                },
                "elements": [
                    {
                        "tag": "div",
                        "text": {
                            "tag": "lark_md",
                            "content": message_text.replace('\n', '\n')
                        }
                    },
                    {
                        "tag": "note",
                        "elements": [
                            {"tag": "plain_text", "content": f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"}
                        ]
                    }
                ]
            }
        }

        resp = requests.post(webhook_url, json=card, timeout=5)
        app.logger.info(f"Anniversary Feishu notification sent: status={resp.status_code}")
        return resp.status_code == 200
    except Exception as e:
        app.logger.error(f"Failed to send anniversary Feishu notification: {e}")
        return False


# =============================================================================
# Silk Road Birthday Game — Config & Feishu Reward/Secret Push
# =============================================================================

GAME_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'data', 'game_config.json'
)

# 兜底配置：game_config.json 读不到时用（保证路由不 500）
_GAME_CONFIG_FALLBACK = {
    'nickname_default': '小卡',
    'total_reward': 1314.00,
    'modes': {},
    'levels': [],
}


def load_game_config():
    """读取丝绸之路游戏配置（data/game_config.json）。只读，不含敏感信息。"""
    try:
        with open(GAME_CONFIG_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        app.logger.error(f"[game] failed to load game config: {e}")
        return dict(_GAME_CONFIG_FALLBACK)


def game_level_by_id(level_id):
    """按 id 取关卡配置，找不到返回 None。"""
    try:
        target = int(level_id)
    except (TypeError, ValueError):
        return None
    for lv in load_game_config().get('levels', []):
        try:
            if int(lv.get('id')) == target:
                return lv
        except (TypeError, ValueError):
            continue
    return None


def send_game_reward_feishu(level_info):
    """通关奖励推送（礼物专属：不受 FEISHU_NOTIFY_ENABLED 总开关控制）。

    level_info: {nickname, level_title, amount, timestamp, quote}
    日志中不打印玩家昵称/文案原文，只记结构化状态。
    """
    try:
        webhook_url = get_setting('FEISHU_WEBHOOK_URL', '')
        if not webhook_url or 'placeholder' in webhook_url:
            app.logger.warning("[game-reward] webhook url empty/placeholder, skip")
            return False

        nickname = level_info.get('nickname', '小卡')
        level_title = level_info.get('level_title', '')
        amount = level_info.get('amount', 0)
        timestamp = level_info.get('timestamp') or datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        quote = level_info.get('quote', '') or '—'

        card = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": "🎮 闯关胜利！"},
                    "template": "pink"
                },
                "elements": [
                    {
                        "tag": "div",
                        "fields": [
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**玩家:** {nickname}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**关卡:** {level_title}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**奖励额度:** ¥{amount}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**触发时间:** {timestamp}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**关卡文案:** {quote}"}},
                        ]
                    },
                    {"tag": "note", "elements": [{"tag": "plain_text", "content": "💌 她已过关，请尽快发红包给她"}]}
                ]
            }
        }

        resp = requests.post(webhook_url, json=card, timeout=5)
        app.logger.info(
            f"[game-reward] sent: status={resp.status_code} level='{level_title}' amount={amount}"
        )
        return resp.status_code == 200
    except Exception as e:
        app.logger.error(f"[game-reward] failed to send: {e}")
        return False


def send_game_secret_feishu(secret_info):
    """失败复活"秘密"推送（礼物专属：不受 FEISHU_NOTIFY_ENABLED 控制）。

    secret_info: {nickname, level_title, secret_text}
    ⚠️ secret_text 只进飞书卡片，绝不入库、绝不打印明文（日志用 [redacted] + 长度）。
    """
    try:
        webhook_url = get_setting('FEISHU_WEBHOOK_URL', '')
        if not webhook_url or 'placeholder' in webhook_url:
            app.logger.warning("[game-secret] webhook url empty/placeholder, skip")
            return False

        nickname = secret_info.get('nickname', '小卡')
        level_title = secret_info.get('level_title', '')
        secret_text = secret_info.get('secret_text', '')

        card = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": "💌 她有个秘密"},
                    "template": "blue"
                },
                "elements": [
                    {
                        "tag": "div",
                        "fields": [
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**她:** {nickname}"}},
                            {"is_short": True, "text": {"tag": "lark_md", "content": f"**关卡:** {level_title}"}},
                            {"is_short": False, "text": {"tag": "lark_md", "content": f"**内容:**\n> {secret_text}"}},
                        ]
                    },
                    {"tag": "note", "elements": [{"tag": "plain_text", "content": "✨ 仅此一次，不进任何数据库"}]}
                ]
            }
        }

        resp = requests.post(webhook_url, json=card, timeout=5)
        # 只记状态 + 长度，绝不打印 secret_text 原文
        app.logger.info(
            f"[game-secret] sent: status={resp.status_code} level='{level_title}' "
            f"secret=[redacted] len={len(secret_text)}"
        )
        return resp.status_code == 200
    except Exception as e:
        app.logger.error(f"[game-secret] failed to send: {e}")
        return False


# =============================================================================
# Admin Authentication Decorator
# =============================================================================

def admin_required(f):
    """Decorator to require admin authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('admin_authenticated'):
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': '未授权'}), 401
            return redirect(url_for('admin_login'))
        return f(*args, **kwargs)
    return decorated


# =============================================================================
# VPN Jinja Filters & Context
# =============================================================================

@app.template_filter('filesize')
def _vpn_filesize(n):
    """人类友好的文件大小（vpn 子页面用）"""
    if n is None:
        return '-'
    n = int(n)
    for unit in ('B', 'KB', 'MB', 'GB', 'TB'):
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != 'B' else f"{n} {unit}"
        n /= 1024
    return f"{n:.1f} PB"


@app.template_filter('speed')
def _vpn_speed(bps):
    """bps 转 Mbps"""
    if not bps:
        return '-'
    mbps = bps / 1024 / 1024 * 8
    return f"{mbps:.1f} Mbps"


@app.template_filter('ts')
def _vpn_ts(t):
    """unix 时间戳转 'YYYY-MM-DD HH:MM:SS'"""
    if not t:
        return '-'
    from datetime import datetime as _dt
    return _dt.fromtimestamp(int(t)).strftime('%Y-%m-%d %H:%M:%S')


@app.template_filter('duration')
def _vpn_duration(seconds):
    """秒数 → 'X 分 Y 秒' / 'X 小时 Y 分'（vpn 在线时长显示）"""
    if seconds is None:
        return '-'
    seconds = int(seconds)
    if seconds < 0:
        return '-'
    hours, rem = divmod(seconds, 3600)
    minutes, secs = divmod(rem, 60)
    if hours > 0:
        return f"{hours} 小时 {minutes} 分"
    if minutes > 0:
        return f"{minutes} 分 {secs} 秒"
    return f"{secs} 秒"


# =============================================================================
# Routes - Public Pages
# =============================================================================

@app.route('/')
def index():
    """Main landing page."""
    track_visit()
    return render_template('index.html')


@app.route('/games')
def games():
    """Games hub page."""
    track_visit()
    return render_template('games.html')


@app.route('/games/tetris')
def tetris():
    """Tetris game page."""
    track_visit()
    return render_template('tetris.html')


@app.route('/raise')
def raise_channel():
    """养成频道 - 皇帝养成游戏入口."""
    track_visit()
    return render_template('raise.html')


@app.route('/raise/emperor')
def emperor_game():
    """皇帝养成游戏."""
    track_visit()
    return render_template('emperor.html')


@app.route('/economy')
def economy():
    """经济频道 - 汇率和黄金价格."""
    track_visit()
    return render_template('economy.html')


@app.route('/games/minesweeper')
def minesweeper():
    """Minesweeper game page."""
    track_visit()
    return render_template('minesweeper.html')


@app.route('/api/exchange-rate')
def get_exchange_rate():
    """获取美元兑人民币汇率和30天趋势."""
    try:
        # 获取实时汇率
        current_res = requests.get('https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY', timeout=5)
        current_data = current_res.json()
        current_rate = current_data['rates']['CNY']
        
        # 获取30天历史趋势
        from datetime import datetime, timedelta
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        
        history_res = requests.get(
            f'https://api.frankfurter.dev/v1/{start_date}..{end_date}?base=USD&symbols=CNY',
            timeout=5
        )
        history_data = history_res.json()
        
        # 格式化历史数据
        history = []
        if 'rates' in history_data:
            for date, rates in sorted(history_data['rates'].items()):
                history.append({
                    'date': date,
                    'rate': rates['CNY']
                })
        
        return jsonify({
            'current_rate': current_rate,
            'date': current_data['date'],
            'history': history
        })
    except Exception as e:
        logging.error(f'Exchange rate API error: {e}')
        return jsonify({'error': '获取汇率数据失败'}), 500


@app.route('/api/gold-price')
def get_gold_price():
    """获取黄金价格（使用波兰央行黄金价格转换为人民币）."""
    try:
        # NBP API 提供黄金价格（波兰兹罗提/克）
        # 获取更多历史数据用于走势图
        current_res = requests.get('https://api.nbp.pl/api/cenyzlota/last/30?format=json', timeout=5)
        current_data = current_res.json()
        
        # 获取 PLN/CNY 和 PLN/USD 汇率用于转换
        usd_res = requests.get('https://api.frankfurter.dev/v1/latest?base=PLN&symbols=CNY,USD', timeout=5)
        usd_data = usd_res.json()
        pln_to_cny = usd_data['rates']['CNY']
        pln_to_usd = usd_data['rates']['USD']
        
        # 最新价格
        latest = current_data[-1]
        pln_per_gram = latest['cena']
        cny_per_gram = pln_per_gram * pln_to_cny
        # 计算国际金价 USD/盎司 (1盎司 = 31.1035克)
        usd_per_oz = round(pln_per_gram * pln_to_usd * 31.1035, 2)
        
        # 构建历史数据
        history = []
        for item in current_data:
            pln_price = item['cena']
            cny_price = pln_price * pln_to_cny
            history.append({
                'date': item['data'],
                'price_cny': round(cny_price, 2)
            })
        
        return jsonify({
            'current_price': round(cny_per_gram, 2),
            'price_usd_oz': usd_per_oz,
            'date': latest['data'],
            'history': history,
            'note': '基于国际金价转换的参考报价，实际浙商银行积存金价格请以银行公告为准'
        })
    except Exception as e:
        logging.error(f'Gold price API error: {e}')
        return jsonify({'error': '获取黄金价格失败'}), 500


@app.route('/robots.txt')
def robots():
    """Serve robots.txt."""
    return send_from_directory('static', 'robots.txt', mimetype='text/plain')


@app.route('/sitemap.xml')
def sitemap():
    """Serve sitemap.xml."""
    return send_from_directory('static', 'sitemap.xml', mimetype='application/xml')




# =============================================================================
# Routes - Minesweeper API
# =============================================================================

import hashlib as _hashlib
import secrets as _secrets

MINE_DIFFICULTY_CONFIG = {
    'easy': {'rows': 9, 'cols': 9, 'mines': 10, 'name': '简单'},
    'medium': {'rows': 16, 'cols': 16, 'mines': 40, 'name': '中等'},
    'hard': {'rows': 16, 'cols': 30, 'mines': 99, 'name': '困难'}
}


@app.route('/api/mine/login', methods=['POST'])
def mine_login():
    """Simple nickname login - no password needed."""
    data = request.get_json()
    username = data.get('username', '').strip()
    if not username:
        return jsonify({'error': '请输入昵称'}), 400
    if len(username) > 20:
        return jsonify({'error': '昵称最长20个字符'}), 400
    conn = get_db()
    try:
        user = conn.execute('SELECT id, username FROM mine_users WHERE username = ?', (username,)).fetchone()
        if not user:
            conn.execute('INSERT INTO mine_users (username) VALUES (?)', (username,))
            conn.commit()
            user = conn.execute('SELECT id, username FROM mine_users WHERE username = ?', (username,)).fetchone()
        session['mine_user_id'] = user['id']
        session['mine_username'] = user['username']
        return jsonify({'success': True, 'username': user['username']})
    finally:
        conn.close()


@app.route('/api/mine/logout', methods=['POST'])
def mine_logout():
    session.pop('mine_user_id', None)
    session.pop('mine_username', None)
    return jsonify({'success': True})


@app.route('/api/mine/me')
def mine_me():
    if 'mine_user_id' in session:
        return jsonify({'logged_in': True, 'username': session['mine_username']})
    return jsonify({'logged_in': False})


@app.route('/api/mine/submit', methods=['POST'])
def mine_submit():
    if 'mine_user_id' not in session:
        return jsonify({'error': '请先登录'}), 401
    data = request.get_json()
    difficulty = data.get('difficulty')
    time_seconds = data.get('time')
    if difficulty not in MINE_DIFFICULTY_CONFIG:
        return jsonify({'error': '无效的难度'}), 400
    if not isinstance(time_seconds, (int, float)) or time_seconds < 1:
        return jsonify({'error': '无效的时间'}), 400
    time_seconds = int(time_seconds)
    conn = get_db()
    try:
        conn.execute('INSERT INTO mine_scores (user_id, difficulty, time_seconds) VALUES (?, ?, ?)',
                     (session['mine_user_id'], difficulty, time_seconds))
        conn.commit()
        rank = conn.execute(
            '''SELECT COUNT(DISTINCT user_id) + 1 as rank FROM (
                SELECT user_id, MIN(time_seconds) as best_time
                FROM mine_scores WHERE difficulty = ?
                GROUP BY user_id
            ) WHERE best_time < ?''',
            (difficulty, time_seconds)
        ).fetchone()['rank']
        return jsonify({'success': True, 'rank': rank, 'time': time_seconds})
    finally:
        conn.close()


@app.route('/api/mine/leaderboard/<difficulty>')
def mine_leaderboard(difficulty):
    if difficulty not in MINE_DIFFICULTY_CONFIG:
        return jsonify({'error': '无效的难度'}), 400
    conn = get_db()
    try:
        rows = conn.execute('''
            SELECT u.username, MIN(s.time_seconds) as best_time, s.created_at,
                   COUNT(*) as total_games
            FROM mine_scores s
            JOIN mine_users u ON s.user_id = u.id
            WHERE s.difficulty = ?
            GROUP BY u.id
            ORDER BY best_time ASC
            LIMIT 50
        ''', (difficulty,)).fetchall()
        result = []
        for i, row in enumerate(rows):
            result.append({
                'rank': i + 1,
                'username': row['username'],
                'best_time': row['best_time'],
                'total_games': row['total_games'],
                'date': row['created_at'][:10] if row['created_at'] else ''
            })
        return jsonify(result)
    finally:
        conn.close()


# =============================================================================
# Routes - Silk Road Birthday Game (丝绸之路·回家)
# =============================================================================

def _game_request_json():
    """健壮地取请求体：支持 application/json，也支持 curl -d '{...}'（无 content-type）。"""
    data = request.get_json(silent=True)
    if data is None:
        try:
            data = json.loads(request.get_data(as_text=True) or '{}')
        except Exception:
            data = request.form.to_dict() if request.form else {}
    if not isinstance(data, dict):
        data = {}
    return data


def _game_clean_nickname(raw, cfg=None):
    nickname = (raw or '').strip()
    if not nickname:
        nickname = (cfg or load_game_config()).get('nickname_default') or '小卡'
    return nickname[:20]


@app.route('/games/silk-road/mode')
def silk_road_mode():
    """模式选择页（陆上丝绸之路可玩，海上 / 豪华游 disabled）。"""
    track_visit()
    return render_template('silk-road/mode.html', config=load_game_config())


@app.route('/games/silk-road/level/<int:n>')
def silk_road_level(n):
    """关卡页 0~5（M1 为占位骨架）。"""
    track_visit()
    if n < 0 or n > 5:
        return redirect(url_for('silk_road_mode'))
    cfg = load_game_config()
    level = game_level_by_id(n)
    next_url = url_for('silk_road_end') if n >= 5 else url_for('silk_road_level', n=n + 1)
    return render_template(
        f'silk-road/level-{n}.html',
        config=cfg, level=level, level_id=n, next_url=next_url,
    )


@app.route('/games/silk-road/world-map')
def silk_road_world_map():
    """M9.4 静态世界地图（SVG 6 关路线）。"""
    track_visit()
    return render_template('silk-road/world-map.html', config=load_game_config())


@app.route('/games/silk-road/end')
def silk_road_end():
    """终局页：累计奖励总额 + 通关时间（仅渲染模板，不打 webhook）。"""
    track_visit()
    cfg = load_game_config()
    total = cfg.get('total_reward')
    if total is None:
        total = round(sum(float(l.get('reward', 0)) for l in cfg.get('levels', [])), 2)

    # M4：从 game_sessions 读最新一条 session 的 started_at → 算 elapsed（仅展示用，不返回整张表）
    started_at = None
    nickname = None
    sid = request.args.get('sid', '').strip()
    conn = get_db()
    try:
        if sid:
            row = conn.execute(
                'SELECT started_at, nickname FROM game_sessions WHERE session_id=?',
                (sid,),
            ).fetchone()
            if row:
                started_at = row['started_at']
                nickname = row['nickname']
        if started_at is None:
            # 兜底：拿最近一条 session
            row = conn.execute(
                'SELECT started_at, nickname FROM game_sessions '
                'ORDER BY id DESC LIMIT 1',
            ).fetchone()
            if row:
                started_at = row['started_at']
                nickname = row['nickname']
    finally:
        conn.close()

    return render_template(
        'silk-road/end.html',
        config=cfg, total_reward=total,
        started_at=started_at, db_nickname=nickname,
    )


@app.route('/api/game/config')
def api_game_config():
    """只读返回关卡/载具/红包配置（不含任何敏感信息）。"""
    return jsonify(load_game_config())


@app.route('/api/game/session', methods=['POST'])
def api_game_session():
    """创建一次游玩 session，返回 {session_id, nickname}。"""
    cfg = load_game_config()
    data = _game_request_json()
    nickname = _game_clean_nickname(data.get('nickname'), cfg)
    session_id = _secrets.token_hex(16)
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO game_sessions (session_id, nickname) VALUES (?, ?)',
            (session_id, nickname),
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({'session_id': session_id, 'nickname': nickname})


@app.route('/api/game/reward/claim', methods=['POST'])
def api_game_reward_claim():
    """关卡通关 → 触发 reward webhook。

    去重：同 (session_id, level_id, kind='reward') 只触发一次（防止狂点"已领取"）。
    body: {session_id, level, nickname}
    """
    data = _game_request_json()
    session_id = (data.get('session_id') or '').strip()
    nickname = _game_clean_nickname(data.get('nickname'))
    if not session_id:
        return jsonify({'success': False, 'error': 'missing session_id'}), 400
    try:
        level = int(data.get('level'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'invalid level'}), 400
    level_cfg = game_level_by_id(level)
    if not level_cfg:
        return jsonify({'success': False, 'error': 'unknown level'}), 400

    conn = get_db()
    try:
        conn.execute(
            'UPDATE game_sessions SET last_seen_at=CURRENT_TIMESTAMP, nickname=? WHERE session_id=?',
            (nickname, session_id),
        )
        existing = conn.execute(
            "SELECT 1 FROM game_reward_log WHERE session_id=? AND level_id=? AND kind='reward'",
            (session_id, level),
        ).fetchone()
        if existing:
            conn.commit()
            return jsonify({'success': True, 'duplicate': True, 'triggered': False})
        # 先落去重行再发 webhook：避免并发双击各发一次
        conn.execute(
            "INSERT INTO game_reward_log (session_id, level_id, kind, message_length) "
            "VALUES (?, ?, 'reward', NULL)",
            (session_id, level),
        )
        conn.commit()
    finally:
        conn.close()

    triggered = send_game_reward_feishu({
        'nickname': nickname,
        'level_title': level_cfg.get('title', ''),
        'amount': level_cfg.get('reward', 0),
        'quote': level_cfg.get('quote', ''),
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    })
    return jsonify({'success': True, 'duplicate': False, 'triggered': triggered})


@app.route('/api/game/secret', methods=['POST'])
def api_game_secret():
    """失败复活 → 提交"秘密" → 触发 secret webhook。

    ⚠️ secret_text 绝不入库：只把 message_length 写进 game_reward_log 用于去重。
    body: {session_id, level, nickname, secret_text}
    """
    data = _game_request_json()
    session_id = (data.get('session_id') or '').strip()
    nickname = _game_clean_nickname(data.get('nickname'))
    secret_text = (data.get('secret_text') or '').strip()
    if not session_id:
        return jsonify({'success': False, 'error': 'missing session_id'}), 400
    try:
        level = int(data.get('level'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'error': 'invalid level'}), 400
    if not secret_text:
        return jsonify({'success': False, 'error': 'empty secret'}), 400
    if len(secret_text) > 200:
        secret_text = secret_text[:200]

    level_cfg = game_level_by_id(level)
    level_title = level_cfg.get('title', '') if level_cfg else f'关卡 {level}'
    msg_len = len(secret_text)

    conn = get_db()
    try:
        conn.execute(
            'UPDATE game_sessions SET last_seen_at=CURRENT_TIMESTAMP, nickname=? WHERE session_id=?',
            (nickname, session_id),
        )
        existing = conn.execute(
            "SELECT 1 FROM game_reward_log WHERE session_id=? AND level_id=? AND kind='fail_secret'",
            (session_id, level),
        ).fetchone()
        if not existing:
            # 仅存元数据长度，绝不存原文
            conn.execute(
                "INSERT INTO game_reward_log (session_id, level_id, kind, message_length) "
                "VALUES (?, ?, 'fail_secret', ?)",
                (session_id, level, msg_len),
            )
        conn.commit()
    finally:
        conn.close()

    triggered = send_game_secret_feishu({
        'nickname': nickname,
        'level_title': level_title,
        'secret_text': secret_text,
    })
    # 注意：这里以及任何地方都不 log secret_text 原文
    return jsonify({'success': True, 'triggered': triggered})


@app.route('/api/game/fail_level', methods=['POST'])
def api_game_fail_level():
    """M3 新增：标记某关失败（不发飞书，仅挡玩家作弊 + 供前端判断）。

    body: {session_id, level, nickname?}
    返回：{ok, failed_levels: [...]}  ── 当前 session 已失败过的关卡列表
    """
    data = _game_request_json()
    session_id = (data.get('session_id') or '').strip()
    nickname = _game_clean_nickname(data.get('nickname'))
    if not session_id:
        return jsonify({'ok': False, 'error': 'missing session_id'}), 400
    try:
        level = int(data.get('level'))
    except (TypeError, ValueError):
        return jsonify({'ok': False, 'error': 'invalid level'}), 400

    conn = get_db()
    try:
        conn.execute(
            'UPDATE game_sessions SET last_seen_at=CURRENT_TIMESTAMP, nickname=? WHERE session_id=?',
            (nickname, session_id),
        )
        # INSERT OR IGNORE：UNIQUE(session_id, level_id) 防止同一关被反复插
        conn.execute(
            'INSERT OR IGNORE INTO game_fail_log (session_id, level_id) VALUES (?, ?)',
            (session_id, level),
        )
        conn.commit()
        rows = conn.execute(
            'SELECT level_id FROM game_fail_log WHERE session_id=? ORDER BY level_id',
            (session_id,),
        ).fetchall()
    finally:
        conn.close()
    return jsonify({
        'ok': True,
        'failed_levels': [int(r['level_id']) for r in rows],
    })


# =============================================================================
# Routes - Admin
# =============================================================================

@app.route('/admin')
def admin_login():
    """Admin login page."""
    if session.get('admin_authenticated'):
        return redirect(url_for('admin_dashboard'))
    return render_template('admin.html', logged_in=False)


@app.route('/admin/login', methods=['POST'])
def admin_auth():
    """Handle admin login."""
    from werkzeug.security import check_password_hash
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username:
        return jsonify({'success': False, 'error': '请输入用户名'}), 401
    conn = get_db()
    account = conn.execute(
        'SELECT * FROM accounts WHERE username = ?', (username,)
    ).fetchone()
    conn.close()
    if account and check_password_hash(account['password_hash'], password):
        session['admin_authenticated'] = True
        session['admin_username'] = username
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': '用户名或密码错误'}), 401


@app.route('/admin/logout', methods=['POST'])
def admin_logout():
    """Handle admin logout."""
    session.pop('admin_authenticated', None)
    return jsonify({'success': True})


@app.route('/admin/dashboard')
@admin_required
def admin_dashboard():
    """Admin dashboard page."""
    return render_template('admin.html', logged_in=True)


@app.route('/api/stats')
def public_stats():
    """Public visitor statistics."""
    conn = get_db()
    today = date.today().isoformat()
    total = conn.execute('SELECT COUNT(*) as cnt FROM visits').fetchone()['cnt']
    today_visits = conn.execute(
        "SELECT COUNT(*) as cnt FROM visits WHERE date(timestamp) = ?", (today,)
    ).fetchone()['cnt']
    conn.close()
    return jsonify({'total': total, 'today': today_visits})


@app.route('/api/admin/stats')
@admin_required
def admin_stats():
    """Get visitor statistics."""
    conn = get_db()
    
    today = date.today().isoformat()
    
    total = conn.execute('SELECT COUNT(*) as cnt FROM visits').fetchone()['cnt']
    unique = conn.execute('SELECT COUNT(DISTINCT ip) as cnt FROM visits').fetchone()['cnt']
    today_visits = conn.execute(
        "SELECT COUNT(*) as cnt FROM visits WHERE date(timestamp) = ?", (today,)
    ).fetchone()['cnt']
    
    # Last 7 days trend
    trend = conn.execute('''
        SELECT date(timestamp) as day, COUNT(*) as count
        FROM visits
        WHERE timestamp >= date('now', '-7 days')
        GROUP BY date(timestamp)
        ORDER BY day
    ''').fetchall()
    
    # Top pages
    top_pages = conn.execute('''
        SELECT page, COUNT(*) as count FROM visits
        GROUP BY page ORDER BY count DESC LIMIT 10
    ''').fetchall()
    
    conn.close()
    
    return jsonify({
        'total': total,
        'unique': unique,
        'today': today_visits,
        'trend': [{'day': r['day'], 'count': r['count']} for r in trend],
        'top_pages': [{'page': r['page'], 'count': r['count']} for r in top_pages],
    })


@app.route('/api/admin/visits')
@admin_required
def admin_visits():
    """Get visitor log with pagination and filters."""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search_ip = request.args.get('ip', '')
    search_page = request.args.get('page_filter', '')
    
    conn = get_db()
    conditions = []
    params = []
    
    if search_ip:
        conditions.append('ip LIKE ?')
        params.append(f'%{search_ip}%')
    if search_page:
        conditions.append('page LIKE ?')
        params.append(f'%{search_page}%')
    
    where = 'WHERE ' + ' AND '.join(conditions) if conditions else ''
    
    total = conn.execute(f'SELECT COUNT(*) as cnt FROM visits {where}', params).fetchone()['cnt']
    
    offset = (page - 1) * per_page
    visits = conn.execute(
        f'SELECT * FROM visits {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        params + [per_page, offset]
    ).fetchall()
    
    conn.close()
    
    return jsonify({
        'total': total,
        'page': page,
        'per_page': per_page,
        'visits': [dict(v) for v in visits],
    })


@app.route('/api/admin/settings', methods=['GET', 'POST'])
@admin_required
def admin_settings():
    """Get or update notification + VPN settings.

    POST 也支持 `restart=True`：写完设置后调用 `systemctl restart personal-website`
    让 traffic_sync 守护进程立即加载新设置（gunicorn 也会重启，所以调用方
    需要等几秒后重连）。失败时返回 500 + 错误信息，前端用 alert 提示用户。
    """
    if request.method == 'GET':
        return jsonify({
            'feishu_notify_enabled': get_setting('FEISHU_NOTIFY_ENABLED', False),
            'feishu_webhook_url': get_setting('FEISHU_WEBHOOK_URL', ''),
            'vpn_session_history_max': get_setting('VPN_SESSION_HISTORY_MAX', '5000'),
            'vpn_session_history_page_size': get_setting('VPN_SESSION_HISTORY_PAGE_SIZE', '50'),
            'vpn_active_window_sec': get_setting('VPN_ACTIVE_WINDOW_SEC', '60'),
        })

    data = request.get_json() or {}
    if 'feishu_notify_enabled' in data:
        value = bool(data['feishu_notify_enabled'])
        app.config['FEISHU_NOTIFY_ENABLED'] = value
        save_setting_to_db('FEISHU_NOTIFY_ENABLED', str(value))
    if 'feishu_webhook_url' in data:
        value = data['feishu_webhook_url']
        app.config['FEISHU_WEBHOOK_URL'] = value
        save_setting_to_db('FEISHU_WEBHOOK_URL', value)
    # VPN 设置（仅写库，不影响 app.config：traffic_sync 每次都从 settings 读最新值）
    if 'vpn_session_history_max' in data:
        v = int(data['vpn_session_history_max'])
        if v < 0:
            return jsonify({'success': False, 'error': 'vpn_session_history_max 必须 ≥ 0'}), 400
        save_setting_to_db('VPN_SESSION_HISTORY_MAX', str(v))
    if 'vpn_session_history_page_size' in data:
        v = int(data['vpn_session_history_page_size'])
        if v < 1:
            return jsonify({'success': False, 'error': 'vpn_session_history_page_size 必须 ≥ 1'}), 400
        save_setting_to_db('VPN_SESSION_HISTORY_PAGE_SIZE', str(v))
    if 'vpn_active_window_sec' in data:
        v = int(data['vpn_active_window_sec'])
        if v < 10:
            return jsonify({'success': False, 'error': 'vpn_active_window_sec 必须 ≥ 10'}), 400
        save_setting_to_db('VPN_ACTIVE_WINDOW_SEC', str(v))

    # 设置写完后，按需触发服务重启：让 traffic_sync 守护进程立刻加载新值。
    # 用 sudo -n 强校验（不弹密码），agent 跑在有 NOPASSWD sudoers 的账号上。
    # 注意：systemd 服务 Environment="PATH=.../venv/bin" 覆盖了默认 PATH，
    # 所以必须用绝对路径 /usr/bin/sudo（which sudo 指向 /bin/sudo，但 PATH 里没有）。
    if data.get('restart') is True:
        # 异步触发重启：用 Popen 启动后立即返回，不等子进程退出。
        # 原因：systemctl restart 会先 SIGTERM 当前 gunicorn worker，
        # 此时 subprocess.run 拿不到 returncode 会触发 TimeoutExpired，
        # 但 systemd 仍会完成 stop→start，新实例会正常起来。
        # 异步启动可避免 gunicorn worker 被自己杀掉前能返回 OK 响应。
        try:
            subprocess.Popen(
                ['/usr/bin/sudo', '-n', '/usr/bin/systemctl', 'restart', 'personal-website'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,  # 脱离父进程，避免一起被 SIGTERM
            )
            log.info("[admin-settings] restart triggered (async)")
        except Exception as e:
            log.error(f"[admin-settings] restart trigger failed: {e}")
            return jsonify({
                'success': False, 'restarted': False,
                'error': f'重启失败: {e}',
            }), 500
        return jsonify({'success': True, 'restarted': True})

    return jsonify({'success': True, 'restarted': False})


@app.route('/api/admin/accounts', methods=['GET'])
@admin_required
def admin_list_accounts():
    """List all admin accounts."""
    conn = get_db()
    accounts = conn.execute(
        'SELECT id, username, created_at FROM accounts ORDER BY id'
    ).fetchall()
    conn.close()
    return jsonify({
        'accounts': [dict(a) for a in accounts]
    })


@app.route('/api/admin/accounts', methods=['POST'])
@admin_required
def admin_add_account():
    """Add a new admin account."""
    from werkzeug.security import generate_password_hash
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or not password:
        return jsonify({'success': False, 'error': '用户名和密码不能为空'}), 400
    if len(password) < 4:
        return jsonify({'success': False, 'error': '密码至少4个字符'}), 400
    conn = get_db()
    try:
        conn.execute(
            'INSERT INTO accounts (username, password_hash) VALUES (?, ?)',
            (username, generate_password_hash(password))
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'error': '用户名已存在'}), 400
    conn.close()
    return jsonify({'success': True})


@app.route('/api/admin/accounts/<int:account_id>', methods=['DELETE'])
@admin_required
def admin_delete_account(account_id):
    """Delete an admin account."""
    conn = get_db()
    # Prevent deleting the last account
    count = conn.execute('SELECT COUNT(*) as cnt FROM accounts').fetchone()['cnt']
    if count <= 1:
        conn.close()
        return jsonify({'success': False, 'error': '不能删除最后一个账户'}), 400
    account = conn.execute('SELECT username FROM accounts WHERE id = ?', (account_id,)).fetchone()
    # Prevent deleting currently logged-in account
    if account and account['username'] == session.get('admin_username'):
        conn.close()
        return jsonify({'success': False, 'error': '不能删除当前登录账户'}), 400
    conn.execute('DELETE FROM accounts WHERE id = ?', (account_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


# =============================================================================
# Routes - Anniversary
# =============================================================================

@app.route('/anniversary')
@admin_required
def anniversary_page():
    """Anniversary page (login required)."""
    return render_template('anniversary.html')


@app.route('/api/anniversary', methods=['POST'])
@admin_required
def create_anniversary():
    """Create a new anniversary."""
    data = request.get_json()
    name = data.get('name', '').strip()
    anniv_date = data.get('date', '').strip()
    description = data.get('description', '').strip()
    emoji = data.get('emoji', '💕').strip()

    if not name:
        return jsonify({'error': '名称不能为空'}), 400
    if not anniv_date:
        return jsonify({'error': '日期不能为空'}), 400

    # Validate date format
    try:
        datetime.strptime(anniv_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': '日期格式错误，请使用 YYYY-MM-DD'}), 400

    conn = get_db()
    try:
        cursor = conn.execute(
            'INSERT INTO anniversaries (name, date, description, emoji) VALUES (?, ?, ?, ?)',
            (name, anniv_date, description, emoji or '💕')
        )
        conn.commit()
        new_id = cursor.lastrowid
        row = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (new_id,)).fetchone()
        return jsonify(dict(row))
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>', methods=['PUT'])
@admin_required
def update_anniversary(anniv_id):
    """Update an existing anniversary."""
    data = request.get_json()
    name = data.get('name', '').strip()
    anniv_date = data.get('date', '').strip()
    description = data.get('description', '').strip()
    emoji = data.get('emoji', '').strip()

    if not name:
        return jsonify({'error': '名称不能为空'}), 400
    if not anniv_date:
        return jsonify({'error': '日期不能为空'}), 400

    try:
        datetime.strptime(anniv_date, '%Y-%m-%d')
    except ValueError:
        return jsonify({'error': '日期格式错误，请使用 YYYY-MM-DD'}), 400

    conn = get_db()
    try:
        existing = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        if not existing:
            return jsonify({'error': '纪念日不存在'}), 404

        conn.execute(
            '''UPDATE anniversaries SET name=?, date=?, description=?, emoji=?, updated_at=CURRENT_TIMESTAMP
               WHERE id=?''',
            (name, anniv_date, description, emoji or existing['emoji'], anniv_id)
        )
        conn.commit()
        row = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        return jsonify(dict(row))
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>', methods=['DELETE'])
@admin_required
def delete_anniversary(anniv_id):
    """Delete an anniversary and its rules."""
    conn = get_db()
    try:
        existing = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        if not existing:
            return jsonify({'error': '纪念日不存在'}), 404

        conn.execute('DELETE FROM reminder_rules WHERE anniversary_id = ?', (anniv_id,))
        conn.execute('DELETE FROM anniversaries WHERE id = ?', (anniv_id,))
        conn.commit()
        return jsonify({'success': True})
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>/rules', methods=['GET'])
@admin_required
def list_rules(anniv_id):
    """List all reminder rules for an anniversary."""
    conn = get_db()
    try:
        anniv = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        if not anniv:
            return jsonify({'error': '纪念日不存在'}), 404
        rules = conn.execute(
            'SELECT * FROM reminder_rules WHERE anniversary_id = ? ORDER BY id', (anniv_id,)
        ).fetchall()
        return jsonify({'rules': [dict(r) for r in rules]})
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>/rule', methods=['POST'])
@admin_required
def create_rule(anniv_id):
    """Add a reminder rule to an anniversary."""
    conn = get_db()
    try:
        anniv = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        if not anniv:
            return jsonify({'error': '纪念日不存在'}), 404

        data = request.get_json()
        expression = data.get('expression', '').strip()
        enabled = data.get('enabled', True)

        if not expression:
            return jsonify({'error': '表达式不能为空'}), 400

        is_valid, err_msg = validate_rule_expression(expression)
        if not is_valid:
            return jsonify({'error': err_msg}), 400

        rule_type = rule_type_from_expression(expression)

        cursor = conn.execute(
            'INSERT INTO reminder_rules (anniversary_id, rule_type, expression, enabled) VALUES (?, ?, ?, ?)',
            (anniv_id, rule_type, expression, 1 if enabled else 0)
        )
        conn.commit()
        new_id = cursor.lastrowid
        row = conn.execute('SELECT * FROM reminder_rules WHERE id = ?', (new_id,)).fetchone()
        return jsonify(dict(row))
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>/rule/<int:rule_id>', methods=['PUT'])
@admin_required
def update_rule(anniv_id, rule_id):
    """Update a reminder rule."""
    conn = get_db()
    try:
        rule = conn.execute(
            'SELECT * FROM reminder_rules WHERE id = ? AND anniversary_id = ?',
            (rule_id, anniv_id)
        ).fetchone()
        if not rule:
            return jsonify({'error': '规则不存在'}), 404

        data = request.get_json()
        expression = data.get('expression', '').strip()
        enabled = data.get('enabled', rule['enabled'])

        if not expression:
            return jsonify({'error': '表达式不能为空'}), 400

        is_valid, err_msg = validate_rule_expression(expression)
        if not is_valid:
            return jsonify({'error': err_msg}), 400

        rule_type = rule_type_from_expression(expression)

        conn.execute(
            'UPDATE reminder_rules SET rule_type=?, expression=?, enabled=? WHERE id=?',
            (rule_type, expression, 1 if enabled else 0, rule_id)
        )
        conn.commit()
        row = conn.execute('SELECT * FROM reminder_rules WHERE id = ?', (rule_id,)).fetchone()
        return jsonify(dict(row))
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>/rule/<int:rule_id>', methods=['DELETE'])
@admin_required
def delete_rule(anniv_id, rule_id):
    """Delete a reminder rule."""
    conn = get_db()
    try:
        rule = conn.execute(
            'SELECT * FROM reminder_rules WHERE id = ? AND anniversary_id = ?',
            (rule_id, anniv_id)
        ).fetchone()
        if not rule:
            return jsonify({'error': '规则不存在'}), 404

        conn.execute('DELETE FROM reminder_rules WHERE id = ?', (rule_id,))
        conn.commit()
        return jsonify({'success': True})
    finally:
        conn.close()


@app.route('/api/anniversary/<int:anniv_id>/notify', methods=['POST'])
@admin_required
def manual_notify(anniv_id):
    """Manually send a Feishu notification for an anniversary."""
    conn = get_db()
    try:
        anniv = conn.execute('SELECT * FROM anniversaries WHERE id = ?', (anniv_id,)).fetchone()
        if not anniv:
            return jsonify({'error': '纪念日不存在'}), 404

        # Use anniversary_day type — consistent with run_anniversary_check's
        # anniversary-day path. Shows contextual message based on today's date:
        #   - On anniversary day: "今天是X纪念日"
        #   - Before anniversary: "距离X还有 N 天"
        #   - After anniversary:  "X已经 N 天"
        emoji = anniv['emoji'] or '💕'
        message = build_anniversary_message(anniv['name'], anniv['date'], 'anniversary_day', {}, emoji)
        success = send_anniversary_feishu(message)
        return jsonify({'success': success, 'message': message})
    except Exception as e:
        app.logger.error(f"manual_notify error: {e}", exc_info=True)
        return jsonify({'error': f'通知发送失败: {str(e)}'}), 500
    finally:
        conn.close()


def run_anniversary_check():
    """Check all anniversaries and rules for today, send Feishu notifications.

    Shared logic used by both the /api/anniversary/check endpoint (manual/cron HTTP)
    and scripts/check_anniversaries.py (standalone cron job).

    Must be called within a Flask app context (uses get_db).

    Returns:
        tuple: (triggered_list, today_str)
    """
    today = date.today()
    today_str = today.isoformat()
    triggered = []

    conn = get_db()
    try:
        anniversaries = conn.execute('SELECT * FROM anniversaries').fetchall()

        for anniv in anniversaries:
            anniv_date = datetime.strptime(anniv['date'], '%Y-%m-%d').date()

            # Check if today IS the anniversary day (month and day match)
            if anniv_date.month == today.month and anniv_date.day == today.day:
                emoji = anniv['emoji'] or '💕'
                message = build_anniversary_message(anniv['name'], anniv['date'], 'anniversary_day', {}, emoji)
                send_anniversary_feishu(message)
                triggered.append({
                    'anniversary_id': anniv['id'],
                    'name': anniv['name'],
                    'type': 'anniversary_day',
                })

            # Check all enabled rules
            rules = conn.execute(
                'SELECT * FROM reminder_rules WHERE anniversary_id = ? AND enabled = 1',
                (anniv['id'],)
            ).fetchall()

            for rule in rules:
                matches, msg_type, context = check_rule_matches_today(
                    rule['expression'], anniv_date, today
                )
                if matches:
                    emoji = anniv['emoji'] or '💕'
                    # monthly:* rules don't depend on the actual anniversary date —
                    # their trigger target is a virtual "day D of this/next month".
                    # Pass the trigger target_date as the fake anniversary so
                    # build_anniversary_message yields correct "今天/还有N天" wording.
                    # Falls back to today if context lacks target_date.
                    if rule['expression'].startswith('monthly:'):
                        anniv_date_str = (context or {}).get('target_date') or today_str
                    else:
                        anniv_date_str = anniv['date']
                    message = build_anniversary_message(anniv['name'], anniv_date_str, msg_type, context, emoji)
                    send_anniversary_feishu(message)

                    # Update last_triggered
                    conn.execute(
                        'UPDATE reminder_rules SET last_triggered = ? WHERE id = ?',
                        (today_str, rule['id'])
                    )

                    triggered.append({
                        'anniversary_id': anniv['id'],
                        'name': anniv['name'],
                        'rule_id': rule['id'],
                        'type': msg_type,
                        'expression': rule['expression'],
                    })

        conn.commit()
    finally:
        conn.close()

    return triggered, today_str


@app.route('/api/anniversary/check', methods=['POST'])
def check_anniversaries():
    """Check all anniversaries and rules for today. Called by cron daily at 00:00.

    Can be called without auth (for cron), but validates a shared secret if configured.
    """
    triggered, today_str = run_anniversary_check()
    return jsonify({'triggered': triggered, 'date': today_str})


@app.route('/api/anniversary/list', methods=['GET'])
@admin_required
def list_anniversaries():
    """List all anniversaries with their rules."""
    conn = get_db()
    try:
        anniversaries = conn.execute('SELECT * FROM anniversaries ORDER BY date ASC').fetchall()
        result = []
        for anniv in anniversaries:
            rules = conn.execute(
                'SELECT * FROM reminder_rules WHERE anniversary_id = ? ORDER BY id',
                (anniv['id'],)
            ).fetchall()
            anniv_dict = dict(anniv)
            anniv_date = datetime.strptime(anniv['date'], '%Y-%m-%d').date()
            today = date.today()
            anniv_dict['days_passed'] = (today - anniv_date).days
            anniv_dict['rules'] = [dict(r) for r in rules]
            result.append(anniv_dict)
        return jsonify({'anniversaries': result})
    finally:
        conn.close()


# =============================================================================
# Anniversary Check Time Configuration
# =============================================================================

def update_anniversary_crontab(check_time):
    """Update the system crontab for the anniversary check job.

    Removes any existing check_anniversaries.py line, then adds a new one
    if check_time is provided.  Cron only supports minute precision, so
    the seconds portion of check_time is ignored.
    """
    # 1. Read current crontab
    result = subprocess.run(['/usr/bin/crontab', '-l'], capture_output=True, text=True)
    current_crontab = result.stdout if result.returncode == 0 else ''

    # 2. Remove old anniversary check lines
    lines = [line for line in current_crontab.split('\n') if 'check_anniversaries.py' not in line]

    # 3. Add new cron line if check_time is set
    if check_time:
        parts = check_time.split(':')
        hour = int(parts[0])
        minute = int(parts[1])
        project_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(project_dir, 'scripts', 'check_anniversaries.py')
        venv_python = os.path.join(project_dir, 'venv', 'bin', 'python3')
        cron_line = (
            f"{minute} {hour} * * * cd {project_dir} && "
            f"{venv_python} {script_path} >> data/anniversary_check.log 2>&1"
        )
        lines.append(cron_line)

    # 4. Write back
    new_crontab = '\n'.join(lines).strip() + '\n'
    process = subprocess.Popen(['/usr/bin/crontab', '-'], stdin=subprocess.PIPE, text=True)
    process.communicate(input=new_crontab)


def _has_anniversary_cron():
    """Check whether the current crontab contains an anniversary check entry."""
    try:
        result = subprocess.run(['/usr/bin/crontab', '-l'], capture_output=True, text=True)
        if result.returncode == 0:
            return any('check_anniversaries.py' in line for line in result.stdout.split('\n'))
    except Exception:
        pass
    return False


@app.route('/api/admin/anniversary-check-time', methods=['GET'])
@admin_required
def get_anniversary_check_time():
    """Return the configured anniversary check time and cron status."""
    check_time = get_setting('ANNIVERSARY_CHECK_TIME', None)
    return jsonify({
        'check_time': check_time,
        'cron_active': _has_anniversary_cron(),
    })


@app.route('/api/admin/anniversary-check-time', methods=['POST'])
@admin_required
def set_anniversary_check_time():
    """Set the anniversary check time and update system crontab."""
    data = request.get_json()
    check_time = data.get('check_time', '').strip() if data.get('check_time') else ''

    if check_time:
        # Validate HH:MM:SS or HH:MM format
        if not re.match(r'^\d{1,2}:\d{2}(:\d{2})?$', check_time):
            return jsonify({'error': '时间格式错误，请使用 HH:MM 或 HH:MM:SS'}), 400
        parts = check_time.split(':')
        hour, minute = int(parts[0]), int(parts[1])
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return jsonify({'error': '时间超出有效范围'}), 400
        # Normalize to HH:MM:SS
        second = int(parts[2]) if len(parts) > 2 else 0
        check_time = f"{hour:02d}:{minute:02d}:{second:02d}"

    try:
        if check_time:
            save_setting_to_db('ANNIVERSARY_CHECK_TIME', check_time)
        else:
            # Remove the setting when cancelling
            conn = get_db()
            conn.execute('DELETE FROM settings WHERE key = ?', ('ANNIVERSARY_CHECK_TIME',))
            conn.commit()
            conn.close()
            with _settings_cache_lock:
                _settings_cache.pop('ANNIVERSARY_CHECK_TIME', None)

        update_anniversary_crontab(check_time)

        return jsonify({
            'success': True,
            'check_time': check_time if check_time else None,
            'cron_active': _has_anniversary_cron(),
        })
    except Exception as e:
        app.logger.error(f"Failed to update anniversary check time: {e}", exc_info=True)
        return jsonify({'error': f'更新失败: {str(e)}'}), 500


# =============================================================================
# Routes - VPN (migrated from vpn-server, gated by @admin_required)
# =============================================================================

def _vpn_get_user_by_id(user_id):
    conn = get_db()
    try:
        return conn.execute('SELECT * FROM vpn_users WHERE id = ?', (user_id,)).fetchone()
    finally:
        conn.close()


def _vpn_get_user_by_username(username):
    conn = get_db()
    try:
        return conn.execute('SELECT * FROM vpn_users WHERE username = ?', (username,)).fetchone()
    finally:
        conn.close()


def _vpn_get_user_by_uuid(uuid_str):
    conn = get_db()
    try:
        return conn.execute('SELECT * FROM vpn_users WHERE uuid = ?', (uuid_str,)).fetchone()
    finally:
        conn.close()


def _vpn_list_users():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT u.*, t.total_upload, t.total_download, t.last_sync_at
            FROM vpn_users u
            LEFT JOIN vpn_traffic_records t ON t.user_id = u.id
            ORDER BY u.created_at DESC
        """).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def _vpn_create_user(username, password, is_admin=False, remark=None,
                     traffic_limit_bytes=None, speed_limit_bps=None):
    import uuid as _uuid
    from werkzeug.security import generate_password_hash
    conn = get_db()
    try:
        if conn.execute('SELECT 1 FROM vpn_users WHERE username = ?', (username,)).fetchone():
            raise ValueError(f'用户名 {username} 已存在')
        new_uuid = str(_uuid.uuid4())
        ph = generate_password_hash(password)
        cur = conn.execute(
            """INSERT INTO vpn_users
                   (username, password_hash, uuid, is_admin, enabled, created_at,
                    remark, traffic_limit_bytes, speed_limit_bps)
               VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)""",
            (username, ph, new_uuid, 1 if is_admin else 0, int(time.time()),
             remark, traffic_limit_bytes, speed_limit_bps),
        )
        user_id = cur.lastrowid
        conn.execute(
            """INSERT INTO vpn_traffic_records (user_id, total_upload, total_download, last_sync_at)
               VALUES (?, 0, 0, ?)""",
            (user_id, int(time.time())),
        )
        conn.commit()
        return {'id': user_id, 'username': username, 'uuid': new_uuid,
                'is_admin': is_admin, 'password': password}
    finally:
        conn.close()


@app.route('/vpn/')
@admin_required
def vpn_index():
    """VPN 概览 — 总用户、累计流量、活跃用户、xray 状态"""
    conn = get_db()
    try:
        total_users = conn.execute('SELECT COUNT(*) AS cnt FROM vpn_users').fetchone()['cnt']
        enabled_users = conn.execute('SELECT COUNT(*) AS cnt FROM vpn_users WHERE enabled = 1').fetchone()['cnt']
        up_down = conn.execute(
            'SELECT COALESCE(SUM(total_upload), 0) AS up, '
            'COALESCE(SUM(total_download), 0) AS dn FROM vpn_traffic_records'
        ).fetchone()
        stats = {
            'total_users': total_users,
            'enabled_users': enabled_users,
            'total_up': up_down['up'] or 0,
            'total_dn': up_down['dn'] or 0,
        }
    finally:
        conn.close()
    import traffic_sync
    import xray_client
    active = traffic_sync.get_active_users()
    return render_template('vpn/index.html', stats=stats, active_count=len(active),
                           xray_ok=xray_client.test_connection(),
                           xray_addr=xray_client.XRAY_API_ADDR)


@app.route('/vpn/users')
@admin_required
def vpn_users():
    return render_template('vpn/users.html', users=_vpn_list_users())


@app.route('/vpn/subscriptions')
@admin_required
def vpn_subscriptions():
    """订阅链接管理页：列出所有启用的 vpn 用户 + 完整订阅链接 + 复制按钮 + 二维码"""
    conn = get_db()
    try:
        users = conn.execute(
            'SELECT id, username, uuid, remark FROM vpn_users WHERE enabled=1 ORDER BY id'
        ).fetchall()
    finally:
        conn.close()
    host = request.host_url.rstrip('/')
    items = []
    for u in users:
        uuid = u['uuid']
        items.append({
            'username': u['username'],
            'remark': u['remark'] or '',
            'uuid': uuid,
            'base64_url': f'{host}/vpn/sub/{uuid}?format=base64',
            'clash_url': f'{host}/vpn/sub/{uuid}?format=clash',
            'qr_url': f'{host}/vpn/sub/{uuid}/qr',
        })
    return render_template('vpn/subscriptions.html', items=items, host=request.host)


@app.route('/vpn/users/add', methods=['POST'])
@admin_required
def vpn_users_add():
    username = request.form.get('username', '').strip()
    password = request.form.get('password', '').strip()
    remark = request.form.get('remark', '').strip() or None
    tl_str = request.form.get('traffic_limit_gb', '').strip()
    sl_str = request.form.get('speed_mbps', '').strip()
    is_admin = bool(request.form.get('is_admin'))
    if not username or not password:
        flash('用户名/密码不能为空', 'error')
        return redirect(url_for('vpn_users'))
    if len(password) < 6:
        flash('密码至少 6 位', 'error')
        return redirect(url_for('vpn_users'))
    try:
        tl_bytes = int(float(tl_str) * 1024 ** 3) if tl_str else None
        sl_bps = int(float(sl_str) * 1024 * 1024 / 8) if sl_str else None
        info = _vpn_create_user(username, password, is_admin=is_admin, remark=remark,
                                traffic_limit_bytes=tl_bytes, speed_limit_bps=sl_bps)
        import xray_client
        if not xray_client.add_user(info['uuid'], info['username']):
            flash(f'⚠️ 用户 {username} 已写入 DB，但同步到 Xray 失败', 'error')
        else:
            flash(f'已创建 {username} / 密码 {password} / UUID {info["uuid"]}', 'success')
    except ValueError as e:
        flash(str(e), 'error')
    except Exception as e:
        app.logger.exception('vpn add user failed')
        flash(f'创建失败: {e}', 'error')
    return redirect(url_for('vpn_users'))


@app.route('/vpn/users/<int:user_id>/toggle', methods=['POST'])
@admin_required
def vpn_users_toggle(user_id):
    u = _vpn_get_user_by_id(user_id)
    if not u:
        flash('用户不存在', 'error')
        return redirect(url_for('vpn_users'))
    new_state = not u['enabled']
    conn = get_db()
    try:
        conn.execute('UPDATE vpn_users SET enabled = ? WHERE id = ?', (1 if new_state else 0, user_id))
        conn.commit()
    finally:
        conn.close()
    import xray_client
    if new_state:
        xray_client.add_user(u['uuid'], u['username'])
    else:
        xray_client.remove_user(u['username'])
    flash(f'用户已{"启用" if new_state else "禁用"}', 'success')
    return redirect(url_for('vpn_users'))


@app.route('/vpn/users/<int:user_id>/delete', methods=['POST'])
@admin_required
def vpn_users_delete(user_id):
    u = _vpn_get_user_by_id(user_id)
    if not u:
        flash('用户不存在', 'error')
        return redirect(url_for('vpn_users'))
    import xray_client
    xray_client.remove_user(u['username'])
    conn = get_db()
    try:
        conn.execute('DELETE FROM vpn_users WHERE id = ?', (user_id,))
        conn.commit()
    finally:
        conn.close()
    flash('已删除', 'success')
    return redirect(url_for('vpn_users'))


@app.route('/vpn/users/<int:user_id>/reset', methods=['POST'])
@admin_required
def vpn_users_reset(user_id):
    conn = get_db()
    try:
        conn.execute(
            'UPDATE vpn_traffic_records SET total_upload=0, total_download=0, last_sync_at=? WHERE user_id=?',
            (int(time.time()), user_id),
        )
        conn.commit()
    finally:
        conn.close()
    flash('流量已重置', 'success')
    return redirect(url_for('vpn_users'))


@app.route('/vpn/users/<int:user_id>/limit', methods=['POST'])
@admin_required
def vpn_users_limit(user_id):
    tl_str = request.form.get('traffic_limit_gb', '').strip()
    sl_str = request.form.get('speed_mbps', '').strip()
    tl_bytes = int(float(tl_str) * 1024 ** 3) if tl_str else None
    sl_bps = int(float(sl_str) * 1024 * 1024 / 8) if sl_str else None
    conn = get_db()
    try:
        conn.execute('UPDATE vpn_users SET traffic_limit_bytes=?, speed_limit_bps=? WHERE id=?',
                     (tl_bytes, sl_bps, user_id))
        conn.commit()
    finally:
        conn.close()
    flash('限制已更新', 'success')
    return redirect(url_for('vpn_users'))


@app.route('/vpn/traffic')
@admin_required
def vpn_traffic():
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT u.id, u.username, u.uuid, u.is_admin, u.enabled,
                   t.total_upload, t.total_download, t.last_sync_at
            FROM vpn_users u
            LEFT JOIN vpn_traffic_records t ON t.user_id = u.id
            ORDER BY (COALESCE(t.total_upload, 0) + COALESCE(t.total_download, 0)) DESC
        """).fetchall()
    finally:
        conn.close()
    return render_template('vpn/traffic.html', rows=rows)


@app.route('/vpn/connections')
@admin_required
def vpn_connections():
    """在线终端页：每个活跃用户的会话详情
    数据来源：traffic_sync.get_active_sessions() —— 内部根据流量增量推断会话起点
    附加：IP + 地理位置来自 vpn_users.last_ip + vpn_ip_geo（access log tailer + geo-sync 写入）
    """
    import time as _t
    import traffic_sync
    # 访问即同步：不等 daemon 下一个 60s 周期，立即拉一次 xray 流量
    # 这样用户下线后 ≤1s 打开页面就能看到"已不在在线列表"
    traffic_sync.trigger_sync_now()
    sessions = traffic_sync.get_active_sessions()
    if not sessions:
        return render_template('vpn/connections.html', conns=[], now_ts=int(_t.time()))

    now_ts = int(_t.time())
    usernames = [s['username'] for s in sessions]
    placeholders = ','.join('?' * len(usernames))

    conn = get_db()
    try:
        # 一次性取所有活跃用户的 last_ip + last_seen_at
        rows = conn.execute(
            f'''SELECT username, last_ip, last_seen_at
                FROM vpn_users
                WHERE username IN ({placeholders})''',
            usernames,
        ).fetchall()
        user_map = {r['username']: dict(r) for r in rows}

        # 一次性取所有涉及的 IP 的 geo 信息
        ips_needed = {user_map[u]['last_ip']
                      for u in usernames
                      if user_map.get(u) and user_map[u].get('last_ip')}
        geo_map = {}
        if ips_needed:
            ip_placeholders = ','.join('?' * len(ips_needed))
            geo_rows = conn.execute(
                f'''SELECT ip, country, region, city, isp
                    FROM vpn_ip_geo
                    WHERE ip IN ({ip_placeholders})''',
                list(ips_needed),
            ).fetchall()
            geo_map = {r['ip']: dict(r) for r in geo_rows}
    finally:
        conn.close()

    conns = []
    for s in sessions:
        u = user_map.get(s['username'], {})
        ip = u.get('last_ip')
        geo = geo_map.get(ip) if ip else None
        conns.append({
            'username': s['username'],
            'uuid': s['uuid'],
            'session_start': s['session_start'],
            'session_duration_sec': max(0, now_ts - int(s['session_start'])),
            'session_up': s['session_up'],
            'session_dn': s['session_dn'],
            'total_up': s['total_up'],
            'total_dn': s['total_dn'],
            'last_seen': s['last_seen'],
            'last_ip': ip,
            'last_seen_at': u.get('last_seen_at'),
            'geo': geo,
        })
    return render_template('vpn/connections.html', conns=conns, now_ts=now_ts)


@app.route('/vpn/sessions')
@admin_required
def vpn_session_history():
    """历史终端页：所有已结束会话，按接入时间倒序，支持用户名/IP/日期筛选 + 分页。
    数据来源：vpn_session_history（traffic_sync 每次归档一行）
    IP 地理位置 JOIN vpn_ip_geo（LRU 淘汰后查不到 → 显示 '—'）
    """
    import time as _t
    from datetime import datetime as _dt
    import traffic_sync
    # 访问即同步：触发一次流量同步 + 归档
    # 让"刚下线的用户"在历史终端里立即可见（归档延迟 ≤1s）
    traffic_sync.trigger_sync_now()

    # 解析 query 参数
    try:
        page = max(1, int(request.args.get('page', '1')))
    except (TypeError, ValueError):
        page = 1
    # q 同时匹配 username 和 last_ip（模糊）；保留 user_q 兼容老链接
    q = (request.args.get('q') or '').strip()
    user_q = (request.args.get('user') or '').strip()
    start_q = (request.args.get('start') or '').strip()  # YYYY-MM-DD
    end_q = (request.args.get('end') or '').strip()

    try:
        per_page = max(1, int(get_setting('VPN_SESSION_HISTORY_PAGE_SIZE', 50)))
    except Exception:
        per_page = 50

    # 构造 WHERE
    where = []
    params = []
    if q:
        # 同时模糊匹配用户名和 IP（包含点分片段也能命中）
        where.append('(h.username LIKE ? OR h.last_ip LIKE ?)')
        params.extend([f'%{q}%', f'%{q}%'])
    elif user_q:
        # 旧参数兼容：仅匹配用户名
        where.append('h.username LIKE ?')
        params.append(f'%{user_q}%')
    start_ts = end_ts = None
    if start_q:
        try:
            start_ts = int(_dt.strptime(start_q, '%Y-%m-%d').timestamp())
        except ValueError:
            start_q = ''
    if end_q:
        try:
            # end_q 当天 23:59:59 视为包含
            end_ts = int(_dt.strptime(end_q, '%Y-%m-%d').timestamp()) + 86399
        except ValueError:
            end_q = ''
    if start_ts is not None:
        where.append('h.started_at >= ?')
        params.append(start_ts)
    if end_ts is not None:
        where.append('h.started_at <= ?')
        params.append(end_ts)
    where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''

    conn = get_db()
    try:
        total = conn.execute(
            f'SELECT COUNT(*) AS cnt FROM vpn_session_history h {where_sql}',
            params,
        ).fetchone()['cnt']
        total_pages = max(1, (total + per_page - 1) // per_page)
        if page > total_pages:
            page = total_pages
        offset = (page - 1) * per_page

        # JOIN vpn_ip_geo 拿地理位置（LEFT JOIN，缓存淘汰也不影响主行）
        rows = conn.execute(
            f'''SELECT h.id, h.user_id, h.username, h.uuid,
                       h.started_at, h.ended_at, h.duration_sec,
                       h.session_up, h.session_dn,
                       h.last_ip, h.last_seen_at, h.device,
                       g.country, g.region, g.city, g.isp
                  FROM vpn_session_history h
                  LEFT JOIN vpn_ip_geo g ON g.ip = h.last_ip
                 {where_sql}
                 ORDER BY h.started_at DESC, h.id DESC
                 LIMIT ? OFFSET ?''',
            params + [per_page, offset],
        ).fetchall()
    finally:
        conn.close()

    items = []
    for r in rows:
        geo = None
        if r['country'] or r['city']:
            geo = {
                'country': r['country'] or '',
                'region': r['region'] or '',
                'city': r['city'] or '',
                'isp': r['isp'] or '',
            }
        items.append({
            'id': r['id'],
            'username': r['username'],
            'uuid': r['uuid'] or '',
            'started_at': r['started_at'],
            'ended_at': r['ended_at'],
            'duration_sec': r['duration_sec'],
            'session_up': r['session_up'],
            'session_dn': r['session_dn'],
            'last_ip': r['last_ip'],
            'last_seen_at': r['last_seen_at'],
            'device': r['device'],
            'geo': geo,
        })

    return render_template(
        'vpn/session_history.html',
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
        filters={'q': q, 'user': user_q, 'start': start_q, 'end': end_q},
    )


def _sub_userinfo(user):
    """生成 V2RayN 标准的 Subscription-Userinfo header"""
    conn = get_db()
    try:
        rec = conn.execute(
            'SELECT total_upload, total_download FROM vpn_traffic_records WHERE user_id=?',
            (user['id'],)
        ).fetchone()
    finally:
        conn.close()
    up = rec['total_upload'] if rec else 0
    dn = rec['total_download'] if rec else 0
    limit = user.get('traffic_limit_bytes') or 0
    if limit:
        return f'upload={up}; download={dn}; total={limit}'
    return f'upload={up}; download={dn}'


@app.route('/vpn/sub/<token>')
def vpn_sub(token):
    """订阅输出 — ?format=base64|clash|shadowrocket（无需登录）
    修复：mimetype 不带 charset（Flask 会自动加），否则浏览器/客户端识别成乱码
    """
    user = _vpn_get_user_by_uuid(token)
    if not user or not user['enabled']:
        return ('user not found or disabled', 404)
    fmt = request.args.get('format', 'base64').lower()
    import subscription
    user_dict = dict(user)
    userinfo = _sub_userinfo(user_dict)
    base_headers = {
        'Content-Disposition': 'inline; filename=sub',
        'Profile-Update-Interval': '24',
        'Access-Control-Allow-Origin': '*',
    }
    if userinfo:
        base_headers['Subscription-Userinfo'] = userinfo
    if fmt in ('base64', 'v2ray'):
        content = subscription.gen_base64(user_dict)
        return Response(content, mimetype='application/octet-stream', headers=base_headers)
    elif fmt == 'clash':
        content = subscription.gen_clash(user_dict)
        clash_headers = {**base_headers,
                         'Content-Disposition': 'inline; filename=clash.yaml'}
        return Response(content, mimetype='application/x-yaml', headers=clash_headers)
    elif fmt == 'shadowrocket':
        content = subscription.gen_shadowrocket(user_dict)
        return Response(content, mimetype='application/octet-stream', headers=base_headers)
    return ('unknown format', 400)


@app.route('/vpn/sub/<token>/qr')
def vpn_sub_qr(token):
    user = _vpn_get_user_by_uuid(token)
    if not user or not user['enabled']:
        return ('not found', 404)
    import io
    import qrcode
    import subscription
    url = subscription._vless_uri(dict(user))
    img = qrcode.make(url)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


# =============================================================================
# Traffic sync background thread (started on first request)
# =============================================================================

_traffic_sync_started = False


def _run_traffic_sync():
    """启动 traffic_sync 后台线程（独立 context，避免循环 import）"""
    import os
    interval = int(os.environ.get('TRAFFIC_SYNC_INTERVAL', '60'))
    try:
        import traffic_sync
        traffic_sync.start(interval=interval)
        app.logger.info(f'traffic-sync thread started, interval={interval}s')
    except Exception as e:
        app.logger.error(f'traffic-sync 启动失败: {e}', exc_info=True)


@app.before_request
def _start_traffic_sync_once():
    global _traffic_sync_started
    if not _traffic_sync_started:
        _traffic_sync_started = True
        threading.Thread(target=_run_traffic_sync, daemon=True, name='traffic-sync-bootstrap').start()


# =============================================================================
# Main Entry Point
# =============================================================================

# Initialize database on startup
with app.app_context():
    init_db()
    load_settings_from_db()

if __name__ == '__main__':
    app.run(host=app.config['HOST'], port=app.config['PORT'], debug=False)
