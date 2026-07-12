// 新疆·天山滑雪 —— 关卡配置 (关 4)
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 一路下滑到成都
//   BootScene → SlidingScene (重点剧情: 15s 滑雪, 飘雪+滑痕+NPC) → DepartScene (过场) → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
// v2 (2026-07-12): 砍掉 ShoppingScene, 重点打磨滑雪剧情

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

    // v2 新增: 开场/剧情参数
    introDuration: 800,        // 开场山巅远眺 fade 时长 (ms)
    snowTrailInterval: 50,     // 滑痕采样间隔 (ms)
    snowTrailFadeMs: 1500,     // 滑痕淡出时长
    snowParticleRate: 60,      // 飘雪粒子生成频率 (ms/批)
    npcBonusTime: 1000,        // 撞 NPC 增加时间 (ms)
  },

  // 障碍物列表 (含 v2 新增 friendly_npc)
  obstacles: [
    { id: 'tree',    emoji: '🌲',     size: 48, color: 0x2E7D32, weight: 0.45 },
    { id: 'rock',    emoji: '🪨',     size: 42, color: 0x9E9E9E, weight: 0.30 },
    { id: 'snow',    emoji: '❄️',     size: 38, color: 0xE3F2FD, weight: 0.10 },
    { id: 'friendly_npc', emoji: '👨‍🌾', size: 44, color: 0xD2691E, weight: 0.15 },
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