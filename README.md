# Personal Website

一个基于 Flask 构建的极简个人网站，内置俄罗斯方块游戏、访客统计分析、飞书 Webhook 实时通知和管理后台。

## 功能列表

- **首页** — 个人介绍页面，展示访问统计（总访问量 / 今日访问量）
- **游戏中心** — 游戏入口页面
  - **俄罗斯方块** — 完整的 Tetris 游戏，支持键盘和移动端触控操作，带有计分、等级、下一个方块预览
  - **扫雷** — 经典扫雷，支持多种难度
- **养成** — **皇帝养成** 模拟
- **经济** — 黄金价格监控（人民币 CNY）、汇率查询
- **纪念日** — 纪念日管理（带飞书通知、自动检测 cron）
- **代理 (VPN)** — 自部署 Xray VLESS Reality 面板
  - 用户管理（增删改、流量限额、启停）
  - 流量统计 + 在线终端（实时会话）
  - **历史终端**（已结束会话记录）
  - 订阅链接（V2RayN / Shadowrocket base64）
- **访客统计与分析** — 自动记录每位访客的 IP、地理位置、浏览器、操作系统、访问页面、来源等，管理后台提供 7 天趋势图表和 TOP 页面排行
- **飞书 Webhook 通知** — 有新访客时，通过飞书机器人发送卡片消息通知（内置 IP 频率限制，同一 IP 5 分钟内只通知一次）
- **管理后台** — 账户管理（增删账户）、飞书通知开关与 Webhook URL 设置（持久化到数据库）、访客日志（支持按 IP/页面筛选和分页）

## 技术栈

| 组件 | 说明 |
|------|------|
| **Flask** | Web 框架 |
| **SQLite** | 轻量级嵌入式数据库，存储访客记录、账户和配置 |
| **Gunicorn** | 生产级 WSGI 服务器（4 worker） |
| **user-agents** | 解析 User-Agent 字符串，提取浏览器和操作系统信息 |
| **ip-api.com** | 免费的 IP 地理位置查询 API |
| **Chart.js** | 管理后台访问趋势图表（CDN 加载） |
| **Flask-CORS** | 跨域请求支持 |

## 项目结构

```
personal-website/
├── app.py                      # Flask 主应用（路由、访客追踪、飞书通知、管理 API）
├── config.py                   # 配置管理（从 .env 读取环境变量）
├── start.sh                    # 启动脚本（激活 venv 后执行 gunicorn）
├── personal-website.service    # systemd 服务单元文件
├── .env                        # 环境变量配置文件（不提交到版本控制）
├── data/
│   └── visitors.db             # SQLite 数据库文件（自动创建）
├── scripts/
│   └── check_anniversaries.py  # 独立纪念日检测脚本（由 crontab 调用）
├── templates/
│   ├── index.html              # 首页模板
│   ├── games.html              # 游戏中心页面
│   ├── tetris.html             # 俄罗斯方块游戏页面
│   └── admin.html              # 管理后台页面（登录 + 仪表盘）
├── static/
│   ├── css/
│   │   └── style.css           # 全局样式（暗色主题，支持明/暗切换）
│   ├── js/
│   │   ├── main.js             # 公共脚本（主题切换、统计数字加载）
│   │   ├── tetris.js           # 俄罗斯方块游戏逻辑
│   │   └── admin.js            # 管理后台前端逻辑
│   ├── robots.txt              # 搜索引擎爬虫规则
│   └── sitemap.xml             # 站点地图
└── venv/                       # Python 虚拟环境
```

## 部署与启动

### 快速启动

```bash
cd personal-website
source venv/bin/activate
gunicorn -w 4 -b 0.0.0.0:80 app:app
```

或直接使用启动脚本：

```bash
./start.sh
```

### systemd 服务（生产环境）

```bash
# 复制 service 文件
sudo cp personal-website.service /etc/systemd/system/

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable personal-website
sudo systemctl start personal-website

# 查看状态
sudo systemctl status personal-website

# 查看日志
sudo journalctl -u personal-website -f
```

### 依赖安装

