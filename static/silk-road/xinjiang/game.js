// 新疆·天山滑雪 —— 关卡 4 游戏引擎
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 滑下雪山 → 购买补给 → 出发去成都
//   BootScene → SlidingScene (下滑) → ShoppingScene (购买补给) → DepartScene (过场) → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (pointerdown/up + 虚拟方向键)
//
// localStorage 写入 (通关时):
//   silkroad_cleared_levels 追加 4
//   silkroad_xinjiang_items: ["meat_skewer", "warmer", "cheese"...]

(function () {
  'use strict';

  var CANVAS_W = 1280;
  var CANVAS_H = 720;

  // ============== Debug 模式 (?debug=1) ==============
  // 跳过 SlidingScene + 满金币/物品 + 直接进 ShoppingScene
  var isDebug = /[?&]debug=1/.test(window.location.search);

  // ============== SFX 助手 ==============
  window.playXinjiangSfx = function (id, volume) {
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
  function quadBezierToFrom(g, sx, sy, cpx, cpy, ex, ey, n) {
    n = n || 16;
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      var u = 1 - t;
      var px = u * u * sx + 2 * u * t * cpx + t * t * ex;
      var py = u * u * sy + 2 * u * t * cpx + t * t * ey;
      g.lineTo(px, py);
    }
  }

  // ============== DepartScene (出发去成都) ==============
  // 仿 kazakhstan DepartScene: RGB lerp 雪山白 → 成都暖橙色, 三段路径, DOM continue 兜底
  var DepartScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function DepartScene() { Phaser.Scene.call(this, { key: 'DepartScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#FFE9B0');

      // —— 天空 (固定不变, 暖橙晨曦) ——
      var sky = this.add.graphics();
      sky.fillStyle(0xFFE9B0, 1);
      sky.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 太阳
      var sun = this.add.graphics();
      sun.fillStyle(0xFFE0A0, 0.8);
      sun.fillCircle(1100, 130, 60);
      sun.fillStyle(0xFFFFFF, 0.6);
      sun.fillCircle(1100, 130, 35);

      // 远云
      var clouds = [
        { x: 200, y: 140, s: 1 }, { x: 450, y: 200, s: 0.8 },
        { x: 750, y: 160, s: 1.1 }, { x: 1000, y: 230, s: 0.9 },
      ];
      clouds.forEach(function (c) {
        var cg = self.add.graphics();
        cg.fillStyle(0xFFFFFF, 0.65);
        cg.fillCircle(c.x, c.y, 28 * c.s);
        cg.fillCircle(c.x + 22 * c.s, c.y - 5, 22 * c.s);
        cg.fillCircle(c.x + 44 * c.s, c.y, 28 * c.s);
      });

      // —— 地面 (RGB lerp: 雪山白 0xFFFFFF → 成都暖橙 0xFDE2C5) ——
      var ground = this.add.graphics();
      ground.setDepth(10);
      var drawGround = function (progress) {
        ground.clear();
        // 0 = 雪山白, 1 = 成都暖橙
        var r = Math.round(0xFF + (0xFD - 0xFF) * progress);
        var g = Math.round(0xFF + (0xE2 - 0xFF) * progress);
        var b = Math.round(0xFF + (0xC5 - 0xFF) * progress);
        var groundColor = (r << 16) | (g << 8) | b;
        ground.fillStyle(groundColor, 1);
        ground.fillRect(0, 600, CANVAS_W, 200);
        // 山丘轮廓 (灰→绿)
        var hr = Math.round(0xB0 + (0x7C - 0xB0) * progress);
        var hg = Math.round(0xBE + (0xB3 - 0xBE) * progress);
        var hb = Math.round(0xC5 + (0x42 - 0xC5) * progress);
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

      // —— 雪山 (从地平线升起, alpha 0→0.7) ——
      var snowMountains = this.add.graphics();
      snowMountains.setDepth(20);
      snowMountains.setAlpha(0);
      var drawMountains = function (riseProgress) {
        snowMountains.clear();
        var baseY = 600;
        var peakOffset = (1 - riseProgress) * 250;
        snowMountains.fillStyle(0xFFFFFF, 0.7);
        snowMountains.fillTriangle(0, baseY, 200, baseY - 100 + peakOffset, 400, baseY);
        snowMountains.fillTriangle(300, baseY + 20, 520, baseY - 130 + peakOffset, 740, baseY + 20);
        snowMountains.fillTriangle(600, baseY, 820, baseY - 120 + peakOffset, 1040, baseY);
        snowMountains.fillTriangle(900, baseY + 20, 1120, baseY - 80 + peakOffset, 1340, baseY + 20);
        snowMountains.fillStyle(0xB0BEC5, 0.5);
        snowMountains.fillTriangle(0, baseY, 200, baseY + 20 + peakOffset, 400, baseY);
        snowMountains.fillTriangle(300, baseY + 20, 520, baseY + 10 + peakOffset, 740, baseY + 20);
        snowMountains.fillTriangle(600, baseY, 820, baseY + 10 + peakOffset, 1040, baseY);
        snowMountains.fillTriangle(900, baseY + 20, 1120, baseY + 30 + peakOffset, 1340, baseY + 20);
      };
      drawMountains(0);

      // —— 滑雪角色 (跟随三段路径) ——
      var riderContainer = this.add.container(200, 600);
      riderContainer.setDepth(100);

      // 雪板 + 角色 (使用 buildAvatarSprite)
      var avatarId = null;
      try { avatarId = localStorage.getItem('silkroad_avatar'); } catch (e) {}
      if (!avatarId) avatarId = 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.9);
      avatar.setPosition(0, -8);
      riderContainer.add(avatar);

      // 雪板 emoji
      var boardText = this.add.text(0, 14, '🎿', {
        fontSize: '36px',
      }).setOrigin(0.5);
      riderContainer.add(boardText);

      // —— 标题 ——
      this._flightTitle = this.add.text(640, 80, '🎿 离开新疆天山...', {
        fontSize: '22px', color: '#4A2E1A', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 217, 138, 0.85)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);

      // —— 三阶段动画 + RGB lerp (setInterval 16ms 60fps) ——
      // 阶段 1 (0-2s): 上升 (200, 600) → (200, 300)
      // 阶段 2 (2-5s): 横飞 (200, 300) → (1100, 300)
      // 阶段 3 (5-7s): 下降 (1100, 300) → (1200, 600)
      var phase1Dur = 2000;
      var phase2Dur = 3000;
      var phase3Dur = 2000;
      var startX = 200, startY = 600;
      var peakX = 200, peakY = 300;
      var farX = 1100, farY = 300;
      var endX = 1200, endY = 600;
      var startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this._departDone = false;
      this._departTick = setInterval(function () {
        if (self._departDone) return;
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        var elapsed = now - startTime;
        var totalDur = phase1Dur + phase2Dur + phase3Dur;
        if (elapsed > totalDur + 500) elapsed = totalDur;

        var curX, curY, bgProg, riseProg;
        if (elapsed < phase1Dur) {
          var t1 = elapsed / phase1Dur;
          var e1 = 1 - Math.pow(1 - t1, 2);
          curX = startX + (peakX - startX) * e1;
          curY = startY - (startY - peakY) * e1;
          bgProg = t1 * 0.3;
          riseProg = Math.min(t1 * 1.5, 1);
        } else if (elapsed < phase1Dur + phase2Dur) {
          var t2 = (elapsed - phase1Dur) / phase2Dur;
          var e2 = 1 - Math.pow(1 - t2, 2);
          curX = peakX + (farX - peakX) * e2;
          curY = peakY + (farY - peakY) * e2;
          bgProg = 0.3 + t2 * 0.5;
          riseProg = 1;
        } else {
          var t3 = (elapsed - phase1Dur - phase2Dur) / phase3Dur;
          var e3 = 1 - Math.pow(1 - t3, 2);
          curX = farX + (endX - farX) * e3;
          curY = peakY + (endY - peakY) * e3;
          bgProg = 0.8 + t3 * 0.2;
          riseProg = 1;
        }
        riderContainer.setPosition(curX, curY);
        drawGround(bgProg);
        if (riseProg > 0) snowMountains.setAlpha(0.7);
        drawMountains(riseProg);

        if (elapsed >= totalDur) {
          self._departDone = true;
          clearInterval(self._departTick);
          self._departTick = null;
          if (self._flightTitle) self._flightTitle.setText('🏠 抵达成都');
          try { window.playXinjiangSfx('voyage', 0.5); } catch (e) {}

          // —— 写通关状态 ——
          try {
            var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
            if (cleared.indexOf(4) < 0) {
              cleared.push(4);
              localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
            }
          } catch (e) {}

          self._showContinueButton();
        }
      }, 16);

      // —— 键盘空格/回车 ——
      this.input.keyboard.once('keydown-SPACE', function () { self._goNextLevel(); });
      this.input.keyboard.once('keydown-ENTER', function () { self._goNextLevel(); });

      // —— Scene shutdown 清理 ——
      this.events.once('shutdown', function () {
        if (self._departTick) { clearInterval(self._departTick); self._departTick = null; }
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
      continueZone.on('pointerdown', function () { self._goNextLevel(); });
      continueZone.on('pointerover', function () { continueBg.setFillStyle(0x4A9E8F, 1); });
      continueZone.on('pointerout', function () { continueBg.setFillStyle(0x5FB3A0, 0.9); });

      // DOM 按钮 (iOS Safari Phaser zone 偶尔不响应兜底)
      this._continueDomBtn = document.createElement('button');
      this._continueDomBtn.id = 'xj-depart-continue';
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
        var scaleX = rect.width / CANVAS_W;
        var scaleY = rect.height / CANVAS_H;
        var scale = Math.min(scaleX, scaleY);
        var renderW = CANVAS_W * scale;
        var renderH = CANVAS_H * scale;
        var offsetX = rect.left + (rect.width - renderW) / 2;
        var offsetY = rect.top + (rect.height - renderH) / 2;
        var px = offsetX + btnX * scale;
        var py = offsetY + btnY * scale;
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
      try { window.location.href = '/games/silk-road/level/5'; }
      catch (e) { window.location.reload(); }
    },
  });

  // ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#B3E5FC');

      // URL ?debug=1 → 跳过 SlidingScene, 直接 ShoppingScene (满金币/物品)
      if (isDebug) {
        console.log('[xj] BootScene debug=1 detected, skipping to ShoppingScene');
        this.time.delayedCall(100, function () { self.scene.start('ShoppingScene'); }, [], this);
        return;
      }

      this.add.text(640, 360, '新疆·天山滑雪\n加载中…', {
        fontSize: '26px', color: '#1565C0', fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5);

      // BGM 初始化
      var bgm = document.getElementById('silk-road-bgm');
      if (bgm) {
        var muted = localStorage.getItem('silkroad_bgm_muted') === '1';
        bgm.muted = muted;
        if (!muted) {
          var tryPlay = function () { bgm.play().catch(function () {}); };
          this.input.once('pointerdown', tryPlay);
          setTimeout(tryPlay, 500);
        }
      }

      this.time.delayedCall(800, function () {
        try { self.scene.start('SlidingScene'); }
        catch (e) { console.error('[xj] scene.start threw:', e); }
      }, [], this);
      setTimeout(function () {
        try {
          if (self.scene.isActive()) self.scene.start('SlidingScene');
        } catch (e) { console.error('[xj] fallback scene.start threw:', e); }
      }, 1500);
    }
  });

  // ============== SlidingScene (下滑场景) ==============
  // 玩家自动从屏幕顶部向下滑行, 按 ← → 键左右移动, 避开松树/岩石, 15 秒内到屏幕底部 = 通关
  var SlidingScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function SlidingScene() { Phaser.Scene.call(this, { key: 'SlidingScene' }); },
    create: function () {
      var self = this;
      var config = window.XINJIANG_LEVEL.sliding;

      this.cameras.main.setBackgroundColor('#B3E5FC');
      this.state = 'SLIDING';  // SLIDING | WIN | FAIL
      this.startTime = Date.now();
      this.timeLeft = config.timeLimit;

      // 玩家
      this.playerX = config.initialX;
      this.playerY = config.startY;
      this.scrollY = 0;  // 滚动距离 (模拟下滑)
      this.scrollSpeed = config.initialSpeed;

      // 障碍物数组
      this.obstacles = [];
      this.lastObstacleTime = Date.now();

      // 背景绘制
      this._drawBackground();

      // 玩家容器
      this.playerContainer = this.add.container(this.playerX, this.playerY);
      this.playerContainer.setDepth(50);
      this._drawPlayer();

      // UI
      this._createUI();

      // 虚拟方向键
      this.keys = { left: false, right: false };
      this._createJoystick();

      // 键盘监听
      var onKeyDown = function (k) { return function () { self.keys[k] = true; }; };
      var onKeyUp = function (k) { return function () { self.keys[k] = false; }; };
      this.input.keyboard.on('keydown-LEFT', onKeyDown('left'));
      this.input.keyboard.on('keydown-RIGHT', onKeyDown('right'));
      this.input.keyboard.on('keydown-A', onKeyDown('left'));
      this.input.keyboard.on('keydown-D', onKeyDown('right'));
      this.input.keyboard.on('keyup-LEFT', onKeyUp('left'));
      this.input.keyboard.on('keyup-RIGHT', onKeyUp('right'));
      this.input.keyboard.on('keyup-A', onKeyUp('left'));
      this.input.keyboard.on('keyup-D', onKeyUp('right'));

      // 提示
      this.add.text(640, 80, '🎯 用 ← → 键躲开松树岩石, 15 秒内滑到山脚!', {
        fontSize: '16px', color: '#0D47A1', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setDepth(100);

      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    _drawBackground: function () {
      var self = this;
      this.bgGfx = this.add.graphics();

      // 顶部雪山白 (固定)
      this.bgGfx.fillStyle(0xFFFFFF, 1);
      this.bgGfx.fillRect(0, 0, CANVAS_W, 280);

      // 雪山轮廓 (起伏)
      this.bgGfx.fillStyle(0xB0BEC5, 0.4);
      this.bgGfx.fillTriangle(0, 280, 200, 80, 400, 280);
      this.bgGfx.fillTriangle(300, 280, 600, 60, 900, 280);
      this.bgGfx.fillTriangle(800, 280, 1100, 100, 1280, 280);

      // 草原绿 (固定底部)
      this.bgGfx.fillStyle(0x7CB342, 1);
      this.bgGfx.fillRect(0, 280, CANVAS_W, 440);

      // 草地纹理
      this.bgGfx.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 60; i++) {
        var x = Math.random() * CANVAS_W;
        var y = 320 + Math.random() * 380;
        this.bgGfx.fillRect(x, y, 20, 3);
      }

      // 雪线分隔
      this.bgGfx.lineStyle(2, 0x90CAF9, 0.6);
      this.bgGfx.lineBetween(0, 280, CANVAS_W, 280);

      // 起点旗
      this.bgGfx.fillStyle(0x1565C0, 1);
      this.bgGfx.fillRect(20, 60, 6, 60);
      this.bgGfx.fillTriangle(26, 60, 60, 75, 26, 90);

      // 终点旗 (底部)
      this.bgGfx.fillStyle(0xC62828, 1);
      this.bgGfx.fillRect(CANVAS_W - 26, CANVAS_H - 60, 6, 60);
      this.bgGfx.fillTriangle(CANVAS_W - 20, CANVAS_H - 60, CANVAS_W - 60, CANVAS_H - 45, CANVAS_W - 20, CANVAS_H - 30);
    },

    _drawPlayer: function () {
      this.playerContainer.removeAll(true);

      // 雪板 emoji
      var board = this.add.text(0, 18, '🎿', {
        fontSize: '44px',
      }).setOrigin(0.5);
      this.playerContainer.add(board);

      // 角色 (在雪板上方)
      var avatarId = null;
      try { avatarId = localStorage.getItem('silkroad_avatar'); } catch (e) {}
      if (!avatarId) avatarId = 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.7);
      avatar.setPosition(0, -10);
      this.playerContainer.add(avatar);
    },

    _createUI: function () {
      // 顶部 HUD 背景
      this.add.rectangle(640, 30, CANVAS_W, 60, 0x0D47A1, 0.85);

      // 倒计时
      this.timerText = this.add.text(180, 30, '⏱️ 15s', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 距离进度
      this.progressText = this.add.text(420, 30, '📏 0m', {
        fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 进度条背景
      var barX = 700, barY = 30, barW = 380, barH = 18;
      this.add.rectangle(barX, barY, barW, barH, 0xFFFFFF, 0.3);
      this.progressBar = this.add.rectangle(barX - barW / 2, barY, 0, barH, 0x76FF03, 1)
        .setOrigin(0, 0.5);

      // 撞墙次数
      this.crashText = this.add.text(1100, 30, '💥 撞墙 0', {
        fontSize: '16px', color: '#FFEB3B', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.crashCount = 0;
    },

    _createJoystick: function () {
      var self = this;
      this.joystickContainer = this.add.container(140, CANVAS_H - 100);
      this.joystickContainer.setAlpha(0.72);
      this.joystickContainer.setScale(0.7);
      this.joystickContainer.setDepth(500);

      // 圆盘背景
      var dpadBg = this.add.graphics();
      dpadBg.fillStyle(0x0D47A1, 0.5);
      dpadBg.fillCircle(0, 0, 100);
      this.joystickContainer.add(dpadBg);

      var makeBtn = function (txt, dx, dy, key) {
        var bg = self.add.circle(dx, dy, 36, 0x0D47A1, 0.85)
          .setStrokeStyle(2, 0xB3E5FC, 0.7);
        var arrow = self.add.text(dx, dy, txt, {
          fontSize: '28px', color: '#B3E5FC', fontStyle: 'bold',
        }).setOrigin(0.5);
        var zone = self.add.zone(dx, dy, 76, 76).setInteractive({ useHandCursor: true });
        var press = function () {
          self.keys[key] = true;
          bg.setFillStyle(0xB3E5FC, 0.95);
          arrow.setColor('#0D47A1');
          window.playXinjiangSfx('click', 0.3);
        };
        var release = function () {
          self.keys[key] = false;
          bg.setFillStyle(0x0D47A1, 0.85);
          arrow.setColor('#B3E5FC');
        };
        zone.on('pointerdown', press);
        zone.on('pointerup', release);
        zone.on('pointerout', release);
        self.joystickContainer.add([bg, arrow, zone]);
      };
      makeBtn('◀', -65, 0, 'left');
      makeBtn('▶', 65, 0, 'right');
    },

    // 生成障碍物 (权重随机 + 横向间距保证)
    _spawnObstacle: function () {
      var config = window.XINJIANG_LEVEL;
      var obstacles = config.obstacles;

      // 权重随机
      var totalW = 0;
      for (var i = 0; i < obstacles.length; i++) totalW += obstacles[i].weight;
      var r = Math.random() * totalW;
      var chosen = obstacles[0];
      for (var j = 0; j < obstacles.length; j++) {
        r -= obstacles[j].weight;
        if (r <= 0) { chosen = obstacles[j]; break; }
      }

      // 横向位置 (避免重叠)
      var x;
      var tries = 0;
      do {
        x = 80 + Math.random() * (CANVAS_W - 160);
        tries++;
        var ok = true;
        for (var k = 0; k < this.obstacles.length; k++) {
          var o = this.obstacles[k];
          if (Math.abs(o.x - x) < config.sliding.obstacleMinGap) { ok = false; break; }
        }
        if (ok) break;
      } while (tries < 8);

      // 障碍物初始 y = 屏幕顶部上方 80
      var ob = {
        id: chosen.id,
        emoji: chosen.emoji,
        size: chosen.size,
        x: x,
        y: -80,
        gfx: this.add.text(x, -80, chosen.emoji, {
          fontSize: chosen.size + 'px',
        }).setOrigin(0.5).setDepth(40),
      };
      this.obstacles.push(ob);
    },

    update: function () {
      if (this.state !== 'SLIDING') return;

      // 倒计时
      var elapsed = Date.now() - this.startTime;
      var timeLeft = Math.max(0, this.timeLeft - elapsed);
      this.timerText.setText('⏱️ ' + Math.ceil(timeLeft / 1000) + 's');

      // 距离进度 (基于 scrollY)
      var distance = Math.floor(this.scrollY);
      this.progressText.setText('📏 ' + distance + 'm');
      var config = window.XINJIANG_LEVEL.sliding;
      var progress = Math.min(1, this.scrollY / (config.finishY - config.startY));
      this.progressBar.width = progress * 380;

      if (timeLeft <= 0) {
        this._showFail('时间到！');
        return;
      }

      // 下滑加速 (越往下越快)
      this.scrollSpeed = Math.min(config.maxSpeed,
        config.initialSpeed + this.scrollY * 0.3);
      this.scrollY += this.scrollSpeed * 0.016;

      // 玩家位置: y 跟随 scrollY (视觉上是地图在滚动, 但简单实现是 player 向下)
      this.playerY = config.startY + this.scrollY;
      // 限制 y 在屏幕范围内
      this.playerY = Math.min(this.playerY, CANVAS_H - 40);

      // 左右移动
      var dx = 0;
      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;
      this.playerX += dx * config.moveSpeed * 0.016;
      this.playerX = Phaser.Math.Clamp(this.playerX, 40, CANVAS_W - 40);

      this.playerContainer.setPosition(this.playerX, this.playerY);

      // 翻转
      if (dx < 0) this.playerContainer.setScale(-1, 1);
      else if (dx > 0) this.playerContainer.setScale(1, 1);

      // 生成障碍物
      if (elapsed - (this.lastObstacleTime - this.startTime) > config.obstacleInterval) {
        this._spawnObstacle();
        this.lastObstacleTime = Date.now();
      }

      // 障碍物位置更新 (向下移动, 跟随滚动)
      for (var i = this.obstacles.length - 1; i >= 0; i--) {
        var ob = this.obstacles[i];
        ob.y += this.scrollSpeed * 0.016;
        ob.gfx.setPosition(ob.x, ob.y);

        // 移除屏幕外的
        if (ob.y > CANVAS_H + 80) {
          ob.gfx.destroy();
          this.obstacles.splice(i, 1);
          continue;
        }

        // 碰撞检测 (矩形 hitbox)
        var dx2 = ob.x - this.playerX;
        var dy2 = ob.y - this.playerY;
        var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist < (ob.size / 2 + 24)) {
          this._onCrash(ob);
        }
      }

      // 通关: scrollY 超过 finishY - startY
      if (this.scrollY >= (config.finishY - config.startY)) {
        this._showWin();
      }
    },

    _onCrash: function (ob) {
      this.crashCount++;
      this.crashText.setText('💥 撞墙 ' + this.crashCount);
      window.playXinjiangSfx('pickup', 0.3);  // 撞墙用 pickup 替代 (没专属 SFX)

      // 屏幕震动 + 减速度
      this.cameras.main.shake(150, 0.008);
      this.scrollSpeed = Math.max(80, this.scrollSpeed - 50);

      // 移除撞到的障碍
      ob.gfx.destroy();
      var idx = this.obstacles.indexOf(ob);
      if (idx >= 0) this.obstacles.splice(idx, 1);

      // 撞 5 次 = 失败
      if (this.crashCount >= 5) {
        this._showFail('撞太多次了！');
      }
    },

    _showFail: function (reason) {
      var self = this;
      if (this.state !== 'SLIDING') return;
      this.state = 'FAIL';

      var overlay = this.add.rectangle(640, 360, 600, 300, 0xC62828, 0.95);
      this.add.text(640, 280, '❌ 滑雪失败', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 340, reason, {
        fontSize: '20px', color: '#FFFFFF',
      }).setOrigin(0.5);

      var btn = this.add.rectangle(640, 420, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      this.add.text(640, 420, '再试一次', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.on('pointerdown', function () { self.scene.restart(); });
    },

    _showWin: function () {
      var self = this;
      if (this.state !== 'SLIDING') return;
      this.state = 'WIN';

      var overlay = this.add.rectangle(640, 360, 600, 320, 0x2E7D32, 0.95);
      this.add.text(640, 270, '🎿 抵达山脚！', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 330, '撞墙 ' + this.crashCount + ' 次 · 用时 ' + Math.ceil((Date.now() - this.startTime) / 1000) + ' 秒', {
        fontSize: '18px', color: '#FFFFFF',
      }).setOrigin(0.5);

      var btn = this.add.rectangle(640, 430, 240, 56, 0x4CAF50)
        .setInteractive({ useHandCursor: true });
      var btnText = this.add.text(640, 430, '购买补给', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.on('pointerdown', function () {
        try { self.scene.start('ShoppingScene'); }
        catch (e) {
          console.error('[xj] scene.start(ShoppingScene) threw:', e);
          window.location.reload();
        }
      });
      window.playXinjiangSfx('pickup', 0.5);
    },
  });

  // ============== ShoppingScene (购买补给) ==============
  var ShoppingScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ShoppingScene() { Phaser.Scene.call(this, { key: 'ShoppingScene' }); },
    create: function () {
      var self = this;
      var config = window.XINJIANG_LEVEL;

      this.cameras.main.setBackgroundColor('#E8F5E9');

      // 状态
      this.state = 'PLAYING';
      // Debug 模式: 满金币 + 物品满库存
      this.coins = isDebug ? 9999 : (parseInt(localStorage.getItem('silkroad_coins') || '0', 10) || 0);
      this.items = isDebug ? this._debugItems() : this.loadItems();
      // 从 kazakhstan 继承的物品自动加上
      if (!isDebug) {
        var kazItems = [];
        try {
          var raw = localStorage.getItem('silkroad_kazakhstan_items');
          if (raw) kazItems = JSON.parse(raw);
        } catch (e) { kazItems = []; }
        for (var ki = 0; ki < kazItems.length; ki++) {
          if (this.items.indexOf(kazItems[ki]) < 0) this.items.push(kazItems[ki]);
        }
      }

      // 地图
      this._drawMap();

      // 玩家
      this.playerX = config.map.playerStart.x;
      this.playerY = config.map.playerStart.y;
      this.playerContainer = this.add.container(this.playerX, this.playerY);
      this.playerContainer.setDepth(30);
      this._drawPlayer();

      // 商铺
      this.shops = [];
      for (var i = 0; i < config.shops.length; i++) {
        this._createShop(config.shops[i]);
      }

      // 出口
      this._createExit();

      // HUD
      this._createHUD();

      // 移动输入
      this.keys = { up: false, down: false, left: false, right: false };
      this._createJoystick();

      var onKeyDown = function (k) { return function () { self.keys[k] = true; }; };
      var onKeyUp = function (k) { return function () { self.keys[k] = false; }; };
      this.input.keyboard.on('keydown-UP', onKeyDown('up'));
      this.input.keyboard.on('keydown-DOWN', onKeyDown('down'));
      this.input.keyboard.on('keydown-LEFT', onKeyDown('left'));
      this.input.keyboard.on('keydown-RIGHT', onKeyDown('right'));
      this.input.keyboard.on('keydown-W', onKeyDown('up'));
      this.input.keyboard.on('keydown-S', onKeyDown('down'));
      this.input.keyboard.on('keydown-A', onKeyDown('left'));
      this.input.keyboard.on('keydown-D', onKeyDown('right'));
      this.input.keyboard.on('keyup-UP', onKeyUp('up'));
      this.input.keyboard.on('keydown-DOWN', onKeyDown('down'));
      this.input.keyboard.on('keyup-LEFT', onKeyUp('left'));
      this.input.keyboard.on('keyup-RIGHT', onKeyUp('right'));
      this.input.keyboard.on('keyup-W', onKeyUp('up'));
      this.input.keyboard.on('keyup-S', onKeyUp('up'));
      this.input.keyboard.on('keyup-A', onKeyUp('left'));
      this.input.keyboard.on('keyup-D', onKeyUp('right'));

      // 提示
      this.add.text(640, 80, '🎯 买 🍢 羊肉串 + 🔥 暖宝宝 → 去右下出口出发去成都', {
        fontSize: '14px', color: '#1B5E20', fontStyle: 'italic',
      }).setOrigin(0.5);

      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    _debugItems: function () {
      var ids = [];
      var shops = window.XINJIANG_LEVEL.shops;
      for (var i = 0; i < shops.length; i++) {
        var items = shops[i].items;
        for (var j = 0; j < items.length; j++) {
          if (ids.indexOf(items[j].id) < 0) ids.push(items[j].id);
        }
      }
      // 加上从 kazakhstan 继承的 (暖衣物 + 马奶酒)
      if (ids.indexOf('warm_clothes') < 0) ids.push('warm_clothes');
      if (ids.indexOf('kumis') < 0) ids.push('kumis');
      return ids;
    },

    loadItems: function () {
      try {
        return JSON.parse(localStorage.getItem('silkroad_xinjiang_items') || '[]');
      } catch (e) { return []; }
    },

    saveItems: function () {
      try {
        localStorage.setItem('silkroad_xinjiang_items', JSON.stringify(this.items));
      } catch (e) {}
    },

    saveCoins: function () {
      try {
        localStorage.setItem('silkroad_coins', String(this.coins));
      } catch (e) {}
    },

    _drawMap: function () {
      var g = this.add.graphics();

      // 雪山背景 (顶部)
      g.fillStyle(0xFFFFFF, 1);
      g.fillRect(0, 0, CANVAS_W, 200);
      g.fillStyle(0xB0BEC5, 0.5);
      g.fillTriangle(0, 200, 200, 50, 400, 200);
      g.fillTriangle(300, 200, 600, 30, 900, 200);
      g.fillTriangle(800, 200, 1100, 80, 1280, 200);

      // 草原 (底部)
      g.fillStyle(0x7CB342, 1);
      g.fillRect(0, 200, CANVAS_W, 520);

      // 草地纹理
      g.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 80; i++) {
        var x = Math.random() * CANVAS_W;
        var y = 220 + Math.random() * 480;
        g.fillRect(x, y, 20, 3);
      }

      // 道路 (右下出口方向)
      g.fillStyle(0xD7CCC8, 0.5);
      g.fillRect(900, 200, 200, 520);
    },

    _drawPlayer: function () {
      this.playerContainer.removeAll(true);

      var avatarId = null;
      try { avatarId = localStorage.getItem('silkroad_avatar'); } catch (e) {}
      if (!avatarId) avatarId = 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.85);
      avatar.setPosition(0, -8);
      this.playerContainer.add(avatar);

      // 雪板 (在脚下)
      var board = this.add.text(0, 16, '🎿', {
        fontSize: '28px',
      }).setOrigin(0.5);
      this.playerContainer.add(board);
    },

    _createShop: function (shopConfig) {
      var self = this;
      var shop = {
        config: shopConfig,
        gfx: this.add.graphics(),
        emojiText: null,
        hitZone: this.add.zone(shopConfig.x, shopConfig.y, 160, 160)
          .setInteractive({ useHandCursor: true }),
      };

      // 帐篷绘制
      var g = shop.gfx;
      var x = shopConfig.x;
      var y = shopConfig.y;
      // 帐篷主体 (赭红)
      g.fillStyle(0xD84315, 1);
      g.fillTriangle(x - 50, y + 25, x + 50, y + 25, x, y - 35);
      g.fillStyle(0xBF360C, 1);
      g.fillRect(x - 45, y + 25, 90, 18);
      g.lineStyle(3, 0x8D2C0A, 1);
      g.strokeTriangle(x - 50, y + 25, x + 50, y + 25, x, y - 35);
      // 招牌
      g.fillStyle(0xFFD54F, 1);
      g.fillCircle(x, y - 28, 14);
      g.lineStyle(1.5, 0x8D2C0A, 1);
      g.strokeCircle(x, y - 28, 14);

      // emoji 标签
      shop.emojiText = this.add.text(x, y - 28, shopConfig.emoji, {
        fontSize: '20px',
      }).setOrigin(0.5).setDepth(20);

      // 名字
      var nameText = this.add.text(x, y + 56, shopConfig.name, {
        fontSize: '12px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: '#5D2C20',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5).setDepth(20);

      // 点击
      shop.hitZone.on('pointerdown', function () {
        self._tryOpenShop(shopConfig);
      });

      this.shops.push(shop);
    },

    _createExit: function () {
      var self = this;
      var config = window.XINJIANG_LEVEL.departure;
      var x = config.exitZone.x;
      var y = config.exitZone.y;

      // 拱门
      this.exitGfx = this.add.graphics();
      this.exitGfx.fillStyle(0x8D6E63, 1);
      this.exitGfx.fillRoundedRect(x - 60, y - 30, 120, 100, 8);
      this.exitGfx.fillStyle(0x2A1606, 1);
      this.exitGfx.fillRect(x - 28, y + 10, 56, 60);
      this.exitGfx.beginPath();
      this.exitGfx.arc(x, y + 10, 28, Math.PI, 0, true);
      this.exitGfx.fillPath();
      this.exitGfx.fillStyle(0xC62828, 1);
      this.exitGfx.fillRoundedRect(x - 64, y - 50, 128, 22, 6);

      // 旗
      this.exitGfx.lineStyle(2, 0x4A2E1A, 1);
      this.exitGfx.lineBetween(x - 50, y - 50, x - 50, y - 90);
      this.exitGfx.fillStyle(0xC62828, 1);
      this.exitGfx.fillTriangle(x - 50, y - 90, x - 20, y - 80, x - 50, y - 70);

      // 标签
      this.exitLabel = this.add.text(x, y + 80, '🏠 → 成都', {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: 'rgba(198, 40, 40, 0.92)',
        padding: { x: 10, y: 5 },
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(20);

      this.exitSignText = this.add.text(x, y - 40, '成都驿站', {
        fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(20);

      // 出发按钮 (默认隐藏)
      this.exitBtn = this.add.text(x, y, '✨ 出发去成都！', {
        fontSize: '18px', color: '#2A1606', fontStyle: 'bold',
        backgroundColor: '#D4AF37',
        padding: { x: 14, y: 8 },
        stroke: '#8B6914', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(150).setVisible(false);
      this.exitBtn.setInteractive({ useHandCursor: true });
      this.exitBtn.on('pointerdown', function () { self.tryDepart(); });

      // 出口 hitZone
      var hitArea = this.add.circle(x, y, config.exitZone.radius, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitArea.on('pointerdown', function () {
        var dx = self.playerX - x;
        var dy = self.playerY - y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < config.exitZone.radius) {
          self.tryDepart();
        } else {
          self._showToast('太远了，走近一点', 0xFF9800);
        }
      });
    },

    _createHUD: function () {
      var self = this;
      // HUD 背景
      this.add.rectangle(640, 36, CANVAS_W, 72, 0x2A1606, 0.92);

      // 1. 💰 余额 (¥)
      this.coinText = this.add.text(180, 30, '💰 ' + this.coins + ' ¥', {
        fontSize: '16px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 2. 🧳 物品 (必需检查)
      this.luggageBtn = this.add.text(380, 30, this._luggageText(), {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.luggageBtn.setInteractive({ useHandCursor: true });
      this.luggageBtn.on('pointerdown', function () { self._openLuggageModal(); });

      // 3. 📋 必买清单
      this.questText = this.add.text(620, 30, this._questText(), {
        fontSize: '13px', color: '#FFEB3B', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 4. 🔊 BGM
      var bgmMuted = (localStorage.getItem('silkroad_bgm_muted') === '1');
      this.bgmBtn = this.add.text(1100, 30, bgmMuted ? '🔇' : '🔊', {
        fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 8, y: 2 },
      }).setOrigin(0.5);
      this.bgmBtn.setInteractive({ useHandCursor: true });
      this.bgmBtn.on('pointerdown', function () { self._toggleBgm(); });

      // 5. 🗺️
      this.worldMapBtn = this.add.text(1200, 30, '🗺️', {
        fontSize: '18px', color: '#F4ECD8',
      }).setOrigin(0.5);
      this.worldMapBtn.setInteractive({ useHandCursor: true });
      this.worldMapBtn.on('pointerdown', function () {
        window.location.href = '/games/silk-road/world-map';
      });
    },

    _luggageText: function () {
      var total = this.items.length;
      return '🧳 ' + total;
    },

    _questText: function () {
      var required = window.XINJIANG_LEVEL.departure.requiredItems;
      var have = 0;
      for (var i = 0; i < required.length; i++) {
        if (this.items.indexOf(required[i]) >= 0) have++;
      }
      return '📋 必买 ' + have + '/' + required.length;
    },

    _toggleBgm: function () {
      var muted = localStorage.getItem('silkroad_bgm_muted') === '1';
      muted = !muted;
      localStorage.setItem('silkroad_bgm_muted', muted ? '1' : '0');
      var bgm = document.getElementById('silk-road-bgm');
      if (bgm) bgm.muted = muted;
      if (this.bgmBtn) this.bgmBtn.setText(muted ? '🔇' : '🔊');
    },

    _openLuggageModal: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';

      if (this.currentModal) { this.currentModal.destroy(); this.currentModal = null; }

      var required = window.XINJIANG_LEVEL.departure.requiredItems;
      var requiredSet = {};
      for (var ri = 0; ri < required.length; ri++) requiredSet[required[ri]] = true;

      var modal = this.add.container(640, 360);
      modal.setDepth(2000);

      var backdrop = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x140C06, 0.55);
      modal.add(backdrop);
      var card = this.add.rectangle(0, 0, 700, 460, 0x2A1606, 1)
        .setStrokeStyle(2, 0xD4AF37, 0.7);
      modal.add(card);

      modal.add(this.add.text(0, -200, '🧳 我的行李', {
        fontSize: '24px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5));
      modal.add(this.add.text(0, -170, '已收集 ' + this.items.length + ' 件', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      if (this.items.length === 0) {
        modal.add(this.add.text(0, 30, '（行李箱空空如也）', {
          fontSize: '16px', color: '#F6B5C8', fontStyle: 'italic',
        }).setOrigin(0.5));
      } else {
        var rowH = 36;
        var visible = this.items.slice(0, 12);
        var startY = -(visible.length * rowH) / 2 + rowH / 2 - 30;
        for (var li = 0; li < visible.length; li++) {
          var id = visible[li];
          var info = self._getItemInfo(id);
          var isReq = !!requiredSet[id];
          var ry = startY + li * rowH;
          var rowBg = self.add.rectangle(0, ry, 620, rowH - 6,
            isReq ? 0x5C3A1E : 0x4A2E1A, 0.9)
            .setStrokeStyle(2, isReq ? 0xFFEB3B : 0x6B4423, isReq ? 0.8 : 0.4);
          modal.add(rowBg);
          var prefix = isReq ? '⭐ ' : '· ';
          modal.add(self.add.text(-280, ry, info.emoji, { fontSize: '20px' }).setOrigin(0.5));
          modal.add(self.add.text(-250, ry, prefix + info.name, {
            fontSize: '14px',
            color: isReq ? '#FFEB3B' : '#F4ECD8',
            fontStyle: 'bold',
          }).setOrigin(0, 0.5));
        }
      }

      var closeBg = self.add.rectangle(0, 195, 200, 50, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      modal.add(closeBg);
      modal.add(self.add.text(0, 195, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = self.add.zone(0, 195, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () {
        modal.destroy();
        if (self.currentModal === modal) self.currentModal = null;
        self.state = 'PLAYING';
      });
      modal.add(closeZone);

      this.currentModal = modal;
    },

    _getItemInfo: function (id) {
      var shops = window.XINJIANG_LEVEL.shops;
      for (var i = 0; i < shops.length; i++) {
        var items = shops[i].items;
        for (var j = 0; j < items.length; j++) {
          if (items[j].id === id) return { name: items[j].name, emoji: items[j].emoji };
        }
      }
      // kazakhstan 继承物
      if (id === 'warm_clothes') return { name: '保暖衣物', emoji: '🧥' };
      if (id === 'kumis') return { name: '马奶酒', emoji: '🥛' };
      return { name: String(id), emoji: '📦' };
    },

    _createJoystick: function () {
      var self = this;
      this.joystickContainer = this.add.container(140, CANVAS_H - 100);
      this.joystickContainer.setAlpha(0.72);
      this.joystickContainer.setScale(0.7);
      this.joystickContainer.setDepth(500);

      var dpadBg = this.add.graphics();
      dpadBg.fillStyle(0x2A1606, 0.55);
      dpadBg.fillCircle(0, 0, 100);
      this.joystickContainer.add(dpadBg);

      var makeDpadBtn = function (txt, dx, dy, key) {
        var bg = self.add.circle(dx, dy, 36, 0x2A1606, 0.85)
          .setStrokeStyle(2, 0xFFD98A, 0.7);
        var arrow = self.add.text(dx, dy, txt, {
          fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0.5);
        var zone = self.add.zone(dx, dy, 76, 76).setInteractive({ useHandCursor: true });
        var press = function () {
          self.keys[key] = true;
          bg.setFillStyle(0xFFD98A, 0.95);
          arrow.setColor('#2A190E');
          window.playXinjiangSfx('click', 0.3);
        };
        var release = function () {
          self.keys[key] = false;
          bg.setFillStyle(0x2A1606, 0.85);
          arrow.setColor('#FFD98A');
        };
        zone.on('pointerdown', press);
        zone.on('pointerup', release);
        zone.on('pointerout', release);
        self.joystickContainer.add([bg, arrow, zone]);
      };
      makeDpadBtn('▲', 0, -65, 'up');
      makeDpadBtn('▼', 0, 65, 'down');
      makeDpadBtn('◀', -65, 0, 'left');
      makeDpadBtn('▶', 65, 0, 'right');
    },

    _tryOpenShop: function (shopConfig) {
      if (this.state !== 'PLAYING') return;
      var dx = this.playerX - shopConfig.x;
      var dy = this.playerY - shopConfig.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 90) {
        this._showToast('太远了，走近一点', 0xFF9800);
        return;
      }
      this._openShopModal(shopConfig);
    },

    _openShopModal: function (shopConfig) {
      var self = this;
      this.state = 'MODAL';

      if (this.currentModal) { this.currentModal.destroy(); this.currentModal = null; }

      var modal = this.add.container(640, 360);
      modal.setDepth(2000);

      var bg = this.add.rectangle(0, 0, 700, 480, 0x5D2C20, 0.95);
      modal.add(bg);

      modal.add(this.add.text(0, -200, shopConfig.emoji + ' ' + shopConfig.name, {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5));

      modal.add(this.add.text(0, -160, '💰 当前余额: ' + this.coins + ' ¥', {
        fontSize: '16px', color: '#FFEB3B', fontStyle: 'bold',
      }).setOrigin(0.5));

      var itemY = -90;
      for (var i = 0; i < shopConfig.items.length; i++) {
        var item = shopConfig.items[i];
        var card = this.add.rectangle(0, itemY, 600, 80, 0x3E1F0E, 0.9);
        modal.add(card);

        modal.add(this.add.text(-250, itemY - 12, item.emoji + ' ' + item.name, {
          fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0, 0.5));

        modal.add(this.add.text(-250, itemY + 14, item.desc + (item.required ? '  (必需)' : ''), {
          fontSize: '13px', color: item.required ? '#FFEB3B' : '#FFCCBC',
        }).setOrigin(0, 0.5));

        modal.add(this.add.text(150, itemY, item.price + ' ¥', {
          fontSize: '20px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0, 0.5));

        var owned = this.items.indexOf(item.id) >= 0;
        var btnBg = this.add.rectangle(240, itemY, 90, 36, owned ? 0x6B4423 : 0x4CAF50);
        modal.add(btnBg);

        modal.add(this.add.text(240, itemY, owned ? '已买' : '购买', {
          fontSize: '14px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5));

        if (!owned) {
          (function (itemId, price) {
            btnBg.setInteractive({ useHandCursor: true });
            btnBg.on('pointerdown', function () {
              self._buyItem(itemId, price);
            });
          })(item.id, item.price);
        }

        itemY += 100;
      }

      var closeBg = this.add.rectangle(0, 195, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      modal.add(this.add.text(0, 195, '关闭', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5));
      closeBg.on('pointerdown', function () {
        modal.destroy();
        self.currentModal = null;
        self.state = 'PLAYING';
      });

      this.currentModal = modal;
    },

    _buyItem: function (itemId, price) {
      if (this.coins < price) {
        this._showToast('钱不够！', 0xFF5722);
        return;
      }
      if (this.items.indexOf(itemId) >= 0) {
        this._showToast('已经有了', 0xFF9800);
        return;
      }
      this.coins -= price;
      this.items.push(itemId);
      this.saveItems();
      this.saveCoins();

      window.playXinjiangSfx('pickup', 0.5);
      this._showToast('✅ 购买成功', 0x4CAF50);

      this._updateHUD();

      if (this.currentModal) {
        this.currentModal.destroy();
        this.currentModal = null;
      }
      this.state = 'PLAYING';
    },

    _updateHUD: function () {
      if (this.coinText) this.coinText.setText('💰 ' + this.coins + ' ¥');
      if (this.luggageBtn) this.luggageBtn.setText(this._luggageText());
      if (this.questText) this.questText.setText(this._questText());
    },

    _updateExitButton: function () {
      if (!this.exitBtn) return;
      if (this.state !== 'PLAYING') {
        this.exitBtn.setVisible(false);
        return;
      }
      var config = window.XINJIANG_LEVEL.departure;
      var dx = this.playerX - config.exitZone.x;
      var dy = this.playerY - config.exitZone.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var inRange = dist < config.exitZone.radius;
      var required = config.requiredItems;
      var hasAll = true;
      for (var i = 0; i < required.length; i++) {
        if (this.items.indexOf(required[i]) < 0) { hasAll = false; break; }
      }
      var ready = inRange && hasAll;
      this.exitBtn.setVisible(ready);
    },

    tryDepart: function () {
      var required = window.XINJIANG_LEVEL.departure.requiredItems;
      var missing = [];
      for (var i = 0; i < required.length; i++) {
        if (this.items.indexOf(required[i]) < 0) missing.push(required[i]);
      }
      if (missing.length > 0) {
        this._showToast('还差 ' + missing.length + ' 件必需品！', 0xFF5722);
        return;
      }

      this.state = 'DEPARTING';
      // 隐藏 HUD
      if (this.playerContainer) this.playerContainer.setVisible(false);
      if (this.joystickContainer) this.joystickContainer.setVisible(false);
      if (this.exitBtn) this.exitBtn.setVisible(false);
      if (this.exitLabel) this.exitLabel.setVisible(false);
      if (this.exitSignText) this.exitSignText.setVisible(false);

      // 写通关状态
      try {
        var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
        if (cleared.indexOf(4) < 0) {
          cleared.push(4);
          localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
        }
      } catch (e) {}

      this.scene.start('DepartScene');
    },

    _showToast: function (msg, color) {
      var toast = this.add.text(640, 120, msg, {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
        padding: { x: 18, y: 10 },
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

      var speed = window.XINJIANG_LEVEL.movement.walkSpeed;
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
        this.playerX = Phaser.Math.Clamp(this.playerX, 50, CANVAS_W - 50);
        this.playerY = Phaser.Math.Clamp(this.playerY, 100, CANVAS_H - 50);

        this.playerContainer.setPosition(this.playerX, this.playerY);

        if (dx < 0) this.playerContainer.setScale(-1, 1);
        else if (dx > 0) this.playerContainer.setScale(1, 1);
      }

      this._updateExitButton();
    },
  });

  // ============== 游戏初始化 ==============
  var config = {
    type: Phaser.AUTO,
    width: CANVAS_W,
    height: CANVAS_H,
    parent: 'game-container',
    render: {
      preserveDrawingBuffer: true
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, SlidingScene, ShoppingScene, DepartScene]
  };

  var game = new Phaser.Game(config);
  if (typeof window !== 'undefined') window.__xinjiangGame = game;

  // 全屏按钮
  var fsBtn = document.getElementById('xinjiang-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      if (game.scale.isFullscreen) game.scale.stopFullscreen();
      else game.scale.startFullscreen();
    });
  }

  // 竖屏提示
  function checkOrientation() {
    var lock = document.getElementById('orientation-lock');
    if (!lock) return;
    if (window.innerHeight > window.innerWidth) lock.style.display = 'flex';
    else lock.style.display = 'none';
  }
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

})();