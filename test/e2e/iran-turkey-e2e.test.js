// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1';
const IRAN_URL = BASE_URL + '/games/silk-road/level/1';

// Phaser 场景对象: s.key 是 null, 真实 key 在 s.scene.key
const PS = "window.__iranGame.scene.scenes.find((s) => s.scene && s.scene.key === 'PlayScene')";

function evalExpr(page, expr) {
  return page.evaluate('(function () { ' + expr + ' })()');
}

test.describe('silk-road iran → turkey 通关流程', () => {
  test('完整通关', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message || String(err));
    });

    await page.addInitScript(() => {
      try { localStorage.setItem('silkroad_cleared_levels', JSON.stringify([0])); } catch (e) {}
    });

    let navigatedTo = null;
    await page.route('**/silk-road/turkey/**', (route) => {
      navigatedTo = route.request().url();
      route.abort();
    });

    await page.goto(IRAN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await page.waitForFunction(
      'window.__iranGame && ' + PS + ' && ' + PS + '.playerContainer',
      { timeout: 20000 }
    );
    await page.waitForTimeout(500);

    // 1. 验证初始状态
    const initial = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'return {' +
      '  DEBUG_FILL_LUGGAGE: L.DEBUG_FILL_LUGGAGE,' +
      '  JUG_CAPACITY: L.JUG_CAPACITY,' +
      '  TARGET_JUGS: L.TARGET_JUGS,' +
      '  luggage: scene.luggage.map(function(e){return {id:e.id,qty:e.qty};}),' +
      '  coins: scene.coins,' +
      '  jugsCount: scene.jugs.length,' +
      '  totalWater: scene._totalWater(),' +
      '  camels: scene._luggageCount(-1004),' +
      '  exchangeKeys: Object.keys(L.EXCHANGE_RATES).map(Number).sort(function(a,b){return a-b;})' +
      '};'
    );
    console.log('[initial]', JSON.stringify(initial));

    expect(initial.DEBUG_FILL_LUGGAGE).toBe(true);
    expect(initial.JUG_CAPACITY).toBe(10);
    expect(initial.TARGET_JUGS).toBe(4);
    expect(initial.coins).toBe(0);
    expect(initial.jugsCount).toBe(1);
    expect(initial.totalWater).toBe(10);
    expect(initial.camels).toBe(0);

    // 2. 走到交易中心, 卖完 7 件
    await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'scene.player.x = L.exchange.x;' +
      'scene.player.y = L.exchange.y;' +
      'scene.playerContainer.x = L.exchange.x;' +
      'scene.playerContainer.y = L.exchange.y;' +
      'scene.player.lastMoveAt = 0;' +
      'if (scene.openExchangeModal) scene.openExchangeModal();'
    );
    await page.waitForTimeout(200);

    for (const id of initial.exchangeKeys) {
      await evalExpr(page, 'var scene = ' + PS + '; scene.doExchange(' + id + ');');
    }

    const afterExchange = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'return {' +
      '  coins: scene.coins,' +
      '  luggageLeft: scene.luggage.map(function(e){return {id:e.id,qty:e.qty};})' +
      '};'
    );
    console.log('[afterExchange]', JSON.stringify(afterExchange));
    expect(afterExchange.coins).toBe(340);
    expect(afterExchange.luggageLeft.map((e) => e.id).sort((a, b) => a - b)).toEqual([5]);

    // 3. 走到骆驼商, 买 3 只
    await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'var m = L.merchants.find(function(m){return m.id === 4;});' +
      'scene.player.x = m.x;' +
      'scene.player.y = m.y;' +
      'scene.playerContainer.x = m.x;' +
      'scene.playerContainer.y = m.y;' +
      'scene.player.lastMoveAt = 0;' +
      'if (scene.modalContainer) scene.modalContainer.setVisible(false);' +
      'scene.state = "PLAYING";' +
      'for (var i = 0; i < 3; i++) { scene.doBuy(m); scene.closeTradeModal(); }'
    );
    await page.waitForTimeout(200);

    const afterCamels = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'return { coins: scene.coins, camels: scene._luggageCount(-1004) };'
    );
    console.log('[afterCamels]', JSON.stringify(afterCamels));
    expect(afterCamels.camels).toBe(3);
    expect(afterCamels.coins).toBe(220);

    // 4. 走到水壶商, 买 3 只水壶 (初始已有 1 个, 凑满 4 个)
    await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'var m = L.merchants.find(function(m){return m.id === 5;});' +
      'scene.player.x = m.x;' +
      'scene.player.y = m.y;' +
      'scene.playerContainer.x = m.x;' +
      'scene.playerContainer.y = m.y;' +
      'scene.player.lastMoveAt = 0;' +
      'if (scene.modalContainer) scene.modalContainer.setVisible(false);' +
      'scene.state = "PLAYING";' +
      'for (var i = 0; i < 3; i++) { scene.doBuy(m); scene.closeTradeModal(); }'
    );
    await page.waitForTimeout(200);

    const afterJugs = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'return { coins: scene.coins, jugsCount: scene.jugs.length, jugsWater: scene.jugs.map(function(j){return j.water;}) };'
    );
    console.log('[afterJugs]', JSON.stringify(afterJugs));
    expect(afterJugs.jugsCount).toBe(4);
    expect(afterJugs.coins).toBe(130);

    // 5. 走到绿洲灌满水
    await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'var o = L.oases[0];' +
      'scene.player.x = o.x;' +
      'scene.player.y = o.y;' +
      'scene.playerContainer.x = o.x;' +
      'scene.playerContainer.y = o.y;' +
      'scene.checkOasisCollision();'
    );
    await page.waitForTimeout(200);

    const afterOasis = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'return { jugsCount: scene.jugs.length, totalWater: scene._totalWater(), allFull: scene._allJugsFull() };'
    );
    console.log('[afterOasis]', JSON.stringify(afterOasis));
    expect(afterOasis.jugsCount).toBe(4);
    expect(afterOasis.totalWater).toBe(40);
    expect(afterOasis.allFull).toBe(true);

    // 6. 走到出口, 触发穿越动画
    await evalExpr(page,
      'var scene = ' + PS + ';' +
      'var L = window.IRAN_LEVEL;' +
      'scene.player.x = L.exit.x;' +
      'scene.player.y = L.exit.y;' +
      'scene.playerContainer.x = L.exit.x;' +
      'scene.playerContainer.y = L.exit.y;' +
      'if (scene.tryExit) scene.tryExit();'
    );

    // 等 _exitingIran 变 true
    await page.waitForFunction(
      PS + ' && ' + PS + '._exitingIran === true',
      { timeout: 5000 }
    );

    // 等穿越动画跑完 (tryExit -> fadeOut 1500ms -> showCrossingAnimation)
    await page.waitForTimeout(2000);

    const duringExit = await evalExpr(page,
      'var scene = ' + PS + ';' +
      'return {' +
      '  _exitingIran: scene._exitingIran,' +
      '  state: scene.state,' +
      '  camelMode: scene.camelMode,' +
      '  hasCrossingTitle: scene.children.list.some(function(c){return c.type === "Text" && c.text && c.text.indexOf("前往土耳其") !== -1;})' +
      '};'
    );
    console.log('[duringExit]', JSON.stringify(duringExit));
    expect(duringExit._exitingIran).toBe(true);
    expect(duringExit.hasCrossingTitle).toBe(true);
    expect(duringExit.camelMode).toBe(true);

    // 7. 等跳转 (动画 8s + fade 1.1s)
    await page.waitForTimeout(10000);

    // 8. 0 pageerror
    console.log('[pageErrors]', pageErrors);
    expect(pageErrors).toEqual([]);
    console.log('[navigatedTo]', navigatedTo);
  });
});