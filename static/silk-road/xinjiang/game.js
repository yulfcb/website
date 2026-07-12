// 新疆·天山滑雪 —— 关卡 4 游戏引擎
//
// v2 (2026-07-12) — 砍掉 ShoppingScene, 重点打磨滑雪剧情
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 一路下滑到成都
//   BootScene → SlidingScene (重点剧情: 15s 滑雪 + 飘雪 + 滑痕 + NPC) → DepartScene → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (pointerdown/up + 虚拟方向键)
//
// localStorage 写入 (通关时):
//   silkroad_cleared_levels 追加 4

(function () {
  'use strict';

  var CANVAS_W = 1280;
  var CANVAS_H = 720;

  // ============== Debug 模式 (?debug=1) ==============
  // 跳过 SlidingScene 倒计时, 自动通关进 DepartScene (Hermes 验证用)
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
  };// ============== DepartScene (出发去成都) ==============
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
      });// —— 地面 (RGB lerp: 雪山白 0xFFFFFF → 成都暖橙 0xFDE2C5) ——
      var ground = this.add.graphics();
      ground.setDepth(10);
      var drawGround = function (progress) {
        ground.clear();
        var r = Math.round(0xFF + (0xFD - 0xFF) * progress);
        var g = Math.round(0xFF + (0xE2 - 0xFF) * progress);
        var b = Math.round(0xFF + (0xC5 - 0xFF) * progress);
        var groundColor = (r << 16) | (g << 8) | b;
        ground.fillStyle(groundColor, 1);
        ground.fillRect(0, 600, CANVAS_W, 200);
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
      drawGround(0);// —— 雪山 (从地平线升起, alpha 0→0.7) ——
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
      drawMountains(0);// —— 滑雪角色 (跟随三段路径) ——
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
      }).setOrigin(0.5);// —— 三阶段动画 + RGB lerp (setInterval 16ms 60fps) ——
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
        if (elapsed > totalDur + 500) elapsed = totalDur;var curX, curY, bgProg, riseProg;
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
        drawMountains(riseProg);if (elapsed >= totalDur) {
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
      this.input.keyboard.once('keydown-ENTER', function () { self._goNextLevel(); });// —— Scene shutdown 清理 ——
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
      }).setOrigin(0.5).setDepth(1001);var continueZone = this.add.zone(btnX, btnY, 200, 60)
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
      document.body.appendChild(this._continueDomBtn);var positionBtn = function () {
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
  });// ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#B3E5FC');

      // URL ?debug=1 → 自动通关 (跳过 SlidingScene 倒计时, 直接进 DepartScene)
      if (isDebug) {
        console.log('[xj] BootScene debug=1 detected, auto-completing SlidingScene');
        this.add.text(640, 360, '新疆·天山滑雪\n[debug 跳过]', {
          fontSize: '22px', color: '#1565C0', fontStyle: 'bold', align: 'center',
        }).setOrigin(0.5);
        this.time.delayedCall(300, function () { self.scene.start('DepartScene'); }, [], this);
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
      // 兜底 setTimeout (Phaser clock 在 headless 可能慢)
      setTimeout(function () {
        try {
          if (self.scene.isActive()) self.scene.start('SlidingScene');
        } catch (e) { console.error('[xj] fallback scene.start threw:', e); }
      }, 1500);
    }
  });// ============== SlidingScene (下滑场景 — 重点剧情) ==============
  // 玩家自动从屏幕顶部向下滑行, 按 ← → 键左右移动, 避开松树/岩石, 15 秒内到屏幕底部 = 通关
  // v2 新增: 开场山巅远眺 + 飘雪粒子 + 滑痕轨迹 + 友好 NPC
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

      // 滑痕轨迹数组 (v2 新增)
      this.trails = [];
      this.lastTrailTime = Date.now();

      // 背景绘制
      this._drawBackground();

      // v2: 开场山巅远眺 (0.8s fade in + fade out)
      this._playIntro();// 玩家容器
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
      }).setOrigin(0.5).setDepth(100);// v2: 飘雪粒子系统 (Phaser Graphics particles)
      this._initSnowParticles();

      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    // ===== v2: 开场山巅远眺 =====
    _playIntro: function () {
      var self = this;
      var introDur = window.XINJIANG_LEVEL.sliding.introDuration;

      // 远景雪山轮廓 (临时)
      var farMtn = this.add.graphics();
      farMtn.setDepth(60);
      farMtn.fillStyle(0xFFFFFF, 0.6);
      farMtn.fillTriangle(0, 280, 200, 80, 400, 280);
      farMtn.fillTriangle(300, 280, 600, 60, 900, 280);
      farMtn.fillTriangle(800, 280, 1100, 100, 1280, 280);
      farMtn.fillStyle(0xB0BEC5, 0.3);
      farMtn.fillTriangle(0, 280, 200, 180, 400, 280);
      farMtn.fillTriangle(300, 280, 600, 160, 900, 280);
      farMtn.fillTriangle(800, 280, 1100, 200, 1280, 280);

      // 标题文字
      var titleText = this.add.text(640, 360, '🏔️ 新疆·天山', {
        fontSize: '52px', color: '#0D47A1', fontStyle: 'bold',
        stroke: '#FFFFFF', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(150).setAlpha(0);

      var subtitleText = this.add.text(640, 420, '从山巅一路滑向成都', {
        fontSize: '20px', color: '#1565C0', fontStyle: 'italic',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setDepth(150).setAlpha(0);// Fade in (0 → 0.6s)
      this.tweens.add({
        targets: [farMtn, titleText, subtitleText],
        alpha: { 0: 1 },
        duration: introDur / 2,
        onComplete: function () {
          // Fade out (0.6 → 0.8s)
          self.tweens.add({
            targets: [farMtn, titleText, subtitleText],
            alpha: 0,
            duration: introDur / 2,
            onComplete: function () {
              farMtn.destroy();
              titleText.destroy();
              subtitleText.destroy();
            }
          });
        }
      });

      // 冻结玩家输入 + 不计时间, 直到 intro 结束
      // 用 setTimeout (wall clock) 而非 this.time.delayedCall (Phaser clock 在 headless 可能慢)
      this._introLock = true;
      setTimeout(function () { self._introLock = false; }, introDur);
    },

    // ===== v2: 飘雪粒子系统 =====
    _initSnowParticles: function () {
      var self = this;
      this._snowParticles = [];
      this._lastSnowSpawn = Date.now();

      // 粒子容器 (Graphics, 性能好)
      this._snowGfx = this.add.graphics();
      this._snowGfx.setDepth(45);
    },

    _spawnSnowParticle: function () {
      // 在屏幕顶部随机 x, 速度随玩家同步
      var self = this;
      var config = window.XINJIANG_LEVEL.sliding;
      var speedFactor = Math.max(0.6, this.scrollSpeed / config.initialSpeed);
      var p = {
        x: Math.random() * CANVAS_W,
        y: -10 - Math.random() * 40,
        vy: (60 + Math.random() * 60) * speedFactor,
        vx: (Math.random() - 0.5) * 30,
        size: 4 + Math.random() * 6,
        alpha: 0.5 + Math.random() * 0.4,
        shape: Math.random() < 0.4 ? 'circle' : 'diamond',
      };
      this._snowParticles.push(p);
    },_updateSnowParticles: function () {
      if (!this._snowGfx) return;
      var config = window.XINJIANG_LEVEL.sliding;

      // 1. 生成新粒子 (终点附近变密)
      var now = Date.now();
      var progress = Math.min(1, this.scrollY / (config.finishY - config.startY));
      var interval = config.snowParticleRate * (1 - progress * 0.4);  // 越往下越密
      if (now - this._lastSnowSpawn > interval) {
        this._spawnSnowParticle();
        // 终点附近一次生 2 个
        if (progress > 0.6 && Math.random() < 0.5) this._spawnSnowParticle();
        this._lastSnowSpawn = now;
      }

      // 2. 更新位置 + 3. 绘制
      this._snowGfx.clear();
      for (var i = this._snowParticles.length - 1; i >= 0; i--) {
        var p = this._snowParticles[i];
        p.y += p.vy * 0.016;
        p.x += p.vx * 0.016;
        // 移除屏幕外的
        if (p.y > CANVAS_H + 20 || p.x < -20 || p.x > CANVAS_W + 20) {
          this._snowParticles.splice(i, 1);
          continue;
        }
        this._snowGfx.fillStyle(0xFFFFFF, p.alpha);
        if (p.shape === 'circle') {
          this._snowGfx.fillCircle(p.x, p.y, p.size / 2);
        } else {
          this._snowGfx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
    },// ===== v2: 滑痕轨迹 (玩家身后 1.5s 衰减) =====
    _spawnTrail: function () {
      var config = window.XINJIANG_LEVEL.sliding;
      this.trails.push({
        x: this.playerX,
        y: this.playerY + 22,  // 雪板位置
        size: 6 + Math.random() * 4,
        bornAt: Date.now(),
      });
      // 限制最大数量
      if (this.trails.length > 40) this.trails.shift();
    },

    _updateTrails: function () {
      if (!this.trails || this.trails.length === 0) return;
      var config = window.XINJIANG_LEVEL.sliding;
      var now = Date.now();
      var fadeMs = config.snowTrailFadeMs;

      // 在 background 上层 (depth 20) 绘制
      if (!this._trailGfx) {
        this._trailGfx = this.add.graphics();
        this._trailGfx.setDepth(20);
      }
      this._trailGfx.clear();

      for (var i = this.trails.length - 1; i >= 0; i--) {
        var t = this.trails[i];
        var age = now - t.bornAt;
        if (age > fadeMs) {
          this.trails.splice(i, 1);
          continue;
        }
        var alpha = (1 - age / fadeMs) * 0.7;
        this._trailGfx.fillStyle(0xFFFFFF, alpha);
        this._trailGfx.fillCircle(t.x, t.y, t.size / 2);
      }
    },_drawBackground: function () {
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
    },_drawPlayer: function () {
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
      }).setOrigin(0.5);// 进度条背景
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
    },// 生成障碍物 (权重随机 + 横向间距保证 + v2 NPC 类型)
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
      // NPC 加一圈光晕
      if (chosen.id === 'friendly_npc') {
        ob.glow = this.add.circle(x, -80, chosen.size * 0.8, 0xFFD54F, 0.35)
          .setDepth(39);
      }
      this.obstacles.push(ob);
    },update: function () {
      if (this.state !== 'SLIDING') return;
      if (this._introLock) return;  // v2: 开场期间不更新

      var config = window.XINJIANG_LEVEL.sliding;

      // 倒计时
      var elapsed = Date.now() - this.startTime;
      var timeLeft = Math.max(0, this.timeLeft - elapsed);
      this.timerText.setText('⏱️ ' + Math.ceil(timeLeft / 1000) + 's');

      // 距离进度
      var distance = Math.floor(this.scrollY);
      this.progressText.setText('📏 ' + distance + 'm');
      var progress = Math.min(1, this.scrollY / (config.finishY - config.startY));
      this.progressBar.width = progress * 380;

      if (timeLeft <= 0) {
        this._showFail('时间到！');
        return;
      }

      // 下滑加速
      this.scrollSpeed = Math.min(config.maxSpeed,
        config.initialSpeed + this.scrollY * 0.3);
      this.scrollY += this.scrollSpeed * 0.016;

      // 玩家位置
      this.playerY = config.startY + this.scrollY;
      this.playerY = Math.min(this.playerY, CANVAS_H - 40);// 左右移动
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

      // v2: 滑痕采样 (每 50ms 一次)
      if (Date.now() - this.lastTrailTime > config.snowTrailInterval) {
        this._spawnTrail();
        this.lastTrailTime = Date.now();
      }
      this._updateTrails();
      this._updateSnowParticles();// 障碍物位置更新
      for (var i = this.obstacles.length - 1; i >= 0; i--) {
        var ob = this.obstacles[i];
        ob.y += this.scrollSpeed * 0.016;
        ob.gfx.setPosition(ob.x, ob.y);
        if (ob.glow) ob.glow.setPosition(ob.x, ob.y);

        // 移除屏幕外的
        if (ob.y > CANVAS_H + 80) {
          ob.gfx.destroy();
          if (ob.glow) ob.glow.destroy();
          this.obstacles.splice(i, 1);
          continue;
        }

        // 碰撞检测
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
    },_onCrash: function (ob) {
      // v2: 友好 NPC 撞到 = 加时间 + toast, 不算撞墙
      if (ob.id === 'friendly_npc') {
        var config = window.XINJIANG_LEVEL.sliding;
        this.timeLeft += config.npcBonusTime;
        this.timerText.setText('⏱️ ' + Math.ceil(this.timeLeft / 1000) + 's');
        window.playXinjiangSfx('pickup', 0.4);
        // 移除 NPC + toast
        ob.gfx.destroy();
        if (ob.glow) ob.glow.destroy();
        var idx = this.obstacles.indexOf(ob);
        if (idx >= 0) this.obstacles.splice(idx, 1);
        this._showToast('👨‍🌾 牧民送你一段！+1s', 0xD2691E);
        return;
      }

      this.crashCount++;
      this.crashText.setText('💥 撞墙 ' + this.crashCount);
      window.playXinjiangSfx('pickup', 0.3);

      // 屏幕震动 + 减速度
      this.cameras.main.shake(150, 0.008);
      this.scrollSpeed = Math.max(80, this.scrollSpeed - 50);

      // 移除撞到的障碍
      ob.gfx.destroy();
      if (ob.glow) ob.glow.destroy();
      var idx2 = this.obstacles.indexOf(ob);
      if (idx2 >= 0) this.obstacles.splice(idx2, 1);

      // 撞 5 次 = 失败
      if (this.crashCount >= 5) {
        this._showFail('撞太多次了！');
      }
    },_showFail: function (reason) {
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

    // ===== v2 增强: 通关界面 =====
    _showWin: function () {
      var self = this;
      if (this.state !== 'SLIDING') return;
      this.state = 'WIN';

      var elapsed = Math.ceil((Date.now() - this.startTime) / 1000);
      // 写通关状态
      try {
        var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
        if (cleared.indexOf(4) < 0) {
          cleared.push(4);
          localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
        }
      } catch (e) {}// 半透明遮罩
      var overlay = this.add.rectangle(640, 360, 1280, 720, 0x0D47A1, 0.85);

      // 大字主标题
      this.add.text(640, 220, '🎿 一路下滑到成都！', {
        fontSize: '44px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#1B5E20', strokeThickness: 4,
      }).setOrigin(0.5);

      // 副标题: 撞墙 + 用时
      this.add.text(640, 290, '撞墙 ' + this.crashCount + ' 次 · 用时 ' + elapsed + ' 秒', {
        fontSize: '22px', color: '#FFFFFF',
      }).setOrigin(0.5);

      // 副副标题: 家人
      this.add.text(640, 340, '👨‍👩‍👧 家人已在成都等你', {
        fontSize: '20px', color: '#FFE9B0', fontStyle: 'italic',
      }).setOrigin(0.5);

      // 金黄色出发按钮
      var btnW = 280, btnH = 70;
      var btnX = 640, btnY = 450;
      var btnGlow = this.add.rectangle(btnX, btnY, btnW + 12, btnH + 12, 0xFFE082, 0.6)
        .setDepth(998);
      var btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0xD4AF37, 1)
        .setStrokeStyle(4, 0x8B6914, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(999);
      var btnText = this.add.text(btnX, btnY, '✨ 出发去成都', {
        fontSize: '26px', color: '#2A1606', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(1000);// 按钮发光 + 缩放动画
      this.tweens.add({
        targets: btnGlow,
        alpha: { 0.3: 0.8 },
        scaleX: { 1: 1.06 },
        scaleY: { 1: 1.06 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      var goDepart = function () {
        try { self.scene.start('DepartScene'); }
        catch (e) {
          console.error('[xj] scene.start(DepartScene) threw:', e);
          window.location.reload();
        }
      };
      btnBg.on('pointerdown', goDepart);
      btnBg.on('pointerover', function () { btnBg.setFillStyle(0xFFD54F, 1); });
      btnBg.on('pointerout', function () { btnBg.setFillStyle(0xD4AF37, 1); });

      // 键盘回车/空格
      this.input.keyboard.once('keydown-SPACE', goDepart);
      this.input.keyboard.once('keydown-ENTER', goDepart);

      window.playXinjiangSfx('voyage', 0.5);
    },

    // Toast 提示 (NPC 加时间用)
    _showToast: function (msg, color) {
      var toast = this.add.text(640, 130, msg, {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: '#' + color.toString(16).padStart(6, '0'),
        padding: { x: 18, y: 10 },
      }).setOrigin(0.5).setDepth(1000);

      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 90,
        duration: 1500,
        onComplete: function () { toast.destroy(); }
      });
    },
  });// ============== 游戏初始化 ==============
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
    scene: [BootScene, SlidingScene, DepartScene]
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