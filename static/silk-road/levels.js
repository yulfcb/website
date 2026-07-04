// 关 0/1 极简玩法配置 —— M2 范围内只用"点击 5 次"作为通关条件
// 画面参数由关卡 vehicle + 配色决定（emoji 当纹理，不做像素美术）
window.SILK_ROAD_LEVELS = {
  0: {
    // 起航·多哈 🛳️
    bgTop: 0x2a2140,
    bgBottom: 0x1b2135,
    ground: 0xd9b382,      // 沙色地面
    accent: 0x6ec1e4,      // 海水蓝
    emoji: '🛳️',
    targetClicks: 5,
    title: '起航·多哈',
    quote: '从你出发的地方，回到你身边',
    reward: 6.66,
    nextUrl: '/games/silk-road/level/1',
  },
  1: {
    // 伊朗·沙漠骆驼 🐪
    bgTop: 0x6b3f1d,
    bgBottom: 0x2a1606,
    ground: 0xe8b96a,      // 金沙
    accent: 0xf6b5c8,      // 晚霞粉
    emoji: '🐪',
    targetClicks: 5,
    title: '伊朗·沙漠骆驼',
    quote: '你还记得吗，那晚的沙漠 / 抬头看，整片天都是你的',
    reward: 13.14,
    nextUrl: '/games/silk-road/end',
  },
};