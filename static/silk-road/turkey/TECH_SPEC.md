# 关 2 · 土耳其 · 卡帕多奇亚热气球组装 — 技术规格

> **目标读者**：M26 实现工程师
> **基础栈**：Phaser 3.80（CDN 全局，跟 qatar/iran 一致）
> **数据流**：localStorage 读 → Phaser 场景 → localStorage 写
> **地图模式**：卡帕多奇亚大迷宫地图（虚拟摇杆移动 + 地点交互）

---

## 1. 文件结构

```
static/silk-road/turkey/
├── index.html              # 已存在 — Phaser CDN + game.js
├── game.js                 # 重写: 4 个 Scene (Boot/Intro/Play/Result)
├── style.css               # 新增: dpad / modal / toast 样式 (仿 qatar/style.css)
├── DESIGN.md               # 游戏设计文档
├── TECH_SPEC.md            # 本文件
├── ASSETS.md               # 素材资源说明
└── assets/                 # 美术资源
    ├── buildings/           # 建筑图 (兑换中心/交易中心/组装场)
    ├── npcs/                # NPC 头像 (商铺店主)
    └── icons/               # 商品/材料图标 (PNG, 56x56)
```

**复用文件**（不动）：
- `qatar/game.js` 的 `_buildAvatarSprite`（4 角色 graphics）→ 复制到 turkey/game.js
- `qatar/game.js` 的 `_buildCustomGiftSprite`（Graphics 程序绘制）→ 思路参考
- `qatar/game.js` 的 `playQatarSfx` 助手 → 改名为 `playTurkeySfx` 复用 audio 元素
- `iran/game.js` 的 dpad / modalContainer / 水壶可视化模式 → 模式复用，不复制代码
- `qatar/game.js` 的虚拟摇杆逻辑 → 用于地图移动

---

## 2. Phaser 场景结构

### 2.1 场景清单（4 个）

```js
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280, height: 720,
  backgroundColor: '#D4A574',  // 卡帕多奇亚沙漠色
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, IntroScene, PlayScene, ResultScene],
});
```

### 2.2 BootScene

```js
{
  preload: function() {
    // 加载建筑图
    this.load.image('exchange-center', '/static/silk-road/turkey/assets/buildings/exchange.png');
    this.load.image('trade-center', '/static/silk-road/turkey/assets/buildings/trade.png');
    this.load.image('assembly-field', '/static/silk-road/turkey/assets/buildings/assembly.png');
    
    // 加载材料图标
    this.load.image('cotton', '/static/silk-road/turkey/assets/icons/cotton.png');
    this.load.image('nylon', '/static/silk-road/turkey/assets/icons/nylon.png');
    this.load.image('canvas', '/static/silk-road/turkey/assets/icons/canvas.png');
    this.load.image('bamboo', '/static/silk-road/turkey/assets/icons/bamboo.png');
    this.load.image('basket', '/static/silk-road/turkey/assets/icons/basket.png');
    this.load.image('wire', '/static/silk-road/turkey/assets/icons/wire.png');
    this.load.image('sewing-kit', '/static/silk-road/turkey/assets/icons/sewing-kit.png');
    this.load.image('scissors', '/static/silk-road/turkey/assets/icons/scissors.png');
    this.load.image('lighter', '/static/silk-road/turkey/assets/icons/lighter.png');
    
    // BGM 用现成 <audio id="silk-road-bgm"> 元素
  },
  create: function() {
    // 沿用 qatar BGM 解锁 + 卸载模式
    document.addEventListener('pointerdown', function unlockBgm() { ... }, { once: true });
    window.addEventListener('beforeunload', function() { bgm.pause(); });
    this.time.delayedCall(30, function() { self.scene.start('IntroScene'); });
  },
}
```

### 2.3 IntroScene

- 顶部：卡帕多奇亚风格渐变条 (橙→黄，日出色)
- 中部：NPC banner ("卡帕多奇亚热气球之旅" + 角色选择器)
- 任务说明：「在卡帕多奇亚兑换货币、购买材料、组装热气球，飞往哈萨克斯坦」
- 「开 始」按钮 → PlayScene

### 2.4 PlayScene (核心)

