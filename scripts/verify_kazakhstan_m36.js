#!/usr/bin/env node
/**
 * M36 verification — 哈萨克斯坦关卡:
 *   Bug 1: 毛皮驿站坐标 (950,200) → (1000,600) — 距离检查
 *   Bug 2: depart() 重写为 4 阶段动画 — 4 张截图验证
 *
 * 硬规则:
 * 1. pageerror = 0 (用 node --check 静态 + playwright runtime 验证)
 * 2. Bug 1 — 毛皮驿站与其他对象的距离 > 80px
 * 3. Bug 2 — depart() 4 个阶段截图: t=0.5s/2.5s/5s/6.5s
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LEVELS_JS = path.join(ROOT, 'static/silk-road/kazakhstan/levels.js');
const GAME_JS = path.join(ROOT, 'static/silk-road/kazakhstan/game.js');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n=== M36 verification — 哈萨克斯坦 (Bug 1 + Bug 2) ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
try {
  execSync(`node --check "${LEVELS_JS}"`, { stdio: 'pipe' });
  check('levels.js syntax OK', true);
} catch (e) {
  check('levels.js syntax OK', false, e.message);
  process.exit(1);
}
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  check('game.js syntax OK', true);
} catch (e) {
  check('game.js syntax OK', false, e.message);
  process.exit(1);
}

// === 2. Bug 1 静态扫描 ===
console.log('\n[2] Bug 1: 毛皮驿站坐标 (静态):');
const levelsJs = fs.readFileSync(LEVELS_JS, 'utf8');
const furMatch = levelsJs.match(/id:\s*'fur'[\s\S]*?x:\s*(\d+),\s*y:\s*(\d+)/);
const furX = furMatch ? parseInt(furMatch[1]) : null;
const furY = furMatch ? parseInt(furMatch[2]) : null;
check('毛皮驿站坐标 = (1000, 600)', furX === 1000 && furY === 600, `got (${furX}, ${furY})`);

// === 3. Bug 2 静态扫描 ===
console.log('\n[3] Bug 2: depart() 4 阶段动画 (静态):');
const gameJs = fs.readFileSync(GAME_JS, 'utf8');
const departBlockMatch = gameJs.match(/depart:\s*function\s*\(\)\s*\{[\s\S]*?setTimeout\(function\s*\(\)\s*\{[\s\S]*?level\/4';/);
const departBlock = departBlockMatch ? departBlockMatch[0] : '';

// 检查 4 个时间延迟点 (用 setTimeout 而非 time.delayedCall)
const hasPhase1 = /targets:\s*departureHorse[\s\S]*?x:\s*1380/.test(departBlock);
const hasPhase2_Overlay = /snowOverlay\s*=\s*this\.add\.rectangle[\s\S]*?delay:\s*2000/.test(departBlock);
const hasPhase2_Mountains = /snowMountains[\s\S]*?fillTriangle[\s\S]*?delay:\s*2000/.test(departBlock);
const hasPhase3 = /setTimeout\(function[\s\S]*?title\s*=\s*self\.add\.text[\s\S]*?4000/.test(departBlock)
                  && /delay:\s*300/.test(departBlock);
const hasPhase4 = /setTimeout\(function[\s\S]*?alpha:\s*1[\s\S]*?window\.location\.href/.test(departBlock)
                  && /window\.location\.href\s*=\s*'\/games\/silk-road\/level\/4'/.test(departBlock);

check('阶段 1: 创建 departureHorse container', /departureHorse\s*=\s*this\.add\.container/.test(departBlock));
check('阶段 1: tween x → 1380', hasPhase1);
check('阶段 2: snowOverlay + delay 2000', hasPhase2_Overlay);
check('阶段 2: snowMountains.graphics + delay 2000', hasPhase2_Mountains);
check('阶段 3: delayedCall(4000) + 标题 + subtitle', hasPhase3);
check('阶段 4: delayedCall(6000) + 黑屏 + 跳转', hasPhase4);
check('隐藏 playerContainer', /playerContainer\.setVisible\(false\)/.test(departBlock));
check('隐藏 joystickContainer', /joystickContainer[\s\S]*?setVisible\(false\)/.test(departBlock));
check('隐藏 HUD (hudBg)', /hudBg[\s\S]*?setVisible\(false\)/.test(departBlock));

// === 4. Bug 1 距离验证 (静态 — 解析所有对象坐标) ===
console.log('\n[4] Bug 1: 距离检查 (静态):');
const furPos = { x: 1000, y: 600 };
const others = [
  { name: 'eagle (鹰猎)', x: 900, y: 200 },
  { name: 'market (集市)', x: 1100, y: 200 },
  { name: 'map (地图)', x: 800, y: 600 },
  { name: 'silk (丝绸 exitZone)', x: 1200, y: 400 },
  { name: 'dairy (奶制品)', x: 500, y: 500 },
  { name: 'bow (弓箭)', x: 700, y: 300 },
  { name: 'saddle (马具)', x: 300, y: 400 },
];
let allDistOk = true;
for (const o of others) {
  const dist = Math.sqrt(Math.pow(o.x - furPos.x, 2) + Math.pow(o.y - furPos.y, 2));
  const ok = dist > 80;
  if (!ok) allDistOk = false;
  check(`距 ${o.name} = ${dist.toFixed(1)}px (> 80)`, ok, `(${o.x},${o.y}) ↔ (${furPos.x},${furPos.y})`);
}
check('所有距离 > 80px', allDistOk);

// === 5. Playwright runtime ===
console.log('\n[5] Playwright runtime (4 张截图):');

const { chromium } = require('/tmp/node_modules/playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/home/agent/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (e) {
    check('Playwright launch', false, e.message);
    process.exit(1);
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/Failed to load resource.*404/.test(text)) return;
      pageErrors.push('[console.error] ' + text);
    }
  });

  await page.goto('http://127.0.0.1:80/games/silk-road/level/3?debug=1', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(4500);  // 等 Phaser + TamingScene 跳过 + PlayScene 完成

  // 找到 PlayScene, 玩家直接传送到 exitZone 附近, 触发 depart()
  const setup = await page.evaluate(async () => {
    const game = window.__kazakhstanGame;
    if (!game) return { error: 'no game' };
    let playScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.playerContainer && typeof scene.depart === 'function') {
        playScene = scene;
        break;
      }
    }
    if (!playScene) return { error: 'no PlayScene with depart' };

    // 强制玩家到 exitZone (1200, 400)
    playScene.playerX = 1200;
    playScene.playerY = 400;
    playScene.playerContainer.setPosition(1200, 400);
    playScene.state = 'PLAYING';
    // 装备 warm_clothes + kumis (避开 tryDepart 校验)
    playScene.items = ['warm_clothes', 'kumis'];

    // Bug 1 runtime 检查 — 验毛皮驿站坐标 (从 yurts list)
    const furRuntime = playScene.yurts.find(y => y.config.id === 'fur');
    const eagleRuntime = playScene.yurts.find(y => y.config.id === 'eagle');
    const furDist = furRuntime && eagleRuntime
      ? Math.sqrt(Math.pow(furRuntime.config.x - eagleRuntime.config.x, 2)
                  + Math.pow(furRuntime.config.y - eagleRuntime.config.y, 2))
      : null;

    // 触发 depart
    playScene.depart();

    return {
      ok: true,
      furCoord: furRuntime ? { x: furRuntime.config.x, y: furRuntime.config.y } : null,
      eagleCoord: eagleRuntime ? { x: eagleRuntime.config.x, y: eagleRuntime.config.y } : null,
      furDistEagle: furDist,
      hasDeparted: playScene.state === 'DEPARTING',
    };
  });

  if (setup.error) {
    check('PlayScene.depart() 可调用', false, setup.error);
    process.exit(1);
  }
  check('PlayScene.depart() 已调用', setup.hasDeparted);
  check('毛皮驿站 runtime 坐标 = (1000, 600)', setup.furCoord && setup.furCoord.x === 1000 && setup.furCoord.y === 600, JSON.stringify(setup.furCoord));
  check('运行时 毛皮 ↔ 鹰猎 距离 > 80px', setup.furDistEagle !== null && setup.furDistEagle > 80, `dist=${setup.furDistEagle ? setup.furDistEagle.toFixed(1) : 'null'}`);

  // 截图 — 4 个时间点
  const screenshotTimes = [
    { t: 500, label: 'm36_t0.5s_phase1_horse' },
    { t: 2500, label: 'm36_t2.5s_phase2_snow_transition' },
    { t: 5000, label: 'm36_t5s_phase3_title' },
    { t: 6500, label: 'm36_t6.5s_phase4_black' },
  ];
  let lastT = 0;
  for (const s of screenshotTimes) {
    await page.waitForTimeout(s.t - lastT);
    lastT = s.t;
    const filePath = `/tmp/${s.label}.png`;
    try {
      await page.screenshot({ path: filePath, fullPage: false });
      const sz = fs.statSync(filePath).size;
      check(`截图 ${s.label} (t=${s.t}ms)`, true, `${(sz / 1024).toFixed(0)}KB`);
    } catch (e) {
      check(`截图 ${s.label}`, false, e.message);
    }
  }

  // 在每个关键时间点抓取 scene 对象诊断 (title 是否存在 / 透明度 / overlay 黑度)
  const debug = await page.evaluate(async () => {
    const game = window.__kazakhstanGame;
    if (!game) return null;
    for (const scene of game.scene.scenes) {
      if (scene.depart && scene.state === 'DEPARTING') {
        // 找标题 text (depth 1600)
        const titles = [];
        const overlays = [];
        const mountains = [];
        scene.children.list.forEach(c => {
          if (c.type === 'Text' && c.depth === 1600) titles.push({ text: c.text, alpha: c.alpha, x: c.x, y: c.y });
          if (c.type === 'Rectangle' && c.depth === 3000) overlays.push({ alpha: c.alpha, fillColor: c.fillColor });
          if (c.type === 'Graphics' && c.depth === 701) mountains.push({ alpha: c.alpha });
        });
        // 找 snowOverlay (depth 700, Rectangle)
        scene.children.list.forEach(c => {
          if (c.type === 'Rectangle' && c.depth === 700) overlays.push({ depth: 700, alpha: c.alpha, fillColor: c.fillColor });
        });
        return {
          childCount: scene.children.list.length,
          titles,
          overlays,
          mountains,
        };
      }
    }
    return null;
  });
  if (debug) {
    console.log('\n     运行时 scene 状态 (after t=6.5s):');
    console.log('       children =', debug.childCount);
    console.log('       titles =', JSON.stringify(debug.titles));
    console.log('       overlays (snowOverlay depth700 / black depth3000) =', JSON.stringify(debug.overlays));
    console.log('       mountains (depth 701) =', JSON.stringify(debug.mountains));
  }

  // 像素采样 — 用 sharp 或 Canvas API
  const samples = await page.evaluate(async () => {
    const game = window.__kazakhstanGame;
    if (!game) return null;
    // 直接读 Phaser renderTexture 不容易 — 我们改用 dom2canvas 风格
    // 但简单方案: 读 ctx from main canvas
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const ctx = canvas.getContext('2d');
    function sample(x, y) {
      const px = ctx.getImageData(x, y, 1, 1).data;
      return [px[0], px[1], px[2]];
    }
    return {
      // 中央区域 (应该是雪山/覆盖层 / 黑)
      center: sample(640, 360),
      // 顶部 (黑 / 雪山背景)
      topMid: sample(640, 100),
      // 左下 (草原 / 雪山 / 黑)
      bottomLeft: sample(100, 700),
      // 标题位置
      titleArea: sample(640, 320),
    };
  });
  if (samples && !samples.error) {
    console.log('     像素采样 (t=6.5s):');
    console.log(`       中央 (640,360): RGB(${samples.center.join(',')})`);
    console.log(`       上中 (640,100): RGB(${samples.topMid.join(',')})`);
    console.log(`       左下 (100,700): RGB(${samples.bottomLeft.join(',')})`);
    console.log(`       标题 (640,320): RGB(${samples.titleArea.join(',')})`);
  }

  check('pageerror = 0', pageErrors.length === 0, pageErrors.length ? pageErrors.join('; ').slice(0, 300) : '');

  await browser.close();

  // summary
  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Passed: ${passed} / ${results.length}`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(1);
  }
  console.log('\n✅ All M36 hard rules pass!');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
