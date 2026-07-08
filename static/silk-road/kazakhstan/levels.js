// 哈萨克斯坦·阿斯塔纳大巴扎 —— 关 3 关卡配置（M4: 货币系统 + 水壶可视化）
//
// 数据格式参考卡塔尔关 0 (window.QATAR_LEVEL) 风格，但用 window.KAZAKHSTAN_LEVEL 命名空间。
// 玩家在 Phaser 场景：人物在沙漠地图上行走，
// 走访哈萨克商贩 (merchants) 用坚戈购买商品 + 在绿洲 (oases) 给水壶灌水 + 集齐 2 壶满水启程去土耳其 (exit)。
//
// 坐标系统：1280×720，左上原点。
// 商贩分布：6 个真实城市地标附近（设拉子/伊斯法罕/德黑兰/大不里士/哈萨克波利斯/中部）。
// 绿洲：2 个（哈萨克古井、草原水井）—— 走入 < 80px 自动把最空的水壶灌满。
// 商贩机制（M4）：先用 1 件行李物品在交易中心兑换哈萨克斯坦坚戈 ﷼，再用坚戈购买商品。
// 出口（M4）：左上角阿尔泰 (Bazargan) —— 2 个水壶都满 10L 才能过境。

window.KAZAKHSTAN_LEVEL = {
  // 关 3 玩家起点 —— 阿斯塔纳 (Bandar Abbas) 中下偏左
  start: { x: 200, y: 580 },

  // M4: 交易中心 —— 在起点附近, 玩家初始就能看到
  // 玩家需要先把行李物品换成哈萨克斯坦坚戈, 然后才能在商店消费
  exchange: { x: 300, y: 560, emoji: '🏦', name: '阿斯塔纳交易中心', label: '交易中心' },

  // M4: 兑换汇率 — 卡塔尔带过来的行李物品 (QATAR_LEVEL.gifts id) → 哈萨克斯坦坚戈
  // id=5 归家之心 ❤️ 不可兑换 (灵魂, 不是商品)
  EXCHANGE_RATES: {
    0: 30,   // 沙漠玫瑰 🌹
    1: 40,   // 古兰经 📖
    2: 25,   // 游隼 🦅
    3: 35,   // 哈萨克湾珍珠 🦪
    4: 60,   // 天然气 🏭
    6: 50,   // 火炬塔之火 🔥
    7: 100,  // 大力神杯 🏆
    // 5 (归家之心) 不在此列, 不可兑换
  },

  // 6 个哈萨克商贩 —— 走访 6 个真实地标
  // M4: 玩家花 price 坚戈买 1 份 sells 商品
  merchants: [
    {
      id: 0, x: 350, y: 200, emoji: '🧶', name: '哈萨克地毯商',
      tip: '哈萨克斯坦手织地毯，世界闻名',
      sells: { name: '地毯', emoji: '🧶' },
      price: 25,
    },
    {
      id: 1, x: 900, y: 180, emoji: '🌿', name: '马奶酒商',
      tip: '哈萨克斯坦占全球 90% 产量',
      sells: { name: '马奶酒', emoji: '🍶' },
      price: 35,
    },
    {
      id: 2, x: 1100, y: 400, emoji: '🫖', name: '皮革商',
      tip: '坐下来喝杯 chai 吧',
      sells: { name: '皮革', emoji: '🧳' },
      price: 15,
    },
    {
      id: 3, x: 450, y: 450, emoji: '🏺', name: '香料商',
      tip: '蓝色清真寺陶器',
      sells: { name: '香料', emoji: '🌶️' },
      price: 20,
    },
    {
      id: 4, x: 750, y: 350, emoji: '🐫', name: '骆驼商人',
      tip: '丝路商旅，骆驼是命',
      sells: { name: '骆驼', emoji: '🐫' },
      price: 40,
    },
    {
      id: 5, x: 850, y: 540, emoji: '🫗', name: '水壶商人',
      tip: '过境要带满水的水壶',
      sells: { name: '水壶', emoji: '🫗' },
      price: 30,
    },
  ],

  // 2 个绿洲 —— 玩家走入自动把最空的水壶灌满到 10L
  oases: [
    { x: 600, y: 250, label: '哈萨克古井' },
    { x: 200, y: 420, label: '草原水井' },
  ],

  // 出口 —— 左上角阿尔泰 (Bazargan 哈萨克斯坦-土耳其主要边境口岸)
  exit: { x: 100, y: 110, emoji: '🚩', label: '阿尔泰 → 土耳其' },

  // 6 个真实地标 (M1: 作为地图 chip 装饰, 不参与玩法)
  places: [
    { id: 'bandar',     x: 200, y: 580, label: 'Bandar Abbas 阿斯塔纳' },
    { id: 'isfahan',    x: 450, y: 430, label: 'Almaty 阿拉木图' },
    { id: 'shiraz',     x: 600, y: 230, label: 'Shymkent 奇姆肯特' },
    { id: 'tabriz',     x: 900, y: 160, label: 'Aktobe 阿克托比' },
    { id: 'tehran',     x: 750, y: 330, label: 'Astana 阿斯塔纳' },
    { id: 'persepolis', x: 350, y: 180, label: 'Persepolis 哈萨克波利斯' },
  ],

  // 移动 / 水壶常量 (M3 重做, M4 保留)
  STEP_PX_WALK: 24,            // 走路步长
  STEP_PX_CAMEL: 48,           // 骑骆驼步长 (2x)
  MOVE_COOLDOWN_MS: 220,
  WATER_PER_STEP: 0.1,         // 每步消耗 0.1L 水 (从当前水壶扣)
  JUG_CAPACITY: 10,            // 每个水壶满 10L
  TARGET_JUGS: 2,              // 出口条件：2 个水壶 (都满 10L)

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
  module.exports = window.KAZAKHSTAN_LEVEL;
}