```js
{
  // 状态机: EXPLORING | EXCHANGE | TRADING | ASSEMBLING | DEPARTING | DEAD
  state: 'EXPLORING',

  // 核心数据
  player: { x, y, facing, lastMoveAt, walkPhase },
  lira: 0,                       // 土耳其里拉 ₺ (从兑换中心获得)
  luggage: [],                   // [{id, qty}] 从 localStorage 读 (伊朗带来的商品)
  materials: {                   // 已购买的材料
    fabric: null,                // 'cotton' | 'nylon' | 'canvas'
    bamboo: 0,                   // 需要 3
    basket: false,
    wire: false,
    sewingKit: false,
    scissors: false,
    lighter: false,
  },
  assemblyProgress: {            // 组装进度 (Step 2-6)
    sewing: 0,                   // 0-6 缝合点
    frame: 0,                    // 0-3 竹条
    basket: 0,                   // 0-3 固定点
    inflated: false,
    ignited: false,
  },

  // 地图地点
  locations: [
    { id: 'exchange', x: 300, y: 200, label: '💱 兑换中心' },
    { id: 'trade', x: 640, y: 360, label: '🏪 交易中心' },
    { id: 'assembly', x: 980, y: 520, label: '🎈 组装场' },
  ],
  currentLocation: null,         // 玩家当前靠近的地点

  // 虚拟摇杆
  joystick: null,                // Phaser 虚拟摇杆对象
  moveSpeed: 120,                // 像素/秒

  // 方法 (详细签名见 §4)
  tryMove, _checkLocationProximity, openExchangeModal,
  openTradeModal, checkMaterialsComplete, startAssembly,
  _renderAssemblyStep, playDepartureAnimation, ...
}
```

### 2.5 ResultScene (仿 qatar)

- 通关判定: 组装完成 + 起飞动画播放成功
- 调用 `/api/game/reward/claim` (level=2, amount)
- 通关后 → `playDepartureAnimation` (热气球上升 + 飘动)
- 终点：window.location.href = `/games/silk-road/level/3`

---

## 3. 数据结构

### 3.1 关卡配置

```js
window.TURKEY_LEVEL = {
  LEVEL_ID: 2,
  
  // 地图尺寸 (与 canvas 一致，无滚动)
  CANVAS_W: 1280,
  CANVAS_H: 720,
  
  // 玩家起点 (地图左上角附近)
  start: { x: 150, y: 580 },
  
  // 3 个主要地点 (玩家摇杆移动访问)
  locations: [
    { id: 'exchange',  x: 300, y: 200, radius: 80, label: '💱 兑换中心' },
    { id: 'trade',     x: 640, y: 360, radius: 80, label: '🏪 交易中心' },
    { id: 'assembly',  x: 980, y: 520, radius: 80, label: '🎈 组装场' },
  ],
  
  // 兑换汇率 (卡塔尔礼物 → 土耳其里拉 ₺)
  EXCHANGE_RATES: {
    0: 80,   // 沙漠玫瑰 🌹
    1: 100,  // 古兰经 📖
    2: 60,   // 游隼 🦅
    3: 90,   // 波斯湾珍珠 🦪
    4: 150,  // 天然气 🔥
    // 5 归家之心 ❤️ 不可兑换
    6: 120,  // 火炬塔 🔥
    7: 250,  // 大力神杯 🏆
  },
  
  // 交易中心商铺
  SHOPS: {
    fabric: [
      { id: 'cotton', name: '棉布', emoji: '🧵', price: 120, desc: '轻便但不够结实' },
      { id: 'nylon',  name: '尼龙', emoji: '🧶', price: 220, desc: '平衡选择（推荐）' },
      { id: 'canvas', name: '帆布', emoji: '🪡', price: 360, desc: '结实但很重' },
    ],
    bamboo:   [{ id: 'bamboo', name: '竹条 ×3', emoji: '🎋', price: 150, desc: '框架材料' }],
    basket:   [{ id: 'basket', name: '吊篮',     emoji: '🧺', price: 160, desc: '吊篮' }],
    hardware: [
      { id: 'wire',    name: '电线',        emoji: '🔌', price: 40,  desc: '鼓风机连接' },
      { id: 'lighter', name: '打火机+燃料', emoji: '🔥', price: 80,  desc: '燃烧器点火' },
    ],
    tools: [
      { id: 'sewing-kit', name: '缝纫工具', emoji: '🪡', price: 50, desc: '缝制球囊' },
      { id: 'scissors',   name: '剪刀',     emoji: '✂️', price: 30, desc: '裁剪布料' },
    ],
  },
  
  // 必需材料清单 (购买完成后才能进入组装场)
  REQUIRED_MATERIALS: ['fabric', 'bamboo', 'basket', 'wire', 'lighter', 'sewing-kit', 'scissors'],
  
  // 组装步骤
  ASSEMBLY_STEPS: [
    { id: 'sewing',  name: '🧵 缝制球囊', clicks: 6, type: 'click' },
    { id: 'frame',   name: '🎋 组装框架', clicks: 3, type: 'click' },
    { id: 'basket',  name: '🧺 安装吊篮', clicks: 3, type: 'click' },
    { id: 'inflate', name: '💨 充气测试', hold: 2000, type: 'longpress' },
    { id: 'ignite',  name: '🔥 点火测试', clicks: 1, type: 'click' },
  ],
  
  // 移动
  MOVE_SPEED: 120,      // 像素/秒
  PROXIMITY_RADIUS: 80, // 地点检测半径
  
  // 奖励档位 (跟 qatar/iran 一致)
  REWARD_TIERS: { PERFECT: 20.20, NORMAL: 13.14, HARD: 6.66, DEAD: 0 },
};
```

