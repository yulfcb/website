// 伊朗·阿巴斯港大巴扎 —— 关 1 关卡配置（M3: 商店"卖"模式 + 水壶系统）
//
// 数据格式参考卡塔尔关 0 (window.QATAR_LEVEL) 风格，但用 window.IRAN_LEVEL 命名空间。
// 玩家在 Phaser 场景：人物在沙漠地图上行走，
// 走访波斯商贩 (merchants) 交换商品 + 在绿洲 (oases) 给水壶灌水 + 集齐 2 壶满水启程去土耳其 (exit)。
//
// 坐标系统：1280×720，左上原点。
// 商贩分布：6 个真实城市地标附近（设拉子/伊斯法罕/德黑兰/大不里士/波斯波利斯/中部）。
// 绿洲：2 个（波斯古井、坎儿井）—— 走入 < 80px 自动把最空的水壶灌满。
// 商贩机制（M3）：每家用 1 件行李物品换 1 份自家商品，**可以反复交易**。
// 出口（M3）：左上角巴扎尔甘 (Bazargan) —— 2 个水壶都满 10L 才能过境。

window.IRAN_LEVEL = {
  // 关 1 玩家起点 —— 阿巴斯港 (Bandar Abbas) 中下偏左
  start: { x: 200, y: 580 },

  // 6 个波斯商贩 —— 走访 6 个真实地标
  // sells: 该商贩卖的商品 (玩家花 1 件行李物品换 1 份)
  // cost:  需要几件行李物品 (目前都 1)
  merchants: [
    {
      id: 0, x: 350, y: 200, emoji: '🧶', name: '波斯地毯商',
      tip: '伊朗手织地毯，世界闻名',
      sells: { name: '地毯', emoji: '🧶' },
      cost: 1,
    },
    {
      id: 1, x: 900, y: 180, emoji: '🌿', name: '藏红花商',
      tip: '伊朗占全球 90% 产量',
      sells: { name: '藏红花', emoji: '🌿' },
      cost: 1,
    },
    {
      id: 2, x: 1100, y: 400, emoji: '🫖', name: '茶馆老板',
      tip: '坐下来喝杯 chai 吧',
      sells: { name: '茶', emoji: '🫖' },
      cost: 1,
    },
    {
      id: 3, x: 450, y: 450, emoji: '🏺', name: '伊斯法罕陶匠',
      tip: '蓝色清真寺陶器',
      sells: { name: '陶器', emoji: '🏺' },
      cost: 1,
    },
    {
      id: 4, x: 750, y: 350, emoji: '🐫', name: '骆驼商人',
      tip: '丝路商旅，骆驼是命',
      sells: { name: '骆驼', emoji: '🐫' },
      cost: 1,
    },
    {
      id: 5, x: 850, y: 540, emoji: '🫗', name: '水壶商人',
      tip: '过境要带满水的水壶',
      sells: { name: '水壶', emoji: '🫗' },
      cost: 1,
    },
  ],

  // 2 个绿洲 —— 玩家走入自动把最空的水壶灌满到 10L
  oases: [
    { x: 600, y: 250, label: '波斯古井' },
    { x: 200, y: 420, label: '坎儿井' },
  ],

  // 出口 —— 左上角巴扎尔甘 (Bazargan 伊朗-土耳其主要边境口岸)
  exit: { x: 100, y: 110, emoji: '🚩', label: '巴扎尔甘 → 土耳其' },

  // 6 个真实地标 (M1: 作为地图 chip 装饰, 不参与玩法)
  places: [
    { id: 'bandar',     x: 200, y: 580, label: 'Bandar Abbas 阿巴斯港' },
    { id: 'isfahan',    x: 450, y: 430, label: 'Isfahan 伊斯法罕' },
    { id: 'shiraz',     x: 600, y: 230, label: 'Shiraz 设拉子' },
    { id: 'tabriz',     x: 900, y: 160, label: 'Tabriz 大不里士' },
    { id: 'tehran',     x: 750, y: 330, label: 'Tehran 德黑兰' },
    { id: 'persepolis', x: 350, y: 180, label: 'Persepolis 波斯波利斯' },
  ],

  // 移动 / 水壶常量 (M3 重做)
  STEP_PX_WALK: 24,            // 走路步长
  STEP_PX_CAMEL: 48,           // 骑骆驼步长 (2x)
  MOVE_COOLDOWN_MS: 220,
  WATER_PER_STEP: 0.1,         // 每步消耗 0.1L 水 (从当前水壶扣)
  JUG_CAPACITY: 10,            // 每个水壶满 10L
  TARGET_JUGS: 2,              // 出口条件：2 个水壶 (都满 10L)

  // 商贩机制 (M3)
  MERCHANT_COST: 1,            // 1 件行李物品换 1 份商品

  // 奖励档位 (M3 用)
  rewardTiers: {
    PERFECT: 20.20,
    NORMAL:  13.14,
  },

  CANVAS_W: 1280,
  CANVAS_H: 720,
};

// 暴露给 node 离线验证 (Verification Step 6/7)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.IRAN_LEVEL;
}
