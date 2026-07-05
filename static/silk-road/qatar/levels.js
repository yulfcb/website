// 卡塔尔·多哈·沙海寻路 —— 关 0 关卡配置（M8 Phaser 3 重做版）
//
// 数据格式与 M5 一致（坐标、礼物、绿洲、NPC 文案），但挂到 window.QATAR_LEVEL
// 供 Phaser game.js 读取。不再依赖 DOM 元素。
//
// 坐标系统：1280×720，左上原点。
//
// 8 个礼物：拾取 → 弹 Phaser modal → 选 [装进/留后/放弃] → 装进占 1 行李位（最多 6）。
// 2 个绿洲：玩家走上去 +2 水分（不超过 10）。
// 9 个真实地名：作为 Phaser Text chip 浮动，纯装饰 (含 doha_port)。

window.QATAR_LEVEL = {
  // 关 0 玩家起点 —— Doha 左下角附近 (M15: 跟 hamad_airport 一起退役, 起点仍在左下)
  start: { x: 200, y: 580 },

  // 2 个绿洲
  oases: [
    { x: 480, y: 280, label: 'Al Bidda Park 绿地' },
    { x: 980, y: 540, label: 'Katara 绿洲' },
  ],

  // M16: 9 个地标 + 8 个礼物 重布局 —— min 134px 间距防遮挡
  //   坐标选择: 用均匀网格分布 (左中右各 3 个), 避免重叠
  //   Bug 3: national_museum(540,350) ↔ souq_waqif(580,320) 旧版相距 50px → 新版 ≥ 134px
  gifts: [
    { id: 0, x: 540,  y: 500, name: '沙漠玫瑰',    hint: '国家博物馆',         emoji: '🌹',  placeId: 'national_museum', price: 30 },
    { id: 1, x: 420,  y: 230, name: '古兰经',      hint: '伊斯兰博物馆',       emoji: '📖',  placeId: 'islamic_museum',  price: 40 },
    { id: 2, x: 700,  y: 400, name: '猎鹰',        hint: '瓦其夫集市',         emoji: '🦅',  placeId: 'souq_waqif',     price: 25 },
    { id: 3, x: 1130, y: 300, name: '波斯湾珍珠',  hint: '波斯湾珍珠',         emoji: '🦪',  placeId: 'corniche',        price: 35 },
    // Bug 2: 天然气 emoji 🔥 → 🏭 (LNG 厂更合适, Bug 6 进一步用 Graphics 绘)
    { id: 4, x: 200,  y: 220, name: '天然气',      hint: '北部气田',           emoji: '🏭',  placeId: 'ras_laffan',      price: 60 },
    { id: 5, x: 1050, y: 490, name: '归家之心',    hint: '四川 成都',          emoji: '❤️',  placeId: 'the_pearl',       price: 80 },
    { id: 6, x: 260,  y: 340, name: '火炬塔之火',  hint: '体育公园',           emoji: '🔥',  placeId: 'aspire_park',     price: 50 },
    // M9.5g: 隐藏 World Cup 奖杯 — Lusail Stadium 2022 (大力神杯), M15: id 从 6 移到 7
    { id: 7, x: 900,  y: 200, name: '大力神杯',    hint: '卢赛尔世界杯',       emoji: '🏆',  placeId: 'lusail_stadium',  price: 100 },
  ],

  // M16: 9 个真实地名 —— 均匀分布, min 134px 防遮挡
  //   M15: 加 national_museum (NMoQ 沙漠玫瑰建筑) + ras_laffan (北部气田 LNG);
  //        删 hamad_airport (官方任务移到 Ras Laffan LNG).
  places: [
    // 左列 (北部 LNG + 体育公园)
    { id: 'ras_laffan',      x: 200,  y: 200, label: 'Ras Laffan (North Field)' },
    { id: 'aspire_park',     x: 260,  y: 320, label: 'Aspire Park' },
    // 中列 (MIA 上中, NMoQ 中下, Souq Waqif 中右)
    { id: 'islamic_museum',  x: 420,  y: 250, label: 'Museum of Islamic Art' },
    { id: 'national_museum', x: 540,  y: 480, label: 'National Museum of Qatar' },
    { id: 'souq_waqif',      x: 700,  y: 380, label: 'Souq Waqif' },
    // 右列 (Lusail 上, Corniche 中, Pearl 中下, Doha Port 下)
    { id: 'lusail_stadium',  x: 900,  y: 180, label: 'Lusail Stadium' },
    { id: 'corniche',        x: 1130, y: 280, label: 'Corniche' },
    { id: 'the_pearl',       x: 1050, y: 470, label: 'The Pearl' },
    // M13 Bug 3: Doha Port chip — 跟 port NPC (L.port) 同坐标, 移至右下方远离 dpad (110, 620)
    { id: 'doha_port',       x: 980,  y: 660, label: 'Doha Port' },
  ],

  // 老商人 NPC —— M11 改为港口 NPC (Doha Port 多哈港, M11 part 5 从 Mesaieed 改名).
  // 多哈港是卡塔尔首都的传统出海口, 跟 level 0 起点 Hamad Airport 同经度 (51.53°E).
  // M13 Bug 3: 移到右下方 (1010, 660), 远离 dpad (110, 620) 防止误触.
  // M16: port.x 跟 places.doha_port 同坐标, 一致性
  // emoji ⚓ 海蓝主题 (L.port), 玩家拾满 8 件后来此兑换船票.
  // M12: port.name 英文 "Doha Port"; port.line 英文. issue 4: 多语言统一.
  port: { x: 980, y: 660, emoji: '⚓', name: 'Doha Port',
         line: "Doha Port is Qatar's historic maritime gateway to Persia. Bring your collected items here to exchange for a ship ticket. ⚓" },

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
  // M12: LUGGAGE_MAX 6 — 玩家从 8 件里任选 6 件装进, 让玩家可选 N 件兑换 (issue 6).
  // M11: 同时港口船票兑换要 总价 >= PORT_TICKET_PRICE_THRESHOLD, 拾满 8 行李只装 6 件是合法的.
  LUGGAGE_MAX: 6,
  MIN_PICKUPS_TO_CLAIM: 3,    // 至少拾取 3 件才能领奖
  // M11: 港口船票兑换阈值 — 玩家必须带够 ¥170 价值的礼物才能换船票
  PORT_TICKET_PRICE_THRESHOLD: 170,
  // M12: 至少带多少件礼物才能上船 — issue 6: 改成 1, 玩家只要带 1 件 (selected) 就能上船
  MIN_LUGGAGE_TO_BOARD: 1,
  CANVAS_W: 1280,
  CANVAS_H: 720,
};

// 暴露给 node 离线验证（Verification Step 6/7）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.QATAR_LEVEL;
}