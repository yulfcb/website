// 伊朗·阿巴斯港大巴扎 —— 关 1 游戏引擎 (M1 Phaser 3 重做版)
//
// 重做原因：原 Iran 关是纯 DOM 卡片游戏，太简单。仿关 0 (Qatar) 的 Phaser 模式：
// 玩家控制人物在沙漠地图上行走，走访 5 个波斯商贩 + 2 个绿洲，
// 集齐 🐪×3 + 💧×3 启程去土耳其 (M2/M3 才会接入交易系统)。
//
// M1 范围 (本次实现)：
//   - BootScene: 背景色 + BGM 解锁
//   - PlayScene: 沙漠地图 + 4 角色 graphics + 虚拟 D-pad + WASD/方向键
//                + 网格步进 (24/48px) + 水分系统 (10 起, -0.1/步, 绿洲 +2)
//                + 商贩/绿洲/出口 emoji 渲染 + 撞墙提示 + 走路 bob + facing flip
//                + 水分=0 死亡提示 (文字)
// M2/M3 不在本次范围 (交易 modal / 胜利 tier / API 调用 / 信使铺 留给后续)。
//
// 复用关 0 (qatar/game.js) 的代码：
//   - _buildAvatarSprite (4 个角色 graphics) — 从 QATAR 原样复制, 角色选择共享 localStorage
//   - makeDpadBtn / joystickContainer — D-pad 容器
//   - changeWater / checkOasisCollision — 水分系统
//   - tryMove / _movementUpdate — 步进循环

