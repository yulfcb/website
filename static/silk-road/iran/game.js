// 伊朗·阿巴斯港大巴扎 —— 关 1 游戏引擎 (M4: 货币系统 + 水壶可视化)
//
// 重做原因：原 Iran 关是纯 DOM 卡片游戏，太简单。仿关 0 (Qatar) 的 Phaser 模式：
// 玩家控制人物在沙漠地图上行走，
// - 走访 🏦 交易中心把行李物品换成伊朗里亚尔 (﷼)
// - 用里亚尔在 6 家波斯商贩 (地毯/藏红花/茶/陶/骆驼/水壶) 买商品
// - 走访 2 个绿洲给水壶灌水
// - 集齐 **2 个水壶 + 2 壶都满 10L** 启程去土耳其 (Bazargan 巴扎尔甘边境)
// - 携带行李箱 (quantity-based 同类型可多件) 跨级
//
// M4 范围：
//   - 货币系统: 玩家有 `this.coins` 余额, 中心用行李物品换里亚尔, 商贩收里亚尔卖货
//   - 交易中心 (🏦): 起点附近, 反复可兑换, 归家之心 ❤️ 不可兑换
//   - 水壶 HUD 可视化: 进度条 + 数字, 灌水时有 +10L 浮动反馈, 空水壶红色警告
//   - HUD 5 项: 🫗水壶 / 💰余额 / 🐪骑乘 / 🧳行李 / 🔊BGM
//   - 缺水不再直接死亡, 显示警告 toast; 仍不能过境 (需要 2 壶满水)
//
// M3 范围 (保留):
//   - 水壶系统: 玩家拥有 N 个水壶, 每个满 10L; 行走 -0.1L (从当前水壶扣);
//     绿洲自动把最空的水壶灌满 (除非都满)
//   - 出口条件: 2 壶 + 2 壶都满水 + 走到左上方巴扎尔甘 → camera fade → 跳下一关
//   - 行李箱 (🧳): quantity-based 物品数组, localStorage `silkroad_luggage` 新格式
//   - 骆驼视觉: emoji 40px+, 人物骑在上方 (略缩小)
//
// 复用关 0 (qatar/game.js) 的代码：
//   - _buildAvatarSprite (4 个角色 graphics) — 角色选择共享 localStorage
//   - makeDpadBtn / joystickContainer — D-pad 容器
//   - tryMove / _movementUpdate — 步进循环

