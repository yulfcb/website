// 新疆·天山滑雪 —— 关卡配置 (关 4)
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 滑下雪山 → 购买补给 → 出发去成都
//   BootScene → SlidingScene (下滑) → ShoppingScene (购买补给) → DepartScene (过场) → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道

window.XINJIANG_LEVEL = {
  // 调试开关
  DEBUG: false,

  // ============== SlidingScene 配置 ==============
  sliding: {
    timeLimit: 15000,          // 限时 15 秒
    initialSpeed: 150,         // 初始下滑速度 (px/s)
    maxSpeed: 320,             // 最大下滑速度
    moveSpeed: 280,            // 左右移动速度
    obstacleInterval: 1100,    // 障碍物生成间隔 (ms)
    obstacleMinGap: 240,       // 障碍物最小横向距离
    startY: 80,                // 玩家起始 y
    finishY: 700,              // 通关 y (屏幕底部)
    initialX: 640,             // 玩家起始 x (屏幕中央)
    playerHalfW: 22,           // 玩家 hitbox 半宽
    playerHalfH: 28,           // 玩家 hitbox 半高
    snowLineY: 280,            // 雪线 (雪山/草原分界)
  },

  obstacles: [
    { id: 'tree',  emoji: '🌲', size: 48, color: 0x2E7D32, weight: 0.55 },
    { id: 'rock',  emoji: '🪨', size: 42, color: 0x9E9E9E, weight: 0.35 },
    { id: 'snow',  emoji: '❄️', size: 38, color: 0xE3F2FD, weight: 0.10 },
  ],

  // ============== ShoppingScene 配置 ==============
  shopping: {
    initialCoins: 500,
    requiredItemIds: ['meat_skewer', 'warmer'],  // 必须买齐的 2 件
    departure: {
      exitZone: { x: 1150, y: 380, radius: 70 },
    },
  },

  // 3 个商铺 (玩家需要购买 2 件 required 物品才能出发)
  shops: [
    {
      id: 'meat',
      x: 280, y: 280,
      emoji: '🍢',
      name: '羊肉串店',
      kind: 'tent',
      items: [
        { id: 'meat_skewer', name: '羊肉串', emoji: '🍢', price: 60, desc: '恢复体力 +30', required: true },
      ],
    },
    {
      id: 'warmer',
      x: 700, y: 450,
      emoji: '🔥',
      name: '暖宝宝店',
      kind: 'tent',
      items: [
        { id: 'warmer', name: '暖宝宝', emoji: '🔥', price: 40, desc: '防寒 +20', required: true },
      ],
    },
    {
      id: 'cheese',
      x: 980, y: 240,
      emoji: '🧀',
      name: '奶酪店',
      kind: 'tent',
      items: [
        { id: 'cheese', name: '奶酪块', emoji: '🧀', price: 80, desc: '路上充饥' },
      ],
    },
  ],

  // ============== 出发条件 ==============
  departure: {
    requiredItems: ['meat_skewer', 'warmer'],
    exitZone: { x: 1150, y: 380, radius: 70 },
  },

  // ============== 移动参数 ==============
  movement: {
    walkSpeed: 140,
    cooldown: 200,
  },

  // ============== 背景 ==============
  map: {
    width: 1280,
    height: 720,
    playerStart: { x: 200, y: 560 },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.XINJIANG_LEVEL;
}