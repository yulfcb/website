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

  // ==================== M17 SFX 助手 ====================
  // 多次触发同一 sfx 会重置 currentTime, 不会因音频重叠被吞.
  // id 直接对应 <audio id="sfx-{id}"> 元素. 各 scene/全局回调里直接调 window.playQatarSfx().
  window.playQatarSfx = function (id, volume) {
    var a = document.getElementById('sfx-' + id);
    if (!a) return;
    try {
      a.volume = volume != null ? volume : 0.5;
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
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
      // M23: voyage ship sprite (D — 2nd_ship_new_4 暗红剪影, CC0 OpenGameArt)
      this.load.image('voyage-ship',
        '/static/silk-road/qatar/assets/ships/2nd_ship_new_4.png');
    },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#1b2135');
      this.add.text(640, 360, '加载中…', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // M14 Bug B: BGM 解锁 + 卸载清理
      // 浏览器 autoplay policy: audio 必须等用户首次手势后才能 unmute + play.
      // 用 once: true 自动解绑, 不污染后续事件.
      document.addEventListener('pointerdown', function unlockBgm() {
        var a = document.getElementById('silk-road-bgm');
        if (a) {
          a.muted = false;
          a.volume = 0.4;
          var p = a.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      }, { once: true });
      // 关掉页面时也暂停 BGM, 避免后台 tab 继续跑音频
      window.addEventListener('beforeunload', function () {
        var a = document.getElementById('silk-road-bgm');
        if (a) a.pause();
      });

      // M15 Bug B: 预取 countries-110m.json + topojson 解码 (后台进行,
      // ResultScene.buildVoyageContainer 读取 window.__qatarCountriesGeo).
      // 玩家至少玩几分钟才会触发 voyage, 给 fetch 充分时间.
      if (window.topojson && !window.__qatarCountriesGeo) {
        fetch('/static/vendor/world-atlas/countries-110m.json')
          .then(function (r) {
            if (!r.ok) throw new Error('fetch topo failed: ' + r.status);
            return r.json();
          })
          .then(function (topo) {
            try {
              window.__qatarCountriesGeo = window.topojson.feature(topo, topo.objects.countries);
            } catch (e) {
              console.warn('[qatar-m15] topojson decode failed:', e);
            }
          })
          .catch(function (e) { console.warn('[qatar-m15] topo fetch failed:', e); });
      }

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
      // M12 Bug 3: 「礼物」→「物品」; 任务描述改为「收集 8 件物品 → 去 Doha Port 兑换船票」
      // M15 Part 2: 6 → 8 (加 Ras Laffan 天然气 + NMoQ 沙漠玫瑰).
      this.add.text(640, 485, '🎯 任务：在卡塔尔沙海徒步收集 8 件物品，然后去 Doha Port 用物品兑换船票，准备出发 🚢', {
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

      // —— 7 个地名 chip (M12: 加 doha_port) ——
      // M13 Bug 2: place chip y_offset 从 -36 改 -22, 离 gift 更紧凑
      // M12 Bug 2: chip text 加 wordWrap:false + setFixedSize 防止 emoji 或 fallback 字体换行
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
        // 强制单行 + 限制宽度兜底 (M12 Bug 2: emoji 撑宽会触发中文 fallback 换行)
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
        var palm = self.add.text(0, 0, '🌴', { fontSize: '32px' }).setOrigin(0.5);
        var label = self.add.text(0, 22, o.label, {
          fontSize: '11px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5);
        var oasis = self.add.container(o.x, o.y, [halo, palm, label]);
        oasis.oasisData = o;
        self.oasisSprites.push(oasis);
      });

      // —— 8 个礼物 ——
      // M13 Bug 2: gift sprite y_offset 从 +22 改 +10, 配合 place chip 上移到 -22,
      //             视觉间距 = 22 + 16 (chip half h) + 10 = 48px, 比 M12 紧凑但仍分开.
      // M15 Part 2: 7 → 8 gifts, 大力神杯 id 从 6 移到 7 (PNG 同前).
      // M16 Bug 6: gift id=0 (沙漠玫瑰), id=4 (天然气 LNG), id=6 (火炬塔) 用 Graphics 自定义
      //            其他保留 emoji (归家之心 ❤️, 古兰经 📖, 游隼 🦅, 珍珠 🦪, 大力神杯 🏆)
      this.giftSprites = [];
      L.gifts.forEach(function (g) {
        var sprite;
        if (g.id === 7) {
          // M9.6a: World Cup trophy — 用 user-provided PNG (key-out 白底).
          var container = self.add.container(g.x, g.y + 10);
          var glow = self.add.graphics();
          glow.fillStyle(0xFFD98A, 0.4);
          glow.fillCircle(0, 0, 28);
          container.add(glow);
          var trophyImg = self.add.image(0, 0, 'world-cup-trophy');
          trophyImg.setDisplaySize(56, 56);
          container.add(trophyImg);
          var label = self.add.text(0, 30, g.name, {
            fontSize: '11px', color: '#FFD98A', fontStyle: 'bold',
            stroke: '#4A2E1A', strokeThickness: 3,
            wordWrap: false,
          }).setOrigin(0.5);
          label.setFixedSize(80, 14);
          container.add(label);
          sprite = container;
        } else if (g.id === 0 || g.id === 4 || g.id === 6) {
          // M16 Bug 6: 自定义 Graphics 礼物 sprite —— 沙漠玫瑰/天然气/火炬塔
          sprite = self._buildCustomGiftSprite(g);
        } else {
          var glow = self.add.graphics();
          glow.fillStyle(0xFFD98A, 0.35);
          glow.fillCircle(0, 0, 22);
          var bag = self.add.text(0, 0, g.emoji, { fontSize: '32px' }).setOrigin(0.5);
          var label = self.add.text(0, 22, g.name, {
            fontSize: '11px', color: '#4A2E1A', fontStyle: 'bold',
            wordWrap: false,
          }).setOrigin(0.5);
          label.setFixedSize(80, 14);
          sprite = self.add.container(g.x, g.y + 10, [glow, bag, label]);
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
      this.paused = false;  // M18 Bug 4: 保留 paused 字段 (因为 update/_movementUpdate/tryMove 仍检查它, 永不触发)
      this.moveCount = 0;
      this.merchantShown = false;
      this.npcFrame = 0;
      this.npcShownPickup3 = false;

      // —— HUD（顶部条 + NPC 文字）——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x4A2E1A, 0.92);
      this.waterText = this.add.text(180, 30, '💧 水分 ' + this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.pickupText = this.add.text(640, 30, '🎁 拾起 ' + this.pickupCount + ' / 8', {
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
          window.playQatarSfx('click', 0.4);  // M17: dpad 按下 click
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

      // M18 Bug 4: 取消暂停按钮 —— 不再有暂停键和暂停图标
      // (BGM 开关按钮移到 (60, 100))

      // M14 Bug B: BGM 开关按钮 (左上, 暂停位置)
      var bgmAudio = document.getElementById('silk-road-bgm');
      var audioBg = this.add.circle(110, 100, 24, 0x4A2E1A, 0.92)
        .setStrokeStyle(2, 0x5fb3a0, 0.6);
      this.audioBtnText = this.add.text(110, 100, '🔊', { fontSize: '20px' }).setOrigin(0.5);
      var audioZone = this.add.zone(110, 100, 48, 48).setInteractive({ useHandCursor: true });
      audioZone.on('pointerdown', function () {
        if (!bgmAudio) return;
        window.playQatarSfx('button', 0.4);  // M17: BGM toggle button blip
        if (bgmAudio.paused) {
          // 取消静音 + 播放
          bgmAudio.muted = false;
          var p = bgmAudio.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
          self.audioBtnText.setText('🔊');
        } else {
          bgmAudio.pause();
          self.audioBtnText.setText('🔇');
        }
      });
      this.audioContainer = this.add.container(0, 0, [audioBg, this.audioBtnText, audioZone]);

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
      window.playQatarSfx('pickup', 0.5);  // M17: 拾起物品 chime

      // 背景遮罩（吸收点击，不响应回调）
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.45);  // M9.5b 透明度 0.78->0.45
      // M8.5：backdrop 不该 interactive，否则会截掉按钮点击
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 420, 0x4A2E1A, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.5);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -150, g.emoji, { fontSize: '56px' }).setOrigin(0.5));
      // M12 Bug 3: 「你拾起了」改成更口语「你捡到了物品」(任务/教学文案统一改"物品")
      this.modalContainer.add(this.add.text(0, -80, '你捡到了物品「' + g.name + '」', {
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
        zone.on('pointerdown', function () {
          window.playQatarSfx('button', 0.4);  // M17: modal 按钮 blip
          callback();
        });
        return [bg, label, subT, zone];
      };

      // M16 Bug 5: 行李满时不再禁用装进按钮, 改为允许点 → 弹替换 modal
      var bucketTxt = isFull
        ? '🔁 替换行李 (' + this.luggageCount + '/' + L.LUGGAGE_MAX + ')'
        : '🧳 装进 (' + this.luggageCount + '/' + L.LUGGAGE_MAX + ')';
      var bucketSub = isFull
        ? '选一个丢弃, 把这件装进去'
        : '占 1 行李位 (用于兑换船票)';
      var bucket = makeModalBtn(bucketTxt, bucketSub, 30, true, function () { self.decideGift('bucket'); });
      var stay = makeModalBtn('⏳ 留后', '留到后面 (不占位)', 100, false, function () { self.decideGift('stay'); });
      var drop = makeModalBtn('❌ 放弃', '这条路不带', 170, false, function () { self.decideGift('drop'); });

      this.modalContainer.add(bucket);
      this.modalContainer.add(stay);
      this.modalContainer.add(drop);

      // 隐藏 joystick / action / pause —— 避免 modal 打开时还能点
      this.joystickContainer.setVisible(false);
      (this.actionContainer && this.actionContainer.setVisible(false));
      // M18 Bug 4: pauseContainer removed
      this.modalContainer.setVisible(true);
    },

    closeGiftModal: function () {
      this.modalContainer.setVisible(false);
      this.currentGiftId = null;
      this.state = 'PLAYING';
      this.pickupCount++;
      this.pickupText.setText('🎁 拾起 ' + this.pickupCount + ' / 8');

      if (!this.npcShownPickup3 && this.pickupCount >= 3) {
        this.npcShownPickup3 = true;
        this.setNpcFrame(1);
      }
      // M11: 拾满 8 弹 pickup-done modal —— 提示玩家去港口兑换船票 (不再直接 enterResult).
      // M15 Part 2: 6 → 8 gifts, 所以拾满阈值从 6 升到 8.
      if (this.pickupCount >= 8) {
        this._showPickupMaxedModal();
        return;
      }
      // 恢复 joystick / action / pause
      this.joystickContainer.setVisible(true);
      (this.actionContainer && this.actionContainer.setVisible(true));
      // M18 Bug 4: pauseContainer removed
    },

    // M11 part 3: 拾满 8 件 → 弹 pickup-done modal, 提示去港口兑换船票
    // M15 Part 2: 6 → 8 gifts
    _showPickupMaxedModal: function () {
      var self = this;
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 460, 320, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -110, '🎁', { fontSize: '52px' }).setOrigin(0.5));
      // M12 Bug 3: 「礼物都拾齐了」→「物品都拾齐了」
      this.modalContainer.add(this.add.text(0, -55, '物品都拾齐了！', {
        fontSize: '22px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      // M12 Bug 3 + Bug 4 + M18 Bug 7: 「去 Doha Port 用物品兑换船票」改"去 Doha Port 用物品兑换船票，准备出发"
      this.modalContainer.add(this.add.text(0, -15, '去 Doha Port ⚓ 用物品兑换船票，准备出发\n装进行李 ' + this.luggageCount + '/' + L.LUGGAGE_MAX + '  ·  总价 ¥' + this.totalLuggagePrice() + ' / ¥' + L.PORT_TICKET_PRICE_THRESHOLD, {
        fontSize: '13px', color: '#A8D8C0', align: 'center', wordWrap: { width: 380 },
      }).setOrigin(0.5));

      // "知道了" 按钮
      var btnBg = this.add.rectangle(0, 100, 200, 56, 0x5fb3a0, 1);
      var btnText = this.add.text(0, 100, '知道了', {
        fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
      }).setOrigin(0.5);
      var btnZone = this.add.zone(0, 100, 200, 56).setInteractive({ useHandCursor: true });
      btnZone.on('pointerdown', function () {
        window.playQatarSfx('button', 0.4);  // M17: 拾满 modal "知道了"
        self.modalContainer.setVisible(false);
        self.joystickContainer.setVisible(true);
        self.actionContainer && self.actionContainer.setVisible(true);
        // M18 Bug 4: pauseContainer removed
      });

      this.modalContainer.add([btnBg, btnText, btnZone]);
      // 不显示 dpad (玩家需要走去港口)
      this.joystickContainer.setVisible(true);
      (this.actionContainer && this.actionContainer.setVisible(true));
      // M18 Bug 4: pauseContainer removed
      this.modalContainer.setVisible(true);
    },

    decideGift: function (choice) {
      if (this.currentGiftId === null) return;
      // M16 Bug 5: 行李满时点"装进/替换" → 弹替换 modal 让玩家选要替换哪个
      if (choice === 'bucket' && this.luggageCount >= L.LUGGAGE_MAX) {
        // 关闭当前 gift modal (但保留 currentGiftId 供 _showReplaceModal 用)
        var newGiftId = this.currentGiftId;
        this.modalContainer.setVisible(false);
        this._showReplaceModal(newGiftId);
        return;
      }
      this.giftBuckets[this.currentGiftId] = choice;
      if (choice === 'bucket') {
        this.luggageCount++;
        this.luggageText.setText('🧳 行李 ' + this.luggageCount + ' / ' + L.LUGGAGE_MAX);
      }
      // M11: 行李总价 HUD 实时更新 (bucket/drop 都影响)
      this._updatePriceHud();
      this.closeGiftModal();
    },

    // M16 Bug 5: 行李满时弹替换 modal —— 玩家选要丢弃哪个, 用新 gift 替换
    _showReplaceModal: function (newGiftId) {
      var self = this;
      // 取新 gift 信息
      var newGift = null;
      for (var i = 0; i < L.gifts.length; i++) {
        if (L.gifts[i].id === newGiftId) { newGift = L.gifts[i]; break; }
      }
      if (!newGift) return;
      // 当前 bucket 里所有 gift ids
      var bucketIds = [];
      var keys = Object.keys(this.giftBuckets);
      for (var i = 0; i < keys.length; i++) {
        if (this.giftBuckets[keys[i]] === 'bucket') bucketIds.push(parseInt(keys[i], 10));
      }
      bucketIds.sort(function (a, b) { return a - b; });

      this.modalContainer.removeAll(true);

      // backdrop
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
      this.modalContainer.add(backdrop);

      // card (加高, 容纳 6 个 bucket 项 + 标题 + 按钮)
      var cardH = 80 + bucketIds.length * 38 + 80;
      var card = this.add.rectangle(0, 0, 540, cardH, 0x1B3A5E, 1)
        .setStrokeStyle(2, 0x5fb3a0, 0.7);
      this.modalContainer.add(card);

      // 标题
      var titleY = -cardH / 2 + 36;
      this.modalContainer.add(this.add.text(0, titleY, '🔁 选择要丢弃的物品', {
        fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      // 副标题 (新礼物信息)
      var subY = titleY + 24;
      this.modalContainer.add(this.add.text(0, subY,
        '把 [' + newGift.emoji + ' ' + newGift.name + ' ¥' + (newGift.price || 0) + '] 装进行李, 需丢弃一件',
        {
          fontSize: '11px', color: '#A8D8C0', fontStyle: 'italic',
          wordWrap: { width: 480 },
        }).setOrigin(0.5));

      // bucket 列表 — 每行: 丢弃按钮 + emoji + 名字 + 价格
      var rowStartY = subY + 32;
      for (var r = 0; r < bucketIds.length; r++) {
        var gid = bucketIds[r];
        var bg = null;
        for (var j = 0; j < L.gifts.length; j++) {
          if (L.gifts[j].id === gid) { bg = L.gifts[j]; break; }
        }
        if (!bg) continue;
        var ry = rowStartY + r * 38;

        // 丢弃按钮 (左侧红框)
        var dropBg = self.add.rectangle(-210, ry, 56, 28, 0xC04848, 1)
          .setStrokeStyle(1, 0xFFD98A, 0.5);
        var dropTxt = self.add.text(-210, ry, '丢弃', {
          fontSize: '12px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5);
        var dropZone = self.add.zone(-210, ry, 56, 28).setInteractive({ useHandCursor: true });
        (function (dropId) {
          dropZone.on('pointerdown', function () {
            // 1) 旧 gift 改 'drop' (从 bucket 移除)
            self.giftBuckets[dropId] = 'drop';
            // 2) 新 gift 改 'bucket' (加入 bucket, luggageCount 不变)
            self.giftBuckets[newGiftId] = 'bucket';
            // 3) 重算总价 (丢弃的 gift price 减掉, 新 gift price 加上)
            self._updatePriceHud();
            self.luggageText.setText('🧳 行李 ' + self.luggageCount + ' / ' + L.LUGGAGE_MAX);
            window.playQatarSfx('button', 0.4);  // M17: replace modal 丢弃按钮 blip
            // 4) 关闭 modal + 走正常 closeGiftModal 流程 (更新 HUD/状态)
            self.modalContainer.setVisible(false);
            self.closeGiftModal();
          });
        })(gid);

        // emoji
        self.modalContainer.add(self.add.text(-150, ry, bg.emoji, { fontSize: '20px' }).setOrigin(0.5));
        // 名字
        var nameTxt = self.add.text(-115, ry, bg.name, {
          fontSize: '13px', color: '#F4ECD8', fontStyle: 'bold',
          wordWrap: false,
        }).setOrigin(0, 0.5);
        nameTxt.setFixedSize(160, 16);
        self.modalContainer.add(nameTxt);
        // 价格
        self.modalContainer.add(self.add.text(85, ry, '¥' + bg.price, {
          fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0, 0.5));

        self.modalContainer.add([dropBg, dropTxt, dropZone]);
      }

      // 取消按钮 (底部)
      var cancelY = cardH / 2 - 40;
      var cancelBg = self.add.rectangle(0, cancelY, 200, 50, 0x1B3A5E, 1)
        .setStrokeStyle(1, 0x5fb3a0, 0.6);
      var cancelTxt = self.add.text(0, cancelY, '取消', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
      }).setOrigin(0.5);
      var cancelZone = self.add.zone(0, cancelY, 200, 50).setInteractive({ useHandCursor: true });
      cancelZone.on('pointerdown', function () {
        window.playQatarSfx('button', 0.4);  // M17: replace modal 取消按钮 blip
        // 玩家取消 → 新 gift 不入桶 (跟之前 'drop' 一样), 走 closeGiftModal 流程
        self.modalContainer.setVisible(false);
        self.closeGiftModal();
      });
      self.modalContainer.add([cancelBg, cancelTxt, cancelZone]);

      // 隐藏 joystick / pause (跟其他 modal 一致)
      this.joystickContainer.setVisible(false);
      (this.actionContainer && this.actionContainer.setVisible(false));
      // M18 Bug 4: pauseContainer removed
      this.modalContainer.setVisible(true);
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

      // M16 Bug 4: 兑换条件简化为 只看 行李件数 + 总价 (不要求拾满 8 件)
      //   - 行李装够 MIN_LUGGAGE_TO_BOARD 件 (默认 1)
      //   - 行李总价 >= PORT_TICKET_PRICE_THRESHOLD (默认 ¥170)
      //   注: 玩家拾 ≥1 件 + 总价 ≥¥170 就能兑换, 不必 8 件都拾
      var totalPrice = this.totalLuggagePrice();
      var canAfford = totalPrice >= L.PORT_TICKET_PRICE_THRESHOLD;
      var enoughLuggage = this.luggageCount >= L.MIN_LUGGAGE_TO_BOARD;
      var canExchange = canAfford && enoughLuggage;

      this.modalContainer.add(this.add.text(0, -130, L.port.emoji, { fontSize: '52px' }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -90, L.port.name, {
        fontSize: '14px', color: '#5fb3a0', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -50, L.port.line, {
        fontSize: '13px', color: '#FFE9B0', fontStyle: 'italic', wordWrap: { width: 400 },
      }).setOrigin(0.5));

      if (canExchange) {
        // ✅ 全部满足 → 兑换船票主按钮 (可点)
        // M16 Bug 4: 移除 hasAllGifts 要求 — 玩家只要带 1 件 + 总价 ≥¥170 就能兑换
        // M18 Bug 7: 文案改 "用物品兑换船票，准备出发" (不再指定目的地)
        this.modalContainer.add(this.add.text(0, 30, '用物品兑换船票，准备出发 🚢', {
          fontSize: '13px', color: '#A8D8C0', fontStyle: 'italic', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        var ticketBg = this.add.rectangle(-100, 130, 180, 56, 0x5fb3a0, 1);
        // M18 Bug 7: 按钮文字 "兑换船票" → "坐船出发"
        var ticketText = this.add.text(-100, 130, '坐船出发 →', {
          fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
        }).setOrigin(0.5);
        var ticketZone = this.add.zone(-100, 130, 180, 56).setInteractive({ useHandCursor: true });
        // M12 Bug 6: 点击进入兑换选择 modal, 不是直接兑换
        ticketZone.on('pointerdown', function () {
          window.playQatarSfx('button', 0.4);  // M17: 港口 "兑换船票" 按钮 blip
          self._showExchangeModal();
        });

        var laterBg = this.add.rectangle(100, 130, 140, 56, 0x1B3A5E, 1)
          .setStrokeStyle(1, 0x5fb3a0, 0.6);
        var laterText = this.add.text(100, 130, '暂时不要', {
          fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        }).setOrigin(0.5);
        var laterZone = this.add.zone(100, 130, 140, 56).setInteractive({ useHandCursor: true });
        laterZone.on('pointerdown', function () {
          window.playQatarSfx('button', 0.4);  // M17: 港口 "暂时不要" 按钮 blip
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          // M18 Bug 4: pauseContainer removed
        });

        this.modalContainer.add([ticketBg, ticketText, ticketZone, laterBg, laterText, laterZone]);
      } else if (!canExchange) {
        // ⚠️ 不满足兑换条件 → 灰色禁用按钮 + 提示缺啥
        // M16 Bug 4: 不再要求 hasAllGifts, 玩家只要带 1 件就能来, 但要带够件数 + 总价
        var reasons = [];
        if (!enoughLuggage) reasons.push('行李不足 ' + this.luggageCount + '/' + L.MIN_LUGGAGE_TO_BOARD);
        if (!canAfford) reasons.push('总价 ¥' + totalPrice + ' / ¥' + L.PORT_TICKET_PRICE_THRESHOLD);
        // M12 Bug 3: 「礼物」→「物品」
        this.modalContainer.add(this.add.text(0, 30, '还差一点点:\n' + reasons.join(' · '), {
          fontSize: '12px', color: '#F6B5C8', align: 'center', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        // 禁用按钮 (灰色)
        var disabledBg = this.add.rectangle(-100, 130, 180, 56, 0x4A4A4A, 0.6)
          .setStrokeStyle(1, 0x888888, 0.4);
        // M18 Bug 7: 按钮文字同步改为 "坐船出发"
        var disabledText = this.add.text(-100, 130, '坐船出发 →', {
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
          window.playQatarSfx('button', 0.4);  // M17: 港口 "知道了" 按钮 blip
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          // M18 Bug 4: pauseContainer removed
        });

        this.modalContainer.add([disabledBg, disabledText, laterBg2, laterText2, laterZone2]);
      } else {
        // 普通对话 — 1 个按钮 (这段代码在 M16 Bug 4 后只 luggageCount >= MIN 但 canAfford=false 时进入)
        // M16: 默认分支已不存在 (上面两个分支覆盖所有情况), 保留兜底
        this.modalContainer.add(this.add.text(0, 60, '先去把物品带够，再来找我兑换船票吧。', {
          fontSize: '12px', color: '#A8D8C0', wordWrap: { width: 380 },
        }).setOrigin(0.5));

        var btnBg = this.add.rectangle(0, 130, 160, 56, 0x5fb3a0, 1);
        var btnText = this.add.text(0, 130, '知道了', {
          fontSize: '15px', color: '#0E2A47', fontStyle: 'bold',
        }).setOrigin(0.5);
        var btnZone = this.add.zone(0, 130, 160, 56).setInteractive({ useHandCursor: true });
        btnZone.on('pointerdown', function () {
          window.playQatarSfx('button', 0.4);  // M17: 兜底 "知道了" 按钮 blip
          self.modalContainer.setVisible(false);
          self.joystickContainer.setVisible(true);
          self.actionContainer && self.actionContainer.setVisible(true);
          // M18 Bug 4: pauseContainer removed
        });
        this.modalContainer.add([btnBg, btnText, btnZone]);
      }

      this.joystickContainer.setVisible(false);
      (this.actionContainer && this.actionContainer.setVisible(false));
      // M18 Bug 4: pauseContainer removed
      this.modalContainer.setVisible(true);
    },

    // M9.5d: 兑换船票 modal — 显示船票 get 模态, 关闭后如果全拾齐则进入 result.
// M11: 海蓝港口主题 (跟 port NPC 一致)
// M12 Bug 6: 改为根据 _selectedGiftIds 是否含归家之心 (id=4) 决定文案:
//            含 → 显示 voyage 提示「下一站 伊朗」; 不含 → 文案变体「这趟不会带你到伊朗」
//            voyage 动画分支在 ResultScene.playVoyageAnimation 里处理
// M12 Bug 4: 港口名 'Doha Port' (英文)
_showTicketModal: function () {
  var self = this;
  this.modalContainer.removeAll(true);
  var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
  this.modalContainer.add(backdrop);

  var card = this.add.rectangle(0, 0, 460, 340, 0x1B3A5E, 1)
    .setStrokeStyle(2, 0x5fb3a0, 0.7);
  this.modalContainer.add(card);

  // M18 Bug 7: 检查 _selectedGiftIds 含归家之心 (gift id=5) 决定分支文案
  var hasHomeHeart = this._selectedGiftIds && this._selectedGiftIds.indexOf(5) !== -1;
  // M18 Bug 7: 文案统一为「船票已到手，准备出发!」, 不再区分目的地
  var titleTxt = '船票已到手，准备出发！';
  var subTxt = hasHomeHeart
    ? '波斯湾之旅已开启 🛳️'
    : '🛳️ 没有归家之心 · 这趟不会带你到伊朗';

  this.modalContainer.add(this.add.text(0, -130, '⚓', { fontSize: '52px' }).setOrigin(0.5));
  // M12 Bug 4: 英文 'Doha Port'
  this.modalContainer.add(this.add.text(0, -75, 'Doha Port', {
    fontSize: '14px', color: '#5fb3a0', fontStyle: 'bold',
  }).setOrigin(0.5));
  this.modalContainer.add(this.add.text(0, -35, titleTxt, {
    fontSize: '22px', color: '#FFD98A', fontStyle: 'bold',
  }).setOrigin(0.5));
  this.modalContainer.add(this.add.text(0, 5, subTxt, {
    fontSize: '13px', color: '#A8D8C0', align: 'center', wordWrap: { width: 360 },
  }).setOrigin(0.5));

  // 大按钮 "坐船出发" (M18 Bug 7: 文案统一, 不再区分目的地)
  var btnTxt = '坐船出发 →';
  var goBg = this.add.rectangle(0, 100, 300, 60, 0x5fb3a0, 1);
  var goText = this.add.text(0, 100, btnTxt, {
    fontSize: '17px', color: '#0E2A47', fontStyle: 'bold',
  }).setOrigin(0.5);
  var goZone = this.add.zone(0, 100, 300, 60).setInteractive({ useHandCursor: true });
  goZone.on('pointerdown', function () {
    window.playQatarSfx('button', 0.4);  // M17: "起航" 按钮 blip
    self.modalContainer.setVisible(false);
    // M16 Bug 4: 移除 hasAllGifts 要求 — 玩家只要带 1 件就能上船
    var canExchangeNow = self._selectedPrice >= L.PORT_TICKET_PRICE_THRESHOLD
      && self._selectedCount >= L.MIN_LUGGAGE_TO_BOARD;
    if (canExchangeNow) {
      self.enterResult();
    } else {
      // 没满足条件不允许通关 — 关闭 modal 给玩家继续走
      self.joystickContainer.setVisible(true);
      self.actionContainer && self.actionContainer.setVisible(true);
      // M18 Bug 4: pauseContainer removed
    }
  });

  this.modalContainer.add([goBg, goText, goZone]);
  this.modalContainer.setVisible(true);
},

// M12 Bug 6: 兑换选择 modal — 玩家勾选 N 件礼物 (N>=1, total>=¥170), 含归家之心 → voyage 到伊朗
_showExchangeModal: function () {
  var self = this;
  // 初始化选中状态: 默认勾上 bucket 里所有物品 (按 id)
  this._selectedGiftIds = [];
  var keys = Object.keys(this.giftBuckets);
  for (var i = 0; i < keys.length; i++) {
    if (this.giftBuckets[keys[i]] === 'bucket') {
      this._selectedGiftIds.push(parseInt(keys[i], 10));
    }
  }
  this._selectedPrice = this._sumSelectedPrice(this._selectedGiftIds);
  this._selectedCount = this._selectedGiftIds.length;

  var self = this;
  var renderList = function () {
    self.modalContainer.removeAll(true);

    var backdrop = self.add.rectangle(0, 0, 1280, 720, 0x0E2A47, 0.45);
    self.modalContainer.add(backdrop);

    // 加高 card 容纳 8 个 checkbox (M15 Part 2: 6 → 8 gifts)
    var card = self.add.rectangle(0, 0, 560, 460, 0x1B3A5E, 1)
      .setStrokeStyle(2, 0x5fb3a0, 0.7);
    self.modalContainer.add(card);

    self.modalContainer.add(self.add.text(0, -190, '⚓', { fontSize: '44px' }).setOrigin(0.5));
    // M18 Bug 7: 标题改 "选择要兑换的物品"
    self.modalContainer.add(self.add.text(0, -150, '用物品兑换船票，准备出发', {
      fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
    }).setOrigin(0.5));
    self.modalContainer.add(self.add.text(0, -123, '勾选 ≥1 件 · 总价 ≥ ¥' + L.PORT_TICKET_PRICE_THRESHOLD + ' 才能兑换', {
      fontSize: '11px', color: '#A8D8C0', fontStyle: 'italic',
    }).setOrigin(0.5));

    // 8 行 checkbox + emoji + name + price (按 gift id 排序, M15 Part 2)
    var startY = -90;
    var rowH = 36;
    var ids = [].concat(self._selectedGiftIds).concat([0,1,2,3,4,5,6,7].filter(function (id) {
      return self._selectedGiftIds.indexOf(id) === -1;
    }));
    // 仅显示 bucket 里的 (玩家可以选未 bucket 的吗? 不能 - _showExchangeModal 只在 hasAllGifts+canAfford 时打开,
    //              canAfford = totalLuggagePrice() >= ¥170, 即 bucket 总价已经达标)
    var bucketIds = [];
    var kkeys = Object.keys(self.giftBuckets);
    for (var k = 0; k < kkeys.length; k++) {
      if (self.giftBuckets[kkeys[k]] === 'bucket') bucketIds.push(parseInt(kkeys[k], 10));
    }
    bucketIds.sort(function (a, b) { return a - b; });

    // M14: 修复 Bug A — 把所有 row 内容包进 modalContainer, 防止 6 行 checkbox 渲染到 scene root
    for (var row = 0; row < bucketIds.length; row++) {
      var gid = bucketIds[row];
      var g = null;
      for (var j = 0; j < L.gifts.length; j++) {
        if (L.gifts[j].id === gid) { g = L.gifts[j]; break; }
      }
      if (!g) continue;
      var ry = startY + row * rowH;
      var isChecked = self._selectedGiftIds.indexOf(gid) !== -1;

      // checkbox 圆角矩形
      var cbBg = self.add.rectangle(-220, ry, 18, 18, isChecked ? 0x5fb3a0 : 0x2A1F18, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.8);
      self.modalContainer.add(cbBg);
      if (isChecked) {
        self.modalContainer.add(self.add.text(-220, ry, '✓', {
          fontSize: '14px', color: '#0E2A47', fontStyle: 'bold',
        }).setOrigin(0.5));
      }

      // emoji
      self.modalContainer.add(self.add.text(-185, ry, g.emoji, { fontSize: '20px' }).setOrigin(0.5));

      // 名字
      var nameTxt = self.add.text(-145, ry, g.name, {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'bold',
        wordWrap: false,
      }).setOrigin(0, 0.5);
      self.modalContainer.add(nameTxt);
      nameTxt.setFixedSize(160, 16);

      // 价格
      self.modalContainer.add(self.add.text(60, ry, '¥' + g.price, {
        fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0, 0.5));

      // 整行点击区 (点 checkbox 整行切换)
      var rowZone = self.add.zone(0, ry, 400, rowH).setInteractive({ useHandCursor: true });
      self.modalContainer.add(rowZone);
      rowZone.on('pointerdown', (function (id) {
        return function () {
          var idx = self._selectedGiftIds.indexOf(id);
          if (idx === -1) {
            self._selectedGiftIds.push(id);
          } else {
            self._selectedGiftIds.splice(idx, 1);
          }
          self._selectedCount = self._selectedGiftIds.length;
          self._selectedPrice = self._sumSelectedPrice(self._selectedGiftIds);
          renderList();
        };
      })(gid));
    }

    // 底部 summary + 兑换按钮
    var totalTxt = self.add.text(-30, 175, '已选 ' + self._selectedCount + ' 件 · 总价 ¥' + self._selectedPrice + ' / ¥' + L.PORT_TICKET_PRICE_THRESHOLD, {
      fontSize: '12px', color: '#A8D8C0', fontStyle: 'bold',
    }).setOrigin(0.5);
    self.modalContainer.add(totalTxt);

    // M18 Bug 1: 必须 luggage 包含归家之心 (gift id=5) 才能走「坐船出发」分支
    // M19: 移除归家之心 gate — 玩家任何时候都能兑换上船, 没归家之心的话在 voyage 中点返程
    var hasHeart = self._selectedGiftIds.indexOf(5) !== -1;
    var canSubmit = self._selectedCount >= L.MIN_LUGGAGE_TO_BOARD
      && self._selectedPrice >= L.PORT_TICKET_PRICE_THRESHOLD;

    // 兑换船票按钮 (亮色/灰色取决于 canSubmit — M19: 不再检查归家之心)
    var exBg = self.add.rectangle(-80, 215, 200, 50,
      canSubmit ? 0x5fb3a0 : 0x4A4A4A, canSubmit ? 1 : 0.6)
      .setStrokeStyle(1, canSubmit ? 0xFFD98A : 0x888888, canSubmit ? 0.7 : 0.4);
    self.modalContainer.add(exBg);
    // M18 Bug 7: 按钮文字改「🚢 坐船出发」
    self.modalContainer.add(self.add.text(-80, 215, '🚢 坐船出发', {
      fontSize: '15px', color: canSubmit ? '#0E2A47' : '#888888', fontStyle: 'bold',
    }).setOrigin(0.5));

    if (canSubmit) {
      var exZone = self.add.zone(-80, 215, 200, 50).setInteractive({ useHandCursor: true });
      self.modalContainer.add(exZone);
      exZone.on('pointerdown', function () {
        window.playQatarSfx('button', 0.4);   // M17: 兑换按钮 blip
        window.playQatarSfx('exchange', 0.55); // M17: 兑换船票 chime (上升琶音)
        // M23.5: 兑换船票 = 消耗被勾选的物品, 从行李 _selectedGiftIds 移除
        //   用户原话: "选中哪些物品兑换成船票。那些物品就会从行李箱里面去除。没选中的, 保留在行李箱"
        //   - 勾了 id=5 归家之心 → 从行李去掉 → voyage 时 selectedIds 没 id=5 → 中点返航
        //   - 没勾 id=5 → 保留在行李 → voyage 时 selectedIds 还有 id=5 → 到 Bandar
        self._selectedGiftIds = [];
        self._selectedCount = 0;
        self._selectedPrice = 0;
        self._ticketExchanged = true;
        self._showTicketModal();
      });
    }

    // 取消按钮
    var cancelBg = self.add.rectangle(80, 215, 140, 50, 0x1B3A5E, 1)
      .setStrokeStyle(1, 0x5fb3a0, 0.6);
    self.modalContainer.add(cancelBg);
    self.modalContainer.add(self.add.text(80, 215, '取消', {
      fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
    }).setOrigin(0.5));
    var cancelZone = self.add.zone(80, 215, 140, 50).setInteractive({ useHandCursor: true });
    self.modalContainer.add(cancelZone);
    cancelZone.on('pointerdown', function () {
      window.playQatarSfx('button', 0.4);  // M17: 兑换 modal 取消按钮 blip
      self.modalContainer.setVisible(false);
      self.joystickContainer.setVisible(true);
      self.actionContainer && self.actionContainer.setVisible(true);
      // M18 Bug 4: pauseContainer removed
    });

    // 提示行 (总价不够时)
    if (self._selectedCount > 0 && self._selectedPrice < L.PORT_TICKET_PRICE_THRESHOLD) {
      self.modalContainer.add(self.add.text(0, 145, '⚠️ 总价还差 ¥' + (L.PORT_TICKET_PRICE_THRESHOLD - self._selectedPrice), {
        fontSize: '11px', color: '#F6B5C8',
      }).setOrigin(0.5));
    }
    // M19: 移除 "❤️ 需要归家之心才能兑换" 提示 — gate 已移到 voyage 中点

    self.modalContainer.setVisible(true);
  };

  renderList();
},

// M12 Bug 6: 选中 gift ids 计算总价
_sumSelectedPrice: function (ids) {
  var total = 0;
  for (var i = 0; i < ids.length; i++) {
    for (var j = 0; j < L.gifts.length; j++) {
      if (L.gifts[j].id === ids[i]) { total += (L.gifts[j].price || 0); break; }
    }
  }
  return total;
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
      // M15 Bug A: 纯 HTML <div> modal — 替代 Phaser 浮动 DOM textarea 方案
      // 整个 modal card 用 HTML 渲染, Phaser 只触发 show/hide
      var modal = this.getOrCreateReviveModal();
      // M18 Bug 5: 按钮文案 → 「复活」
      var sendBtn = modal.querySelector('.btn-send');
      if (sendBtn) sendBtn.textContent = '复活';
      modal._scene = this;
      window.playQatarSfx('die', 0.5);  // M17: 渴死 sad tone
      modal.show();

      this.joystickContainer.setVisible(false);
      (this.actionContainer && this.actionContainer.setVisible(false));
      // M18 Bug 4: pauseContainer removed
      this.modalContainer.setVisible(true);

      // 自动聚焦 (50ms 等 modal 显示完)
      var self = this;
      this.time.delayedCall(50, function () {
        var ta = modal.querySelector('textarea');
        if (ta) ta.focus();
      });
    },

    // M15 Bug A: HTML modal — 替代浮动 textarea. 整个 modal card 都是 HTML,
    // 这样输入框真正嵌在 modal card 内, 不会被 Phaser 内部 z-index/事件拦截.
    getOrCreateReviveModal: function () {
      var root = document.getElementById('phaser-revive-modal');
      if (root) return root;
      // 全屏 fixed 容器
      root = document.createElement('div');
      root.id = 'phaser-revive-modal';
      root.style.cssText = [
        'position:fixed', 'inset:0',
        'display:none',
        'z-index:99999',
        'align-items:center', 'justify-content:center',
        'font-family:inherit',
      ].join(';');
      // 半透明 backdrop
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.style.cssText = [
        'position:absolute', 'inset:0',
        'background:rgba(20,12,6,0.45)',
      ].join(';');
      root.appendChild(backdrop);
      // modal card
      var card = document.createElement('div');
      card.className = 'modal-card';
      card.style.cssText = [
        'position:relative',
        'max-width:500px', 'width:min(500px,calc(100vw - 32px))',
        'padding:24px',
        'border-radius:12px',
        'background:#3A2140',
        'border:2px solid rgba(255,217,138,0.5)',
        'box-shadow:0 10px 40px rgba(0,0,0,0.6)',
        'color:#FFD98A',
      ].join(';');
      // 标题 — M18 Bug 5: 改成 "告诉我一个小秘密，让你立马复活"
      var h3 = document.createElement('h3');
      h3.textContent = '告诉我一个小秘密，让你立马复活';
      h3.style.cssText = [
        'margin:0 0 14px 0',
        'font-size:18px', 'font-weight:bold',
        'color:#FFD98A', 'text-align:center',
      ].join(';');
      card.appendChild(h3);
      // textarea — 真正嵌在 modal card 内
      var ta = document.createElement('textarea');
      ta.className = 'modal-textarea';
      ta.maxLength = 500;
      ta.placeholder = '说一个秘密…';
      ta.style.cssText = [
        'display:block',
        'width:100%', 'box-sizing:border-box',
        'min-height:80px', 'max-height:140px',
        'padding:8px 10px',
        'border-radius:6px',
        'border:1px solid #4a5578',
        'background:#2A2140',
        'color:#F4ECD8',
        'font-size:14px',
        'font-family:inherit',
        'resize:none',
        'outline:none',
      ].join(';');
      card.appendChild(ta);
      // 按钮行
      var btnRow = document.createElement('div');
      btnRow.className = 'modal-buttons';
      btnRow.style.cssText = [
        'display:flex', 'gap:12px', 'justify-content:center',
        'margin-top:16px',
      ].join(';');
      // 发送按钮 (粉色)
      var sendBtn = document.createElement('button');
      sendBtn.className = 'btn-send';
      sendBtn.type = 'button';
      sendBtn.style.cssText = [
        'flex:1', 'max-width:180px',
        'padding:10px 16px',
        'border:none', 'border-radius:8px',
        'background:#F6B5C8', 'color:#2A190E',
        'font-size:14px', 'font-weight:bold',
        'cursor:pointer',
      ].join(';');
      btnRow.appendChild(sendBtn);
      // 放弃按钮 (深色)
      var giveupBtn = document.createElement('button');
      giveupBtn.className = 'btn-giveup';
      giveupBtn.type = 'button';
      giveupBtn.textContent = '放弃';
      giveupBtn.style.cssText = [
        'flex:1', 'max-width:180px',
        'padding:10px 16px',
        'border:none', 'border-radius:8px',
        'background:#2A2140', 'color:#A8D8C0',
        'border:1px solid #4A5578',
        'font-size:14px', 'font-weight:bold',
        'cursor:pointer',
      ].join(';');
      btnRow.appendChild(giveupBtn);
      card.appendChild(btnRow);
      root.appendChild(card);
      document.body.appendChild(root);

      // show/hide API
      root.show = function () { root.style.display = 'flex'; ta.value = ''; ta.disabled = false; };
      root.hide = function () { root.style.display = 'none'; };

      // 按钮点击 → 走 scene.submitSecret / scene.giveUp
      // M18 Bug 5: submitSecret 不再需要 forceRestart 参数, 永远原地复活
      sendBtn.addEventListener('click', function () {
        window.playQatarSfx('button', 0.4);  // M17: 复活 modal "复活" 按钮 blip
        if (root._scene && typeof root._scene.submitSecret === 'function') {
          root._scene.submitSecret();
        }
      });
      giveupBtn.addEventListener('click', function () {
        window.playQatarSfx('button', 0.4);  // M17: 复活 modal "放弃" 按钮 blip
        if (root._scene && typeof root._scene.giveUp === 'function') {
          root._scene.giveUp();
        }
      });

      return root;
    },

    hideRevive: function () {
      this.modalContainer.setVisible(false);
      var modal = document.getElementById('phaser-revive-modal');
      if (modal && modal.hide) modal.hide();
      this.joystickContainer.setVisible(true);
      (this.actionContainer && this.actionContainer.setVisible(true));
      // M18 Bug 4: pauseContainer removed
    },

    // M18 Bug 5: 复活流程 — 输入任意非空文本 → 立即复活, 不调 /api/game/secret
    // M19: 复活后只给 10% water (保命但要继续探索补给, 不能满血)
    submitSecret: async function (forceRestart) {
      var modal = document.getElementById('phaser-revive-modal');
      var ta = modal ? modal.querySelector('textarea') : null;
      var sendBtn = modal ? modal.querySelector('.btn-send') : null;
      var text = (ta && ta.value ? ta.value : '').trim();
      if (!text) return;
      ta.disabled = true;
      if (sendBtn) sendBtn.disabled = true;

      // M19: 直接原地复活 + water 给 10% (= 1, 因为 WATER_MAX=10), 跳过 secret API
      this.hideRevive();
      this.water = Math.floor(L.WATER_MAX * 0.1);  // M19: 10% 复活, 不是满血
      this.playerContainer.x = this.player.x;
      this.playerContainer.y = this.player.y;
      this.changeWater(0);  // 刷新 waterText UI
      this.paused = false;
      this.state = 'PLAYING';
      // 反馈音 (复活成功的 pickup, 而不是死亡 die)
      window.playQatarSfx('pickup', 0.5);
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
      // M15 Part 2: 全部拾起条件从 6 升到 8 gifts
      var allPicked = this.pickupCount >= 8;
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
        // M12 Bug 6: 把选中的 gift ids 传给 ResultScene (判断 voyage 分支)
        selectedIds: this._selectedGiftIds || [],
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
      // M12 Bug 6: 读 selectedIds 用于 voyage 分支
      this.selectedIds = (data && data.selectedIds) || [];
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
      // M12 Bug 3: 「收 N 件」改「收 N 件物品」; 「拾 N/6 礼物」改「拾 N/8 物品」
      // M15 Part 2: 6 → 8 gifts
      this.add.text(640, 320, '收 ' + this.bucket + ' 件物品 · 拾 ' + this.picked + ' / 8 物品 · 水分 ' +
        this.water.toFixed(1) + ' / ' + L.WATER_MAX, {
        fontSize: '13px', color: '#C9B89A',
      }).setOrigin(0.5);
      this.add.text(640, 380, '+¥' + amount.toFixed(2), {
        fontSize: '38px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // ===== M8.5 关 0 → 关 1 叙事桥 =====
      // 关 0 攒出钱后，关 1 才是伊朗港口上船
      // M23.6: 简化叙事桥 — 不再分「有/无归家之心」分支. 不管有没有 id=5 都走 voyage 动画,
      //   中点返航逻辑在 _voyageUpdate 里统一处理 (没 id=5 时到 t=0.5 自动返航).
      var bridgeTxt;
      if (this.given) {
        bridgeTxt = '💸';
      } else {
        bridgeTxt = '🛳️ 用这一关攒的钱，下一站 → 伊朗港口 (Bandar Abbas) 上船';
      }
      this.add.text(640, 475, bridgeTxt, {
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
      // M19: 按钮文案统一为 "🚢 坐船出发" — 不管有没有归家之心都先上船
      //      没有归家之心 → voyage 中点返程 + 文字提示 → 重置回 level-0
      //      有归家之心 → voyage 到 Bandar → 跳 level-1
      // M23.5: 真正看"剩余行李"里有没有 id=5 归家之心 (this.selectedIds 在 ResultScene init 时从 _selectedGiftIds 拷贝)
      //   兑换船票消耗的物品已经从 _selectedGiftIds 移除 (line 1268 M23.5 修复), 所以剩余行李 = 没消耗的
      //   - 勾了 id=5 兑换了 → selectedIds 没 id=5 → 中点返航
      //   - 没勾 id=5 (没消耗) → selectedIds 还有 id=5 → 到 Bandar
      var hasHomeHeart = this.selectedIds.indexOf(5) !== -1;
      var nextBtnTxt = '🚢 坐船出发';
      var nextText = this.add.text(640, 555, nextBtnTxt, {
        fontSize: '20px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var nextZone = this.add.zone(640, 555, 280, 60).setInteractive({ useHandCursor: true });
      var self = this;
      nextZone.on('pointerdown', function () {
        // M19: 统一 "坐船出发" 触发点 — 根据 hasHomeHeart 决定 nextUrl
        //   有归家之心 → /games/silk-road/level/1 (下一关)
        //   无归家之心 → /games/silk-road/world-map (返程后回地图)
        var nextUrl = hasHomeHeart ? '/games/silk-road/level/1' : '/games/silk-road/world-map';
        self.playVoyageAnimation(nextUrl, hasHomeHeart);
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
  // M14: 暴露到 window 方便 e2e 验证 (modal 长度, BGM toggle, voyage fadeout 等)
  window.__qatarGame = game;

  // ==================== M9.5e Voyage 动画 ====================
// 关 0 通关 → ResultScene → 点继续 → playVoyageAnimation() → 1.8s → window.location.href 到 next 关
// 在 ResultScene 上画真实中东世界地图 + 船 + 字幕. 只用 graphics 内联, 不引外部资源.
//
// M15 Bug B: 替换深蓝海背景 → 真实中东世界地图 (Qatar/Saudi/UAE/Iran/Oman + 周边)
//            - 预取 countries-110m.json (BootScene 后台 fetch)
//            - d3.geoMercator center [60,32] scale 440 translate [640,360]
//            - d3.geoPath → SVG d 字符串 → 解析 M/L/Z → Phaser Graphics
//            - 沙漠色国家 vs 普通陆地色
// M12 Bug 6: voyage 分支 —— 含归家之心 → 去程; 不含 → 半途回程 (船走 60% 调头回 Doha)

// SVG path d 字符串 → Phaser Graphics moveTo/lineTo (110m 分辨率只用 M/L/Z/H/V, 跳过曲线)
function __qatarDrawSvgPath(graphics, dStr, strokeStyle, fillStyle) {
  if (!dStr) return;
  if (strokeStyle) graphics.lineStyle.apply(graphics, strokeStyle);
  if (fillStyle) graphics.fillStyle.apply(graphics, fillStyle);
  // tokenize: 命令字符 + 数字
  var tokens = [];
  var re = /([MLZHVCSQTAmlzhvcsqta])|(-?\d+\.?\d*(?:e[-+]?\d+)?)/gi;
  var m;
  while ((m = re.exec(dStr)) !== null) {
    if (m[1]) tokens.push(m[1]);
    else if (m[2]) tokens.push(parseFloat(m[2]));
  }
  var i = 0;
  var cx = 0, cy = 0;       // current point (绝对坐标)
  var sx = 0, sy = 0;       // subpath start (Z 回这里)
  var inFill = !!fillStyle;
  graphics.beginPath();
  while (i < tokens.length) {
    var cmd = tokens[i++];
    if (typeof cmd === 'number') {
      // 数字开头的隐式重复上一命令 (M 后默认 L)
      cmd = '__repeat__';
      i--; // 回退让循环重新读数字
    }
    if (cmd === 'M' || cmd === 'm') {
      var x = tokens[i++], y = tokens[i++];
      if (cmd === 'm' && (cx !== 0 || cy !== 0)) { x += cx; y += cy; }
      cx = x; cy = y; sx = x; sy = y;
      graphics.moveTo(cx, cy);
      // M 后跟多对数字 → 隐式 L
      var nextCmd = tokens[i];
      while (typeof nextCmd === 'number') {
        var lx = tokens[i++], ly = tokens[i++];
        cx = lx; cy = ly;
        graphics.lineTo(cx, cy);
        nextCmd = tokens[i];
      }
    } else if (cmd === 'L' || cmd === 'l' || cmd === '__repeat__') {
      var lx = tokens[i++], ly = tokens[i++];
      if (cmd === 'l' || cmd === '__repeat__' && false) { /* absolute path uses absolute */ }
      cx = lx; cy = ly;
      graphics.lineTo(cx, cy);
      // L 后跟多对数字 → 继续 L
      var next = tokens[i];
      while (typeof next === 'number') {
        cx = tokens[i++]; cy = tokens[i++];
        graphics.lineTo(cx, cy);
        next = tokens[i];
      }
    } else if (cmd === 'H' || cmd === 'h') {
      var hx = tokens[i++];
      cx = (cmd === 'h') ? cx + hx : hx;
      graphics.lineTo(cx, cy);
    } else if (cmd === 'V' || cmd === 'v') {
      var vy = tokens[i++];
      cy = (cmd === 'v') ? cy + vy : vy;
      graphics.lineTo(cx, cy);
    } else if (cmd === 'Z' || cmd === 'z') {
      graphics.closePath();
      cx = sx; cy = sy;
      // SVG 路径 Z 后下一命令若是 M, beginPath 已重置
    } else if (cmd === 'C' || cmd === 'c' || cmd === 'S' || cmd === 's' ||
               cmd === 'Q' || cmd === 'q' || cmd === 'T' || cmd === 't' ||
               cmd === 'A' || cmd === 'a') {
      // 跳过曲线参数 (按命令消耗合理参数数), 落到端点
      // C/S: 6 params (3 control+end pairs); c/s: 同样 6
      // Q/T: 4 params; q/t: 4
      // A: 7 params; a: 7
      var paramCount = (cmd === 'C' || cmd === 'c' || cmd === 'S' || cmd === 's') ? 6 :
                       (cmd === 'Q' || cmd === 'q' || cmd === 'T' || cmd === 't') ? 4 : 7;
      var endX, endY;
      // 最后一对是 end point
      for (var p = 0; p < paramCount - 2; p += 2) {
        var px = tokens[i++], py = tokens[i++];
        if ((cmd === 'c' || cmd === 's' || cmd === 'q' || cmd === 't' || cmd === 'a') && (px !== 0 || py !== 0)) {
          // 简化: 跳过详细转换, 只取最后一个点
        }
        void px; void py;
      }
      endX = tokens[i++]; endY = tokens[i++];
      if (cmd === 'c' || cmd === 's' || cmd === 'q' || cmd === 't' || cmd === 'a') {
        // 相对坐标
        endX += cx; endY += cy;
      }
      cx = endX; cy = endY;
      graphics.lineTo(cx, cy);
    } else {
      // 未知 token (比如 __repeat__ 失败) → 跳过
      break;
    }
  }
  if (inFill) graphics.fillPath();
  else graphics.strokePath();
}

ResultScene.prototype.buildVoyageContainer = function () {
  var self = this;
  this.voyageContainer = this.add.container(0, 0);
  this.voyageContainer.setDepth(3000);  // 盖住所有 ResultScene UI
  this.voyageContainer.setVisible(false);

  // ===== M15 Bug B: 真实中东世界地图背景 =====
  // 1) 海面深蓝底 (覆盖整个画布, 国家不画的位置 = 海洋)
  // M23.1: 改浅蓝 #3676A0 (Cerulean 深海) — 船跟海色差 66 → 168
  var seaBg = this.add.rectangle(640, 360, 1280, 720, 0x3676A0, 1);
  this.voyageContainer.add(seaBg);

  // 2) d3 Mercator 投影 (M16 Bug 1: fitExtent 卡塔尔→伊朗 bbox, 横跨波斯湾)
  //    旧版 center[60,32] scale 440 → 用户要求"卡塔尔到伊朗这一段放大就行"
  //    新版: bbox = [lng 50-58, lat 24-29] (矩形 8° lng × 5° lat)
  //          手动 fitExtent (d3.fitExtent 在小 bbox + Mercator 失真下结果不稳),
  //          用 4 角投影 + compute scale/translate 让这段地理区域填满 voyage container.
  //    矩形 viewport 1180×620px (留 50px/50px margin), Doha 在西, Bandar 在东
  var voyageProjection = null;
  var dohaXY = null, bandarXY = null;
  if (window.d3 && window.d3.geoMercator) {
    try {
      var lngMin = 50, lngMax = 58, latMin = 24, latMax = 29;
      // 在 scale=1 下投影 4 角 (Mercator y = -ln(tan(45+lat/2)))
      var corners = [
        [lngMin * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMin * Math.PI / 360))],
        [lngMax * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMin * Math.PI / 360))],
        [lngMin * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMax * Math.PI / 360))],
        [lngMax * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + latMax * Math.PI / 360))],
      ];
      var projMinX = Math.min(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
      var projMaxX = Math.max(corners[0][0], corners[1][0], corners[2][0], corners[3][0]);
      var projMinY = Math.min(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
      var projMaxY = Math.max(corners[0][1], corners[1][1], corners[2][1], corners[3][1]);
      var projW = projMaxX - projMinX;
      var projH = projMaxY - projMinY;
      // viewport = 1180×620, 居中于 extent [[50,50],[1230,670]]
      var extW = 1180, extH = 620;
      var fitScale = Math.min(extW / projW, extH / projH);
      var tx = (extW - fitScale * projW) / 2 - fitScale * projMinX + 50;
      var ty = (extH - fitScale * projH) / 2 - fitScale * projMinY + 50;
      voyageProjection = window.d3.geoMercator().scale(fitScale).translate([tx, ty]);
      dohaXY = voyageProjection([51.53, 25.30]);   // Doha (卡塔尔首都)
      bandarXY = voyageProjection([56.27, 27.18]);  // Bandar Abbas (伊朗波斯湾港口)
    } catch (e) {
      console.warn('[voyage] d3 projection failed:', e);
    }
  }
  // 兜底: d3 不可用时用估算坐标 (横跨波斯湾布局, 跟手动 fitExtent 接近)
  if (!dohaXY || !bandarXY) {
    dohaXY = [366, 511];
    bandarXY = [892, 279];
  }

  // 3) 画国家轮廓 (若 window.__qatarCountriesGeo 已就绪)
  //    - 沙漠色国家 (中东+北非重点) vs 普通陆地
  //    - 只画 viewport 范围内的国家 (用简单 bbox 粗筛)
  var DESERT_NAMES = new Set([
    'Saudi Arabia','United Arab Emirates','Qatar','Bahrain','Kuwait',
    'Oman','Yemen','Iran','Iraq','Jordan','Syria','Israel','Egypt',
    'Turkmenistan','Uzbekistan','Kazakhstan','Afghanistan','Pakistan',
    'Western Sahara','Mauritania','Algeria','Libya','Sudan','Mali','Niger','Chad',
  ]);
  if (window.__qatarCountriesGeo && voyageProjection && window.d3 && window.d3.geoPath) {
    try {
      var geoPath = window.d3.geoPath(voyageProjection);
      var features = window.__qatarCountriesGeo.features || [];
      // M16 Bug 1: viewport 跟 fitExtent bbox 对齐 — longitude 48-60, latitude 22-31
      //            (留 2° 余量避免边缘国家被截)
      var lngMin = 48, lngMax = 60, latMin = 22, latMax = 31;
      for (var fi = 0; fi < features.length; fi++) {
        var feat = features[fi];
        var nm = (feat.properties && feat.properties.name) || '';
        // 计算 feature 中心 (粗筛用)
        var coords = feat.geometry && feat.geometry.coordinates;
        if (!coords) continue;
        // 简化: 通过 d3.geoBounds 算 bbox
        var bounds = window.d3.geoBounds(feat);
        var cxLng = (bounds[0][0] + bounds[1][0]) / 2;
        var cxLat = (bounds[0][1] + bounds[1][1]) / 2;
        if (cxLng < lngMin - 5 || cxLng > lngMax + 5) continue;
        if (cxLat < latMin - 5 || cxLat > latMax + 5) continue;
        // 取 d 字符串
        var dStr = geoPath(feat);
        if (!dStr) continue;
        // 沙漠色 vs 普通陆地
        var fillColor = DESERT_NAMES.has(nm) ? 0xD4B07A : 0xB5A082;
        var g = this.add.graphics();
        __qatarDrawSvgPath(g, dStr,
          [0.7, 0x4A2E1A, 0.85],  // strokeStyle: width 0.7, color #4A2E1A, alpha 0.85
          [fillColor, 0.95]);        // fillStyle: 沙色 / 普通色
        this.voyageContainer.add(g);
      }
    } catch (e) {
      console.warn('[voyage] map draw failed:', e);
    }
  } else {
    // 兜底: 画一个大浅沙色 ellipse 当陆地
    console.warn('[voyage] __qatarCountriesGeo not ready, drawing fallback landmass');
    var fallbackLand = this.add.graphics();
    fallbackLand.fillStyle(0xD4B07A, 0.85);
    fallbackLand.fillEllipse(640, 380, 1000, 380);
    fallbackLand.lineStyle(0.7, 0x4A2E1A, 0.85);
    fallbackLand.strokeEllipse(640, 380, 1000, 380);
    this.voyageContainer.add(fallbackLand);
  }

  // 4) 海浪 (细线, 几条) — 盖在地图上, 弱化
  for (var wi = 0; wi < 3; wi++) {
    var wg = this.add.graphics();
    wg.lineStyle(1, 0xA8D8C0, 0.18);
    wg.beginPath();
    var yBase = 500 + wi * 50;
    for (var wx = 0; wx <= 1280; wx += 24) {
      var wy = yBase + Math.sin(wx * 0.022 + wi * 1.3) * 5;
      if (wx === 0) wg.moveTo(wx, wy); else wg.lineTo(wx, wy);
    }
    wg.strokePath();
    this.voyageContainer.add(wg);
  }

  // 4b) dashed gold line (船航行路径)
  // Phaser Graphics 3.80 没有 quadraticBezier, 用 lineTo 采样 Bezier 30 个点画 dashed gold line
  var mx = (dohaXY[0] + bandarXY[0]) / 2;
  var my = (dohaXY[1] + bandarXY[1]) / 2 - 28;
  // 二次贝塞尔采样 30 个点
  var pts = [];
  for (var ii = 0; ii <= 30; ii++) {
    var tt = ii / 30;
    var px = (1 - tt) * (1 - tt) * dohaXY[0] + 2 * (1 - tt) * tt * mx + tt * tt * bandarXY[0];
    var py = (1 - tt) * (1 - tt) * dohaXY[1] + 2 * (1 - tt) * tt * my + tt * tt * bandarXY[1];
    pts.push([px, py]);
  }
  // 金线 (实线, 底)
  var pathG = this.add.graphics();
  pathG.lineStyle(2.5, 0xFFD700, 0.85);
  pathG.beginPath();
  pathG.moveTo(pts[0][0], pts[0][1]);
  for (var pi = 1; pi < pts.length; pi++) {
    pathG.lineTo(pts[pi][0], pts[pi][1]);
  }
  pathG.strokePath();
  // 虚线盖在金线上 (深蓝 dash, 模拟 dashed look)
  // M23.1: dash 改 SteelBlue Lite #4A8FB8 (透明度 0.95→0.85 不那么硬)
  var dashG = this.add.graphics();
  dashG.lineStyle(2.5, 0x4A8FB8, 0.85);
  for (var d = 0; d < pts.length - 1; d += 2) {
    dashG.beginPath();
    dashG.moveTo(pts[d][0], pts[d][1]);
    dashG.lineTo(pts[d + 1][0], pts[d + 1][1]);
    dashG.strokePath();
  }
  // M12 Bug 7 fix: 把金线 + 虚线都加到 voyageContainer (否则深蓝背景会盖住)
  this.voyageContainer.add([pathG, dashG]);

  // 4c) Doha pin (绿色 ⚓ 港口)
  var dohaBg = this.add.circle(dohaXY[0], dohaXY[1], 18, 0x5fb3a0, 0.9)
    .setStrokeStyle(2, 0xFFD700, 0.95);
  var dohaEmoji = this.add.text(dohaXY[0], dohaXY[1], '⚓', { fontSize: '22px' }).setOrigin(0.5);
  var dohaLabel = this.add.text(dohaXY[0], dohaXY[1] - 32, 'Doha', {
    fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
    stroke: '#0E2A47', strokeThickness: 3,
  }).setOrigin(0.5);
  // M12 Bug 7 fix: 把 pin + emoji + label 都加到 voyageContainer, 否则会被深蓝背景遮住
  this.voyageContainer.add([dohaBg, dohaEmoji, dohaLabel]);

  // 4d) Bandar Abbas pin (金色 🐪 港口)
  var bandarBg = this.add.circle(bandarXY[0], bandarXY[1], 18, 0xFFD700, 0.95)
    .setStrokeStyle(2, 0x0E2A47, 0.95);
  var bandarEmoji = this.add.text(bandarXY[0], bandarXY[1], '🐪', { fontSize: '22px' }).setOrigin(0.5);
  var bandarLabel = this.add.text(bandarXY[0], bandarXY[1] - 32, 'Bandar Abbas', {
    fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
    stroke: '#0E2A47', strokeThickness: 3,
  }).setOrigin(0.5);
  this.voyageContainer.add([bandarBg, bandarEmoji, bandarLabel]);

  // 存 Doha/Bandar 坐标给 playVoyageAnimation 用
  this.voyageDohaXY = dohaXY;
  this.voyageBandarXY = bandarXY;
  this.voyageCurve = { mx: mx, my: my };  // Bezier control point

  // 5) 帆船 (船头指向前进方向 + 翻转动效)
// M18 Bug 6: 用 Phaser Graphics 画帆船 (船身 + 船头三角 + 上层建筑 + 桅杆 + 旗帜)
//           船头朝 +X 方向 (旋转 origin=容器中心), 沿 Bezier 路径用 setRotation(angle) 切线对齐.
//           返程时 scaleX=-1 镜像 (Graphics 没有 setFlipX, 用 scaleX).
// M20: 撤销 M19 的"大邮轮" — 用户反馈太丑, 恢复 M18 简洁三角帆船风格
// M23: 用真实 PNG sprite 替代 M18-M22 的 Phaser.Graphics 程序绘制船
//      D = 2nd_ship_new_4 (暗红剪影, CC0 OpenGameArt, scale=0.18)
//      原图 400x400, bbox 367x258 → 屏显 ~66x46 px
//      setOrigin(0.5) 保证 sprite 中心对齐 dohaXY (替代 M18 Graphics 的 (0,0) 居中行为).
//      shipContainer.scaleX=-1 返程镜像保留 (Image 走 transform pipeline, Container 镜像对子 Image 生效 — M9.3b 验证).
  var shipImg = this.add.image(0, 0, 'voyage-ship');
  shipImg.setOrigin(0.5, 0.5);
  // M23.2: scale 0.25 → 0.50 (屏显 180×130, 用户要求 "再放大一倍")
  shipImg.setScale(0.50);  // M23.2 用户要求再放大一倍 (屏显 180×130)
  var shipContainer = this.add.container(dohaXY[0], dohaXY[1], [shipImg]);
  this.shipContainer = shipContainer;
  // M18 Bug 6: 默认旋转 0 → 船头朝 +X (即朝向 Bandar)
  this.shipContainer.setRotation(0);
  this.voyageContainer.add(shipContainer);

  // 6) 字幕 (顶部 + 底部)
  // M12 Bug 6: 文案分支 (forward=去程, return=回程)
  var topText = this.add.text(640, 60, '🌊 离开多哈 · 波斯湾 → 伊朗 / 阿巴斯港', {
    fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
    wordWrap: false,
  }).setOrigin(0.5);
  topText.setFixedSize(1100, 30);

  var subText = this.add.text(640, 620, '下一站 → 伊朗 🐪', {
    fontSize: '18px', color: '#A8D8C0', fontStyle: 'italic',
    wordWrap: false,
  }).setOrigin(0.5);
  subText.setFixedSize(1100, 24);

  // M18 Bug 2: 没有归家之心时, 船到波斯湾中点时弹出文字
  var noHeartMessage = this.add.text(640, 460, '没有归家之心，看来你只是想坐船去玩玩。', {
    fontSize: '20px', color: '#0E2A47', fontStyle: 'bold',
    backgroundColor: '#FFFFFF', padding: { x: 14, y: 8 },
  }).setOrigin(0.5);
  noHeartMessage.setAlpha(0);
  this.voyageNoHeartMessage = noHeartMessage;

  this.voyageTopText = topText;
  this.voyageSubText = subText;
  this.voyageContainer.add([topText, subText, noHeartMessage]);
};

// ==================== M9.5e Voyage 动画 (M18 重构) ====================
// M18 重做: 用时间驱动 update (而不是 tween 位置), 实现
//   - 船头 setRotation 沿路径切线方向
//   - 返程时 scaleX=-1 镜像, rotation 也翻转
//   - 中点 (t=0.5) 检测 + 浮出文字
//   - 动画结束 → 右下角 "继续" 按钮
ResultScene.prototype.playVoyageAnimation = function (nextUrl, hasHomeHeart) {
  var self = this;
  if (hasHomeHeart === undefined) hasHomeHeart = true;

  // M17: voyage 出发 whoosh + chime (BGM 淡出前先播, 避免淡到 0 听不到)
  window.playQatarSfx('voyage', 0.6);

  // M14 Bug B: voyage 期间 BGM 淡出 (避免关 1 也继承播放, 但 reset 场景时 BGM 不停)
  var bgmAudio = document.getElementById('silk-road-bgm');
  if (bgmAudio && !bgmAudio.paused && hasHomeHeart) {
    var startVol = bgmAudio.volume;
    self.tweens.add({
      targets: { v: startVol },
      v: 0,
      duration: 1800,
      ease: 'Linear',
      onUpdate: function (tween) {
        bgmAudio.volume = tween.getValue();
      },
      onComplete: function () {
        bgmAudio.pause();
        bgmAudio.volume = startVol;
      },
    });
  }
  // M18 Bug 3: 没归家之心 → BGM 不暂停, 保持当前播放

  this.voyageContainer.setVisible(true);

  // 隐藏所有 ResultScene UI 元素
  this.children.list.forEach(function (c) {
    if (c !== self.voyageContainer) c.setVisible(false);
  });

  // M18: 文案分支 (统一为"出海"主题, 不再区分目的地)
  if (hasHomeHeart) {
    self.voyageTopText.setText('🌊 离开多哈 · 波斯湾 → 伊朗 / 阿巴斯港');
    self.voyageSubText.setText('下一站 → Bandar Abbas 🐪');
  } else {
    self.voyageTopText.setText('🌊 离开多哈 · 波斯湾');
    self.voyageSubText.setText('准备出发');
  }

  // 计算 Bezier 路径点 (60 个采样点, 密度更高)
  var pts = [];
  var dohaXY = self.voyageDohaXY;
  var bandarXY = self.voyageBandarXY;
  var curve = self.voyageCurve;
  for (var i = 0; i <= 60; i++) {
    var t = i / 60;
    var px = (1 - t) * (1 - t) * dohaXY[0] + 2 * (1 - t) * t * curve.mx + t * t * bandarXY[0];
    var py = (1 - t) * (1 - t) * dohaXY[1] + 2 * (1 - t) * t * curve.my + t * t * bandarXY[1];
    pts.push([px, py]);
  }

  // 状态机字段
  self.voyagePts = pts;
  self.voyageT = 0;             // 0..1
  self.voyageSpeed = 1 / 4;     // 4 秒走完全程 (返程时反向, 留 3s 中点停留 + 4s 返程)
  self.voyageReturnMode = false; // false=去程, true=返程
  self.voyageDone = false;
  self.voyageMidpointReached = false;
  self.voyageNoHeartReturnStart = false;  // 返程开始的延迟触发器
  // M21: 中点返程倒计时 (替代 time.delayedCall)
  self.voyageMidpointTimer = 0;
  self.voyageMidpointDelay = hasHomeHeart ? 9999 : 1.5;  // 有心时永远不触发返程
  self.voyageHasHeart = hasHomeHeart;
  self.voyageNextUrl = nextUrl;
  // 船初始位置 = Doha
  self.shipContainer.x = dohaXY[0];
  self.shipContainer.y = dohaXY[1];
  self.shipContainer.scaleX = 1;
  self.shipContainer.setRotation(0);

  // 路径插值 + 切线 (二次贝塞尔)
  var bezierPoint = function (tt) {
    return {
      x: (1 - tt) * (1 - tt) * dohaXY[0] + 2 * (1 - tt) * tt * curve.mx + tt * tt * bandarXY[0],
      y: (1 - tt) * (1 - tt) * dohaXY[1] + 2 * (1 - tt) * tt * curve.my + tt * tt * bandarXY[1],
    };
  };
  var bezierTangent = function (tt) {
    // d/dt = 2(1-t)(P1-P0) + 2t(P2-P1)
    return {
      x: 2 * (1 - tt) * (curve.mx - dohaXY[0]) + 2 * tt * (bandarXY[0] - curve.mx),
      y: 2 * (1 - tt) * (curve.my - dohaXY[1]) + 2 * tt * (bandarXY[1] - curve.my),
    };
  };

  // 时间驱动的 update 循环
  self._voyageUpdate = function (time, delta) {
    if (self.voyageDone) return;
    var dt = delta / 1000;  // 秒

    // 计算前进方向: 去程 +tt, 返程 -tt
    var direction = self.voyageReturnMode ? -1 : 1;
    self.voyageT += direction * dt * self.voyageSpeed;
    if (self.voyageT >= 1.0) self.voyageT = 1.0;
    if (self.voyageT <= 0.0) self.voyageT = 0.0;

    // M23.3: 中点返程检测 — voyageT 跨过 0.5 立刻设 voyageMidpointReached=true
    //   之前 M21 注释说"中点跨过 0.5 → voyageMidpointReached=true", 但代码漏了,
    //   导致没归家之心时船一直走到 t=1.0 兜底分支才返程 (用户感觉"没掉头")
    if (!self.voyageMidpointReached && self.voyageT >= 0.5 && !self.voyageReturnMode) {
      self.voyageMidpointReached = true;
      self.voyageMidpointTimer = 0;
      // 没归家之心才显示 noHeartMessage
      if (!self.voyageHasHeart && self.voyageNoHeartMessage) {
        self.voyageNoHeartMessage.setAlpha(1);
      }
    }

    // 船位置
    var pos = bezierPoint(self.voyageT);
    self.shipContainer.x = pos.x;
    self.shipContainer.y = pos.y;

    // 切线方向 → rotation
    var tangent = bezierTangent(self.voyageT);
    var angle = Math.atan2(tangent.y, tangent.x);
    // M23.3: sprite 原图船头朝 -X (PIL 验证: 桅杆顶 x=257 > 船底中心 x=246)
    //        所以去程也用 scaleX=-1 镜像, 让船头朝运动方向 (右上 = Bandar)
    //        返程 sprite 不镜像 (默认朝 -X = 朝 Doha), 船头也朝运动方向
    if (self.voyageReturnMode) {
      // 返程: sprite 默认朝 -X = 朝 Doha 方向 = 跟返程一致, 不镜像
      self.shipContainer.scaleX = 1;
      self.shipContainer.setRotation(angle);
    } else {
      // 去程: sprite 朝 -X, 镜像 (scaleX=-1) 后朝 +X = 朝 Bandar 方向
      self.shipContainer.scaleX = -1;
      self.shipContainer.setRotation(angle);
    }

    // 终点检测
    // M20 Bug B: 没归家之心时, 即使 ship 跨过 t=1.0 (中点 delayedCall 没触发 / 帧跳过)
    //          也必须强制跳回中点 + 触发返程 — 否则船永远卡在 Bandar, voyageDone=false
    if (!self.voyageReturnMode && self.voyageT >= 1.0) {
      if (self.voyageHasHeart) {
        // 有归家之心 → 终点 (Bandar) 弹 continue 按钮
        self.voyageDone = true;
        self._showVoyageContinueButton();
        return;
      } else {
        // 没归家之心 → 兜底: 强制跳回中点 + 启动返程倒计时 (不再依赖 delayedCall)
        // M21: 用 voyageMidpointTimer (每帧 +dt) 替代 time.delayedCall, 保证每帧检查
        //   触发. 之前 Phaser headless 下 delayedCall 不触发导致船卡 Bandar.
        self.voyageT = 0.5;
        self.voyageMidpointReached = true;
        self.voyageMidpointTimer = 0;  // 返程倒计时起点
        self.voyageMidpointDelay = 0.8; // 0.8s 后启动返程 (兜底场景比正常场景快)
        if (self.voyageNoHeartMessage) {
          self.voyageNoHeartMessage.setAlpha(1);
        }
        return;
      }
    }
    if (self.voyageReturnMode && self.voyageT <= 0.0 && !self.voyageHasHeart) {
      // 返程结束 → 回到 Doha
      self.voyageDone = true;
      self._showVoyageContinueButton();
      return;
    }

    // M21 Bug: 中点返程触发 — 改用每帧倒计时 (voyageMidpointTimer) 替代 delayedCall
    //   delayedCall 在 Phaser headless 模式下不稳定, 改用确定性逻辑.
    //   M23.3: 中点跨过 0.5 → voyageMidpointReached=true (上面新加的触发代码)
    //         → voyageMidpointTimer 开始累计
    //         达到 voyageMidpointDelay (1.5s) → voyageReturnMode=true
    if (!self.voyageReturnMode
        && self.voyageMidpointReached
        && !self.voyageHasHeart) {
      self.voyageMidpointTimer += dt;
      if (self.voyageMidpointTimer >= self.voyageMidpointDelay) {
        // 启动返程
        if (self.voyageNoHeartMessage) {
          self.tweens.add({
            targets: self.voyageNoHeartMessage,
            alpha: 0,
            duration: 300,
          });
        }
        self.voyageReturnMode = true;
        self.voyageSpeed = 1 / 4;
        return;
      }
    }
  };

  // 注册 update listener (Phaser scene 自带 update, 也支持 events.on('update'))
  self.events.on('update', self._voyageUpdate, self);
};

// M18 Bug 3: voyage 动画结束后, 右下角弹出 "继续" 按钮
ResultScene.prototype._showVoyageContinueButton = function () {
  var self = this;
  if (self.voyageContinueBtn) return;  // 防重复

  var btnX = 1280 - 100;  // 右上 = canvas_width - 100
  var btnY = 720 - 50;    // 右上 = canvas_height - 50

  // 半透明黑底 + 白字 (圆角 48x32)
  var bg = self.add.rectangle(btnX, btnY, 96, 48, 0x000000, 0.55)
    .setStrokeStyle(2, 0xFFD98A, 0.7);
  var txt = self.add.text(btnX, btnY, '继续', {
    fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
  }).setOrigin(0.5);
  var zone = self.add.zone(btnX, btnY, 96, 48).setInteractive({ useHandCursor: true });
  zone.on('pointerdown', function () {
    window.playQatarSfx('button', 0.4);
    self._onVoyageContinue();
  });
  // 按钮用 3500 层 (在 voyageContainer 之上, 但 voyageContainer 已经 setDepth(3000))
  // 直接加到 scene root 即可, voyageContainer 是同一层
  self.add.existing(bg);  // 保险
  bg.setDepth(3500);
  txt.setDepth(3500);
  zone.setDepth(3500);

  self.voyageContinueBtn = { bg: bg, txt: txt, zone: zone };
};

// M18 Bug 3: 继续按钮 → 根据 hasHeart 决定去 level-1 还是 reset
ResultScene.prototype._onVoyageContinue = function () {
  var self = this;
  if (self.voyageContinueHandler) return;  // 防双击
  self.voyageContinueHandler = true;

  if (self.voyageHasHeart) {
    // 有归家之心 → 进 level-1, luggage 保留 (浏览器 URL 跳转, 不重置 localStorage)
    window.location.href = self.voyageNextUrl || '/games/silk-road/level/1';
  } else {
    // 没有归家之心 → 重置所有状态回到 level-0 干净状态
    // 清空 luggage
    if (window.LUGGAGE) window.LUGGAGE.length = 0;
    // 清 localStorage 的 session 和 claim 标记 (保证新游戏干净)
    try {
      // 不删 session_id (新游戏沿用 nickname), 但清 claim
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf('silkroad_claimed_') === 0) localStorage.removeItem(keys[i]);
      }
      localStorage.removeItem('silkroad_cleared_levels');
    } catch (e) {}
    // 关闭所有 modal
    document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
    var reviveModal = document.getElementById('phaser-revive-modal');
    if (reviveModal && reviveModal.hide) reviveModal.hide();
    // 取消 voyage update 监听
    if (self._voyageUpdate && self.events) {
      self.events.off('update', self._voyageUpdate, self);
    }
    // 跳到 level-0 URL (走正常页面加载)
    window.location.href = '/games/silk-road/level/0';
  }
};

  // ==================== M16 Bug 6: 自定义 Graphics 礼物 sprite ====================
  // 给 gift id=0 (沙漠玫瑰), id=4 (LNG 储罐), id=6 (火炬塔) 用 Phaser.Graphics 程序绘制
  // 56x56 icon (跟大力神杯 PNG display size 一致), 中心 (0,0)
  // 颜色: 沙漠色 (棕黄橙), 不依赖 emoji 字体, 跨浏览器一致
  PlayScene.prototype._buildCustomGiftSprite = function (g) {
    var container = this.add.container(g.x, g.y + 10);
    // 光晕 (金黄) 跟其他 gift 一致
    var glow = this.add.graphics();
    glow.fillStyle(0xFFD98A, 0.35);
    glow.fillCircle(0, 0, 28);
    container.add(glow);

    var icon = this.add.graphics();
    if (g.id === 0) {
      // —— 沙漠玫瑰 (desert rose) ——
      // 5 个椭圆花瓣 (沙漠色 #C19A6B + 浅橙 #D4A857 交替), 黄圆心, 棕色茎
      var petalR = 14;   // 花瓣长轴
      var petalW = 7;    // 花瓣短轴
      var colors = [0xC19A6B, 0xD4A857, 0xC19A6B, 0xD4A857, 0xC19A6B];
      // 茎 (先画, 在花后面)
      icon.fillStyle(0x5C3A1E, 1);
      icon.fillRoundedRect(-1.5, 8, 3, 14, 1);
      // 5 片花瓣, 旋转 -90°, -18°, 54°, 126°, 198° (等分 72°, 起始向上)
      var angles = [-90, -18, 54, 126, 198];
      for (var i = 0; i < 5; i++) {
        icon.fillStyle(colors[i], 1);
        // 用 save/restore 模拟旋转
        var rad = angles[i] * Math.PI / 180;
        var cx = Math.cos(rad) * 7;
        var cy = Math.sin(rad) * 7;
        // 椭圆 = 中心 (cx,cy), 半径 petalR 长轴 + petalW 短轴
        icon.fillEllipse(cx, cy, petalR * 2, petalW * 2);
        // 花瓣暗影 (深一点)
        icon.fillStyle(0x8B6B3A, 0.4);
        icon.fillEllipse(cx, cy + 2, petalR * 1.5, petalW);
      }
      // 黄圆心 (#FFD98A)
      icon.fillStyle(0xFFD98A, 1);
      icon.fillCircle(0, 0, 6);
      icon.fillStyle(0xE8C282, 1);
      icon.fillCircle(0, 0, 3);
    } else if (g.id === 4) {
      // —— LNG 储罐 (Qatar Gas) ——
      // 圆柱罐 (灰色 #B0B0B0) + 顶部圆顶 + 蓝色火焰
      // 罐身 (圆柱, 用 roundedRect 近似)
      icon.fillStyle(0xB0B0B0, 1);
      icon.fillRoundedRect(-16, -2, 32, 26, 4);
      // 罐身阴影 (右侧)
      icon.fillStyle(0x707070, 1);
      icon.fillRoundedRect(8, -2, 8, 26, 4);
      // 罐顶圆顶
      icon.fillStyle(0xC0C0C0, 1);
      icon.fillEllipse(0, -2, 32, 10);
      // 罐顶管道 (小竖管)
      icon.fillStyle(0x606060, 1);
      icon.fillRoundedRect(-2, -12, 4, 10, 1);
      // "QATAR GAS" 小字 (用 Phaser Text 加到 container, 不画到 icon)
      // 火焰 (蓝色, 三角形从管口向上) — 这是关键标志, 表示 LNG 出口
      icon.fillStyle(0x4A90E2, 1);
      icon.beginPath();
      icon.moveTo(0, -12);
      icon.lineTo(4, -22);
      icon.lineTo(0, -28);
      icon.lineTo(-4, -22);
      icon.closePath();
      icon.fillPath();
      // 内焰 (浅蓝)
      icon.fillStyle(0xA8D8FF, 1);
      icon.beginPath();
      icon.moveTo(0, -12);
      icon.lineTo(2, -18);
      icon.lineTo(0, -23);
      icon.lineTo(-2, -18);
      icon.closePath();
      icon.fillPath();
    } else if (g.id === 6) {
      // —— 火炬塔 (Aspire Park) ——
      // 钢杆 (#5C3A1E) + 火焰 (橙→红渐变)
      // 底座 (深色矩形)
      icon.fillStyle(0x3A2614, 1);
      icon.fillRoundedRect(-12, 22, 24, 6, 2);
      // 钢杆 (深棕, 中心竖条)
      icon.fillStyle(0x5C3A1E, 1);
      icon.fillRoundedRect(-3, -10, 6, 32, 1);
      // 横臂 (顶部小横, 让火炬像塔)
      icon.fillStyle(0x5C3A1E, 1);
      icon.fillRoundedRect(-7, -10, 14, 2, 1);
      // 火焰外层 (橙)
      icon.fillStyle(0xFF8C42, 1);
      icon.beginPath();
      icon.moveTo(0, -10);
      icon.lineTo(8, -22);
      icon.lineTo(0, -36);
      icon.lineTo(-8, -22);
      icon.closePath();
      icon.fillPath();
      // 火焰中层 (橙黄)
      icon.fillStyle(0xFFB347, 1);
      icon.beginPath();
      icon.moveTo(0, -10);
      icon.lineTo(5, -20);
      icon.lineTo(0, -30);
      icon.lineTo(-5, -20);
      icon.closePath();
      icon.fillPath();
      // 火焰内层 (黄)
      icon.fillStyle(0xFFE066, 1);
      icon.beginPath();
      icon.moveTo(0, -10);
      icon.lineTo(3, -18);
      icon.lineTo(0, -24);
      icon.lineTo(-3, -18);
      icon.closePath();
      icon.fillPath();
    }
    container.add(icon);

    // "QATAR GAS" 文字 (只在 LNG 罐子上加)
    if (g.id === 4) {
      var labelGas = this.add.text(0, 14, 'QATAR GAS', {
        fontSize: '6px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(labelGas);
    }

    // gift 名字标签 (跟其他 gift 一致)
    var label = this.add.text(0, 30, g.name, {
      fontSize: '11px', color: '#FFD98A', fontStyle: 'bold',
      stroke: '#4A2E1A', strokeThickness: 3,
      wordWrap: false,
    }).setOrigin(0.5);
    label.setFixedSize(80, 14);
    container.add(label);

    return container;
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