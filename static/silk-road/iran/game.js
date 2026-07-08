// 伊朗·阿巴斯港大巴扎 —— 关 1 游戏引擎 (M2: 交易系统嵌入 Phaser 地图)
//
// 重做原因：原 Iran 关是纯 DOM 卡片游戏，太简单。仿关 0 (Qatar) 的 Phaser 模式：
// 玩家控制人物在沙漠地图上行走，走访 5 个波斯商贩 + 2 个绿洲，
// 集齐 🐪×3 + 💧×3 启程去土耳其 (M3 才会真正通关)。
//
// M1 范围：
//   - BootScene: 背景色 + BGM 解锁
//   - PlayScene: 沙漠地图 + 4 角色 graphics + 虚拟 D-pad + WASD/方向键
//                + 网格步进 (24/48px) + 水分系统 (10 起, -0.1/步, 绿洲 +2)
//                + 商贩/绿洲/出口 emoji 渲染 + 撞墙提示 + 走路 bob + facing flip
//                + 水分=0 死亡提示 (文字)
//
// M2 范围 (本次新增)：
//   - 背包系统: 8 件商品 grid (来自 QATAR_LEVEL.gifts), localStorage.silkroad_luggage
//   - 商贩交互: walk-near 气泡 + tap/空格 打开交易 modal (Phaser Graphics)
//   - 交易逻辑: accept 检查 + 消耗/奖励 + 失败 shake 动画
//   - 骆驼骑乘: toggle 按钮 + 步长 48px + 水分 -0.08/步 + 玩家下方 🐪 装饰
//   - HUD: 🎒 背包按钮 + 骑乘/步行状态 + 已完成商贩计数 (x/5)
//   - 出口: 满足条件 (camels≥3 && water≥3) 时脉冲 + 走到触发提示
//   - id=5 (归家之心 ❤️) 不可交易
//
// 复用关 0 (qatar/game.js) 的代码：
//   - _buildAvatarSprite (4 个角色 graphics) — 从 QATAR 原样复制, 角色选择共享 localStorage
//   - makeDpadBtn / joystickContainer — D-pad 容器
//   - changeWater / checkOasisCollision — 水分系统
//   - tryMove / _movementUpdate — 步进循环