(function () {
  'use strict';

  if (!window.IRAN_MODE) {
    console.warn('[iran-m1] window.IRAN_MODE not set, abort');
    return;
  }
  var L = window.IRAN_LEVEL;
  if (!L) {
    console.error('[iran-m1] window.IRAN_LEVEL missing, abort');
    return;
  }
  var LEVEL_ID = 1;

  // ============== SFX 助手（与关 0 一致，共享同一套 audio 元素）==============
  window.playIranSfx = function (id, volume) {
    var a = document.getElementById('sfx-' + id);
    if (!a) return;
    try {
      a.volume = volume != null ? volume : 0.5;
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  };

  // ============== Avatar emoji 映射 (IntroScene 备选) ==============
  window.IRAN_AVATARS = {
    malay: '🧔',
    fala:  '🧕',
    cn_m:  '👨',
    cn_f:  '👩',
  };

  // ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      // 波斯深赭石背景 — 跟 M0 的 '#1b2135' 区分（伊朗专属色）
      this.cameras.main.setBackgroundColor('#6B3F1D');
      this.add.text(640, 360, '伊朗·阿巴斯港大巴扎\n加载中…', {
        fontSize: '26px', color: '#FFD98A', fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5);

      // BGM 解锁 (复用 #silk-road-bgm 元素)
      document.addEventListener('pointerdown', function unlockBgm() {
        var a = document.getElementById('silk-road-bgm');
        if (a) {
          a.muted = false;
          a.volume = 0.35;
          var p = a.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      }, { once: true });
      window.addEventListener('beforeunload', function () {
        var a = document.getElementById('silk-road-bgm');
        if (a) a.pause();
      });

      // 短暂延迟 → PlayScene (M1 跳过 IntroScene, 直接进游戏)
      this.time.delayedCall(30, function () {
        self.scene.start('PlayScene');
      });
    },
  });

  // ============== PlayScene ==============
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    create: function () {
      var self = this;

      // —— 沙金背景 ——
      this.cameras.main.setBackgroundColor('#E8C282');

      // —— 沙丘（远景 3 层，跟关 0 同款）——
      this.drawDunes(0xD4A86A, 360, 40);
      this.drawDunes(0xC49A5E, 460, 60);
      this.drawDunes(0xB58A55, 560, 90);

      // —— 6 个真实地名 chip (伊朗版) ——
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
          wordWrap: false,
        }).setOrigin(0.5);
        t.setFixedSize(w - 12, 14);
        var chip = self.add.container(p.x, p.y - 22, [bg, t]);
        self.placeSprites.push(chip);
      });

      // —— 2 个绿洲 ——
      this.oasisSprites = [];
      L.oases.forEach(function (o) {
        var halo = self.add.graphics();
        halo.fillStyle(0x6EC1E4, 0.35);
        halo.fillCircle(0, 0, 26);
        var palm = self.add.text(0, 0, '💧', { fontSize: '32px' }).setOrigin(0.5);
        var label = self.add.text(0, 22, o.label, {
          fontSize: '11px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5);
        var oasis = self.add.container(o.x, o.y, [halo, palm, label]);
        oasis.oasisData = o;
        self.oasisSprites.push(oasis);
      });

      // —— 5 个波斯商贩 ——
      this.merchantSprites = [];
      L.merchants.forEach(function (m) {
        var halo = self.add.graphics();
        halo.fillStyle(0x1B5E8A, 0.4);  // 波斯蓝
        halo.fillCircle(0, 0, 22);
        var emoji = self.add.text(0, 0, m.emoji, { fontSize: '32px' }).setOrigin(0.5);
        var label = self.add.text(0, 24, m.name, {
          fontSize: '11px', color: '#FFD98A', fontStyle: 'bold',
          stroke: '#2A1606', strokeThickness: 3, wordWrap: false,
        }).setOrigin(0.5);
        label.setFixedSize(110, 14);
        var sp = self.add.container(m.x, m.y + 10, [halo, emoji, label]);
        sp.merchantData = m;
        sp.bobPhase = Math.random() * Math.PI * 2;
        self.merchantSprites.push(sp);
      });

      // —— 出口 (启程 → 土耳其) ——
      var exitBg = this.add.graphics();
      exitBg.fillStyle(0xFFD98A, 0.5);
      exitBg.fillCircle(0, 0, 24);
      var exitEmoji = this.add.text(0, 0, L.exit.emoji, { fontSize: '32px' }).setOrigin(0.5);
      var exitLabel = this.add.text(0, 28, L.exit.label, {
        fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 3,
      }).setOrigin(0.5);
      this.exitSprite = this.add.container(L.exit.x, L.exit.y, [exitBg, exitEmoji, exitLabel]);
      this.exitSprite.bobPhase = 0;

      // —— 玩家：4 角色 graphics (复用关 0 逻辑) ——
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      if (!window.IRAN_AVATARS[avatarId]) avatarId = 'malay';
      this._avatar = avatarId;
      var elf = this._buildAvatarSprite(avatarId);
      var shadow = this.add.ellipse(0, 22, 22, 6, 0x000000, 0.18);
      this.playerContainer = this.add.container(L.start.x, L.start.y, [shadow, elf]);
      this.playerSprite = { shadow: shadow, elf: elf, avatarId: avatarId };

      // —— 状态 ——
      this.player = { x: L.start.x, y: L.start.y, facing: 1, lastMoveAt: 0, walkPhase: 0 };
      this.water = L.WATER_MAX;
      this.camels = 0;                // M1: 暂时不增加（等 M2 接入商贩交易）
      this.completedMerchantIds = []; // M1: 占位字段
      this.state = 'PLAYING';         // PLAYING | DEAD

      // —— HUD（顶部条）——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x2A1606, 0.92);
      this.waterText = this.add.text(180, 30, '💧 水分 ' + this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.camelText = this.add.text(640, 30, '🐪 骆驼 0 / ' + L.TARGET_CAMELS, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.merchantText = this.add.text(1100, 30, '🏪 商贩 0 / 5', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      // 任务提示
      this.add.text(640, 80, '🎯 走访 5 个波斯商贩 + 集齐 3 只骆驼 + 3 壶水 → 启程去土耳其', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5);

      // —— 虚拟方向键（跟关 0 一致，左下 Container）——
      this.keys = { up: false, down: false, left: false, right: false };
      this.joystickContainer = this.add.container(110, 620);
      this.joystickContainer.setAlpha(0.72);
      this.joystickContainer.setScale(0.6);
      this.joystickContainer.setDepth(500);

      var dpadBg = this.add.graphics();
      dpadBg.fillStyle(0x2A1606, 0.6);
      dpadBg.fillCircle(0, 0, 115);
      this.joystickContainer.add(dpadBg);

      this.joystickBtns = {};
      var makeDpadBtn = function (txt, dx, dy, key) {
        var bg = self.add.circle(dx, dy, 40, 0x2A1606, 0.85)
          .setStrokeStyle(2, 0xFFD98A, 0.7);
        var arrow = self.add.text(dx, dy, txt, {
          fontSize: '30px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0.5);
        var zone = self.add.zone(dx, dy, 80, 80).setInteractive({ useHandCursor: true });
        var press = function () {
          self.keys[key] = true;
          bg.setFillStyle(0xFFD98A, 0.95);
          arrow.setColor('#2A1606');
          window.playIranSfx('click', 0.4);
          self.tryMove(key);
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
        self.joystickBtns[key] = { bg: bg, arrow: arrow };
      };
      makeDpadBtn('▲', 0, -75, 'up');
      makeDpadBtn('▼', 0, 75, 'down');
      makeDpadBtn('◀', -75, 0, 'left');
      makeDpadBtn('▶', 75, 0, 'right');

      // 持续 walk tick (按住连续走)
      this.events.on('update', this._movementUpdate, this);

      // —— 键盘监听 (WASD + 方向键) ——
      var onKeyDown = function (k) { return function () { self.keys[k] = true; } };
      var onKeyUp = function (k) { return function () { self.keys[k] = false; } };
      this.input.keyboard.on('keydown-UP',    onKeyDown('up'));
      this.input.keyboard.on('keydown-DOWN',  onKeyDown('down'));
      this.input.keyboard.on('keydown-LEFT',  onKeyDown('left'));
      this.input.keyboard.on('keydown-RIGHT', onKeyDown('right'));
      this.input.keyboard.on('keydown-W',     onKeyDown('up'));
      this.input.keyboard.on('keydown-A',     onKeyDown('left'));
      this.input.keyboard.on('keydown-S',     onKeyDown('down'));
      this.input.keyboard.on('keydown-D',     onKeyDown('right'));
      this.input.keyboard.on('keyup-UP',      onKeyUp('up'));
      this.input.keyboard.on('keyup-DOWN',    onKeyUp('down'));
      this.input.keyboard.on('keyup-LEFT',    onKeyUp('left'));
      this.input.keyboard.on('keyup-RIGHT',   onKeyUp('right'));
      this.input.keyboard.on('keyup-W',       onKeyUp('up'));
      this.input.keyboard.on('keyup-A',       onKeyUp('left'));
      this.input.keyboard.on('keyup-S',       onKeyUp('down'));
      this.input.keyboard.on('keyup-D',       onKeyUp('right'));

      // —— 全屏按钮 / 横屏锁 (DOM 辅助) ——
      this.bindFullscreenDom();
      this.bindOrientationLock();
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
      if (this.state !== 'PLAYING') return;

      // 商贩 bob 动画
      for (var i = 0; i < this.merchantSprites.length; i++) {
        var sp = this.merchantSprites[i];
        sp.bobPhase += 0.04;
        sp.list[1].y = Math.sin(sp.bobPhase) * 2;   // emoji
      }
      // 出口 bob
      if (this.exitSprite) {
        this.exitSprite.bobPhase += 0.05;
        this.exitSprite.list[1].y = Math.sin(this.exitSprite.bobPhase) * 2;
      }

      // 走路 bob —— 200ms 内持续 bounce, 静止后归零
      if (Date.now() - this.player.lastMoveAt < 200) {
        this.player.walkPhase += 0.2;
        if (this.playerSprite) {
          this.playerSprite.elf.y = Math.sin(this.player.walkPhase) * 1.5;
        }
      } else if (this.playerSprite) {
        this.playerSprite.elf.y = 0;
      }
    },

    // ==================== 移动 ====================
    _movementUpdate: function () {
      if (this.state !== 'PLAYING') return;
      if (this.keys.up)    this.tryMove('up');
      if (this.keys.down)  this.tryMove('down');
      if (this.keys.left)  this.tryMove('left');
      if (this.keys.right) this.tryMove('right');
    },
    tryMove: function (key) {
      if (this.state !== 'PLAYING') return;
      var now = Date.now();
      if (now - this.player.lastMoveAt < L.MOVE_COOLDOWN_MS) return;

      // 步长: 骑骆驼 2x 速度 (M1: 暂未启用, 但逻辑已写好, M2 接入)
      var step = (this.camels > 0) ? L.STEP_PX_CAMEL : L.STEP_PX_WALK;

      var dx = 0, dy = 0;
      if (key === 'up') dy = -step;
      else if (key === 'down') dy = step;
      else if (key === 'left')  { dx = -step; this.player.facing = -1; }
      else if (key === 'right') { dx = step;  this.player.facing = 1; }

      var nx = this.player.x + dx;
      var ny = this.player.y + dy;
      if (nx < 30 || nx > L.CANVAS_W - 30 || ny < 30 || ny > L.CANVAS_H - 30) {
        this.showBoundaryToast();
        return;
      }

      this.player.x = nx;
      this.player.y = ny;
      this.player.lastMoveAt = now;
      this.playerContainer.x = nx;
      this.playerContainer.y = ny;
      // facing flip (scaleX = ±1)
      if (this.playerContainer) {
        this.playerContainer.scaleX = this.player.facing;
      }

      this.changeWater(-L.WATER_PER_STEP);
      this.checkOasisCollision();
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
      var self = this;
      this.waterText.setColor('#FFE9B0');
      this.time.delayedCall(200, function () {
        if (self.water > 3) self.waterText.setColor('#FFD98A');
      });
    },

    showBoundaryToast: function () {
      if (!this.boundaryToast) {
        this.boundaryToast = this.add.text(L.CANVAS_W / 2, L.CANVAS_H / 2 - 100, '🚧 撞墙了', {
          fontSize: '18px', color: '#FFD98A', backgroundColor: '#2A1606',
          padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(1000);
      }
      this.boundaryToast.setAlpha(1);
      this.boundaryToast.setPosition(L.CANVAS_W / 2, L.CANVAS_H / 2 - 100);
      if (this._boundaryTween) this._boundaryTween.stop();
      this._boundaryTween = this.tweens.add({
        targets: this.boundaryToast,
        alpha: 0,
        duration: 600,
        delay: 400,
      });
    },

    // ==================== 绿洲碰撞 ====================
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
            window.playIranSfx('pickup', 0.4);
          }
        }
      }
    },

    // ==================== 渴死 ====================
    dieFromThirst: function () {
      this.state = 'DEAD';
      this.joystickContainer.setVisible(false);
      window.playIranSfx('die', 0.6);

      // 半透明黑幕
      var overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55);
      // DEAD 文字
      this.add.text(640, 280, '💀', { fontSize: '80px' }).setOrigin(0.5);
      this.add.text(640, 360, '你渴死在波斯沙漠了', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 400, 'M2 即将推出：复活 / 重新出发 / 寄信回家', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5);

      // 重新出发按钮 (M1: 简单刷新页面)
      var btnBg = this.add.rectangle(640, 480, 220, 56, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.add.text(640, 480, '重新出发', {
        fontSize: '18px', color: '#2A1606', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(640, 480, 220, 56).setInteractive({ useHandCursor: true });
      var self = this;
      btnZone.on('pointerdown', function () {
        window.playIranSfx('button', 0.4);
        window.location.reload();
      });
    },

    // ==================== DOM 辅助 (全屏 + 横屏) ====================
    bindFullscreenDom: function () {
      var fsBtn = document.getElementById('iran-fullscreen');
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

    // ==================== 4 角色 graphics 绘制 (从关 0 复制) ====================
    // 用 Phaser.Graphics 程序画 4 个有身体的造型, 所有 body 部分 0~44 范围 (elf.y=0)
    // 颜色代码: 阿拉伯男=白袍+白头巾, 阿拉伯女=黑色 abaya+hijab, 中国男=藏青汉服, 中国女=桃红汉服
    _buildAvatarSprite: function (avatarId) {
      var g = this.add.graphics();
      g.setName('avatar:' + avatarId);
      if (avatarId === 'malay') {
        // —— 阿拉伯男：thobe 白袍 + ghutra 白头巾 + 黑色 agal 头箍 ——
        g.fillStyle(0x3A2614, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
        g.fillStyle(0xF4ECD8, 1);
        g.beginPath(); g.moveTo(-12, 18); g.lineTo(12, 18);
        g.lineTo(15, -6); g.lineTo(-15, -6); g.closePath(); g.fillPath();
        g.fillStyle(0xE8DEC0, 1);
        g.fillRoundedRect(-15, -8, 4, 20, 2); g.fillRoundedRect(11, -8, 4, 20, 2);
        g.fillStyle(0x8B6B3A, 1); g.fillRect(-13, 6, 26, 2);
        g.fillStyle(0xFFFFFF, 1);
        g.fillRoundedRect(-13, -22, 26, 14, 3);
        g.fillRoundedRect(-15, -16, 4, 18, 1);
        g.fillRoundedRect(11, -16, 4, 18, 1);
        g.lineStyle(2, 0x1A1208, 1);
        g.strokeRoundedRect(-13, -18, 26, 2, 1);
        g.strokeRoundedRect(-13, -14, 26, 2, 1);
        g.fillStyle(0xC9A47A, 1);
        g.fillRoundedRect(-8, -14, 16, 12, 3);
        g.fillStyle(0x1A1208, 1);
        g.fillRoundedRect(-7, -6, 14, 6, 2);
        g.fillStyle(0x1A1208, 1);
        g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
      } else if (avatarId === 'fala') {
        // —— 阿拉伯女：黑色 abaya 长袍 + hijab 头巾 ——
        g.fillStyle(0x2A1F18, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
        g.fillStyle(0x1A1208, 1);
        g.beginPath(); g.moveTo(-12, 22); g.lineTo(12, 22);
        g.lineTo(14, -4); g.lineTo(-14, -4); g.closePath(); g.fillPath();
        g.fillStyle(0x0F0A06, 1);
        g.fillRoundedRect(-15, -6, 4, 22, 2); g.fillRoundedRect(11, -6, 4, 22, 2);
        g.fillStyle(0xC49A5E, 1); g.fillRect(-13, 6, 26, 2);
        g.fillStyle(0xFFD98A, 1); g.fillRect(-13, 8, 26, 1);
        g.fillStyle(0x2A1F18, 1);
        g.fillRoundedRect(-12, -22, 24, 22, 4);
        g.fillStyle(0xD4B68C, 1);
        g.fillEllipse(0, -10, 14, 12);
        g.fillStyle(0x1A1208, 1); g.fillRect(-4, -11, 2, 2); g.fillRect(2, -11, 2, 2);
        g.fillStyle(0xC04848, 1); g.fillRect(-1, -7, 2, 1);
      } else if (avatarId === 'cn_m') {
        // —— 中国男：黑短发 + 藏青汉服对襟 ——
        g.fillStyle(0x2A1F18, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
        g.fillStyle(0x2C3E50, 1);
        g.beginPath(); g.moveTo(-13, 18); g.lineTo(13, 18);
        g.lineTo(15, -4); g.lineTo(-15, -4); g.closePath(); g.fillPath();
        g.fillStyle(0x34495E, 1);
        g.fillRoundedRect(-17, -6, 6, 22, 2); g.fillRoundedRect(11, -6, 6, 22, 2);
        g.lineStyle(1, 0xF4ECD8, 1);
        g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 14); g.strokePath();
        g.fillStyle(0xC49A5E, 1);
        for (var i = 0; i < 3; i++) g.fillCircle(0, i * 5, 1);
        g.fillStyle(0x1A1208, 1); g.fillRect(-13, 6, 26, 2);
        g.fillStyle(0x1A1208, 1);
        g.fillRoundedRect(-10, -22, 20, 10, 3);
        g.fillStyle(0xF0D2A8, 1);
        g.fillRoundedRect(-7, -14, 14, 12, 2);
        g.fillStyle(0x1A1208, 1); g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
      } else { // cn_f —— 中国女：长发垂到肩膀 + 桃红汉服对襟
        g.fillStyle(0x5C3A22, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
        g.fillStyle(0xD88099, 1);
        g.beginPath(); g.moveTo(-13, 18); g.lineTo(13, 18);
        g.lineTo(15, -4); g.lineTo(-15, -4); g.closePath(); g.fillPath();
        g.fillStyle(0xE89AAA, 1);
        g.fillRoundedRect(-17, -6, 6, 22, 2); g.fillRoundedRect(11, -6, 6, 22, 2);
        g.lineStyle(1, 0xF4ECD8, 1);
        g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 14); g.strokePath();
        g.fillStyle(0xC49A5E, 1);
        for (var i = 0; i < 3; i++) g.fillCircle(0, i * 5, 1);
        g.fillStyle(0xC49A5E, 1); g.fillRect(-13, 6, 26, 2);
        g.fillStyle(0x1A1208, 1);
        g.fillRoundedRect(-11, -22, 22, 10, 3);
        g.fillRoundedRect(-13, -16, 4, 12, 2);
        g.fillRoundedRect(9, -16, 4, 12, 2);
        g.fillStyle(0xF8E0B8, 1);
        g.fillRoundedRect(-7, -14, 14, 12, 2);
        g.fillStyle(0x1A1208, 1);
        g.fillRoundedRect(-7, -16, 6, 4, 1);
        g.fillRoundedRect(1, -16, 6, 4, 1);
        g.fillStyle(0x1A1208, 1); g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
        g.fillStyle(0xC04848, 1); g.fillRect(-2, -7, 4, 1);
      }
      return g;
    },
  });

  // ==================== Start Phaser game ====================
  var game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'iran-game',
    width: 1280,
    height: 720,
    backgroundColor: '#E8C282',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, PlayScene],
  });
  window.__iranGame = game;
})();
