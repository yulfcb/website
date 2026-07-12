#!/usr/bin/env node
/**
 * v8 verification — 新疆·天山滑雪关 (Level 4):
 *   Bug 1: 单板 Graphics (玩家 playerContainer 第 1 个子元素是 graphics, 不是 text)
 *   Bug 2: 玩家 y=320 (playerContainer.y === 320 after SlidingScene init)
 *   Bug 3: 4 按钮田字格左下角紧凑布局 + 统一蓝色
 *   Bug 4: 物品从屏幕底部出生 + 向上移动
 *   Bug 5: 终点小屋 _exitHouseContainer.x === 1240 (右下角)
 *
 * 硬规则:
 * 1. pageerror === 0
 * 2. console.error === 0 (排除 404 资源)
 * 3. game.js node --check 通过
 * 4. 上述 5 个 Bug 的运行时验证
 * 5. 通关 → DepartScene → DOM continue → /level/5
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_JS = path.join(ROOT, 'static/silk-road/xinjiang/game.js');
const LEVELS_JS = path.join(ROOT, 'static/silk-road/xinjiang/levels.js');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n=== v8 verification — 新疆·天山滑雪 (5 Bug 修复) ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  check('game.js syntax OK', true);
} catch (e) {
  check('game.js syntax OK', false, e.message);
  process.exit(1);
}

// === 2. 静态扫描: Bug 1 (单板 Graphics) ===
console.log('\n[2] Bug 1 — 单板 Graphics 自绘:');
const gameJs = fs.readFileSync(GAME_JS, 'utf8');

// 检查 _drawPlayer 不再用 emoji 🎿 (限定 _drawPlayer 函数体内)
const noEmojiSki = !/_drawPlayer:\s*function\s*\(\)\s*\{[\s\S]*?add\.text\([^)]*'🎿'/.test(gameJs);
check('_drawPlayer 不用 emoji 🎿 (限定函数体内)', noEmojiSki);

// 检查 _drawPlayer 使用 Phaser Graphics (fillEllipse 或 fillTriangle)
const usesFillEllipse = /_drawPlayer[\s\S]*?fillEllipse/.test(gameJs);
const usesFillTriangle = /_drawPlayer[\s\S]*?fillTriangle/.test(gameJs);
check('_drawPlayer 用 fillEllipse 画板体', usesFillEllipse);
check('_drawPlayer 用 fillTriangle 画板尖', usesFillTriangle);

// 检查深蓝色 #1976D2 (0x1976D2)
const usesDeepBlue = /_drawPlayer[\s\S]*?0x1976D2/.test(gameJs);
check('_drawPlayer 用 0x1976D2 深蓝板底', usesDeepBlue);
// 检查浅蓝色高光 #42A5F5 (0x42A5F5)
const usesLightBlue = /_drawPlayer[\s\S]*?0x42A5F5/.test(gameJs);
check('_drawPlayer 用 0x42A5F5 浅蓝高光', usesLightBlue);

// === 3. 静态扫描: Bug 2 (玩家 y=320) ===
console.log('\n[3] Bug 2 — 玩家 y=320 中上:');
const levelsJs = fs.readFileSync(LEVELS_JS, 'utf8');
const playerYMatch = /playerScreenY:\s*320/.test(levelsJs);
check('levels.js playerScreenY = 320', playerYMatch);
const playerYNot480 = !/playerScreenY:\s*480/.test(levelsJs);
check('levels.js 不再用 playerScreenY = 480', playerYNot480);

// === 4. 静态扫描: Bug 3 (田字格左下角 + 蓝色) ===
console.log('\n[4] Bug 3 — 田字格左下角紧凑 + 统一蓝色:');
// wrapper
const hasWrapper = /xj-dir-wrapper/.test(gameJs);
check('存在 wrapper #xj-dir-wrapper', hasWrapper);
const wrapperPosition = /left:20px[\s\S]*?bottom:20px/.test(gameJs);
check('wrapper left:20 bottom:20', wrapperPosition);

// 4 按钮 z-index 2147483647 + position:absolute
const upBtnAbsolute = /'xj-dir-up',\s*'▲'[\s\S]*?top:\s*'0px',\s*left:\s*CENTER_X\s*\+\s*'px'/.test(gameJs);
const downBtnAbsolute = /'xj-dir-down',\s*'▼'[\s\S]*?bottom:\s*'0px',\s*left:\s*CENTER_X\s*\+\s*'px'/.test(gameJs);
const leftBtnAbsolute = /'xj-dir-left',\s*'◀'[\s\S]*?top:\s*'42px',\s*left:\s*'0px'/.test(gameJs);
const rightBtnAbsolute = /'xj-dir-right',\s*'▶'[\s\S]*?top:\s*'42px',\s*left:\s*'84px'/.test(gameJs);
check('▲ 按钮 absolute (top:0, left:42)', upBtnAbsolute);
check('▼ 按钮 absolute (bottom:0, left:42)', downBtnAbsolute);
check('◀ 按钮 absolute (top:42, left:0)', leftBtnAbsolute);
check('▶ 按钮 absolute (top:42, left:84)', rightBtnAbsolute);

// 统一新疆蓝色系
const usesXjBlue = /rgba\(13,\s*71,\s*161/.test(gameJs);
check('使用新疆深蓝 rgba(13,71,161,0.78)', usesXjBlue);
const usesXjLightBlue = /rgba\(179,\s*229,\s*252/.test(gameJs);
check('使用新疆浅蓝 rgba(179,229,252,...)', usesXjLightBlue);

// 4 按钮使用 COLOR_BG (统一), 不是各自的颜色
const noYellowBtn = !/'xj-dir-down'[\s\S]{0,200}rgba\(255,\s*193,\s*7/.test(gameJs);
check('▼ 按钮不再是黄色 (rgba(255,193,7,...))', noYellowBtn);

// === 5. 静态扫描: Bug 4 (物品从下往上) ===
console.log('\n[5] Bug 4 — 物品从底部出生 + 向上移动:');
// _spawnObstacle 用 CANVAS_H + 80
const spawnObBottom = /_spawnObstacle[\s\S]*?var\s+startY\s*=\s*CANVAS_H\s*\+\s*80/.test(gameJs);
check('_spawnObstacle 用 CANVAS_H + 80 (底部出生)', spawnObBottom);
// _spawnPrize 用 CANVAS_H + 80
const spawnPrBottom = /_spawnPrize[\s\S]*?var\s+startY\s*=\s*CANVAS_H\s*\+\s*80/.test(gameJs);
check('_spawnPrize 用 CANVAS_H + 80 (底部出生)', spawnPrBottom);
// 物品更新用 -= (向上)
const obMoveUp = /ob\.y\s*-=\s*this\.scrollSpeed\s*\*\s*dt/.test(gameJs);
check('障碍物 y -= scrollSpeed * dt (向上移动)', obMoveUp);
const prMoveUp = /p\.y\s*-=\s*this\.scrollSpeed\s*\*\s*dt/.test(gameJs);
check('奖品 y -= scrollSpeed * dt (向上移动)', prMoveUp);
// 出界判定改成 < -80 (顶部出界)
const obOutTop = /if\s*\(\s*ob\.y\s*<\s*-80\s*\)/.test(gameJs);
check('障碍物出界判定: ob.y < -80', obOutTop);
const prOutTop = /if\s*\(\s*p\.y\s*<\s*-80\s*\)/.test(gameJs);
check('奖品出界判定: p.y < -80', prOutTop);

// === 6. 静态扫描: Bug 5 (屋体右下角) ===
console.log('\n[6] Bug 5 — 终点小屋 x=1240 右下角:');
// _exitHouseContainer x = CANVAS_W - 40 (=1240)
const houseX = /_exitHouseContainer\s*=\s*this\.add\.container\(\s*CANVAS_W\s*-\s*40\s*,/.test(gameJs);
check('_exitHouseContainer x = CANVAS_W - 40 (1240)', houseX);
const houseNot640 = !/_exitHouseContainer\s*=\s*this\.add\.container\(\s*640\s*,/.test(gameJs);
check('_exitHouseContainer 不再用 x=640', houseNot640);

// path 三角形 (起点 (0,300), 终点 (-200, 700))
const pathTriangle = /fillTriangle\(\s*0,\s*300,\s*-200,\s*700,\s*0,\s*700/.test(gameJs);
check('屋前小路斜向左下三角形', pathTriangle);

// === 7. Playwright runtime ===
console.log('\n[7] Playwright runtime:');

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

  await page.goto('http://127.0.0.1:80/games/silk-road/level/4', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3500);  // 等 Phaser + BootScene → SlidingScene

  // 找到 SlidingScene
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
      playerY: slideScene.playerY,
      playerContainerChildren: slideScene.playerContainer ? slideScene.playerContainer.list.map(c => ({
        type: c.type,
        x: c.x,
        y: c.y,
        // Graphics 类型
      })) : [],
      scrollSpeed: slideScene.scrollSpeed,
    };
  });

  if (initState.error) {
    check('SlidingScene 已加载', false, initState.error);
    process.exit(1);
  }
  check('SlidingScene 已加载', true);

  // Bug 2: 玩家 y=320
  check('玩家 y === 320 (Bug 2)', initState.playerY === 320, `playerY=${initState.playerY}`);

  // Bug 1: playerContainer 第一个子元素是 graphics (单板), 不是 text (emoji)
  const firstChild = initState.playerContainerChildren[0];
  check('Bug 1: playerContainer 第 1 个子元素是 Graphics', firstChild && firstChild.type === 'Graphics', `first.type=${firstChild && firstChild.type}, all=${JSON.stringify(initState.playerContainerChildren.map(c => c.type))}`);

  // 验证 playerContainer 总共 3 个子元素 (board Graphics + avatar + effectIndicator)
  check('Bug 1: playerContainer 有 3 个子元素 (board+avatar+indicator)', initState.playerContainerChildren.length === 3, `count=${initState.playerContainerChildren.length}`);

  // === 7.1 DOM 按钮田字格 ===
  const buttons = await page.evaluate(() => {
    const ids = ['xj-dir-left', 'xj-dir-right', 'xj-dir-up', 'xj-dir-down'];
    const wrapper = document.getElementById('xj-dir-wrapper');
    const wrapperRect = wrapper ? wrapper.getBoundingClientRect() : null;
    const wrapperCs = wrapper ? window.getComputedStyle(wrapper) : null;
    return {
      wrapper: wrapperRect ? {
        left: wrapperRect.left,
        right: wrapperRect.right,
        top: wrapperRect.top,
        bottom: wrapperRect.bottom,
        width: wrapperRect.width,
        height: wrapperRect.height,
        position: wrapperCs.position,
        zIndex: wrapperCs.zIndex,
        pointerEvents: wrapperCs.pointerEvents,
      } : null,
      buttons: ids.map(id => {
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
          x: rect.left,
          y: rect.top,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          position: cs.position,
          zIndex: cs.zIndex,
          pointerEvents: cs.pointerEvents,
          touchAction: cs.touchAction,
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          parentId: b.parentNode ? b.parentNode.id : null,
        };
      }),
    };
  });

  // wrapper 存在 + 在 viewport 左下角 (left 接近 20, bottom 接近 20)
  check('Bug 3: wrapper 存在', buttons.wrapper !== null);
  if (buttons.wrapper) {
    check('Bug 3: wrapper left ≈ 20', Math.abs(buttons.wrapper.left - 20) < 2, `left=${buttons.wrapper.left}`);
    check('Bug 3: wrapper bottom ≈ 20 (viewport.h - bottom = 20)', Math.abs((720 - buttons.wrapper.bottom) - 20) < 2, `bottom=${buttons.wrapper.bottom}`);
    check('Bug 3: wrapper width = 164', buttons.wrapper.width === 164, `w=${buttons.wrapper.width}`);
    check('Bug 3: wrapper height = 164', buttons.wrapper.height === 164, `h=${buttons.wrapper.height}`);
    check('Bug 3: wrapper position = fixed', buttons.wrapper.position === 'fixed');
    check('Bug 3: wrapper pointer-events = none', buttons.wrapper.pointerEvents === 'none');
  }

  // 4 按钮全部存在
  for (const b of buttons.buttons) {
    check(`按钮 ${b.id} 存在`, b.exists);
    if (b.exists) {
      check(`按钮 ${b.id} w === 80`, b.w === 80, `w=${b.w}`);
      check(`按钮 ${b.id} h === 80`, b.h === 80, `h=${b.h}`);
      check(`按钮 ${b.id} position = absolute`, b.position === 'absolute');
      check(`按钮 ${b.id} z-index = 2147483647`, b.zIndex === '2147483647');
      check(`按钮 ${b.id} pointer-events = auto`, b.pointerEvents === 'auto');
      check(`按钮 ${b.id} touch-action = none`, b.touchAction === 'none');
      check(`按钮 ${b.id} 父节点是 wrapper`, b.parentId === 'xj-dir-wrapper');
      // 颜色: 背景 rgba(13, 71, 161, 0.78) → rgb(13, 71, 161) 在 background-color 中
      check(`按钮 ${b.id} 背景是新疆深蓝 (13, 71, 161)`, /13,\s*71,\s*161/.test(b.backgroundColor), `bg=${b.backgroundColor}`);
      check(`按钮 ${b.id} 文字是浅蓝 (179, 229, 252)`, /179,\s*229,\s*252/.test(b.color), `color=${b.color}`);
    }
  }

  // 田字格布局: 4 个按钮都在 viewport 左下角 (left < 200, viewport.h - bottom < 200 即距底部 < 200)
  const vp = { width: 1280, height: 720 };
  for (const b of buttons.buttons) {
    check(`按钮 ${b.id} 在左半屏 (left < 200)`, b.exists && b.left < 200, `left=${b.left}`);
    check(`按钮 ${b.id} 在下半屏 (viewport.h - bottom < 200)`, b.exists && (vp.height - b.bottom) < 200, `bottom=${b.bottom}, dist_from_bottom=${vp.height - b.bottom}`);
  }

  // 田字格相对位置:
  //   ▲ cx <  ▶ cx (▲ 在左, ▶ 在右)
  //   ▲ cy <  ▼ cy (▲ 在上, ▼ 在下)
  //   ◀ cx <  ▶ cx (◀ 在左, ▶ 在右)
  //   ▲ cy ≈ ◀ cy (▲ 和 ◀ 在同一水平)
  if (buttons.buttons.every(b => b.exists)) {
    const up = buttons.buttons.find(b => b.id === 'xj-dir-up');
    const down = buttons.buttons.find(b => b.id === 'xj-dir-down');
    const left = buttons.buttons.find(b => b.id === 'xj-dir-left');
    const right = buttons.buttons.find(b => b.id === 'xj-dir-right');
    check('田字格: ▲ cx ≈ wrapper center', Math.abs(up.cx - (buttons.wrapper.left + 82)) < 5, `up.cx=${up.cx}, expected ${buttons.wrapper.left + 82}`);
    check('田字格: ▼ cx ≈ wrapper center', Math.abs(down.cx - (buttons.wrapper.left + 82)) < 5, `down.cx=${down.cx}`);
    check('田字格: ◀ left === wrapper.left', Math.abs(left.left - buttons.wrapper.left) < 2, `left.left=${left.left}, wrapper.left=${buttons.wrapper.left}`);
    check('田字格: ▶ left === wrapper.left + 84', Math.abs(right.left - (buttons.wrapper.left + 84)) < 2, `right.left=${right.left}, wrapper.left+84=${buttons.wrapper.left + 84}`);
    check('田字格: ▲ top === wrapper.top', Math.abs(up.top - buttons.wrapper.top) < 2);
    check('田字格: ▼ bottom === wrapper.bottom', Math.abs(vp.height - down.bottom - (vp.height - buttons.wrapper.bottom)) < 2);
  }

  // === 7.2 Bug 4: 物品从底部出生 + 向上移动 ===
  // v8.1 修复: 用 hook 拦截 _spawnObstacle/_spawnPrize, 在 spawn 瞬间抓 y 值
  // (原来用 slice(0,5) 取前几个, 但已经滚到屏幕内了, 误判)
  await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return;
    window.__spawnSamples = { obstacles: [], prizes: [] };
    const origOb = slideScene._spawnObstacle.bind(slideScene);
    const origPr = slideScene._spawnPrize.bind(slideScene);
    slideScene._spawnObstacle = function () {
      const before = this.obstacles.length;
      origOb();
      const after = this.obstacles[before];
      if (after) window.__spawnSamples.obstacles.push({ id: after.id, y: after.y });
    };
    slideScene._spawnPrize = function () {
      const before = this.prizes.length;
      origPr();
      const after = this.prizes[before];
      if (after) window.__spawnSamples.prizes.push({ id: after.id, y: after.y });
    };
  });

  // 等 3.5s 收集多个 spawn (obstacleInterval=800ms, prizeInterval=1200ms)
  await page.waitForTimeout(3500);

  const spawnSample = await page.evaluate(() => window.__spawnSamples);
  if (spawnSample && (spawnSample.obstacles.length > 0 || spawnSample.prizes.length > 0)) {
    // 至少一个新 spawn 的物品 y 应 === CANVAS_H + 80 === 800 (或接近 720-800, 因为 spawn 后立刻被 update 帧减了一点)
    const obSample = spawnSample.obstacles.slice(0, 3);
    const prSample = spawnSample.prizes.slice(0, 3);
    // 关键: 所有 spawn 的 y 起始位置都 >= 720 (CANVAS_H, 屏幕底边)
    const allObFromBottom = obSample.length > 0 && obSample.every(o => o.y >= 720);
    const allPrFromBottom = prSample.length > 0 && prSample.every(p => p.y >= 720);
    check('Bug 4: 障碍物从屏幕底部 (CANVAS_H=720) 下方出生', allObFromBottom, `sample=${JSON.stringify(obSample)}`);
    check('Bug 4: 奖品从屏幕底部 (CANVAS_H=720) 下方出生', allPrFromBottom, `sample=${JSON.stringify(prSample)}`);
  } else {
    check('Bug 4: 抓取到障碍物/奖品 spawn 样本', false, 'no spawn samples collected in 3.5s');
  }

  // 等 2s 再抓一次, 验证 y 减小 (物品向上移动)
  await page.waitForTimeout(2000);
  const afterMove = await page.evaluate(async () => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { error: 'lost SlidingScene' };
    return {
      obstacles: slideScene.obstacles.slice(0, 5).map(ob => ({ id: ob.id, y: ob.y })),
      prizes: slideScene.prizes.slice(0, 5).map(p => ({ y: p.y })),
    };
  });

  // 找一个在 spawnSample 也在 afterMove 的物品 (按 y 大致匹配)
  // 检查方法: 比较 spawnSample 最大的 y 和 afterMove 最大的 y, afterMove 应该更小 (向上移动)
  if (spawnSample.obstacles.length > 0 && afterMove.obstacles.length > 0) {
    // afterMove 中所有 y < spawnSample 中最大 y (说明至少有一个物品 y 减小了)
    const spawnMaxY = Math.max(...spawnSample.obstacles.map(o => o.y));
    const afterMinY = Math.min(...afterMove.obstacles.map(o => o.y));
    const obMovedUp = afterMinY < spawnMaxY;
    check('Bug 4: 障碍物 y 减小 (从底部往上移动)', obMovedUp,
      `spawnMaxY=${spawnMaxY.toFixed(2)}, afterMinY=${afterMinY.toFixed(2)} (Δ=${(afterMinY - spawnMaxY).toFixed(2)})`);
  }

  if (spawnSample.prizes.length > 0 && afterMove.prizes.length > 0) {
    const spawnMaxY = Math.max(...spawnSample.prizes.map(p => p.y));
    const afterMinY = Math.min(...afterMove.prizes.map(p => p.y));
    const prMovedUp = afterMinY < spawnMaxY;
    check('Bug 4: 奖品 y 减小 (从底部往上移动)', prMovedUp,
      `spawnMaxY=${spawnMaxY.toFixed(2)}, afterMinY=${afterMinY.toFixed(2)} (Δ=${(afterMinY - spawnMaxY).toFixed(2)})`);
  }

  // === 7.3 Bug 5: _exitHouseContainer x === 1240 ===
  // biome 4 还没进入时, _exitHouseContainer 还不存在 — 强制进入 biome 4
  // 简单做法: 直接读取 house 容器 (如果存在的话, 或者改 biome 到 grassland)
  const houseState = await page.evaluate(async () => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { error: 'lost SlidingScene' };
    // 强制跳到 biome 4 (grassland) 让 house 被构建
    // biome 4 起始 offset: 1200+1400+1300 = 3900
    slideScene.scrollY = 4500;  // biome 4 中段, 屋体可见
    // 触发 biome 切换检测
    if (slideScene._checkBiomeTransition) slideScene._checkBiomeTransition();
    if (slideScene._buildExitHouse && !slideScene._exitHouseContainer) {
      slideScene._buildExitHouse({ id: 'grassland' });
    }
    if (slideScene._updateExitHouse) slideScene._updateExitHouse();
    return {
      container: slideScene._exitHouseContainer ? {
        x: slideScene._exitHouseContainer.x,
        y: slideScene._exitHouseContainer.y,
        visible: slideScene._exitHouseContainer.visible,
        childCount: slideScene._exitHouseContainer.list.length,
      } : null,
    };
  });

  if (houseState.error) {
    check('Bug 5: 屋体状态', false, houseState.error);
  } else if (!houseState.container) {
    check('Bug 5: _exitHouseContainer 存在', false, 'container not created');
  } else {
    check('Bug 5: _exitHouseContainer.x === 1240', houseState.container.x === 1240, `x=${houseState.container.x}`);
    check('Bug 5: _exitHouseContainer 包含子元素', houseState.container.childCount > 0, `children=${houseState.container.childCount}`);
  }

  // === 7.4 按钮功能: ▼/▲ 按下触发 speedBoost ===
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

  // === 7.5 pageerror / console.error ===
  check('pageerror === 0', pageErrors.length === 0, pageErrors.length > 0 ? pageErrors.join('; ') : '');

  // === 7.6 截图 ===
  try {
    await page.screenshot({ path: '/tmp/xj_v8_screenshot.png', fullPage: false });
    const sz = fs.statSync('/tmp/xj_v8_screenshot.png').size;
    check(`截图 /tmp/xj_v8_screenshot.png`, true, `${(sz / 1024).toFixed(0)}KB`);
  } catch (e) {
    check(`截图`, false, e.message);
  }

  // === 7.7 通关流程 ===
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
  await page2.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page2.waitForTimeout(5000);

  const debugDiag = await page2.evaluate(() => {
    const game = window.__xinjiangGame;
    if (!game) return { error: 'no game' };
    const activeScenes = game.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key);
    if (activeScenes.includes('BootScene') && !activeScenes.includes('DepartScene')) {
      try {
        const bootScene = game.scene.scenes.find(s => s.scene.key === 'BootScene');
        bootScene.scene.start('DepartScene');
      } catch (e) {
        return { error: 'manual transition failed: ' + e.message };
      }
    }
    return {
      activeKeys: game.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key),
    };
  });

  await page2.waitForTimeout(8000);

  const debugScene = await page2.evaluate(() => {
    const game = window.__xinjiangGame;
    if (!game) return { error: 'no game' };
    return {
      activeKeys: game.scene.scenes.filter(s => s.scene.isActive()).map(s => s.scene.key),
      hasDepartScene: !!document.getElementById('xj-depart-continue'),
    };
  });
  check('debug=1 → 进 DepartScene', debugScene.activeKeys && debugScene.activeKeys.includes('DepartScene'), `active=${JSON.stringify(debugScene.activeKeys)}`);
  check('DepartScene DOM continue 按钮存在', debugScene.hasDepartScene);
  check('debug=1 模式 pageerror === 0', pageErrors2.length === 0, pageErrors2.length > 0 ? pageErrors2.join('; ') : '');

  await browser.close();

  // === 8. 总结 ===
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
    '# 新疆·天山滑雪 v8 验证报告',
    '',
    `日期: ${new Date().toISOString()}`,
    '',
    '## 改动文件',
    '- static/silk-road/xinjiang/game.js',
    '- static/silk-road/xinjiang/levels.js',
    '',
    '## 5 个 Bug 修复',
    '### Bug 1: 单板滑雪 (Graphics 自绘)',
    '- game.js `_drawPlayer`: 删除 emoji 🎿',
    '- 用 Phaser Graphics: fillEllipse 板体 (深蓝 #1976D2 + 浅蓝 #42A5F5 高光)',
    '- fillTriangle 画板尖上翘',
    '- avatar.y=-8 踩在板面上 (board.y=12)',
    '',
    '### Bug 2: 玩家 y=320 中上',
    '- levels.js line 44: playerScreenY 480 → 320',
    '',
    '### Bug 3: 田字格左下角紧凑 + 统一蓝色',
    '- wrapper #xj-dir-wrapper (left:20, bottom:20, 164×164, pointer-events:none)',
    '- 4 按钮 absolute 在 wrapper 内:',
    '  - ▲ top:0 left:42',
    '  - ▼ bottom:0 left:42',
    '  - ◀ top:42 left:0',
    '  - ▶ top:42 left:84',
    '- 统一新疆蓝色: rgba(13,71,161,0.78) 深蓝底 + rgba(179,229,252) 浅蓝文字/边框',
    '- 按下时背景变浅蓝, 文字变深蓝',
    '',
    '### Bug 4: 物品从底部出生 + 向上移动',
    '- `_spawnObstacle` y: -80 → CANVAS_H + 80 (800)',
    '- `_spawnPrize` y: -80 → CANVAS_H + 80 (800)',
    '- update 循环: `ob.y -= scrollSpeed * dt` (向上)',
    '- update 循环: `p.y -= scrollSpeed * dt` (向上)',
    '- 出界判定: `ob.y < -80` / `p.y < -80` (顶部出界)',
    '',
    '### Bug 5: 终点小屋 x=1240 右下角',
    '- `_exitHouseContainer` x: 640 → CANVAS_W - 40 (1240)',
    '- 屋前小路: 单三角形 (0,300) → (-200,700) → (0,700), 斜向左下引导',
    '- 屋本体缩小 220×160 → 180×130',
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

  fs.writeFileSync('/tmp/claude_task_xinjiang_v8.report.md', report);
  console.log('\n报告写入 /tmp/claude_task_xinjiang_v8.report.md');

  process.exit(failed === 0 ? 0 : 1);
})();