```bash
python3 -m venv venv
source venv/bin/activate
pip install flask flask-cors gunicorn requests user-agents python-dotenv
```

## API 端点

### 公开接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 首页 |
| GET | `/games` | 游戏中心 |
| GET | `/games/tetris` | 俄罗斯方块 |
| GET | `/api/stats` | 公开访问统计（返回 `total` 和 `today`） |
| GET | `/robots.txt` | 爬虫规则 |
| GET | `/sitemap.xml` | 站点地图 |

### 管理接口（需登录）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/admin` | 管理后台页面（登录/仪表盘） |
| POST | `/admin/login` | 登录（JSON: `username`, `password`） |
| POST | `/admin/logout` | 退出登录 |
| GET | `/admin/dashboard` | 仪表盘页面 |
| GET | `/api/admin/stats` | 详细统计（总量、独立访客、7 天趋势、TOP 页面） |
| GET | `/api/admin/visits` | 访客日志（支持 `page`, `per_page`, `ip`, `page_filter` 参数） |
| GET | `/api/admin/settings` | 获取当前通知设置 |
| POST | `/api/admin/settings` | 更新通知设置（JSON: `feishu_notify_enabled`, `feishu_webhook_url`） |
| GET | `/api/admin/accounts` | 账户列表 |
| POST | `/api/admin/accounts` | 添加账户（JSON: `username`, `password`） |
| DELETE | `/api/admin/accounts/<id>` | 删除账户 |
| GET | `/api/admin/anniversary-check-time` | 获取纪念日检测时间配置 |
| POST | `/api/admin/anniversary-check-time` | 设置检测时间（JSON: `check_time`），自动更新系统 crontab |

## 配置说明

所有配置通过项目根目录下的 `.env` 文件管理：

