# 新疆·天山滑雪 - 设计文档

## 核心流程

**滑下雪山 → 购买补给 → 出发去成都**

---

## 场景 1：下滑雪山（SlidingScene）

### 目标
在 15 秒内从山顶滑到山脚（屏幕底部），躲开松树和岩石。

### 玩法
- 玩家自动从屏幕顶部向下滑行（速度 150→320 px/s，越往下越快）
- 按 ← → 键（或虚拟方向键）左右移动
- 每 1.1 秒随机生成障碍物（松树 🌲 55% / 岩石 🪨 35% / 雪堆 ❄️ 10%）
- 障碍物从屏幕顶部出现，随玩家下滑而向下移动
- 矩形 hitbox 碰撞检测（避免 Phaser arcade physics 太重）
- 撞到障碍物 = 屏幕震动 + 减速 -50 px/s + 撞墙计数 +1
- 撞墙 5 次 = 失败
- 下滑到 finishY（700）= 通关

### 难度参数
- 初始下滑速度：150 px/s
- 最大下滑速度：320 px/s
- 左右移动速度：280 px/s
- 障碍物最小横向间距：240 px
- 限时：15 秒

### 失败机制
- 撞墙 5 次 = 失败，显示"再试一次"按钮
- 或者限时 15 秒到 = 失败

### 视觉设计
- 顶部雪山：纯白雪地（0xFFFFFF）+ 雪山轮廓（0xB0BEC5 灰）
- 底部草原：草绿渐变（0x7CB342）+ 深绿纹理（0x558B2F）
- 雪线 y=280 分割（浅蓝虚线）
- 起点旗（蓝色）+ 终点旗（红色）
- 雪板 🎿 + 角色 avatar（来自 buildAvatarSprite）
- 虚拟方向键（左下角，半透明圆盘 + ◀ ▶ 按钮）

### 通关条件
scrollY >= finishY - startY（滑到屏幕底部）

---

## 场景 2：购买补给（ShoppingScene）

### 目标
走访 3 个商铺，购买 2 件必需物品，然后走到右下出口出发。

### 地图设计
- 1280×720 雪山 + 草原混合地图
- 玩家步行移动（速度 140 px/s）
- 3 个赭红色帐篷商铺分布不同位置
- 右下角成都驿站拱门作为出口

### 商铺列表

| 商铺 | 位置 | 商品 | 价格 | 必需 |
|------|------|------|------|------|
| 🍢 羊肉串店 | (280, 280) | 羊肉串 | 60¥ | ✓ |
| 🔥 暖宝宝店 | (700, 450) | 暖宝宝 | 40¥ | ✓ |
| 🧀 奶酪店 | (980, 240) | 奶酪块 | 80¥ | - |

### 货币系统
- 玩家初始余额：500 ¥（人民币）
- Debug 模式：9999 ¥（满金币）
- 余额从 `localStorage.silkroad_coins` 读取（继承自前面关卡的 earned coins）
- 购买后写回 localStorage

### 必需物品检查
- 必需买齐：🍢 羊肉串 + 🔥 暖宝宝（共 2 件）
- 集齐 2 件 + 走到出口 = 显示"出发去成都！"按钮
- 走到出口但缺物品 = 提示"还差 N 件必需品！"

### 通关条件
- 必需物品齐全 + 玩家在 exitZone（半径 70）内
- 显示金色"✨ 出发去成都！"按钮
- 点击 → DepartScene

### 视觉设计
- 雪山背景（顶部 0~200）+ 草原（200~720）
- 赭红色帐篷（D84315 + BF360C + 金色招牌）
- 道路指示（右下角 D7CCC8 浅色）
- HUD 顶部（暗黑 + 金色文字）：
  - 💰 余额 (¥)
  - 🧳 物品数
  - 📋 必买 X/2
  - 🔊 BGM
  - 🗺️ 世界地图

### 行李 Modal
- 点击 🧳 按钮打开
- 列出所有物品（⭐ 标记必需）
- 关闭按钮（赭红）

---

## 场景 3：出发去成都（DepartScene）

### 触发条件
- ShoppingScene 通关后自动进入
- 或者通关时直接写 `silkroad_cleared_levels` 追加 4

### 动画
- 复用 kazakhstan DepartScene 的实现模式
- RGB lerp：雪山白 (0xFFFFFF) → 成都暖橙 (0xFDE2C5)
- 三段路径：上升 (2s) → 横飞 (3s) → 下降 (2s)
- 60fps setInterval (16ms) 驱动
- 滑雪角色 (🎿 + avatar) 跟随路径移动
- 雪山轮廓从地平线升起（alpha 0→0.7）

