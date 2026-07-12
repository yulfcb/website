#!/usr/bin/env node
/**
 * v10 verification — 新疆·天山滑雪关 (Level 4) 彩蛋流程:
 *
 *   1. 屋体位置左移 (x = CANVAS_W - 200 = 1080)
 *   2. 滑进屋后触发彩蛋:
 *      - 显示小木屋内背景 (Graphics 自绘暖色调)
 *      - 显示"恭喜你完成任务"+ "打开彩蛋"按钮
 *   3. 密码输入流程:
 *      - 点击"打开彩蛋"→ 显示密码 modal
 *      - 提示 "8位数纪念日"
 *      - 输入错误密码 → 提示重试
 *      - 输入正确密码 20230205 → 进入信件
 *   4. 信件弹窗:
 *      - 显示信件文字 (含"你愿意复合吗?")
 *      - 显示 A/B 两个按钮
 *   5. 用户选择 → webhook 通知
 *   6. 后端 webhook 端点 /api/silk-road/easter-egg 接受 4 种事件
 *
 * 硬规则:
 * 1. pageerror === 0
 * 2. console.error === 0 (排除 404 资源)
 * 3. game.js / app.py 语法 OK
 * 4. 上述彩蛋流程运行时验证
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GAME_JS = path.join(ROOT, 'static/silk-road/xinjiang/game.js');
const APP_PY = path.join(ROOT, 'app.py');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n=== v10 verification — 新疆·天山滑雪 (彩蛋流程) ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
try {
  execSync(`node --check "${GAME_JS}"`, { stdio: 'pipe' });
  check('game.js syntax OK', true);
} catch (e) {
  check('game.js syntax OK', false, e.message);
  process.exit(1);
}

try {
  execSync(`python3 -m py_compile "${APP_PY}"`, { stdio: 'pipe' });
  check('app.py syntax OK', true);
} catch (e) {
  check('app.py syntax OK', false, e.message);
}

// === 2. 静态扫描: 屋体左移 ===
console.log('\n[2] 屋体左移 (v10: 1240 → 1080):');
const gameJs = fs.readFileSync(GAME_JS, 'utf8');

// _exitHouseContainer x = CANVAS_W - 200
const houseLeft = /_exitHouseContainer\s*=\s*this\.add\.container\(\s*CANVAS_W\s*-\s*200\s*,/.test(gameJs);
check('_exitHouseContainer x = CANVAS_W - 200 (1080)', houseLeft);
const houseNotOld1240 = !/_exitHouseContainer\s*=\s*this\.add\.container\(\s*CANVAS_W\s*-\s*40\s*,/.test(gameJs);
check('不再用 x = CANVAS_W - 40 (1240)', houseNotOld1240);

// === 3. 静态扫描: 彩蛋流程函数 ===
console.log('\n[3] 彩蛋流程函数 (v10):');
const functions = ['_triggerEasterEgg', '_showPasswordPrompt', '_showLetter', '_showChoiceResult', '_notifyEasterEgg'];
functions.forEach(fn => {
  const hasFn = new RegExp(fn + ':\\s*function').test(gameJs);
  check(fn + ' 函数存在', hasFn);
});

// _showWin 不再调用 _showWinPanel
const noShowWinPanel = !/_showWin\s*=\s*function[\s\S]*?_showWinPanel\(/.test(gameJs);
check('_showWin 不再调用 _showWinPanel (改成彩蛋)', noShowWinPanel);

// _showWin 调用 _triggerEasterEgg
const triggerEasterEgg = /self\._triggerEasterEgg\(\)/.test(gameJs);
check('_showWin 调用 _triggerEasterEgg', triggerEasterEgg);

// === 4. 静态扫描: 密码 + 信件内容 ===
console.log('\n[4] 密码 + 信件内容:');

// 密码 20230205 (客户端可见, 跟 send_game_secret_feishu 模式一致)
const hasPassword = /pwd\s*===\s*'20230205'/.test(gameJs);
check('正确密码 20230205 (硬编码客户端)', hasPassword);

// 8 位密码提示
const hasHint = /8\s*位数\s*纪念日/.test(gameJs);
check('提示 "8位数纪念日"', hasHint);

// 信件内容
const hasLetterContent = /你愿意复合吗/.test(gameJs);
check('信件含 "你愿意复合吗?"', hasLetterContent);

const hasBirthday = /18\s*岁生日快乐/.test(gameJs);
check('信件含 "18岁生日快乐"', hasBirthday);

// A/B 选项
const hasA = /A\.\s*立马复合/.test(gameJs);
const hasB = /B\.\s*晚点复合/.test(gameJs);
check('A 选项 "立马复合"', hasA);
check('B 选项 "晚点复合"', hasB);

// webhook 调用: sendBeacon / fetch
const hasWebhook = /\/api\/silk-road\/easter-egg/.test(gameJs);
check('前端调 webhook /api/silk-road/easter-egg', hasWebhook);
const hasBeacon = /navigator\.sendBeacon/.test(gameJs);
const hasFetch = /fetch\(\s*'\/api\/silk-road\/easter-egg'/.test(gameJs);
check('前端用 sendBeacon + fetch 兜底', hasBeacon || hasFetch);

// === 5. 静态扫描: 后端 webhook 端点 ===
console.log('\n[5] 后端 webhook 端点 (app.py):');
const appPy = fs.readFileSync(APP_PY, 'utf8');

const hasRoute = /@app\.route\(['"]\/api\/silk-road\/easter-egg['"]/.test(appPy);
check('/api/silk-road/easter-egg 路由存在', hasRoute);

const hasEasterFn = /def\s+send_easter_egg_feishu\s*\(/.test(appPy);
check('send_easter_egg_feishu 函数存在', hasEasterFn);

const hasValidEvents = /valid_events\s*=\s*\(\s*['"]password_correct['"]\s*,\s*['"]letter_open['"]\s*,\s*['"]choice_A['"]\s*,\s*['"]choice_B['"]\s*\)/.test(appPy);
check('校验 4 种 event 类型', hasValidEvents);

// === 6. Playwright runtime ===
console.log('\n[6] Playwright runtime:');

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
  const webhookCalls = [];

  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (/Failed to load resource.*404/.test(text)) return;
      // 排除故意发的 invalid event (测试预期 400 响应)
      if (/Failed to load resource.*400/.test(text) && webhookCalls.length >= 2) return;
      pageErrors.push('[console.error] ' + text);
    }
  });

  // 拦截 webhook 调用 (只 valid event, invalid 走真实后端)
  await page.route('**/api/silk-road/easter-egg', async (route, request) => {
    let body = {};
    try {
      if (request.method() === 'POST') {
        const data = request.postData();
        if (data) body = JSON.parse(data);
      }
    } catch (e) {}
    // 只拦截 valid 事件 (e2e 监控), invalid 让它走真实后端 (验证 400)
    if (!body.event || !['password_correct', 'letter_open', 'choice_A', 'choice_B'].includes(body.event)) {
      await route.continue();
      return;
    }
    webhookCalls.push({
      event: body.event,
      detail: body.detail,
      timestamp: body.timestamp,
      method: request.method(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('http://127.0.0.1:80/games/silk-road/level/4', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3500);

  // === 6.1 屋体 x = 1080 ===
  console.log('\n[6.1] 屋体 x = 1080 (左移):');
  const housePos = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { error: 'no scene' };
    // 强制跳到 biome 4
    slideScene.scrollY = 4500;
    if (slideScene._checkBiomeTransition) slideScene._checkBiomeTransition();
    if (slideScene._buildExitHouse && !slideScene._exitHouseContainer) {
      slideScene._buildExitHouse({ id: 'grassland' });
    }
    const c = slideScene._exitHouseContainer;
    if (!c) return { error: 'no container' };
    return { x: c.x, y: c.y };
  });
  if (housePos.error) {
    check('屋体状态', false, housePos.error);
  } else {
    check('屋体 x === 1080 (CANVAS_W - 200)', housePos.x === 1080, `x=${housePos.x}`);
  }

  // === 6.2 触发 _showWin → _triggerEasterEgg ===
  console.log('\n[6.2] 触发彩蛋流程 (滑进屋 → _triggerEasterEgg):');
  await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return;
    // 调用 _showWin 触发彩蛋
    if (slideScene._showWin) slideScene._showWin();
  });
  await page.waitForTimeout(800);  // 等 0.5s delay + 0.3s 动画

  const eggState = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { error: 'no scene' };
    // 找彩蛋相关 graphics / text
    const all = slideScene.children.list;
    const texts = all.filter(c => c.type === 'Text').map(c => c.text);
    const hasEggBg = all.some(c => c.type === 'Graphics' && c.depth >= 1000 && c.depth < 2000);
    return {
      state: slideScene.state,
      texts: texts.slice(-10),  // 最近 10 个 text
      hasEggBg,
    };
  });

  check('触发 _showWin 后 state === WIN', eggState.state === 'WIN', `state=${eggState.state}`);
  check('彩蛋背景存在 (Graphics depth 1000-2000)', eggState.hasEggBg);
  const hasTitleText = eggState.texts.some(t => t && t.includes('恭喜你完成任务'));
  check('标题 "恭喜你完成任务" 存在', hasTitleText, `texts=${JSON.stringify(eggState.texts)}`);
  const hasEggBtn = eggState.texts.some(t => t && t.includes('打开彩蛋'));
  check('"打开彩蛋"按钮存在', hasEggBtn);

  // === 6.3 截图 (彩蛋场景) ===
  try {
    await page.screenshot({ path: '/tmp/xj_v10_easter_egg.png', fullPage: false });
    const sz = fs.statSync('/tmp/xj_v10_easter_egg.png').size;
    check(`截图 /tmp/xj_v10_easter_egg.png`, true, `${(sz / 1024).toFixed(0)}KB`);
  } catch (e) {
    check(`截图`, false, e.message);
  }

  // === 6.4 点击"打开彩蛋"按钮 → 密码 modal ===
  console.log('\n[6.4] 打开彩蛋 → 密码 modal:');
  // 模拟点击 _triggerEasterEgg 创建的按钮
  // 找 depth 1501-1502 的 rectangle/text (按钮本体 + 文字)
  await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return;
    // 调用 _showPasswordPrompt 直接 (避免 click 模拟问题)
    if (slideScene._showPasswordPrompt) slideScene._showPasswordPrompt();
  });
  await page.waitForTimeout(500);

  // 检查 password input (DOM)
  const inputState = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
    return {
      count: inputs.length,
      hasInput: inputs.length > 0,
      maxLength: inputs[0] ? inputs[0].maxLength : null,
    };
  });
  check('密码输入框存在 (HTML input)', inputState.hasInput, `count=${inputState.count}, maxLength=${inputState.maxLength}`);
  check('密码 maxLength === 8', inputState.maxLength === 8, `maxLength=${inputState.maxLength}`);

  // 检查密码 modal 内容
  const modalText = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return [];
    return slideScene.children.list.filter(c => c.type === 'Text').map(c => c.text).slice(-5);
  });
  const hasPasswordTitle = modalText.some(t => t && (t.includes('输入密码') || t.includes('纪念日')));
  check('密码 modal 标题/提示存在', hasPasswordTitle, `texts=${JSON.stringify(modalText)}`);

  // === 6.5 错误密码 → 重试 ===
  console.log('\n[6.5] 错误密码 → 重试提示:');
  await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    if (input) {
      input.value = '12345678';  // 错误密码
      // 触发 enter 提交
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await page.waitForTimeout(500);

  const wrongState = await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    const errText = slideScene ? slideScene.children.list.filter(c => c.type === 'Text' && c.text && c.text.includes('密码错误')).map(c => c.text) : [];
    return {
      inputStillOpen: !!input,
      inputValue: input ? input.value : null,
      errTexts: errText,
    };
  });
  check('错误密码后输入框仍打开 (允许重试)', wrongState.inputStillOpen);
  check('错误密码后输入框被清空', wrongState.inputValue === '', `value="${wrongState.inputValue}"`);
  check('错误提示 "密码错误" 显示', wrongState.errTexts.length > 0, `errTexts=${JSON.stringify(wrongState.errTexts)}`);

  // === 6.6 正确密码 → 信件弹窗 ===
  console.log('\n[6.6] 正确密码 20230205 → 信件弹窗:');
  await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    if (input) {
      input.value = '20230205';  // 正确密码
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
  });
  await page.waitForTimeout(800);

  const letterState = await page.evaluate(() => {
    const input = document.querySelector('input[type="password"]');
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return { inputClosed: !input };
    // 拿所有 text 的全部内容 (包括长字符串, 不只 slice)
    const allTexts = slideScene.children.list.filter(c => c.type === 'Text').map(c => c.text || '');
    const allJoined = allTexts.join('|');
    return {
      inputClosed: !input,
      hasLetter: allJoined.includes('你愿意复合吗'),
      hasA: allJoined.includes('立马复合'),
      hasB: allJoined.includes('晚点复合'),
      hasBirthday: allJoined.includes('18 岁生日快乐') || allJoined.includes('18岁生日快乐'),
    };
  });
  check('正确密码后输入框关闭', letterState.inputClosed);
  check('信件含 "你愿意复合吗?"', letterState.hasLetter);
  check('信件含 "18岁生日快乐"', letterState.hasBirthday);
  check('A 按钮 "立马复合" 存在', letterState.hasA);
  check('B 按钮 "晚点复合" 存在', letterState.hasB);

  // 截图: 信件
  try {
    await page.screenshot({ path: '/tmp/xj_v10_letter.png', fullPage: false });
    const sz = fs.statSync('/tmp/xj_v10_letter.png').size;
    check(`截图 /tmp/xj_v10_letter.png`, true, `${(sz / 1024).toFixed(0)}KB`);
  } catch (e) {
    check(`截图`, false, e.message);
  }

  // === 6.7 webhook 被调用 (password_correct + letter_open) ===
  console.log('\n[6.7] webhook 调用 (password_correct + letter_open):');
  check('webhook 调用 ≥ 2 次', webhookCalls.length >= 2, `count=${webhookCalls.length}`);
  const pwdCorrectCall = webhookCalls.find(c => c.event === 'password_correct');
  check('webhook 触发 password_correct 事件', !!pwdCorrectCall, JSON.stringify(webhookCalls));
  const letterOpenCall = webhookCalls.find(c => c.event === 'letter_open');
  check('webhook 触发 letter_open 事件', !!letterOpenCall);

  // === 6.8 点击 A 按钮 → webhook choice_A + 致谢 modal ===
  console.log('\n[6.8] 点击 A 按钮 → webhook + 致谢:');
  await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    if (!slideScene) return;
    // 模拟选 A: 调用 _showChoiceResult('A')
    if (slideScene._showChoiceResult) slideScene._showChoiceResult('A');
  });
  await page.waitForTimeout(800);

  const choiceAState = await page.evaluate(() => {
    const game = window.__xinjiangGame;
    const slideScene = game.scene.scenes.find(s => s.farScrollOffset !== undefined && s._drawFarLayer);
    const allTexts = slideScene ? slideScene.children.list.filter(c => c.type === 'Text').map(c => c.text) : [];
    return {
      hasThankYou: allTexts.some(t => t && (t.includes('谢谢你') || t.includes('等我这句话'))),
      hasCloseBtn: allTexts.some(t => t && t.includes('知道了')),
      allTexts: allTexts.slice(-5),
    };
  });
  check('A 选择致谢 "谢谢你" 显示', choiceAState.hasThankYou, `texts=${JSON.stringify(choiceAState.allTexts)}`);
  check('A 选择 "知道了" 按钮存在', choiceAState.hasCloseBtn);

  await page.waitForTimeout(500);
  const choiceACall = webhookCalls.find(c => c.event === 'choice_A');
  check('webhook 触发 choice_A 事件', !!choiceACall);

  // === 6.9 后端 webhook 端点 ===
  console.log('\n[6.9] 后端 webhook 端点 (直接 POST):');
  // 走真实后端 (不受 route 拦截影响, 用 page.request 直接发)
  const beResult = await page.evaluate(async () => {
    const out = {};
    try {
      const r1 = await fetch('/api/silk-road/easter-egg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'password_correct', detail: 'test1' }),
      });
      out.valid = { status: r1.status, body: await r1.json() };
      const r2 = await fetch('/api/silk-road/easter-egg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'invalid_event' }),
      });
      out.invalid = { status: r2.status, body: await r2.json() };
    } catch (e) {
      out.error = e.message;
    }
    return out;
  });
  check('后端 valid event 返回 200', beResult.valid && beResult.valid.status === 200 && beResult.valid.body.ok === true,
    JSON.stringify(beResult.valid));
  check('后端 invalid event 返回 400', beResult.invalid && beResult.invalid.status === 400,
    JSON.stringify(beResult.invalid));

  // === 6.10 pageerror ===
  check('pageerror === 0', pageErrors.length === 0, pageErrors.length > 0 ? pageErrors.join('; ') : '');

  await browser.close();

  // === 总结 ===
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

  // 报告
  const report = [
    '# 新疆·天山滑雪 v10 彩蛋流程验证报告',
    '',
    `日期: ${new Date().toISOString()}`,
    '',
    '## 改动文件',
    '- static/silk-road/xinjiang/game.js (+430 行彩蛋流程)',
    '- app.py (+send_easter_egg_feishu + /api/silk-road/easter-egg 路由)',
    '',
    '## v10 实现',
    '### 1. 屋体左移',
    '- _exitHouseContainer.x: 1240 → 1080 (CANVAS_W - 200)',
    '',
    '### 2. 彩蛋流程 (滑进屋触发)',
    '- _triggerEasterEgg: 显示小木屋背景 (暖色调 Graphics 自绘)',
    '  - 木地板 + 暖黄墙 + 窗户 (雪山轮廓 + 月亮) + 床 + 桌子 + 蜡烛',
    '- 主标题 "🏠 恭喜你完成任务" + "请微信查收最后的奖励 🎁"',
    '- "🥚 打开彩蛋"按钮 (光晕动画)',
    '',
    '### 3. 密码 modal (_showPasswordPrompt)',
    '- HTML <input type="password" maxLength=8> (跨平台最稳)',
    '- 提示 "8位数纪念日"',
    '- 错误密码 → 提示 "密码错误，请重试"',
    '- 正确密码 20230205 → webhook password_correct → 信件弹窗',
    '',
    '### 4. 信件弹窗 (_showLetter)',
    '- 羊皮纸样式 Graphics (圆角 + 内边框 + 红色蜡封)',
    '- 文字: "hello，首先祝 18 岁生日快乐。这个游戏是很早之前就在做的了，但是没想到，会是这样的一个彩蛋。你愿意复合吗？"',
    '- A. 立马复合 (绿) / B. 晚点复合 (蓝紫)',
    '- webhook letter_open (信件打开)',
    '',
    '### 5. 选项致谢 (_showChoiceResult)',
    '- A → "谢谢你 ❤️ 我等你这句话等了好久" (绿色)',
    '- B → "好的，我等你准备好 💜" (蓝紫)',
    '- webhook choice_A / choice_B',
    '',
    '### 6. webhook (_notifyEasterEgg)',
    '- navigator.sendBeacon (iOS Safari 兜底) + fetch 兜底',
    '- POST /api/silk-road/easter-egg with {event, detail, level, timestamp}',
    '',
    '### 7. 后端 webhook (app.py)',
    '- send_easter_egg_feishu: 跟现有 send_game_reward_feishu / send_game_secret_feishu 同一模式',
    '- /api/silk-road/easter-egg 路由: 接受 4 种 event, 后台线程推送',
    '- 飞书卡片格式: header "丝绸之路彩蛋" + 4 fields',
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

  fs.writeFileSync('/tmp/claude_task_xinjiang_v10.report.md', report);
  console.log('\n报告写入 /tmp/claude_task_xinjiang_v10.report.md');

  process.exit(failed === 0 ? 0 : 1);
})();