### 3.2 玩家状态 (this.*)

```js
// 在 PlayScene.create() 中初始化
this.lira = 0;                              // 土耳其里拉 (初始 0，从兑换获得)
this.luggage = this._loadLuggage();         // [{id, qty}] 从 localStorage 读
this.materials = {
  fabric: null,                             // 'cotton' | 'nylon' | 'canvas'
  bamboo: 0,                                // 需要 3
  basket: false,
  wire: false,
  sewingKit: false,
  scissors: false,
  lighter: false,
};
this.assemblyProgress = {
  sewing: 0,    // 0-6
  frame: 0,     // 0-3
  basket: 0,    // 0-3
  inflated: false,
  ignited: false,
};
this.currentStep = 0;                       // 当前步骤 (0-7)
this.currentLocation = null;                // 当前靠近的地点 id
```

### 3.3 地点交互表

```js
this.locationBehavior = {
  exchange: {
    onEnter: () => this.openExchangeModal(),
    canEnter: () => this.luggage.length > 0,
    label: '💱 兑换中心 — 卖行李换里拉',
  },
  trade: {
    onEnter: () => this.openTradeModal(),
    canEnter: () => this.lira > 0 || this._hasUnboughtMaterials(),
    label: '🏪 交易中心 — 购买热气球材料',
  },
  assembly: {
    onEnter: () => this.startAssembly(),
    canEnter: () => this._allMaterialsComplete(),
    label: '🎈 组装场 — 材料齐全可进入',
  },
};
```

---

## 4. 关键函数签名

### 4.1 地图移动与地点检测

```js
/**
 * 虚拟摇杆移动 (每帧 update 调用)
 * 根据 joystick 方向 + speed 更新 player.x/y
 * 边界限制在 [0, CANVAS_W] × [0, CANVAS_H]
 */
PlayScene.prototype._updatePlayerMovement = function (delta) {
  var vx = this.joystick.x * L.MOVE_SPEED;
  var vy = this.joystick.y * L.MOVE_SPEED;
  this.player.x = Phaser.Math.Clamp(this.player.x + vx * delta, 20, L.CANVAS_W - 20);
  this.player.y = Phaser.Math.Clamp(this.player.y + vy * delta, 20, L.CANVAS_H - 20);
  this.playerSprite.setPosition(this.player.x, this.player.y);
  this._checkLocationProximity();
};

/**
 * 检测玩家是否靠近某个地点 (距离 < radius)
 * 靠近时显示交互提示气泡
 * 点击/触摸地点图标触发 onEnter
 */
PlayScene.prototype._checkLocationProximity = function () {
  var self = this;
  L.locations.forEach(function (loc) {
    var dist = Phaser.Math.Distance.Between(self.player.x, self.player.y, loc.x, loc.y);
    if (dist < loc.radius) {
      if (self.currentLocation !== loc.id) {
        self.currentLocation = loc.id;
        self._showLocationPrompt(loc);
      }
    } else if (self.currentLocation === loc.id) {
      self.currentLocation = null;
      self._hideLocationPrompt();
    }
  });
};

/**
 * 进入地点交互
 * @param {string} locId - 'exchange' | 'trade' | 'assembly'
 */
PlayScene.prototype._enterLocation = function (locId) {
  var behavior = this.locationBehavior[locId];
  if (behavior && behavior.canEnter()) {
    this.state = locId === 'exchange' ? 'EXCHANGE' : locId === 'trade' ? 'TRADING' : 'ASSEMBLING';
    behavior.onEnter();
  } else {
    this.showToast(behavior.label, 2000);
  }
};
```

