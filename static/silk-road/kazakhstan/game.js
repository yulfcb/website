// 哈萨克斯坦·草原套马 —— 关卡 3 游戏引擎
//
// 流程: 土耳其 → 进入哈萨克斯坦 (本场景) → 套马 → 骑马买补给 → 出发去新疆
//   BootScene → TamingScene (套马) → PlayScene (骑马探索 + 购物) → /games/silk-road/level/4
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (pointerdown/up 即可触屏 + 长按)
//
// localStorage 写入 (通关时):
//   silkroad_cleared_levels 追加 3

(function () {
  'use strict';

  var CANVAS_W = 1280;
  var CANVAS_H = 720;

  // ============== Debug 模式 (?debug=1) ==============
  // 跳过套马场景 + 满金币/坚戈 + 物品满库存
  var isDebug = /[?&]debug=1/.test(window.location.search);

  // ============== SFX 助手 ==============
  window.playKazakhstanSfx = function (id, volume) {
    var a = document.getElementById('sfx-' + id);
    if (!a) return;
    try {
      a.volume = volume != null ? volume : 0.5;
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  };

  // ============== Bezier 采样助手 ==============
  // Phaser 3.80 Graphics 没有 quadraticBezierTo/cubicBezierTo, 用 lineTo 采样
  // 从 (sx,sy) 经控制点 (cpx,cpy) 到 (ex,ey) — Phaser 路径已经在 (sx,sy)
  function quadBezierToFrom(g, sx, sy, cpx, cpy, ex, ey, n) {
    n = n || 16;
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      var u = 1 - t;
      var px = u * u * sx + 2 * u * t * cpx + t * t * ex;
      var py = u * u * sy + 2 * u * t * cpy + t * t * ey;
      g.lineTo(px, py);
    }
  }

  // ============== 马匹绘制共享库 (TamingScene 套马野马 + PlayScene 玩家坐骑) ==============
  // palette: HORSE_PALETTES 取色 (body/dark/mane/hoof)
  // frame: { facing(1|-1), phase(动画相位, 静态=0), amplitude(摆动幅度, 静态=1.5) }
  // 静态模式 (animate=false) 用于 PlayScene 玩家坐骑; 动态模式 用于 TamingScene 野马
  window.KAZAKHSTAN_HORSE_PALETTES = [
    { body: 0x8B4513, dark: 0x6B3410, mane: 0x3E1F0E, hoof: 0x2E1505 },  // 棕色
    { body: 0x1A1A1A, dark: 0x000000, mane: 0x0A0A0A, hoof: 0x1A1A1A },  // 黑色
    { body: 0xF5F5DC, dark: 0xC9C9A8, mane: 0xD4D4B0, hoof: 0x9C9C7A },  // 白色
    { body: 0xA0522D, dark: 0x704020, mane: 0x4A2810, hoof: 0x3E1F0E },  // 栗色
    { body: 0x808080, dark: 0x555555, mane: 0x303030, hoof: 0x202020 },  // 灰色
  ];

  function drawHorseShape(g, palette, frame) {
    frame = frame || {};
    var facing = frame.facing != null ? frame.facing : 1;
    var animate = frame.animate === true;
    var phase = frame.phase != null ? frame.phase : 0;
    var amplitude = frame.amplitude != null ? frame.amplitude : 6;
    var cx = frame.cx != null ? frame.cx : 0;
    var cy = frame.cy != null ? frame.cy : 0;
    var pal = palette;

    if (animate) {
      var t = (Date.now() / 1000) * 8 + phase;
    } else {
      var t = phase;
    }
    var legSwing1 = Math.sin(t) * amplitude;
    var legSwing2 = Math.sin(t + Math.PI) * amplitude;
    var tailSwing = animate ? Math.sin(t * 0.7 + phase) * 8 : 0;
    var maneSwing = animate ? Math.sin(t * 0.9 + phase) * 4 : 0;

    // 方向：scaleX=-1 实现镜像
    if (facing < 0) {
      g.scaleX = -1;
      g.x = cx * 2;
    } else {
      g.scaleX = 1;
      g.x = 0;
    }
    var x = cx;
    var y = cy;

    // 尾巴 (身体后面)
    g.lineStyle(5, pal.mane, 1);
    g.beginPath();
    g.moveTo(x - 28, y - 4);
    g.lineTo(x - 28 - 18, y - 4 + 6 + tailSwing * 0.6);
    g.strokePath();
    g.fillStyle(pal.mane, 1);
    g.fillCircle(x - 28 - 22, y - 4 + 10 + tailSwing * 0.6, 5);

    // 后腿
    var legColor = pal.dark;
    g.fillStyle(legColor, 1);
    g.fillRoundedRect(x - 18, y + 12 + (legSwing1 > 0 ? legSwing1 : 0), 7, 22 - (legSwing1 > 0 ? legSwing1 * 0.3 : 0), 2);
    g.fillRoundedRect(x - 5, y + 12 + (legSwing2 > 0 ? legSwing2 : 0), 7, 22 - (legSwing2 > 0 ? legSwing2 * 0.3 : 0), 2);

    // 马身 (曲线轮廓)
    g.fillStyle(pal.body, 1);
    g.beginPath();
    g.moveTo(x - 28, y - 2);
    g.lineTo(x - 26, y - 14);
    quadBezierToFrom(g, x - 26, y - 14, x - 10, y - 22, x + 8, y - 22);
    g.lineTo(x + 18, y - 18);
    g.lineTo(x + 24, y - 14);
    g.lineTo(x + 26, y + 2);
    quadBezierToFrom(g, x + 26, y + 2, x + 22, y + 16, x + 10, y + 16);
    g.lineTo(x - 22, y + 16);
    g.closePath();
    g.fillPath();

    // 背线阴影
    g.fillStyle(pal.dark, 0.35);
    g.beginPath();
    g.moveTo(x - 22, y - 12);
    quadBezierToFrom(g, x - 22, y - 12, x - 8, y - 18, x + 8, y - 18);
    g.lineTo(x + 18, y - 14);
    g.lineTo(x + 18, y - 12);
    g.lineTo(x + 8, y - 15);
    quadBezierToFrom(g, x + 8, y - 15, x - 8, y - 15, x - 22, y - 9);
    g.closePath();
    g.fillPath();

    // 颈
    g.fillStyle(pal.body, 1);
    g.beginPath();
    g.moveTo(x + 16, y - 16);
    g.lineTo(x + 24, y - 14);
    g.lineTo(x + 32, y - 28);
    g.lineTo(x + 26, y - 30);
    g.closePath();
    g.fillPath();

    // 头
    g.fillStyle(pal.body, 1);
    g.beginPath();
    g.moveTo(x + 28, y - 32);
    g.lineTo(x + 38, y - 32);
    g.lineTo(x + 42, y - 28);
    g.lineTo(x + 44, y - 22);
    g.lineTo(x + 40, y - 18);
    g.lineTo(x + 32, y - 20);
    g.lineTo(x + 28, y - 26);
    g.closePath();
    g.fillPath();

    // 鼻头
    g.fillStyle(pal.dark, 1);
    g.fillCircle(x + 41, y - 20, 2);

    // 眼睛
    g.fillStyle(0x000000, 1);
    g.fillCircle(x + 35, y - 27, 1.5);
    g.fillStyle(0xFFFFFF, 0.9);
    g.fillCircle(x + 35.5, y - 27.5, 0.6);

    // 耳朵
    g.fillStyle(pal.dark, 1);
    g.beginPath();
    g.moveTo(x + 30, y - 33);
    g.lineTo(x + 32, y - 40);
    g.lineTo(x + 34, y - 33);
    g.closePath();
    g.fillPath();

    // 鬃毛
    g.fillStyle(pal.mane, 1);
    for (var mi = 0; mi < 5; mi++) {
      var mFrac = mi / 4;
      var mX = x + 24 + mFrac * 4 + maneSwing * mFrac * 0.3;
      var mY = y - 26 + mFrac * 14;
      var mH = 6 + mi * 0.5;
      g.beginPath();
      g.moveTo(mX - 2, mY);
      g.lineTo(mX, mY - mH);
      g.lineTo(mX + 2, mY);
      g.closePath();
      g.fillPath();
    }

    // 前腿
    g.fillStyle(legColor, 1);
    g.fillRoundedRect(x + 8, y + 12 + (legSwing2 > 0 ? legSwing2 : 0), 7, 22 - (legSwing2 > 0 ? legSwing2 * 0.3 : 0), 2);
    g.fillRoundedRect(x + 18, y + 12 + (legSwing1 > 0 ? legSwing1 : 0), 7, 22 - (legSwing1 > 0 ? legSwing1 * 0.3 : 0), 2);

    // 蹄子
    g.fillStyle(pal.hoof, 1);
    var hooves = [
      [x - 18, 32], [x - 5, 32], [x + 8, 32], [x + 18, 32]
    ];
    for (var hi = 0; hi < hooves.length; hi++) {
      var hx = hooves[hi][0];
      var hy = hooves[hi][1];
      g.fillRect(hx - 1, hy, 9, 3);
    }
  }

  // ============== DepartScene (出发过场动画 — 草原→雪山) ==============
  // 仿 turkey FlightScene: 独立 scene, RGB lerp 颜色 + 三段路径 + setInterval 16ms 60fps
  // Bug 修复: 单色 rectangle overlay → 每个像素重画 (RGB lerp)
  // Bug 修复: iOS Safari Phaser zone 偶尔不响应 → DOM 按钮兜底
  // Bug 修复: scene.start 静默失败 → setTimeout fallback
  var DepartScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function DepartScene() { Phaser.Scene.call(this, { key: 'DepartScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#81D4FA');

      // —— 天空 / 远景 (固定不变) ——
      var sky = this.add.graphics();
      sky.fillStyle(0x81D4FA, 1);  // 淡蓝
      sky.fillRect(0, 0, CANVAS_W, CANVAS_H);
      // 一抹夕阳
      var sun = this.add.graphics();
      sun.fillStyle(0xFFE9B0, 0.7);
      sun.fillCircle(1100, 120, 50);
      sun.fillStyle(0xFFFFFF, 0.5);
      sun.fillCircle(1100, 120, 30);
      // 远云
      var clouds = [
        { x: 200, y: 150, s: 1 }, { x: 500, y: 220, s: 0.8 },
        { x: 850, y: 180, s: 1.2 }, { x: 1100, y: 280, s: 0.9 },
      ];
      clouds.forEach(function (c) {
        var cg = self.add.graphics();
        cg.fillStyle(0xFFFFFF, 0.7);
        cg.fillCircle(c.x, c.y, 30 * c.s);
        cg.fillCircle(c.x + 25 * c.s, c.y - 5, 25 * c.s);
        cg.fillCircle(c.x + 50 * c.s, c.y, 30 * c.s);
      });

      // —— 地面 (RGB lerp: 草原绿 0x7CB342 → 雪山白 0xFFFFFF) ——
      var ground = this.add.graphics();
      ground.setDepth(10);
      var drawGround = function (progress) {
        // progress: 0 = 草原绿, 1 = 雪山白
        ground.clear();
        var r = Math.round(0x7C + (0xFF - 0x7C) * progress);
        var g = Math.round(0xB3 + (0xFF - 0xB3) * progress);
        var b = Math.round(0x42 + (0xFF - 0x42) * progress);
        var groundColor = (r << 16) | (g << 8) | b;
        ground.fillStyle(groundColor, 1);
        ground.fillRect(0, 600, CANVAS_W, 200);
        // 山丘轮廓 (同样 lerp)
        var hr = Math.round(0x55 + (0xE0 - 0x55) * progress);
        var hg = Math.round(0x8E + (0xE0 - 0x8E) * progress);
        var hb = Math.round(0x23 + (0xE0 - 0x23) * progress);
        var hillColor = (hr << 16) | (hg << 8) | hb;
        ground.fillStyle(hillColor, 1);
        ground.beginPath();
        ground.moveTo(0, 600);
        ground.lineTo(150, 560); ground.lineTo(280, 580);
        ground.lineTo(420, 555); ground.lineTo(580, 575);
        ground.lineTo(720, 550); ground.lineTo(880, 570);
        ground.lineTo(1040, 555); ground.lineTo(1200, 580);
        ground.lineTo(1280, 565); ground.lineTo(1280, 600);
        ground.closePath(); ground.fillPath();
      };
      drawGround(0);

      // —— 雪山 (从地平线升起, alpha 0→0.8) ——
      var snowMountains = this.add.graphics();
      snowMountains.setDepth(20);
      snowMountains.setAlpha(0);
      var drawMountains = function (riseProgress) {
        // riseProgress: 0 = 完全隐藏地平线下, 1 = 完全升起
        snowMountains.clear();
        var baseY = 600;
        var peakOffset = (1 - riseProgress) * 250;  // 未升起时峰顶在 baseY+250
        snowMountains.fillStyle(0xFFFFFF, 0.8);
        // 4 座雪山
        snowMountains.fillTriangle(0, baseY, 200, baseY - 100 + peakOffset, 400, baseY);
        snowMountains.fillTriangle(300, baseY + 20, 520, baseY - 130 + peakOffset, 740, baseY + 20);
        snowMountains.fillTriangle(600, baseY, 820, baseY - 120 + peakOffset, 1040, baseY);
        snowMountains.fillTriangle(900, baseY + 20, 1120, baseY - 80 + peakOffset, 1340, baseY + 20);
        // 阴影
        snowMountains.fillStyle(0xB0BEC5, 0.5);
        snowMountains.fillTriangle(0, baseY, 200, baseY + 20 + peakOffset, 400, baseY);
        snowMountains.fillTriangle(300, baseY + 20, 520, baseY + 10 + peakOffset, 740, baseY + 20);
        snowMountains.fillTriangle(600, baseY, 820, baseY + 10 + peakOffset, 1040, baseY);
        snowMountains.fillTriangle(900, baseY + 20, 1120, baseY + 30 + peakOffset, 1340, baseY + 20);
      };
      drawMountains(0);

      // —— 骑马角色 (跟随三段路径) ——
      var riderContainer = this.add.container(200, 600);
      riderContainer.setDepth(100);
      var horsePalette = window.KAZAKHSTAN_HORSE_PALETTES[0];
      var horseGfx = this.add.graphics();
      drawHorseShape(horseGfx, horsePalette, {
        facing: 1, animate: true, phase: 0, amplitude: 6, cx: 0, cy: 0,
      });
      riderContainer.add(horseGfx);
      var avatarId = null;
      try { avatarId = localStorage.getItem('silkroad_avatar'); } catch (e) {}
      if (!avatarId) avatarId = 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.8);
      avatar.setPosition(0, -22);
      riderContainer.add(avatar);

      // 每帧重绘马腿 (animate=true 需要手动 update)
      var horseLoop = this.time.addEvent({
        delay: 50,
        callback: function () {
          if (!riderContainer || !riderContainer.active) {
            horseLoop.remove();
            return;
          }
          horseGfx.clear();
          drawHorseShape(horseGfx, horsePalette, {
            facing: 1, animate: true, phase: 0, amplitude: 6, cx: 0, cy: 0,
          });
        },
        loop: true,
      });

      // —— 标题 ——
      this._flightTitle = this.add.text(640, 80, '🏇 离开哈萨克草原...', {
        fontSize: '22px', color: '#4A2E1A', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 217, 138, 0.85)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);

      // —— v18: 单阶段水平直走动画 (setInterval 16ms 60fps) ——
      // 总时长 4s, curX 200→1200, curY=startY=600 全程不变
      // 保留: 雪山升起 + bgProg 滚动 + 动画结束 _showContinueButton()
      var totalDur = 4000;
      var startX = 200, startY = 600;
      var endX = 1200;
      var startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this._departDone = false;
      this._departTick = setInterval(function () {
        if (self._departDone) return;
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        var elapsed = now - startTime;
        if (elapsed > totalDur + 500) elapsed = totalDur;

        var t = Math.min(elapsed / totalDur, 1);
        var e = 1 - Math.pow(1 - t, 2);  // ease-out
        var curX = startX + (endX - startX) * e;
        var curY = startY;
        var bgProg = t;
        var riseProg = Math.min(t * 1.5, 1);
        riderContainer.setPosition(curX, curY);
        drawGround(bgProg);
        if (riseProg > 0) snowMountains.setAlpha(0.8);
        drawMountains(riseProg);

        if (elapsed >= totalDur) {
          self._departDone = true;
          clearInterval(self._departTick);
          self._departTick = null;
          if (self._flightTitle) self._flightTitle.setText('🏔️ 抵达新疆·天山');
          try { window.playKazakhstanSfx('voyage', 0.5); } catch (e) {}

          // —— 显示继续按钮 (DOM 兜底 + Phaser Zone 双路径) ——
          self._showContinueButton();
        }
      }, 16);

      // —— 键盘空格 / 回车 也可触发继续 (PC 测试 + 部分 iOS 兼容) ——
      this.input.keyboard.once('keydown-SPACE', function () { self._goNextLevel(); });
      this.input.keyboard.once('keydown-ENTER', function () { self._goNextLevel(); });

      // —— Scene shutdown 清理 ——
      this.events.once('shutdown', function () {
        if (self._departTick) {
          clearInterval(self._departTick);
          self._departTick = null;
        }
        if (horseLoop) { try { horseLoop.remove(); } catch (e) {} }
        if (self._continueResizeHandler) {
          window.removeEventListener('resize', self._continueResizeHandler);
          window.removeEventListener('orientationchange', self._continueResizeHandler);
          self._continueResizeHandler = null;
        }
        if (self._continueDomBtn && self._continueDomBtn.parentNode) {
          self._continueDomBtn.parentNode.removeChild(self._continueDomBtn);
          self._continueDomBtn = null;
        }
      });
    },

    // —— 继续按钮: DOM 兜底 + Phaser Zone 双路径 ——
    _showContinueButton: function () {
      var self = this;
      var btnX = CANVAS_W / 2;
      var btnY = CANVAS_H / 2 + 80;

      // Phaser zone (chromium 兼容)
      var continueBg = this.add.rectangle(btnX, btnY, 200, 60, 0x5FB3A0, 0.9)
        .setStrokeStyle(3, 0xFFFFFF, 0.8)
        .setDepth(1000);
      var continueText = this.add.text(btnX, btnY, '继续', {
        fontSize: '28px',
        color: '#FFFFFF',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(1001);
      var continueZone = this.add.zone(btnX, btnY, 200, 60)
        .setInteractive({ useHandCursor: true })
        .setDepth(1002);
      continueZone.on('pointerdown', function () { try { window.playKazakhstanSfx('button', 0.4); } catch (e) {} self._goNextLevel(); });
      continueZone.on('pointerover', function () { continueBg.setFillStyle(0x4A9E8F, 1); });
      continueZone.on('pointerout', function () { continueBg.setFillStyle(0x5FB3A0, 0.9); });

      // DOM 按钮 (iOS Safari Phaser zone 偶尔不响应兜底)
      this._continueDomBtn = document.createElement('button');
      this._continueDomBtn.id = 'kaz-depart-continue';
      this._continueDomBtn.style.cssText = [
        'position:fixed',
        'z-index:99999',
        'border:none',
        'border-radius:8px',
        'background:#5FB3A0',
        'color:#fff',
        'font-size:24px',
        'font-weight:bold',
        'padding:14px 32px',
        'cursor:pointer',
        'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
      ].join(';');
      this._continueDomBtn.textContent = '继续';
      document.body.appendChild(this._continueDomBtn);

      var positionBtn = function () {
        var canvas = self.game.canvas;
        if (!canvas) return;
        var rect = canvas.getBoundingClientRect();
        // 计算 canvas 内 CANVAS_W x CANVAS_H 的实际渲染坐标
        var scaleX = rect.width / CANVAS_W;
        var scaleY = rect.height / CANVAS_H;
        var scale = Math.min(scaleX, scaleY);
        var renderW = CANVAS_W * scale;
        var renderH = CANVAS_H * scale;
        var offsetX = rect.left + (rect.width - renderW) / 2;
        var offsetY = rect.top + (rect.height - renderH) / 2;
        var px = offsetX + btnX * scale;
        var py = offsetY + btnY * scale;
        // 居中: 按钮 width 估算 120, height 52
        var btnW = 120, btnH = 52;
        self._continueDomBtn.style.left = (px - btnW / 2) + 'px';
        self._continueDomBtn.style.top = (py - btnH / 2) + 'px';
        self._continueDomBtn.style.width = btnW + 'px';
        self._continueDomBtn.style.height = btnH + 'px';
      };
      positionBtn();
      var resizeHandler = function () { positionBtn(); };
      this._continueResizeHandler = resizeHandler;
      window.addEventListener('resize', resizeHandler);
      window.addEventListener('orientationchange', resizeHandler);

      this._continueDomBtn.onclick = function () { self._goNextLevel(); };
    },

    _goNextLevel: function () {
      try { window.location.href = '/games/silk-road/level/4'; }
      catch (e) { window.location.reload(); }
    },
  });

  // ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#81D4FA');
      // URL hash 调试钩: #play → 跳过 TamingScene,直接进入 PlayScene (Hermes/Playwright 验证用)
      if (window.location.hash === '#play') {
        console.log('[kaz] BootScene hash=#play detected, skipping to PlayScene');
        this.time.delayedCall(100, function () { self.scene.start('PlayScene'); }, [], this);
        return;
      }
      // URL ?debug=1 → 跳过 TamingScene, 直接 PlayScene (满金币/坚戈/物品)
      if (isDebug) {
        console.log('[kaz] BootScene debug=1 detected, skipping to PlayScene');
        this.time.delayedCall(100, function () { self.scene.start('PlayScene'); }, [], this);
        return;
      }
      this.add.text(640, 360, '哈萨克斯坦·草原套马\n加载中…', {
        fontSize: '26px', color: '#2E7D32', fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5);

      // v11: BGM 删除, BGM 初始化逻辑也删掉
      this.time.delayedCall(800, function () {
        try {
          self.scene.start('TamingScene');
        } catch (e) {
          console.error('[kaz] scene.start threw:', e);
        }
      }, [], this);
      // Fallback setTimeout to bypass any Phaser clock issues
      setTimeout(function () {
        try {
          if (self.scene.isActive()) {
            self.scene.start('TamingScene');
          }
        } catch (e) {
          console.error('[kaz] fallback scene.start threw:', e);
        }
      }, 1500);
    }
  });

  // ============== TamingScene (套马场景) ==============
  var TamingScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function TamingScene() { Phaser.Scene.call(this, { key: 'TamingScene' }); },
    create: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL.taming;

      this.cameras.main.setBackgroundColor('#81D4FA');

      // 绘制草原背景
      try { this.drawBackground(); }
      catch (e) { console.error('[kaz] tam init step 1 background threw:', e); throw e; }

      // 状态
      this.state = 'AIMING'; // AIMING, THROWING, CAUGHT, SUCCESS, FAIL
      this.catches = 0;
      this.misses = 0;
      this.timeLeft = config.timeLimit;
      this.startTime = Date.now();

      // 野马群
      this.horses = [];
      try { this.createHorses(config.horseCount); }
      catch (e) { console.error('[kaz] tam init step 2 horses threw:', e); throw e; }

      // 玩家位置
      this.playerX = 640;
      this.playerY = 500;

      // 套马索
      this.rope = null;
      this.ropeCircle = null;

      // UI
      try { this.createUI(); }
      catch (e) { console.error('[kaz] tam init step 3 UI threw:', e); throw e; }
      
      // 输入：蓄力 → 抛出 → 驯服
      this.aimX = this.playerX;
      this.aimY = this.playerY - 50;
      this.chargePower = 0;
      this.maxPower = 1.0;  // 0~1
      this.chargeRate = 0.0025;  // 每毫秒 0.0025，约 400ms 满力
      this.charging = false;

      this.input.on('pointerdown', function (pointer) {
        if (self.state === 'AIMING') {
          // 进入蓄力阶段
          self.charging = true;
          self.state = 'CHARGING';
          self.chargePower = 0.2; // 给个初始力（点击不会失败）
          self.aimX = pointer.x;
          self.aimY = pointer.y;
          self.drawPowerBar();
          self.drawAimLine();
        } else if (self.state === 'TAMEING') {
          // 驯服中：连点加分
          self.onTameClick();
        }
      });

      this.input.on('pointermove', function (pointer) {
        if (self.state === 'CHARGING') {
          self.aimX = pointer.x;
          self.aimY = pointer.y;
          self.drawAimLine();
        }
      });

      this.input.on('pointerup', function (pointer) {
        if (self.state === 'CHARGING') {
          self.releaseRope(pointer.x, pointer.y);
        }
      });

      // 兜底：移出 canvas 也算松开（移动端兼容）
      this.input.on('pointerupoutside', function (pointer) {
        if (self.state === 'CHARGING') {
          self.releaseRope(self.aimX, self.aimY);
        }
      });

      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    resetCharge: function () {
      this.charging = false;
      this.chargePower = 0;
      if (this.powerBarBg) { this.powerBarBg.destroy(); this.powerBarBg = null; }
      if (this.powerBarFill) { this.powerBarFill.destroy(); this.powerBarFill = null; }
      if (this.powerBarText) { this.powerBarText.destroy(); this.powerBarText = null; }
      if (this.aimLineGfx) { this.aimLineGfx.destroy(); this.aimLineGfx = null; }
    },

    drawPowerBar: function () {
      if (!this.powerBarBg) {
        var bx = 640, by = 130, bw = 280, bh = 24;
        this.powerBarBg = this.add.rectangle(bx, by, bw, bh, 0x000000, 0.55).setDepth(800);
        this.powerBarFill = this.add.rectangle(bx - bw / 2, by, bw, bh, 0xFFC107, 1).setOrigin(0, 0.5).setDepth(801);
        this.powerBarText = this.add.text(bx, by, '蓄力', {
          fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(802);
      }
      var ratio = Phaser.Math.Clamp(this.chargePower, 0, 1);
      // 颜色渐变：绿 → 黄 → 红
      var color = ratio < 0.5 ? 0x4CAF50 : (ratio < 0.8 ? 0xFFC107 : 0xF44336);
      this.powerBarFill.fillColor = color;
      this.powerBarFill.width = ratio * this.powerBarBg.width;
      this.powerBarText.setText('蓄力 ' + Math.round(ratio * 100) + '%');
    },

    drawAimLine: function () {
      if (!this.aimLineGfx) {
        this.aimLineGfx = this.add.graphics().setDepth(750);
      }
      var g = this.aimLineGfx;
      g.clear();

      var sx = this.playerX;
      var sy = this.playerY - 30;
      var ex = this.aimX;
      var ey = this.aimY;
      var ratio = Phaser.Math.Clamp(this.chargePower, 0, 1);
      var dist = Math.sqrt((ex - sx) * (ex - sx) + (ey - sy) * (ey - sy));
      var maxDist = window.KAZAKHSTAN_LEVEL.taming.rope.maxDistance + ratio * 120;
      if (dist > maxDist) {
        ex = sx + (ex - sx) * maxDist / dist;
        ey = sy + (ey - sy) * maxDist / dist;
      }

      // 虚线瞄准线（白色+半透）
      g.lineStyle(2, 0xFFFFFF, 0.7);
      g.beginPath();
      var segs = 12;
      for (var i = 0; i < segs; i++) {
        if (i % 2 === 0) {
          var t1 = i / segs, t2 = (i + 1) / segs;
          g.moveTo(sx + (ex - sx) * t1, sy + (ey - sy) * t1);
          g.lineTo(sx + (ex - sx) * t2, sy + (ey - sy) * t2);
        }
      }
      g.strokePath();

      // 末端指示圆
      g.lineStyle(3, 0xFFC107, 0.9);
      g.strokeCircle(ex, ey, 8 + ratio * 6);
    },
    
    drawBackground: function () {
      var gfx = this.add.graphics();
      
      // 天空渐变
      gfx.fillGradientStyle(0x81D4FA, 0x81D4FA, 0xB3E5FC, 0xB3E5FC, 1);
      gfx.fillRect(0, 0, CANVAS_W, CANVAS_H / 2);
      
      // 远处雪山
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillTriangle(100, 300, 200, 200, 300, 300);
      gfx.fillTriangle(400, 320, 500, 220, 600, 320);
      gfx.fillTriangle(800, 310, 900, 210, 1000, 310);
      
      // 草原
      gfx.fillStyle(0x7CB342, 1);
      gfx.fillRect(0, CANVAS_H / 2, CANVAS_W, CANVAS_H / 2);
      
      // 草地纹理
      gfx.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 50; i++) {
        var x = Math.random() * CANVAS_W;
        var y = CANVAS_H / 2 + Math.random() * (CANVAS_H / 2);
        gfx.fillRect(x, y, 20, 3);
      }
    },
    
    // 马匹毛色配方 — 与共享库保持一致 (HORSE_PALETTES)
    HORSE_PALETTES: window.KAZAKHSTAN_HORSE_PALETTES,

    createHorses: function (count) {
      var palettes = window.KAZAKHSTAN_HORSE_PALETTES;
      for (var i = 0; i < count; i++) {
        var horse = {
          x: 200 + Math.random() * 800,
          y: 200 + Math.random() * 300,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 30,
          speed: window.KAZAKHSTAN_LEVEL.taming.speeds[0],
          caught: false,

          // AI 状态机
          aiState: 'RELAXED',   // RELAXED | ALERT | PANIC | TAMEING
          stateTimer: 0,
          facing: Math.random() < 0.5 ? -1 : 1,  // -1 左 / 1 右
          runPhase: Math.random() * Math.PI * 2, // 腿部/鬃毛动画相位
          sineOffset: Math.random() * Math.PI * 2,

          // 驯服状态（TAMEING 阶段使用）
          taming: null, // { progress, required, callback } 见 startTaming

          // 毛色
          palette: palettes[i % palettes.length],

          gfx: this.add.graphics()
        };
        this.drawHorse(horse);
        this.horses.push(horse);
      }
    },

    // 绘制野马 — 使用共享 drawHorseShape + AI 状态视觉指示
    drawHorse: function (horse) {
      var g = horse.gfx;
      g.clear();

      if (horse.caught) return;

      var speed = Math.sqrt(horse.vx * horse.vx + horse.vy * horse.vy);
      var amp = horse.aiState === 'PANIC' ? 12 : horse.aiState === 'ALERT' ? 9 : (speed > 10 ? 6 : 1.5);

      // 用共享库绘制马身
      drawHorseShape(g, horse.palette, {
        facing: horse.facing,
        animate: true,
        phase: horse.runPhase,
        amplitude: amp,
        cx: horse.x,
        cy: horse.y,
      });

      // AI 状态视觉指示 (马头上方小气泡)
      if (horse.aiState === 'ALERT') {
        g.fillStyle(0xFFC107, 1);
        g.fillCircle(horse.x, horse.y - 50, 6);
        g.fillStyle(0x000000, 1);
        g.fillRect(horse.x - 1, horse.y - 53, 2, 4);
        g.fillRect(horse.x - 1, horse.y - 47, 2, 2);
      } else if (horse.aiState === 'PANIC') {
        g.fillStyle(0xF44336, 1);
        g.fillCircle(horse.x, horse.y - 50, 7);
        g.fillStyle(0xFFFFFF, 1);
        g.fillRect(horse.x - 4, horse.y - 51, 2, 2);
        g.fillRect(horse.x - 1, horse.y - 51, 2, 2);
        g.fillRect(horse.x + 2, horse.y - 51, 2, 2);
        g.fillRect(horse.x - 4, horse.y - 47, 8, 2);
      }
    },
    
    createUI: function () {
      // 顶部信息栏
      var uiBg = this.add.rectangle(640, 40, 1280, 60, 0x2E7D32, 0.9);
      
      this.catchesText = this.add.text(200, 40, '🎯 套中: 0/3', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.missesText = this.add.text(500, 40, '❌ 套空: 0/5', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.timerText = this.add.text(800, 40, '⏱️ 30s', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      // 提示
      this.hintText = this.add.text(640, 680, '点击野马甩出套马索！', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(46, 125, 50, 0.8)',
        padding: { x: 16, y: 8 }
      }).setOrigin(0.5);
    },
    
    // 松手抛出（指针 up / outside 触发）
    releaseRope: function (targetX, targetY) {
      var self = this;
      this.charging = false;
      this.state = 'THROWING';

      // 清理蓄力 UI
      if (this.powerBarBg) { this.powerBarBg.destroy(); this.powerBarBg = null; }
      if (this.powerBarFill) { this.powerBarFill.destroy(); this.powerBarFill = null; }
      if (this.powerBarText) { this.powerBarText.destroy(); this.powerBarText = null; }
      if (this.aimLineGfx) { this.aimLineGfx.destroy(); this.aimLineGfx = null; }

      // 计算力度（0.4 ~ 1.0）
      var power = Phaser.Math.Clamp(this.chargePower, 0.4, 1.0);

      // 创建套马索
      this.rope = this.add.graphics().setDepth(700);
      this.ropeCircle = this.add.graphics().setDepth(701);
      this.ropeRingGfx = this.add.graphics().setDepth(702);  // 套圈收缩效果

      var startX = this.playerX;
      var startY = this.playerY - 30;
      var config = window.KAZAKHSTAN_LEVEL.taming.rope;

      // 距离限制
      var dx = targetX - startX;
      var dy = targetY - startY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var maxDist = config.maxDistance + power * 150;
      if (dist > maxDist) {
        targetX = startX + dx * maxDist / dist;
        targetY = startY + dy * maxDist / dist;
        dist = maxDist;
      }

      // 抛物线参数
      var t = 0;
      var dur = config.throwDuration;
      var vx = (targetX - startX);
      var vy = (targetY - startY);
      // 重力：让绳索呈抛物线
      var gravity = 380;  // 像素/秒²（相对时间系数）
      var tween = this.tweens.addCounter({
        from: 0, to: 1,
        duration: dur,
        ease: 'Quad.easeOut',
        onUpdate: function () {
          var frac = tween.getValue();
          var cx = startX + vx * frac;
          var cy = startY + vy * frac + gravity * frac * frac - gravity * frac;
          self.drawRope(startX, startY, cx, cy, frac);
        },
        onComplete: function () {
          var endX = startX + vx;
          var endY = startY + vy;
          self.checkRopeHit(endX, endY, power);
        }
      });
    },

    // 兼容旧名（保留以防外部调用）
    throwRope: function (targetX, targetY) {
      this.chargePower = 0.6;
      this.aimX = targetX;
      this.aimY = targetY;
      this.releaseRope(targetX, targetY);
    },

    drawRope: function (x1, y1, x2, y2, frac) {
      if (!this.rope || !this.ropeCircle) return;
      var ropeColor = 0x8B4513;
      this.rope.clear();
      this.rope.lineStyle(3, ropeColor, 1);
      this.rope.beginPath();
      this.rope.moveTo(x1, y1);
      // 微微下垂的曲线
      var midX = (x1 + x2) / 2;
      var midY = (y1 + y2) / 2 + 8;
      quadBezierToFrom(this.rope, x1, y1, midX, midY, x2, y2);
      this.rope.strokePath();

      var config = window.KAZAKHSTAN_LEVEL.taming.rope;
      var baseR = config.circleRadius;
      // 末端套圈
      this.ropeCircle.clear();
      this.ropeCircle.lineStyle(4, 0xD2691E, 1);
      this.ropeCircle.strokeCircle(x2, y2, baseR);
      // 内部小圈
      this.ropeCircle.lineStyle(2, 0xFFC107, 0.8);
      this.ropeCircle.strokeCircle(x2, y2, baseR * 0.55);

      // 收缩波纹（外圈扩散）
      if (this.ropeRingGfx) {
        this.ropeRingGfx.clear();
        var ringT = (frac || 0);
        var rings = 3;
        for (var i = 0; i < rings; i++) {
          var phase = (ringT * 2 + i / rings) % 1;
          var r = baseR + phase * 22;
          var alpha = (1 - phase) * 0.45;
          this.ropeRingGfx.lineStyle(2, 0xFFD54F, alpha);
          this.ropeRingGfx.strokeCircle(x2, y2, r);
        }
      }
    },

    checkRopeHit: function (tx, ty, power) {
      var config = window.KAZAKHSTAN_LEVEL.taming.rope;
      var hit = null;

      for (var i = 0; i < this.horses.length; i++) {
        var horse = this.horses[i];
        if (horse.caught || horse.aiState === 'TAMEING') continue;

        var dx = horse.x - tx;
        var dy = horse.y - ty;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // 力度越高，套中范围越大（蓄力奖励）
        var hitR = config.circleRadius + 30 + (power || 0) * 10;
        if (dist < hitR) {
          hit = horse;
          break;
        }
      }

      // 清理绳索
      if (this.rope) { this.rope.destroy(); this.rope = null; }
      if (this.ropeCircle) { this.ropeCircle.destroy(); this.ropeCircle = null; }
      if (this.ropeRingGfx) { this.ropeRingGfx.destroy(); this.ropeRingGfx = null; }

      if (hit) {
        // 套中！进入驯服阶段
        this.showToast('🎯 套住了！快速点击驯服！', 0xFFC107);
        this.startTaming(hit);
      } else {
        // 套空
        this.misses++;
        window.playKazakhstanSfx('click', 0.3);
        this.showToast('套空了', 0xFF5722);

        this.missesText.setText('❌ 套空: ' + this.misses + '/5');

        if (this.misses >= 5) {
          this.state = 'FAIL';
          this.showFail('套空次数太多');
        } else {
          this.state = 'AIMING';
          this.resetCharge();
        }
      }
    },
    
    showToast: function (msg, color) {
      var toast = this.add.text(640, 120, msg, {
        fontSize: '24px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
        padding: { x: 20, y: 12 }
      }).setOrigin(0.5).setDepth(1000);
      
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 80,
        duration: 1500,
        onComplete: function () { toast.destroy(); }
      });
    },
    
    showSuccess: function () {
      var self = this;
      var overlay = this.add.rectangle(640, 360, 600, 300, 0x2E7D32, 0.95);
      
      this.add.text(640, 280, '🎉 驯服成功！', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.add.text(640, 340, '你成功驯服了一匹骏马', {
        fontSize: '20px', color: '#FFFFFF'
      }).setOrigin(0.5);
      
      var btn = this.add.rectangle(640, 420, 200, 50, 0x4CAF50)
        .setInteractive({ useHandCursor: true });
      
      this.add.text(640, 420, '骑马出发', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      btn.on('pointerdown', function () {
        try { window.playKazakhstanSfx('button', 0.4); } catch (e) {}
        try { self.scene.start('PlayScene'); }
        catch (e) { console.error('[kaz] scene.start(PlayScene) threw:', e); }
        // Fallback: 如果 scene.start 静默失败, 1s 后强制回到 debug PlayScene
        setTimeout(function () {
          try {
            var stillInTaming = false;
            try { stillInTaming = self.scene.isActive(); } catch (e2) {}
            if (stillInTaming) {
              window.location.href = '/games/silk-road/level/3?debug=1';
            }
          } catch (e) {
            window.location.href = '/games/silk-road/level/3?debug=1';
          }
        }, 1000);
      });
    },
    
    showFail: function (reason) {
      var self = this;
      var overlay = this.add.rectangle(640, 360, 600, 300, 0xC62828, 0.95);
      
      this.add.text(640, 280, '❌ 套马失败', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.add.text(640, 340, reason, {
        fontSize: '20px', color: '#FFFFFF'
      }).setOrigin(0.5);
      
      var btn = this.add.rectangle(640, 420, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      
      this.add.text(640, 420, '再试一次', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      btn.on('pointerdown', function () {
        try { window.playKazakhstanSfx('button', 0.4); } catch (e) {}
        self.scene.restart();
      });
    },
    
    update: function () {
      if (this.state === 'SUCCESS' || this.state === 'FAIL') return;

      // 更新计时器
      var elapsed = Date.now() - this.startTime;
      var timeLeft = Math.max(0, this.timeLeft - elapsed);
      this.timerText.setText('⏱️ ' + Math.ceil(timeLeft / 1000) + 's');

      if (timeLeft <= 0) {
        this.state = 'FAIL';
        this.showFail('时间到');
        return;
      }

      // 蓄力中：每帧增加力度
      if (this.state === 'CHARGING') {
        this.chargePower = Math.min(this.maxPower, this.chargePower + this.chargeRate * 16);
        this.drawPowerBar();
        return;
      }

      // 驯服中：进度条慢慢扣减
      if (this.state === 'TAMEING' && this.activeTameHorse) {
        this.updateTaming(16);
        // 不 return —— 仍要绘制恐慌马匹的挣扎动画
      }

      // 更新野马 AI
      var playerDist = function (h) {
        var dx = h.x - this.playerX;
        var dy = h.y - this.playerY;
        return Math.sqrt(dx * dx + dy * dy);
      }.bind(this);

      var dt = 0.016;
      for (var i = 0; i < this.horses.length; i++) {
        var horse = this.horses[i];
        if (horse.caught) continue;

        // 更新 AI 状态
        this.updateHorseAI(horse, dt, playerDist(horse));

        // 应用速度（按状态缩放）
        var stateSpeedMul = { RELAXED: 0.55, ALERT: 0.9, PANIC: 1.6, TAMEING: 1.4 }[horse.aiState] || 1;
        horse.x += horse.vx * dt * stateSpeedMul;
        horse.y += horse.vy * dt * stateSpeedMul;

        // 边界反弹 + clamp
        if (horse.x < 100 || horse.x > CANVAS_W - 100) horse.vx *= -1;
        if (horse.y < 150 || horse.y > CANVAS_H - 150) horse.vy *= -1;
        horse.x = Phaser.Math.Clamp(horse.x, 100, CANVAS_W - 100);
        horse.y = Phaser.Math.Clamp(horse.y, 150, CANVAS_H - 150);

        // 根据 vx 方向翻转马头
        if (Math.abs(horse.vx) > 5) horse.facing = horse.vx >= 0 ? 1 : -1;

        this.drawHorse(horse);
      }
    },

    // 马匹AI状态机：RELAXED → ALERT → PANIC → TAMEING
    updateHorseAI: function (horse, dt, distToPlayer) {
      horse.stateTimer += dt;

      switch (horse.aiState) {
        case 'RELAXED':
          // 慢速随机游走：每 1.5-3s 换方向
          if (Math.random() < dt * 0.7 || horse.stateTimer > 2.5) {
            horse.stateTimer = 0;
            var ang = Math.random() * Math.PI * 2;
            var sp = horse.speed * 0.4;
            horse.vx = Math.cos(ang) * sp;
            horse.vy = Math.sin(ang) * sp * 0.4;
          }
          // 玩家靠近 → ALERT
          if (distToPlayer < 200) {
            horse.aiState = 'ALERT';
            horse.stateTimer = 0;
          }
          break;

        case 'ALERT':
          // 远离玩家：方向 = 远离玩家
          var dx = horse.x - this.playerX;
          var dy = horse.y - this.playerY;
          var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var desiredVx = (dx / d) * horse.speed * 0.85;
          var desiredVy = (dy / d) * horse.speed * 0.4;
          // 平滑插值（避免突变）
          horse.vx += (desiredVx - horse.vx) * 0.08;
          horse.vy += (desiredVy - horse.vy) * 0.08;

          // 玩家远离（>260px）→ 回到 RELAXED
          if (distToPlayer > 260) {
            horse.aiState = 'RELAXED';
            horse.stateTimer = 0;
          }
          // 玩家非常近（<100px）→ PANIC
          if (distToPlayer < 100) {
            horse.aiState = 'PANIC';
            horse.stateTimer = 0;
          }
          break;

        case 'PANIC':
          // 全力狂奔：方向远离玩家 + 大幅随机偏移
          var dx2 = horse.x - this.playerX;
          var dy2 = horse.y - this.playerY;
          var d2 = Math.max(1, Math.sqrt(dx2 * dx2 + dy2 * dy2));
          // 主方向 = 远离
          var panicSp = horse.speed * 1.5;
          horse.vx = (dx2 / d2) * panicSp + (Math.random() - 0.5) * 100;
          horse.vy = (dy2 / d2) * panicSp * 0.5 + (Math.random() - 0.5) * 50;

          // 8s 后回到 RELAXED
          if (horse.stateTimer > 8) {
            horse.aiState = 'RELAXED';
            horse.stateTimer = 0;
          }
          break;

        case 'TAMEING':
          // 驯服中：挣扎乱跑
          if (!horse.taming) {
            // 兜底：taming 信息丢失则退出
            horse.aiState = 'RELAXED';
            return;
          }
          horse.vx += (Math.random() - 0.5) * 200 * dt;
          horse.vy += (Math.random() - 0.5) * 200 * dt;
          // 限速
          var maxV = horse.speed * 1.6;
          horse.vx = Phaser.Math.Clamp(horse.vx, -maxV, maxV);
          horse.vy = Phaser.Math.Clamp(horse.vy, -maxV * 0.6, maxV * 0.6);
          break;
      }
    },

    // 驯服进度更新：每秒衰减 0.25，连点 +0.4
    updateTaming: function (dtMs) {
      var t = this.activeTameHorse.taming;
      if (!t) return;
      var dt = dtMs / 1000;
      // 缓慢自然衰减（不点击会失败）
      t.progress -= 0.25 * dt;
      if (t.progress <= 0) {
        // 驯服失败
        this.failTaming();
        return;
      }
      // 进度条 UI
      this.tameBarFill.width = (t.progress / t.required) * this.tameBarBg.width;
      this.tameBarFill.setX(this.tameBarBg.x - this.tameBarBg.width / 2);
      this.tameCountdownText.setText('驯服中… ' + Math.ceil(t.progress) + '/' + t.required);
    },

    // 开始驯服阶段：进入 TAMEING 状态
    startTaming: function (horse) {
      this.activeTameHorse = horse;
      horse.aiState = 'TAMEING';
      horse.stateTimer = 0;
      horse.taming = { progress: 3, required: 3 };  // 3 秒连点驯服

      // UI：驯服条
      var barY = 200;
      var barW = 400;
      var barX = 640;
      this.tameBarBg = this.add.rectangle(barX, barY, barW, 28, 0x000000, 0.6).setDepth(900);
      this.tameBarFill = this.add.rectangle(barX - barW / 2, barY, barW, 28, 0x4CAF50, 1).setOrigin(0, 0.5).setDepth(901);
      this.tameBarFill.x = barX - barW / 2;
      this.tameBarBg.x = barX;
      this.tameCountdownText = this.add.text(barX, barY - 30, '🔗 快速点击驯服！', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(46, 125, 50, 0.85)',
        padding: { x: 14, y: 6 }
      }).setOrigin(0.5).setDepth(902);

      this.state = 'TAMEING';
      window.playKazakhstanSfx('rope', 0.5);
    },

    // 玩家点击屏幕（TAMEING 阶段连点）
    onTameClick: function () {
      if (!this.activeTameHorse || !this.activeTameHorse.taming) return;
      var t = this.activeTameHorse.taming;
      t.progress = Math.min(t.required, t.progress + 0.4);
      // 视觉反馈：抖动马匹
      var horse = this.activeTameHorse;
      horse.runPhase += 0.5;
      window.playKazakhstanSfx('click', 0.3);

      if (t.progress >= t.required) {
        this.completeTaming();
      }
    },

    // 完成驯服
    completeTaming: function () {
      var horse = this.activeTameHorse;
      horse.caught = true;
      horse.aiState = 'TAMEING';  // 保持在 TAMEING 直到绘制完成后由 drawHorse 跳过（caught=true）
      horse.taming = null;
      this.drawHorse(horse);
      this.catches++;
      window.playKazakhstanSfx('pickup', 0.6);
      this.showToast('🎉 驯服成功！', 0x4CAF50);

      this.cleanupTameUI();

      // 提升剩余马匹速度
      if (this.catches < 3) {
        var newSpeed = window.KAZAKHSTAN_LEVEL.taming.speeds[this.catches];
        for (var j = 0; j < this.horses.length; j++) {
          if (!this.horses[j].caught) {
            this.horses[j].speed = newSpeed;
          }
        }
      }

      this.catchesText.setText('🎯 套中: ' + this.catches + '/3');
      this.missesText.setText('❌ 套空: ' + this.misses + '/5');

      if (this.catches >= 3) {
        this.state = 'SUCCESS';
        this.showSuccess();
      } else {
        this.state = 'AIMING';
        this.resetCharge();
      }
    },

    // 驯服失败
    failTaming: function () {
      this.misses++;
      window.playKazakhstanSfx('fail', 0.4);
      this.showToast('马挣脱了！再试试', 0xFF5722);
      var horse = this.activeTameHorse;
      if (horse) {
        horse.aiState = 'PANIC';
        horse.stateTimer = 0;
        horse.taming = null;
      }
      this.cleanupTameUI();

      this.missesText.setText('❌ 套空: ' + this.misses + '/5');
      this.catchesText.setText('🎯 套中: ' + this.catches + '/3');

      if (this.misses >= 5) {
        this.state = 'FAIL';
        this.showFail('套空次数太多');
      } else {
        this.state = 'AIMING';
        this.resetCharge();
      }
    },

    cleanupTameUI: function () {
      if (this.tameBarBg) { this.tameBarBg.destroy(); this.tameBarBg = null; }
      if (this.tameBarFill) { this.tameBarFill.destroy(); this.tameBarFill = null; }
      if (this.tameCountdownText) { this.tameCountdownText.destroy(); this.tameCountdownText = null; }
      this.activeTameHorse = null;
    },
  });

  // ============== PlayScene (骑马探索) ==============
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    create: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL;

      this.cameras.main.setBackgroundColor('#81D4FA');

      // 状态
      this.state = 'PLAYING'; // PLAYING, MODAL, DEPARTING
      // Debug 模式: 满金币/坚戈/物品 + 跳过套马
      this.coins = isDebug ? 9999 : this.loadCoins(); // 里拉
      this.tenge = isDebug ? 9999 : 0; // 坚戈
      this.items = isDebug ? this._debugItems() : this.loadItems();
      this.hasHorse = true; // 套马成功后默认骑马
      this.walkPhase = 0;
      this.horsePalette = window.KAZAKHSTAN_HORSE_PALETTES[0]; // 棕色

      // 绘制地图
      this.drawMap();

      // 玩家
      var startPos = config.map.playerStart;
      this.playerX = startPos.x;
      this.playerY = startPos.y;
      this.playerContainer = this.add.container(startPos.x, startPos.y);
      this.playerContainer.setDepth(30);
      this.drawPlayer();

      // 蒙古包
      this.yurts = [];
      for (var i = 0; i < config.yurts.length; i++) {
        var y = config.yurts[i];
        this.createYurt(y);
      }

      // 兑换中心
      this.createExchangeCenter();

      // 集市 (草原特产, 非货币兑换)
      this.createMarketplace();

      // 出口
      this.createExit();
      this.drawExitText();
      this.drawBuildingLabels();

      // HUD
      this.createHUD();

      // —— 移动输入: 键盘 + 虚拟方向键 ——
      // 跟土耳其一致, 使用 boolean 对象而非 Phaser Key 插件
      this.keys = { up: false, down: false, left: false, right: false };

      // 虚拟方向键 (左下角, scale 0.6, 跟土耳其一致)
      this._createJoystick();

      // 键盘监听 (WASD + 方向键 → 设置 boolean)
      var onKeyDown = function (k) { return function () { self.keys[k] = true; }; };
      var onKeyUp = function (k) { return function () { self.keys[k] = false; }; };
      this.input.keyboard.on('keydown-UP', onKeyDown('up'));
      this.input.keyboard.on('keydown-DOWN', onKeyDown('down'));
      this.input.keyboard.on('keydown-LEFT', onKeyDown('left'));
      this.input.keyboard.on('keydown-RIGHT', onKeyDown('right'));
      this.input.keyboard.on('keydown-W', onKeyDown('up'));
      this.input.keyboard.on('keydown-A', onKeyDown('left'));
      this.input.keyboard.on('keydown-S', onKeyDown('down'));
      this.input.keyboard.on('keydown-D', onKeyDown('right'));
      this.input.keyboard.on('keyup-UP', onKeyUp('up'));
      this.input.keyboard.on('keyup-DOWN', onKeyUp('down'));
      this.input.keyboard.on('keyup-LEFT', onKeyUp('left'));
      this.input.keyboard.on('keyup-RIGHT', onKeyUp('right'));
      this.input.keyboard.on('keyup-W', onKeyUp('up'));
      this.input.keyboard.on('keyup-A', onKeyUp('left'));
      this.input.keyboard.on('keyup-S', onKeyUp('down'));
      this.input.keyboard.on('keyup-D', onKeyUp('right'));

      // 任务提示
      this.add.text(640, 80, '🎯 兑换坚戈 → 集市买保暖衣物 + 马奶酒 → 去右侧驿站出发去新疆', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(100);

      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    // —— 虚拟方向键 (4 个圆形按钮 + 箭头, 左下角 110,560 scale 0.6 depth 500 ——
    _createJoystick: function () {
      var self = this;
      this.joystickContainer = this.add.container(110, 560);
      this.joystickContainer.setAlpha(0.78);
      // v25.4 Bug C: 统一大小到新疆滑雪关 (scale 0.6 → 1.0, 颜色保持棕)
      this.joystickContainer.setScale(1.0);
      this.joystickContainer.setDepth(500);

      // 圆盘背景
      var dpadBg = this.add.graphics();
      dpadBg.fillStyle(0x4A2E1A, 0.55);
      // v25.4 Bug C: 圆盘 r 115 → 138 (跟 xinjiang 1.2x, 颜色保持)
      dpadBg.fillCircle(0, 0, 138);
      this.joystickContainer.add(dpadBg);

      this.joystickBtns = {};
      var makeDpadBtn = function (txt, dx, dy, key) {
        // v25.4 Bug C: 按钮 r 40 → 48, 颜色保持棕
        var bg = self.add.circle(dx, dy, 48, 0x4A2E1A, 0.85)
          .setStrokeStyle(2, 0xFFD98A, 0.7);
        // v25.4 Bug C: 箭头 fontSize 30 → 32, 颜色保持金
        var arrow = self.add.text(dx, dy, txt, {
          fontSize: '32px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0.5);
        // v25.4 Bug C: zone 80 → 96 (1.2x)
        var zone = self.add.zone(dx, dy, 96, 96).setInteractive({ useHandCursor: true });
        var press = function () {
          self.keys[key] = true;
          bg.setFillStyle(0xFFD98A, 0.95);
          arrow.setColor('#2A190E');
          window.playKazakhstanSfx('click', 0.4);
        };
        var release = function () {
          self.keys[key] = false;
          bg.setFillStyle(0x4A2E1A, 0.85);
          arrow.setColor('#FFD98A');
        };
        zone.on('pointerdown', press);
        zone.on('pointerup', release);
        zone.on('pointerout', release);
        self.joystickContainer.add([bg, arrow, zone]);
        self.joystickBtns[key] = { bg: bg, arrow: arrow };
      };
      // v25.4 Bug C: 4 个按钮偏移 ±75 → ±90 (跟 xinjiang 一致)
      makeDpadBtn('▲', 0, -90, 'up');
      makeDpadBtn('▼', 0, 90, 'down');
      makeDpadBtn('◀', -90, 0, 'left');
      makeDpadBtn('▶', 90, 0, 'right');
    },
    
    loadCoins: function () {
      try {
        return parseInt(localStorage.getItem('silkroad_coins') || '0', 10);
      } catch (e) {
        return 0;
      }
    },

    saveCoins: function () {
      try {
        localStorage.setItem('silkroad_coins', this.coins.toString());
      } catch (e) {}
    },

    loadItems: function () {
      try {
        return JSON.parse(localStorage.getItem('silkroad_kazakhstan_items') || '[]');
      } catch (e) {
        return [];
      }
    },

    saveItems: function () {
      try {
        localStorage.setItem('silkroad_kazakhstan_items', JSON.stringify(this.items));
      } catch (e) {}
    },

    // Debug 模式: 返回所有 yurt 商品 id (满库存)
    _debugItems: function () {
      var ids = [];
      var yurts = window.KAZAKHSTAN_LEVEL.yurts;
      for (var i = 0; i < yurts.length; i++) {
        var items = yurts[i].items;
        for (var j = 0; j < items.length; j++) {
          if (ids.indexOf(items[j].id) < 0) ids.push(items[j].id);
        }
      }
      return ids;
    },
    
    drawMap: function () {
      var gfx = this.add.graphics();
      
      // 天空
      gfx.fillGradientStyle(0x81D4FA, 0x81D4FA, 0xB3E5FC, 0xB3E5FC, 1);
      gfx.fillRect(0, 0, CANVAS_W, CANVAS_H / 2);
      
      // 雪山
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillTriangle(100, 300, 200, 200, 300, 300);
      gfx.fillTriangle(400, 320, 500, 220, 600, 320);
      gfx.fillTriangle(800, 310, 900, 210, 1000, 310);
      
      // 草原
      gfx.fillStyle(0x7CB342, 1);
      gfx.fillRect(0, CANVAS_H / 2, CANVAS_W, CANVAS_H / 2);
      
      // 草地纹理
      gfx.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 100; i++) {
        var x = Math.random() * CANVAS_W;
        var y = CANVAS_H / 2 + Math.random() * (CANVAS_H / 2);
        gfx.fillRect(x, y, 20, 3);
      }
    },
    
    drawPlayer: function () {
      this.playerContainer.removeAll(true);

      // 马 (使用共享 drawHorseShape, 静态)
      if (this.hasHorse) {
        var horseGfx = this.add.graphics();
        // 选取调色板 (优先用 selectedPalette, 默认棕色)
        var palette = (this.horsePalette)
          ? this.horsePalette
          : window.KAZAKHSTAN_HORSE_PALETTES[0];
        drawHorseShape(horseGfx, palette, {
          facing: 1,
          animate: false,
          phase: this.walkPhase || 0,
          amplitude: 4,
          cx: 0, cy: 0,
        });
        this.playerContainer.add(horseGfx);
      }

      // 角色（骑在马上 / 步行）
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.8);
      avatar.setPosition(0, this.hasHorse ? -22 : 0);
      this.playerContainer.add(avatar);
    },
    
    createYurt: function (yurtConfig) {
      var self = this;
      var yurt = {
        config: yurtConfig,
        kind: 'yurt',
        gfx: this.add.graphics(),
        bubble: null,
        hitZone: this.add.zone(yurtConfig.x, yurtConfig.y, 160, 160)
          .setInteractive({ useHandCursor: true }),
      };
      yurt.hitZone.on('pointerdown', function () {
        self.tryOpenYurt(yurtConfig);
      });
      this.drawYurt(yurt);
      this.yurts.push(yurt);
    },

    drawYurt: function (yurt) {
      var g = yurt.gfx;
      var x = yurt.config.x;
      var y = yurt.config.y;

      g.clear();

      // 蒙古包底座 (白布)
      g.fillStyle(0xF5F5DC, 1);
      g.fillCircle(x, y, 35);
      // 顶 (棕)
      g.fillStyle(0x8D6E63, 1);
      g.fillTriangle(x - 30, y - 10, x + 30, y - 10, x, y - 42);
      // 门 (深棕)
      g.fillStyle(0x5D4037, 1);
      g.fillRect(x - 8, y - 5, 16, 22);
      // 装饰红圈
      g.lineStyle(2, 0xD84315, 1);
      g.strokeCircle(x, y, 35);
      // 顶饰
      g.fillStyle(0xFFD54F, 1);
      g.fillCircle(x, y - 42, 4);

      // 门口下方: 商品 emoji (无价格文字 - 跟土耳其 renderLocation 一致)
      if (yurt.config.items && yurt.config.items.length > 0) {
        var item = yurt.config.items[0];
        var emoji = item.emoji || '🛒';
        // 销毁旧 text (重绘场景时避免重叠)
        if (yurt.itemEmojiText) { yurt.itemEmojiText.destroy(); yurt.itemEmojiText = null; }
        yurt.itemEmojiText = this.add.text(x, y + 50, emoji, {
          fontSize: '28px',
        }).setOrigin(0.5).setDepth(20);
      }
    },
    
    // 创建建筑 (蒙古包 / 兑换中心 / 集市) — 统一签名, 返回带 bubble 的对象
    createBuilding: function (config, kind) {
      var self = this;
      var sprite = {
        config: config,
        kind: kind,         // 'yurt' | 'exchange' | 'market'
        gfx: this.add.graphics(),
        bubble: null,
      };
      this.drawBuilding(sprite);
      sprite.hitZone = this.add.zone(config.position.x, config.position.y, 160, 160)
        .setInteractive({ useHandCursor: true });
      sprite.hitZone.on('pointerdown', function () {
        if (kind === 'exchange') self.tryOpenExchange();
        else if (kind === 'market') self.tryOpenMarket();
        else self.tryOpenYurt(sprite.config);
      });
      if (kind === 'exchange') this.exchangeSprite = sprite;
      else if (kind === 'market') this.marketSprite = sprite;
      return sprite;
    },

    drawBuilding: function (sprite) {
      var g = sprite.gfx;
      var config = sprite.config;
      var x = config.position.x;
      var y = config.position.y;
      g.clear();

      if (sprite.kind === 'exchange') {
        // 黄色帐篷 (货币兑换)
        g.fillStyle(0xFFEB3B, 1);
        g.fillTriangle(x - 40, y + 20, x + 40, y + 20, x, y - 30);
        g.fillStyle(0xF57F17, 1);
        g.fillRect(x - 35, y + 20, 70, 15);
        g.lineStyle(3, 0xE65100, 1);
        g.strokeTriangle(x - 40, y + 20, x + 40, y + 20, x, y - 30);
        // 招牌框
        g.fillStyle(0x2A1606, 1);
        g.fillRect(x - 18, y - 15, 36, 18);
        g.lineStyle(1, 0xFFD98A, 1);
        g.strokeRect(x - 18, y - 15, 36, 18);
      } else if (sprite.kind === 'market') {
        // 赭红橙色帐篷 (集市)
        g.fillStyle(0xD84315, 1);
        g.fillTriangle(x - 44, y + 22, x + 44, y + 22, x, y - 32);
        g.fillStyle(0xBF360C, 1);
        g.fillRect(x - 40, y + 22, 80, 16);
        g.lineStyle(3, 0x8D2C0A, 1);
        g.strokeTriangle(x - 44, y + 22, x + 44, y + 22, x, y - 32);
        // 柜台
        g.fillStyle(0x5D4037, 1);
        g.fillRect(x - 35, y + 8, 70, 14);
        g.lineStyle(1, 0x8D6E63, 1);
        g.strokeRect(x - 35, y + 8, 70, 14);
        // 招牌 (草编圆)
        g.fillStyle(0xFFB74D, 1);
        g.fillCircle(x, y - 22, 13);
        g.lineStyle(1.5, 0x8D2C0A, 1);
        g.strokeCircle(x, y - 22, 13);
      } else {
        // 蒙古包 (yurt, 由 createYurt 单独绘制)
      }
    },

    // 给建筑加 emoji 标签 (用 add.text 而非 Graphics.fillText)
    drawBuildingLabels: function () {
      if (this.exchangeSprite && !this.exchangeSpriteLabel) {
        var ec = this.exchangeSprite.config.position;
        this.exchangeSpriteLabel = this.add.text(ec.x, ec.y - 8, '💱', {
          fontSize: '20px',
        }).setOrigin(0.5).setDepth(20);
      }
      if (this.marketSprite && !this.marketSpriteLabel) {
        var mc = this.marketSprite.config.position;
        this.marketSpriteLabel = this.add.text(mc.x, mc.y - 22, '🛒', {
          fontSize: '20px',
        }).setOrigin(0.5).setDepth(20);
      }
    },

    createExchangeCenter: function () {
      this.exchangeSprite = this.createBuilding(window.KAZAKHSTAN_LEVEL.exchange, 'exchange');
    },

    createMarketplace: function () {
      if (!window.KAZAKHSTAN_LEVEL.marketplace) return;
      this.marketSprite = this.createBuilding(window.KAZAKHSTAN_LEVEL.marketplace, 'market');
    },

    createExit: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL.departure;

      this.exitGfx = this.add.graphics();
      this.drawExit();

      this.exitLabel = this.add.text(config.exitZone.x, config.exitZone.y + 80, '🏯 → 新疆', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: 'rgba(198, 40, 40, 0.92)',
        padding: { x: 12, y: 6 },
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 出发动画按钮 (默认隐藏,玩家走近且集齐 required 时显示)
      this.exitBtn = this.add.text(config.exitZone.x, config.exitZone.y, '✨ 出发去新疆！', {
        fontSize: '20px', color: '#2A1606', fontStyle: 'bold',
        backgroundColor: '#D4AF37',
        padding: { x: 18, y: 10 },
        stroke: '#8B6914', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(150).setVisible(false);
      this.exitBtn.setInteractive({ useHandCursor: true });
      this.exitBtn.on('pointerdown', function () {
        self.tryDepart();  // tryDepart 内部会检查 hasWarm/hasKumis,缺一就 toast
      });

      var hitArea = this.add.circle(config.exitZone.x, config.exitZone.y, config.exitZone.radius, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', function () {
        var dx = self.playerX - config.exitZone.x;
        var dy = self.playerY - config.exitZone.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < config.exitZone.radius) {
          self.tryDepart();
        } else {
          self.showToast('太远了，走近一点', 0xFF9800);
        }
      });
      this.exitHit = hitArea;
    },

    // 出发按钮显示条件: 玩家在 exitZone 内 + 已集齐 warm_clothes + kumis
    _updateExitButton: function () {
      if (!this.exitBtn) return;
      if (this.state !== 'PLAYING') {
        this.exitBtn.setVisible(false);
        return;
      }
      var config = window.KAZAKHSTAN_LEVEL.departure;
      var dx = this.playerX - config.exitZone.x;
      var dy = this.playerY - config.exitZone.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var inRange = dist < config.exitZone.radius;
      var hasWarm = this.items.indexOf('warm_clothes') >= 0;
      var hasKumis = this.items.indexOf('kumis') >= 0;
      var ready = inRange && hasWarm && hasKumis;
      this.exitBtn.setVisible(ready);
    },

    drawExit: function () {
      var g = this.exitGfx;
      var config = window.KAZAKHSTAN_LEVEL.departure;
      var x = config.exitZone.x;
      var y = config.exitZone.y;

      g.clear();

      // 拱门底座 (赭红 + 棕)
      g.fillStyle(0x8D6E63, 1);
      g.fillRoundedRect(x - 60, y - 30, 120, 100, 8);
      // 拱形门洞
      g.fillStyle(0x2A1606, 1);
      g.fillRect(x - 28, y + 10, 56, 60);
      g.beginPath();
      g.arc(x, y + 10, 28, Math.PI, 0, true);
      g.fillPath();
      // 拱门顶
      g.fillStyle(0xC62828, 1);
      g.fillRoundedRect(x - 64, y - 50, 128, 22, 6);
      g.lineStyle(2, 0x8D2C0A, 1);
      g.strokeRoundedRect(x - 64, y - 50, 128, 22, 6);

      // 旗杆 + 旗
      g.lineStyle(2, 0x4A2E1A, 1);
      g.lineBetween(x - 50, y - 50, x - 50, y - 90);
      g.fillStyle(0xC62828, 1);
      g.fillTriangle(x - 50, y - 90, x - 20, y - 80, x - 50, y - 70);

      // 右侧驼影 (示意)
      g.fillStyle(0x6B3410, 0.85);
      g.fillRoundedRect(x + 38, y + 18, 36, 16, 5);
      g.fillStyle(0x3E1F0E, 0.85);
      g.fillCircle(x + 78, y + 10, 7);  // 驼头
      g.fillRect(x + 30, y + 34, 4, 14);
      g.fillRect(x + 46, y + 34, 4, 14);
      g.fillRect(x + 62, y + 34, 4, 14);

      // 远景路面指示
      g.fillStyle(0xFFFFFF, 0.7);
      g.fillTriangle(x + 70, y + 5, x + 95, y + 5, x + 82, y - 8);
    },

    drawExitText: function () {
      // 单独 addText 才能用文字 (Graphics.fillText 不存在)
      if (this.exitSignText) this.exitSignText.destroy();
      var x = window.KAZAKHSTAN_LEVEL.departure.exitZone.x;
      var y = window.KAZAKHSTAN_LEVEL.departure.exitZone.y;
      this.exitSignText = this.add.text(x, y - 40, '丝绸驿站', {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);
    },
    
    createHUD: function () {
      var self = this;
      // 暗棕色 HUD 背景 (跟土耳其/伊朗一致)
      this.hudBg = this.add.rectangle(640, 36, 1280, 72, 0x2A1606, 0.92);

      // 1. 💰 里拉 (x=180, 与土耳其共享坐标)
      this.coinText = this.add.text(180, 30, '💰 ' + this.coins + ' ₺', {
        fontSize: '15px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 2. 💵 坚戈 (x=310)
      this.tengeText = this.add.text(310, 30, '💵 ' + this.tenge + ' ₸', {
        fontSize: '15px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 3. 🐴 骑乘切换 (x=520) — 步行蓝色 / 骑马绿色
      this.rideBtn = this.add.text(520, 30, (this.hasHorse ? '🐴 骑乘中' : '🚶 步行'), {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        backgroundColor: this.hasHorse ? '#5B8C3A' : '#1B5E8A',
        padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.rideBtn.setInteractive({ useHandCursor: true });
      this.rideBtn.on('pointerdown', function () { self.toggleRide(); });

      // 4. 🧳 行李 (x=770) — 物品数, 含 required 提示
      this.luggageBtn = this.add.text(770, 30, this._luggageText(), {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.luggageBtn.setInteractive({ useHandCursor: true });
      this.luggageBtn.on('pointerdown', function () { self.openLuggageModal(); });

      // v11: BGM 删除, BGM 按钮也删掉

      // 6. 🗺️ 世界地图按钮 (x=1200)
      this.worldMapBtn = this.add.text(1200, 30, '🗺️', {
        fontSize: '18px', color: '#F4ECD8',
      }).setOrigin(0.5);
      this.worldMapBtn.setInteractive({ useHandCursor: true });
      this.worldMapBtn.on('pointerdown', function () {
        window.location.href = '/games/silk-road/world-map';
      });
    },

    _luggageText: function () {
      // 统一数据源: localStorage (Qatar/Iran) + 本地购买合并,显示总件数 (无 X/Y)
      var luggage = this._loadLuggageWithQty();
      var totalQty = 0;
      for (var i = 0; i < luggage.length; i++) {
        totalQty += (luggage[i].qty || 1);
      }
      return '🧳 ' + totalQty;
    },

    _renderJugHud: function () {
      // 占位 — 哈萨克关无 jug, 兼容 common.js
    },

    toggleRide: function () {
      this.hasHorse = !this.hasHorse;
      var palette = window.KAZAKHSTAN_HORSE_PALETTES[Math.floor(Math.random() * 5)];
      this.horsePalette = palette;
      this.walkPhase = 0;
      this.drawPlayer();
      this._updateRideBtn();
      window.playKazakhstanSfx('button', 0.4);
    },

    _updateRideBtn: function () {
      if (this.rideBtn) {
        this.rideBtn.setText(this.hasHorse ? '🐴 骑乘中' : '🚶 步行');
        this.rideBtn.setStyle({
          backgroundColor: this.hasHorse ? '#5B8C3A' : '#1B5E8A',
          padding: { x: 10, y: 3 },
        });
      }
    },

    // v11: BGM 删除, toggleBgm 函数也删掉 (BGM 按钮已删, 没人调用)

    openLuggageModal: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';

      // 销毁之前的 modal
      if (this.currentModal) { this.currentModal.destroy(); this.currentModal = null; }

      var luggage = this._loadLuggageWithQty();
      // 标记 required 项目 (来自 Kazakhstan departure.requiredItems)
      var required = window.KAZAKHSTAN_LEVEL.departure.requiredItems;
      var requiredSet = {};
      for (var ri = 0; ri < required.length; ri++) requiredSet[required[ri]] = true;

      // 过滤掉 qty <= 0
      var validLuggage = [];
      for (var vi = 0; vi < luggage.length; vi++) {
        if (luggage[vi].qty && luggage[vi].qty > 0) validLuggage.push(luggage[vi]);
      }

      // 容器
      var modal = this.add.container(640, 360);
      modal.setDepth(2000);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      modal.add(backdrop);
      var card = this.add.rectangle(0, 0, 700, 480, 0x2A1606, 1)
        .setStrokeStyle(2, 0xD4AF37, 0.7);
      modal.add(card);

      var totalQty = 0;
      for (var ti = 0; ti < validLuggage.length; ti++) totalQty += validLuggage[ti].qty;

      modal.add(this.add.text(0, -200, '🧳 我的行李 (Qatar + Iran + 本地购买)', {
        fontSize: '24px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5));
      modal.add(this.add.text(0, -170, '已收集 ' + totalQty + ' 件物品 (可去兑换/交易中心换钱)', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      if (validLuggage.length === 0) {
        modal.add(this.add.text(0, 30, '（行李箱空空如也）', {
          fontSize: '16px', color: '#F6B5C8', fontStyle: 'italic',
        }).setOrigin(0.5));
      } else {
        var rowH = 38;
        var visible = validLuggage.slice(0, 11);
        var startY = -(visible.length * rowH) / 2 + rowH / 2 - 30;
        for (var li = 0; li < visible.length; li++) {
          var e = visible[li];
          var info = self._getItemDisplayInfo(e.id);
          var isReq = !!requiredSet[String(e.id)] || !!requiredSet[e.id];
          var ry = startY + li * rowH;
          var rowBg = self.add.rectangle(0, ry, 620, rowH - 6,
            isReq ? 0x5C3A1E : 0x4A2E1A, 0.9)
            .setStrokeStyle(2, isReq ? 0xFFEB3B : 0x6B4423, isReq ? 0.8 : 0.4);
          modal.add(rowBg);
          var prefix = isReq ? '⭐ ' : '· ';
          // emoji (left)
          modal.add(self.add.text(-280, ry, info.emoji, { fontSize: '22px' }).setOrigin(0.5));
          // name (middle, with required prefix)
          modal.add(self.add.text(-250, ry, prefix + info.name, {
            fontSize: '14px',
            color: isReq ? '#FFEB3B' : '#F4ECD8',
            fontStyle: 'bold',
          }).setOrigin(0, 0.5));
          // ×qty (right)
          modal.add(self.add.text(240, ry, '×' + e.qty, {
            fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
          }).setOrigin(0, 0.5));
        }
      }

      var closeBg = this.add.rectangle(0, 205, 200, 50, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      modal.add(closeBg);
      modal.add(this.add.text(0, 205, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 205, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () {
        modal.destroy();
        if (self.currentModal === modal) self.currentModal = null;
        self.state = 'PLAYING';
      });
      modal.add(closeZone);

      this.currentModal = modal;
    },

    _simpleModal: function (title, body, onClose) {
      var self = this;
      this.state = 'MODAL';
      var modal = this.add.container(640, 360);
      modal.setDepth(2000);
      var bg = this.add.rectangle(0, 0, 600, 400, 0x2A1606, 0.95);
      modal.add(bg);
      var titleText = this.add.text(0, -150, title, {
        fontSize: '26px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(titleText);
      var bodyText = this.add.text(0, 0, body, {
        fontSize: '16px', color: '#F4ECD8', align: 'left', wordWrap: { width: 540 },
      }).setOrigin(0.5);
      modal.add(bodyText);
      var closeBg = this.add.rectangle(0, 170, 150, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      var closeText = this.add.text(0, 170, '关闭', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(closeText);
      closeBg.on('pointerdown', function () {
        modal.destroy();
        if (onClose) onClose();
      });
      this.currentModal = modal;
    },

    updateHUD: function () {
      this.coinText.setText('💰 ' + this.coins + ' ₺');
      this.tengeText.setText('💵 ' + this.tenge + ' ₸');
      this.luggageBtn.setText(this._luggageText());
      this._updateRideBtn();
    },
    
    // ========== 气泡系统 (跟随玩家走近显示) ==========
    showBubble: function (sprite, text, color) {
      if (sprite.bubble) return;
      color = color || 0xFFD98A;
      var self = this;
      var cfg = sprite.config;
      var x = cfg.position ? cfg.position.x : cfg.x;
      var y = cfg.position ? cfg.position.y : cfg.y;
      var bg = this.add.graphics();
      bg.fillStyle(0x2A1606, 0.92);
      bg.fillRoundedRect(-55, -16, 110, 32, 8);
      bg.lineStyle(2, color, 0.85);
      bg.strokeRoundedRect(-55, -16, 110, 32, 8);
      bg.fillTriangle(-5, 16, 5, 16, 0, 22);
      var txt = this.add.text(0, 0, text, {
        fontSize: '13px', color: '#' + color.toString(16).padStart(6, '0').toUpperCase(),
        fontStyle: 'bold',
      }).setOrigin(0.5);
      var bubble = this.add.container(x, y - 48, [bg, txt]);
      bubble.setDepth(100);
      var zone = this.add.zone(x, y - 48, 130, 50).setInteractive({ useHandCursor: true });
      zone.setDepth(101);
      zone.on('pointerdown', function () {
        if (sprite.kind === 'yurt') self.tryOpenYurt(sprite.config);
        else if (sprite.kind === 'exchange') self.tryOpenExchange();
        else if (sprite.kind === 'market') self.tryOpenMarket();
      });
      bubble.bubbleZone = zone;
      sprite.bubble = bubble;
    },

    hideBubble: function (sprite) {
      if (sprite.bubble) {
        if (sprite.bubble.bubbleZone) sprite.bubble.bubbleZone.destroy();
        sprite.bubble.destroy();
        sprite.bubble = null;
      }
    },

    // 检查与某建筑的距离 (< 80 显示气泡, > 90 隐藏)
    _proximityCheck: function (sprite, text, color) {
      if (!sprite) return;
      var cfg = sprite.config;
      var x = cfg.position ? cfg.position.x : cfg.x;
      var y = cfg.position ? cfg.position.y : cfg.y;
      var dx = this.playerX - x;
      var dy = this.playerY - y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 80) this.showBubble(sprite, text, color);
      else if (d > 90) this.hideBubble(sprite);
    },

    tryOpenYurt: function (yurtConfig) {
      if (this.state !== 'PLAYING') return;
      var dx = this.playerX - yurtConfig.x;
      var dy = this.playerY - yurtConfig.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 80) {
        this.showToast('太远了，走近一点', 0xFF9800);
        return;
      }
      this.openYurtModal(yurtConfig);
    },

    tryOpenExchange: function () {
      if (this.state !== 'PLAYING') return;
      var cfg = window.KAZAKHSTAN_LEVEL.exchange.position;
      var dx = this.playerX - cfg.x;
      var dy = this.playerY - cfg.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 80) {
        this.showToast('太远了，走近一点', 0xFF9800);
        return;
      }
      this.openExchangeModal();
    },

    tryOpenMarket: function () {
      if (this.state !== 'PLAYING') return;
      var cfg = window.KAZAKHSTAN_LEVEL.marketplace.position;
      var dx = this.playerX - cfg.x;
      var dy = this.playerY - cfg.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 80) {
        this.showToast('太远了，走近一点', 0xFF9800);
        return;
      }
      this.openMarketModal();
    },

    // ========= 交易中心 (Tab 切换: 购买本地特产 vs 卖出进口商品) =========
    openMarketModal: function () {
      var self = this;
      this._marketTab = this._marketTab || 'buy';
      this._renderMarketModal();
    },

    _renderMarketModal: function () {
      var self = this;
      this.state = 'MODAL';
      var config = window.KAZAKHSTAN_LEVEL.marketplace;

      // 销毁之前的 modal
      if (this.currentModal) { this.currentModal.destroy(); this.currentModal = null; }

      var modal = this.add.container(640, 360);
      modal.setDepth(2000);
      var bg = this.add.rectangle(0, 0, 720, 540, 0xBF360C, 0.95);
      modal.add(bg);

      var title = self.add.text(0, -230, '🛒 ' + config.name + ' (交易中心)', {
        fontSize: '26px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(title);

      // 两个 tab
      var tabY = -195;
      var tabW = 240, tabH = 36;
      var buyTabBg = self.add.rectangle(-tabW / 2 - 6, tabY, tabW, tabH,
        this._marketTab === 'buy' ? 0xD4AF37 : 0x6B4423, 0.95)
        .setStrokeStyle(2, 0xFFE9B0, 0.7);
      modal.add(buyTabBg);
      var buyTabTxt = self.add.text(-tabW / 2 - 6, tabY, '🛒 购买本地特产', {
        fontSize: '14px',
        color: this._marketTab === 'buy' ? '#2A190E' : '#FFD98A',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(buyTabTxt);
      var buyTabZone = self.add.zone(-tabW / 2 - 6, tabY, tabW, tabH)
        .setInteractive({ useHandCursor: true });
      buyTabZone.on('pointerdown', function () {
        self._marketTab = 'buy';
        self._renderMarketModal();
      });
      modal.add(buyTabZone);

      var sellTabBg = self.add.rectangle(tabW / 2 + 6, tabY, tabW, tabH,
        this._marketTab === 'sell' ? 0xD4AF37 : 0x6B4423, 0.95)
        .setStrokeStyle(2, 0xFFE9B0, 0.7);
      modal.add(sellTabBg);
      var sellTabTxt = self.add.text(tabW / 2 + 6, tabY, '🏪 卖出进口商品', {
        fontSize: '14px',
        color: this._marketTab === 'sell' ? '#2A190E' : '#FFD98A',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(sellTabTxt);
      var sellTabZone = self.add.zone(tabW / 2 + 6, tabY, tabW, tabH)
        .setInteractive({ useHandCursor: true });
      sellTabZone.on('pointerdown', function () {
        self._marketTab = 'sell';
        self._renderMarketModal();
      });
      modal.add(sellTabZone);

      // 当前余额
      var balTxt = self.add.text(0, -150,
        '💵 当前坚戈: ' + this.tenge + ' ₸', {
        fontSize: '14px', color: '#FFEB3B', fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(balTxt);

      if (this._marketTab === 'buy') {
        // —— 购买本地特产 grid (跟原 openMarketModal 一致) ——
        var sub = self.add.text(0, -115, '草原特产集 — 用坚戈购买', {
          fontSize: '13px', color: '#FFCCBC',
        }).setOrigin(0.5);
        modal.add(sub);

        var itemY = -55;
        for (var i = 0; i < config.items.length; i++) {
          (function (item) {
            var card = self.add.rectangle(0, itemY, 620, 58, 0x5D2C20, 0.9);
            modal.add(card);
            var emojiText = self.add.text(-295, itemY, item.emoji || '🛒', {
              fontSize: '22px',
            }).setOrigin(0, 0.5);
            modal.add(emojiText);
            var name = self.add.text(-250, itemY - 10, item.name, {
              fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            modal.add(name);
            var desc = self.add.text(-250, itemY + 12, item.desc + (item.required ? '  (必需)' : ''), {
              fontSize: '11px', color: item.required ? '#FFEB3B' : '#FFCCBC',
            }).setOrigin(0, 0.5);
            modal.add(desc);
            var price = self.add.text(140, itemY, item.price + ' ₸', {
              fontSize: '15px', color: '#FFD98A', fontStyle: 'bold',
            }).setOrigin(0, 0.5);
            modal.add(price);
            var btnBg = self.add.rectangle(240, itemY, 80, 36, 0x4CAF50)
              .setInteractive({ useHandCursor: true });
            modal.add(btnBg);
            var btnText = self.add.text(240, itemY, '购买', {
              fontSize: '13px', color: '#FFFFFF', fontStyle: 'bold',
            }).setOrigin(0.5);
            modal.add(btnText);
            btnBg.on('pointerdown', function () { self.buyItem(item.id, item.price); });
          })(config.items[i]);
          itemY += 70;
        }
      } else {
        // —— 卖出进口商品 (读 silkroad_luggage localStorage) ——
        var subSell = self.add.text(0, -115,
          '把 Qatar + Iran 行李卖掉, 换取哈萨克坚戈 ₸', {
          fontSize: '13px', color: '#FFCCBC',
        }).setOrigin(0.5);
        modal.add(subSell);

        // 聚合 luggage (按 id)
        var luggage = self._loadLuggageWithQty();
        var HEART_ID = 5;  // 归家之心不可卖
        var sellable = [];
        for (var li = 0; li < luggage.length; li++) {
          var e = luggage[li];
          if (e.id === HEART_ID) continue;
          if (!e.qty || e.qty <= 0) continue;
          if (self._getItemSellPrice(e.id) === null) continue;
          sellable.push(e);
        }

        if (sellable.length === 0) {
          var empty = self.add.text(0, 30, '（行李里没有可卖的物品）', {
            fontSize: '14px', color: '#F6B5C8', fontStyle: 'italic',
          }).setOrigin(0.5);
          modal.add(empty);
        } else {
          var gridY = -55;
          var cellW = 145, cellH = 90, cols = 4;
          var startX = -((Math.min(cols, sellable.length) - 1) * cellW) / 2 - cellW / 2;
          for (var si = 0; si < sellable.length; si++) {
            (function (entry, idx) {
              var info = self._getItemDisplayInfo(entry.id);
              var price = self._getItemSellPrice(entry.id);
              var isIran = entry.id < 0;
              var col = idx % cols, row = Math.floor(idx / cols);
              var cx2 = startX + (col + 1) * cellW;
              var cy2 = gridY + row * cellH;

              var cellBg = self.add.rectangle(cx2, cy2, cellW - 14, cellH - 14,
                isIran ? 0x3A2A4A : 0x4A2E1A, 0.9)
                .setStrokeStyle(2, isIran ? 0xB98DC9 : 0xE67E22, 0.7);
              modal.add(cellBg);

              // emoji
              var emojiS = self.add.text(cx2, cy2 - 24, info.emoji, {
                fontSize: '24px',
              }).setOrigin(0.5);
              modal.add(emojiS);
              // name
              var nm = self.add.text(cx2, cy2 - 6, info.name, {
                fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
              }).setOrigin(0.5);
              nm.setFixedSize(cellW - 24, 14);
              modal.add(nm);
              // 来源 + ×qty
              var srcTxt = self.add.text(cx2, cy2 + 10,
                (isIran ? '🇮🇷' : '🇶🇦') + ' ×' + entry.qty, {
                fontSize: '10px', color: '#FFD98A',
              }).setOrigin(0.5);
              modal.add(srcTxt);
              // 卖价
              var priceTxt = self.add.text(cx2, cy2 + 25,
                '→ ' + price + ' ₸', {
                fontSize: '11px', color: '#FFEB3B', fontStyle: 'bold',
              }).setOrigin(0.5);
              modal.add(priceTxt);
              // 卖出按钮
              var sBtnBg = self.add.rectangle(cx2, cy2 + 44, 70, 22, 0xE67E22, 1)
                .setStrokeStyle(2, 0xFFE9B0, 0.6);
              modal.add(sBtnBg);
              var sBtnTxt = self.add.text(cx2, cy2 + 44, '卖出', {
                fontSize: '11px', color: '#2A190E', fontStyle: 'bold',
              }).setOrigin(0.5);
              modal.add(sBtnTxt);
              var sBtnZone = self.add.zone(cx2, cy2 + 44, 70, 22)
                .setInteractive({ useHandCursor: true });
              sBtnZone.on('pointerdown', function () {
                window.playKazakhstanSfx('click', 0.4);
                self.doMarketSell(entry.id);
              });
              modal.add(sBtnZone);
            })(sellable[si], si);
          }
        }
      }

      var closeBg = self.add.rectangle(0, 230, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      var closeText = self.add.text(0, 230, '关闭', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      modal.add(closeText);
      closeBg.on('pointerdown', function () {
        modal.destroy();
        self.currentModal = null;
        self.state = 'PLAYING';
      });
      this.currentModal = modal;
    },

    // 卖出进口商品 (id, qty-1)
    doMarketSell: function (itemId) {
      var self = this;
      var price = this._getItemSellPrice(itemId);
      if (price === null) { this.showToast('这件物品不可卖', 0xE74C3C); return; }

      // 从 luggage 减一件, 然后写回
      var luggage = [];
      try {
        var raw = localStorage.getItem('silkroad_luggage');
        if (raw) luggage = JSON.parse(raw);
        if (!Array.isArray(luggage)) luggage = [];
      } catch (e) { luggage = []; }
      if (luggage.length === 0) { this.showToast('这件物品已经卖完了', 0xE74C3C); return; }

      var found = false;
      for (var i = 0; i < luggage.length; i++) {
        if (luggage[i].id === itemId || Number(luggage[i].id) === Number(itemId)) {
          luggage[i].qty = (luggage[i].qty || 1) - 1;
          if (luggage[i].qty <= 0) {
            luggage.splice(i, 1);
          }
          found = true;
          break;
        }
      }
      if (!found) { this.showToast('这件物品已经卖完了', 0xE74C3C); return; }

      try { localStorage.setItem('silkroad_luggage', JSON.stringify(luggage)); } catch (e) {}

      this.tenge += price;
      window.playKazakhstanSfx('exchange', 0.55);
      window.playKazakhstanSfx('pickup', 0.3);
      this.showToast('💰 获得 ' + price + ' ₸', 0x5FB3A0, 900);
      this.updateHUD();
      // 重渲染 modal + HUD
      var tab = this._marketTab || 'sell';
      var hadModal = !!this.currentModal;
      setTimeout(function () {
        if (hadModal) self._renderMarketModal();
      }, 350);
    },

    openYurtModal: function (yurtConfig) {
      var self = this;
      this.state = 'MODAL';
      
      var modal = this.add.container(640, 360);
      modal.setDepth(2000);
      
      // 背景
      var bg = this.add.rectangle(0, 0, 700, 500, 0x2E7D32, 0.95);
      modal.add(bg);
      
      // 标题
      var title = this.add.text(0, -200, yurtConfig.emoji + ' ' + yurtConfig.name, {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(title);
      
      // 商品列表
      var itemY = -100;
      for (var i = 0; i < yurtConfig.items.length; i++) {
        var item = yurtConfig.items[i];
        
        // 商品卡片
        var card = this.add.rectangle(0, itemY, 600, 80, 0x1B5E20, 0.9);
        modal.add(card);
        
        // 名称
        var name = this.add.text(-200, itemY - 10, item.name, {
          fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        modal.add(name);
        
        // 描述
        var desc = this.add.text(-200, itemY + 15, item.desc, {
          fontSize: '14px', color: '#B9F6CA'
        }).setOrigin(0, 0.5);
        modal.add(desc);
        
        // 价格
        var price = this.add.text(150, itemY, item.price + ' ₸', {
          fontSize: '20px', color: '#FFEB3B', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        modal.add(price);
        
        // 购买按钮
        var btnBg = this.add.rectangle(250, itemY, 100, 40, 0x4CAF50);
        modal.add(btnBg);
        
        var btnText = this.add.text(250, itemY, '购买', {
          fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0.5);
        modal.add(btnText);
        
        // 按钮交互
        (function (itemId, itemPrice) {
          btnBg.setInteractive({ useHandCursor: true });
          btnBg.on('pointerdown', function () {
            self.buyItem(itemId, itemPrice);
          });
        })(item.id, item.price);
        
        itemY += 100;
      }
      
      // 关闭按钮
      var closeBg = this.add.rectangle(0, 200, 150, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      
      var closeText = this.add.text(0, 200, '关闭', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(closeText);
      
      closeBg.on('pointerdown', function () {
        modal.destroy();
        self.state = 'PLAYING';
      });
      
      this.currentModal = modal;
    },
    
    buyItem: function (itemId, price) {
      if (this.tenge < price) {
        this.showToast('坚戈不够！先去兑换', 0xFF5722);
        return;
      }
      
      if (this.items.indexOf(itemId) >= 0) {
        this.showToast('你已经有了', 0xFF9800);
        return;
      }
      
      this.tenge -= price;
      this.items.push(itemId);
      this.saveItems();
      
      window.playKazakhstanSfx('pickup', 0.5);
      this.showToast('✅ 购买成功', 0x4CAF50);
      
      this.updateHUD();
      
      // 关闭 modal
      if (this.currentModal) {
        this.currentModal.destroy();
        this.currentModal = null;
      }
      this.state = 'PLAYING';
    },
    
    // ========= 兑换中心 (多货币 + 真实汇率, 参考土耳其 line 1320-1422) =========
    // 用 _exchangeSelectedKey 跟踪当前选中的源货币 (TRY | IRR)
    openExchangeModal: function () {
      var self = this;
      if (this._exchangeModalOpen) return;
      this._exchangeModalOpen = true;
      this._exchangeSelectedKey = null;
      this._renderExchangeModal();
    },

    _renderExchangeModal: function () {
      var self = this;
      this.state = 'MODAL';

      // 销毁之前的 modal
      if (this.currentModal) { this.currentModal.destroy(); this.currentModal = null; }

      var modal = this.add.container(640, 360);
      modal.setDepth(2000);

      // 背景
      var bg = this.add.rectangle(0, 0, 700, 480, 0x2E7D32, 0.95);
      modal.add(bg);

      // 标题
      var title = this.add.text(0, -200, '💱 货币兑换中心 → 哈萨克坚戈 ₸', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(title);

      // 当前坚戈余额
      var tengeLine = this.add.text(0, -160, '💵 当前坚戈: ' + this.tenge + ' ₸', {
        fontSize: '16px', color: '#FFEB3B', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(tengeLine);

      // 读取所有源币余额 (来自 localStorage, 跨关卡)
      var rates = window.KAZAKHSTAN_LEVEL.exchange.rates;
      var balanceLines = [];
      for (var k in rates) {
        if (!rates.hasOwnProperty(k)) continue;
        var r = rates[k];
        var bal = 0;
        try { bal = parseInt(localStorage.getItem(r.localStorageKey) || '0', 10) || 0; } catch (e) {}
        balanceLines.push(r.symbol + ' ' + bal + ' ' + r.symbol);
      }
      var balancesText = this.add.text(0, -125, '余额: ' + balanceLines.join('  |  '), {
        fontSize: '14px', color: '#FFFFFF'
      }).setOrigin(0.5);
      modal.add(balancesText);

      // 选源币 tab 区 (高亮已选项)
      var tabY = -85;
      var sources = [];
      for (var k2 in rates) { if (rates.hasOwnProperty(k2)) sources.push(k2); }
      var tabW = 120, tabH = 40, tabGap = 18;
      var tabStartX = -((sources.length - 1) * (tabW + tabGap)) / 2;
      for (var ti = 0; ti < sources.length; ti++) {
        (function (key) {
          var tx = tabStartX + ti * (tabW + tabGap);
          var r = rates[key];
          var isSel = (self._exchangeSelectedKey === key);
          var tabBg = self.add.rectangle(tx, tabY, tabW, tabH,
            isSel ? 0xD4AF37 : 0x4A2E1A, 0.95)
            .setStrokeStyle(2, isSel ? 0xFFE9B0 : 0x6B4423, 0.7);
          modal.add(tabBg);
          var tabLabel = self.add.text(tx, tabY - 6, r.symbol + ' ' + r.name, {
            fontSize: '12px', color: isSel ? '#2A190E' : '#FFD98A', fontStyle: 'bold',
          }).setOrigin(0.5);
          modal.add(tabLabel);
          var bal = 0;
          try { bal = parseInt(localStorage.getItem(r.localStorageKey) || '0', 10) || 0; } catch (e) {}
          var tabBal = self.add.text(tx, tabY + 10, '余额 ' + bal, {
            fontSize: '10px', color: isSel ? '#5C3A1E' : '#C9B89A',
          }).setOrigin(0.5);
          modal.add(tabBal);
          var tabZone = self.add.zone(tx, tabY, tabW, tabH).setInteractive({ useHandCursor: true });
          tabZone.on('pointerdown', function () {
            self._exchangeSelectedKey = key;
            self._renderExchangeModal();
          });
          modal.add(tabZone);
        })(sources[ti]);
      }

      // 选完货币后显示 rate + max + 4 个按钮
      if (self._exchangeSelectedKey) {
        var sel = rates[self._exchangeSelectedKey];
        var bal = 0;
        try { bal = parseInt(localStorage.getItem(sel.localStorageKey) || '0', 10) || 0; } catch (e) {}
        var perKzt = sel.perKzt;  // 多少源币 = 1 ₸
        // perKzt = 13 means 13 ₺ = 1 ₸ → 100 ₺ = (100/13) ₸
        var maxKzt = Math.floor(bal / perKzt);

        // 汇率 + 最多可换
        var rateLine = self.add.text(0, -25,
          '汇率: ' + perKzt + ' ' + sel.symbol + ' = 1 ₸   |   最多可换: ' + maxKzt + ' ₸', {
          fontSize: '13px', color: '#FFEB3B', fontStyle: 'bold'
        }).setOrigin(0.5);
        modal.add(rateLine);

        // 4 个兑换金额按钮 (10/50/100/全部)
        var amounts = [10, 50, 100, maxKzt];
        var seen = {};
        var presets = [];
        for (var pi = 0; pi < amounts.length; pi++) {
          var n = amounts[pi];
          if (n > 0 && !seen[n]) { seen[n] = true; presets.push(n); }
        }
        if (presets.length === 0) {
          var noMoney = self.add.text(0, 30, '（' + sel.symbol + ' 不够，无法兑换）', {
            fontSize: '14px', color: '#F6B5C8', fontStyle: 'italic'
          }).setOrigin(0.5);
          modal.add(noMoney);
        } else {
          var bW = 110, bH = 50, bGap = 14;
          var startX = -((presets.length - 1) * (bW + bGap)) / 2;
          for (var bi = 0; bi < presets.length; bi++) {
            (function (kztAmount, isAll) {
              var bx2 = startX + bi * (bW + bGap);
              var by2 = 50;
              var btnBg2 = self.add.rectangle(bx2, by2, bW, bH, 0xD4AF37, 1)
                .setStrokeStyle(2, 0xFFE9B0);
              modal.add(btnBg2);
              var btnLbl = self.add.text(bx2, by2 - 8, kztAmount + ' ₸', {
                fontSize: '14px', color: '#2A190E', fontStyle: 'bold',
              }).setOrigin(0.5);
              modal.add(btnLbl);
              var btnSub = self.add.text(bx2, by2 + 12,
                '扣 ' + Math.round(kztAmount * perKzt * 100) / 100 + ' ' + sel.symbol, {
                fontSize: '9px', color: '#5C3A1E',
              }).setOrigin(0.5);
              modal.add(btnSub);
              var btnZone = self.add.zone(bx2, by2, bW, bH)
                .setInteractive({ useHandCursor: true });
              btnZone.on('pointerdown', function () {
                window.playKazakhstanSfx('click', 0.4);
                self.doExchange(self._exchangeSelectedKey, kztAmount);
              });
              modal.add(btnZone);
            })(presets[bi], bi === presets.length - 1 && presets[bi] === maxKzt);
          }
        }
      } else {
        var hint = self.add.text(0, -25, '👆 点上方按钮选择源货币', {
          fontSize: '14px', color: '#B9F6CA', fontStyle: 'italic'
        }).setOrigin(0.5);
        modal.add(hint);
      }

      // 底部提示
      var bottomHint = self.add.text(0, 130, '💡 想卖行李物品? 去 🏪 交易中心', {
        fontSize: '12px', color: '#FFD98A', fontStyle: 'italic'
      }).setOrigin(0.5);
      modal.add(bottomHint);

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 195, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      var closeText = this.add.text(0, 195, '关闭', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(closeText);
      closeBg.on('pointerdown', function () {
        self._exchangeModalOpen = false;
        modal.destroy();
        self.currentModal = null;
        self.state = 'PLAYING';
      });

      this.currentModal = modal;
    },

    // 兑换: 从源币扣 (kztAmount * perKzt), 增加 this.tenge
    doExchange: function (sourceKey, kztAmount) {
      var self = this;
      if (kztAmount <= 0) return;
      var rates = window.KAZAKHSTAN_LEVEL.exchange.rates;
      var cfg = rates[sourceKey];
      if (!cfg) { this.showToast('未知源币', 0xE74C3C); return; }
      var perKzt = cfg.perKzt;
      var needSource = kztAmount * perKzt;
      var bal = 0;
      try { bal = parseInt(localStorage.getItem(cfg.localStorageKey) || '0', 10) || 0; } catch (e) {}
      if (bal < needSource) {
        this.showToast(cfg.symbol + ' 不够! 需要 ' + needSource + ' ' + cfg.symbol, 0xE74C3C);
        return;
      }
      // 扣源币
      try { localStorage.setItem(cfg.localStorageKey, String(Math.round((bal - needSource) * 100) / 100)); } catch (e) {}
      // 加坚戈
      this.tenge += kztAmount;
      window.playKazakhstanSfx('exchange', 0.55);
      window.playKazakhstanSfx('pickup', 0.3);
      this.showToast('💰 兑换成功: -' + needSource + ' ' + cfg.symbol + '  +' + kztAmount + ' ₸', 0x5FB3A0, 1100);
      this.updateHUD();
      // 重渲染 modal 刷新余额 + 重新算 max
      this._exchangeModalOpen = false;
      setTimeout(function () {
        if (self.state === 'MODAL') {
          self._exchangeModalOpen = true;
          self._renderExchangeModal();
        }
      }, 350);
    },

    // ========= 行李箱 (外部调用 - 见 openLuggageModal) =========
    // 读取 luggage 数据: 优先 localStorage 'silkroad_luggage' (Qatar/Iran),
    // 兜底用 this.items (Kazakhstan 本地购买)
    _loadLuggageWithQty: function () {
      var items = [];
      try {
        var raw = localStorage.getItem('silkroad_luggage');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) items = items.concat(parsed);
        }
      } catch (e) {}
      // 合并本地购买 (按 id 聚合 qty)
      for (var i = 0; i < this.items.length; i++) {
        var id = this.items[i];
        var found = false;
        for (var j = 0; j < items.length; j++) {
          if (items[j].id === id) { items[j].qty = (items[j].qty || 1) + 1; found = true; break; }
        }
        if (!found) items.push({ id: id, qty: 1 });
      }
      return items;
    },

    _getItemDisplayInfo: function (id) {
      var sellPrices = window.KAZAKHSTAN_LEVEL.sellPrices;
      var sellInfo = sellPrices[id] || sellPrices[String(id)] || null;
      if (sellInfo) return { name: sellInfo.name, emoji: sellInfo.emoji };

      // yurt.items 表
      var yurts = window.KAZAKHSTAN_LEVEL.yurts;
      for (var i = 0; i < yurts.length; i++) {
        var items2 = yurts[i].items || [];
        for (var j = 0; j < items2.length; j++) {
          if (items2[j].id === id) return { name: items2[j].name, emoji: items2[j].emoji };
        }
      }
      // marketplace.items
      var mp = window.KAZAKHSTAN_LEVEL.marketplace;
      if (mp && mp.items) {
        for (var k = 0; k < mp.items.length; k++) {
          if (mp.items[k].id === id) return { name: mp.items[k].name, emoji: mp.items[k].emoji };
        }
      }
      // 兜底
      var fallback = window.KAZAKHSTAN_LEVEL.luggageFallback;
      if (fallback && fallback[id]) return { name: fallback[id].name, emoji: fallback[id].emoji };
      return { name: String(id), emoji: '📦' };
    },

    _getItemSellPrice: function (id) {
      var sellPrices = window.KAZAKHSTAN_LEVEL.sellPrices;
      var info = sellPrices[id] || sellPrices[String(id)] || null;
      return info ? info.price : null;
    },
    
    tryDepart: function () {
      var required = window.KAZAKHSTAN_LEVEL.departure.requiredItems;
      var hasWarm = this.items.indexOf('warm_clothes') >= 0;
      var hasKumis = this.items.indexOf('kumis') >= 0;

      if (!hasWarm || !hasKumis) {
        this.showToast('还需要购买必需品！', 0xFF5722);
        return;
      }

      // 标记状态 + 隐藏 HUD (跟旧版一样)
      this.state = 'DEPARTING';
      if (this.playerContainer) this.playerContainer.setVisible(false);
      if (this.joystickContainer) this.joystickContainer.setVisible(false);
      if (this.exitBtn) this.exitBtn.setVisible(false);
      if (this.exitLabel) this.exitLabel.setVisible(false);
      if (this.hudBg) this.hudBg.setVisible(false);
      if (this.coinText) this.coinText.setVisible(false);
      if (this.tengeText) this.tengeText.setVisible(false);
      if (this.rideBtn) this.rideBtn.setVisible(false);
      if (this.luggageBtn) this.luggageBtn.setVisible(false);
      if (this.bgmBtn) this.bgmBtn.setVisible(false);
      if (this.worldMapBtn) this.worldMapBtn.setVisible(false);

      // v18: 通关 modal — 显示「🏇 哈萨克通关啦」「+¥205.00」「🐎 继续去新疆」按钮
      // 跟 turkey 风格一致: container(640, 360), setDepth(2000)
      var self = this;
      var winContainer = this.add.container(640, 360);
      winContainer.setDepth(2000);

      var backdrop = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.7);
      var card = this.add.rectangle(0, 0, 520, 380, 0x4A2E1A, 1).setStrokeStyle(4, 0xFFD98A);
      var titleText = this.add.text(0, -120, '🏇 哈萨克通关啦', {
        fontSize: '32px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var quoteText = this.add.text(0, -70, '纵马天山，奶茶飘香', {
        fontSize: '18px', color: '#FFE9B0', fontStyle: 'italic',
        wordWrap: { width: 460 },
      }).setOrigin(0.5);
      var rewardText = this.add.text(0, 0, '+¥205.00', {
        fontSize: '48px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var rewardLabel = this.add.text(0, 50, '通关奖励', {
        fontSize: '16px', color: '#FFE9B0',
      }).setOrigin(0.5);

      var nextBg = this.add.rectangle(0, 140, 280, 60, 0xFFD98A, 1).setStrokeStyle(2, 0xFFE9B0);
      var nextBtnTxt = this.add.text(0, 140, '🐎 继续去新疆', {
        fontSize: '20px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var nextZone = this.add.zone(0, 140, 280, 60).setInteractive({ useHandCursor: true });

      winContainer.add([backdrop, card, titleText, quoteText, rewardText, rewardLabel, nextBg, nextBtnTxt, nextZone]);

      // v25.3 Bug #3: 飞书通知提前到通关 modal 显示时 (不等用户点按钮)
      if (!self._kazRewardClaimed) {
        self._kazRewardClaimed = true;
        try {
          // v25.4 Bug A: 用 sendBeacon (iOS Safari + 页面秒关 兜底)
          var payload = JSON.stringify({
            level: 3, amount: 205,
            session_id: (window.SILK_ROAD_SESSION_ID || ''),
            nickname: (window.SILK_ROAD_NICKNAME || localStorage.getItem('silkroad_nickname') || '小卡'),
          });
          var ok = false;
          if (navigator.sendBeacon) {
            ok = navigator.sendBeacon('/api/game/reward/claim',
              new Blob([payload], { type: 'application/json' }));
          }
          if (!ok) {
            fetch('/api/game/reward/claim', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: payload, keepalive: true,
            }).catch(function() {});
          }
        } catch (e) {}
      }

      var claimAndDepart = function () {
        try { window.playKazakhstanSfx('voyage', 0.6); } catch (e) {}
        // 通关: 写入 cleared_levels
        try {
          var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
          if (cleared.indexOf(3) === -1) {
            cleared.push(3);
            localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
          }
        } catch (e) {}
        // 清理 DOM 兜底按钮
        var oldBtn = document.getElementById('kazakhstan-win-next-btn');
        if (oldBtn) oldBtn.remove();
        // 跳到 DepartScene (过场动画)
        self.scene.start('DepartScene');
      };

      nextZone.on('pointerdown', function () {
        if (self._kazWinClicked) return;
        self._kazWinClicked = true;
        try { window.playKazakhstanSfx('button', 0.4); } catch (e) {}
        claimAndDepart();
      });

      // v18: iOS Safari DOM 兜底按钮 (透明化, 只保留点击区)
      var oldDom = document.getElementById('kazakhstan-win-next-btn');
      if (oldDom) oldDom.remove();
      var domBtn = document.createElement('button');
      domBtn.id = 'kazakhstan-win-next-btn';
      domBtn.type = 'button';
      domBtn.textContent = '🐎 继续去新疆';
      domBtn.style.cssText = [
        'position:fixed',
        'z-index:9000',
        'background:transparent',
        'color:transparent',
        'border:none',
        'padding:0',
        'font-family:inherit',
        'font-weight:bold',
        'cursor:pointer',
        'pointer-events:auto',
        'user-select:none',
        '-webkit-user-select:none',
        '-webkit-tap-highlight-color:transparent',
      ].join(';');
      // 位置 (canvas 1280x720, 按钮中心 640, 500) — 跟 Phaser FIT letterbox 兼容
      var positionKazWinDomBtn = function () {
        var canvas = (window.__kazakhstanGame && window.__kazakhstanGame.canvas) || null;
        if (!canvas) return;
        var rect = canvas.getBoundingClientRect();
        var sx = rect.width / 1280;
        var sy = rect.height / 720;
        var cx = rect.left + 640 * sx;
        var cy = rect.top + 500 * sy;
        var w = 280 * sx;
        var h = 60 * sy;
        domBtn.style.left = (cx - w / 2) + 'px';
        domBtn.style.top = (cy - h / 2) + 'px';
        domBtn.style.width = w + 'px';
        domBtn.style.height = h + 'px';
        domBtn.style.fontSize = (20 * sy) + 'px';
        domBtn.style.lineHeight = h + 'px';
      };
      positionKazWinDomBtn();
      window.addEventListener('resize', positionKazWinDomBtn);
      domBtn.onclick = function () {
        if (self._kazWinClicked) return;
        self._kazWinClicked = true;
        try { window.playKazakhstanSfx('button', 0.4); } catch (e) {}
        claimAndDepart();
      };
      document.body.appendChild(domBtn);
    },

    // —— 旧版 depart() 保留为 stub (代码完整性, 防止外部误调) ——
    // 新流程: tryDepart() → DepartScene (RGB lerp 草原→雪山 + DOM 继续按钮)
    depart: function () {
      console.warn('[kaz] depart() is deprecated, use tryDepart() instead');
      this.tryDepart();
    },
    
    showToast: function (msg, color) {
      var toast = this.add.text(640, 120, msg, {
        fontSize: '24px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
        padding: { x: 20, y: 12 }
      }).setOrigin(0.5).setDepth(1000);
      
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 80,
        duration: 1500,
        onComplete: function () { toast.destroy(); }
      });
    },
    
    update: function () {
      if (this.state !== 'PLAYING') return;

      // —— 移动 ——
      var speed = this.hasHorse
        ? window.KAZAKHSTAN_LEVEL.movement.rideSpeed
        : window.KAZAKHSTAN_LEVEL.movement.walkSpeed;
      var dx = 0, dy = 0;

      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;
      if (this.keys.up) dy -= 1;
      if (this.keys.down) dy += 1;

      if (dx !== 0 || dy !== 0) {
        var len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;

        this.playerX += dx * speed * 0.016;
        this.playerY += dy * speed * 0.016;

        // 边界
        this.playerX = Phaser.Math.Clamp(this.playerX, 50, CANVAS_W - 50);
        this.playerY = Phaser.Math.Clamp(this.playerY, 100, CANVAS_H - 50);

        this.playerContainer.setPosition(this.playerX, this.playerY);

        // 翻转
        if (dx < 0) this.playerContainer.setScale(-1, 1);
        else if (dx > 0) this.playerContainer.setScale(1, 1);

        // 脚步相位 (驱动马腿轻微摆动)
        this.walkPhase = (this.walkPhase || 0) + 0.16;
        if (this.hasHorse) {
          this.drawPlayer();  // 重绘 (腿会随 walkPhase 摆动)
          this.playerContainer.setPosition(this.playerX, this.playerY);
          if (dx < 0) this.playerContainer.setScale(-1, 1);
          else if (dx > 0) this.playerContainer.setScale(1, 1);
        }
      }

      // —— 临近检查: 4 个气泡源 ——
      var allBubbles = this.yurts.slice();
      if (this.exchangeSprite) allBubbles.push(this.exchangeSprite);
      if (this.marketSprite) allBubbles.push(this.marketSprite);
      for (var i = 0; i < allBubbles.length; i++) {
        var sp = allBubbles[i];
        var text, color;
        if (sp.kind === 'exchange') { text = '💱 点击兑换 💬'; color = 0xD4AF37; }
        else if (sp.kind === 'market') { text = '🛒 点击交易 💬'; color = 0xFFB74D; }
        else { text = (sp.config.emoji || '🏇') + ' 点击交易 💬'; color = 0xFFD98A; }
        this._proximityCheck(sp, text, color);
      }

      // —— 出发按钮显示控制 ——
      this._updateExitButton();
    }
  });

  // ============== 游戏初始化 ==============
  var config = {
    type: Phaser.AUTO,
    width: CANVAS_W,
    height: CANVAS_H,
    parent: 'game-container',
    // 启用 preserveDrawingBuffer 让 Playwright canvas.toDataURL() 能正确抓取截图
    // (默认 Phaser WebGL 在每帧后会清空 buffer,导致 toDataURL 抓到的全是黑屏)
    render: {
      preserveDrawingBuffer: true
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, TamingScene, PlayScene, DepartScene]
  };

  var game = new Phaser.Game(config);
  // 暴露全局引用供测试/调试使用 (Playwright 验证)
  if (typeof window !== 'undefined') window.__kazakhstanGame = game;

  // 全屏按钮
  var fsBtn = document.getElementById('kazakhstan-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      if (game.scale.isFullscreen) {
        game.scale.stopFullscreen();
      } else {
        game.scale.startFullscreen();
      }
    });
  }

  // 竖屏提示
  function checkOrientation() {
    var lock = document.getElementById('orientation-lock');
    if (!lock) return;
    
    if (window.innerHeight > window.innerWidth) {
      lock.style.display = 'flex';
    } else {
      lock.style.display = 'none';
    }
  }
  
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

})();
