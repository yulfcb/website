// 丝绸之路 · 关卡配置（M3 全 6 关）
// 玩法统一"点击载具 N 次"；关 3/4 加入 10s 倒计时 + can_fail=true → 失败弹复活 modal。
// 关 5（成都·到家）无 vehicle → 引擎走 simplified 路径（纯文案/动画）。
window.SILK_ROAD_LEVELS = {
  0: {
    // 起航·多哈 🛳️
    bgTop: 0x2a2140,
    bgBottom: 0x1b2135,
    ground: 0xd9b382,
    accent: 0x6ec1e4,
    emoji: '🛳️',
    targetClicks: 5,
    timeLimitSec: 0,         // 0 = 不限时
    can_fail: false,
    title: '起航·多哈',
    quote: '从你出发的地方，回到你身边',
    reward: 6.66,
    nextUrl: '/games/silk-road/level/1',
  },
  1: {
    // 伊朗·沙漠骆驼 🐪
    bgTop: 0x6b3f1d,
    bgBottom: 0x2a1606,
    ground: 0xe8b96a,
    accent: 0xf6b5c8,
    emoji: '🐪',
    targetClicks: 5,
    timeLimitSec: 0,
    can_fail: false,
    title: '伊朗·沙漠骆驼',
    quote: '你还记得吗，那晚的沙漠 / 抬头看，整片天都是你的',
    reward: 13.14,
    nextUrl: '/games/silk-road/level/2',
  },
  2: {
    // 土耳其·热气球 🎈（卡帕多奇亚）
    bgTop: 0xf3a86b,        // 晨曦橙
    bgBottom: 0xb1502d,      // 赭石
    ground: 0x9b6938,        // 岩石烟褐
    accent: 0xf6b5c8,
    emoji: '🎈',
    targetClicks: 5,
    timeLimitSec: 0,
    can_fail: false,
    title: '土耳其·热气球',
    quote: '慢一点也没关系，只要方向是你',
    reward: 20.20,
    nextUrl: '/games/silk-road/level/3',
  },
  3: {
    // 哈萨克斯坦·草原骑马 🐎
    bgTop: 0x88b4e0,        // 天蓝
    bgBottom: 0xd6e6a3,      // 草绿
    ground: 0x8fa84a,        // 深草
    accent: 0xf6b5c8,
    emoji: '🐎',
    targetClicks: 5,
    timeLimitSec: 10,        // 10 秒倒计时
    can_fail: true,
    title: '哈萨克斯坦·草原骑马',
    quote: '策马穿过草原，只为早一点见你',
    reward: 88.00,
    nextUrl: '/games/silk-road/level/4',
  },
  4: {
    // 新疆·雪山滑雪 🏂
    bgTop: 0xbfd9e8,        // 雪天浅蓝
    bgBottom: 0xeaf2f7,
    ground: 0xffffff,        // 纯白雪地
    accent: 0x6ec1e4,
    emoji: '🏂',
    targetClicks: 5,
    timeLimitSec: 10,
    can_fail: true,
    title: '新疆·雪山滑雪',
    quote: '那片雪，是不是我们踩过的那一片',
    reward: 88.00,
    nextUrl: '/games/silk-road/level/5',
  },
  5: {
    // 成都·到家（无 vehicle，简化通关动画）
    bgTop: 0xfde2c5,        // 暖阳橙
    bgBottom: 0xf6b5c8,      // 樱粉
    ground: 0xffd98a,
    accent: 0xf6b5c8,
    emoji: '🏠',              // 兜底（实际不会渲染 Pixi）
    targetClicks: 1,         // 占位，简化路径不依赖
    timeLimitSec: 0,
    can_fail: false,
    title: '成都·到家',
    quote: '回家了 / 所有的路，都是为了走向你',
    reward: 1098.00,
    nextUrl: '/games/silk-road/end',
  },
};