// 伊朗·阿巴斯港大巴扎 —— 关 1 关卡配置（M4: 货币系统 + 水壶可视化）
//
// 数据格式参考卡塔尔关 0 (window.QATAR_LEVEL) 风格，但用 window.IRAN_LEVEL 命名空间。
// 玩家在 Phaser 场景：人物在沙漠地图上行走，
// 走访波斯商贩 (merchants) 用里亚尔购买商品 + 在绿洲 (oases) 给水壶灌水 + 集齐 2 壶满水启程去土耳其 (exit)。
//
// 坐标系统：1280×720，左上原点。
// 商贩分布：6 个真实城市地标附近（设拉子/伊斯法罕/德黑兰/大不里士/波斯波利斯/中部）。
// 绿洲：2 个（波斯古井、坎儿井）—— 走入 < 80px 自动把最空的水壶灌满。
// 商贩机制（M4）：先用 1 件行李物品在交易中心兑换伊朗里亚尔 ﷼，再用里亚尔购买商品。
// 出口（M4）：左上角巴扎尔甘 (Bazargan) —— 2 个水壶都满 10L 才能过境。

window.IRAN_LEVEL = {
  // 调试开关：true=默认装满行李（调试用），false=从 localStorage 读（正式版）
  DEBUG_FILL_LUGGAGE: true,

  // 关 1 玩家起点 —— 阿巴斯港 (Bandar Abbas) 中下偏左
  start: { x: 200, y: 580 },

  // M4: 交易中心 —— 在起点附近, 玩家初始就能看到
  // 玩家需要先把行李物品换成伊朗里亚尔, 然后才能在商店消费
  exchange: { x: 300, y: 560, emoji: '🏦', name: '阿巴斯港交易中心', label: '交易中心' },

  // M4: 兑换汇率 — 卡塔尔带过来的行李物品 (QATAR_LEVEL.gifts id) → 伊朗里亚尔
  // id=5 归家之心 ❤️ 不可兑换 (灵魂, 不是商品)
  // v15: 兑换汇率 ×400000 (考虑汇率: 卡塔尔物品 ¥30 = 伊朗 ﷼ 12,000,000)
  EXCHANGE_RATES: {
    0: 12000000,  // 沙漠玫瑰 🌹 (¥30 → ﷼ 12,000,000)
    1: 16000000,  // 古兰经 📖
    2: 10000000,  // 游隼 🦅
    3: 14000000,  // 波斯湾珍珠 🦪
    4: 24000000,  // 天然气 🏭
    6: 20000000,  // 火炬塔之火 🔥
    7: 40000000,  // 大力神杯 🏆
    // 5 (归家之心) 不在此列, 不可兑换
  },

  // 6 个波斯商贩 —— 走访 6 个真实地标
  // M4: 玩家花 price 里亚尔买 1 份 sells 商品
  // v15: 物品价格 ×200000 (考虑汇率)
  merchants: [
    {
      id: 0, x: 350, y: 200, emoji: '🧶', name: '波斯地毯商',
      tip: '伊朗手织地毯，世界闻名',
      sells: { name: '地毯', emoji: '🧶' },
      price: 5000000,  // ¥25 → ﷼ 5,000,000
    },
    {
      id: 1, x: 900, y: 180, emoji: '🌿', name: '藏红花商',
      tip: '伊朗占全球 90% 产量',
      sells: { name: '藏红花', emoji: '🌿' },
      price: 7000000,  // ¥35 → ﷼ 7,000,000
    },
    {
      id: 2, x: 1100, y: 400, emoji: '🫖', name: '茶馆老板',
      tip: '坐下来喝杯 chai 吧',
      sells: { name: '茶', emoji: '🫖' },
      price: 3000000,  // ¥15 → ﷼ 3,000,000
    },
    {
      id: 3, x: 450, y: 450, emoji: '🏺', name: '伊斯法罕陶匠',
      tip: '蓝色清真寺陶器',
      sells: { name: '陶器', emoji: '🏺' },
      price: 4000000,  // ¥20 → ﷼ 4,000,000
    },
    {
      id: 4, x: 750, y: 350, emoji: '🐫', name: '骆驼商人',
      tip: '丝路商旅，骆驼是命',
      sells: { name: '骆驼', emoji: '🐫' },
      price: 8000000,  // ¥40 → ﷼ 8,000,000
    },
    {
      id: 5, x: 850, y: 540, emoji: '🍶', name: '水壶商人',
      tip: '过境要带满水的水壶',
      sells: { name: '水壶', emoji: '🏺' },
      price: 6000000,  // ¥30 → ﷼ 6,000,000
    },
  ],

  // 2 个绿洲 —— 玩家走入自动把最空的水壶灌满到 10L
  oases: [
    { x: 600, y: 250, label: '波斯古井' },
    { x: 200, y: 420, label: '坎儿井' },
  ],

  // 出口 —— 左上角伊朗边境 (Bazargan 伊朗-土耳其主要边境口岸)
  exit: { x: 100, y: 110, emoji: '🚪', label: '伊朗 → 土耳其' },

  // 6 个真实地标 (M1: 作为地图 chip 装饰, 不参与玩法)
  places: [
    { id: 'bandar',     x: 200, y: 580, label: 'Bandar Abbas 阿巴斯港' },
    { id: 'isfahan',    x: 450, y: 430, label: 'Isfahan 伊斯法罕' },
    { id: 'shiraz',     x: 600, y: 230, label: 'Shiraz 设拉子' },
    { id: 'tabriz',     x: 900, y: 160, label: 'Tabriz 大不里士' },
    { id: 'tehran',     x: 750, y: 330, label: 'Tehran 德黑兰' },
    { id: 'persepolis', x: 350, y: 180, label: 'Persepolis 波斯波利斯' },
  ],

  // 移动 / 水壶常量 (M3 重做, M4 保留)
  STEP_PX_WALK: 24,            // 走路步长
  STEP_PX_CAMEL: 48,           // 骑骆驼步长 (2x)
  MOVE_COOLDOWN_MS: 220,
  WATER_PER_STEP: 0.1,         // 每步消耗 0.1L 水 (从当前水壶扣)
  JUG_CAPACITY: 10,            // 每个水壶满 10L
  TARGET_JUGS: 4,              // 出口条件：4 个水壶 (都满 10L) — 初始 1 个 + 买 3 个

  // 奖励档位 (v15: NORMAL 改为 188 跟卡塔尔统一)
  rewardTiers: {
    PERFECT: 20.20,
    NORMAL:  188,
  },

  // v16: 4 档奖励金额 (通关后弹出 modal 让玩家选档)
  IRAN_REWARD_TIERS: {
    PERFECT: 200,
    NORMAL:  200,
    HARD:    20,
    DEAD:    0,
  },
  IRAN_TIER_QUOTES: {
    PERFECT: '你和沙漠谈了一场恋爱。',
    NORMAL:  '三壶水，够走完这段路。',
    HARD:    '勉强也算走完了。',
    DEAD:    '沙海很热，但你的心没有停下。',
  },

  CANVAS_W: 1280,
  CANVAS_H: 720,
};

// 暴露给 node 离线验证 (Verification Step 6/7)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.IRAN_LEVEL;
}
