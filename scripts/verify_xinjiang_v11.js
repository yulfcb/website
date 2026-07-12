#!/usr/bin/env node
/**
 * v11 verification — 游戏整体 UI 调整:
 *
 *   1. 游戏中心: 丝绸之路·回家 → 回家之路 + 描述 + 互换图标
 *   2. mode.html: 顶部"你好小卡"那一栏删掉 + 标题改 + 陆上描述改
 *   3. 背景音乐 (BGM): 所有关卡模板 + game.js 引用全部删除
 *   4. level-0 (多哈): 任务描述 "收集 8 件物品" → "收集物品"
 *   5. level-0 (多哈): HUD 拾取计数删除, 行李只显示数量, 单击可看详情
 *
 * 硬规则:
 * 1. 静态语法检查通过
 * 2. 各页面 HTTP 200 加载
 * 3. 文本断言 (字符串包含/不包含)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');
const STATIC = path.join(ROOT, 'static/silk-road');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

console.log('\n=== v11 verification — 游戏整体 UI 调整 ===\n');

// === 1. 静态语法 ===
console.log('[1] 静态语法:');
const jsFiles = [
  'static/silk-road/qatar/game.js',
  'static/silk-road/iran/game.js',
  'static/silk-road/turkey/game.js',
  'static/silk-road/xinjiang/game.js',
  'static/silk-road/kazakhstan/game.js',
];
for (const f of jsFiles) {
  try {
    execSync(`node --check "${path.join(ROOT, f)}"`, { stdio: 'pipe' });
    check(`${f} syntax OK`, true);
  } catch (e) {
    check(`${f} syntax OK`, false, e.message);
  }
}

// === 2. 游戏中心改动 ===
console.log('\n[2] 游戏中心 (templates/games.html):');
const gamesHtml = fs.readFileSync(path.join(TEMPLATES, 'games.html'), 'utf8');
check('游戏中心不含 "丝绸之路 · 回家"', !/丝绸之路\s*·\s*回家/.test(gamesHtml));
check('游戏中心含 "回家之路"', /回家之路/.test(gamesHtml));
check('游戏中心描述含 "从卡塔尔一路回到中国"', /从卡塔尔一路回到中国/.test(gamesHtml));
check('游戏中心陆上图标不再是 🐫🏜️🎆', !/🐫\s*<\/span><span>\s*🏜️\s*<\/span><span>\s*🎆/.test(gamesHtml));
check('游戏中心陆上图标用了 🌊⛵🐬', /🌊\s*<\/span><span>\s*⛵\s*<\/span><span>\s*🐬/.test(gamesHtml));
check('游戏中心海上图标变成 🐫', /海上丝绸之路/.test(gamesHtml) && /🐫/.test(gamesHtml));

// === 3. mode.html 改动 ===
console.log('\n[3] mode.html 改动:');
const modeHtml = fs.readFileSync(path.join(TEMPLATES, 'silk-road/mode.html'), 'utf8');
check('mode.html 不含 "丝绸之路 · 回家"', !/丝绸之路\s*·\s*回家/.test(modeHtml));
check('mode.html 标题含 "回家之路"', /回家之路/.test(modeHtml));
check('mode.html title 含 "回家之路"', /<title>\s*回家之路/.test(modeHtml));
check('mode.html 删掉 silk-nick (你好小卡输入框)', !/class="silk-nick"/.test(modeHtml));
check('mode.html 删掉 nickname input', !/<input[^>]*id="nickname"/.test(modeHtml));
check('mode.html 陆上描述 "传统丝绸之路，体验沙漠草原雪山"', /传统丝绸之路，体验沙漠草原雪山/.test(modeHtml));

// === 4. BGM 删除 ===
console.log('\n[4] BGM 删除 (所有关卡模板 + game.js):');
const bgmTemplates = [
  'templates/silk-road/_level_base.html',
  'templates/silk-road/level-0.html',
  'templates/silk-road/level-1.html',
  'static/silk-road/turkey/index.html',
  'static/silk-road/kazakhstan/index.html',
  'static/silk-road/xinjiang/index.html',
];
for (const f of bgmTemplates) {
  const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(`${f} 不含 silk-road-bgm audio`, !/<audio[^>]*id="silk-road-bgm"/.test(content));
}

// game.js: BGM 引用应仅剩在"删掉"的注释里
for (const f of jsFiles) {
  const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
  // 排除注释行 (//, /*)
  const codeLines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const hasBgmGet = codeLines.some(l => /document\.getElementById\(\s*['"]silk-road-bgm['"]\s*\)/.test(l));
  check(`${f} 代码中无 silk-road-bgm 引用 (注释除外)`, !hasBgmGet,
    hasBgmGet ? '找到引用' : '');
}

// game.js: BGM 按钮代码应被删 (qatar/turkey/kazakhstan/iran 都有 🔊 按钮)
// 检测 this.bgmBtn / this.audioBtnText 创建
for (const f of ['static/silk-road/qatar/game.js', 'static/silk-road/turkey/game.js',
                 'static/silk-road/kazakhstan/game.js', 'static/silk-road/iran/game.js']) {
  const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const codeLines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const hasBgmBtn = codeLines.some(l =>
    /this\.bgmBtn\s*=\s*this\.add/.test(l) || /this\.audioBtnText\s*=\s*this\.add/.test(l));
  check(`${f} 代码中无 BGM 按钮 (this.bgmBtn / this.audioBtnText)`, !hasBgmBtn);
}

// === 5. level-0 (多哈) 任务描述 + HUD 改动 ===
console.log('\n[5] level-0 (多哈) 任务描述 + HUD 改动:');
const qatarGame = fs.readFileSync(path.join(ROOT, 'static/silk-road/qatar/game.js'), 'utf8');
const qatarCodeLines = qatarGame.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));

// 任务描述
check('任务描述去掉 "8 件"', !/收集 8 件物品/.test(qatarGame));
check('任务描述改为 "收集物品"', /收集物品/.test(qatarGame));

// HUD: 删 pickupText 创建
check('HUD 删掉 pickupText 创建', !/this\.pickupText\s*=\s*this\.add\.text/.test(qatarGame));
check('HUD 删掉 pickupText.setText 调用', !qatarCodeLines.some(l => /this\.pickupText\.setText/.test(l)));

// HUD: luggageText 只显示数量 (无 / LUGGAGE_MAX)
check('luggageText 创建无 / LUGGAGE_MAX', !/行李\s*'\s*\+\s*this\.luggageCount\s*\+\s*'\s*\/\s*'\s*\+\s*L\.LUGGAGE_MAX/.test(qatarGame));
check('luggageText.setText 无 / LUGGAGE_MAX', !/this\.luggageText\.setText\([^)]*\/\s*L\.LUGGAGE_MAX/.test(qatarGame) && !/self\.luggageText\.setText\([^)]*\/\s*L\.LUGGAGE_MAX/.test(qatarGame));

// openLuggageModal 函数存在
check('openLuggageModal 函数存在', /openLuggageModal:\s*function/.test(qatarGame));
// luggageText 是 interactive
check('luggageText 可点击 (setInteractive)', /this\.luggageText\.setInteractive/.test(qatarGame));

// isFull 永远是 false (LUGGAGE_MAX 取消)
check('isFull 永远 false (LUGGAGE_MAX 取消)', /var\s+isFull\s*=\s*false/.test(qatarGame));

// === 6. HTTP 加载 ===
console.log('\n[6] HTTP 加载各页面:');
const { execSync: exec } = require('child_process');
const urls = [
  'http://127.0.0.1:80/games',
  'http://127.0.0.1:80/games/silk-road/mode',
  'http://127.0.0.1:80/games/silk-road/level/0',
  'http://127.0.0.1:80/games/silk-road/level/1',
  'http://127.0.0.1:80/games/silk-road/level/2',
  'http://127.0.0.1:80/games/silk-road/level/3',
  'http://127.0.0.1:80/games/silk-road/level/4',
  'http://127.0.0.1:80/games/silk-road/level/5',
];
for (const url of urls) {
  try {
    const code = exec(`curl -s -o /dev/null -w "%{http_code}" "${url}"`, { encoding: 'utf8' }).trim();
    check(`${url} HTTP 200`, code === '200', `code=${code}`);
  } catch (e) {
    check(`${url} HTTP 200`, false, e.message);
  }
}

// === 7. game center 文本断言 (HTTP 抓页面内容) ===
console.log('\n[7] HTTP 文本断言:');
function curlText(url) {
  try { return exec(`curl -s "${url}"`, { encoding: 'utf8' }); }
  catch (e) { return ''; }
}

const gamesText = curlText('http://127.0.0.1:80/games');
check('游戏中心 HTML 含 "回家之路"', /回家之路/.test(gamesText));
check('游戏中心 HTML 不含 "丝绸之路 · 回家"', !/丝绸之路\s*·\s*回家/.test(gamesText));
check('游戏中心 HTML 含 "从卡塔尔一路回到中国"', /从卡塔尔一路回到中国/.test(gamesText));
check('游戏中心 HTML 含 🌊⛵🐬 图标', /🌊[\s\S]*⛵[\s\S]*🐬/.test(gamesText));

const modeText = curlText('http://127.0.0.1:80/games/silk-road/mode');
check('mode HTML 含 "回家之路"', /回家之路/.test(modeText));
check('mode HTML 不含 "silk-nick"', !/silk-nick/.test(modeText));
check('mode HTML 不含 nickname input', !/id="nickname"/.test(modeText));
check('mode HTML 含 "传统丝绸之路，体验沙漠草原雪山"', /传统丝绸之路，体验沙漠草原雪山/.test(modeText));

const level0Text = curlText('http://127.0.0.1:80/games/silk-road/level/0');
check('level-0 HTML 不含 silk-road-bgm audio', !/<audio[^>]*id="silk-road-bgm"/.test(level0Text));

const level1Text = curlText('http://127.0.0.1:80/games/silk-road/level/1');
check('level-1 HTML 不含 silk-road-bgm audio', !/<audio[^>]*id="silk-road-bgm"/.test(level1Text));

const level2Text = curlText('http://127.0.0.1:80/games/silk-road/level/2');
check('level-2 HTML (extends _level_base) 不含 silk-road-bgm audio', !/<audio[^>]*id="silk-road-bgm"/.test(level2Text));

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

// 报告
const report = [
  '# v11 游戏 UI 调整验证报告',
  '',
  `日期: ${new Date().toISOString()}`,
  '',
  '## 改动文件',
  '- templates/games.html (游戏中心)',
  '- templates/silk-road/mode.html (路线选择)',
  '- templates/silk-road/_level_base.html (基础模板)',
  '- templates/silk-road/level-0.html, level-1.html (独立模板)',
  '- static/silk-road/{turkey,kazakhstan,xinjiang}/index.html (独立 HTML)',
  '- static/silk-road/{qatar,turkey,xinjiang,kazakhstan,iran}/game.js',
  '',
  '## 5 个需求',
  '1. 游戏中心: 丝绸之路·回家 → 回家之路 + 互换陆上/海上图标',
  '2. mode.html: 顶部"你好小卡"栏删除, 陆上描述改"传统丝绸之路，体验沙漠草原雪山"',
  '3. 背景音乐 (BGM): 所有 audio 元素 + 所有 game.js 控制代码删除',
  '4. level-0 任务描述: "收集 8 件物品" → "收集物品"',
  '5. level-0 HUD: 拾取计数删除, 行李只显示数量, 单击行李按钮 → 弹 modal 显示已装入物品',
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

fs.writeFileSync('/tmp/claude_task_xinjiang_v11.report.md', report);
console.log('\n报告写入 /tmp/claude_task_xinjiang_v11.report.md');

process.exit(failed === 0 ? 0 : 1);