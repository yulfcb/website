# 纪念日（Anniversary）功能需求文档

## 概述
在个人网站新增"纪念"标签页，用于情侣纪念日跟踪。需要登录才能访问。

## 现有系统环境
- Flask + SQLite，已有 accounts 表（登录认证）
- 已有飞书 Webhook 通知能力（settings 表存 FEISHU_WEBHOOK_URL）
- 暗色主题 UI，导航栏：首页、游戏、养成、经济、关于、管理
- 项目路径：`/root/yulei/code/personal-website/`
- app.py 约824行，有 get_db()、init_db()、settings 等基础设施

---

## 功能需求

### 1. 纪念日管理（CRUD）
- **创建**：用户可自由创建多个纪念日，每个纪念日包含：
  - 名称（如"在一起"、"第一次旅行"）
  - 日期（阳历，date 类型）
  - 可选描述/备注
  - 可选 emoji/图标
- **编辑**：修改已有纪念日的任何字段
- **删除**：支持删除，需二次确认
- **列表展示**：按日期排序，显示名称、日期、已过天数

### 2. 已过天数 / 倒计时显示
- 每个纪念日显示 **"已过去 N 天"**
- 对于未来日期显示 **"倒计时 N 天"**
- 精度为天数（不需要小时/分钟）

### 3. 提醒规则系统
每个纪念日可绑定**多条**提醒规则，规则类型：

#### 类型 A：提前提醒
- 在纪念日到来前 N 天触发通知
- 示例：提前7天提醒"一周后是xxx纪念日"

#### 类型 B：周期提醒
- 从纪念日开始，每 N 天触发一次
- 示例：每100天提醒"在一起第100天"

#### 类型 C：固定日期提醒
- 每年/每月的固定日期触发
- 示例：每年6月1日前3天提醒

#### 规则表达式（高级）
- 支持 cron-like 或自定义 DSL 表达式
- 示例表达式：
  - `days_after:100` — 纪念日后第100天
  - `every:100d` — 每100天
  - `before:7d` — 提前7天
  - `yearly:m6d1:pre:3d` — 每年6月1日前3天
  - `anniversary:pre:7d` — 每年周年日前7天
- 规则表达式需有验证，创建时检查语法

### 4. 通知系统

#### 自动通知
- **触发时间**：每天 00:00 由 cron job 检查所有规则
- **检查逻辑**：遍历所有纪念日的提醒规则，判断今天是否匹配
- **通知渠道**：复用现有飞书 Webhook（FEISHU_WEBHOOK_URL）

#### 手动通知
- 每个纪念日旁有"通知"按钮
- 点击后通过飞书 Webhook 发送通知
- 防止误触：点击后需确认

#### 通知消息格式（浪漫风格）
```
💕 纪念日提醒

✨ {纪念日名称}
📅 {日期}
🌟 今天是我们在一起的第 {N} 天

"每一天的相伴，都是最好的礼物"
```

提前提醒格式：
```
💌 纪念日预告

✨ {纪念日名称} 即将到来！
📅 {日期}
⏰ 还有 {N} 天
🌟 届时将是在一起的第 {总天数} 天

"提前准备一份惊喜吧 ❤️"
```

周期提醒格式：
```
🎉 里程碑达成！

✨ {纪念日名称}
🌟 今天是第 {N} 天！

"一起走过了 {N} 个日夜，未来还长 💫"
```

### 5. 访问控制
- 页面需要登录才能访问（复用现有 accounts 登录机制）
- 未登录访问自动跳转到登录页

---

## 技术方案要点

### 数据库设计（新增表）
```sql
-- 纪念日表
CREATE TABLE anniversaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '💕',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 提醒规则表
CREATE TABLE reminder_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anniversary_id INTEGER NOT NULL,
    rule_type TEXT NOT NULL,  -- 'before', 'periodic', 'fixed', 'expression'
    expression TEXT NOT NULL,  -- 规则表达式
    enabled BOOLEAN DEFAULT 1,
    last_triggered DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (anniversary_id) REFERENCES anniversaries(id) ON DELETE CASCADE
);
```

### 路由设计
- `GET /anniversary` — 纪念日列表页（需登录）
- `POST /api/anniversary` — 创建纪念日
- `PUT /api/anniversary/<id>` — 编辑纪念日
- `DELETE /api/anniversary/<id>` — 删除纪念日
- `POST /api/anniversary/<id>/rule` — 添加提醒规则
- `PUT /api/anniversary/<id>/rule/<rule_id>` — 编辑规则
- `DELETE /api/anniversary/<id>/rule/<rule_id>` — 删除规则
- `POST /api/anniversary/<id>/notify` — 手动通知
- `POST /api/anniversary/check` — 定时检查（cron 调用）

### 前端
- 新增模板 `templates/anniversary.html`
- 导航栏添加"纪念"链接
- 风格与现有暗色主题一致
- 卡片式布局展示纪念日
- 添加/编辑使用模态框

### 定时任务
- 在 Hermes cron 中配置每天 00:00 调用检查脚本
- 或添加一个 Flask CLI 命令 + 系统 cron

---

## UI/UX 要求
- 与现有网站暗色主题保持一致
- 卡片式布局，每个纪念日一张卡片
- 卡片显示：emoji + 名称 + 日期 + 已过天数（大字突出）
- 卡片上有操作按钮：编辑、删除、通知、管理规则
- 添加纪念日使用弹窗/模态框
- 移动端适配（响应式）
- 规则表达式输入框旁有语法说明/示例