(function () {
  'use strict';

  if (!window.IRAN_MODE) {
    console.warn('[iran-m3] window.IRAN_MODE not set, abort');
    return;
  }
  var L = window.IRAN_LEVEL;
  var Q = window.QATAR_LEVEL;  // 商品本体定义从 QATAR_LEVEL.gifts 来 (8 件)
  if (!L) {
    console.error('[iran-m3] window.IRAN_LEVEL missing, abort');
    return;
  }
  if (!Q || !Q.gifts) {
    console.error('[iran-m3] window.QATAR_LEVEL.gifts missing, abort');
    return;
  }
  var LEVEL_ID = 1;
  // M3: 商品数据 (商品本体) 来自卡塔尔关 gifts, 用 item.id 索引. id=5 归家之心不可交易.
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

  // ============== BGM 持久化状态 (M3) ==============
  // 首次进入页面, 听用户选择是否静音 (默认 false, 但浏览器 autoplay policy 仍要求一次 pointerdown)
  function getBgmMuted() {
    try { return localStorage.getItem('silkroad_bgm_muted') === '1'; } catch (e) { return false; }
  }
  function setBgmMuted(v) {
    try { localStorage.setItem('silkroad_bgm_muted', v ? '1' : '0'); } catch (e) {}
  }

  // ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      // 波斯夜空深蓝背景 — Boot 阶段过渡
      this.cameras.main.setBackgroundColor('#1A2744');
      this.add.text(640, 360, '伊朗·阿巴斯港大巴扎\n加载中…', {
        fontSize: '26px', color: '#FFD98A', fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5);

      // BGM 初始化 (复用 #silk-road-bgm 元素)
      // 记住用户上次的静音选择, 但首次仍需一次 pointerdown 才能真正播放
      var bgm = document.getElementById('silk-road-bgm');
      var initBgm = function () {
        if (!bgm) return;
        var muted = getBgmMuted();
        bgm.muted = muted;
        if (!muted) {
          bgm.volume = 0.35;
          var p = bgm.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      };
      var unlock = function unlockBgm() {
        initBgm();
        document.removeEventListener('pointerdown', unlock);
      };
      document.addEventListener('pointerdown', unlock, { once: true });
      // 立即尝试一次 (若浏览器 autoplay 政策允许, 立即静音/播放)
      initBgm();
      window.addEventListener('beforeunload', function () {
        if (bgm) bgm.pause();
      });

      // 短暂延迟 → PlayScene
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

      // —— 盐漠灰棕背景 ——
      this.cameras.main.setBackgroundColor('#C8B89A');

      // —— 伊朗特色地形 ——
      this.drawIranTerrain();

      // —— 6 个真实地名 chip ——
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
        halo.fillCircle(0, 0, 50);
        var palm = self.add.text(0, 0, '💧', { fontSize: '48px' }).setOrigin(0.5);
        var label = self.add.text(0, 36, o.label, {
          fontSize: '11px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5);
        var oasis = self.add.container(o.x, o.y, [halo, palm, label]);
        oasis.oasisData = o;
        self.oasisSprites.push(oasis);
      });

      // —— 6 个波斯商贩 ——
      this.merchantSprites = [];
      this.merchantBubbles = {};
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
        var hit = self.add.zone(m.x, m.y + 10, 160, 160)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', function () { self.tryOpenMerchant(m.id); });
        hit.setDepth(21);
        sp.hitZone = hit;
        self.merchantSprites.push(sp);
      });

      // —— M4: 交易中心 (🏦) —— 起点附近, 货币兑换站
      var ex = L.exchange;
      var exHalo = this.add.graphics();
      exHalo.fillStyle(0xD4AF37, 0.35);  // 金色光晕
      exHalo.fillCircle(0, 0, 26);
      var exBg = this.add.graphics();
      exBg.fillStyle(0x4A2E1A, 0.85);
      exBg.fillRoundedRect(-22, -16, 44, 32, 6);
      exBg.lineStyle(2, 0xFFD98A, 0.7);
      exBg.strokeRoundedRect(-22, -16, 44, 32, 6);
      var exEmoji = this.add.text(0, 0, ex.emoji, { fontSize: '28px' }).setOrigin(0.5);
      var exLabel = this.add.text(0, 30, ex.label, {
        fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 3, wordWrap: false,
      }).setOrigin(0.5);
      exLabel.setFixedSize(110, 14);
      this.exchangeSprite = this.add.container(ex.x, ex.y + 10, [exHalo, exBg, exEmoji, exLabel]);
      this.exchangeSprite.exchangeData = ex;
      this.exchangeSprite.bobPhase = Math.random() * Math.PI * 2;
      this.exchangeSprite.setDepth(20);
      // 大点击区域 (跟商贩一致 160x160)
      var exHit = this.add.zone(ex.x, ex.y + 10, 160, 160)
        .setInteractive({ useHandCursor: true });
      exHit.on('pointerdown', function () { self.tryOpenExchange(); });
      exHit.setDepth(21);
      this.exchangeSprite.hitZone = exHit;
      this.exchangeBubble = null;

      // —— 出口 (巴扎尔甘 → 土耳其, 左上角) ——
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

      // —— 玩家：4 角色 graphics ——
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      if (!window.IRAN_AVATARS[avatarId]) avatarId = 'malay';
      this._avatar = avatarId;
      var elf = this._buildAvatarSprite(avatarId);
      var shadow = this.add.ellipse(0, 22, 22, 6, 0x000000, 0.18);
      // M3: 骆驼 emoji 加大到 44px + 玩家缩小骑在上面
      this.camelBackEmoji = this.add.text(0, 22, '🐪', { fontSize: '44px' }).setOrigin(0.5);
      this.camelBackEmoji.setVisible(false);
      // 玩家 (骑乘时缩小) — 容器里: shadow, camel, elf
      this.playerContainer = this.add.container(L.start.x, L.start.y, [shadow, this.camelBackEmoji, elf]);
      this.playerContainer.setDepth(30);
      this.playerSprite = { shadow: shadow, elf: elf, avatarId: avatarId };

      // —— 状态 (M4) ——
      this.player = { x: L.start.x, y: L.start.y, facing: 1, lastMoveAt: 0, walkPhase: 0 };
      // 水壶: 玩家拥有的水壶列表 [{capacity, water}], 初始空
      this.jugs = [];
      // 行李: 物品数组 [{id, qty}]
      this.luggage = this._loadLuggage();
      // M4: 货币余额 (伊朗里亚尔 ﷼)
      this.coins = 0;
      this.camelMode = false;
      this.currentMerchantId = null;
      this.exitActive = false;
      this.merchantShownId = null;
      this.state = 'PLAYING';
      this._exitTriggered = false;
      this._exitingIran = false;  // 防止重复触发离场动画
      this._lastEmptyWarnAt = 0;   // 上次"水壶空"警告时间戳

      // —— HUD（顶部条，5 项） ——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x2A1606, 0.92);

      // 1. 🫗 水壶可视化 (左) — 容器: 数量 + 每壶进度条
      this.jugHudContainer = this.add.container(80, 36);
      this.jugHudContainer.setDepth(100);

      // 2. 💰 余额 (中左) — 新增 M4
      this.coinText = this.add.text(310, 30, this._coinHudText(), {
        fontSize: '15px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 3. 🐪 骑乘切换 (中)
      this.camelBtn = this.add.text(520, 30, '🚶 步行', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        backgroundColor: '#1B5E8A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.camelBtn.setInteractive({ useHandCursor: true });
      this.camelBtn.on('pointerdown', function () { self.toggleCamelMode(); });
      this._updateCamelBtn();

      // 4. 🧳 行李箱 (中右)
      this.luggageBtn = this.add.text(770, 30, '🧳 行李箱 (' + this._luggageTotalCount() + ')', {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.luggageBtn.setInteractive({ useHandCursor: true });
      this.luggageBtn.on('pointerdown', function () { self.openLuggageModal(); });

      // 5. 🔊 BGM 按钮 (右)
      var bgmMuted = getBgmMuted();
      this.bgmBtn = this.add.text(1080, 30, bgmMuted ? '🔇' : '🔊', {
        fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 8, y: 2 },
      }).setOrigin(0.5);
      this.bgmBtn.setInteractive({ useHandCursor: true });
      this.bgmBtn.on('pointerdown', function () { self.toggleBgm(); });

      // 任务提示
      this.add.text(640, 80, '🎯 去交易中心换里亚尔 → 购买 2 个水壶 → 灌满水 → 巴扎尔甘过境', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5);

      // —— 虚拟方向键 ——
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

      // 持续 walk tick
      this.events.on('update', this._movementUpdate, this);

      // —— 键盘监听 ——
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

      // —— Modal 容器 (交易 modal / 行李箱 modal 共用) ——
      this.modalContainer = this.add.container(640, 360);
      this.modalContainer.setDepth(2000);
      this.modalContainer.setVisible(false);

      // —— 开局教程提示 (M4: 引导去交易中心) ——
      this.time.delayedCall(800, function () {
        self.showToast('💡 先去右边的交易中心 🏦 把行李换成里亚尔', 2800);
      });

      // —— DOM 辅助 ——
      this.bindFullscreenDom();
      this.bindOrientationLock();
    },

    // ==================== 伊朗地形 (保留 M2) ====================
    drawIranTerrain: function () {
      // 天空
      var sky = this.add.graphics();
      sky.fillGradientStyle(0x1A2744, 0x1A2744, 0x2A3A5E, 0x2A3A5E, 1);
      sky.fillRect(0, 0, L.CANVAS_W, 280);
      sky.setDepth(-10);

      // 星星
      var stars = this.add.graphics();
      stars.setDepth(-9);
      for (var i = 0; i < 60; i++) {
        var sx = Math.random() * L.CANVAS_W;
        var sy = Math.random() * 200;
        var sr = 0.5 + Math.random() * 1.5;
        stars.fillStyle(0xFFFFFF, 0.3 + Math.random() * 0.5);
        stars.fillCircle(sx, sy, sr);
      }

      // 远山
      var mtn = this.add.graphics();
      mtn.setDepth(-8);
      var farPeaks = [
        [0,260],[80,210],[160,230],[260,190],[360,215],[480,180],
        [580,205],[680,175],[790,200],[880,185],[980,210],[1080,195],
        [1180,220],[1280,240]
      ];
      mtn.fillStyle(0x4A3D5C, 0.7);
      mtn.beginPath();
      mtn.moveTo(farPeaks[0][0], farPeaks[0][1]);
      for (var i = 1; i < farPeaks.length; i++) mtn.lineTo(farPeaks[i][0], farPeaks[i][1]);
      mtn.lineTo(1280, 320);
      mtn.lineTo(0, 320);
      mtn.closePath();
      mtn.fillPath();

      var nearPeaks = [
        [0,290],[120,250],[220,270],[350,240],[480,265],[600,235],
        [720,260],[850,245],[960,270],[1080,250],[1200,275],[1280,290]
      ];
      mtn.fillStyle(0x6B5B7B, 0.8);
      mtn.beginPath();
      mtn.moveTo(nearPeaks[0][0], nearPeaks[0][1]);
      for (var i = 1; i < nearPeaks.length; i++) mtn.lineTo(nearPeaks[i][0], nearPeaks[i][1]);
      mtn.lineTo(1280, 350);
      mtn.lineTo(0, 350);
      mtn.closePath();
      mtn.fillPath();

      // 地面
      var ground = this.add.graphics();
      ground.setDepth(-7);
      ground.fillStyle(0xC8B89A, 1);
      ground.fillRect(0, 300, L.CANVAS_W, L.CANVAS_H - 300);

      ground.lineStyle(1, 0xE0D4BC, 0.25);
      var saltCracks = [
        [100,380,130,395],[200,420,185,440],[350,500,370,520],
        [500,350,520,365],[650,450,635,470],[800,380,815,395],
        [950,520,970,535],[1100,400,1085,418],[1200,480,1215,495],
        [50,550,70,565],[300,600,315,615],[700,580,720,595],
        [1000,620,1020,635],[450,650,465,660],
      ];
      for (var i = 0; i < saltCracks.length; i++) {
        var c = saltCracks[i];
        ground.beginPath();
        ground.moveTo(c[0], c[1]);
        ground.lineTo(c[2], c[3]);
        ground.strokePath();
      }

      // 雅丹
      var yardang = this.add.graphics();
      yardang.setDepth(-6);
      var yardangs = [
        {x:180, y:330, w:70, h:35},
        {x:500, y:320, w:90, h:40},
        {x:850, y:335, w:60, h:30},
        {x:1150, y:325, w:75, h:32},
      ];
      for (var i = 0; i < yardangs.length; i++) {
        var yd = yardangs[i];
        yardang.fillStyle(0x7B6B4A, 0.4);
        yardang.fillEllipse(yd.x + 5, yd.y + 3, yd.w, yd.h);
        yardang.fillStyle(0x8B7B5A, 0.6);
        yardang.fillEllipse(yd.x, yd.y, yd.w, yd.h);
        yardang.fillStyle(0xA89878, 0.3);
        yardang.fillEllipse(yd.x - 5, yd.y - 5, yd.w * 0.6, yd.h * 0.5);
      }

      // 建筑
      var bldg = this.add.graphics();
      bldg.setDepth(-5);
      bldg.fillStyle(0x1B5E8A, 0.6);
      bldg.fillEllipse(1050, 305, 55, 42);
      bldg.fillStyle(0x8B7B6A, 0.6);
      bldg.fillRect(1023, 305, 54, 35);
      bldg.fillRect(1012, 280, 7, 60);
      bldg.fillEllipse(1015.5, 278, 11, 9);
      bldg.fillRect(1081, 282, 7, 58);
      bldg.fillEllipse(1084.5, 280, 11, 9);
      bldg.fillStyle(0x9B9080, 0.5);
      for (var i = 0; i < 4; i++) {
        var px = 100 + i * 22;
        bldg.fillRect(px, 305, 9, 45);
        bldg.fillRect(px - 5, 303, 19, 5);
      }
      bldg.fillRect(95, 300, 88, 5);
      bldg.fillStyle(0x6B5B4A, 0.35);
      bldg.fillRect(700, 310, 25, 20);
      bldg.fillTriangle(700, 310, 712.5, 298, 725, 310);
      bldg.fillRect(740, 312, 18, 18);
      bldg.fillTriangle(740, 312, 749, 302, 758, 312);

      // 藏红花田
      var flowers = this.add.graphics();
      flowers.setDepth(-4);
      var flowerSpots = [
        [380,440],[410,455],[395,470],[365,460],
        [820,430],[845,445],[830,460],[810,450],
        [580,510],[600,525],[620,515],[590,535],
      ];
      for (var i = 0; i < flowerSpots.length; i++) {
        var fx = flowerSpots[i][0];
        var fy = flowerSpots[i][1];
        flowers.fillStyle(0x9B3D8A, 0.5);
        flowers.fillCircle(fx, fy, 3);
        flowers.fillCircle(fx - 2, fy - 2, 2);
        flowers.fillCircle(fx + 2, fy - 2, 2);
        flowers.fillStyle(0xFFD98A, 0.6);
        flowers.fillCircle(fx, fy - 1, 1);
      }

      // 坎儿井
      var qanat = this.add.graphics();
      qanat.setDepth(-4);
      qanat.lineStyle(2, 0x6EC1E4, 0.2);
      qanat.beginPath();
      qanat.moveTo(200, 420);
      qanat.lineTo(350, 400);
      qanat.lineTo(500, 410);
      qanat.lineTo(600, 250);
      qanat.strokePath();
      qanat.beginPath();
      qanat.moveTo(100, 500);
      qanat.lineTo(200, 480);
      qanat.lineTo(200, 420);
      qanat.strokePath();
    },

    // ==================== 行李加载 (localStorage, 向后兼容) ====================
    // 旧格式: [0, 1, 3, 5] → 新格式: [{id:0, qty:1}, {id:1, qty:1}, ...]
    // 缺数据兜底: 全部 8 件 (qty=1)
    // 写入时存新格式; 一旦发现新格式就立刻用, 不再回退
    _loadLuggage: function () {
      var arr = [];
      try {
        var raw = localStorage.getItem('silkroad_luggage');
        if (raw) {
          var parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // 新格式: [{id, qty}]
            if (parsed.length && typeof parsed[0] === 'object' && parsed[0] !== null) {
              for (var i = 0; i < parsed.length; i++) {
                var e = parsed[i];
                if (e && typeof e.id === 'number' && typeof e.qty === 'number'
                    && ALL_ITEM_IDS.indexOf(e.id) !== -1 && e.qty > 0) {
                  arr.push({ id: e.id, qty: Math.floor(e.qty) });
                }
              }
            } else {
              // 旧格式: [0, 1, 3, ...] → 升级
              for (var j = 0; j < parsed.length; j++) {
                var n = parsed[j];
                if (typeof n === 'number' && ALL_ITEM_IDS.indexOf(n) !== -1) {
                  arr.push({ id: n, qty: 1 });
                }
              }
            }
          }
        }
      } catch (e) {}
      // 兜底: 没数据时给全部 8 件 qty=1
      if (arr.length === 0) {
        for (var k = 0; k < ALL_ITEM_IDS.length; k++) {
          arr.push({ id: ALL_ITEM_IDS[k], qty: 1 });
        }
      }
      // 合并重复 id
      return this._mergeLuggageItems(arr);
    },

    _saveLuggage: function () {
      try {
        localStorage.setItem('silkroad_luggage', JSON.stringify(this.luggage));
      } catch (e) {}
    },

    _mergeLuggageItems: function (arr) {
      var map = {};
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        var e = arr[i];
        if (!e || typeof e.id !== 'number' || typeof e.qty !== 'number' || e.qty <= 0) continue;
        if (ALL_ITEM_IDS.indexOf(e.id) === -1) continue;
        if (map[e.id]) {
          map[e.id].qty += e.qty;
        } else {
          map[e.id] = { id: e.id, qty: e.qty };
          out.push(map[e.id]);
        }
      }
      return out;
    },

    _luggageCount: function (id) {
      for (var i = 0; i < this.luggage.length; i++) {
        if (this.luggage[i].id === id) return this.luggage[i].qty;
      }
      return 0;
    },
    _luggageTotalCount: function () {
      var n = 0;
      for (var i = 0; i < this.luggage.length; i++) n += this.luggage[i].qty;
      return n;
    },
    _addToLuggage: function (id, qty) {
      qty = qty || 1;
      var found = false;
      for (var i = 0; i < this.luggage.length; i++) {
        if (this.luggage[i].id === id) {
          this.luggage[i].qty += qty;
          found = true;
          break;
        }
      }
      if (!found) this.luggage.push({ id: id, qty: qty });
      this.luggage = this._mergeLuggageItems(this.luggage);
      this._saveLuggage();
      this._refreshHudCounts();
    },
    _removeFromLuggage: function (id, qty) {
      qty = qty || 1;
      for (var i = 0; i < this.luggage.length; i++) {
        if (this.luggage[i].id === id) {
          this.luggage[i].qty -= qty;
          if (this.luggage[i].qty <= 0) this.luggage.splice(i, 1);
          break;
        }
      }
      this._saveLuggage();
      this._refreshHudCounts();
    },

    // ==================== 水壶 (M3 + M4 可视化) ====================
    // M4: 用 container 重绘 — 每个水壶一条进度条 + 数字, 整体视觉清晰
    _currentJugIndex: function () {
      // 找到第一个水 > 0 的水壶
      for (var i = 0; i < this.jugs.length; i++) {
        if (this.jugs[i].water > 0) return i;
      }
      return this.jugs.length > 0 ? 0 : -1;
    },
    _addJug: function (initialWater) {
      var w = (initialWater === undefined || initialWater === null) ? 0 : initialWater;
      this.jugs.push({ capacity: L.JUG_CAPACITY, water: w });
      this._refreshHudCounts();
    },
    _allJugsFull: function () {
      if (this.jugs.length < L.TARGET_JUGS) return false;
      for (var i = 0; i < this.jugs.length; i++) {
        if (this.jugs[i].water < L.JUG_CAPACITY) return false;
      }
      return true;
    },
    _driestJugIndex: function () {
      // 找水量最低且未满的水壶
      var idx = -1, min = Infinity;
      for (var i = 0; i < this.jugs.length; i++) {
        if (this.jugs[i].water < L.JUG_CAPACITY && this.jugs[i].water < min) {
          min = this.jugs[i].water;
          idx = i;
        }
      }
      return idx;
    },
    _fillDriestJug: function () {
      var idx = this._driestJugIndex();
      if (idx < 0) return null;  // 都满了
      this.jugs[idx].water = L.JUG_CAPACITY;
      return idx;
    },
    _drinkFromCurrentJug: function (delta) {
      if (this.jugs.length === 0) return -1;
      var idx = this._currentJugIndex();
      if (idx < 0) {
        // 所有水壶都没水, 但从第一个开始扣 (会变负数表示真正没水)
        idx = 0;
      }
      this.jugs[idx].water = Math.max(0, +(this.jugs[idx].water - delta).toFixed(2));
      return idx;
    },
    _totalWater: function () {
      var n = 0;
      for (var i = 0; i < this.jugs.length; i++) n += this.jugs[i].water;
      return n;
    },
    _allJugsEmpty: function () {
      if (this.jugs.length === 0) return false;
      return this._totalWater() <= 0;
    },

    // M4: 货币 HUD 文本
    _coinHudText: function () {
      return '💰 ' + this.coins + ' ﷼';
    },

    // M4: 重绘水壶 HUD — 容器内含 "🫗 N/2" + 每壶进度条 + 数字
    _renderJugHud: function () {
      if (!this.jugHudContainer) return;
      this.jugHudContainer.removeAll(true);

      // 标题: 数量徽章
      var title = this.add.text(0, -16, '🫗 ' + this.jugs.length + '/' + L.TARGET_JUGS, {
        fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0, 0.5);
      this.jugHudContainer.add(title);

      if (this.jugs.length === 0) {
        var hint = this.add.text(0, 6, '（去水壶商买 🫗）', {
          fontSize: '10px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0, 0.5);
        this.jugHudContainer.add(hint);
        return;
      }

      // 每个水壶一行: 进度条 + 数字
      var maxVisible = Math.min(this.jugs.length, L.TARGET_JUGS);
      var barW = 130;
      var barH = 11;
      var rowGap = 16;
      var startY = -2;
      for (var i = 0; i < maxVisible; i++) {
        var j = this.jugs[i];
        var pct = Math.max(0, Math.min(1, j.water / L.JUG_CAPACITY));
        var isEmpty = j.water <= 0;
        var isFull = j.water >= L.JUG_CAPACITY;
        var rowY = startY + i * rowGap;

        // 背景条 (深色)
        var bg = this.add.rectangle(0, rowY, barW, barH, 0x1A1208, 0.95)
          .setStrokeStyle(1, isEmpty ? 0xC04848 : 0x6B4423, isEmpty ? 0.9 : 0.5)
          .setOrigin(0, 0.5);
        this.jugHudContainer.add(bg);
        // 水量条 (绿色 / 满时金色)
        if (pct > 0) {
          var fillColor = isFull ? 0xD4AF37 : 0x6EC1E4;  // 满 = 金, 半/低 = 蓝
          var fill = this.add.rectangle(0, rowY, barW * pct, barH, fillColor, 0.95)
            .setOrigin(0, 0.5);
          this.jugHudContainer.add(fill);
        }
        // 数字标签
        var numColor = isEmpty ? '#FF8A8A' : (isFull ? '#D4AF37' : '#F4ECD8');
        var numTxt = this.add.text(barW + 6, rowY, j.water.toFixed(1) + 'L', {
          fontSize: '10px', color: numColor, fontStyle: 'bold',
        }).setOrigin(0, 0.5);
        this.jugHudContainer.add(numTxt);
      }
    },

    _refreshHudCounts: function () {
      this._renderJugHud();
      if (this.coinText) this.coinText.setText(this._coinHudText());
      if (this.luggageBtn) this.luggageBtn.setText('🧳 行李箱 (' + this._luggageTotalCount() + ')');
      this._updateCamelBtn();
    },

    // ==================== 主循环 ====================
    update: function (time, delta) {
      if (this.state === 'DEAD') return;

      // 商贩 bob (M3: 没有 merchantDone, 全部持续可交互)
      for (var i = 0; i < this.merchantSprites.length; i++) {
        var sp = this.merchantSprites[i];
        sp.bobPhase += 0.04;
        sp.list[1].y = Math.sin(sp.bobPhase) * 2;
      }

      // 交易中心 bob (M4)
      if (this.exchangeSprite) {
        this.exchangeSprite.bobPhase += 0.04;
        this.exchangeSprite.list[2].y = Math.sin(this.exchangeSprite.bobPhase) * 2;
      }

      // 出口 bob + 激活脉冲
      if (this.exitSprite) {
        this.exitSprite.bobPhase += 0.05;
        this.exitSprite.list[1].y = Math.sin(this.exitSprite.bobPhase) * 2;
        var canDepart = this._allJugsFull();
        if (canDepart !== this.exitActive) {
          this.exitActive = canDepart;
          if (canDepart) this.startExitPulse();
          else this.stopExitPulse();
        }
      }

      // 走路 bob — 基于骑乘基准 y 叠加, 不覆盖
      var rideBaseY = (this.camelMode && this._luggageCount(-1004) > 0) ? -16 : 0;
      if (Date.now() - this.player.lastMoveAt < 200) {
        this.player.walkPhase += 0.2;
        if (this.playerSprite) {
          this.playerSprite.elf.y = rideBaseY + Math.sin(this.player.walkPhase) * 1.5;
        }
      } else if (this.playerSprite) {
        this.playerSprite.elf.y = rideBaseY;
      }

      // 距离检测
      if (this.state === 'PLAYING') {
        this._checkMerchantProximity();
        this._checkExchangeProximity();
        this._checkExitProximity();
      }
    },

    // ==================== 移动 (M3: 水从水壶扣) ====================
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

      var step, waterDelta;
      if (this.camelMode) {
        step = L.STEP_PX_CAMEL;
        waterDelta = L.WATER_PER_STEP;  // 同样耗水 (M3 统一)
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
      if (this.playerContainer) {
        this.playerContainer.scaleX = this.player.facing;
      }

      // 扣水 (从当前水壶)
      var drank = this._drinkFromCurrentJug(waterDelta);
      this._refreshHudCounts();
      // M4: 缺水警告 — 不再直接死亡, 显示红色 toast (节流每 1.5s 一次)
      if (this._allJugsEmpty()) {
        var now = Date.now();
        if (now - this._lastEmptyWarnAt > 1500 && this.state === 'PLAYING') {
          this._lastEmptyWarnAt = now;
          this.showWarningToast('⚠️ 水壶空了！找绿洲 💧 灌水');
        }
      }

      // 绿洲碰撞
      this.checkOasisCollision();
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

    // ==================== 绿洲碰撞 (M3: 自动灌满最空水壶) ====================
    checkOasisCollision: function () {
      for (var i = 0; i < L.oases.length; i++) {
        var o = L.oases[i];
        var dx = this.player.x - o.x;
        var dy = this.player.y - o.y;
        if (Math.sqrt(dx * dx + dy * dy) < 80) {
          if (!o._lastTouch || Date.now() - o._lastTouch > 2000) {
            o._lastTouch = Date.now();
            // 先算"加了多少水", 再填充
            var dryIdx = this._driestJugIndex();
            var added = 0;
            if (dryIdx >= 0) {
              added = +(L.JUG_CAPACITY - this.jugs[dryIdx].water).toFixed(1);
            }
            var filled = this._fillDriestJug();
            if (filled !== null) {
              this._refreshHudCounts();
              // M4: 灌满反馈 — 浮动文本 + HUD 弹跳
              this.showFloatingText(o.x, o.y - 30, '💧 灌满！+' + added.toFixed(0) + 'L');
              if (this.jugHudContainer) {
                this.tweens.add({
                  targets: this.jugHudContainer,
                  scaleX: 1.18, scaleY: 1.18,
                  duration: 120, yoyo: true, repeat: 1,
                });
              }
              window.playIranSfx('pickup', 0.4);
            } else {
              this.showFloatingText(o.x, o.y - 30, '💧 水壶已满');
              window.playIranSfx('click', 0.3);
            }
          }
        }
      }
    },

    // ==================== M3: 商贩距离检测 (无 merchantDone) ====================
    _checkMerchantProximity: function () {
      var nearest = null;
      var nearestDist = Infinity;
      for (var i = 0; i < L.merchants.length; i++) {
        var m = L.merchants[i];
        var dx = this.player.x - m.x;
        var dy = this.player.y - m.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = m; }
      }
      if (nearest && nearestDist < 50) {
        if (this.merchantShownId !== nearest.id) {
          this.hideMerchantBubble();
          this.merchantShownId = nearest.id;
          this.showMerchantBubble(nearest);
        }
      } else {
        if (this.merchantShownId !== null && nearestDist > 60) {
          this.hideMerchantBubble();
        }
      }
    },

    // M4: 交易中心距离检测
    _checkExchangeProximity: function () {
      var ex = L.exchange;
      var dx = this.player.x - ex.x;
      var dy = this.player.y - ex.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      // 距离 < 60 视为"走近"
      if (d < 60) {
        if (!this.exchangeBubble) this.showExchangeBubble();
      } else {
        if (this.exchangeBubble) this.hideExchangeBubble();
      }
    },
    showMerchantBubble: function (m) {
      var self = this;
      var bg = this.add.graphics();
      bg.fillStyle(0x2A1606, 0.92);
      bg.fillRoundedRect(-55, -16, 110, 32, 8);
      bg.lineStyle(2, 0xFFD98A, 0.8);
      bg.strokeRoundedRect(-55, -16, 110, 32, 8);
      bg.fillTriangle(-5, 16, 5, 16, 0, 22);
      var txt = this.add.text(0, 0, '点击交易 💬', {
        fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var bubble = this.add.container(m.x, m.y - 38, [bg, txt]);
      bubble.setDepth(50);
      var bubbleZone = this.add.zone(m.x, m.y - 38, 130, 50)
        .setInteractive({ useHandCursor: true });
      bubbleZone.setDepth(51);
      bubbleZone.on('pointerdown', function () { self.tryOpenMerchant(m.id); });
      bubble.bubbleZone = bubbleZone;
      this.merchantBubbles[m.id] = bubble;
    },
    hideMerchantBubble: function () {
      for (var k in this.merchantBubbles) {
        if (this.merchantBubbles[k]) {
          if (this.merchantBubbles[k].bubbleZone) {
            this.merchantBubbles[k].bubbleZone.destroy();
          }
          this.merchantBubbles[k].destroy();
          this.merchantBubbles[k] = null;
        }
      }
      this.merchantShownId = null;
    },

    // ==================== M3: 打开商贩 modal ====================
    tryOpenMerchant: function (id) {
      if (this.state !== 'PLAYING') return;
      var m = this._findMerchant(id);
      if (!m) return;
      var dx = this.player.x - m.x;
      var dy = this.player.y - m.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 60) return;
      this.openTradeModal(m);
    },
    tryOpenNearestMerchant: function () {
      if (this.state !== 'PLAYING') return;
      if (this.merchantShownId !== null) {
        this.tryOpenMerchant(this.merchantShownId);
      }
    },
    // M4: 交易中心气泡
    showExchangeBubble: function () {
      if (this.exchangeBubble) return;
      var self = this;
      var ex = L.exchange;
      var bg = this.add.graphics();
      bg.fillStyle(0x2A1606, 0.92);
      bg.fillRoundedRect(-60, -16, 120, 32, 8);
      bg.lineStyle(2, 0xD4AF37, 0.85);
      bg.strokeRoundedRect(-60, -16, 120, 32, 8);
      bg.fillTriangle(-5, 16, 5, 16, 0, 22);
      var txt = this.add.text(0, 0, '💱 兑换', {
        fontSize: '13px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5);
      var bubble = this.add.container(ex.x, ex.y - 38, [bg, txt]);
      bubble.setDepth(50);
      var bubbleZone = this.add.zone(ex.x, ex.y - 38, 140, 50)
        .setInteractive({ useHandCursor: true });
      bubbleZone.setDepth(51);
      bubbleZone.on('pointerdown', function () { self.tryOpenExchange(); });
      bubble.bubbleZone = bubbleZone;
      this.exchangeBubble = bubble;
    },
    hideExchangeBubble: function () {
      if (this.exchangeBubble) {
        if (this.exchangeBubble.bubbleZone) this.exchangeBubble.bubbleZone.destroy();
        this.exchangeBubble.destroy();
        this.exchangeBubble = null;
      }
    },
    // M4: 尝试打开交易中心 modal
    tryOpenExchange: function () {
      if (this.state !== 'PLAYING') return;
      var ex = L.exchange;
      var dx = this.player.x - ex.x;
      var dy = this.player.y - ex.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 60) return;
      this.openExchangeModal();
    },
    _findMerchant: function (id) {
      for (var i = 0; i < L.merchants.length; i++) {
        if (L.merchants[i].id === id) return L.merchants[i];
      }
      return null;
    },
    _findItem: function (id) {
      for (var i = 0; i < ITEMS.length; i++) {
        if (ITEMS[i].id === id) return ITEMS[i];
      }
      return null;
    },

    // ==================== M4: 交易 modal — 用里亚尔购买 ====================
    // 玩家付 price 里亚尔, 获得 1 份商贩卖品; 反复可交易
    openTradeModal: function (m) {
      this.state = 'TRADING';
      this.currentMerchantId = m.id;
      this.hideMerchantBubble();
      this.modalContainer.removeAll(true);
      window.playIranSfx('button', 0.4);
      this._renderTradeModal(m);
    },

    _renderTradeModal: function (m) {
      var self = this;
      this.modalContainer.removeAll(true);

      // 背景遮罩
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      // card
      var card = this.add.rectangle(0, 0, 640, 540, 0x2A1606, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.modalContainer.add(card);

      // 标题
      this.modalContainer.add(this.add.text(0, -230, m.emoji + '  ' + m.name, {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -200, m.tip, {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
        wordWrap: { width: 580 },
      }).setOrigin(0.5));

      // 大商品展示 + 价格 + 余额
      this.modalContainer.add(this.add.text(0, -140, m.sells.emoji + '  ' + m.sells.name, {
        fontSize: '32px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -90, '💰 价格：' + m.price + ' ﷼', {
        fontSize: '20px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -60, '你的余额：' + this.coins + ' ﷼', {
        fontSize: '14px', color: '#A8D8C0',
      }).setOrigin(0.5));

      // 购买按钮 (够钱金色, 不够灰色)
      var canBuy = this.coins >= m.price;
      var buyBtnColor = canBuy ? 0xD4AF37 : 0x4A4A4A;
      var buyBtnTextColor = canBuy ? '#2A190E' : '#888888';
      var buyBg = this.add.rectangle(-90, 30, 200, 60, buyBtnColor, canBuy ? 1 : 0.6)
        .setStrokeStyle(2, canBuy ? 0xFFE9B0 : 0x888888, canBuy ? 0.8 : 0.3);
      this.modalContainer.add(buyBg);
      this.modalContainer.add(this.add.text(-90, 30, '购  买', {
        fontSize: '19px', color: buyBtnTextColor, fontStyle: 'bold',
      }).setOrigin(0.5));
      if (canBuy) {
        var buyZone = this.add.zone(-90, 30, 200, 60).setInteractive({ useHandCursor: true });
        buyZone.on('pointerdown', function () { self.doBuy(m); });
        this.modalContainer.add(buyZone);
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(90, 30, 160, 60, 0x4A2E1A, 1)
        .setStrokeStyle(1, 0xFFD98A, 0.5);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(90, 30, '关闭', {
        fontSize: '16px', color: '#F4ECD8', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(90, 30, 160, 60).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeTradeModal(); });
      this.modalContainer.add(closeZone);

      // 提示
      var tipMsg;
      if (canBuy) {
        tipMsg = '✓ 购买后获得 1 份 ' + m.sells.emoji + ' ' + m.sells.name
          + (m.id === 5 ? ' (空水壶, 需去绿洲灌水)' : '');
      } else {
        var lack = m.price - this.coins;
        tipMsg = '⚠️ 里亚尔不够！还差 ' + lack + ' ﷼ → 去交易中心 🏦';
      }
      this.modalContainer.add(this.add.text(0, 110, tipMsg, {
        fontSize: '13px', color: canBuy ? '#A8D8C0' : '#FFB0B0', fontStyle: 'italic',
        wordWrap: { width: 580 },
      }).setOrigin(0.5));

      // 已经拥有的同类商品
      var customId = -1000 - m.id;
      var have = this._luggageCount(customId);
      if (have > 0) {
        this.modalContainer.add(this.add.text(0, 150, '已拥有：' + m.sells.emoji + ' × ' + have, {
          fontSize: '12px', color: '#FFD98A', fontStyle: 'bold',
        }).setOrigin(0.5));
      }

      // 隐藏 dpad
      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },

    closeTradeModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this.currentMerchantId = null;
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
    },

    // ==================== M4: 交易中心 modal ====================
    openExchangeModal: function () {
      this.state = 'EXCHANGE';
      this.hideExchangeBubble();
      this.modalContainer.removeAll(true);
      window.playIranSfx('button', 0.4);
      this._renderExchangeModal();
    },
    _renderExchangeModal: function () {
      var self = this;
      this.modalContainer.removeAll(true);

      // 背景遮罩
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      // card
      var card = this.add.rectangle(0, 0, 640, 540, 0x2A1606, 1)
        .setStrokeStyle(2, 0xD4AF37, 0.7);
      this.modalContainer.add(card);

      // 标题
      this.modalContainer.add(this.add.text(0, -230, '🏦 阿巴斯港交易中心', {
        fontSize: '24px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -200, '把行李物品换成伊朗里亚尔 ﷼', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 余额显示
      this.modalContainer.add(this.add.text(0, -170, '💰 当前余额：' + this.coins + ' ﷼', {
        fontSize: '16px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5));

      // 行李 grid: 可兑换 (有 EXCHANGE_RATES 且 qty>0) + 归家之心 (不可兑换)
      var gridY = -90;
      var cellW = 130, cellH = 100;
      var cols = 4;
      var startX = -cellW * 2 + 20;

      // 合并可兑换 + 归家之心, 优先可兑换
      var tradeable = [];
      var heartEntry = null;
      for (var i = 0; i < this.luggage.length; i++) {
        var e = this.luggage[i];
        if (e.id === HEART_ID) { heartEntry = e; continue; }
        if (e.qty > 0 && L.EXCHANGE_RATES[e.id] !== undefined) {
          tradeable.push(e);
        }
      }
      var cells = tradeable.slice();
      if (heartEntry) cells.push(heartEntry);

      if (cells.length === 0) {
        this.modalContainer.add(this.add.text(0, -10, '（行李箱里没有可兑换的物品）', {
          fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0.5));
      } else {
        for (var i = 0; i < cells.length; i++) {
          var e = cells[i];
          var info = this._getLuggageItemInfo(e.id);
          var rate = L.EXCHANGE_RATES[e.id];
          var isHeart = e.id === HEART_ID;
          var col = i % cols, row = Math.floor(i / cols);
          var cx = startX + col * cellW;
          var cy = gridY + row * cellH;

          var cellBg = this.add.rectangle(cx, cy, cellW - 16, cellH - 16, 0x4A2E1A, isHeart ? 0.45 : 0.85)
            .setStrokeStyle(2, isHeart ? 0xF6B5C8 : 0x6B4423, isHeart ? 0.7 : 0.4);
          this.modalContainer.add(cellBg);

          // emoji
          this.modalContainer.add(this.add.text(cx, cy - 26, info.emoji, { fontSize: '32px' }).setOrigin(0.5));
          // 名字
          var nm = this.add.text(cx, cy - 4, info.name, {
            fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
            wordWrap: false,
          }).setOrigin(0.5);
          nm.setFixedSize(cellW - 28, 14);
          this.modalContainer.add(nm);
          // 兑换价 / 不可兑换标签
          if (isHeart) {
            this.modalContainer.add(this.add.text(cx, cy + 18, '不可兑换', {
              fontSize: '11px', color: '#F6B5C8', fontStyle: 'bold',
            }).setOrigin(0.5));
          } else {
            this.modalContainer.add(this.add.text(cx, cy + 16, '→ ' + rate + ' ﷼', {
              fontSize: '12px', color: '#D4AF37', fontStyle: 'bold',
            }).setOrigin(0.5));
            this.modalContainer.add(this.add.text(cx, cy + 32, '×' + e.qty, {
              fontSize: '11px', color: '#FFD98A',
            }).setOrigin(0.5));
          }

          // 点击 = 卖出一件 (归家之心不可点)
          if (!isHeart) {
            var zone = this.add.zone(cx, cy, cellW - 16, cellH - 16)
              .setInteractive({ useHandCursor: true });
            var itemId = e.id;
            zone.on('pointerdown', (function (iid) {
              return function () {
                window.playIranSfx('click', 0.4);
                self.doExchange(iid);
              };
            })(itemId));
            this.modalContainer.add(zone);
          }
        }
      }

      // 提示行
      this.modalContainer.add(this.add.text(0, 170, '👆 点击物品 → 卖出一件 → 获得里亚尔', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 230, 200, 50, 0xD4AF37, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 230, '关闭', {
        fontSize: '16px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 230, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeExchangeModal(); });
      this.modalContainer.add(closeZone);

      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },
    doExchange: function (itemId) {
      var rate = L.EXCHANGE_RATES[itemId];
      if (rate === undefined) return;  // 不可兑换
      if (this._luggageCount(itemId) <= 0) {
        this.showToast('这件物品已卖完', 1200);
        return;
      }
      this._removeFromLuggage(itemId, 1);
      this.coins += rate;
      this._refreshHudCounts();
      window.playIranSfx('exchange', 0.55);
      window.playIranSfx('pickup', 0.3);
      this.showToast('💰 获得 ' + rate + ' ﷼', 900);
      // 重新渲染 modal 刷新余额
      this._renderExchangeModal();
    },
    closeExchangeModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
    },

    // M4: 商店买入 — 玩家付 price 里亚尔, 获得 1 份商贩卖品
    //   - 卖品用 -1000 - m.id 作为内部 id 进 luggage (跟 M3 兼容)
    //   - 水壶商 (id=5) 额外给一个空水壶
    doBuy: function (m) {
      if (this.coins < m.price) {
        this.showToast('里亚尔不够！去交易中心 🏦', 1500);
        window.playIranSfx('click', 0.3);
        return;
      }
      // 1) 扣钱
      this.coins -= m.price;
      // 2) 给 1 份商贩卖品 (行李)
      var customId = -1000 - m.id;
      this._addToLuggage(customId, 1);
      // 2b) 水壶商 (id=5) — 同步加一个空水壶到水系统
      if (m.id === 5) {
        this._addJug(0);  // 空水壶, 需要去绿洲灌水
      }
      // 3) HUD 刷新
      this._refreshHudCounts();
      // 4) 提示
      var suffix = m.id === 5 ? ' (空水壶, 去绿洲灌水)' : '';
      this.showToast('💰 -' + m.price + ' ﷼  获得 ' + m.sells.emoji + ' ' + m.sells.name + ' ×1' + suffix, 1400);
      // 5) 音
      window.playIranSfx('exchange', 0.55);
      window.playIranSfx('pickup', 0.4);
      // 6) 关闭 modal
      this.closeTradeModal();
    },

    // ==================== M3: 行李箱 modal (quantity-based) ====================
    openLuggageModal: function () {
      var self = this;
      this.state = 'LUGGAGE';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 720, 540, 0x2A1606, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.6);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -230, '🧳 我的行李箱', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      // 摘要
      var total = this._luggageTotalCount();
      this.modalContainer.add(this.add.text(0, -200, '共 ' + total + ' 件商品 (' + this.luggage.length + ' 种)', {
        fontSize: '12px', color: '#A8D8C0', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 物品 grid — 按 行李顺序 (id 升序 + 自定义 id 在后)
      // 自定义物品 (负 id) 也展示
      var allItems = this._buildLuggageDisplayList();
      var cellW = 130, cellH = 100;
      var cols = 5;
      var startX = -cellW * 2.5 + 20;
      var gridY = -150;
      for (var i = 0; i < allItems.length; i++) {
        var e = allItems[i];
        var info = this._getLuggageItemInfo(e.id);
        var col = i % cols, row = Math.floor(i / cols);
        var cx = startX + col * cellW;
        var cy = gridY + row * cellH;

        var isHeart = e.id === HEART_ID;
        var cellBg = this.add.rectangle(cx, cy, cellW - 16, cellH - 16, 0x4A2E1A, 1)
          .setStrokeStyle(2, isHeart ? 0xF6B5C8 : 0x6B4423, isHeart ? 0.7 : 0.4);
        this.modalContainer.add(cellBg);
        this.modalContainer.add(this.add.text(cx, cy - 22, info.emoji, { fontSize: '32px' }).setOrigin(0.5));
        var nm = this.add.text(cx, cy + 4, info.name, {
          fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
          wordWrap: false,
        }).setOrigin(0.5);
        nm.setFixedSize(cellW - 28, 14);
        this.modalContainer.add(nm);
        // 数量
        var qtyColor = isHeart ? '#F6B5C8' : '#FFD98A';
        this.modalContainer.add(this.add.text(cx, cy + 24, '×' + e.qty, {
          fontSize: '14px', color: qtyColor, fontStyle: 'bold',
        }).setOrigin(0.5));
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 220, 200, 50, 0xFFD98A, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 220, '关闭', {
        fontSize: '16px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 220, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeLuggageModal(); });
      this.modalContainer.add(closeZone);

      this.joystickContainer.setVisible(false);
      this.modalContainer.setVisible(true);
    },
    closeLuggageModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
    },

    // 合并 QATAR_LEVEL.gifts + IRAN 自定义商品 (地毯/藏红花/...) 用于显示
    _buildLuggageDisplayList: function () {
      return this.luggage.slice().sort(function (a, b) { return a.id - b.id; });
    },
    _getLuggageItemInfo: function (id) {
      if (id >= 0) {
        var it = this._findItem(id);
        if (it) return { name: it.name, emoji: it.emoji };
        return { name: '?', emoji: '❓' };
      }
      // 自定义 id: -1000 - merchantId → 商贩卖品
      var mId = -1000 - id;
      var m = this._findMerchant(mId);
      if (m) return { name: m.sells.name, emoji: m.sells.emoji };
      return { name: '特产', emoji: '🎁' };
    },

    tryCloseTopModal: function () {
      if (this.state === 'TRADING') this.closeTradeModal();
      else if (this.state === 'EXCHANGE') this.closeExchangeModal();
      else if (this.state === 'LUGGAGE') this.closeLuggageModal();
    },

    // ==================== M3: 骆驼骑乘 toggle ====================
    toggleCamelMode: function () {
      // M3: 骆驼从商贩 (id=4) 那里买来, 加到 luggage; toggle 不需 camels 计数
      // 简化: 任意时候都可切 (玩家自己决定要不要骑), 没骆驼时骑行看起来没骆驼
      // 保留原版: 有骆驼时才有效果
      if (this._luggageCount(-1004) <= 0) {
        this.showToast('先去骆驼商人那儿买骆驼 🐫', 1400);
        return;
      }
      this.camelMode = !this.camelMode;
      this._updateCamelBtn();
      window.playIranSfx('click', 0.4);
      window.playIranSfx('pickup', 0.3);
    },
    _updateCamelBtn: function () {
      var hasCamel = this._luggageCount(-1004) > 0;
      if (hasCamel) {
        this.camelBtn.setVisible(true);
        this.camelBtn.setText(this.camelMode ? '🐪 骑乘中' : '🚶 步行');
        this.camelBtn.setStyle({
          backgroundColor: this.camelMode ? '#5B8C3A' : '#1B5E8A',
          padding: { x: 10, y: 3 },
        });
      } else {
        this.camelBtn.setVisible(false);
        this.camelMode = false;
      }
      if (this.camelBackEmoji) {
        this.camelBackEmoji.setVisible(this.camelMode && hasCamel);
      }
      if (this.playerSprite && this.playerSprite.elf) {
        // 骑乘时人物略缩小
        var s = (this.camelMode && hasCamel) ? 0.7 : 1.0;
        this.playerSprite.elf.setScale(s);
        // 骑乘时 elf 上移 (骑在骆驼上)
        this.playerSprite.elf.y = (this.camelMode && hasCamel) ? -16 : 0;
      }
    },

    // ==================== M3: 出口距离 + 启程 + 过渡动画 ====================
    _checkExitProximity: function () {
      var dx = this.player.x - L.exit.x;
      var dy = this.player.y - L.exit.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 50 && !this._exitTriggered && !this._exitingIran) {
        this._exitTriggered = true;
        this.tryExit();
      } else if (d > 70) {
        this._exitTriggered = false;
      }
    },
    tryExit: function () {
      if (this.jugs.length < L.TARGET_JUGS) {
        var need = L.TARGET_JUGS - this.jugs.length;
        this.showToast('还需要 ' + need + ' 个水壶 → 去水壶商人那儿买 🫗', 2200);
        window.playIranSfx('click', 0.3);
        return;
      }
      if (!this._allJugsFull()) {
        this.showToast('需要 2 壶满水才能过境去土耳其', 2200);
        window.playIranSfx('click', 0.3);
        return;
      }
      this._exitingIran = true;
      this.departIran();
    },

    // M3: 启程 — camera fade + 跳下一关 (暂时回 /silk-road)
    departIran: function () {
      var self = this;
      this.state = 'TRADING';
      this.joystickContainer.setVisible(false);
      window.playIranSfx('pickup', 0.5);
      window.playIranSfx('exchange', 0.4);

      // 1) 关闭 dpad + 弹简短提示
      this.showDepartToast();

      // 2) camera fade out 1.5s
      this.cameras.main.fadeOut(1500, 0, 0, 0);

      // 3) 淡黑期间, 屏幕中央淡入 "前往土耳其..." 文字
      var msg = this.add.text(640, 360, '🚩 巴扎尔甘 → 土耳其 🇹🇷\n启程…', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold', align: 'center',
        stroke: '#1A0E04', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(5000);
      // 先透明, 淡入
      msg.setAlpha(0);
      this.tweens.add({
        targets: msg,
        alpha: 1,
        duration: 800,
      });

      // 4) 1.5s 后跳转
      this.time.delayedCall(1700, function () {
        // 优先跳到 /silk-road/turkey 之类, 暂时回关卡选择
        try {
          window.location.href = '/silk-road';
        } catch (e) {
          // fallback: 刷新
          window.location.reload();
        }
      });
    },

    showDepartToast: function () {
      this.showToast('启程条件已满足！前往巴扎尔甘…', 1500);
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

    // ==================== M3: BGM 切换按钮 ====================
    toggleBgm: function () {
      var bgm = document.getElementById('silk-road-bgm');
      if (!bgm) return;
      var next = !bgm.muted;
      bgm.muted = next;
      setBgmMuted(next);
      if (this.bgmBtn) this.bgmBtn.setText(next ? '🔇' : '🔊');
      window.playIranSfx('click', 0.4);
      if (!next) {
        // 解除静音时尝试播放 (autoplay policy)
        try {
          var p = bgm.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
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
        this._toast.setStyle({ color: '#FFD98A', backgroundColor: '#2A1606' });
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
    // M4: 红色警告 toast (用于缺水等警示)
    showWarningToast: function (msg, durationMs) {
      durationMs = durationMs || 1500;
      if (!this._toast) {
        this._toast = this.add.text(L.CANVAS_W / 2, 130, msg, {
          fontSize: '15px', color: '#FFD0D0', backgroundColor: '#7A1F1F',
          padding: { x: 14, y: 8 }, fontStyle: 'bold',
          stroke: '#2A0606', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(1500);
      } else {
        this._toast.setText(msg);
        this._toast.setStyle({
          color: '#FFD0D0', backgroundColor: '#7A1F1F',
          stroke: '#2A0606', strokeThickness: 2,
        });
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

    showFloatingText: function (x, y, text) {
      var t = this.add.text(x, y, text, {
        fontSize: '18px', color: '#6EC1E4', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(1000);
      this.tweens.add({
        targets: t, y: y - 40, alpha: 0, duration: 1200,
        onComplete: function () { t.destroy(); }
      });
    },

    // ==================== 渴死 ====================
    dieFromThirst: function () {
      this.state = 'DEAD';
      this.joystickContainer.setVisible(false);
      this.stopExitPulse();
      window.playIranSfx('die', 0.6);

      var overlay = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.55);
      this.add.text(640, 280, '💀', { fontSize: '80px' }).setOrigin(0.5);
      this.add.text(640, 360, '你渴死在波斯沙漠了', {
        fontSize: '28px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 400, '复活 / 重新出发 / 寄信回家（即将推出）', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5);

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
    _buildAvatarSprite: function (avatarId) {
      var g = this.add.graphics();
      g.setName('avatar:' + avatarId);
      if (avatarId === 'malay') {
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
      } else { // cn_f
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
    backgroundColor: '#C8B89A',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, PlayScene],
  });
  window.__iranGame = game;
})();
