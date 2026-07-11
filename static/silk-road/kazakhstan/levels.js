// 哈萨克斯坦·草原套马 —— 关卡配置

window.KAZAKHSTAN_LEVEL = {
  // 调试开关
  DEBUG: false,

  // 套马场景配置
  taming: {
    horseCount: 6,           // 野马数量
    requiredCatches: 3,      // 需要套中的次数
    maxMisses: 5,            // 最多允许套空次数
    timeLimit: 30000,        // 限时 30 秒

    // 难度递增
    speeds: [80, 120, 160],  // 三次套马的速度（像素/秒）

    // 套马索参数
    rope: {
      throwDuration: 600,    // 抛出时间（ms）
      maxDistance: 300,      // 最大距离
      circleRadius: 40,      // 套圈半径
    }
  },

  // 地图配置
  map: {
    width: 1280,
    height: 720,
    playerStart: { x: 100, y: 600 },
    exitPosition: { x: 50, y: 50 },
  },

  // 蒙古包驿站
  yurts: [
    {
      id: 'saddle',
      kind: 'yurt',
      x: 300, y: 400,
      emoji: '🏇',
      name: '马具驿站',
      items: [
        { id: 'saddle_upgrade', name: '升级马鞍', emoji: '🐴', price: 100, desc: '速度 +30%' }
      ]
    },
    {
      id: 'bow',
      kind: 'yurt',
      x: 700, y: 300,
      emoji: '🏹',
      name: '弓箭驿站',
      items: [
        { id: 'bow', name: '弓箭', emoji: '🏹', price: 80, desc: '路上打猎用' }
      ]
    },
    {
      id: 'dairy',
      kind: 'yurt',
      x: 500, y: 500,
      emoji: '🥛',
      name: '奶制品驿站',
      items: [
        { id: 'kumis', name: '马奶酒', emoji: '🥛', price: 60, desc: '补充体力 +20', required: true }
      ]
    },
    {
      id: 'eagle',
      kind: 'yurt',
      x: 900, y: 200,
      emoji: '🦅',
      name: '鹰猎驿站',
      items: [
        { id: 'eagle', name: '猎鹰', emoji: '🦅', price: 120, desc: '增加视野范围' }
      ]
    },
    {
      id: 'fur',
      kind: 'yurt',
      x: 1000, y: 600,
      emoji: '🧥',
      name: '毛皮驿站',
      items: [
        { id: 'warm_clothes', name: '保暖衣物', emoji: '🧥', price: 150, desc: '新疆雪山防寒', required: true }
      ]
    },
    {
      id: 'map',
      kind: 'yurt',
      x: 800, y: 600,
      emoji: '🗺️',
      name: '地图驿站',
      items: [
        { id: 'steppe_map', name: '草原地图', emoji: '🗺️', price: 50, desc: '显示最优路线' }
      ]
    }
  ],

  // 货币兑换（多货币 + 真实汇率）
  // 真实汇率约 2024 年：1 源币 = perKzt 坚戈
  exchange: {
    position: { x: 200, y: 600 },
    name: '货币兑换',
    emoji: '💱',
    rates: {
      TRY: { symbol: '₺', name: '土耳其里拉', perKzt: 13, localStorageKey: 'silkroad_turkey_coins' },
      IRR: { symbol: '﷼', name: '伊朗里亚尔', perKzt: 0.0011, localStorageKey: 'silkroad_iran_coins' },
    },
  },

  // 集市交易 (草原特产, 非货币兑换)
  marketplace: {
    position: { x: 1100, y: 200 },
    name: '集市',
    emoji: '🛒',
    items: [
      { id: 'cheese',      name: '奶酪块',   emoji: '🧀', price:  50, desc: '草原奶酪，耐放' },
      { id: 'jerky',       name: '风干牛肉', emoji: '🥩', price:  80, desc: '路上充饥' },
      { id: 'fur_decor',   name: '皮毛挂饰', emoji: '🦊', price: 120, desc: '哈萨克传统工艺' },
      { id: 'craft',       name: '手工艺品', emoji: '🎨', price: 150, desc: '精美丝路纪念品' },
      { id: 'kumis',       name: '马奶酒',   emoji: '🥛', price:  60, desc: '补充体力 +20', required: true },
    ]
  },

  // 商品出售价格表（用于需求 2 交易中心 + 需求 5 行李 modal）
  // key 既支持数字又支持字符串 ('-1000')（参考土耳其 game.js 1452-1468 防御性转换）
  sellPrices: {
    // 卡塔尔礼物 (id 0-7, 折算成 ₸)
    0: { name: '沙漠玫瑰', emoji: '🌹', price: 2500 },
    1: { name: '古兰经', emoji: '📖', price: 3300 },
    2: { name: '游隼', emoji: '🦅', price: 2000 },
    3: { name: '波斯湾珍珠', emoji: '🦪', price: 3000 },
    4: { name: '天然气', emoji: '🏭', price: 5000 },
    // 5 (❤️ 归家之心) 不可卖 — 不写
    6: { name: '火炬塔之火', emoji: '🔥', price: 4200 },
    7: { name: '大力神杯', emoji: '🏆', price: 8300 },
    // 伊朗商贩商品 (id -1000 ~ -1005，字符串 key)
    '-1000': { name: '地毯', emoji: '🧶', price: 800 },
    '-1001': { name: '藏红花', emoji: '🌿', price: 1200 },
    '-1002': { name: '茶', emoji: '🫖', price: 500 },
    '-1003': { name: '陶器', emoji: '🏺', price: 700 },
    '-1004': { name: '骆驼', emoji: '🐫', price: 1300 },
    '-1005': { name: '水壶', emoji: '🏺', price: 1000 },
  },

  // 本地购买商品（哈萨克 yurt + 集市）的 emoji+name 查表（行李 modal 兜底）
  // 注意：行李 modal 优先查 sellPrices，再查 yurt.items 里的 emoji/name，最后查这里
  luggageFallback: {
    saddle_upgrade: { name: '升级马鞍', emoji: '🐴' },
    bow:            { name: '弓箭',    emoji: '🏹' },
    kumis:          { name: '马奶酒',  emoji: '🥛' },
    eagle:          { name: '猎鹰',    emoji: '🦅' },
    warm_clothes:   { name: '保暖衣物', emoji: '🧥' },
    steppe_map:     { name: '草原地图', emoji: '🗺️' },
    cheese:         { name: '奶酪块',   emoji: '🧀' },
    jerky:          { name: '风干牛肉', emoji: '🥩' },
    fur_decor:      { name: '皮毛挂饰', emoji: '🦊' },
    craft:          { name: '手工艺品', emoji: '🎨' },
    // HEART 归家之心 (id 5, 卡塔尔礼物, 不可卖)
    5: { name: '归家之心', emoji: '❤️' },
  },

  // 出发条件
  departure: {
    requiredItems: ['warm_clothes', 'kumis'],
    exitZone: { x: 1200, y: 400, radius: 60 }
  },

  // 移动参数
  movement: {
    walkSpeed: 120,         // 步行速度
    rideSpeed: 240,         // 骑马速度（2倍）
    cooldown: 200           // 移动冷却（ms）
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.KAZAKHSTAN_LEVEL;
}
