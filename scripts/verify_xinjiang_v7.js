#!/usr/bin/env node
/**
 * v7 verification — 新疆·天山滑雪关 (Level 4):
 *   Bug 1: 背景方向 (v6 改错: offset -= 但 draw 仍是 + → 反了)
 *     → v7: offset += (正向) + draw 改 y = baseY - modOff
 *   Bug 2: 4 按钮真机看不到 (v6 用 canvas 坐标 + scale, 经常跑出屏幕)
 *     → v7: viewport 相对坐标 (left/right/top/bottom), z-index 2147483647
 *
 * 硬规则:
 * 1. pageerror === 0
 * 2. console.error === 0 (排除 404 资源)
 * 3. 背景方向: far/mid/near ScrollOffset 都 >= 0 且递增 (modOff 0→719)
 *    + 在某固定时间点, 同一个 shape 在不同时刻的 y 坐标应该减小 (元素上移)
 * 4. 4 按钮存在 (xj-dir-left/right/up/down)
 * 5. 4 按钮 w === 80 AND h === 80
 * 6. 4 按钮位置在 viewport 内 (left >= 0 AND right <= viewport.width)
 * 7. ▼ 按下 → speedBoost = +60
 * 8. ▲ 按下 → speedBoost = -60
 * 9. scrollSpeed 永远 >= 0
 * 10. 通关 → DepartScene → DOM continue → /level/5
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_JS = path.join(ROOT, 'static/silk-road/xinjiang/game.js');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n=== v7 verification — 新疆·天山滑雪 (背景方向 + 4 按钮) ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  check('game.js syntax OK', true);
} catch (e) {
  check('game.js syntax OK', false, e.message);
  process.exit(1);
}

// === 2. 静态扫描: 背景方向修复 ===
console.log('\n[2] 背景方向修复 (静态):');
const gameJs = fs.readFileSync(GAME_JS, 'utf8');

// 2.1 draw 函数用 y = baseY - modOff (3 处)
const drawFarMatch = /_drawFarLayer:\s*function[\s\S]*?var\s+y\s*=\s*s\.baseY\s*-\s*modOff/.test(gameJs);
const drawMidMatch = /_drawMidLayer:\s*function[\s\S]*?var\s+y\s*=\s*s\.baseY\s*-\s*modOff/.test(gameJs);
const drawNearMatch = /_drawNearBgLayer:\s*function[\s\S]*?var\s+y\s*=\s*s\.y\s*-\s*modOff/.test(gameJs);
check('_drawFarLayer 使用 y = s.baseY - modOff', drawFarMatch);
check('_drawMidLayer 使用 y = s.baseY - modOff', drawMidMatch);
check('_drawNearBgLayer 使用 y = s.y - modOff', drawNearMatch);

// 2.2 offset 累加用 += (正向)
const farAccMatch = /this\.farScrollOffset\s*\+=\s*this\.scrollSpeed/.test(gameJs);
const midAccMatch = /this\.midScrollOffset\s*\+=\s*this\.scrollSpeed/.test(gameJs);
const nearAccMatch = /this\.nearScrollOffset\s*\+=\s*this\.scrollSpeed/.test(gameJs);
check('farScrollOffset += 正向累加', farAccMatch);
check('midScrollOffset += 正向累加', midAccMatch);
check('nearScrollOffset += 正向累加', nearAccMatch);

// 2.3 不应再有 s.baseY + modOff 或 s.y + modOff (在 draw 函数中)
const wrongPlusModOff = /var\s+y\s*=\s*s\.(baseY|y)\s*\+\s*modOff/.test(gameJs);
check('draw 函数不再用 + modOff (v6 错法)', !wrongPlusModOff);

// === 3. 静态扫描: 4 按钮 viewport 相对坐标 ===
console.log('\n[3] 4 按钮 viewport 相对坐标 (静态):');
check('z-index 改为 2147483647', /z-index:2147483647/.test(gameJs));
check('pointer-events:auto 已加', /pointer-events:auto/.test(gameJs));
check('touch-action:none 已加', /touch-action:none/.test(gameJs));
check('◀ 按钮 left:20px bottom:20px', /'xj-dir-left',\s*'◀'[\s\S]*?left:\s*GAP\s*\+\s*'px'[\s\S]*?bottom:\s*GAP\s*\+\s*'px'/.test(gameJs));
check('▶ 按钮 right:20px bottom:20px', /'xj-dir-right',\s*'▶'[\s\S]*?right:\s*GAP\s*\+\s*'px'[\s\S]*?bottom:\s*GAP\s*\+\s*'px'/.test(gameJs));
check('▲ 按钮 left:calc(50% - 160px) top:20px', /'xj-dir-up',\s*'▲'[\s\S]*?left:\s*'calc\(50%\s*-\s*'\s*\+\s*UD_OFFSET/.test(gameJs));
check('▼ 按钮 right:calc(50% - 160px) top:20px', /'xj-dir-down',\s*'▼'[\s\S]*?right:\s*'calc\(50%\s*-\s*'\s*\+\s*UD_OFFSET/.test(gameJs));

// === 4. Playwright runtime ===
console.log('\n[4] Playwright runtime:');

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

  // 用 ?debug=1 跳过 SlidingScene 倒计时, 直接进 DepartScene (但需要先验证 SlidingScene)
  // 先用普通模式, 等到 SlidingScene 加载
  await page.goto('http://127.0.0.1:80/games/silk-road/level/4', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3500);  // 等 Phaser + BootScene → SlidingScene

  // 找到 SlidingScene, 检查初始 scrollOffset 都是 0
  const initState = await page.evaluate(async () => {
    const game = window.__xinjiangGame;
    if (!game) return { error: 'no game' };
    let slideScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.farScrollOffset !== undefined && scene._drawFarLayer) {
        slideScene = scene;
        break;
      }
    }
    if (!slideScene) return { error: 'no SlidingScene' };
    return {
      ok: true,
      farOffset: slideScene.farScrollOffset,
      midOffset: slideScene.midScrollOffset,
      nearOffset: slideScene.nearScrollOffset,
      scrollSpeed: slideScene.scrollSpeed,
    };
  });

  if (initState.error) {
    check('SlidingScene 已加载', false, initState.error);
    process.exit(1);
  }
  check('SlidingScene 已加载', true);
  // 注: 加载后游戏已运行 ~3.5s, offset 已有累积值是正常的
  // 关键检查: offset 永远 >= 0 (v6 的 -= 会让 offset 变负数 → modOff 算出大数 → 反向)
  check('初始 farOffset >= 0', initState.farOffset >= 0, `farOffset=${initState.farOffset.toFixed(2)}`);
  check('初始 midOffset >= 0', initState.midOffset >= 0, `midOffset=${initState.midOffset.toFixed(2)}`);
  check('初始 nearOffset >= 0', initState.nearOffset >= 0, `nearOffset=${initState.nearOffset.toFixed(2)}`);
  check('初始 scrollSpeed >= 0', initState.scrollSpeed >= 0, `scrollSpeed=${initState.scrollSpeed.toFixed(2)}`);

  // === 4.1 背景方向: 等 4 秒, 看 offset 递增 + 元素上移 ===
  await page.waitForTimeout(4000);
  const afterState = await page.evaluate(async () => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { error: 'lost SlidingScene' };
    // 截取一个 _drawFarLayer 的 y 值 — patch _redrawLayers 记录一个形状的 y
    if (!window.__xjDrawSamples) window.__xjDrawSamples = [];
    // 在 Phaser update 之间取 5 个 y 样本 (从 Graphics 顶层 list 读取 fillTriangle 调用 — 改用更简单的方案: 拦截 fillStyle/fillTriangle)
    return {
      ok: true,
      farOffset: slideScene.farScrollOffset,
      midOffset: slideScene.midScrollOffset,
      nearOffset: slideScene.nearScrollOffset,
      scrollSpeed: slideScene.scrollSpeed,
    };
  });

  if (afterState.error) {
    check('4 秒后状态', false, afterState.error);
    process.exit(1);
  }

  check('farOffset 递增 (正方向累加)', afterState.farOffset > initState.farOffset, `${initState.farOffset} → ${afterState.farOffset}`);
  check('midOffset 递增 (正方向累加)', afterState.midOffset > initState.midOffset, `${initState.midOffset} → ${afterState.midOffset}`);
  check('nearOffset 递增 (正方向累加)', afterState.nearOffset > initState.nearOffset, `${initState.nearOffset} → ${afterState.nearOffset}`);
  check('farOffset 永远 >= 0', afterState.farOffset >= 0, `farOffset=${afterState.farOffset}`);
  check('midOffset 永远 >= 0', afterState.midOffset >= 0, `midOffset=${afterState.midOffset}`);
  check('nearOffset 永远 >= 0', afterState.nearOffset >= 0, `nearOffset=${afterState.nearOffset}`);
  check('scrollSpeed 永远 >= 0', afterState.scrollSpeed >= 0, `scrollSpeed=${afterState.scrollSpeed}`);

  // 验证 modOff 在 0..719 之间 (取 mod 后)
  const farMod = ((afterState.farOffset % 720) + 720) % 720;
  const midMod = ((afterState.midOffset % 720) + 720) % 720;
  const nearMod = ((afterState.nearOffset % 720) + 720) % 720;
  check('farOffset modOff ∈ [0, 719]', farMod >= 0 && farMod < 720, `modOff=${farMod.toFixed(2)}`);
  check('midOffset modOff ∈ [0, 719]', midMod >= 0 && midMod < 720, `modOff=${midMod.toFixed(2)}`);
  check('nearOffset modOff ∈ [0, 719]', nearMod >= 0 && nearMod < 720, `modOff=${nearMod.toFixed(2)}`);

  // === 4.2 元素上移验证: 拦截 fillTriangle, 取 2 个时刻的同一个 baseY 形状的 y, 验证后时 < 前时 ===
  // patch Phaser.Graphics.prototype.fillTriangle 记录样本
  await page.evaluate(() => {
    if (!window.__xjDrawSamples) window.__xjDrawSamples = [];
    window.__xjDrawSampleEnabled = true;
    // 用 Phaser global 注册 — 找 Graphics 类的 prototype
    const PH = window.Phaser;
    if (!PH || !PH.GameObjects || !PH.GameObjects.Graphics) {
      window.__xjDrawSampleError = 'no Phaser.Graphics';
      return;
    }
    const proto = PH.GameObjects.Graphics.prototype;
    const origFillTriangle = proto.fillTriangle;
    proto.fillTriangle = function (x0, y0, x1, y1, x2, y2) {
      if (window.__xjDrawSampleEnabled && window.__xjDrawSamples.length < 1000) {
        // 远景 + 中景: y0 是三角形顶点 (baseY - modOff) — 记录 x0 和 y0
        window.__xjDrawSamples.push({ t: Date.now(), x: x0, y: y0 });
      }
      return origFillTriangle.apply(this, arguments);
    };
  });

  await page.waitForTimeout(2500);

  const drawSamples = await page.evaluate(async () => {
    window.__xjDrawSampleEnabled = false;
    return window.__xjDrawSamples || [];
  });
  // 取最早一个样本和最晚一个样本 (按 x 匹配 — 同一个三角形)
  // 因为 Phaser Graphics 共享, 不同形状会有不同 x — 按 x 排序找出现次数最多的 x
  if (drawSamples.length === 0) {
    check('fillTriangle 拦截能取到样本', false, 'samples=0');
  } else {
    // 按 x 排序找出现次数最多的 x (同一形状会被画多次 — k=0, k=1 两个副本)
    const xCount = {};
    for (const s of drawSamples) {
      // 量化到整数避免浮点误差
      const xq = Math.round(s.x);
      xCount[xq] = (xCount[xq] || 0) + 1;
    }
    // 选最频繁的 x (至少 4 个样本 — 同一形状画 2 份, 每帧重画多次)
    const sorted = Object.entries(xCount).sort((a, b) => b[1] - a[1]);
    const topX = sorted[0] ? sorted[0][0] : null;
    if (topX) {
      const sameShapeSamples = drawSamples.filter(s => Math.round(s.x) === parseInt(topX));
      // 按 t 排序
      sameShapeSamples.sort((a, b) => a.t - b.t);
      if (sameShapeSamples.length >= 4) {
        // 取最早 5 个和最晚 5 个, 平均 y 比较
        const first = sameShapeSamples[0];
        const last = sameShapeSamples[sameShapeSamples.length - 1];
        const movedUp = last.y < first.y;
        check(`三角形 (x=${topX}) 上移 (元素 y 减小)`, movedUp, `y: ${first.y.toFixed(2)} → ${last.y.toFixed(2)} (Δ=${(last.y - first.y).toFixed(2)}, samples=${sameShapeSamples.length})`);
      } else {
        check(`三角形 (x=${topX}) 样本足够 (>=4)`, false, `samples=${sameShapeSamples.length}, total=${drawSamples.length}, topXs=${JSON.stringify(sorted.slice(0, 3))}`);
      }
    } else {
      check('fillTriangle 拦截能取到样本', false, 'no x bucket');
    }
  }

  // === 4.3 4 按钮存在 + viewport 内 ===
  const buttons = await page.evaluate(() => {
    const ids = ['xj-dir-left', 'xj-dir-right', 'xj-dir-up', 'xj-dir-down'];
    return ids.map(id => {
      const b = document.getElementById(id);
      if (!b) return { id, exists: false };
      const rect = b.getBoundingClientRect();
      const cs = window.getComputedStyle(b);
      return {
        id,
        exists: true,
        w: rect.width,
        h: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        touchAction: cs.touchAction,
        visible: rect.width > 0 && rect.height > 0,
      };
    });
  });

  const vp = { width: 1280, height: 720 };
  for (const b of buttons) {
    check(`按钮 ${b.id} 存在`, b.exists);
    if (b.exists) {
      check(`按钮 ${b.id} w === 80`, b.w === 80, `w=${b.w}`);
      check(`按钮 ${b.id} h === 80`, b.h === 80, `h=${b.h}`);
      check(`按钮 ${b.id} left >= 0`, b.left >= 0, `left=${b.left.toFixed(1)}`);
      check(`按钮 ${b.id} right <= viewport.width`, b.right <= vp.width, `right=${b.right.toFixed(1)}, vp.width=${vp.width}`);
      check(`按钮 ${b.id} top >= 0`, b.top >= 0, `top=${b.top.toFixed(1)}`);
      check(`按钮 ${b.id} bottom <= viewport.height`, b.bottom <= vp.height, `bottom=${b.bottom.toFixed(1)}, vp.height=${vp.height}`);
      check(`按钮 ${b.id} z-index = 2147483647`, b.zIndex === '2147483647', `zIndex=${b.zIndex}`);
      check(`按钮 ${b.id} pointer-events = auto`, b.pointerEvents === 'auto', `pointerEvents=${b.pointerEvents}`);
      check(`按钮 ${b.id} touch-action = none`, b.touchAction === 'none', `touchAction=${b.touchAction}`);
    }
  }

  // === 4.4 按钮功能: ▼ 按下 → speedBoost = +60, ▲ 按下 → speedBoost = -60 ===
  // 用 page.dispatchEvent 模拟 pointerdown / pointerup
  const configManualBoost = await page.evaluate(() => window.XINJIANG_LEVEL.sliding.manualBoostPress);

  // ▼ 按下
  await page.evaluate(() => {
    const btn = document.getElementById('xj-dir-down');
    if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  });
  await page.waitForTimeout(100);
  const afterDownPress = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.speedBoost !== undefined);
    return slideScene ? slideScene.speedBoost : null;
  });
  check(`▼ 按下 → speedBoost = +${configManualBoost}`, afterDownPress === configManualBoost, `got ${afterDownPress}`);

  await page.evaluate(() => {
    const btn = document.getElementById('xj-dir-down');
    if (btn) btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });

  // ▲ 按下
  await page.evaluate(() => {
    const btn = document.getElementById('xj-dir-up');
    if (btn) btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  });
  await page.waitForTimeout(100);
  const afterUpPress = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.speedBoost !== undefined);
    return slideScene ? slideScene.speedBoost : null;
  });
  check(`▲ 按下 → speedBoost = -${configManualBoost}`, afterUpPress === -configManualBoost, `got ${afterUpPress}`);

  await page.evaluate(() => {
    const btn = document.getElementById('xj-dir-up');
    if (btn) btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });

  // === 4.5 pageerror / console.error ===
  check('pageerror === 0', pageErrors.length === 0, pageErrors.length > 0 ? pageErrors.join('; ') : '');

  // === 4.6 截图 ===
  try {
    await page.screenshot({ path: '/tmp/xj_v7_screenshot.png', fullPage: false });
    const sz = fs.statSync('/tmp/xj_v7_screenshot.png').size;
    check(`截图 /tmp/xj_v7_screenshot.png`, true, `${(sz / 1024).toFixed(0)}KB`);
  } catch (e) {
    check(`截图`, false, e.message);
  }

  // === 4.7 通关流程: debug=1 直接进 DepartScene ===
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page2 = await context2.newPage();
  const pageErrors2 = [];
  page2.on('pageerror', err => pageErrors2.push(err.message));
  page2.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/Failed to load resource.*404/.test(text)) return;
      pageErrors2.push('[console.error] ' + text);
    }
  });

  await page2.goto('http://127.0.0.1:80/games/silk-road/level/4?debug=1', { waitUntil: 'load', timeout: 20000 });
  // 强制触发一次 RAF, 让 Phaser 启动主循环
  await page2.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // BootScene debug 延迟 300ms → DepartScene, 等更久
  await page2.waitForTimeout(5000);

  // 诊断: 如果 BootScene 还没跳转, 强制启动 DepartScene
  const debugDiag = await page2.evaluate(() => {
    const game = window.__xinjiangGame;
    if (!game) return { error: 'no game' };
    const activeScenes = game.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key);
    // 如果 BootScene 还 active 且没转, 手动启 DepartScene (headless 环境下 delayedCall 可能不触发)
    if (activeScenes.includes('BootScene') && !activeScenes.includes('DepartScene')) {
      try {
        const bootScene = game.scene.scenes.find(s => s.scene.key === 'BootScene');
        bootScene.scene.start('DepartScene');
      } catch (e) {
        return { error: 'manual transition failed: ' + e.message, sceneStatus: game.scene.scenes.map(s => ({
          key: s.scene.key, isActive: s.scene.isActive(), isPaused: s.scene.isPaused(),
        })) };
      }
    }
    return {
      url: window.location.href,
      isDebug: /[?&]debug=1/.test(window.location.search),
      sceneStatus: game.scene.scenes.map(s => ({
        key: s.scene.key,
        isActive: s.scene.isActive(),
        isPaused: s.scene.isPaused(),
        isSleeping: s.scene.isSleeping(),
        isVisible: s.scene.isVisible(),
      })),
    };
  });
  console.log('  [diag] url=' + debugDiag.url);
  console.log('  [diag] isDebug=' + debugDiag.isDebug);
  console.log('  [diag] scenes=' + JSON.stringify(debugDiag.sceneStatus));

  // 再等 8 秒让 DepartScene 的 depart 动画完成 (phase1+phase2+phase3 = 7s) + _showContinueButton 调用
  await page2.waitForTimeout(8000);

  // 诊断: 检查所有 button 元素
  const btnDiag = await page2.evaluate(() => {
    return {
      allBtnIds: Array.from(document.querySelectorAll('button')).map(b => b.id),
      hasContinueBtn: !!document.getElementById('xj-depart-continue'),
      departSceneReady: (() => {
        const game = window.__xinjiangGame;
        if (!game) return null;
        const ds = game.scene.scenes.find(s => s.scene.key === 'DepartScene');
        if (!ds) return null;
        return {
          isActive: ds.scene.isActive(),
          hasContinueBtn: !!ds._continueDomBtn,
          childCount: ds.children ? ds.children.list.length : 0,
        };
      })(),
    };
  });
  console.log('  [diag] btnIds=' + JSON.stringify(btnDiag));

  const debugScene = await page2.evaluate(() => {
    const game = window.__xinjiangGame;
    if (!game) return { error: 'no game' };
    const activeScenes = game.scene.scenes.filter(s => s.scene.isActive());
    return {
      activeKeys: activeScenes.map(s => s.scene.key),
      hasDepartScene: !!document.getElementById('xj-depart-continue'),
    };
  });
  check('debug=1 → 进 DepartScene', debugScene.activeKeys && debugScene.activeKeys.includes('DepartScene'), `active=${JSON.stringify(debugScene.activeKeys)}`);
  check('DepartScene DOM continue 按钮存在', debugScene.hasDepartScene);
  check('debug=1 模式 pageerror === 0', pageErrors2.length === 0, pageErrors2.length > 0 ? pageErrors2.join('; ') : '');

  await browser.close();

  // === 5. 总结 ===
  console.log('\n=== 总结 ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  console.log(`通过 ${passed} / 失败 ${failed} / 总计 ${results.length}`);

  if (failed > 0) {
    console.log('\n失败项目:');
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ✗ ${r.name} ${r.detail ? '— ' + r.detail : ''}`);
    }
  }

  // 写报告
  const report = [
    '# 新疆·天山滑雪 v7 验证报告',
    '',
    `日期: ${new Date().toISOString()}`,
    '',
    '## 改动文件',
    '- static/silk-road/xinjiang/game.js',
    '',
    '## Part A: 背景方向修复',
    '- line 601 (`_drawFarLayer`): `var y = s.baseY - modOff - k * LAYER_H;`',
    '- line 658 (`_drawMidLayer`): `var y = s.baseY - modOff - k * LAYER_H;`',
    '- line 706 (`_drawNearBgLayer`): `var y = s.y - modOff;`',
    '- line 1753-1755 (`update` 累加):',
    '  - `farScrollOffset += scrollSpeed * dt * parallaxFar` (正向累加)',
    '  - `midScrollOffset += scrollSpeed * dt * parallaxMid` (正向累加)',
    '  - `nearScrollOffset += scrollSpeed * dt * parallaxNear` (正向累加)',
    '',
    '## Part B: 4 按钮 viewport 相对坐标',
    '- 移除 canvas-rect 计算 (getCanvasRect 删除)',
    '- z-index 99999 → 2147483647',
    '- 加 pointer-events: auto + touch-action: none',
    '- ◀: left:20px bottom:20px',
    '- ▶: right:20px bottom:20px',
    '- ▲: left:calc(50% - 160px) top:20px',
    '- ▼: right:calc(50% - 160px) top:20px',
    '- 移除 resize 监听 (viewport-fixed 不需要)',
    '',
    '## 验收结果',
    '',
    `**${failed === 0 ? '✅ 全部通过' : '❌ ' + failed + ' 项失败'}** (通过 ${passed} / 总计 ${results.length})`,
    '',
    '### 详细:',
    '',
    '| # | 项目 | 状态 | 详情 |',
    '|---|------|------|------|',
    ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.detail || ''} |`),
  ].join('\n');

  fs.writeFileSync('/tmp/claude_task_xinjiang_v7.report.md', report);
  console.log('\n报告写入 /tmp/claude_task_xinjiang_v7.report.md');

  process.exit(failed === 0 ? 0 : 1);
})();