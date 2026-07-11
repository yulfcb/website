// @ts-check
// Cappadocia 热气球组装 · 烟雾测试
// 加载 /games/silk-road/level/2, 走完 8 步, 验证跳转到 level/3 (kazakhstan)
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1';
const TURKEY_URL = BASE_URL + '/games/silk-road/level/2';
const KAZAKH_URL = BASE_URL + '/games/silk-road/level/3';

function findScene(page, key) {
  return page.evaluate(
    '(function () { return !!window.__turkeyGame && !!window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === \'' + key + '\';}); })()'
  );
}

test('turkey 8 步组装 + 飞往 kazakhstan', async ({ page }) => {
  test.setTimeout(90000);  // 8 步 + 飞行动画 + 跳转, 总时长约 35s
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message || String(err)));

  await page.goto(TURKEY_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 等 BootScene → AssembleScene
  await page.waitForFunction(findScene.toString().replace(/^.*'/, '').replace(/'.*$/, '') + '"AssembleScene"', { timeout: 15000 }).catch(async () => {
    // fallback: 直接等 window.__turkeyGame
    await page.waitForFunction('window.__turkeyGame && window.__turkeyGame.scene.scenes.length >= 2', { timeout: 15000 });
  });

  // 等 AssembleScene.currentStep === 0
  await page.waitForFunction(
    'window.__turkeyGame && window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 0',
    { timeout: 10000 }
  );

  console.log('[step 0 reached] 欢迎页');

  // Step 0 → 1: 点 "开始制作" 按钮 (zone 在 640, 660, w=360 h=64)
  await page.mouse.click(640, 660);
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 1',
    { timeout: 5000 }
  );
  console.log('[step 1 reached] 选布料');

  // Step 1 → 2: 点中间布料 (Nylon @ 280 + 1*220 = 500, y=380)
  await page.mouse.click(500, 380);
  // 自动 900ms 后进 step 2
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 2',
    { timeout: 5000 }
  );
  console.log('[step 2 reached] 缝制');

  // Step 2: 点 6 个缝合点 (center 640,400, STITCH_POINTS 偏移 x=-90..-130, y=-200..200)
  // 绝对位置: (550, 200), (520, 280), (510, 360), (510, 440), (520, 520), (550, 600)
  const stitchPts = [
    [550, 200], [520, 280], [510, 360], [510, 440], [520, 520], [550, 600],
  ];
  for (const [x, y] of stitchPts) {
    await page.mouse.click(x, y);
    await page.waitForTimeout(80);
  }
  // 等自动跳 step 3 (1.2s 延迟)
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 3',
    { timeout: 5000 }
  );
  console.log('[step 3 reached] 框架');

  // Step 3: 点 3 根竹条 (在 (startX, startY + 15), startY 大约 580+200=780+ ... 实际看代码: startY = centerY + sin(angle) * 240 + 200)
  // 3 个角度 0, 2π/3, 4π/3, centerY=380, startY base = 380 + 200 = 580, +sin*240
  // angle=0: cos(−π/2)=0, sin(−π/2)=−1, startX=640, startY=380+(−1)*240+200=340? 不对。
  // 实际: ang = (i / 4) * Math.PI * 2 - Math.PI / 2
  //     i=0: ang=-π/2, cos=0, sin=-1, startX=640+0=640, startY=380-240+200=340
  //     i=1: ang=2π/3-π/2=π/6, cos=√3/2≈0.866, sin=0.5, startX=640+208=848, startY=380+120+200=700
  //     i=2: ang=4π/3-π/2=5π/6, cos=-√3/2, sin=0.5, startX=640-208=432, startY=380+120+200=700
  // 注意 zone 在 (startX+15, startY+15) 但交互是 60x60
  await page.mouse.click(640 + 15, 340 + 15);
  await page.waitForTimeout(150);
  await page.mouse.click(848 + 15, 700 + 15);
  await page.waitForTimeout(150);
  await page.mouse.click(432 + 15, 700 + 15);
  await page.waitForTimeout(150);
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 4',
    { timeout: 5000 }
  );
  console.log('[step 4 reached] 吊篮');

  // Step 4: 3 个螺丝 (centerX=640, basketY=510, ropePositions = (600,490), (640,490), (680,490))
  await page.mouse.click(600, 490);
  await page.waitForTimeout(120);
  await page.mouse.click(640, 490);
  await page.waitForTimeout(120);
  await page.mouse.click(680, 490);
  await page.waitForTimeout(120);
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 5',
    { timeout: 5000 }
  );
  console.log('[step 5 reached] 充气');

  // Step 5: 长按鼓风机 (blowerX=250, blowerY=480), 2 秒
  await page.mouse.move(250, 480);
  await page.mouse.down();
  await page.waitForTimeout(2300);  // 等 tween 完成
  await page.mouse.up();
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 6',
    { timeout: 5000 }
  );
  console.log('[step 6 reached] 点火');

  // Step 6: 点打火机 (lighterX=950, lighterY=500)
  await page.mouse.click(950, 500);
  await page.waitForTimeout(2000);  // 等 1.5s 火焰 + 1.2s modal
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "AssembleScene";}).currentStep === 7',
    { timeout: 5000 }
  );
  console.log('[step 7 reached] 出发');

  // Step 7: 点大按钮 "🎈 乘坐热气球出发" (640, 660, w=480 h=76)
  // 监听跳转而不是真的跳转 (避免依赖 kazakhstan 模板状态)
  let navigatedTo = null;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigatedTo = frame.url();
  });

  await page.mouse.click(640, 660);
  // 等 FlightScene
  await page.waitForFunction(
    'window.__turkeyGame.scene.scenes.find(function(s){return s.scene && s.scene.key === "FlightScene";}).scene.isActive()',
    { timeout: 5000 }
  );
  console.log('[FlightScene reached] 等待跳转 kazakhstan...');

  // 等跳转到 /games/silk-road/level/3 (用 domcontentloaded — kazakhstan 模板的 Pixi.js 不触发 load)
  await page.waitForURL('**/level/3', { timeout: 10000, waitUntil: 'domcontentloaded' });
  console.log('[SUCCESS] jumped to kazakhstan:', page.url());

  // 验证没 JS error (过滤掉 kazakhstan 模板的 Pixi.js parse 噪声)
  var allowedNoise = /Audio|user gesture|autoplay|Unexpected string|Pixi|silk-road-bgm|readPixels|PIX/i;
  var realErrors = pageErrors.filter(function (e) { return !allowedNoise.test(e); });
  if (realErrors.length) {
    console.log('[real errors]', JSON.stringify(realErrors));
  }
  expect(realErrors).toEqual([]);
});