### 继续按钮
- DOM 兜底（iOS Safari 兼容）：`#xj-depart-continue`
- Phaser Zone 双路径（chromium 兼容）
- 点击 → `/games/silk-road/level/5` (成都·到家)
- 空格/回车键也可触发

### 写通关状态
```js
localStorage.setItem('silkroad_cleared_levels', JSON.stringify([...prev, 4]))
```

---

## 技术实现

### 场景结构
```javascript
BootScene      // 加载资源 + BGM 初始化
SlidingScene   // 下滑场景
ShoppingScene  // 购买补给
DepartScene    // 出发过场动画
```

### 复用组件
- `common.js` 的 `buildAvatarSprite`（4 角色）
- qatar 的 BGM/SFX 音频通道
- `localStorage.silkroad_cleared_levels` 关卡进度
- kazakhstan 的 DepartScene 动画模式（RGB lerp + 三段路径）

### 新增组件
- SlidingScene 自动下滑系统（scrollSpeed + scrollY 累积）
- 障碍物权重随机生成
- 矩形 hitbox 碰撞检测（避免 Phaser arcade physics）
- 屏幕震动反馈（camera.shake）

---

## 文件结构

```
static/silk-road/xinjiang/
├── index.html       # 页面入口
├── game.js          # 主游戏逻辑（4 个场景）
├── style.css        # 样式
├── levels.js        # 关卡配置（3 商铺 + 障碍物 + 必需物品）
└── DESIGN.md        # 本文档
```

---

## 开发计划

### M1：基础框架
- SlidingScene 自动下滑 + 左右移动
- 障碍物生成 + 碰撞检测
- 15s 倒计时
- 成功/失败弹窗

### M2：购买系统
- ShoppingScene 地图 + 移动
- 3 个赭红色帐篷商铺
- 购买/物品管理
- 出发条件检查

### M3：出发逻辑
- DepartScene RGB lerp
- 60fps 三段路径动画
- DOM continue 兜底

### M4：调试 + 验证
- ?debug=1 跳过 SlidingScene
- Playwright e2e 5/5 PASS
- 雪山白 RGB(255,255,255) + 草原绿 RGB(124,179,66) 像素验证

---

## 与现有关卡的集成

### 数据流
1. **输入**（从哈萨克斯坦继承）：
   - `localStorage.silkroad_coins`：¥ 余额
   - `localStorage.silkroad_kazakhstan_items`：哈萨克购买的物品
   - `localStorage.silkroad_avatar`：角色选择

2. **输出**（传递给成都关）：
   - `localStorage.silkroad_xinjiang_items`：新疆购买的物品
   - `localStorage.silkroad_coins`：扣减后的余额
   - `localStorage.silkroad_cleared_levels`：追加 4

### 路由
- 入口：`/games/silk-road/level/4?debug=1` (debug 跳过 SlidingScene)
- 出口：`/games/silk-road/level/5`

---

## 美术风格

### 色彩方案
- 雪山白：#FFFFFF
- 雪山灰：#B0BEC5
- 雪山蓝（雪线）：#90CAF9
- 草原绿：#7CB342
- 深草绿：#558B2F
- HUD 暗棕：#2A1606
- HUD 金色：#D4AF37 / #FFD98A

### 动画要求
- 玩家下滑：自动匀加速
- 障碍物：随滚动速度向下移动
- 帐篷：静态（赭红三角顶）
- 拱门：静态（赭红 + 棕色）
- 出发动画：60fps RGB lerp + 三段路径

---

## 音效

复用卡塔尔的 BGM 和 SFX：
- `silk-road-bgm.wav`：背景音乐
- `sfx-click.wav`：点击
- `sfx-pickup.wav`：购买 / 撞墙
- `sfx-exchange.wav`：交易
- `sfx-voyage.wav`：出发

---

## 测试要点

### 功能测试
- [ ] SlidingScene：15s 内滑到 finishY = 通关
- [ ] SlidingScene：撞墙 5 次 = 失败
- [ ] ShoppingScene：买齐 2 件必需 + 走到出口 = 出发按钮显示
- [ ] DepartScene：DOM continue 按钮跳转到 /level/5

### 兼容性测试
- [ ] 手机端：触屏虚拟方向键流畅
- [ ] iOS Safari：DOM 兜底按钮可点击
- [ ] 性能：60 FPS 稳定

### 端到端测试
- [ ] 从哈萨克 → 新疆 → 成都 完整流程
- [ ] pageerror === 0
- [ ] 雪山白 RGB(255,255,255) + 草原绿 RGB(124,179,66) 像素存在
- [ ] DOM continue 按钮存在
- [ ] 点击 continue → 跳 /level/5