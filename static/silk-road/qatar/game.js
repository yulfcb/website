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
    preload: function () {
      // M9.6a: User-provided World Cup trophy (white-bg key-out PNG) loaded once here
      // so all scenes can reference it by key 'world-cup-trophy'.
      this.load.image('world-cup-trophy',
        '/static/vendor/silk-road/trophy/world-cup-trophy-128.png');
    },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#1b2135');
      this.add.text(640, 360, '加载中…', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      // 短暂延迟 → IntroScene（保留 0 ms 也行；这里 30 ms 让浏览器渲一帧）
      // 用闭包 self 引 BootScene，避免 time.delayedCall 把 args 当 this（Phaser 3 API）
      this.time.delayedCall(30, function () {
        self.scene.start('IntroScene', { sessionId: SESSION_ID, nickname: nickname });
      });
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

      // NPC banner — M11: 港口 ⚓ 替换老商人 👳
      var card = this.add.rectangle(640, 280, 880, 220, 0x4A2E1A, 0.95)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.add.text(360, 280, L.port.emoji, { fontSize: '64px' }).setOrigin(0.5);
      this.add.text(640, 240, L.port.name, {
        fontSize: '12px', color: '#5fb3a0', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(720, 300, L.npcFrames[0], {
        fontSize: '18px', color: '#F4ECD8', fontStyle: 'italic',
        wordWrap: { width: 460 },
      }).setOrigin(0.5);

      // 标题
      this.add.text(640, 100, '关卡 0 · 起航·多哈沙海', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 140, '丝绸之路 · 陆上 · 第 0 段', {
        fontSize: '14px', color: '#A8D8C0',
      }).setOrigin(0.5);

      // ===== M9.1 角色选择面板 =====
      // 4 个造型：阿拉伯男女 / 中国男女
      // 玩家在 IntroScene 一开始就要选自己形象，存 localStorage['silkroad_avatar']
      // 选完后点"开 始"才进 PlayScene
      this._selectedAvatar = localStorage.getItem('silkroad_avatar') || 'malay';
      if (!['malay','fala','cn_m','cn_f'].includes(this._selectedAvatar)) this._selectedAvatar = 'malay';
      // 4 个 label 在 (640, 530), avatar cards 在 (640, 590) 130 high = 525-655
      this._renderAvatarPicker(640, 590);

      // 关卡任务说明 - 在 NPC banner 与 avatar picker 之间
      // M9.1: 不做 narrative card 改做一行显眼的小卡
      this.add.text(640, 485, '🧳 任务：在沙海收集 6 件礼物，徒步步行，不靠骆驼', {
        fontSize: '16px', color: '#F4ECD8', fontStyle: 'italic', wordWrap: { width: 1000 },
      }).setOrigin(0.5);

      // 开始按钮 - 下移避开 avatar picker
      var btnBg = this.add.rectangle(640, 680, 280, 80, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.add.text(640, 680, '开 始', {
        fontSize: '32px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(640, 680, 280, 80).setInteractive({ useHandCursor: true });
      var self = this;
      btnZone.on('pointerdown', function () {
        // M9.1: 把选好的 avatar 也带到 PlayScene
        self.scene.start('PlayScene', {
          sessionId: self.sessionId, nickname: self.nickname,
          avatar: self._selectedAvatar,
        });
      });

      // 底部提示
      this.add.text(640, 750, '提示：触屏使用左下方向键 · 键盘使用方向键或 WASD', {
        fontSize: '13px', color: '#C9B89A',
      }).setOrigin(0.5);
    },
  });

  // ==================== PlayScene ====================
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    init: function (data) {
      this.initData = data || {};   // M9.1: 把 introScene 传过来的 data 存住
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

      // —— 7 个礼物 ——
      this.giftSprites = [];
      // M9.5g: 给每个 gift 单独构建 sprite.
      // M9.6a: gift 6 (大力神杯) 现在用 user-provided PNG (从 PNG vendor 中 load),
      // 其他 6 个保留 emoji (修饰, 省事).
      L.gifts.forEach(function (g) {
        var sprite;
        if (g.id === 6) {
          // M9.6a: World Cup trophy — 用 user-provided PNG (key-out 白底).
          // PNG 128x128 sprite 框内有 sports decoration.
          // 给我们 gift 大体 64x64 显示 (调 display size).
          var container = self.add.container(g.x, g.y);
          // 光晕 (金黄) 跟其他 gift 一致
          var glow = self.add.graphics();
          glow.fillStyle(0xFFD98A, 0.4);
          glow.fillCircle(0, 0, 28);
          container.add(glow);
          // 实际杯 (use image)
          var trophyImg = self.add.image(0, 0, 'world-cup-trophy');
          trophyImg.setDisplaySize(56, 56);  // 跟其他 gift emoji 38px ~ 一致
          container.add(trophyImg);
          // label
          var label = self.add.text(0, 30, g.name, {
            fontSize: '11px', color: '#FFD98A', fontStyle: 'bold',
            stroke: '#4A2E1A', strokeThickness: 3,
          }).setOrigin(0.5);
          container.add(label);
          sprite = container;
        } else {
          var glow = self.add.graphics();
          glow.fillStyle(0xFFD98A, 0.35);
          glow.fillCircle(0, 0, 22);
          var bag = self.add.text(0, 0, g.emoji, { fontSize: '32px' }).setOrigin(0.5);
          var label = self.add.text(0, 22, g.name, {
            fontSize: '11px', color: '#4A2E1A', fontStyle: 'bold',
          }).setOrigin(0.5);
          sprite = self.add.container(g.x, g.y, [glow, bag, label]);
        }
        sprite.giftData = g;
        sprite.collected = false;
        sprite.bobPhase = Math.random() * Math.PI * 2;
        self.giftSprites.push(sprite);
      });

      // —— 港口 NPC (M11: 老商人 → 港口 ⚓) ——
      // 海蓝主题圆 + ⚓ 锚图标
      var mBg = this.add.graphics();
      mBg.fillStyle(0x5fb3a0, 0.45);
      mBg.fillCircle(0, 0, 22);
      var mEmoji = this.add.text(0, 0, L.port.emoji, { fontSize: '34px' }).setOrigin(0.5);
      this.merchantSprite = this.add.container(L.port.x, L.port.y, [mBg, mEmoji]);

      // —— 玩家：造型小人（有身体）——
      // M9.3b：不只用 emoji 脸——用 Phaser.Graphics 程序画 4 个有身体的造型。
      // 阿拉伯男：白袍 (thobe) + 头巾 (ghutra) + 黑色 agal 环
      // 阿拉伯女：黑色长袍 (abaya) + 头巾 (hijab)
      // 中国男：黑发 + 汉服对襟
      // 中国女：长发垂下 + 汉服对襟
      // facing: -1 左 / 1 右 —— elf 整体 flipX 镜像（emoji/graphics 都行）
      var avatarId = (this.initData && this.initData.avatar) || localStorage.getItem('silkroad_avatar') || 'malay';
      if (!window.QATAR_AVATARS[avatarId]) avatarId = 'malay';
      this._avatar = avatarId;
      var elf = this._buildAvatarSprite(avatarId); // 返回 Graphics
      // 影子圆让它"踩地"
      var shadow = this.add.ellipse(0, 22, 22, 6, 0x000000, 0.18);
      this.playerContainer = this.add.container(L.start.x, L.start.y, [shadow, elf]);
      this.playerSprite = { shadow: shadow, elf: elf, avatarId: avatarId };

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
      // M11: 行李总价 HUD —— 跟 luggage 文字并排, 显示已装进行李的礼物总价
      this.priceText = this.add.text(1100, 56, '💰 ¥0', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.npcText = this.add.text(640, 80, L.npcFrames[0], {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5);

      // —— 虚拟方向键（左下 Phaser Container）——
      this.keys = { up: false, down: false, left: false, right: false };
      // M9.5a: dpad 缩小到 0.6 倍 + 半透明 + 推到左下 (110, 620), 不挡场景
      this.joystickContainer = this.add.container(110, 620);
      this.joystickContainer.setAlpha(0.72);                 // 半透明 — 玩家仍能看见自己 + 场景
      this.joystickContainer.setScale(0.6);                  // 缩小 60%
      this.joystickContainer.setDepth(500);                  // 在场景之上, 在 modal(2000) 之下

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

      // M9.2: 按住持续走 update loop - 自动 walk tick
      // 通过 this.scene.events 在 update cycle 检查 self.keys[key]
      this.events.on('update', this._movementUpdate, this);

      // —— 拾起/确认按钮（右下）——
      // M9.5f: 拾起按钮删除 — pickup 是 tryMove 内 checkGiftCollision 自动触发的, OK 按钮完全多余.
      // 用户从未用过 — 删掉避免误会, 场景更干净.
      // (actionContainer 占位已删除)

      // —— 暂停按钮（左上 Phaser Zone）——
      var pauseBg = this.add.circle(60, 100, 24, 0x4A2E1A, 0.92)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.pauseBtnText = this.add.text(60, 100, '⏸', { fontSize: '20px' }).setOrigin(0.5);
      var pauseZone = this.add.zone(60, 100, 48, 48).setInteractive({ useHandCursor: true });
      pauseZone.on('pointerdown', function () { self.togglePause(); });
      this.pauseContainer = this.add.container(0, 0, [pauseBg, this.pauseBtnText, pauseZone]);

      // —— Modal 容器（礼物 modal / 老商人 popup / 复活 modal 共用）——
      // M9.5b: modalContainer 移到 (640, 240) (中上), 不挡 dpad 区域 (左下 620)
      // backdrop alpha 从 0.78 降到 0.45 — 玩家能透过看到自己 + 场景
      this.modalContainer = this.add.container(640, 240);
      this.modalContainer.setDepth(2000);
      this.modalContainer.setVisible(false);

      // —— Keyboard 监听 (M9.2: 按住持续走) ——
      // keydown 设 keys[key]=true；keyup 设 false；update 循环读 keys 决定是否 tryMove
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

      // 走动画 —— 徒步小人=M8.5，关 0 没有骆驼了
      if (Date.now() - this.player.lastMoveAt < 200) {
        this.player.walkPhase += 0.2;
        if (this.playerSprite) {
          this.playerSprite.elf.y = Math.sin(this.player.walkPhase) * 1.5;
        }
      } else if (this.playerSprite) {
        this.playerSprite.elf.y = 0;
      }

      // 港口 NPC 距离检测 —— M11 用 L.port.x/y (老商人位置已废弃)
      // 触发规则：玩家进 50px 触发；触发后必须走开 200px 才算"用完一次对话"。
      var dx = this.player.x - L.port.x;
      var dy = this.player.y - L.port.y;
      var merchantDist = Math.sqrt(dx * dx + dy * dy);
      if (merchantDist < 50 && !this.merchantShown) {
        this.showPort();
      } else if (merchantDist > 200 && this.merchantShown) {
        this.merchantShown = false;   // 走远才放行下次触发
      }
    },

    // ==================== 移动 ====================
    _movementUpdate: function () {
      // M9.2: 按住持续走 — update 每一帧检查 keys，按下则 tryMove
      if (this.state !== 'PLAYING' || this.paused) return;
      if (this.keys.up)    this.tryMove('up');
      if (this.keys.down)  this.tryMove('down');
      if (this.keys.left)  this.tryMove('left');
      if (this.keys.right) this.tryMove('right');
    },
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
        // M11 part 5: 边界 = 走不动，不扣血 (撞墙无 penalty). 显示短暂 toast 提示.
        this.showBoundaryToast();
        return;
      }

      this.player.x = nx;
      this.player.y = ny;
      this.player.lastMoveAt = now;
      this.playerContainer.x = nx;
      this.playerContainer.y = ny;
      // M9.3b-fix: Graphics + Container 都没有 setFlipX 走 transform。
      // 直接 set scaleX=-1 镜像（含影子椭圆——圆形镜像仍是圆形，无视觉差）。
      // 注意：Phaser GameObject base 上 `flipX` 属性本身有效（无报错），
      // 但 transform pipeline 要 `hasTransformComponent` 才生效（这是 M8.5 状态机的潜规则）。
      if (this.playerContainer) {
        var sx = this.player.facing === -1 ? -1 : 1;
        // 镜像符号翻转，但保持绝对 scale 增量
        var baseScale = 1; // 未来如果有 ±scale 动画再乘
        this.playerContainer.scaleX = sx * baseScale;
      }

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

    // M11 part 5: 撞墙 toast — 短暂提示玩家走到边界, 不扣血 (替代原 WATER_BOUNDARY_HIT)
    showBoundaryToast: function () {
      if (!this.boundaryToast) {
        this.boundaryToast = this.add.text(L.CANVAS_W / 2, L.CANVAS_H / 2 - 100, '🚧 撞墙了', {
          fontSize: '18px', color: '#FFD98A', backgroundColor: '#2A2140',
          padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(1000);
      }
      this.boundaryToast.setAlpha(1);
      this.boundaryToast.setPosition(L.CANVAS_W / 2, L.CANVAS_H / 2 - 100);
      // 重复触发时杀掉旧 tween, 否则 alpha 会被叠加错误
      if (this._boundaryTween) this._boundaryTween.stop();
      this._boundaryTween = this.tweens.add({
        targets: this.boundaryToast,
        alpha: 0,
        duration: 600,
        delay: 400,
      });
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
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.45);  // M9.5b 透明度 0.78->0.45
      // M8.5：backdrop 不该 interactive，否则会截掉按钮点击
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 420, 0x4A2E1A, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -150, g.emoji, { fontSize: '56px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -80, '你拾起了「' + g.name + '」', {
        fontSize: '20px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      // M11: 礼物价格显示 — 船票兑换门槛要算总价
      this.modalContainer.add(this.add.text(0, -50, '💰 ¥' + (g.price || 0) + '  ·  ' + g.hint, {
        fontSize: '13px', color: '#FFE9B0', wordWrap: { width: 400 },
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
      (this.actionContainer && this.actionContainer.setVisible(false));
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
      // M11: 拾满 6 弹 pickup-done modal —— 提示玩家去港口兑换船票 (不再直接 enterResult).
      if (this.pickupCount >= 6) {
        this._showPickupMaxedModal();
        return;
      }
      // 恢复 joystick / action / pause
      this.joystickContainer.setVisible(true);
      (this.actionContainer && this.actionContainer.setVisible(true));
      this.pauseContainer.setVisible(true);
    },

    // M11 part 3: 拾满 6 件 → 弹 pickup-done modal, 提示去港口兑换船票
    _showPickupMaxedModal: function () {
      var self = this;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 320, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -110, '🎁', { fontSize: '52px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -55, '礼物都拾齐了！', {
        fontSize: '22px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -15, '去港口 ⚓ 兑换船票\n装进行李 ' + this.luggageCount + '/' + L.LUGGAGE_MAX + '  ·  总价 ¥' + this.totalLuggagePrice() + ' / ¥' + L.PORT_TICKET_PRICE_THRESHOLD, {
        fontSize: '13px', color: '#A8D8C0', align: 'center', wordWrap: { width: 380 },
      }).setOrigin(0.5));

      // "知道了" 按钮
      var btnBg = this.add.rectangle(0, 100, 200, 56, 0x5fb3a0, 1);
      var btnText = this.add.text(0, 100, '知道了', {
        fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(0, 100, 200, 56).setInteractive({ useHandCursor: true });
      btnZone.on('pointerdown', function () {
        self.modalContainer.setVisible(false);
        self.joystickContainer.setVisible(true);
        self.actionContainer && self.actionContainer.setVisible(true);
        self.pauseContainer.setVisible(true);
      });

      this.modalContainer.add([btnBg, btnText, btnZone]);
      // 不显示 dpad (玩家需要走去港口)
      this.joystickContainer.setVisible(true);
      (this.actionContainer && this.actionContainer.setVisible(true));
      this.pauseContainer.setVisible(true);
      this.modalContainer.setVisible(true);
    },

    decideGift: function (choice) {
      if (this.currentGiftId === null) return;
      this.giftBuckets[this.currentGiftId] = choice;
      if (choice === 'bucket') {
        this.luggageCount++;
        this.luggageText.setText('🧳 行李 ' + this.luggageCount + ' / ' + L.LUGGAGE_MAX);
      }
      // M11: 行李总价 HUD 实时更新 (bucket/drop 都影响)
      this._updatePriceHud();
      this.closeGiftModal();
    },

    // ==================== 港口 NPC popup (M11: 老商人 → 港口 ⚓) ====================
    showPort: function () {
      var self = this;
      if (this.merchantShown) return;
      // 2.5 秒内不要重复触发（M8.4：避免玩家关掉 modal 立刻又开=体验卡死循环）
      if (this._merchantCooldownUntil && Date.now() < this._merchantCooldownUntil) return;
      this.merchantShown = true;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);  // M11 海蓝主题 (跟港口 ocean 同色)
      // M8.5：backdrop 不该 interactive！之前 setInteractive 把所有点击截了，
      // 玩家以为点的是按钮实际点中了 backdrop → 关不掉 modal
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 360, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      // M11 part 3: 港口船票兑换条件
      //   - 拾满 6 件 (pickupCount >= 6)
      //   - 行李装够 MIN_LUGGAGE_TO_BOARD 件 (默认 5)
      //   - 行李总价 >= PORT_TICKET_PRICE_THRESHOLD (默认 ¥170)
      var hasAllGifts = this.pickupCount >= 6;
      var totalPrice = this.totalLuggagePrice();
      var canAfford = totalPrice >= L.PORT_TICKET_PRICE_THRESHOLD;
      var enoughLuggage = this.luggageCount >= L.MIN_LUGGAGE_TO_BOARD;
      var canExchange = hasAllGifts && canAfford && enoughLuggage;

      this.modalContainer.add(this.add.text(0, -130, L.port.emoji, { fontSize: '52px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -90, L.port.name, {
        fontSize: '14px', color: '#5fb3a0', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -50, L.port.line, {
        fontSize: '13px', color: '#FFE9B0', fontStyle: 'italic', wordWrap: { width: 400 },
      }).setOrigin(0.5));

      if (hasAllGifts && canExchange) {
        // ✅ 全部满足 → 兑换船票主按钮 (可点)
        this.modalContainer.add(this.add.text(0, 30, '好！礼物都齐了，我给你一张去伊朗的船票 🚢', {
          fontSize: '13px', color: '#A8D8C0', fontStyle: 'italic', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        var ticketBg = this.add.rectangle(-100, 130, 180, 56, 0x5fb3a0, 1);
        var ticketText = this.add.text(-100, 130, '🎫 兑换船票', {
          fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
        }).setOrigin(0.5);
        var ticketZone = this.add.zone(-100, 130, 180, 56).setInteractive({ useHandCursor: true });
        ticketZone.on('pointerdown', function () {
          self._ticketExchanged = true;
          self._showTicketModal();
        });

        var laterBg = this.add.rectangle(100, 130, 140, 56, 0x1B3A5E, 1)
          .setStrokeStyle(1, 0x5fb3a0, 0.6);
        var laterText = this.add.text(100, 130, '暂时不要', {
          fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        }).setOrigin(0.5);
        var laterZone = this.add.zone(100, 130, 140, 56).setInteractive({ useHandCursor: true });
        laterZone.on('pointerdown', function () {
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          self.pauseContainer.setVisible(true);
        });

        this.modalContainer.add([ticketBg, ticketText, ticketZone, laterBg, laterText, laterZone]);
      } else if (hasAllGifts && !canExchange) {
        // ⚠️ 拾满 6 但不满足兑换条件 → 灰色禁用按钮 + 提示缺啥
        var reasons = [];
        if (!enoughLuggage) reasons.push('行李不足 ' + this.luggageCount + '/' + L.MIN_LUGGAGE_TO_BOARD);
        if (!canAfford) reasons.push('总价 ¥' + totalPrice + ' / ¥' + L.PORT_TICKET_PRICE_THRESHOLD);
        this.modalContainer.add(this.add.text(0, 30, '礼物都齐了！但还差一点点:\n' + reasons.join(' · '), {
          fontSize: '12px', color: '#F6B5C8', align: 'center', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        // 禁用按钮 (灰色)
        var disabledBg = this.add.rectangle(-100, 130, 180, 56, 0x4A4A4A, 0.6)
          .setStrokeStyle(1, 0x888888, 0.4);
        var disabledText = this.add.text(-100, 130, '🎫 兑换船票', {
          fontSize: '15px', color: '#888888', fontStyle: 'bold',
        }).setOrigin(0.5);
        // 不挂 interactive, 点了不响应

        var laterBg2 = this.add.rectangle(100, 130, 140, 56, 0x1B3A5E, 1)
          .setStrokeStyle(1, 0x5fb3a0, 0.6);
        var laterText2 = this.add.text(100, 130, '知道了', {
          fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        }).setOrigin(0.5);
        var laterZone2 = this.add.zone(100, 130, 140, 56).setInteractive({ useHandCursor: true });
        laterZone2.on('pointerdown', function () {
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          self.pauseContainer.setVisible(true);
        });

        this.modalContainer.add([disabledBg, disabledText, laterBg2, laterText2, laterZone2]);
      } else {
        // 没拾满: 普通对话 — 1 个按钮
        this.modalContainer.add(this.add.text(0, 60, '礼物还没齐（' + this.pickupCount + '/6），先去把 6 件都找齐了再来找我吧。', {
          fontSize: '12px', color: '#A8D8C0', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        var btnBg = this.add.rectangle(0, 130, 160, 56, 0x5fb3a0, 1);
        var btnText = this.add.text(0, 130, '知道了', {
          fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
        }).setOrigin(0.5);
        var btnZone = this.add.zone(0, 130, 160, 56).setInteractive({ useHandCursor: true });
        btnZone.on('pointerdown', function () {
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          self.pauseContainer.setVisible(true);
        });
        this.modalContainer.add([btnBg, btnText, btnZone]);
      }

      this.joystickContainer.setVisible(false);
      (this.actionContainer && this.actionContainer.setVisible(false));
      this.pauseContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },

    // M9.5d: 兑换船票 modal — 显示船票 get 模态, 关闭后如果全拾齐则进入 result.
    // M11: 海蓝港口主题 (跟 port NPC 一致)
    _showTicketModal: function () {
      var self = this;
      this.modalContainer.removeAll(true);
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 340, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -130, '⚓', { fontSize: '52px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -75, 'Doha Port 多哈港', {
        fontSize: '14px', color: '#5fb3a0', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -35, '船票已兑换！', {
        fontSize: '22px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, 5, '波斯湾之旅已开启\n下一站: 伊朗 🐪', {
        fontSize: '13px', color: '#A8D8C0', align: 'center', wordWrap: { width: 360 },
      }).setOrigin(0.5));

      // 大按钮 "起航前往伊朗 →"
      var goBg = this.add.rectangle(0, 100, 300, 60, 0x5fb3a0, 1);
      var goText = this.add.text(0, 100, '起航前往伊朗 →', {
        fontSize: '17px', color: '#0E2A47', fontStyle: 'bold',
      }).setOrigin(0.5);
      var goZone = this.add.zone(0, 100, 300, 60).setInteractive({ useHandCursor: true });
      goZone.on('pointerdown', function () {
        self.modalContainer.setVisible(false);
        // M11 part 3: 兑换船票 → 必须在 canExchange 前提下才能 enterResult.
        // canExchange = hasAllGifts && enoughLuggage && canAfford (跟 showPort 同步).
        var canExchangeNow = self.pickupCount >= 6
          && self.luggageCount >= L.MIN_LUGGAGE_TO_BOARD
          && self.totalLuggagePrice() >= L.PORT_TICKET_PRICE_THRESHOLD;
        if (canExchangeNow) {
          self.enterResult();
        } else {
          // 没满足条件不允许通关 — 关闭 modal 给玩家继续走
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          self.pauseContainer.setVisible(true);
        }
      });

      this.modalContainer.add([goBg, goText, goZone]);
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
      // M9.5g: 用户要求无论 pickupCount 多少, 都强制原地复活 (原 giveUp 路径, 玩家失去所有努力感).
      // 之前 `this.pickupCount >= 3` = false 时直接 giveUp (放弃所有); 现在一律 true → 原地复活.
      this.showReviveModal(true);
    },

    showReviveModal: function (forceRestart) {
      var self = this;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.45);  // M9.5b 0.85->0.45
      // M8.5：backdrop 不该 interactive
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 500, 380, 0x3A2140, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -140, '💧 渴死啦', {
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
      (this.actionContainer && this.actionContainer.setVisible(false));
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
        // M11 part 5: textarea 缩小, top 抬到 46% 让出空间给发送键; 移动设备再缩到 max-height 80px 避 iOS 键盘遮太多
        var isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        var minH = isMobile ? '40px' : '60px';
        var maxH = isMobile ? '80px' : '120px';
        ta.style.cssText = [
          'position:fixed',
          'left:50%', 'top:46%',
          'transform:translate(-50%,-50%)',
          'width:min(420px,90vw)',
          'min-height:' + minH,
          'max-height:' + maxH,
          'padding:8px 12px',
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
      (this.actionContainer && this.actionContainer.setVisible(true));
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
            // M9.5g: 原地复活 — 不强制回 start. 在玩家当前坐标补 5 滴血 (从死亡定格中复活)
            this.water = 5;
            // player.x/y 已经在原地, 不重置. 只重置 container 让 sprite 跟得上 (graphics bug protection)
            this.playerContainer.x = this.player.x;
            this.playerContainer.y = this.player.y;
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
    // M11: 行李总价 —— 装进行李 (bucket) 的礼物 price 之和
    totalLuggagePrice: function () {
      var total = 0;
      var keys = Object.keys(this.giftBuckets);
      for (var i = 0; i < keys.length; i++) {
        if (this.giftBuckets[keys[i]] === 'bucket') {
          var id = parseInt(keys[i], 10);
          // 在 L.gifts 中按 id 查 price
          for (var j = 0; j < L.gifts.length; j++) {
            if (L.gifts[j].id === id) { total += (L.gifts[j].price || 0); break; }
          }
        }
      }
      return total;
    },
    _updatePriceHud: function () {
      if (!this.priceText) return;
      this.priceText.setText('💰 ¥' + this.totalLuggagePrice());
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

      // ===== M8.5 关 0 → 关 1 叙事桥 =====
      // 关 0 攒出钱后，关 1 才是伊朗港口上船
      this.add.text(640, 475, this.given ? '💸' : '🛳️ 用这一关攒的钱，下一站 → 伊朗港口上船', {
        fontSize: '13px', color: '#A8D8C0', fontStyle: 'italic',
      }).setOrigin(0.5);

      // 状态
      this.statusText = this.add.text(640, 510, this.given ? '已放弃复活' : '推送中…', {
        fontSize: '14px', color: '#A8D8C0',
      }).setOrigin(0.5);

      // ===== M9.5e: Voyage Scene — 关 0 通关后, 继续按钮触发船去伊朗动画 =====
      // 先创建 voyageContainer (默认 hidden). 点继续按钮 -> 显示 voyage 1.8s -> window.location
      this.buildVoyageContainer();

      var nextBg = this.add.rectangle(640, 555, 280, 60, 0xFFD98A, 1);
      var nextText = this.add.text(640, 555, '继续下一关 →', {
        fontSize: '20px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var nextZone = this.add.zone(640, 555, 280, 60).setInteractive({ useHandCursor: true });
      var self = this;
      nextZone.on('pointerdown', function () {
        // 隐藏 next button + statusText — 全部让位给 voyage 动画
        self.playVoyageAnimation('/games/silk-road/level/1');
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

  // ==================== M9.5e Voyage 动画 ====================
  // 关 0 通关 → ResultScene → 点继续 → playVoyageAnimation() → 1.8s → window.location.href 到 next 关
  // 在 ResultScene 上画海面 + 船 + 字幕. 只用 graphics 内联, 不引外部资源.
  ResultScene.prototype.buildVoyageContainer = function () {
    var self = this;
    this.voyageContainer = this.add.container(0, 0);
    this.voyageContainer.setDepth(3000);  // 盖住所有 ResultScene UI
    this.voyageContainer.setVisible(false);

    // 1) 海面背景 (深蓝渐变 + 海浪)
    var seaBg = this.add.rectangle(640, 360, 1280, 720, 0x0E2A47, 1);
    this.voyageContainer.add(seaBg);
    // 海面渐变 layer (上深下浅)
    var grad = this.add.graphics();
    grad.fillGradientStyle(0x1B3A5E, 0x1B3A5E, 0x4A7AAB, 0x4A7AAB, 1);
    grad.fillRect(0, 360, 1280, 360);
    this.voyageContainer.add(grad);

    // 2) 太阳 (橙黄圆, 渐隐在海平面)
    var sun = this.add.circle(960, 320, 50, 0xFFD98A, 0.9);
    var halo = this.add.circle(960, 320, 80, 0xFFD98A, 0.25);
    this.voyageContainer.add(halo);
    this.voyageContainer.add(sun);

    // 3) 海浪 (3 层弧线)
    var wave1 = this.add.graphics();
    wave1.lineStyle(2, 0xA8D8C0, 0.6);
    wave1.beginPath();
    for (var x = 0; x <= 1280; x += 20) {
      var y = 460 + Math.sin(x * 0.025) * 8;
      if (x === 0) wave1.moveTo(x, y); else wave1.lineTo(x, y);
    }
    wave1.strokePath();
    var wave2 = this.add.graphics();
    wave2.lineStyle(2, 0xA8D8C0, 0.45);
    wave2.beginPath();
    for (var x = 0; x <= 1280; x += 20) {
      var y = 520 + Math.sin(x * 0.02 + 1) * 10;
      if (x === 0) wave2.moveTo(x, y); else wave2.lineTo(x, y);
    }
    wave2.strokePath();
    var wave3 = this.add.graphics();
    wave3.lineStyle(3, 0xFFFFFF, 0.4);
    wave3.beginPath();
    for (var x = 0; x <= 1280; x += 20) {
      var y = 600 + Math.sin(x * 0.018 + 2) * 12;
      if (x === 0) wave3.moveTo(x, y); else wave3.lineTo(x, y);
    }
    wave3.strokePath();
    this.voyageContainer.add([wave1, wave2, wave3]);

    // 4) 船 (黑色船身 + 高耸三角帆 + 旗帜)
    var shipContainer = this.add.container(-200, 460);   // 起始屏幕外左
    // 船身 hull
    var hull = this.add.graphics();
    hull.fillStyle(0x4A2E1A, 1);
    hull.beginPath();
    hull.moveTo(-50, 0); hull.lineTo(50, 0);
    hull.lineTo(35, 25); hull.lineTo(-35, 25);
    hull.closePath(); hull.fillPath();
    // 桅杆
    var mast = this.add.graphics();
    mast.fillStyle(0x2A190E, 1);
    mast.fillRect(-2, -110, 4, 110);
    // 帆 (白色三角)
    var sail = this.add.graphics();
    sail.fillStyle(0xF4ECD8, 1);
    sail.beginPath();
    sail.moveTo(0, -100); sail.lineTo(50, -10); sail.lineTo(0, -10);
    sail.closePath(); sail.fillPath();
    // 旗帜
    var flag = this.add.graphics();
    flag.fillStyle(0xFFD98A, 1);
    flag.fillRect(-2, -120, 14, 8);
    shipContainer.add([hull, mast, sail, flag]);
    this.shipContainer = shipContainer;
    this.voyageContainer.add(shipContainer);

    // 5) 字幕 (顶部 + 底部)
    var topText = this.add.text(640, 80, '🌊 离开多哈 · 波斯湾', {
      fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
    }).setOrigin(0.5);
    var subText = this.add.text(640, 600, '下一站 → 伊朗 🐪', {
      fontSize: '18px', color: '#A8D8C0', fontStyle: 'italic',
    }).setOrigin(0.5);
    // 路线文字带行 (大字出现)
    var carrier = this.add.text(640, 360, '🚢 海上丝绸之路', {
      fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold',
    }).setOrigin(0.5);
    carrier.setAlpha(0);

    this.voyageTopText = topText;
    this.voyageSubText = subText;
    this.voyageCarrier = carrier;
    this.voyageContainer.add([topText, subText, carrier]);
  };

  // 动画 + navigate
  ResultScene.prototype.playVoyageAnimation = function (nextUrl) {
    var self = this;
    this.voyageContainer.setVisible(true);

    // 隐藏所有 ResultScene UI 元素
    this.children.list.forEach(function (c) {
      if (c !== self.voyageContainer) c.setVisible(false);
    });

    // tween 1: 字幕淡入 fade in
    this.tweens.add({
      targets: this.voyageCarrier,
      alpha: 1,
      duration: 400,
      ease: 'Quad.easeOut',
    });
    // tween 2: 船从 -200 -> 1100 (跨屏)
    this.tweens.add({
      targets: this.shipContainer,
      x: 1100,
      duration: 1600,
      ease: 'Quad.easeInOut',
    });
    // tween 3: 字幕 carrier y 微微下沉 (船在前行)
    this.tweens.add({
      targets: this.voyageCarrier,
      y: 420,
      duration: 1800,
      ease: 'Quad.easeIn',
      onComplete: function () {
        // 跳转
        window.location.href = nextUrl;
      },
    });
  };

  // ==================== M9.1 角色选择面板 ====================
  // 在 IntroScene 自定义原型上挂方法。Phaser Class 自创建后 add 方法
  // ==================== M9.3b 4 角色 graphics 绘制 ====================
  // 用 Phaser.Graphics 程序画 4 个有身体的造型，所有 body 部分 0~44 范围 (elf.y=0)
  // 颜色代码：阿拉伯男=白袍+白头巾， 阿拉伯女=黑色 abaya+hijab，中国男=藏青汉服，中国女=桃红汉服
  PlayScene.prototype._buildAvatarSprite = function (avatarId) {
    var g = this.add.graphics();
    g.setName('avatar:' + avatarId);
    if (avatarId === 'malay') {
      // —— 阿拉伯男：thobe 白袍 + ghutra 白头巾 + 黑色 agal 头箍 ——
      // 鞋
      g.fillStyle(0x3A2614, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
      // 袍身 (上窄下宽 — trapezoid)
      g.fillStyle(0xF4ECD8, 1);
      g.beginPath(); g.moveTo(-12, 18); g.lineTo(12, 18);
      g.lineTo(15, -6); g.lineTo(-15, -6); g.closePath(); g.fillPath();
      // 袍袖
      g.fillStyle(0xE8DEC0, 1);
      g.fillRoundedRect(-15, -8, 4, 20, 2); g.fillRoundedRect(11, -8, 4, 20, 2);
      // 腰带
      g.fillStyle(0x8B6B3A, 1); g.fillRect(-13, 6, 26, 2);
      // 头巾 (ghutra) - 大白方巾搭在头上
      g.fillStyle(0xFFFFFF, 1);
      g.fillRoundedRect(-13, -22, 26, 14, 3); // 主头巾
      g.fillRoundedRect(-15, -16, 4, 18, 1); // 左侧下垂
      g.fillRoundedRect(11, -16, 4, 18, 1);  // 右侧下垂
      // agal 黑头箍环 (双线)
      g.lineStyle(2, 0x1A1208, 1);
      g.strokeRoundedRect(-13, -18, 26, 2, 1);
      g.strokeRoundedRect(-13, -14, 26, 2, 1);
      // 脸 (深褐肤)
      g.fillStyle(0xC9A47A, 1);
      g.fillRoundedRect(-8, -14, 16, 12, 3);
      // 络腮胡
      g.fillStyle(0x1A1208, 1);
      g.fillRoundedRect(-7, -6, 14, 6, 2);
      // 眼睛
      g.fillStyle(0x1A1208, 1);
      g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
    } else if (avatarId === 'fala') {
      // —— 阿拉伯女：黑色 abaya 长袍 + hijab 头巾 —— (黑袍 + 露脸 or 只露眼睛 — 选择: 露脸)
      // 鞋
      g.fillStyle(0x2A1F18, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
      // 长袍 (盖到脚踝)
      g.fillStyle(0x1A1208, 1);
      g.beginPath(); g.moveTo(-12, 22); g.lineTo(12, 22);
      g.lineTo(14, -4); g.lineTo(-14, -4); g.closePath(); g.fillPath();
      // 袖
      g.fillStyle(0x0F0A06, 1);
      g.fillRoundedRect(-15, -6, 4, 22, 2); g.fillRoundedRect(11, -6, 4, 22, 2);
      // 金色腰带
      g.fillStyle(0xC49A5E, 1); g.fillRect(-13, 6, 26, 2);
      // 金色装饰边
      g.fillStyle(0xFFD98A, 1); g.fillRect(-13, 8, 26, 1);
      // 头巾 hijab (盖住头发 + 脖子)
      g.fillStyle(0x2A1F18, 1);
      g.fillRoundedRect(-12, -22, 24, 22, 4);
      // 脸框 (椭圆)
      g.fillStyle(0xD4B68C, 1); // 浅褐肤
      g.fillEllipse(0, -10, 14, 12);
      // 眼睛
      g.fillStyle(0x1A1208, 1); g.fillRect(-4, -11, 2, 2); g.fillRect(2, -11, 2, 2);
      // 红唇点
      g.fillStyle(0xC04848, 1); g.fillRect(-1, -7, 2, 1);
    } else if (avatarId === 'cn_m') {
      // —— 中国男：黑短发 + 藏青汉服对襟 —— 中式立领
      // 鞋
      g.fillStyle(0x2A1F18, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
      // 汉服主体 (藏青)
      g.fillStyle(0x2C3E50, 1);
      g.beginPath(); g.moveTo(-13, 18); g.lineTo(13, 18);
      g.lineTo(15, -4); g.lineTo(-15, -4); g.closePath(); g.fillPath();
      // 袖 (宽袖汉服风格)
      g.fillStyle(0x34495E, 1);
      g.fillRoundedRect(-17, -6, 6, 22, 2); g.fillRoundedRect(11, -6, 6, 22, 2);
      // 对襟白边 (汉服衣领)
      g.lineStyle(1, 0xF4ECD8, 1);
      g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 14); g.strokePath();
      // 5 颗中式盘扣
      g.fillStyle(0xC49A5E, 1);
      for (var i = 0; i < 3; i++) g.fillCircle(0, i * 5, 1);
      // 腰带
      g.fillStyle(0x1A1208, 1); g.fillRect(-13, 6, 26, 2);
      // 头发 (黑短发)
      g.fillStyle(0x1A1208, 1);
      g.fillRoundedRect(-10, -22, 20, 10, 3);
      // 脸 (黄肤)
      g.fillStyle(0xF0D2A8, 1);
      g.fillRoundedRect(-7, -14, 14, 12, 2);
      // 眼睛
      g.fillStyle(0x1A1208, 1); g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
    } else { // cn_f —— 中国女：长发垂到肩膀 + 桃红汉服对襟
      // 鞋
      g.fillStyle(0x5C3A22, 1); g.fillRoundedRect(-7, 22, 6, 4, 1); g.fillRoundedRect(1, 22, 6, 4, 1);
      // 汉服主体 (桃红)
      g.fillStyle(0xD88099, 1);
      g.beginPath(); g.moveTo(-13, 18); g.lineTo(13, 18);
      g.lineTo(15, -4); g.lineTo(-15, -4); g.closePath(); g.fillPath();
      // 宽袖
      g.fillStyle(0xE89AAA, 1);
      g.fillRoundedRect(-17, -6, 6, 22, 2); g.fillRoundedRect(11, -6, 6, 22, 2);
      // 对襟白边
      g.lineStyle(1, 0xF4ECD8, 1);
      g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 14); g.strokePath();
      // 5 颗盘扣
      g.fillStyle(0xC49A5E, 1);
      for (var i = 0; i < 3; i++) g.fillCircle(0, i * 5, 1);
      // 腰带
      g.fillStyle(0xC49A5E, 1); g.fillRect(-13, 6, 26, 2);
      // 头发 (黑色长发, 两侧垂到肩)
      g.fillStyle(0x1A1208, 1);
      g.fillRoundedRect(-11, -22, 22, 10, 3);
      g.fillRoundedRect(-13, -16, 4, 12, 2); // 左侧长发
      g.fillRoundedRect(9, -16, 4, 12, 2);  // 右侧长发
      // 脸 (黄肤)
      g.fillStyle(0xF8E0B8, 1);
      g.fillRoundedRect(-7, -14, 14, 12, 2);
      // 刘海 (中分)
      g.fillStyle(0x1A1208, 1);
      g.fillRoundedRect(-7, -16, 6, 4, 1);
      g.fillRoundedRect(1, -16, 6, 4, 1);
      // 眼睛
      g.fillStyle(0x1A1208, 1); g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
      // 红唇
      g.fillStyle(0xC04848, 1); g.fillRect(-2, -7, 4, 1);
    }
    return g;
  };

  // ==================== M9.5g 大力神杯 sprite (graphics 程序画) ====================
  // 卡塔尔 2022 世界杯 — Lusail Stadium 奖杯. 用 Phaser.Graphics 画, 不要 emoji.
  // 真实大力神杯形态: 双手举杯 (绿色翅膀) + 金色杯身 + 地球+马瑙.
  PlayScene.prototype._buildWorldCupSprite = function (g) {
    var container = this.add.container(g.x, g.y);
    // 光晕 (金黄)
    var glow = this.add.graphics();
    glow.fillStyle(0xFFD98A, 0.35);
    glow.fillCircle(0, 0, 26);
    container.add(glow);

    var trophy = this.add.graphics();
    // —— 下半部基座 ——
    // 黑色圆形基座
    trophy.fillStyle(0x1A1208, 1);
    trophy.fillRoundedRect(-12, 22, 24, 8, 2);
    // 金色底层
    trophy.fillStyle(0xD4A857, 1);
    trophy.fillRoundedRect(-10, 18, 20, 6, 1);

    // —— 马瑙环 (深红色, 杯身底圈) ——
    trophy.fillStyle(0x8B2A2A, 1);
    trophy.fillRoundedRect(-9, 12, 18, 6, 1);

    // —— 杯身 (金色长椭圆) ——
    trophy.fillStyle(0xFFD700, 1);
    trophy.beginPath();
    trophy.moveTo(-9, 12);   // 上左
    trophy.lineTo(9, 12);    // 上右
    trophy.lineTo(7, -2);    // 下右 (杯口收窄)
    trophy.lineTo(-7, -2);
    trophy.closePath(); trophy.fillPath();
    // 杯身厚一点
    trophy.fillStyle(0xD4A857, 1);
    trophy.fillRect(-9, -3, 18, 3);

    // —— 杯口 ——
    trophy.fillStyle(0xFFD700, 1);
    trophy.fillRoundedRect(-10, -6, 20, 4, 1);
    trophy.fillStyle(0xFFE9B0, 1);  // 内壁浅色
    trophy.fillEllipse(0, -4, 14, 2);

    // —— 上半部: 双手举杯的握柄 (绿色翅膀) ——
    // Graphics 没 quadraticBezierTo 直接 method, 用 lineTo 拼月牙形.
    var wingColor = 0x2E5A3D;  // 墨绿
    trophy.fillStyle(wingColor, 1);
    // 左翅膀 (4 段 lineTo 近似月牙)
    trophy.beginPath();
    trophy.moveTo(-9, -6);
    trophy.lineTo(-18, -10);
    trophy.lineTo(-16, -22);  // 翼尖
    trophy.lineTo(-12, -18);
    trophy.lineTo(-10, -8);
    trophy.closePath(); trophy.fillPath();
    // 右翅膀
    trophy.beginPath();
    trophy.moveTo(9, -6);
    trophy.lineTo(18, -10);
    trophy.lineTo(16, -22);
    trophy.lineTo(12, -18);
    trophy.lineTo(10, -8);
    trophy.closePath(); trophy.fillPath();

    // —— 顶部饰带 (金色绑定横条) ——
    trophy.fillStyle(0xFFD700, 1);
    trophy.fillRect(-7, -10, 14, 3);

    // —— 顶部装饰 (白色 + 红宝石 + 绿宝石点缀) ——
    trophy.fillStyle(0xFFFFFF, 1);
    trophy.fillCircle(0, -14, 2.5);
    trophy.fillStyle(0xC0392B, 1);  // 红色宝石
    trophy.fillCircle(-1, -14, 1);
    trophy.fillStyle(0x27AE60, 1);  // 绿色宝石
    trophy.fillCircle(1, -14, 1);

    container.add(trophy);

    // 标签 (大力神杯)
    var label = this.add.text(0, 36, g.name || '大力神杯', {
      fontSize: '11px', color: '#FFD98A', fontStyle: 'bold',
      stroke: '#4A2E1A', strokeThickness: 3,
    }).setOrigin(0.5);
    container.add(label);

    return container;
  };

  // ==================== M9.3b IntroScene 角色卡片用 mini graphics 替换 emoji ====================
  // (IntroScene 仍显示 emoji 是为了让用户"看看大致造型"；进入 PlayScene 才是真 graphics)
  IntroScene.prototype._renderAvatarPicker = function (cx, cy) {
    var self = this;
    this._avatarCards = [];
    var avatars = [
      { id: 'malay', label: '阿拉伯男', emoji: '🧔', sub: 'كبير' },
      { id: 'fala',  label: '阿拉伯女', emoji: '🧕', sub: '巾帕' },
      { id: 'cn_m',  label: '中国男',   emoji: '👨', sub: '黑发' },
      { id: 'cn_f',  label: '中国女',   emoji: '👩', sub: '长发' },
    ];
    var gap = 130;
    var startX = cx - ((avatars.length - 1) * gap) / 2;
    var labelY = cy - 75;
    this.add.text(cx, labelY, '👤 选择你的造型', {
      fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
    }).setOrigin(0.5);
    for (var i = 0; i < avatars.length; i++) {
      var av = avatars[i];
      var x = startX + i * gap;
      // 背景 card
      var bg = this.add.rectangle(x, cy, 110, 130, 0x2A1F18, 0.85);
      // 选中高亮
      var hl = this.add.rectangle(x, cy, 110, 130, 0xFFD98A, 0);
      hl.setStrokeStyle(2, 0xFFD98A, 0);
      // emoji
      var emoji = this.add.text(x, cy - 16, av.emoji, { fontSize: '50px' }).setOrigin(0.5);
      var label = this.add.text(x, cy + 30, av.label, {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'bold',
      }).setOrigin(0.5);
      var sub = this.add.text(x, cy + 48, av.sub, {
        fontSize: '11px', color: '#A8D8C0',
      }).setOrigin(0.5);
      // hit zone
      var zone = this.add.zone(x, cy, 110, 130).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', (function (id, _bg, _hl) {
        return function () {
          self._selectedAvatar = id;
          localStorage.setItem('silkroad_avatar', id);
          for (var j = 0; j < self._avatarCards.length; j++) {
            self._avatarCards[j].hl.setStrokeStyle(2, 0xFFD98A, j === avatars.findIndex(function(a){return a.id===id}) ? 0.95 : 0);
            self._avatarCards[j].bg.setFillStyle(0x2A1F18, j === avatars.findIndex(function(a){return a.id===id}) ? 0.95 : 0.65);
          }
        };
      })(av.id, bg, hl));
      this._avatarCards.push({ id: av.id, bg: bg, hl: hl });
    }
    // 渲染初始选中
    var selIdx = avatars.findIndex(function(a){return a.id===self._selectedAvatar;});
    if (selIdx < 0) selIdx = 0;
    self._avatarCards[selIdx].hl.setStrokeStyle(2, 0xFFD98A, 0.95);
    self._avatarCards[selIdx].bg.setFillStyle(0x2A1F18, 0.95);
  };

  // Avatar emoji map 给 PlayScene 用
  window.QATAR_AVATARS = {
    malay: '🧔',
    fala:  '🧕',
    cn_m:  '👨',
    cn_f:  '👩',
  };

  // 暴露给离线/调试用
  window.QATAR_GAME = game;
  window.QATAR_REWARD_TIERS = QATAR_REWARD_TIERS;
})();