### 4.2 兑换中心

```js
/**
 * 打开兑换 modal
 * 显示行李箱物品列表 + 对应里拉价格
 * 点击物品 → 卖出一件 → 获得里拉
 */
PlayScene.prototype.openExchangeModal = function () {
  this.state = 'EXCHANGE';
  this._renderExchangeModal();
};

/**
 * 卖出一件行李物品
 * @param {number} itemId - 物品 id (0-7, 5 除外)
 */
PlayScene.prototype._sellItem = function (itemId) {
  if (itemId === 5) { this.showToast('❤️ 归家之心不可兑换', 2000); return; }
  var item = this._findInLuggage(itemId);
  if (!item || item.qty <= 0) return;
  var price = L.EXCHANGE_RATES[itemId] || 0;
  item.qty -= 1;
  if (item.qty <= 0) this.luggage = this.luggage.filter(function(i) { return i.id !== itemId; });
  this.lira += price;
  this._renderHud();
  this._renderExchangeModal();  // 刷新列表
  this.showToast('💰 +' + price + '₺', 1500);
};
```

### 4.3 交易中心

```js
/**
 * 打开交易 modal — 5 个商铺
 * 每个商铺显示可购买商品 + 价格 + 已买标记
 */
PlayScene.prototype.openTradeModal = function () {
  this.state = 'TRADING';
  this._renderTradeModal();
};

/**
 * 购买材料
 * @param {string} materialId - 'cotton' | 'nylon' | 'bamboo' | ...
 * @param {number} price - 价格
 */
PlayScene.prototype._buyMaterial = function (materialId, price) {
  if (this.lira < price) { this.showToast('💸 里拉不足！', 2000); return; }
  this.lira -= price;
  this._setMaterialBought(materialId);
  this._renderHud();
  this._renderTradeModal();
  this.showToast('✅ 购买成功', 1500);
};

/**
 * 检查所有材料是否齐全
 */
PlayScene.prototype._allMaterialsComplete = function () {
  return this.materials.fabric !== null
    && this.materials.bamboo >= 1
    && this.materials.basket
    && this.materials.wire
    && this.materials.lighter
    && this.materials.sewingKit
    && this.materials.scissors;
};
```

### 4.4 组装流程

```js
/**
 * 开始组装 (进入组装场后触发)
 * 依次执行 ASSEMBLY_STEPS 中的每个步骤
 */
PlayScene.prototype.startAssembly = function () {
  this.state = 'ASSEMBLING';
  this.currentStep = 0;
  this._renderAssemblyStep(this.currentStep);
};

/**
 * 渲染当前组装步骤
 * @param {number} stepIndex - 0-4
 * - click 类型: 显示可点击区域, 点击计数
 * - longpress 类型: 显示按钮, 长按 2 秒
 */
PlayScene.prototype._renderAssemblyStep = function (stepIndex) {
  var step = L.ASSEMBLY_STEPS[stepIndex];
  if (!step) { this._enterDepartStep(); return; }
  // 渲染步骤 UI + 进度条
};

/**
 * 组装步骤完成回调 → 进入下一步
 */
PlayScene.prototype._onStepComplete = function () {
  this.currentStep += 1;
  if (this.currentStep >= L.ASSEMBLY_STEPS.length) {
    this._enterDepartStep();
  } else {
    this._renderAssemblyStep(this.currentStep);
  }
};

/**
 * 进入出发步骤 (Step 7)
 * 显示完整热气球 + "🎈 乘坐热气球出发" 按钮
 */
PlayScene.prototype._enterDepartStep = function () {
  this.state = 'DEPARTING';
  this._renderDepart();
};

/**
 * 热气球起飞动画
 * - 热气球上升 (tween y: 500 → -200, 4s)
 * - 飘动 (sin 波 x 偏移)
 * - 字幕淡入 "飞向哈萨克斯坦..."
 * - 完成后跳转 /games/silk-road/level/3
 */
PlayScene.prototype.playDepartureAnimation = function () {};
```

