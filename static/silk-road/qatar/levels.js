// 卡塔尔·多哈·沙海寻路 —— 关 0 关卡配置（M8 Phaser 3 重做版）
//
// 数据格式与 M5 一致（坐标、礼物、绿洲、NPC 文案），但挂到 window.QATAR_LEVEL
// 供 Phaser game.js 读取。不再依赖 DOM 元素。
//
// 坐标系统：1280×720，左上原点。
//
// 6 个礼物：拾取 → 弹 Phaser modal → 选 [装进/留后/放弃] → 装进占 1 行李位（最多 5）。
// 2 个绿洲：玩家走上去 +2 水分（不超过 10）。
// 6 个真实地名：作为 Phaser Text chip 浮动，纯装饰。

window.QATAR_LEVEL = {
  // 关 0 玩家起点 —— Hamad Airport 左下角附近
  start: { x: 200, y: 580 },

  // 2 个绿洲
  oases: [
    { x: 480, y: 280, label: 'Al Bidda Park 绿地' },
    { x: 980, y: 540, label: 'Katara 绿洲' },
  ],

  // 6 个礼物 —— 顺序即礼物 id
  gifts: [
    { id: 0, x: 520, y: 380, name: '沙漠之眼',  hint: '给关 1「伊朗·沙漠骆驼」的礼物',     emoji: '👁️', placeId: 'souq_waqif' },
    { id: 1, x: 380, y: 560, name: '风之物语',  hint: '给关 2「土耳其·热气球」的礼物',     emoji: '🎈', placeId: 'islamic_museum' },
    { id: 2, x: 320, y: 200, name: '草原之歌',  hint: '给关 3「哈萨克·草原骑马」的礼物',   emoji: '🌾', placeId: 'aspire_park' },
    { id: 3, x: 240, y: 540, name: '雪山之钥',  hint: '给关 4「新疆·雪山滑雪」的礼物',     emoji: '❄️', placeId: 'hamad_airport' },
    { id: 4, x: 1020, y: 380, name: '归家之心', hint: '给关 5「成都·到家」的礼物',         emoji: '🏠', placeId: 'the_pearl' },
    { id: 5, x: 1080, y: 200, name: '大海之信', hint: '关 5 之后的隐藏奖励',                emoji: '🌊', placeId: 'corniche' },
  ],

  // 6 个真实地名
  places: [
    { id: 'hamad_airport',   x: 200,  y: 600, label: 'Hamad Airport 多哈国际机场' },
    { id: 'islamic_museum',  x: 420,  y: 600, label: 'Museum of Islamic Art 伊斯兰艺术博物馆' },
    { id: 'souq_waqif',      x: 580,  y: 340, label: 'Souq Waqif 瓦其夫老市场' },
    { id: 'corniche',        x: 1110, y: 240, label: 'Corniche 滨海大道' },
    { id: 'the_pearl',       x: 1050, y: 420, label: 'The Pearl 人造岛' },
    { id: 'aspire_park',     x: 280,  y: 240, label: 'Aspire Park 体育公园' },
  ],

  // 老商人 NPC —— 移出 Souq Waqif 区域（避开 gifts[0] 沙漠之眼在 souq_waqif），
  // 放到地图东北角空白区，玩家要"专门去找"他才能触发对话。
  merchant: { x: 1080, y: 100, emoji: '👳', line: '给心上人的礼物，要发自真心。要带走几件，看你的取舍。' },

  // NPC banner 3 帧文案
  npcFrames: [
    '欢迎来到多哈，旅人。这里是丝绸之路的起点——是拥抱大海的沙漠。',
    '你走了很远了，再往前走…别忘了补水分。',
    '沙海记住了你的每一步。',
  ],

  // 4 档奖励金额（与 game.js 里 QATAR_REWARD_TIERS 一致；前端展示用）
  rewardTiers: {
    PERFECT: 20.20,
    NORMAL:  13.14,
    HARD:    6.66,
    DEAD:    0,
  },

  // 4 档 NPC 文案
  tierQuotes: {
    PERFECT: '你让沙漠绽出了花。',
    NORMAL:  '够了，这就是旅途的样子。',
    HARD:    '三个故事，也够我走完这一生。',
    DEAD:    '沙海很热，但你的心没有停下。',
  },

  // 关 0 移动 / 资源常量
  STEP_PX: 24,                // 每次按键移动 24 像素
  MOVE_COOLDOWN_MS: 220,      // 按键冷却（M9.2：按住持续走时调短）
  WATER_PER_STEP: 0.1,        // 每步 -0.1
  WATER_BOUNDARY_HIT: 0.5,    // 撞边界 -0.5
  WATER_OASIS_REWARD: 2,      // 绿洲 +2
  WATER_MAX: 10,
  LUGGAGE_MAX: 5,
  MIN_PICKUPS_TO_CLAIM: 3,    // 至少拾取 3 件才能领奖
  CANVAS_W: 1280,
  CANVAS_H: 720,
};

// 暴露给 node 离线验证（Verification Step 6/7）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.QATAR_LEVEL;
}