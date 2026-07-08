// 伊朗·阿巴斯港大巴扎 —— 关 1 关卡配置（M1 Phaser 3 重做版）
//
// 数据格式参考卡塔尔关 0 (window.QATAR_LEVEL) 风格，但用 window.IRAN_LEVEL 命名空间。
// 玩家不再是 DOM 卡片游戏，而是 Phaser 场景：人物在沙漠地图上行走，
// 走访波斯商贩 (merchants)、喝绿洲水 (oases)、集齐 🐪 + 💧 启程去土耳其 (exit)。
//
// 坐标系统：1280×720，左上原点。
// 商贩分布：5 个真实城市地标附近（设拉子/伊斯法罕/德黑兰/大不里士/波斯波利斯）。
// 绿洲：2 个（波斯古井、坎儿井）—— 走入 < 40px 自动 +2 水分。

window.IRAN_LEVEL = {
  // 关 1 玩家起点 —— 阿巴斯港 (Bandar Abbas) 左下角
  start: { x: 160, y: 600 },

  // 5 个波斯商贩 —— 走访 5 个真实地标
  // 接受一组商品 id (从 QATAR_LEVEL.gifts 来), reward type 是 camel/water
  merchants: [
    {
      id: 0, x: 350, y: 200, emoji: '🧶', name: '波斯地毯商',
      tip: '伊朗手织地毯，世界闻名',
      accept: [3, 4, 0], reward: { type: 'camel', n: 1 },
    },
    {
      id: 1, x: 900, y: 180, emoji: '🌿', name: '藏红花商',
      tip: '伊朗占全球 90% 产量',
      accept: [1, 6], reward: { type: 'water', n: 1 },
    },
    {
      id: 2, x: 1100, y: 400, emoji: '🫖', name: '茶馆老板',
      tip: '坐下来喝杯 chai 吧',
      accept: [7, 2], rejectHeart: true, reward: { type: 'camel', n: 1 },
    },
    {
      id: 3, x: 450, y: 450, emoji: '🏺', name: '伊斯法罕陶匠',
      tip: '蓝色清真寺陶器',
      accept: [0, 1], reward: { type: 'water', n: 1 },
    },
    {
      id: 4, x: 750, y: 350, emoji: '🐫', name: '骆驼商人',
      tip: '丝路商旅，骆驼是命',
      accept: [4, 6], reward: { type: 'camel', n: 1 },
    },
  ],

  // 2 个绿洲 —— 玩家走入 +2 水分 (冷却 2 秒)
  oases: [
    { x: 600, y: 250, label: '波斯古井' },
    { x: 200, y: 420, label: '坎儿井' },
  ],

  // 出口 —— 启程去土耳其
  exit: { x: 1100, y: 620, emoji: '🚪', label: '启程 → 土耳其' },

  // 6 个真实地标 (M1: 作为地图 chip 装饰, 不参与玩法)
  places: [
    { id: 'bandar',     x: 160, y: 600, label: 'Bandar Abbas 阿巴斯港' },
    { id: 'isfahan',    x: 450, y: 430, label: 'Isfahan 伊斯法罕' },
    { id: 'shiraz',     x: 600, y: 230, label: 'Shiraz 设拉子' },
    { id: 'tabriz',     x: 900, y: 160, label: 'Tabriz 大不里士' },
    { id: 'tehran',     x: 750, y: 330, label: 'Tehran 德黑兰' },
    { id: 'persepolis', x: 350, y: 180, label: 'Persepolis 波斯波利斯' },
  ],

  // 移动 / 资源常量 (M1: 走路 + 骑骆驼的步长)
  STEP_PX_WALK: 24,            // 走路步长
  STEP_PX_CAMEL: 48,           // 骑骆驼步长 (2x)
  MOVE_COOLDOWN_MS: 220,
  WATER_PER_STEP: 0.1,         // 每步 -0.1 水分
  WATER_OASIS_REWARD: 2,       // 绿洲 +2
  WATER_MAX: 10,
  // 商贩交易 + camel/water 阈值 (M2 用, M1 暂作展示)
  TARGET_CAMELS: 3,
  TARGET_WATERS: 3,

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
