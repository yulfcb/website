// 新疆·天山滑雪 —— 关卡配置 (关 4)
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 一路下滑到成都
//   BootScene → SlidingScene (4 段 biome + 5 种奖品, 45s 沉浸) → DepartScene → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      玩家固定屏幕 1/3, 4 段 biome 顺坡度加速, 撞奖品触发独特效果
//
// v2 (2026-07-12): 砍掉 ShoppingScene, 重点打磨滑雪剧情
// v3 (2026-07-12): biome 系统 + 连续坡度 + 3 层视差 + 5 种新疆主题奖品
// v4 (2026-07-12): 视差加大 (0.4/0.7/1.2) + 玩家 y 移到中下 (480) +
//                  屏幕 DOM 方向键 (←/→/▲/▼) + 手动加速/减速 +
//                  biome 4 草原延长到 1500 + 终点成都小屋拱门

window.XINJIANG_LEVEL = {
  // 调试开关
  DEBUG: false,

  // ============== SlidingScene 配置 ==============
  sliding: {
    timeLimit: 45000,            // 限时 45 秒 (v3: 15s → 45s)
    baseSpeed: 80,               // 基础下滑速度 (v3: 150 → 80, 用户反馈"不能跑太快")
    initialSpeed: 80,            // 初始速度 (兼容字段, 等同 baseSpeed)
    minSpeed: 40,                // 最小速度 (坡度变缓时)
    maxSpeed: 280,               // 最大下滑速度 (v3: 320 → 280)
    slopeCoefficient: 60,        // v3 新增: 坡度 → 速度加成系数 (slope 0.3→+18, 1.5→+90)
    accelerationCoefficient: 30, // v3 新增: 坡度变化 → 加速度 (惯性)
    moveSpeed: 280,              // 左右移动速度 (不变)
    obstacleInterval: 800,       // 障碍物生成间隔 (v3: 1100 → 800, 时间更长, 障碍密一些)
    prizeInterval: 1200,         // v3 新增: 奖品生成间隔
    obstacleMinGap: 220,         // 障碍物最小横向距离
    prizeMinGap: 280,            // v3 新增: 奖品最小横向距离

    // v4 新增: 手动加速/减速
    manualBoostPress: 60,        // 按下 ▼ 时 +60, 按下 ▲ 时 -60, 松开 = 0
    // v4 新增: 视差比例 (加大, 让"地图往上走"更明显)
    parallaxFar: 0.4,
    parallaxMid: 0.7,
    parallaxNear: 1.2,

    startY: 80,                  // 玩家起始 y (兼容字段)
    finishY: 700,                // 通关 y (兼容字段, 不再使用)
    playerScreenY: 320,          // v8: 玩家固定屏幕 y (中上, 720 高画面的 320 = 上 1/3)
    initialX: 640,               // 玩家起始 x (屏幕中央)
    playerHalfW: 22,             // 玩家 hitbox 半宽
    playerHalfH: 28,             // 玩家 hitbox 半高
    snowLineY: 280,              // 雪线 (兼容字段)

    // v2 保留: 开场/剧情参数
    introDuration: 800,          // 开场山巅远眺 fade 时长 (ms)
    snowTrailInterval: 50,       // 滑痕采样间隔 (ms)
    snowTrailFadeMs: 1500,       // 滑痕淡出时长
    snowParticleRate: 60,        // 飘雪粒子生成频率 (ms/批)
    npcBonusTime: 1000,          // 撞 NPC 增加时间 (ms)

    // v3 新增: biome 切换 + 失败条件
    biomeTransitionDuration: 500, // biome 切换淡入淡出时长 (ms)
    maxCrashes: 8,               // 撞墙 8 次 = 失败 (v3: 5 → 8, 时长更长)
  },

  // ============== v3 新增: 4 段 Biome 系统 ==============
  // 每段 biome 有自己的远景/中景/近景色 + 坡度范围 + 段长 + 主题障碍物
  // v4: biome 4 草原延长到 1500, 包含屋前小路 (600px) + 成都小屋 (900px)
  // 总长: 1200 + 1400 + 1300 + 1500 = 5400 px 滚动距离, 在 ~45s 内完成
  biomes: [
    {
      id: 'snow_peak',
      name: '🏔️ 雪山顶',
      slopeMin: 0.3, slopeMax: 0.5,   // 缓坡起步
      segmentLength: 1200,
      farColor: 0xECEFF1, farColor2: 0xF5F5F5,   // 雪山轮廓 (远, 浅灰蓝)
      midColor: 0xB0BEC5,                            // 山脊 (灰)
      nearColor: 0xFFFFFF,                           // 雪原 (白)
      skyColor: 0xB3E5FC,                            // 天空浅蓝
      obstacles: [
        { id: 'snow_pile',   emoji: '❄️',  size: 38, weight: 0.50 },
        { id: 'ice_column',  emoji: '🧊',  size: 36, weight: 0.35 },
        { id: 'friendly_npc', emoji: '👨‍🌾', size: 44, weight: 0.15 },
      ],
    },
    {
      id: 'pine_forest',
      name: '🌲 针叶林',
      slopeMin: 0.5, slopeMax: 1.0,   // 中坡
      segmentLength: 1400,
      farColor: 0x2E7D32, farColor2: 0x1B5E20,   // 针叶林 (深绿)
      midColor: 0x388E3C,                            // 林间
      nearColor: 0xE8F5E9,                           // 雪+松针
      skyColor: 0xBBDEFB,
      obstacles: [
        { id: 'pine',        emoji: '🌲',  size: 48, weight: 0.50 },
        { id: 'log',         emoji: '🪵',  size: 40, weight: 0.35 },
        { id: 'friendly_npc', emoji: '👨‍🌾', size: 44, weight: 0.15 },
      ],
    },
    {
      id: 'glacier',
      name: '❄️ 冰川',
      slopeMin: 1.0, slopeMax: 1.5,   // 陡坡 (最快!)
      segmentLength: 1300,
      farColor: 0x4FC3F7, farColor2: 0xB3E5FC,   // 冰山轮廓 (浅蓝)
      midColor: 0x0288D1,                            // 冰裂缝 (深蓝)
      nearColor: 0xE1F5FE,                           // 冰面 (浅蓝)
      skyColor: 0xE1F5FE,
      obstacles: [
        { id: 'iceberg',     emoji: '🧊',  size: 50, weight: 0.45 },
        { id: 'crevasse',    emoji: '⚠️',  size: 42, weight: 0.40 },
        { id: 'friendly_npc', emoji: '👨‍🌾', size: 44, weight: 0.15 },
      ],
    },
    {
      id: 'grassland',
      name: '🌾 山脚草原 → 成都',
      slopeMin: 0.3, slopeMax: 0.6,   // 平缓收尾
      segmentLength: 1500,            // v4: 1100 → 1500, 多出 400 给屋前小路 + 成都小屋
      farColor: 0xFFFFFF, farColor2: 0xECEFF1,   // 雪山轮廓 (远, 白)
      midColor: 0x7CB342,                            // 草原 (绿)
      nearColor: 0x558B2F,                           // 草地
      skyColor: 0xBBDEFB,
      obstacles: [
        { id: 'rock',        emoji: '🪨',  size: 42, weight: 0.45 },
        { id: 'bush',        emoji: '🌿',  size: 40, weight: 0.40 },
        { id: 'friendly_npc', emoji: '👨‍🌾', size: 44, weight: 0.15 },
      ],
      // v4 新增: 屋前/小屋参数 (segmentLength 后 600 出现引导, 末尾是屋门)
      houseStart: 600,                // biome 4 内 scrollY offset, 开始显示"屋前小路"
      houseEnd: 1500,                 // biome 4 末尾 = 滑进屋门, 通关触发点
      housePromptOffset: 200,         // 距 houseEnd 200px 时显示"即将到家"提示
    },
  ],

  // ============== v3 新增: 5 种新疆主题奖品 ==============
  // 每种奖品有独特效果, 撞到触发对应效果
  prizes: [
    { id: 'grape',      emoji: '🍇', name: '葡萄干', color: 0x6A1B9A, effect: 'score',  value: 10,    weight: 0.25 },
    { id: 'melon',      emoji: '🍈', name: '哈密瓜', color: 0x66BB6A, effect: 'time',   value: 2000,  weight: 0.20 },
    { id: 'skewer',     emoji: '🍢', name: '羊肉串', color: 0xD84315, effect: 'shield', duration: 5000, weight: 0.15 },
    { id: 'snow_lotus', emoji: '❄️', name: '雪莲',   color: 0xE1F5FE, effect: 'magnet', duration: 5000, weight: 0.15 },
    { id: 'naan',       emoji: '🫓', name: '馕饼',   color: 0xD7A86E, effect: 'slow',   duration: 3000, weight: 0.25 },
  ],

  // ============== DepartScene 配置 (过场动画) ==============
  departure: {
    // 7s 三段动画 + RGB lerp, 全程由 DepartScene 内部硬编码
    skyColor: 0xFFE9B0,        // 暖橙起点 (终点成都)
    snowColor: 0xFFFFFF,       // 雪山白 (起点)
    hillStart: 0xB0BEC5,        // 灰山 (起点)
    hillEnd: 0x7CB342,          // 草原绿 (终点)
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.XINJIANG_LEVEL;
}