### 4.5 工具函数

```js
/**
 * 从 localStorage 读 luggage (兼容 iran 格式 [{id, qty}])
 * debug=1 时自动填充测试数据
 */
PlayScene.prototype._loadLuggage = function () {
  if (this._isDebug()) return this._fillDebugLuggage();
  var raw = localStorage.getItem('silkroad_luggage');
  if (!raw) return this._fillDebugLuggage();
  try {
    var parsed = JSON.parse(raw);
    if (parsed.length && typeof parsed[0] === 'object') return parsed;
    return parsed.map(function (id) { return { id: id, qty: 1 }; });
  } catch (e) { return this._fillDebugLuggage(); }
};

/**
 * 写回 luggage (归家之心 + 未兑换的物品保留)
 */
PlayScene.prototype._saveCargoToLocalStorage = function () {
  localStorage.setItem('silkroad_luggage', JSON.stringify(this.luggage));
};

/**
 * 渲染顶部 HUD
 */
PlayScene.prototype._renderHud = function () {
  this.liraText.setText('💰 ' + this.lira + '₺');
  this.luggageText.setText('🎒 ' + this._totalQty(this.luggage) + ' 件');
  this.materialsText.setText('📦 ' + this._materialsCount() + '/7');
  this.stepText.setText('Step ' + this.currentStep + '/7');
};

/**
 * 已购买材料计数
 */
PlayScene.prototype._materialsCount = function () {
  var count = 0;
  if (this.materials.fabric) count++;
  if (this.materials.bamboo >= 1) count++;
  if (this.materials.basket) count++;
  if (this.materials.wire) count++;
  if (this.materials.lighter) count++;
  if (this.materials.sewingKit) count++;
  if (this.materials.scissors) count++;
  return count;
};
```

### 4.6 核心 modal 渲染

```js
// 1) 兑换中心 modal — 行李箱物品列表 + 里拉价格
PlayScene.prototype._renderExchangeModal = function ()

// 2) 交易中心 modal — 5 个商铺标签页 + 材料列表
PlayScene.prototype._renderTradeModal = function ()

// 3) 组装步骤 modal — 当前步骤交互 (click/longpress)
PlayScene.prototype._renderAssemblyStep = function (stepIndex)

// 4) 出发 modal — 完整热气球 + 出发按钮
PlayScene.prototype._renderDepart = function ()
```

---

## 5. 状态机

### 5.1 PlayScene 状态

```
              ┌──────────────┐
              │   INTRO      │ (Scene 切换)
              └──────┬───────┘
                     ▼
              ┌──────────────┐
       ┌─────►│  EXPLORING   │◄──────────┐
       │      │ (地图移动)   │           │
       │      └──────┬───────┘           │
       │             │ 靠近地点          │
       │   ┌─────────┼──────────┐       │
       │   ▼         ▼          ▼       │
       │ EXCHANGE  TRADING   ASSEMBLING  │
       │   │         │          │       │
       │   └─────────┴──────────┘       │
       │             │ 关闭 modal       │
       │             ▼                  │
       │      ┌──────────────┐          │
       └──────┤  EXPLORING   │──────────┘
              └──────┬───────┘
                     │ 组装完成
                     ▼
              ┌──────────────┐
              │  DEPARTING   │ (起飞动画)
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │   RESULT     │ → level/3
              └──────────────┘
```

### 5.2 地点访问顺序

