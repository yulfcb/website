// 卡塔尔·多哈·沙海寻路 —— 游戏引擎（M8 Phaser 3 重做）
//
// 重做原因（M5/M6/M7 Pixi 实现反复"卡屏 / 方向键无反应 / z-index 混乱"）：
//   Phaser 自带 scene manager + Arcade physics + 标准 virtual joystick 模式
//   + 内置 touch/keyboard + 内置 scene 容器 z-order，
//   从根上避免 Pixi DOM overlay 与 canvas z-index 冲突。
//
// 状态机：Boot → Intro → Play (PLAYING|PICKUP|RESULT|DEAD) → Result → 跳转 level/1
//
// 真实接口（与 M5 一致，不改动）：
//   /api/game/reward/claim —— 通关领奖（PERFECT/NORMAL/HARD 三档）
//   /api/game/secret      —— 渴死复活（只发秘密，不调 reward）
//   /api/game/session     —— session 兜底
//
// 关 0 → 关 1：HTML 跳（window.location.href），不用 Phaser 控制 URL。

(function () {
  'use strict';

  // —— 静态数据 ——
  var L = window.QATAR_LEVEL;
  if (!L) {
    console.error('[qatar-m8] window.QATAR_LEVEL missing, abort');
    return;
  }
  var LEVEL_ID = 0;

  // 4 档奖励（前端查表；金额与服务端 QATAR_REWARD_TIERS 一致）
  var QATAR_REWARD_TIERS = {
    PERFECT: 20.20,
    NORMAL:  13.14,
    HARD:    6.66,
    DEAD:    0,
  };

  // —— session / nickname ——
  var nickname = (localStorage.getItem('silkroad_nickname') || '小卡').slice(0, 20);
  var SESSION_ID = localStorage.getItem('silkroad_session_id') || '';
  var alreadyClaimed = !!SESSION_ID &&
    localStorage.getItem('silkroad_claimed_' + SESSION_ID + '_' + LEVEL_ID) === '1';

  // ==================== BootScene ====================
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      this.cameras.main.setBackgroundColor('#1b2135');
      this.add.text(640, 360, '加载中…', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      // 短暂延迟 → IntroScene（保留 0 ms 也行；这里 30 ms 让浏览器渲一帧）
      this.time.delayedCall(30, function () {
        this.scene.start('IntroScene', { sessionId: SESSION_ID, nickname: nickname });
      }, this);
    },
  });

  // ==================== IntroScene ====================
  var IntroScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function IntroScene() { Phaser.Scene.call(this, { key: 'IntroScene' }); },
    init: function (data) {
      this.sessionId = (data && data.sessionId) || SESSION_ID;
      this.nickname = (data && data.nickname) || nickname;
    },
    create: function () {
      this.cameras.main.setBackgroundColor('#1b2135');

      // 沙金渐变条
      var grad = this.add.graphics();
      grad.fillGradientStyle(0xC49A5E, 0xC49A5E, 0x6B4423, 0x6B4423, 1);
      grad.fillRect(0, 0, 1280, 60);

      // NPC banner
      var card = this.add.rectangle(640, 280, 880, 220, 0x4A2E1A, 0.95)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.add.text(360, 280, '👳', { fontSize: '64px' }).setOrigin(0.5);
      this.add.text(640, 240, '老商人 · 帧 1', {
        fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(720, 300, L.npcFrames[0], {
        fontSize: '18px', color: '#F4ECD8', fontStyle: 'italic',
        wordWrap: { width: 460 },
      }).setOrigin(0.5);

      // 标题
      this.add.text(640, 100, '关卡 0 · 起航·多哈沙海', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 140, '丝绸之路 · 陆上', {
        fontSize: '14px', color: '#A8D8C0',
      }).setOrigin(0.5);

      // 开始按钮
      var btnBg = this.add.rectangle(640, 500, 280, 80, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.add.text(640, 500, '开 始', {
        fontSize: '32px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(640, 500, 280, 80).setInteractive({ useHandCursor: true });
      var self = this;
      btnZone.on('pointerdown', function () {
        self.scene.start('PlayScene', {
          sessionId: self.sessionId, nickname: self.nickname,
        });
      });

      // 底部提示
      this.add.text(640, 640, '提示：触屏使用左下方向键 · 键盘使用方向键或 WASD', {
        fontSize: '13px', color: '#C9B89A',
      }).setOrigin(0.5);
    },
  });

  // ==================== PlayScene ====================
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    init: function (data) {
      this.sessionId = (data && data.sessionId) || SESSION_ID;
      this.nickname = (data && data.nickname) || nickname;
    },
    create: function () {
      var self = this;

      // —— 沙金背景 ——
      this.cameras.main.setBackgroundColor('#E8C282');

      // —— 沙丘（远景 3 层，用 Graphics 模拟）——
      this.drawDunes(0xD4A86A, 360, 40);
      this.drawDunes(0xC49A5E, 460, 60);
      this.drawDunes(0xB58A55, 560, 90);

      // —— 6 个地名 chip ——
      this.placeSprites = [];
      L.places.forEach(function (p) {
        var w = Math.max(140, p.label.length * 9 + 24);
        var bg = self.add.graphics();
        bg.fillStyle(0xFFFFFF, 0.92);
        bg.fillRoundedRect(-w / 2, -16, w, 32, 6);
        bg.fillStyle(0x4A2E1A, 0.15);
        bg.fillRoundedRect(-w / 2, 14, w, 2, 1);
        var t = self.add.text(0, 0, p.label, {
          fontSize: '12px', color: '#4A2E1A', fontStyle: 'bold',
        }).setOrigin(0.5);
        var chip = self.add.container(p.x, p.y, [bg, t]);
        self.placeSprites.push(chip);
      });

      // —— 2 个绿洲 ——
      this.oasisSprites = [];
      L.oases.forEach(function (o) {
        var halo = self.add.graphics();
        halo.fillStyle(0x6EC1E4, 0.35);
        halo.fillCircle(0, 0, 26);
        var palm = self.add.text(0, 0, '🌴', { fontSize: '32px' }).setOrigin(0.5);
        var label = self.add.text(0, 22, o.label, {
          fontSize: '11px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5);
        var oasis = self.add.container(o.x, o.y, [halo, palm, label]);
        oasis.oasisData = o;
        self.oasisSprites.push(oasis);
      });

      // —— 6 个礼物 ——
      this.giftSprites = [];
      L.gifts.forEach(function (g) {
        var glow = self.add.graphics();
        glow.fillStyle(0xFFD98A, 0.35);
        glow.fillCircle(0, 0, 22);
        var bag = self.add.text(0, 0, g.emoji, { fontSize: '32px' }).setOrigin(0.5);
        var label = self.add.text(0, 22, g.name, {
          fontSize: '11px', color: '#4A2E1A', fontStyle: 'bold',
        }).setOrigin(0.5);
        var sprite = self.add.container(g.x, g.y, [glow, bag, label]);
        sprite.giftData = g;
        sprite.collected = false;
        sprite.bobPhase = Math.random() * Math.PI * 2;
        self.giftSprites.push(sprite);
      });

      // —— 老商人 NPC ——
      var mBg = this.add.graphics();
      mBg.fillStyle(0x8B4513, 0.3);
      mBg.fillCircle(0, 0, 18);
      var mEmoji = this.add.text(0, 0, L.merchant.emoji, { fontSize: '28px' }).setOrigin(0.5);
      this.merchantSprite = this.add.container(L.merchant.x, L.merchant.y, [mBg, mEmoji]);

      // —— 玩家 ——
      var camel = this.add.text(-30, 5, '🐪', { fontSize: '38px' }).setOrigin(0.5);
      var elf = this.add.text(0, 0, '🧝', { fontSize: '44px' }).setOrigin(0.5);
      this.playerContainer = this.add.container(L.start.x, L.start.y, [camel, elf]);
      this.playerSprite = { camel: camel, elf: elf };

      // —— 状态 ——
      this.player = { x: L.start.x, y: L.start.y, facing: 1, lastMoveAt: 0, walkPhase: 0 };
      this.water = L.WATER_MAX;
      this.pickupCount = 0;
      this.luggageCount = 0;
      this.giftBuckets = {};
      this.currentGiftId = null;
      this.state = 'PLAYING';          // PLAYING | PICKUP | RESULT | DEAD
      this.paused = false;
      this.moveCount = 0;
      this.merchantShown = false;
      this.npcFrame = 0;
      this.npcShownPickup3 = false;

      // —— HUD（顶部条 + NPC 文字）——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x4A2E1A, 0.92);
      this.waterText = this.add.text(180, 30, '💧 水分 ' + this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.pickupText = this.add.text(640, 30, '🎁 拾起 ' + this.pickupCount + ' / 6', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.luggageText = this.add.text(1100, 30, '🧳 行李 ' + this.luggageCount + ' / ' + L.LUGGAGE_MAX, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.npcText = this.add.text(640, 80, L.npcFrames[0], {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5);

      // —— 虚拟方向键（左下 Phaser Container）——
      this.keys = { up: false, down: false, left: false, right: false };
      this.joystickContainer = this.add.container(180, 600);

      var dpadBg = this.add.graphics();
      dpadBg.fillStyle(0x4A2E1A, 0.55);
      dpadBg.fillCircle(0, 0, 115);
      this.joystickContainer.add(dpadBg);

      this.joystickBtns = {};
      var makeDpadBtn = function (txt, dx, dy, key) {
        var bg = self.add.circle(dx, dy, 40, 0x4A2E1A, 0.85)
          .setStrokeStyle(2, 0xFFD98A, 0.7);
        var arrow = self.add.text(dx, dy, txt, {
          fontSize: '30px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0.5);
        var zone = self.add.zone(dx, dy, 80, 80).setInteractive({ useHandCursor: true });
        var press = function () {
          self.keys[key] = true;
          bg.setFillStyle(0xFFD98A, 0.95);
          arrow.setColor('#2A190E');
          self.tryMove(key);
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
      makeDpadBtn('▲', 0, -75, 'up');
      makeDpadBtn('▼', 0, 75, 'down');
      makeDpadBtn('◀', -75, 0, 'left');
      makeDpadBtn('▶', 75, 0, 'right');

      // —— 拾起/确认按钮（右下）——
      var actBg = this.add.circle(1100, 600, 48, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      var actText = this.add.text(1100, 600, '🆗', { fontSize: '32px' }).setOrigin(0.5);
      var actZone = this.add.zone(1100, 600, 96, 96).setInteractive({ useHandCursor: true });
      this.actionContainer = this.add.container(0, 0, [actBg, actText, actZone]);
      actZone.on('pointerdown', function () { self.tryActionPickup(); });

      // —— 暂停按钮（左上 Phaser Zone）——
      var pauseBg = this.add.circle(60, 100, 24, 0x4A2E1A, 0.92)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.pauseBtnText = this.add.text(60, 100, '⏸', { fontSize: '20px' }).setOrigin(0.5);
      var pauseZone = this.add.zone(60, 100, 48, 48).setInteractive({ useHandCursor: true });
      pauseZone.on('pointerdown', function () { self.togglePause(); });
      this.pauseContainer = this.add.container(0, 0, [pauseBg, this.pauseBtnText, pauseZone]);

      // —— Modal 容器（礼物 modal / 老商人 popup / 复活 modal 共用）——
      this.modalContainer = this.add.container(640, 360);
      this.modalContainer.setDepth(2000);
      this.modalContainer.setVisible(false);

      // —— Keyboard 监听 ——
      this.input.keyboard.on('keydown-UP',    function () { self.tryMove('up'); });
      this.input.keyboard.on('keydown-DOWN',  function () { self.tryMove('down'); });
      this.input.keyboard.on('keydown-LEFT',  function () { self.tryMove('left'); });
      this.input.keyboard.on('keydown-RIGHT', function () { self.tryMove('right'); });
      this.input.keyboard.on('keydown-W',     function () { self.tryMove('up'); });
      this.input.keyboard.on('keydown-A',     function () { self.tryMove('left'); });
      this.input.keyboard.on('keydown-S',     function () { self.tryMove('down'); });
      this.input.keyboard.on('keydown-D',     function () { self.tryMove('right'); });
      // keyup 不需要 —— tryMove 用 cooldown + 一按一走

      // —— 全屏按钮 DOM（Phaser 之外，与 M5/M6 一致）——
      // 不在 scene 内创建，模板里已经有 #qatar-fullscreen —— scene 外
      this.bindFullscreenDom();
      this.bindOrientationLock();

      // —— 兜底建 session ——
      if (!this.sessionId) this.ensureSession();
    },

    // ==================== 沙丘 ====================
    drawDunes: function (color, baseY, amplitude) {
      var g = this.add.graphics();
      g.fillStyle(color, 0.6);
      g.beginPath();
      g.moveTo(0, baseY);
      for (var x = 0; x <= L.CANVAS_W; x += 30) {
        var peak = Math.sin(x * 0.013) * amplitude + Math.cos(x * 0.027) * (amplitude / 2);
        g.lineTo(x, baseY - peak);
      }
      g.lineTo(L.CANVAS_W, L.CANVAS_H);
      g.lineTo(0, L.CANVAS_H);
      g.closePath();
      g.fillPath();
    },

    // ==================== 主循环 ====================
    update: function (time, delta) {
      if (this.state !== 'PLAYING' || this.paused) return;

      // 礼物 bob 动画
      for (var i = 0; i < this.giftSprites.length; i++) {
        var sp = this.giftSprites[i];
        if (sp.collected) continue;
        sp.bobPhase += 0.04;
        sp.list[1].y = Math.sin(sp.bobPhase) * 2;   // bag
      }

      // 走动画
      if (Date.now() - this.player.lastMoveAt < 200) {
        this.player.walkPhase += 0.2;
        if (this.playerSprite) {
          this.playerSprite.elf.y = Math.sin(this.player.walkPhase) * 1.5;
          this.playerSprite.camel.y = 5 + Math.sin(this.player.walkPhase) * 1.5;
        }
      } else if (this.playerSprite) {
        this.playerSprite.elf.y = 0;
        this.playerSprite.camel.y = 5;
      }

      // 老商人距离检测
      var dx = this.player.x - L.merchant.x;
      var dy = this.player.y - L.merchant.y;
      if (Math.sqrt(dx * dx + dy * dy) < 50 && !this.merchantShown) {
        this.showMerchant();
      }
    },

    // ==================== 移动 ====================
    tryMove: function (key) {
      if (this.state !== 'PLAYING' || this.paused) return;
      var now = Date.now();
      if (now - this.player.lastMoveAt < L.MOVE_COOLDOWN_MS) return;

      var dx = 0, dy = 0;
      if (key === 'up') dy = -L.STEP_PX;
      else if (key === 'down') dy = L.STEP_PX;
      else if (key === 'left') { dx = -L.STEP_PX; this.player.facing = -1; }
      else if (key === 'right') { dx = L.STEP_PX; this.player.facing = 1; }

      var nx = this.player.x + dx;
      var ny = this.player.y + dy;
      if (nx < 30 || nx > L.CANVAS_W - 30 || ny < 30 || ny > L.CANVAS_H - 30) {
        this.changeWater(-L.WATER_BOUNDARY_HIT);
        this.flashWaterUI();
        return;
      }

      this.player.x = nx;
      this.player.y = ny;
      this.player.lastMoveAt = now;
      this.playerContainer.x = nx;
      this.playerContainer.y = ny;

      this.moveCount++;
      this.changeWater(-L.WATER_PER_STEP);
      this.checkOasisCollision();
      this.checkGiftCollision();
    },

    tryActionPickup: function () {
      if (this.state !== 'PLAYING' || this.paused) return;
      var nearest = null;
      var minDist = 60;
      for (var i = 0; i < this.giftSprites.length; i++) {
        var sp = this.giftSprites[i];
        if (sp.collected) continue;
        var dx = this.player.x - sp.x;
        var dy = this.player.y - sp.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) { nearest = sp; minDist = d; }
      }
      if (nearest) {
        this.openGiftModal(nearest.giftData);
        nearest.collected = true;
        nearest.setVisible(false);
      }
    },

    // ==================== 暂停 ====================
    togglePause: function () {
      this.paused = !this.paused;
      this.pauseBtnText.setText(this.paused ? '▶' : '⏸');
    },

    // ==================== 水分 ====================
    changeWater: function (delta) {
      this.water = Math.max(0, Math.min(L.WATER_MAX, +(this.water + delta).toFixed(2)));
      this.waterText.setText('💧 水分 ' + this.water.toFixed(1) + ' / ' + L.WATER_MAX);
      if (this.water <= 0 && this.state === 'PLAYING') {
        this.dieFromThirst();
      } else if (this.water <= 3) {
        this.waterText.setColor('#FF6B6B');
      } else {
        this.waterText.setColor('#FFD98A');
      }
    },
    flashWaterUI: function () {
      var prev = this.waterText.style.color;
      this.waterText.setColor('#FFE9B0');
      var self = this;
      this.time.delayedCall(200, function () { self.waterText.setColor(prev); });
    },

    // ==================== 碰撞 ====================
    checkOasisCollision: function () {
      for (var i = 0; i < L.oases.length; i++) {
        var o = L.oases[i];
        var dx = this.player.x - o.x;
        var dy = this.player.y - o.y;
        if (Math.sqrt(dx * dx + dy * dy) < 40) {
          if (!o._lastTouch || Date.now() - o._lastTouch > 2000) {
            o._lastTouch = Date.now();
            this.changeWater(L.WATER_OASIS_REWARD);
            this.flashWaterUI();
          }
        }
      }
    },
    checkGiftCollision: function () {
      for (var i = 0; i < this.giftSprites.length; i++) {
        var sp = this.giftSprites[i];
        if (sp.collected) continue;
        var dx = this.player.x - sp.x;
        var dy = this.player.y - sp.y;
        if (Math.sqrt(dx * dx + dy * dy) < 36) {
          this.openGiftModal(sp.giftData);
          sp.collected = true;
          sp.setVisible(false);
          return;
        }
      }
    },

    // ==================== 礼物 modal ====================
    openGiftModal: function (g) {
      var self = this;
      this.state = 'PICKUP';
      this.currentGiftId = g.id;
      this.modalContainer.removeAll(true);

      // 背景遮罩（吸收点击，不响应回调）
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.78);
      backdrop.setInteractive({ useHandCursor: false });
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 420, 0x4A2E1A, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -150, g.emoji, { fontSize: '56px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -80, '你拾起了「' + g.name + '」', {
        fontSize: '20px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -40, g.hint, {
        fontSize: '13px', color: '#C9B89A', wordWrap: { width: 400 },
      }).setOrigin(0.5));

      var isFull = this.luggageCount >= L.LUGGAGE_MAX;
      var makeModalBtn = function (txt, subTxt, dy, isPrimary, callback) {
        var color = isPrimary ? 0xFFD98A : 0x6B4423;
        var textColor = isPrimary ? '#2A190E' : '#F4ECD8';
        var bg = self.add.rectangle(0, dy, 380, 56, color, 1)
          .setStrokeStyle(1, 0xFFD98A, 0.4);
        var label = self.add.text(0, dy - 8, txt, {
          fontSize: '15px', color: textColor, fontStyle: 'bold',
        }).setOrigin(0.5);
        var subT = self.add.text(0, dy + 12, subTxt, {
          fontSize: '11px', color: '#C9B89A',
        }).setOrigin(0.5);
        var zone = self.add.zone(0, dy, 380, 56).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', callback);
        return [bg, label, subT, zone];
      };

      var bucketTxt = isFull ? '🧳 行李满' : '🧳 装进 (' + this.luggageCount + '/' + L.LUGGAGE_MAX + ')';
      var bucket = makeModalBtn(bucketTxt, '占 1 行李位', 30, !isFull, function () { self.decideGift('bucket'); });
      var stay = makeModalBtn('⏳ 留后', '留到后面买（不占位）', 100, false, function () { self.decideGift('stay'); });
      var drop = makeModalBtn('❌ 放弃', '这条路不带', 170, false, function () { self.decideGift('drop'); });

      this.modalContainer.add(bucket);
      this.modalContainer.add(stay);
      this.modalContainer.add(drop);

      // 隐藏 joystick / action / pause —— 避免 modal 打开时还能点
      this.joystickContainer.setVisible(false);
      this.actionContainer.setVisible(false);
      this.pauseContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },

    closeGiftModal: function () {
      this.modalContainer.setVisible(false);
      this.currentGiftId = null;
      this.state = 'PLAYING';
      this.pickupCount++;
      this.pickupText.setText('🎁 拾起 ' + this.pickupCount + ' / 6');

      if (!this.npcShownPickup3 && this.pickupCount >= 3) {
        this.npcShownPickup3 = true;
        this.setNpcFrame(1);
      }
      if (this.pickupCount >= 6) {
        this.enterResult();
        return;
      }
      // 恢复 joystick / action / pause
      this.joystickContainer.setVisible(true);
      this.actionContainer.setVisible(true);
      this.pauseContainer.setVisible(true);
    },

    decideGift: function (choice) {
      if (this.currentGiftId === null) return;
      this.giftBuckets[this.currentGiftId] = choice;
      if (choice === 'bucket') {
        this.luggageCount++;
        this.luggageText.setText('🧳 行李 ' + this.luggageCount + ' / ' + L.LUGGAGE_MAX);
      }
      this.closeGiftModal();
    },

    // ==================== 老商人 popup ====================
    showMerchant: function () {
      var self = this;
      if (this.merchantShown) return;
      this.merchantShown = true;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.78);
      backdrop.setInteractive({ useHandCursor: false });
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 420, 300, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -90, L.merchant.emoji, { fontSize: '48px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, 10, L.merchant.line, {
        fontSize: '15px', color: '#FFE9B0', fontStyle: 'italic', wordWrap: { width: 360 },
      }).setOrigin(0.5));

      var btnBg = this.add.rectangle(0, 110, 160, 50, 0xFFD98A, 1);
      var btnText = this.add.text(0, 110, '知道了', {
        fontSize: '15px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(0, 110, 160, 50).setInteractive({ useHandCursor: true });
      btnZone.on('pointerdown', function () {
        self.modalContainer.setVisible(false);
        self.time.delayedCall(1000, function () { self.merchantShown = false; });
      });
      this.modalContainer.add([btnBg, btnText, btnZone]);

      this.joystickContainer.setVisible(false);
      this.actionContainer.setVisible(false);
      this.pauseContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },

    setNpcFrame: function (idx) {
      this.npcFrame = idx;
      this.npcText.setText(L.npcFrames[idx]);
    },

    // ==================== 渴死 / 复活 ====================
    dieFromThirst: function () {
      this.state = 'DEAD';
      this.paused = true;
      this.setNpcFrame(2);
      this.showReviveModal(this.pickupCount >= 3);
    },

    showReviveModal: function (forceRestart) {
      var self = this;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.85);
      backdrop.setInteractive({ useHandCursor: false });
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 500, 380, 0x3A2140, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -140, '💌 时间到啦', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -100, '输入你最想告诉我的话\n（一句话秘密，不存在数据库，只发飞书）', {
        fontSize: '13px', color: '#C9B89A', align: 'center', wordWrap: { width: 420 },
      }).setOrigin(0.5));

      // DOM textarea 覆盖在 Phaser canvas 上 —— Phaser 没有原生 text input
      var ta = this.getOrCreateTextarea();

      var sendBg = this.add.rectangle(-100, 110, 160, 50, 0xF6B5C8, 1);
      var sendText = this.add.text(-100, 110, forceRestart ? '发送·继续' : '发送·复活', {
        fontSize: '14px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var sendZone = this.add.zone(-100, 110, 160, 50).setInteractive({ useHandCursor: true });
      sendZone.on('pointerdown', function () { self.submitSecret(forceRestart, ta); });

      var giveupBg = this.add.rectangle(100, 110, 160, 50, 0x2A2140, 1)
        .setStrokeStyle(1, 0x4A5578);
      var giveupText = this.add.text(100, 110, '放弃', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
      }).setOrigin(0.5);
      var giveupZone = this.add.zone(100, 110, 160, 50).setInteractive({ useHandCursor: true });
      giveupZone.on('pointerdown', function () { self.giveUp(); });

      this.modalContainer.add([sendBg, sendText, sendZone, giveupBg, giveupText, giveupZone]);

      this.joystickContainer.setVisible(false);
      this.actionContainer.setVisible(false);
      this.pauseContainer.setVisible(false);
      this.modalContainer.setVisible(true);

      // 自动聚焦
      this.time.delayedCall(50, function () { ta.focus(); });
    },

    getOrCreateTextarea: function () {
      var ta = document.getElementById('phaser-revive-text');
      if (!ta) {
        ta = document.createElement('textarea');
        ta.id = 'phaser-revive-text';
        ta.maxLength = 500;
        ta.style.cssText = [
          'position:fixed',
          'left:50%', 'top:54%',
          'transform:translate(-50%,-50%)',
          'width:min(420px,90vw)',
          'min-height:120px',
          'padding:10px 14px',
          'border-radius:12px',
          'border:1px solid #4a5578',
          'background:#2a2140',
          'color:#f4ecd8',
          'font-size:15px',
          'font-family:inherit',
          'resize:vertical',
          'z-index:99999',
          'display:none',
        ].join(';');
        document.body.appendChild(ta);
      }
      ta.value = '';
      ta.disabled = false;
      ta.style.display = 'block';
      return ta;
    },

    hideRevive: function () {
      this.modalContainer.setVisible(false);
      var ta = document.getElementById('phaser-revive-text');
      if (ta) ta.style.display = 'none';
      this.joystickContainer.setVisible(true);
      this.actionContainer.setVisible(true);
      this.pauseContainer.setVisible(true);
    },

    submitSecret: async function (forceRestart, ta) {
      var text = (ta.value || '').trim();
      if (!text) return;
      ta.disabled = true;

      if (!this.sessionId) {
        await this.ensureSession();
      }
      if (!this.sessionId) {
        ta.disabled = false;
        return;
      }
      try {
        var r = await fetch('/api/game/secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: this.sessionId,
            level: LEVEL_ID,
            secret_text: text,
            nickname: this.nickname,
          }),
        });
        var data = await r.json();
        if (data && data.success) {
          this.hideRevive();
          if (forceRestart) {
            // 没拾够 3 件 → 复活 +1 滴回原点
            this.water = 1;
            this.player.x = L.start.x;
            this.player.y = L.start.y;
            this.playerContainer.x = L.start.x;
            this.playerContainer.y = L.start.y;
            this.changeWater(0);
            this.paused = false;
            this.state = 'PLAYING';
          } else {
            // 已拾够 3 件 → DEAD 档不调 reward，直接放弃
            this.giveUp();
          }
        } else {
          ta.disabled = false;
        }
      } catch (e) {
        ta.disabled = false;
      }
    },

    giveUp: function () {
      this.hideRevive();
      this.scene.start('ResultScene', {
        tier: 'DEAD',
        picked: this.pickupCount,
        water: this.water,
        bucket: this.bucketCount(),
        given: true,
      });
    },

    bucketCount: function () {
      var n = 0;
      var keys = Object.keys(this.giftBuckets);
      for (var i = 0; i < keys.length; i++) {
        if (this.giftBuckets[keys[i]] === 'bucket') n++;
      }
      return n;
    },

    // ==================== 4 档判定 ====================
    determineTier: function () {
      var bucket = this.bucketCount();
      var allPicked = this.pickupCount >= 6;
      if (allPicked && this.water > 5) return 'PERFECT';
      if ((bucket >= 4 || allPicked) && this.water > 0) return 'NORMAL';
      if (bucket >= 3 || this.pickupCount >= 3) {
        if (this.water > 0) return 'HARD';
        return 'DEAD';
      }
      return null;
    },

    enterResult: function () {
      var tier = this.determineTier();
      if (tier === null) {
        // 礼物不够 → Phaser Text 提示
        var warn = this.add.text(640, 360,
          '礼物还不够（至少 3 件），继续走吧 🌵', {
          fontSize: '18px', color: '#FFD98A',
          backgroundColor: '#4A2E1A', padding: { x: 16, y: 8 },
        }).setOrigin(0.5).setDepth(3000);
        var self = this;
        this.time.delayedCall(2000, function () { warn.destroy(); });
        this.state = 'PLAYING';
        return;
      }
      if (tier === 'DEAD') {
        // 渴死档 → 弹复活 modal
        this.dieFromThirst();
        return;
      }
      this.scene.start('ResultScene', {
        tier: tier,
        picked: this.pickupCount,
        water: this.water,
        bucket: this.bucketCount(),
        given: false,
      });
    },

    // ==================== session ====================
    ensureSession: function () {
      var self = this;
      return fetch('/api/game/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'land', nickname: this.nickname }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.session_id) {
          self.sessionId = data.session_id;
          SESSION_ID = data.session_id;
          localStorage.setItem('silkroad_session_id', data.session_id);
        }
      })
      .catch(function () {});
    },

    // ==================== 全屏 / 横屏（DOM 辅助）====================
    bindFullscreenDom: function () {
      var fsBtn = document.getElementById('qatar-fullscreen');
      var fsIcon = fsBtn ? fsBtn.querySelector('.qtr-fs-icon') : null;
      var fsLabel = fsBtn ? fsBtn.querySelector('.qtr-fs-label') : null;
      var update = function () {
        var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (fsIcon) fsIcon.textContent = isFs ? '✕' : '⛶';
        if (fsLabel) fsLabel.textContent = isFs ? '退出' : '全屏';
      };
      if (fsBtn) {
        fsBtn.addEventListener('click', function () {
          var isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
          try {
            if (!isFs) {
              var el = document.documentElement;
              var req = el.requestFullscreen || el.webkitRequestFullscreen;
              if (req) {
                var p = req.call(el);
                if (p && typeof p.catch === 'function') p.catch(function () {});
              }
            } else {
              var exit = document.exitFullscreen || document.webkitExitFullscreen;
              if (exit) {
                var p2 = exit.call(document);
                if (p2 && typeof p.catch === 'function') p2.catch(function () {});
              }
            }
          } catch (e) {}
        });
      }
      document.addEventListener('fullscreenchange', update);
      document.addEventListener('webkitfullscreenchange', update);
      update();
    },

    bindOrientationLock: function () {
      var lock = document.getElementById('orientation-lock');
      if (!lock) return;
      var apply = function () {
        var isPortrait = false;
        try {
          if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
            isPortrait = true;
          }
        } catch (e) {}
        if (!isPortrait && window.innerHeight > window.innerWidth) isPortrait = true;
        if (isPortrait) lock.classList.add('show');
        else lock.classList.remove('show');
      };
      apply();
      if (window.matchMedia) {
        var mql = window.matchMedia('(orientation: portrait)');
        if (mql.addEventListener) mql.addEventListener('change', apply);
        else if (mql.addListener) mql.addListener(apply);
      }
      window.addEventListener('resize', apply);
      window.addEventListener('orientationchange', function () { setTimeout(apply, 100); });
    },
  });

  // ==================== ResultScene ====================
  var ResultScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ResultScene() { Phaser.Scene.call(this, { key: 'ResultScene' }); },
    init: function (data) {
      this.tier = data.tier;
      this.picked = data.picked;
      this.water = data.water;
      this.bucket = data.bucket || 0;
      this.given = !!data.given;
      this.sessionId = data.sessionId || SESSION_ID;
      this.nickname = data.nickname || nickname;
    },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#1b2135');

      var amount = QATAR_REWARD_TIERS[this.tier];
      var quote = L.tierQuotes[this.tier];
      var tierEmoji = this.tier === 'PERFECT' ? '🌟 完美' :
                      this.tier === 'NORMAL' ? '☀️ 普通' :
                      this.tier === 'HARD' ? '🌾 勉强' : '🏜️ 渴死';

      // 卡片
      var card = this.add.rectangle(640, 320, 540, 460, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.add.text(640, 180, tierEmoji, {
        fontSize: '32px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 240, quote, {
        fontSize: '16px', color: '#A8D8C0', fontStyle: 'italic', wordWrap: { width: 460 },
      }).setOrigin(0.5);
      this.add.text(640, 320, '收 ' + this.bucket + ' 件 · 拾 ' + this.picked + ' / 6 · 水分 ' +
        this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '13px', color: '#C9B89A',
      }).setOrigin(0.5);
      this.add.text(640, 380, '+¥' + amount.toFixed(2), {
        fontSize: '38px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 状态
      this.statusText = this.add.text(640, 430, this.given ? '已放弃复活' : '推送中…', {
        fontSize: '14px', color: '#A8D8C0',
      }).setOrigin(0.5);

      // 继续按钮 —— HTML 跳关，不用 Phaser 控制 URL
      var nextBg = this.add.rectangle(640, 510, 280, 70, 0xFFD98A, 1);
      var nextText = this.add.text(640, 510, '继续下一关 →', {
        fontSize: '20px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var nextZone = this.add.zone(640, 510, 280, 70).setInteractive({ useHandCursor: true });
      nextZone.on('pointerdown', function () {
        window.location.href = '/games/silk-road/level/1';
      });

      // 调用 webhook
      if (this.given) {
        this.statusText.setText('未通关，没领奖（放弃了复活）');
        this.statusText.setColor('#C9C2D8');
      } else if (this.tier === 'DEAD') {
        this.statusText.setText('渴死档 —— 不调 reward，只调 secret（已发送）');
        this.statusText.setColor('#C9B89A');
      } else {
        this.claimReward(amount);
      }
    },

    claimReward: async function (amount) {
      var self = this;
      if (!this.sessionId) {
        await this.ensureSession();
      }
      if (!this.sessionId) {
        this.statusText.setText('session 创建失败，请重试');
        this.statusText.setColor('#F6B5C8');
        return;
      }
      try {
        var r = await fetch('/api/game/reward/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: this.sessionId,
            level: LEVEL_ID,
            amount: amount,
            nickname: this.nickname,
          }),
        });
        var data = await r.json();
        if (data && data.success) {
          localStorage.setItem('silkroad_claimed_' + this.sessionId + '_' + LEVEL_ID, '1');
          var msg = data.duplicate
            ? '已领取过（服务端去重）'
            : (data.triggered ? '飞书已通知 ✉️' : '飞书未推送（webhook 未配置）');
          this.statusText.setText(msg);
          this.statusText.setColor('#A8D8C0');
          try {
            var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
            if (cleared.indexOf(LEVEL_ID) === -1) {
              cleared.push(LEVEL_ID);
              localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
            }
          } catch (e) {}
        } else {
          this.statusText.setText('领取失败：' + (data && data.error ? data.error : '未知错误'));
          this.statusText.setColor('#F6B5C8');
        }
      } catch (err) {
        this.statusText.setText('网络错误：' + err.message);
        this.statusText.setColor('#F6B5C8');
      }
    },

    ensureSession: function () {
      var self = this;
      return fetch('/api/game/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'land', nickname: this.nickname }),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.session_id) {
          self.sessionId = data.session_id;
          SESSION_ID = data.session_id;
          localStorage.setItem('silkroad_session_id', data.session_id);
        }
      })
      .catch(function () {});
    },
  });

  // ==================== Start Phaser game ====================
  var game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'qatar-game',
    width: 1280,
    height: 720,
    backgroundColor: '#E8C282',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, IntroScene, PlayScene, ResultScene],
  });

  // 暴露给离线/调试用
  window.QATAR_GAME = game;
  window.QATAR_REWARD_TIERS = QATAR_REWARD_TIERS;
})();