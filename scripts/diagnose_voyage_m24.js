#!/usr/bin/env node
/**
 * M24 diagnose — voyage 动画播放诊断
 *
 * 目标:
 *   - NORMAL tier (pickupCount=8, water=10, _selectedGiftIds 含 id=5)
 *   - 走 enterResult() 进 ResultScene (不是 scene.start 硬启)
 *   - 点 "坐船出发" → 等 3s → 抓 voyageT / shipContainer.x / delta
 *   - 验证 _voyageUpdate 实际被调用频率 + delta 数值
 *
 * 关键诊断点:
 *   - voyageSpeed = 0.25
 *   - 3s 后 voyageT 应 ≈ 0.75 (240 frames @ 60fps * 16.67ms delta / 1000 * 0.25)
 *   - 如果 voyageT 远小于 0.75 → update 频率低 OR delta 异常小
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_JS = path.join(ROOT, 'static/silk-road/qatar/game.js');

console.log('\n=== M24 voyage diagnostic ===\n');

// === 静态语法 ===
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  console.log('  ✓ game.js syntax OK');
} catch (e) {
  console.error('  ✗ game.js syntax FAIL:', e.message);
  process.exit(1);
}

const { chromium } = require('/tmp/node_modules/playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: '/home/agent/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  } catch (e) {
    console.error('  ✗ Playwright launch FAIL:', e.message);
    process.exit(1);
  }

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleLogs = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(`[${msg.type()}] ${text}`);
    // 只打印跟 voyage 相关的, 避免刷屏
    if (text.includes('voyage') || text.includes('M23') || msg.type() === 'error') {
      console.log(`  [console.${msg.type()}] ${text}`);
    }
  });

  console.log('\n[1] Load qatar level 0:');
  await page.goto('http://localhost/games/silk-road/level/0', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3500);  // 等 Phaser + d3 初始化完
  console.log('  ✓ page loaded');

  console.log('\n[2] Drive PlayScene → NORMAL tier + call enterResult():');
  const setupResult = await page.evaluate(async () => {
    const game = window.__qatarGame || (window.Phaser && window.Phaser.GAMES && window.Phaser.GAMES[0]);
    if (!game) return { error: 'no game' };

    // 找到 PlayScene
    let playScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.scene && scene.scene.key === 'PlayScene') {
        playScene = scene;
        break;
      }
    }
    if (!playScene) {
      // 尝试用 scene.get 直接拿
      playScene = game.scene.getScene('PlayScene');
    }
    if (!playScene) return { error: 'no PlayScene' };

    console.log('[M24 diag] PlayScene found, state=', playScene.state);

    // 设置 NORMAL tier 条件 (pickupCount=8, water ≤ 5 避免 PERFECT 优先级; 含 id=5 归家之心)
    playScene.pickupCount = 8;
    playScene.water = 3;  // water ≤ 5 → 不走 PERFECT 档 (走 NORMAL 档)
    // giftBuckets 必须初始化 (bucketCount 要 Object.keys)
    playScene.giftBuckets = playScene.giftBuckets || {};
    playScene._selectedGiftIds = [0, 1, 2, 3, 4, 5, 6];  // 7 items, 含 id=5
    playScene._selectedCount = 7;
    playScene.state = 'PORT';  // 让 enterResult 不再触发"礼物不够"提示

    // 关闭可能打开的 port modal
    if (playScene.portModal && playScene.portModal.destroy) {
      playScene.portModal.destroy();
      playScene.portModal = null;
    }
    // 关闭 pickup-done modal
    if (playScene.pickupDoneModal && playScene.pickupDoneModal.destroy) {
      playScene.pickupDoneModal.destroy();
      playScene.pickupDoneModal = null;
    }

    // 调 enterResult() 进 ResultScene (NORMAL tier)
    if (typeof playScene.enterResult !== 'function') {
      return { error: 'no enterResult method on PlayScene' };
    }
    playScene.enterResult();

    // 等 ResultScene 启动 + buildVoyageContainer 完成
    await new Promise(r => setTimeout(r, 1500));

    return {
      picked: playScene.pickupCount,
      water: playScene.water,
      selectedIds: playScene._selectedGiftIds,
    };
  });
  if (setupResult.error) {
    console.error('  ✗ setup FAIL:', setupResult.error);
    await browser.close();
    process.exit(1);
  }
  console.log('  ✓ PlayScene setup:', JSON.stringify(setupResult));

  console.log('\n[3] Inspect ResultScene / voyageContainer:');
  const preVoyage = await page.evaluate(() => {
    const game = window.__qatarGame;
    let resultScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.scene && scene.scene.key === 'ResultScene' && scene.playVoyageAnimation) {
        resultScene = scene;
        break;
      }
    }
    if (!resultScene) return { error: 'no ResultScene' };

    return {
      tier: resultScene.tier,
      selectedIds: resultScene.selectedIds,
      hasHomeHeart: resultScene.selectedIds && resultScene.selectedIds.indexOf(5) !== -1,
      voyageContainerExists: !!resultScene.voyageContainer,
      voyageContainerVisible: resultScene.voyageContainer ? resultScene.voyageContainer.visible : null,
      voyageContainerChildCount: resultScene.voyageContainer ? resultScene.voyageContainer.list.length : 0,
      shipContainerExists: !!resultScene.shipContainer,
      shipX: resultScene.shipContainer ? resultScene.shipContainer.x : null,
      shipY: resultScene.shipContainer ? resultScene.shipContainer.y : null,
      domBtnExists: !!document.getElementById('qatar-voyage-dom-btn'),
    };
  });
  console.log('  pre-voyage state:', JSON.stringify(preVoyage, null, 2));

  console.log('\n[4] Click "坐船出发" (try Phaser zone + DOM button):');
  // 优先尝试 DOM button (更可靠)
  const clickResult = await page.evaluate(() => {
    const domBtn = document.getElementById('qatar-voyage-dom-btn');
    if (domBtn) {
      console.log('[M24 diag] clicking DOM button');
      domBtn.click();
      return { via: 'dom', found: true };
    }
    // fallback: 直接调 playVoyageAnimation
    const game = window.__qatarGame;
    for (const scene of game.scene.scenes) {
      if (scene.scene && scene.scene.key === 'ResultScene' && scene.playVoyageAnimation) {
        console.log('[M24 diag] calling playVoyageAnimation directly (no DOM btn)');
        scene.playVoyageAnimation('/games/silk-road/level/1', true);
        return { via: 'direct', found: true };
      }
    }
    return { via: 'none', found: false };
  });
  console.log('  click result:', JSON.stringify(clickResult));

  // === 关键: 抓 _voyageUpdate 调用频率 + delta 数值 ===
  console.log('\n[5] Instrument _voyageUpdate + wait 3s:');
  await page.evaluate(() => {
    const game = window.__qatarGame;
    let resultScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.scene && scene.scene.key === 'ResultScene' && scene.playVoyageAnimation) {
        resultScene = scene;
        break;
      }
    }
    if (!resultScene) return;

    // 计数: 每次 _voyageUpdate 被调用时记录 (delta, voyageT, realTime)
    window.__voyageUpdateLog = [];
    if (typeof resultScene._voyageUpdate === 'function') {
      const orig = resultScene._voyageUpdate;
      resultScene._voyageUpdate = function (time, delta) {
        const before = {
          voyageT: resultScene.voyageT,
          delta: delta,
          shipX: resultScene.shipContainer ? resultScene.shipContainer.x : null,
          time: Date.now(),
        };
        const ret = orig.call(this, time, delta);
        window.__voyageUpdateLog.push(before);
        return ret;
      };
    }

    // 记录 Phaser loop fps
    window.__loopFpsLog = [];
    if (game.loop && game.loop.actualFps !== undefined) {
      const interval = setInterval(() => {
        window.__loopFpsLog.push({
          fps: game.loop.actualFps,
          delta: game.loop.delta,
          frame: game.loop.frame,
          time: Date.now(),
        });
      }, 100);
      window.__fpsInterval = interval;
    }
  });

  // 等 3 秒
  await page.waitForTimeout(3000);

  const postVoyage = await page.evaluate(() => {
    const game = window.__qatarGame;
    let resultScene = null;
    for (const scene of game.scene.scenes) {
      if (scene.scene && scene.scene.key === 'ResultScene' && scene.playVoyageAnimation) {
        resultScene = scene;
        break;
      }
    }
    if (!resultScene) return { error: 'no ResultScene' };

    const log = window.__voyageUpdateLog || [];
    const fpsLog = window.__loopFpsLog || [];

    // 统计 _voyageUpdate 调用次数 + delta 总和
    const totalDelta = log.reduce((s, e) => s + (e.delta || 0), 0);
    const deltaValues = log.map(e => e.delta);
    const avgDelta = log.length ? totalDelta / log.length : 0;
    const minDelta = log.length ? Math.min(...deltaValues) : 0;
    const maxDelta = log.length ? Math.max(...deltaValues) : 0;

    // 计算实际累计秒数 (sum of delta / 1000)
    const elapsedSec = totalDelta / 1000;

    return {
      voyageT: resultScene.voyageT,
      voyageSpeed: resultScene.voyageSpeed,
      voyageReturnMode: resultScene.voyageReturnMode,
      voyageMidpointReached: resultScene.voyageMidpointReached,
      voyageDone: resultScene.voyageDone,
      voyageContainerVisible: resultScene.voyageContainer.visible,
      shipX: resultScene.shipContainer.x,
      shipY: resultScene.shipContainer.y,
      updateCallCount: log.length,
      totalDelta: totalDelta,
      avgDelta: avgDelta,
      minDelta: minDelta,
      maxDelta: maxDelta,
      elapsedSec: elapsedSec,
      firstCall: log[0] || null,
      lastCall: log[log.length - 1] || null,
      // Phaser loop fps
      fpsLogCount: fpsLog.length,
      avgFps: fpsLog.length ? fpsLog.reduce((s, e) => s + e.fps, 0) / fpsLog.length : 0,
      loopDelta: fpsLog.map(e => e.delta),
      loopFrame: game.loop ? game.loop.frame : null,
      loopActualFps: game.loop ? game.loop.actualFps : null,
    };
  });

  console.log('\n  POST-VOYAGE STATE:');
  console.log(JSON.stringify(postVoyage, null, 2));

  // 诊断结论
  console.log('\n[6] DIAGNOSIS:');
  if (postVoyage.updateCallCount === 0) {
    console.log('  ✗ _voyageUpdate NEVER CALLED');
  } else {
    console.log(`  _voyageUpdate called ${postVoyage.updateCallCount} times in 3s`);
    console.log(`  avg delta = ${postVoyage.avgDelta.toFixed(2)}ms (期望 16.67ms)`);
    console.log(`  total elapsed (sum delta / 1000) = ${postVoyage.elapsedSec.toFixed(3)}s (期望 ≈3.0s)`);
    console.log(`  voyageT = ${postVoyage.voyageT.toFixed(4)} (期望 ≈0.75)`);
    console.log(`  ship.x = ${postVoyage.shipX.toFixed(1)} (期望从 366 移动到 ≈${(366 + 0.75 * (1024 - 366)).toFixed(0)})`);
    if (postVoyage.elapsedSec < 1.0) {
      console.log('  🔴 ROOT CAUSE: update 实际累计时间 < 1s (3s 真实时间内), 表明 update 调用频率极低 OR delta 异常小');
    } else if (postVoyage.voyageT < 0.5) {
      console.log('  🟡 voyageT 偏小, 但 elapsed ≈ 3s → voyageSpeed 可能有问题');
    } else {
      console.log('  ✅ voyageT 接近期望, 动画在播放');
    }
    console.log(`  Phaser loop actualFps = ${postVoyage.loopActualFps} (期望 60)`);
    if (postVoyage.loopActualFps && postVoyage.loopActualFps < 30) {
      console.log('  🔴 Phaser loop fps < 30 → headless RAF 节流 (chromium 已知问题)');
    }
  }

  console.log(`\n[7] pageerror: ${pageErrors.length}`);
  pageErrors.forEach(e => console.log(`  ✗ ${e}`));

  // 截图
  const screenshotPath = '/tmp/m24_voyage_diag.png';
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`  ✓ screenshot saved: ${screenshotPath} (${(fs.statSync(screenshotPath).size / 1024).toFixed(0)}KB)`);
  } catch (e) {
    console.log('  ✗ screenshot fail:', e.message);
  }

  await browser.close();

  if (pageErrors.length > 0) {
    console.log('\n✗ pageerror > 0');
    process.exit(1);
  }
  console.log('\n✅ Diagnostic complete');
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});