(function () {
  'use strict';

  if (!window.IRAN_MODE) {
    console.warn('[iran-m2] window.IRAN_MODE not set, abort');
    return;
  }
  var L = window.IRAN_LEVEL;
  var Q = window.QATAR_LEVEL;  // M2: 商品数据从 QATAR_LEVEL.gifts 来 (8 件, 跟商人 accept 索引对应)
  if (!L) {
    console.error('[iran-m2] window.IRAN_LEVEL missing, abort');
    return;
  }
  if (!Q || !Q.gifts) {
    console.error('[iran-m2] window.QATAR_LEVEL.gifts missing, abort');
    return;
  }
  var LEVEL_ID = 1;
  // M2: 商品数据 (商品本体) 来自卡塔尔关 gifts, 用 item.id 索引. id=5 归家之心不可交易.
  var ITEMS = Q.gifts;
  var HEART_ID = 5;
  var ALL_ITEM_IDS = ITEMS.map(function (g) { return g.id; });

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
      // M2: 加交互 (气泡 + 点击) + 完成态 (灰色)
      this.merchantSprites = [];
      this.merchantBubbles = {};  // id → bubble sprite (null 时未显示)
      this.merchantDone = {};     // id → true (已完成, 不再显示气泡)
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
        sp.setDepth(20);
        // M2: 商贩可点击 (设置 interactive zone)
        var hit = self.add.zone(m.x, m.y + 10, 64, 64)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', function () { self.tryOpenMerchant(m.id); });
        hit.setDepth(21);
        sp.hitZone = hit;
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
      this.exitSprite.setDepth(20);
      this.exitGlow = this.add.graphics();
      this.exitGlow.setDepth(19);

      // —— 玩家：4 角色 graphics (复用关 0 逻辑) ——
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      if (!window.IRAN_AVATARS[avatarId]) avatarId = 'malay';
      this._avatar = avatarId;
      var elf = this._buildAvatarSprite(avatarId);
      var shadow = this.add.ellipse(0, 22, 22, 6, 0x000000, 0.18);
      // M2: 骑乘时玩家下方加 🐪 emoji 装饰
      this.camelBackEmoji = this.add.text(0, 30, '🐪', { fontSize: '20px' }).setOrigin(0.5);
      this.camelBackEmoji.setVisible(false);
      this.playerContainer = this.add.container(L.start.x, L.start.y, [shadow, elf, this.camelBackEmoji]);
      this.playerContainer.setDepth(30);
      this.playerSprite = { shadow: shadow, elf: elf, avatarId: avatarId };

      // —— 状态 ——
      this.player = { x: L.start.x, y: L.start.y, facing: 1, lastMoveAt: 0, walkPhase: 0 };
      this.water = L.WATER_MAX;
      this.camels = 0;                // M2: 交易成功给 camel/water
      this.completedMerchantIds = []; // M2: 已完成商贩 id 列表
      this.consumedIds = [];          // M2: 已消耗的 item id (从背包去掉)
      this.camelMode = false;         // M2: 是否骑骆驼
      this.currentMerchantId = null;  // M2: 当前打开的商贩
      this.selectedItemId = null;     // M2: 交易 modal 选中的 item
      this.exitActive = false;        // M2: 出口是否激活 (脉冲)
      this.merchantShownId = null;    // M2: 当前显示气泡的商贩 id
      this.state = 'PLAYING';         // PLAYING | TRADING | LUGGAGE | DEAD

      // —— 背包初始化 (M2) ——
      // 优先读 localStorage.silkroad_luggage (从关 0 存过来的勾选列表)
      // 没有则兜底给全部 8 件, 让玩家能正常玩游戏
      this.luggageIds = this._loadLuggage();

      // —— HUD（顶部条）——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x2A1606, 0.92);
      this.waterText = this.add.text(180, 30, '💧 水分 ' + this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.camelText = this.add.text(420, 30, '🐪 骆驼 0 / ' + L.TARGET_CAMELS, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      // 骑乘切换按钮 (M2: 默认隐藏, camels > 0 时显示)
      this.camelBtn = this.add.text(560, 30, '🚶 步行', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        backgroundColor: '#1B5E8A', padding: { x: 8, y: 2 },
      }).setOrigin(0.5);
      this.camelBtn.setVisible(false);
      this.camelBtn.setInteractive({ useHandCursor: true });
      this.camelBtn.on('pointerdown', function () { self.toggleCamelMode(); });
      this.merchantText = this.add.text(820, 30, '🏪 商贩 0 / 5', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      // 背包按钮 (M2)
      this.bagBtn = this.add.text(1080, 30, '🎒 背包', {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.bagBtn.setInteractive({ useHandCursor: true });
      this.bagBtn.on('pointerdown', function () { self.openLuggageModal(); });
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
      // 空格键 → 打开最近的商贩
      this.input.keyboard.on('keydown-SPACE', function () { self.tryOpenNearestMerchant(); });
      // ESC → 关闭 modal
      this.input.keyboard.on('keydown-ESC', function () { self.tryCloseTopModal(); });

      // —— Modal 容器 (交易 modal / 背包 modal 共用) ——
      this.modalContainer = this.add.container(640, 360);
      this.modalContainer.setDepth(2000);
      this.modalContainer.setVisible(false);

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

    // ==================== 背包加载 (localStorage) ====================
    _loadLuggage: function () {
      var ids = [];
      try {
        var raw = localStorage.getItem('silkroad_luggage');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            ids = parsed.filter(function (n) { return typeof n === 'number'; });
          }
        }
      } catch (e) {}
      // 兜底: 没数据时给全部 8 件
      if (ids.length === 0) ids = ALL_ITEM_IDS.slice();
      // 去重
      var seen = {};
      var uniq = [];
      for (var i = 0; i < ids.length; i++) {
        if (!seen[ids[i]] && ALL_ITEM_IDS.indexOf(ids[i]) !== -1) {
          seen[ids[i]] = true;
          uniq.push(ids[i]);
        }
      }
      return uniq;
    },

    // ==================== 主循环 ====================
    update: function (time, delta) {
      if (this.state === 'DEAD') return;

      // 商贩 bob 动画
      for (var i = 0; i < this.merchantSprites.length; i++) {
        var sp = this.merchantSprites[i];
        sp.bobPhase += 0.04;
        sp.list[1].y = Math.sin(sp.bobPhase) * 2;   // emoji
        // M2: 已完成商贩加灰色覆盖
        if (this.merchantDone[sp.merchantData.id]) {
          sp.setAlpha(0.45);
        } else {
          sp.setAlpha(1);
        }
      }
      // 出口 bob + 脉冲 (M2)
      if (this.exitSprite) {
        this.exitSprite.bobPhase += 0.05;
        this.exitSprite.list[1].y = Math.sin(this.exitSprite.bobPhase) * 2;
        // 检查启程条件
        var canDepart = this.camels >= L.TARGET_CAMELS && this.water >= L.TARGET_WATERS;
        if (canDepart !== this.exitActive) {
          this.exitActive = canDepart;
          if (canDepart) this.startExitPulse();
          else this.stopExitPulse();
        }
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

      // M2: 距离检测 —— 气泡 / 出口触发
      if (this.state === 'PLAYING') {
        this._checkMerchantProximity();
        this._checkExitProximity();
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

      // 步长 + 水分消耗: 骑骆驼 48px/-0.08, 步行 24px/-0.1
      var step, waterDelta;
      if (this.camelMode && this.camels > 0) {
        step = L.STEP_PX_CAMEL;
        waterDelta = 0.08;
      } else {
        step = L.STEP_PX_WALK;
        waterDelta = L.WATER_PER_STEP;
      }

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

      this.changeWater(-waterDelta);
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

    // ==================== M2: 商贩距离检测 ====================
    _checkMerchantProximity: function () {
      var self = this;
      var nearest = null;
      var nearestDist = Infinity;
      for (var i = 0; i < L.merchants.length; i++) {
        var m = L.merchants[i];
        if (this.merchantDone[m.id]) continue;  // 已完成不显示气泡
        var dx = this.player.x - m.x;
        var dy = this.player.y - m.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = m; }
      }
      if (nearest && nearestDist < 50) {
        // 显示气泡
        if (this.merchantShownId !== nearest.id) {
          this.hideMerchantBubble();
          this.merchantShownId = nearest.id;
          this.showMerchantBubble(nearest);
        }
      } else {
        // 距离 > 60 隐藏
        if (this.merchantShownId !== null && nearestDist > 60) {
          this.hideMerchantBubble();
        }
      }
    },
    showMerchantBubble: function (m) {
      // 气泡: 「点击交易 💬」/ 「按空格交易」提示
      var bg = this.add.graphics();
      bg.fillStyle(0x2A1606, 0.92);
      bg.fillRoundedRect(-55, -16, 110, 32, 8);
      bg.lineStyle(2, 0xFFD98A, 0.8);
      bg.strokeRoundedRect(-55, -16, 110, 32, 8);
      // 小三角指向商贩
      bg.fillTriangle(-5, 16, 5, 16, 0, 22);
      var txt = this.add.text(0, 0, '点击交易 💬', {
        fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var bubble = this.add.container(m.x, m.y - 38, [bg, txt]);
      bubble.setDepth(50);
      this.merchantBubbles[m.id] = bubble;
    },
    hideMerchantBubble: function () {
      for (var k in this.merchantBubbles) {
        if (this.merchantBubbles[k]) {
          this.merchantBubbles[k].destroy();
          this.merchantBubbles[k] = null;
        }
      }
      this.merchantShownId = null;
    },

    // ==================== M2: 打开商贩 modal ====================
    tryOpenMerchant: function (id) {
      if (this.state !== 'PLAYING') return;
      var m = this._findMerchant(id);
      if (!m) return;
      // 必须靠近 (< 60px)
      var dx = this.player.x - m.x;
      var dy = this.player.y - m.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 60) return;
      if (this.merchantDone[m.id]) {
        this.showToast('已经交易过了 ✓', 1000);
        return;
      }
      this.openTradeModal(m);
    },
    tryOpenNearestMerchant: function () {
      if (this.state !== 'PLAYING') return;
      if (this.merchantShownId !== null) {
        this.tryOpenMerchant(this.merchantShownId);
      }
    },
    _findMerchant: function (id) {
      for (var i = 0; i < L.merchants.length; i++) {
        if (L.merchants[i].id === id) return L.merchants[i];
      }
      return null;
    },

    // ==================== M2: 交易 modal ====================
    openTradeModal: function (m) {
      var self = this;
      this.state = 'TRADING';
      this.currentMerchantId = m.id;
      this.selectedItemId = null;
      this.hideMerchantBubble();
      this.modalContainer.removeAll(true);
      window.playIranSfx('button', 0.4);

      // 背景遮罩
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      // card (高度 = 标题 + 收什么 + 背包 grid 4×2 + 提示 + 按钮)
      var card = this.add.rectangle(0, 0, 620, 540, 0x2A1606, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.modalContainer.add(card);

      // 标题
      this.modalContainer.add(this.add.text(0, -230, m.emoji + '  ' + m.name, {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -200, m.tip, {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
        wordWrap: { width: 560 },
      }).setOrigin(0.5));

      // 收什么 / 给什么
      var acceptEmoji = m.accept.map(function (aid) {
        for (var i = 0; i < ITEMS.length; i++) {
          if (ITEMS[i].id === aid) return ITEMS[i].emoji;
        }
        return '?';
      }).join(' ');
      var rewardEmoji = m.reward.type === 'camel' ? '🐪×' + m.reward.n : '💧×' + m.reward.n;
      this.modalContainer.add(this.add.text(-150, -160, '收：' + acceptEmoji, {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      this.modalContainer.add(this.add.text(60, -160, '给：' + rewardEmoji, {
        fontSize: '14px', color: '#F6B5C8', fontStyle: 'bold',
      }).setOrigin(0, 0.5));

      // 背包 grid 4×2 (8 件, 包括归家之心)
      var gridY = -100;
      var cellW = 130, cellH = 110;
      var startX = -cellW * 2 + 20;
      for (var i = 0; i < ITEMS.length; i++) {
        var it = ITEMS[i];
        var col = i % 4, row = Math.floor(i / 4);
        var cx = startX + col * cellW;
        var cy = gridY + row * cellH;

        var isConsumed = this.consumedIds.indexOf(it.id) !== -1;
        var isHeart = it.id === HEART_ID;
        var isSelected = this.selectedItemId === it.id;
        var isAccepted = m.accept.indexOf(it.id) !== -1;

        // cell 背景
        var cellAlpha = (isConsumed || isHeart) ? 0.35 : 1;
        var cellColor = isSelected
          ? (isAccepted ? 0xA8D8C0 : 0xC04848)
          : 0x4A2E1A;
        var cellBg = this.add.rectangle(cx, cy, cellW - 16, cellH - 16, cellColor, cellAlpha)
          .setStrokeStyle(2, isSelected ? 0xFFD98A : 0x6B4423, isSelected ? 1 : 0.4);
        this.modalContainer.add(cellBg);

        // emoji
        var em = this.add.text(cx, cy - 18, it.emoji, { fontSize: '32px' }).setOrigin(0.5);
        em.setAlpha((isConsumed || isHeart) ? 0.4 : 1);
        this.modalContainer.add(em);
        // 名字
        var nm = this.add.text(cx, cy + 22, it.name, {
          fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
          wordWrap: false,
        }).setOrigin(0.5);
        nm.setFixedSize(cellW - 28, 14);
        this.modalContainer.add(nm);
        // 状态标记
        if (isConsumed) {
          this.modalContainer.add(this.add.text(cx, cy + 6, '已用', {
            fontSize: '11px', color: '#888888', fontStyle: 'bold',
          }).setOrigin(0.5));
        } else if (isHeart) {
          this.modalContainer.add(this.add.text(cx, cy + 6, '❤️ 不交易', {
            fontSize: '10px', color: '#F6B5C8', fontStyle: 'bold',
          }).setOrigin(0.5));
        }

        // 点击区 (已消耗/归家之心不可点)
        if (!isConsumed && !isHeart) {
          var zone = this.add.zone(cx, cy, cellW - 16, cellH - 16)
            .setInteractive({ useHandCursor: true });
          var itemId = it.id;
          zone.on('pointerdown', (function (iid) {
            return function () {
              self.selectedItemId = iid;
              window.playIranSfx('click', 0.4);
              self.openTradeModal(m);  // 重渲染
            };
          })(itemId));
          this.modalContainer.add(zone);
        }
      }

      // 提示行
      var tipTxt = '';
      if (this.selectedItemId === null) {
        tipTxt = '👆 选一件要交易的商品';
      } else if (this.selectedItemId === HEART_ID) {
        tipTxt = '❤️ 归家之心太珍贵了';
      } else if (m.accept.indexOf(this.selectedItemId) !== -1) {
        var selItem = this._findItem(this.selectedItemId);
        tipTxt = '✓ ' + selItem.name + ' 他会收，给你 ' + rewardEmoji;
      } else {
        var selItem2 = this._findItem(this.selectedItemId);
        tipTxt = '✗ ' + selItem2.name + ' 他不收这个';
      }
      this.modalContainer.add(this.add.text(0, 140, tipTxt, {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
        wordWrap: { width: 540 },
      }).setOrigin(0.5));

      // 交易按钮
      var canTrade = this.selectedItemId !== null
        && this.consumedIds.indexOf(this.selectedItemId) === -1
        && this.selectedItemId !== HEART_ID
        && m.accept.indexOf(this.selectedItemId) !== -1;
      var tradeBtnColor = canTrade ? 0xFFD98A : 0x4A4A4A;
      var tradeBtnTextColor = canTrade ? '#2A190E' : '#888888';
      var tradeBg = this.add.rectangle(-90, 220, 180, 56, tradeBtnColor, canTrade ? 1 : 0.6)
        .setStrokeStyle(2, canTrade ? 0xFFE9B0 : 0x888888, canTrade ? 0.8 : 0.3);
      this.modalContainer.add(tradeBg);
      this.modalContainer.add(this.add.text(-90, 220, '交易', {
        fontSize: '17px', color: tradeBtnTextColor, fontStyle: 'bold',
      }).setOrigin(0.5));
      if (canTrade) {
        var tradeZone = this.add.zone(-90, 220, 180, 56).setInteractive({ useHandCursor: true });
        var itemIdToTrade = this.selectedItemId;
        tradeZone.on('pointerdown', function () {
          self.doTrade(m, itemIdToTrade);
        });
        this.modalContainer.add(tradeZone);
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(90, 220, 140, 56, 0x4A2E1A, 1)
        .setStrokeStyle(1, 0xFFD98A, 0.5);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(90, 220, '关闭', {
        fontSize: '15px', color: '#F4ECD8', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(90, 220, 140, 56).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeTradeModal(); });
      this.modalContainer.add(closeZone);

      // 隐藏 dpad
      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },

    closeTradeModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this.currentMerchantId = null;
      this.selectedItemId = null;
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
    },

    doTrade: function (m, itemId) {
      // 1) 消耗物品
      this.consumedIds.push(itemId);
      // 2) 给奖励
      if (m.reward.type === 'camel') {
        this.camels += m.reward.n;
        this.camelText.setText('🐪 骆驼 ' + this.camels + ' / ' + L.TARGET_CAMELS);
        this.flashCamelUI();
      } else if (m.reward.type === 'water') {
        this.changeWater(m.reward.n);
        this.flashWaterUI();
      }
      // 3) 商贩标记完成
      this.merchantDone[m.id] = true;
      this.completedMerchantIds.push(m.id);
      this.merchantText.setText('🏪 商贩 ' + this.completedMerchantIds.length + ' / 5');
      // 4) 商贩 sprite 变灰
      for (var i = 0; i < this.merchantSprites.length; i++) {
        if (this.merchantSprites[i].merchantData.id === m.id) {
          this.merchantSprites[i].setAlpha(0.45);
          // 禁用 hit zone
          if (this.merchantSprites[i].hitZone) {
            this.merchantSprites[i].hitZone.disableInteractive();
          }
        }
      }
      // 5) 更新骑乘按钮可见性
      this._updateCamelBtn();
      // 6) 音 + 关闭 modal
      window.playIranSfx('exchange', 0.55);
      window.playIranSfx('pickup', 0.4);
      this.showToast('交易成功！获得 ' + (m.reward.type === 'camel' ? '🐪' : '💧') + '×' + m.reward.n, 1200);
      this.closeTradeModal();
    },

    flashCamelUI: function () {
      var self = this;
      this.camelText.setColor('#FFE9B0');
      this.time.delayedCall(200, function () {
        if (self.camels < L.TARGET_CAMELS) self.camelText.setColor('#FFD98A');
        else self.camelText.setColor('#A8D8C0');
      });
    },

    _findItem: function (id) {
      for (var i = 0; i < ITEMS.length; i++) {
        if (ITEMS[i].id === id) return ITEMS[i];
      }
      return null;
    },

    // ==================== M2: 背包 modal (只读) ====================
    openLuggageModal: function () {
      var self = this;
      this.state = 'LUGGAGE';
      this.modalContainer.removeAll(true);

      // 背景遮罩
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      // card
      var card = this.add.rectangle(0, 0, 620, 480, 0x2A1606, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -210, '🎒 我的背包', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      // 摘要
      var left = 0;
      for (var i = 0; i < ITEMS.length; i++) {
        if (this.luggageIds.indexOf(ITEMS[i].id) !== -1
            && this.consumedIds.indexOf(ITEMS[i].id) === -1) left++;
      }
      this.modalContainer.add(this.add.text(0, -180, '剩余 ' + left + ' / ' + this.luggageIds.length + ' 件商品', {
        fontSize: '12px', color: '#A8D8C0', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 8 件商品 grid (按 id 排序)
      var sorted = ITEMS.slice().sort(function (a, b) { return a.id - b.id; });
      var cellW = 130, cellH = 100;
      var startX = -cellW * 2 + 20;
      var gridY = -120;
      for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        var col = i % 4, row = Math.floor(i / 4);
        var cx = startX + col * cellW;
        var cy = gridY + row * cellH;

        var inLuggage = this.luggageIds.indexOf(it.id) !== -1;
        var isConsumed = this.consumedIds.indexOf(it.id) !== -1;
        var dim = !inLuggage || isConsumed;
        var isHeart = it.id === HEART_ID;

        var cellBg = this.add.rectangle(cx, cy, cellW - 16, cellH - 16, 0x4A2E1A, dim ? 0.35 : 1)
          .setStrokeStyle(2, isHeart ? 0xF6B5C8 : 0x6B4423, isHeart ? 0.7 : 0.4);
        this.modalContainer.add(cellBg);
        var em = this.add.text(cx, cy - 16, it.emoji, { fontSize: '32px' }).setOrigin(0.5);
        em.setAlpha(dim ? 0.4 : 1);
        this.modalContainer.add(em);
        var nm = this.add.text(cx, cy + 18, it.name, {
          fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
          wordWrap: false,
        }).setOrigin(0.5);
        nm.setFixedSize(cellW - 28, 14);
        this.modalContainer.add(nm);

        // 状态文字
        var status = '';
        var statusColor = '#888888';
        if (!inLuggage) {
          status = '未拥有';
          statusColor = '#888888';
        } else if (isConsumed) {
          status = '已交易';
          statusColor = '#888888';
          // 划线
          var strike = this.add.graphics();
          strike.lineStyle(2, 0x888888, 0.7);
          strike.beginPath();
          strike.moveTo(cx - 30, cy - 5);
          strike.lineTo(cx + 30, cy + 5);
          strike.strokePath();
          this.modalContainer.add(strike);
        } else if (isHeart) {
          status = '❤️ 不可交易';
          statusColor = '#F6B5C8';
        } else {
          status = '✓ 可交易';
          statusColor = '#A8D8C0';
        }
        this.modalContainer.add(this.add.text(cx, cy + 34, status, {
          fontSize: '10px', color: statusColor, fontStyle: 'bold',
        }).setOrigin(0.5));
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 200, 200, 50, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 200, '关闭', {
        fontSize: '16px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 200, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeLuggageModal(); });
      this.modalContainer.add(closeZone);

      // 隐藏 dpad
      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },
    closeLuggageModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
    },
    tryCloseTopModal: function () {
      if (this.state === 'TRADING') this.closeTradeModal();
      else if (this.state === 'LUGGAGE') this.closeLuggageModal();
    },

    // ==================== M2: 骆驼骑乘 toggle ====================
    toggleCamelMode: function () {
      if (this.camels <= 0) return;
      this.camelMode = !this.camelMode;
      this._updateCamelBtn();
      window.playIranSfx('click', 0.4);
      window.playIranSfx('pickup', 0.3);
    },
    _updateCamelBtn: function () {
      if (this.camels > 0) {
        this.camelBtn.setVisible(true);
        this.camelBtn.setText(this.camelMode ? '🐪 骑乘中' : '🚶 步行');
        this.camelBtn.setStyle({
          backgroundColor: this.camelMode ? '#5B8C3A' : '#1B5E8A',
          padding: { x: 8, y: 2 },
        });
      } else {
        this.camelBtn.setVisible(false);
        this.camelMode = false;
      }
      // 玩家下方 🐪 装饰
      if (this.camelBackEmoji) {
        this.camelBackEmoji.setVisible(this.camelMode && this.camels > 0);
      }
    },

    // ==================== M2: 出口距离 + 脉冲 + 启程 ====================
    _checkExitProximity: function () {
      var dx = this.player.x - L.exit.x;
      var dy = this.player.y - L.exit.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 50 && !this._exitTriggered) {
        this._exitTriggered = true;
        this.tryExit();
      } else if (d > 70) {
        this._exitTriggered = false;
      }
    },
    tryExit: function () {
      var needCamels = Math.max(0, L.TARGET_CAMELS - this.camels);
      var needWater = Math.max(0, L.TARGET_WATERS - Math.floor(this.water));
      if (needCamels === 0 && needWater === 0) {
        this.showDepartModal();
      } else {
        var msg = '还需要 ';
        if (needCamels > 0) msg += needCamels + '🐪 ';
        if (needWater > 0) msg += needWater + '💧 ';
        msg = msg.trim() + ' 才能启程';
        this.showToast(msg, 2200);
        window.playIranSfx('click', 0.3);
      }
    },
    showDepartModal: function () {
      var self = this;
      this.state = 'TRADING';  // 暂停移动
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.55);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 520, 360, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -120, L.exit.emoji, { fontSize: '56px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -55, '启程条件已满足！', {
        fontSize: '22px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -15, 'M3 将启程去土耳其 🇹🇷\n' +
        '🐪 骆驼 ' + this.camels + '/' + L.TARGET_CAMELS + '  ·  ' +
        '💧 水分 ' + this.water.toFixed(1) + '/' + L.TARGET_WATERS, {
        fontSize: '13px', color: '#A8D8C0', align: 'center', wordWrap: { width: 460 },
      }).setOrigin(0.5));

      // 确认按钮
      var okBg = this.add.rectangle(0, 90, 220, 56, 0x5fb3a0, 1);
      this.modalContainer.add(okBg);
      this.modalContainer.add(this.add.text(0, 90, '继续探索', {
        fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
      }).setOrigin(0.5));
      var okZone = this.add.zone(0, 90, 220, 56).setInteractive({ useHandCursor: true });
      okZone.on('pointerdown', function () {
        window.playIranSfx('button', 0.4);
        self.modalContainer.setVisible(false);
        self.modalContainer.removeAll(true);
        self.state = 'PLAYING';
        self.joystickContainer.setVisible(true);
      });
      this.modalContainer.add(okZone);

      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
      window.playIranSfx('pickup', 0.5);
    },

    startExitPulse: function () {
      var self = this;
      if (this._exitPulseTween) return;
      this._exitPulseTween = this.tweens.add({
        targets: this.exitSprite,
        scaleX: 1.15, scaleY: 1.15,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    },
    stopExitPulse: function () {
      if (this._exitPulseTween) {
        this._exitPulseTween.stop();
        this._exitPulseTween = null;
      }
      if (this.exitSprite) {
        this.exitSprite.scaleX = 1;
        this.exitSprite.scaleY = 1;
      }
    },

    // ==================== 通用 toast ====================
    showToast: function (msg, durationMs) {
      durationMs = durationMs || 1500;
      if (!this._toast) {
        this._toast = this.add.text(L.CANVAS_W / 2, 130, msg, {
          fontSize: '16px', color: '#FFD98A', backgroundColor: '#2A1606',
          padding: { x: 14, y: 8 }, fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(1500);
      } else {
        this._toast.setText(msg);
      }
      this._toast.setAlpha(1);
      if (this._toastTween) this._toastTween.stop();
      this._toastTween = this.tweens.add({
        targets: this._toast,
        alpha: 0,
        duration: 600,
        delay: durationMs - 600,
      });
    },

    // ==================== 渴死 ====================
    dieFromThirst: function () {
      this.state = 'DEAD';
      this.joystickContainer.setVisible(false);
      this.stopExitPulse();
      window.playIranSfx('die', 0.6);

      // 半透明黑幕
      var overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55);
      // DEAD 文字
      this.add.text(640, 280, '💀', { fontSize: '80px' }).setOrigin(0.5);
      this.add.text(640, 360, '你渴死在波斯沙漠了', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 400, '复活 / 重新出发 / 寄信回家（即将推出）', {
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
                if (p2 && typeof p2.catch === 'function') p2.catch(function () {});
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
