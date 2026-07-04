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

  // 7 个礼物 —— 顺序即礼物 id（关 0 主线 6 + 1 个隐藏 World Cup）
  // M11: 加 price 字段（船票兑换总价门槛用）, 把礼物移到 place chip 紧邻位置（视觉聚拢）
  gifts: [
    { id: 0, x: 580, y: 320, name: '沙漠之眼',  hint: '给关 1「伊朗·沙漠骆驼」的礼物',     emoji: '👁️', placeId: 'souq_waqif',     price: 25 },
    { id: 1, x: 380, y: 460, name: '风之物语',  hint: '给关 2「土耳其·热气球」的礼物',     emoji: '🎈', placeId: 'islamic_museum', price: 30 },
    { id: 2, x: 240, y: 240, name: '草原之歌',  hint: '给关 3「哈萨克·草原骑马」的礼物',   emoji: '🌾', placeId: 'aspire_park',    price: 40 },
    { id: 3, x: 160, y: 480, name: '雪山之钥',  hint: '给关 4「新疆·雪山滑雪」的礼物',     emoji: '❄️', placeId: 'hamad_airport',  price: 15 },
    { id: 4, x: 1100, y: 450, name: '归家之心', hint: '给关 5「成都·到家」的礼物',         emoji: '🏠', placeId: 'the_pearl',      price: 60 },
    { id: 5, x: 1110, y: 360, name: '大海之信', hint: '关 5 之后的隐藏奖励',                emoji: '🌊', placeId: 'corniche',       price: 50 },
    // M9.5g: 第 7 个礼物 — Lusail Stadium 2022 World Cup 奖杯 (大力神杯)
    { id: 6, x: 920, y: 220, name: '大力神杯', hint: '🇶🇦 卡塔尔 2022 世界杯 🇶🇦 — Lusail Stadium 主场', emoji: '🏆', placeId: 'lusail_stadium', price: 100 },
  ],

  // 7 个真实地名 — 英文 + 远离 HUD/dpad 区域 (M9.5g)
  places: [
    // airport 抬到 y=520 (避 dpad 620), museum 在 y=460 (与 airport 距离 220px + chip 100px, OK)
    { id: 'hamad_airport',   x: 200,  y: 520, label: 'Hamad Airport' },
    { id: 'islamic_museum',  x: 420,  y: 460, label: 'Museum of Islamic Art' },
    { id: 'souq_waqif',      x: 580,  y: 340, label: 'Souq Waqif' },
    { id: 'corniche',        x: 1110, y: 320, label: 'Corniche' },
    { id: 'the_pearl',       x: 1050, y: 470, label: 'The Pearl' },
    { id: 'aspire_park',     x: 280,  y: 240, label: 'Aspire Park' },
    // lusail 掉到 y=180 (避 HUD 顶栏 y=36 + 高度 72, 留 18px 间距)
    { id: 'lusail_stadium',  x: 880,  y: 180, label: 'Lusail Stadium' },
  ],

  // 老商人 NPC —— M11 改为港口 NPC (Mesaieed Port 梅赛伊德港)
  // 港口是卡塔尔最大货运港, 也是去伊朗的传统航线起点.
  // emoji ⚓ 海蓝主题 (L.port), 位置挪到 (280, 660) 下方避 dpad 区域.
  // 玩家拾满 6 件后来此兑换船票.
  port: { x: 280, y: 660, emoji: '⚓', name: 'Mesaieed Port 梅赛伊德港',
         line: '梅赛伊德港是卡塔尔最大的货运港口, 也是去伊朗的传统航线起点. 带上你的礼物来兑换船票吧. ⚓' },

  // NPC banner 4 帧文案（最后一帧是找到 Lusail Stadium 触发的 World Cup 文案）
  npcFrames: [
    '欢迎来到多哈，旅人。这里是丝绸之路的起点——是拥抱大海的沙漠。',
    '你走了很远了，再往前走…别忘了补水分。',
    '沙海记住了你的每一步。',
    '🏆 你找到了卡塔尔的世界杯主场 — Lusail Stadium！它见证了 2022 年那个冬天的辉煌。',
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
  // M11: LUGGAGE_MAX 5 —— 6 件礼物必须挑 5 件带走，留 1 件后面买 (取舍策略保留).
  // 同时港口船票兑换要 总价 >= PORT_TICKET_PRICE_THRESHOLD, 拾满 6 但行李只装 5 件是合法的.
  LUGGAGE_MAX: 5,
  MIN_PICKUPS_TO_CLAIM: 3,    // 至少拾取 3 件才能领奖
  CANVAS_W: 1280,
  CANVAS_H: 720,
};

// 暴露给 node 离线验证（Verification Step 6/7）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.QATAR_LEVEL;
}