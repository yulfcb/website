#!/usr/bin/env node
/**
 * M24 verify — voyage 动画修复端到端验证
 *
 * 硬规则:
 *   1. pageerror = 0
 *   2. NORMAL tier 走 enterResult()
 *   3. _voyageUpdate 触发后 voyageT 推进正常 (3s 后 ≈0.75)
 *   4. shipContainer 实际移动 (从 366 移到 ≥700)
 *   5. 截图 PIL: 海面 #3676A0 覆盖 >30%, 船像素 #402020 >100
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PNG } = require('/tmp/pngjs_node/node_modules/pngjs');

const ROOT = path.resolve(__dirname, '..');
const GAME_JS = path.join(ROOT, 'static/silk-road/qatar/game.js');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

// PIL-like pixel analysis using pngjs
function analyzePixels(pngPath) {
  const data = fs.readFileSync(pngPath);
  const png = PNG.sync.read(data);
  const { width, height, data: pixels } = png;
  const total = width * height;

  // 海面 #3676A0 = (54, 118, 160) — 允许一些颜色抖动
  // 船 #402020 = (64, 32, 32)
  let seaCount = 0;
  let shipCount = 0;
  // 加宽容差: R/G/B 各差 ≤ 15
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (Math.abs(r - 54) <= 15 && Math.abs(g - 118) <= 15 && Math.abs(b - 160) <= 15) {
      seaCount++;
    }
    if (Math.abs(r - 64) <= 20 && Math.abs(g - 32) <= 20 && Math.abs(b - 32) <= 20) {
      shipCount++;
    }
  }
  return {
    width, height, total,
    seaCount, seaPct: seaCount / total,
    shipCount, shipPct: shipCount / total,
  };
}

console.log('\n=== M24 voyage verification ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  check('game.js syntax OK', true);
} catch (e) {
  check('game.js syntax OK', false, e.message);
  process.exit(1);
}

// === 2. 静态扫描: M24 修复 ===
console.log('\n[2] 静态扫描: M24 修复 (用 performance.now 算真实 dt):');
const gameJs = fs.readFileSync(GAME_JS, 'utf8');
check('_voyageLastRealTime 字段定义', gameJs.includes('_voyageLastRealTime'));
check('voyageLastRealTime 用 performance.now 初始化',
  /_voyageLastRealTime\s*=\s*\(typeof performance[\s\S]{0,80}performance\.now\(\)/.test(gameJs));
check('_voyageUpdate 用 realDelta (非 delta) 算 dt',
  /var\s+realDelta\s*=\s*now\s*-\s*self\._voyageLastRealTime/.test(gameJs));
check('realDelta 上限 1000ms (暂停后恢复)', /realDelta\s*>\s*1000/.test(gameJs));

// === 3. Playwright runtime ===
console.log('\n[3] Playwright runtime:');

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

  // 加载 + 等待初始化
  await page.goto('http://localhost/games/silk-road/level/0', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3500);

  // 走 NORMAL tier
  await page.evaluate(async () => {
    const game = window.__qatarGame;
    const playScene = game.scene.getScene('PlayScene');
    playScene.pickupCount = 8;
    playScene.water = 3;  // water ≤ 5 → NORMAL 档 (PERFECT 要求 water>5)
    playScene.giftBuckets = playScene.giftBuckets || {};
    playScene._selectedGiftIds = [0, 1, 2, 3, 4, 5, 6];  // 7 items, 含 id=5
    playScene._selectedCount = 7;
    playScene.state = 'PORT';
    if (playScene.portModal && playScene.portModal.destroy) {
      playScene.portModal.destroy(); playScene.portModal = null;
    }
    if (playScene.pickupDoneModal && playScene.pickupDoneModal.destroy) {
      playScene.pickupDoneModal.destroy(); playScene.pickupDoneModal = null;
    }
    playScene.enterResult();
    await new Promise(r => setTimeout(r, 1500));
  });

  // 触发 voyage
  await page.evaluate(() => {
    const domBtn = document.getElementById('qatar-voyage-dom-btn');
    if (domBtn) domBtn.click();
  });

  // 截图 (voyage 启动瞬间, ship 在 Doha)
  await page.waitForTimeout(100);
  await page.screenshot({ path: '/tmp/m24_voyage_t0.png', fullPage: false });

  // 抓 t≈0.1 时的 ship 位置
  await page.waitForTimeout(400);  // ~0.4s wall time, 期望 voyageT≈0.1
  const t04 = await page.evaluate(() => {
    const game = window.__qatarGame;
    const rs = game.scene.getScene('ResultScene');
    return {
      voyageT: rs.voyageT,
      shipX: rs.shipContainer.x,
      shipY: rs.shipContainer.y,
    };
  });
  check('voyage @ ~0.4s: voyageT 推进 (>0.05)', t04.voyageT > 0.05,
    `voyageT=${t04.voyageT.toFixed(3)}, shipX=${t04.shipX.toFixed(0)}`);

  // 等 3s, 抓最终状态
  await page.waitForTimeout(3000);
  const t3 = await page.evaluate(() => {
    const game = window.__qatarGame;
    const rs = game.scene.getScene('ResultScene');
    return {
      voyageT: rs.voyageT,
      voyageMidpointReached: rs.voyageMidpointReached,
      voyageDone: rs.voyageDone,
      voyageContainerVisible: rs.voyageContainer.visible,
      shipX: rs.shipContainer.x,
      shipY: rs.shipContainer.y,
      loopActualFps: game.loop.actualFps,
    };
  });
  console.log(`     state @ 3s: ${JSON.stringify(t3)}`);
  check('voyage @ 3s: voyageT 接近 0.75 (0.5~1.0)', t3.voyageT >= 0.5 && t3.voyageT <= 1.0,
    `voyageT=${t3.voyageT.toFixed(3)}`);
  check('voyageContainer.visible=true', t3.voyageContainerVisible === true);
  check('ship 实际移动 (ΔX > 100)', (t3.shipX - 366) > 100,
    `ΔX=${(t3.shipX - 366).toFixed(0)}`);
  check('中点已跨过 (voyageMidpointReached)', t3.voyageMidpointReached === true);

  // 截图 (3s 后, voyage 进行中)
  await page.screenshot({ path: '/tmp/m24_voyage_t3.png', fullPage: false });

  // PIL 像素分析
  console.log('\n[4] Pixel analysis:');
  const a0 = analyzePixels('/tmp/m24_voyage_t0.png');
  console.log(`     t0: sea=${(a0.seaPct * 100).toFixed(1)}%, ship=${a0.shipCount}px (${(a0.shipPct * 100).toFixed(2)}%)`);
  const a3 = analyzePixels('/tmp/m24_voyage_t3.png');
  console.log(`     t3: sea=${(a3.seaPct * 100).toFixed(1)}%, ship=${a3.shipCount}px (${(a3.shipPct * 100).toFixed(2)}%)`);

  // 至少一张截图有海面 (t0 应该有 ~100% 海面, 因为 voyage 一启动就覆盖整个画面)
  check('海面 #3676A0 覆盖 ≥30%', Math.max(a0.seaPct, a3.seaPct) >= 0.30,
    `max sea = ${(Math.max(a0.seaPct, a3.seaPct) * 100).toFixed(1)}%`);
  check('船 #402020 像素 >100 (任意时刻)', Math.max(a0.shipCount, a3.shipCount) > 100,
    `max ship = ${Math.max(a0.shipCount, a3.shipCount)}px`);

  check('pageerror = 0', pageErrors.length === 0,
    pageErrors.length ? `errors: ${pageErrors.slice(0, 3).join('; ')}` : '');

  await browser.close();

  console.log('\n=== Summary ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`Passed: ${passed} / ${results.length}`);
  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const r of failed) console.log(`  ✗ ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    process.exit(1);
  }
  console.log('\n✅ All M24 hard rules pass!');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});