```env
# Flask 密钥（用于 session 加密，生产环境务必修改）
SECRET_KEY=your-secret-key-here

# 运行环境
FLASK_ENV=production

# 服务器绑定地址和端口
HOST=0.0.0.0
PORT=80

# 默认管理员密码（仅首次初始化时使用，之后通过后台管理）
ADMIN_PASSWORD=your-password

# 飞书 Webhook 通知
FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/your-hook-id
FEISHU_NOTIFY_ENABLED=false

# 数据库文件路径
DATABASE_PATH=data/visitors.db
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `SECRET_KEY` | Flask session 加密密钥 | `dev-secret-key-change-in-production` |
| `FLASK_ENV` | 运行环境 | `development` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `PORT` | 监听端口 | `80` |
| `ADMIN_PASSWORD` | 初始管理员密码 | `admin123` |
| `FEISHU_WEBHOOK_URL` | 飞书机器人 Webhook 地址 | placeholder URL |
| `FEISHU_NOTIFY_ENABLED` | 是否启用飞书通知 | `false` |
| `DATABASE_PATH` | SQLite 数据库路径 | `data/visitors.db` |

> **注意：** 飞书通知设置（开关和 Webhook URL）在管理后台修改后会持久化到数据库，重启服务不会丢失。`.env` 中的值仅作为初始默认值。

## 默认账户

首次启动时自动创建默认管理员账户：

- 用户名：`yulei`
- 密码：`yulei`

请在首次登录后通过管理后台添加新账户并删除默认账户。

## 纪念日自动检测

系统支持通过管理后台配置每天自动检测纪念日并发送飞书通知的时间。

- **配置方式**：管理后台 → 纪念日检测时间 → 选择时间 → 保存
- **实现原理**：设置时间后，后端自动更新系统 crontab，在指定时间运行 `scripts/check_anniversaries.py`
- **脚本独立运行**：`check_anniversaries.py` 是独立脚本，通过 `import app` 复用检测逻辑，不依赖 Flask 请求上下文
- **日志输出**：脚本执行日志追加写入 `data/anniversary_check.log`

手动运行测试：
```bash
cd personal-website
python3 scripts/check_anniversaries.py
```

## 更新日志

### 2026-06-16 — UI 文案"VPN"→"代理" + 导航栏高亮 bug 修复

- **UI 文案调整**：将用户在浏览器里能看到的"VPN"全部改为"代理"
  - 所有页面的顶部导航栏 tab 文字：`<a href="/vpn/">VPN</a>` → `<a href="/vpn/">代理</a>`
  - VPN 子页面的 `<title>` 和 `{% block page_title %}`：`VPN 概览/用户/订阅链接/流量统计/管理` → `代理 概览/用户/订阅链接/流量统计/管理`
  - 管理后台首页的"VPN 管理"入口卡片标题、说明、按钮文字 → "代理 管理"
  - 影响文件：`templates/index.html`、`templates/admin.html`、`templates/games.html`、`templates/raise.html`、`templates/economy.html`、`templates/anniversary.html`、`templates/tetris.html`、`templates/minesweeper.html`、`templates/emperor.html`、`templates/vpn/{base,index,users,subscriptions,traffic}.html`
  - **未改动的部分**（按方案 A 约束）：
    - URL 路径 `/vpn/` 保持不变
    - Flask endpoint 名 `vpn_index` / `vpn_users` / `vpn_subscriptions` / `vpn_traffic` / `vpn_connections` / `vpn_sub` 等保持不变
    - 数据库表名 `vpn_users` / `vpn_traffic_records` / `vpn_login_logs` 保持不变（`vpn_invite_codes` 已废弃，启动时自动 DROP）
    - Python 变量/函数/类/日志前缀（如 `_vpn_filesize`、注释里的"VPN tables"等）保持不变
    - 环境变量名 `VPN_XRAY_GRPC` / `VPN_SRC_DB`、`MyVPN` 默认名、订阅路径 `templates/vpn/` 保持不变
    - CSS class 名（`vpn-card` / `vpn-table` / `vpn-subnav` 等）保持不变
    - README.md 中关于技术描述的"VPN"字样保持不变（changelog 标题里说的就是技术行为）

- **Bug 修复：导航栏高亮错位**
  - **现象**：进入任意 `/vpn/*` 子页面后，顶部导航栏的"VPN"（代理）标签**没有**高亮，而"管理"标签反而被高亮
  - **根因**：`templates/vpn/base.html`（从 `admin.html` 复制过来时）写死了 `<li><a href="/admin" class="active">管理</a></li>`，并且 `admin.html` 自己也写死了 `class="active"` 在"管理"上
  - **修复**：仿照子导航的高亮模式，改成基于 `request.endpoint` 前缀判断：
    - `request.endpoint` 以 `vpn_` 开头 → "代理" tab 高亮
    - `request.endpoint` 以 `admin_` 开头 → "管理" tab 高亮
  - **影响范围**：`templates/vpn/base.html` 和 `templates/admin.html` 的顶部导航栏
  - **验证**：curl 抓 `/vpn/`、`/vpn/users/`、`/vpn/traffic/`、`/vpn/subscriptions/` 等子页面，HTML 中 `<a href="/vpn/" ... class="active">代理</a>` 出现且 `<a href="/admin" ... class="active">管理</a>` **不**出现；反之 `/admin` 页面则"管理"高亮

### 2026-06-15 — VPN 启动时同步用户到 xray

- **新增功能：vpn-xray 重启后自动恢复用户**
  - 解决 xray 容器重启后动态添加的用户全部丢失的长期 bug
  - `traffic_sync` daemon 启动时（gunicorn 收到第一次请求触发）先等 5s 让 xray 准备好，然后从 `vpn_users` 表里把 `enabled=1` 的用户全部 `add_user` 推到 xray，把 `enabled=0` 但还残留在 xray 里的用户 `remove_user` 掉（防绕过封禁）
  - 带重试：每 5s 试一次，最多等 60s；超时后记 ERROR 日志，daemon 继续跑（流量同步按 60s 间隔继续）
  - **幂等性**：xray 的 `AddUserOperation` 在用户已存在时会返回 "User already exists"；`xray_client.add_user` 把这种情况视为成功（目标状态已达成），避免重试循环
  - **DB schema 新增列**：`vpn_users.last_xray_sync_at INTEGER`，由 startup sync 成功推过的用户写入。后续 xray-client 相关功能可参考此标记判断"是否已同步"
  - **迁移兼容**：`init_db()` 通过 `PRAGMA table_info(vpn_users)` 检查旧库是否缺列，缺则 `ALTER TABLE` 补上
- **修改文件**：
  - `traffic_sync.py` — 新增 `_sync_users_to_xray()` / `_do_sync_users_to_xray()` / `_all_vpn_users()` / `_mark_xray_synced()`，在 `_run_loop` 第一次跑 `_sync_once` 之前调用
  - `xray_client.py` — `add_user` 对 "User already exists" 错误视为成功（INFO 日志，不算失败）
  - `app.py` — `vpn_users` 表 `CREATE TABLE` 增加 `last_xray_sync_at INTEGER` 列；`init_db()` 内置兼容旧库的 `ALTER TABLE` 逻辑

### 2026-06-14 — 纪念日检测时间可配置 + 系统定时任务

- **新增纪念日检测时间配置功能**：
  - 管理后台新增"纪念日检测时间"设置卡片，可选择每天自动检测的时分秒
  - 设置时间后自动更新系统 crontab，取消定时时自动清除 cron 条目
  - 新建 `scripts/check_anniversaries.py` 独立脚本，通过 `import app` 复用 `check_rule_matches_today`、`build_anniversary_message`、`send_anniversary_feishu` 等函数
  - 脚本在 `app.app_context()` 中运行，确保 `get_db()` 正常工作
- **新增 API**：
  - `GET /api/admin/anniversary-check-time` — 获取当前配置的检测时间和 crontab 状态
  - `POST /api/admin/anniversary-check-time` — 设置/取消检测时间（自动管理 crontab）
- **修改文件**：
  - `scripts/check_anniversaries.py` — 新建独立检测脚本
  - `app.py` — 新增 `update_anniversary_crontab()` 函数和两个 API 端点
  - `templates/admin.html` — 新增检测时间配置 UI
  - `static/js/admin.js` — 新增 `loadAnniversaryCheckTime()`、`saveCheckTime()`、`cancelCheckTime()` 方法

### 2026-06-13 — 纪念日"已经 N 天"天数计算修复

- **修复 `anniversary_day` 和 `upcoming` 分支中"已经 N 天"显示错误的问题**：
  - 根因：`build_anniversary_message` 中"已经 N 天"使用 `{-days_until}` 计算，即今年纪念日距今天的天数差，而非从原始纪念日至今的总天数。例：纪念日 2025-03-23，今天 2026-06-13，错误显示"已经 82 天"（2026-03-23 → 2026-06-13），正确应为"已经 447 天"（2025-03-23 → 2026-06-13）
  - 修复：两个分支的"已经 N 天"均改用 `total_days`（`total_days = (today - anniv).days`，已在函数开头计算），`days_until` 仅用于判断未到/已过/当天三种情况
- **修改文件**：
  - `app.py` — `build_anniversary_message` 函数，`anniversary_day` 分支（~第 515 行）和 `upcoming` 分支（~第 530 行）

### 2026-06-13 — 纪念日手动通知消息修复

- **修复手动通知按钮显示"倒计时"而非"已在一起天数"的问题**：
  - 根因：`manual_notify` 在非纪念日当天时走 `upcoming` 逻辑，计算距下一年纪念日的天数（`days_until`），显示"还有 X 天"
  - 修复：`manual_notify` 始终使用 `anniversary_day` 消息类型，直接显示"今天是我们在一起的第 N 天"（`total_days = (today - anniv_date).days`）
  - 移除了查找下一年纪念日的循环逻辑，代码从 ~30 行精简到 ~5 行
- **修改文件**：
  - `app.py` — `manual_notify` 函数

### 2026-06-13 — 纪念日页面权限修复 & 通知功能 Bug 修复

- **权限修复**：
  - `/anniversary` 页面路由改用 `@admin_required` 装饰器（替代手动 session 检查），与其他管理页面保持一致
  - 确认所有 `/api/anniversary/*` 端点均有 `@admin_required`（`/api/anniversary/check` 除外，该端点由 cron 调用无需认证）
- **修复通知按钮 "unexpected token" 错误**：
  - 根因：`manual_notify` 端点未捕获异常时 Flask 返回 HTML 500 错误页，前端 `api()` 调用 `res.json()` 解析 HTML 触发 `SyntaxError: Unexpected token '<'`
  - 后端：`manual_notify` 增加 `try/except` 包裹，异常时返回 JSON 格式错误信息
  - 前端：`api()` 函数对 `res.json()` 增加 try/catch，非 JSON 响应显示友好错误
  - 前端：`confirmNotifyBtn`、`loadAnniversaries`、`loadRules` 增加 `api()` 返回 null（401 场景）的空值检查
- **前端错误处理优化**（本次早些时候）：
  - `api()` 函数增加 `credentials: 'same-origin'` 确保 session cookie 正确发送
  - 401 响应时先显示"登录已过期"提示再跳转，避免静默重定向让用户困惑
- **修复 sqlite3.Row `.get()` 调用**（本次早些时候）：
  - `manual_notify` 和 `check_anniversaries` 中 `anniv.get('emoji', '💕')` 改为 `anniv['emoji'] or '💕'`
- **通知消息样式优化**（本次早些时候）：
  - 移除"届时将是在一起xxx天"的文案
  - upcoming 类型消息使用自定义 emoji 和名称作为标题（如 `💕 在一起`）
  - 动态天数文案：`⏰ 还有 X 天`（未来）/ `⏰ 已经 X 天`（过去）/ `⏰ 就是今天`（当天）
- **修改文件**：
  - `app.py` — `/anniversary` 路由添加 `@admin_required`；`manual_notify` 增加异常处理
  - `static/js/anniversary.js` — `api()` 错误处理改进；多处 null 检查

### 2026-06-09 — 统一全站页面布局风格

- **统一导航栏模板**：所有页面使用 `<nav class="navbar">` 结构，包含 logo、导航链接、主题切换按钮
- **统一 Footer 模板**：所有页面使用 `<footer class="footer">` 结构，包含社交链接和版权信息
- **修改文件**：
  - `templates/raise.html` — 替换 nav-menu 为统一导航栏，替换 footer，添加 main.js 引用
  - `templates/economy.html` — 替换 nav-menu 为统一导航栏，替换 footer，添加 `data-theme="dark"` 和 main.js 引用
  - `templates/emperor.html` — 替换 nav-menu 为统一导航栏，替换 footer，添加 `data-theme="dark"` 和 main.js 引用
  - `templates/admin.html` — 添加主题切换按钮和"管理"导航链接，添加统一 footer
  - `templates/games.html` — footer 社交链接添加 aria-label 属性
  - `templates/tetris.html` — footer 社交链接添加 aria-label 属性
  - `templates/minesweeper.html` — footer 社交链接添加 aria-label 属性
- **页面状态**：
  - `index.html` — 已符合统一模板 ✅
  - `games.html` — 已修正 footer aria-label ✅
  - `tetris.html` — 已修正 footer aria-label ✅
  - `minesweeper.html` — 已修正 footer aria-label ✅
  - `raise.html` — 已统一导航栏和 footer ✅
  - `economy.html` — 已统一导航栏和 footer ✅
  - `emperor.html` — 已统一导航栏和 footer ✅
  - `admin.html` — 已添加主题切换、管理链接和 footer ✅

### 2026-06-07 — 修复黄金价格显示问题

- **前端 `templates/economy.html`**：
  - `data.price_cny_gram` → `data.current_price`（修复价格显示为 undefined）
  - 图表改用后端返回的真实30天历史数据 `data.history`，替换之前的 `generateMockGoldHistory()` 假数据
- **后端 `app.py`**：
  - `/api/gold-price` 新增返回 `price_usd_oz` 字段（国际金价 美元/盎司）
  - 同时请求 PLN→USD 汇率，用于计算 USD/盎司价格（1盎司=31.1035克）

## License

MIT