| 顺序 | 地点 | 前置条件 | 离开条件 |
|------|------|----------|----------|
| 1 | 💱 兑换中心 | 无 (起点) | 卖完行李 / 点击"完成兑换" |
| 2 | 🏪 交易中心 | 有里拉 ₺ | 材料齐全 / 点击"完成购买" |
| 3 | 🎈 组装场 | 7 种材料齐全 | 组装完成 → 起飞 |

### 5.3 通关判定流程

```
组装完成 → _enterDepartStep()
  ├─ 显示完整热气球
  ├─ 玩家点击 "🎈 乘坐热气球出发"
  ├─ playDepartureAnimation()
  │   ├─ 热气球上升 + 飘动 (4s)
  │   ├─ BGM 淡出
  │   └─ 跳转 /games/silk-road/level/3
  └─ claimReward (根据布料选择决定档位)
      ├─ 帆布 (最贵) → PERFECT ¥20.20
      ├─ 尼龙 (中档) → NORMAL ¥13.14
      └─ 棉布 (最便宜) → HARD ¥6.66
```

---

## 6. UI 实现要点

### 6.1 复用模式（不动代码，只复制）

| 复用元素 | 来源 | 改动 |
|----------|------|------|
| 虚拟摇杆 | `qatar/game.js` joystick 逻辑 | 用于地图自由移动 |
| Modal 容器 | `qatar/game.js` modalContainer | depth=2000 一致 |
| 顶部 HUD 横条 | `iran/game.js` 模式 | 改为 4 项: 里拉/行李/材料/步骤 |
| Avatar sprite | `qatar/game.js` _buildAvatarSprite | 直接复制 |
| 起飞动画 | `qatar/game.js` playVoyageAnimation | 改为热气球上升 + 飘动 |
| 字符/反馈 | `iran/game.js` showFloatingText | 直接复用 |

### 6.2 新增 UI

| 元素 | 实现 | 文件位置 |
|------|------|----------|
| 卡帕多奇亚地图 | Graphics 绘制: 天空渐变 + 岩石烟囱 + 沙漠地面 | `_renderMap()` |
| 地点图标 | 3 个建筑 sprite + 标签文字 | `_renderLocations()` |
| 地点交互提示 | 靠近时弹出 "按此进入" 气泡 | `_showLocationPrompt()` |
| 兑换 modal | Phaser.Container + 物品列表 + 价格 | `_renderExchangeModal()` |
| 交易 modal | Phaser.Container + 5 商铺标签页 | `_renderTradeModal()` |
| 组装 UI | Phaser.Container + 步骤进度条 + 交互区 | `_renderAssemblyStep()` |
| 热气球 sprite | Graphics 程序绘制 (球囊+吊篮+火焰) | `_drawBalloon()` |
| 起飞动画 | Tween + sin 波 + 字幕 | `playDepartureAnimation()` |

### 6.3 移动端触摸

- 虚拟摇杆: Phaser 虚拟摇杆插件 (复用 qatar)
- 地点进入: 触摸地点图标 → 进入交互
- 组装交互: 点击/长按 → 进度推进
- 模态点击: 同 qatar 模式
- 全屏/横屏 lock: 复制 `bindFullscreenDom` + `bindOrientationLock`

---

## 7. 接口集成（仿 qatar）

### 7.1 通关领奖

```js
// ResultScene.claimReward(amount)
POST /api/game/reward/claim
  body: { session_id, level: 2, amount: 13.14, nickname }
  → { success, duplicate, triggered }
```

**档位由布料选择决定**：
- 帆布 (360₺) → PERFECT ¥20.20 (玩家投入最多)
- 尼龙 (220₺) → NORMAL ¥13.14
- 棉布 (120₺) → HARD ¥6.66

### 7.2 localStorage 写入

```js
// 通关后更新 luggage (移除已兑换物品, 保留归家之心)
localStorage.setItem('silkroad_luggage', JSON.stringify(this.luggage));

// 清 claim 标记
localStorage.removeItem('silkroad_claimed_' + SESSION_ID + '_2');

// 推 cleared levels
localStorage.setItem('silkroad_cleared_levels', JSON.stringify([0, 1, 2]));
```

