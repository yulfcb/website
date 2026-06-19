Implement the Anniversary (纪念日) feature for this Flask personal website.

## Project Context
- Flask app at app.py (~824 lines), SQLite database, dark theme UI
- Existing auth: accounts table with login/logout, session-based
- Existing webhook: FEISHU_WEBHOOK_URL stored in settings table, send_feishu_notification() helper exists
- Navigation bar in templates/index.html: 首页、游戏、养成、经济、关于、管理
- Dark theme CSS at static/css/style.css
- Database init in init_db() function in app.py
- Config in config.py, DATABASE_PATH

## Requirements (read full spec at docs/anniversary-feature.md)

### Database Tables
1. anniversaries: id, name, date, description, emoji, created_at, updated_at
2. reminder_rules: id, anniversary_id (FK->anniversaries CASCADE), rule_type, expression, enabled, last_triggered, created_at

### Routes
- GET /anniversary - page (login required, redirect if not logged in)
- POST /api/anniversary - create
- PUT /api/anniversary/<id> - edit
- DELETE /api/anniversary/<id> - delete
- POST /api/anniversary/<id>/rule - add rule
- PUT /api/anniversary/<id>/rule/<rule_id> - edit rule
- DELETE /api/anniversary/<id>/rule/<rule_id> - delete rule
- POST /api/anniversary/<id>/notify - manual notify via Feishu webhook
- POST /api/anniversary/check - cron check endpoint (called daily at 00:00)

### Reminder Rule Expressions
Support these rule types:
- before:Nd -- trigger N days before the anniversary date each year
- every:Nd -- trigger every N days from the anniversary date
- yearly:m{M}d{D}:pre:{N}d -- trigger N days before a fixed date (month M, day D) each year
- anniversary:pre:Nd -- trigger N days before the anniversary date each year (same as before)
- days_after:N -- trigger on the Nth day after the anniversary
Validate expressions on creation.

### Notification Messages (romantic style, in Chinese)
Use existing Feishu webhook. Three formats:

For anniversary day:
"💕 纪念日提醒\n✨ {name}\n📅 {date}\n🌟 今天是我们在一起的第 {N} 天\n每一天的相伴，都是最好的礼物"

For upcoming:
"💌 纪念日预告\n✨ {name} 即将到来！\n📅 {date}\n⏰ 还有 {N} 天\n🌟 届时将是在一起的第 {total_days} 天\n提前准备一份惊喜吧 ❤️"

For periodic milestone:
"🎉 里程碑达成！\n✨ {name}\n🌟 今天是第 {N} 天！\n一起走过了 {N} 个日夜，未来还长 💫"

### Frontend (templates/anniversary.html)
- Login required page
- Card-based layout for each anniversary showing emoji, name, date, days passed (prominent large number)
- Action buttons on each card: edit, delete, notify, manage rules
- Add/edit via modal dialogs
- Rule management: add/edit/delete rules with expression input and syntax help/examples
- Responsive design matching existing dark theme
- Delete confirmation dialog

### Navigation
Add "纪念" link to the navbar in templates/index.html and templates/anniversary.html

### Login Check
Use the same auth pattern as admin page - check session for logged_in, redirect to login if not.

## Important Notes
- Read app.py first to understand existing patterns (auth, db access, Feishu notification)
- Read templates/admin.html for auth/login flow reference
- Read static/css/style.css for existing dark theme styles
- Add new tables in init_db()
- Keep code style consistent with existing app.py
- The check endpoint should be callable via cron or internally
