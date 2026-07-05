#!/usr/bin/env node
/**
 * Verify voyage projection with manual Mercator fitExtent.
 * 模拟 game.js 中的 voyageProjection 手动 fitExtent 计算,
 * 验证 Doha/Bandar 投影坐标横跨画布 (Doha 在左下, Bandar 在右上).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const D3_ARRAY = path.resolve(__dirname, '..', 'static/vendor/world-atlas/d3-array.min.js');
const D3_GEO = path.resolve(__dirname, '..', 'static/vendor/world-atlas/d3-geo.min.js');

const sandbox = { window: {}, self: {}, document: {}, console, module: { exports: {} }, require: function (n) { return sandbox.d3; } };
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(D3_ARRAY, 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(D3_GEO, 'utf8'), sandbox);

const d3 = sandbox.d3 || sandbox.window.d3;
if (!d3) { console.error('d3 failed to load'); process.exit(1); }
console.log('d3 loaded with', Object.keys(d3).filter(k => k.startsWith('geo')).length, 'geo* methods');

// 模拟 game.js 手动 fitExtent 计算
const lngMin = 50, lngMax = 58, latMin = 24, latMax = 29;
const corners = [
  [lngMin * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMin * Math.PI / 360))],
  [lngMax * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMin * Math.PI / 360))],
  [lngMin * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMax * Math.PI / 360))],
  [lngMax * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMax * Math.PI / 360))],
];
const projMinX = Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
const projMaxX = Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
const projMinY = Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
const projMaxY = Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
const projW = projMaxX - projMinX;
const projH = projMaxY - projMinY;
const extW = 1180, extH = 620;
const fitScale = Math.min(extW / projW, extH / projH);
const tx = (extW - fitScale * projW) / 2 - fitScale * projMinX + 50;
const ty = (extH - fitScale * projH) / 2 - fitScale * projMinY + 50;
const projection = d3.geoMercator().scale(fitScale).translate([tx, ty]);

const dohaXY = projection([51.53, 25.30]);
const bandarXY = projection([56.27, 27.18]);
const bboxTL = projection([50, 29]);
const bboxBR = projection([58, 24]);

console.log('\n=== Voyage fitExtent projection results ===');
console.log(`bbox: lng ${lngMin}-${lngMax}, lat ${latMin}-${latMax}`);
console.log(`scale: ${fitScale.toFixed(1)}, translate: [${tx.toFixed(1)}, ${ty.toFixed(1)}]`);
console.log(`Doha     [51.53, 25.30] → (${dohaXY[0].toFixed(1)}, ${dohaXY[1].toFixed(1)})`);
console.log(`Bandar   [56.27, 27.18] → (${bandarXY[0].toFixed(1)}, ${bandarXY[1].toFixed(1)})`);
console.log(`bbox TL  [50,    29   ] → (${bboxTL[0].toFixed(1)}, ${bboxTL[1].toFixed(1)})`);
console.log(`bbox BR  [58,    24   ] → (${bboxBR[0].toFixed(1)}, ${bboxBR[1].toFixed(1)})`);

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

// Hard rule 2: voyage 显示 Doha pin + Bandar pin 横跨波斯湾
const EPS = 0.01;  // floating-point tolerance for boundary checks
const inX = (v) => v >= 50 - EPS && v <= 1230 + EPS;
const inY = (v) => v >= 50 - EPS && v <= 670 + EPS;
check('Doha left of Bandar', dohaXY[0] < bandarXY[0], `Δx=${(bandarXY[0] - dohaXY[0]).toFixed(0)}px`);
check('Doha south of Bandar (Mercator y)', dohaXY[1] > bandarXY[1], `Doha.y=${dohaXY[1].toFixed(0)} > Bandar.y=${bandarXY[1].toFixed(0)}`);
check('Doha→Bandar horizontal span > 500px', (bandarXY[0] - dohaXY[0]) > 500, `${(bandarXY[0] - dohaXY[0]).toFixed(0)}px`);
check('Doha in viewport', inX(dohaXY[0]) && inY(dohaXY[1]));
check('Bandar in viewport', inX(bandarXY[0]) && inY(bandarXY[1]));
check('bbox TL in viewport', inX(bboxTL[0]) && inY(bboxTL[1]));
check('bbox BR in viewport', inX(bboxBR[0]) && inY(bboxBR[1]));

const failed = results.filter(r => !r.ok);
if (failed.length > 0) {
  console.error(`\n✗ ${failed.length} hard rule failure(s)`);
  process.exit(1);
}
console.log('\n✅ Voyage fitExtent projection OK — Doha→Bandar spans Persian Gulf');