### 7.3 不调用的接口

- ❌ `/api/game/secret` — 本关没有"渴死"复活机制
- ❌ `/api/game/fail_level` — 没有 can_fail=true
- ❌ 没有 DEAD 档 — 本关不会失败（纯体验向）

---

## 8. 测试要点（单元 + 集成）

### 8.1 单元 (断言)

| 测试 | 期望 |
|------|------|
| `_sellItem(0)` 卖沙漠玫瑰 | lira += 80, luggage 减少 |
| `_sellItem(5)` 卖归家之心 | 拒绝, showToast |
| `_buyMaterial('cotton', 120)` | lira -= 120, materials.fabric = 'cotton' |
| `_buyMaterial('cotton', 120)` 里拉不足 | 拒绝, showToast |
| `_allMaterialsComplete()` 全部齐全 | true |
| `_allMaterialsComplete()` 缺一项 | false |
| `_onStepComplete()` sewing 6 次 | 进入下一步 frame |
| `playDepartureAnimation()` | 4s 后跳转 level/3 |
| `?debug=1` 模式 | luggage 自动填充 8 种物品各 5 件 |

### 8.2 集成 (e2e, 仿 qatar test_silkroad_*)

- `tests/turkey/test_map_exploration.py` — 摇杆移动 + 地点检测
- `tests/turkey/test_exchange_currency.py` — 卖行李换里拉
- `tests/turkey/test_trade_materials.py` — 购买全部 7 种材料
- `tests/turkey/test_assembly_flow.py` — 5 步组装完整流程
- `tests/turkey/test_departure_animation.py` — 起飞动画 + 跳转
- `tests/turkey/test_debug_mode.py` — debug=1 快速填充

---

## 9. 资源依赖（详细清单见 ASSETS.md）

| 资源 | 来源 | 必需 |
|------|------|------|
| 建筑图 (exchange/trade/assembly) | Graphics 程序绘制 | ✅ |
| 材料图标 (cotton/nylon/bamboo/...) | Graphics 程序绘制 / emoji 兜底 | ✅ |
| 岩石烟囱地貌 | Graphics 程序绘制 (三角形装饰) | ✅ |
| 热气球 sprite | Graphics 程序绘制 (球囊+吊篮+火焰) | ✅ |
| BGM 音乐 | 复用 qatar `<audio id="silk-road-bgm">` | ✅ |
| SFX 资源 | 5-7 个新音效 (sell/buy/sewing/inflate/ignite/...) | ✅ |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 建筑图没及时准备好 | 用 Graphics 程序绘制简单矩形 + 标签 |
| 材料图标 PNG 缺失 | 用 emoji 兜底 (跟 qatar 一样) |
| 虚拟摇杆在移动端不灵敏 | 复用 qatar 已验证的摇杆逻辑 |
| 组装步骤交互不直观 | 加进度条 + 点击反馈动画 |
| 起飞动画热气球不自然 | Tween + sin 波飘动, 4s 足够长 |
| iOS Safari modal 点击不响应 | 仿 qatar M24 加 DOM 兜底按钮 |
| 玩家里拉不够买材料 | debug=1 自动填充 850₺, 正常流程也够 |

---

**更新完成**：TECH_SPEC.md 已全面改为卡帕多奇亚热气球组装设计，包括：
- §1 文件结构（新增 buildings 目录）
- §2 Phaser 场景（改为地图探索 + 地点交互）
- §3 数据结构（兑换汇率 + 商铺 + 组装步骤）
- §4 函数签名（地图移动 + 兑换 + 交易 + 组装）
- §5 状态机（EXPLORING → EXCHANGE/TRADING/ASSEMBLING → DEPARTING）
- §6 UI 实现（虚拟摇杆 + 卡帕多奇亚地图 + 热气球 sprite）
- §7 接口集成（档位由布料决定）
- §8 测试要点（地图探索 + 兑换 + 交易 + 组装 + 起飞）
- §9 资源依赖（建筑图 + 材料图标 + 岩石地貌）
- §10 风险缓解（新增摇杆灵敏度 + 组装交互 + 里拉不足）

DESIGN.md 和 TECH_SPEC.md 现已同步更新为新版设计。