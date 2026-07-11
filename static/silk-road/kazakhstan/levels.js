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
      x: 300, y: 400,
      emoji: '🏇',
      name: '马具驿站',
      items: [
        { id: 'saddle_upgrade', name: '升级马鞍', price: 100, desc: '速度 +30%' }
      ]
    },
    {
      id: 'bow',
      x: 700, y: 300,
      emoji: '🏹',
      name: '弓箭驿站',
      items: [
        { id: 'bow', name: '弓箭', price: 80, desc: '路上打猎用' }
      ]
    },
    {
      id: 'dairy',
      x: 500, y: 500,
      emoji: '🥛',
      name: '奶制品驿站',
      items: [
        { id: 'kumis', name: '马奶酒', price: 60, desc: '补充体力 +20', required: true }
      ]
    },
    {
      id: 'eagle',
      x: 900, y: 200,
      emoji: '🦅',
      name: '鹰猎驿站',
      items: [
        { id: 'eagle', name: '猎鹰', price: 120, desc: '增加视野范围' }
      ]
    },
    {
      id: 'fur',
      x: 1100, y: 400,
      emoji: '🧥',
      name: '毛皮驿站',
      items: [
        { id: 'warm_clothes', name: '保暖衣物', price: 150, desc: '新疆雪山防寒', required: true }
      ]
    },
    {
      id: 'map',
      x: 800, y: 600,
      emoji: '🗺️',
      name: '地图驿站',
      items: [
        { id: 'steppe_map', name: '草原地图', price: 50, desc: '显示最优路线' }
      ]
    }
  ],

  // 货币兑换
  exchange: {
    fromCurrency: '₺',      // 土耳其里拉
    toCurrency: '₸',        // 哈萨克坚戈
    rate: 5,                // 1 ₺ = 5 ₸
    position: { x: 200, y: 600 }
  },

  // 出发条件
  departure: {
    requiredItems: ['warm_clothes', 'kumis'],
    exitZone: { x: 50, y: 50, radius: 60 }
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
