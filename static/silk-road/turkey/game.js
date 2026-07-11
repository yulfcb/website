// 土耳其·卡帕多奇亚·热气球组装 —— 关 2 过渡场景 (M27 重做地图探索)
//
// 流程: 伊朗 → 进入土耳其 (本场景) → 地图探索 → 6 步组装热气球 → 起飞 → 哈萨克斯坦
//   BootScene → PlayScene (地图探索 + 兑换 + 购物) → AssembleScene → FlightScene → /games/silk-road/level/3
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (pointerdown/up 即可触屏 + 长按)
//
// localStorage 写入 (通关时):
//   silkroad_cleared_levels 追加 2

(function () {
  'use strict';

  // ============== 静态数据 ==============
  var CANVAS_W = 1280;
  var CANVAS_H = 720;
  var STEP_PX = 24;
  var MOVE_COOLDOWN_MS = 220;
  var INTERACT_RADIUS = 55;       // 玩家进入这个半径触发 modal
  var INTERACT_LEAVE_RADIUS = 200; // 玩家离开这个半径才能再次触发

  // 卡塔尔礼物引用 (用于兑换中心显示)
  // 优先用 window.QATAR_LEVEL.gifts (如果 qatar/levels.js 已加载), 否则用内置 fallback
  var Q = window.QATAR_LEVEL;
  var GIFTS = (Q && Q.gifts && Q.gifts.length) ? Q.gifts : [
    { id: 0, name: '沙漠玫瑰',   emoji: '🌹' },
    { id: 1, name: '古兰经',     emoji: '📖' },
    { id: 2, name: '游隼',       emoji: '🦅' },
    { id: 3, name: '波斯湾珍珠', emoji: '🦪' },
    { id: 4, name: '天然气',     emoji: '🏭' },
    { id: 5, name: '归家之心',   emoji: '❤️' },
    { id: 6, name: '火炬塔之火', emoji: '🔥' },
    { id: 7, name: '大力神杯',   emoji: '🏆' },
  ];
  var HEART_ID = 5;  // 归家之心不可兑换

  // 兑换价格表: 卡塔尔礼物 id → 土耳其里拉 ₺
  var EXCHANGE_RATES = {
    0: 150,   // 沙漠玫瑰
    1: 200,   // 古兰经
    2: 120,   // 游隼
    3: 180,   // 波斯湾珍珠
    4: 300,   // 天然气
    // 5: 归家之心不可兑换
    6: 250,   // 火炬塔之火
    7: 500,   // 大力神杯
  };

  // 地图地点 (8 个: 兑换中心 + 交易中心 + 5 个商铺 + 组装场)
  //   兑换中心卖行李换里拉, 交易中心列所有 Qatar + Iran 行李卖里拉
  //   2 个绿洲 oasis 用于补水
  var LOCATIONS = [
    { key: 'exchange', x: 230, y: 180, emoji: '💱', label: '兑换中心', color: 0xD4AF37 },
    { key: 'trade',    x: 300, y: 350, emoji: '🏪', label: '交易中心', color: 0xE67E22 },
    { key: 'fabric',   x: 470, y: 380, emoji: '🧵', label: '布料商铺', color: 0xE89AAA },
    { key: 'bamboo',   x: 820, y: 250, emoji: '🎋', label: '竹条商铺', color: 0x5FB3A0 },
    { key: 'basket',   x: 1080, y: 420, emoji: '🧺', label: '吊篮商铺', color: 0x8B6B3A },
    { key: 'hardware', x: 540, y: 560, emoji: '🔌', label: '五金商铺', color: 0x4A90E2 },
    { key: 'tool',     x: 830, y: 560, emoji: '✂️', label: '工具商铺', color: 0xB0B0B0 },
    { key: 'assembly', x: 1100, y: 580, emoji: '🎈', label: '组装场',   color: 0xE74C3C },
    { key: 'oasis1',   x: 400, y: 500, emoji: '💧', label: '绿洲',     color: 0x5FB3A0 },
    { key: 'oasis2',   x: 900, y: 300, emoji: '💧', label: '绿洲',     color: 0x5FB3A0 },
  ];

  // 商铺商品 (按 README 价格)
  var SHOP_ITEMS = {
    fabric: [
      { id: 'fabric_cotton', name: '棉布', desc: '轻便但不够结实', price: 120, fabricId: 'cotton' },
      { id: 'fabric_nylon',  name: '尼龙', desc: '平衡的选择 (推荐)', price: 220, fabricId: 'nylon' },
      { id: 'fabric_canvas', name: '帆布', desc: '结实但很重', price: 360, fabricId: 'canvas' },
    ],
    bamboo: [
      { id: 'bamboo', name: '竹条 ×3', price: 150 },
    ],
    basket: [
      { id: 'basket', name: '吊篮', price: 160 },
    ],
    hardware: [
      { id: 'wire', name: '电线', price: 40 },
      { id: 'lighter', name: '打火机+燃料', price: 80 },
    ],
    tool: [
      { id: 'sewing', name: '缝纫工具', price: 50 },
      { id: 'scissors', name: '剪刀', price: 30 },
    ],
  };

  // 必需材料 (按商铺) — 任意一种布料都算 "fabric" 齐了
  var REQUIRED = [
    { group: 'fabric', label: '布料' },
    { group: 'bamboo', label: '竹条' },
    { group: 'basket', label: '吊篮' },
    { group: 'wire', label: '电线' },
    { group: 'lighter', label: '打火机+燃料' },
    { group: 'sewing', label: '缝纫工具' },
    { group: 'scissors', label: '剪刀' },
  ];

  var FABRIC_COLORS = {
    cotton: { main: 0xE8DCC4, stripe: 0xC4B594 },
    nylon:  { main: 0xF5E6C8, stripe: 0xD4A86A },
    canvas: { main: 0xD4B58A, stripe: 0x8B6F47 },
  };

  // 缝合点 (6 个, 沿球囊左半弧从上到下)
  var STITCH_POINTS = [
    { x: -90, y: -200 },  // 顶部
    { x: -120, y: -120 },
    { x: -130, y: -40 },
    { x: -130, y: 40 },
    { x: -120, y: 120 },
    { x: -90,  y: 200 },  // 底部
  ];

  // AssembleScene 步骤标题 / 副标题 (从第 2 步 "缝制" 开始, 共 6 步)
  var STEPS = [
    { title: '缝制球囊',           sub: '依次点击 6 个缝合点完成气囊缝合',         btn: null },
    { title: '组装框架',           sub: '点击 3 次依次安装 3 根竹条',              btn: '开始组装' },
    { title: '安装吊篮',           sub: '点击 3 个固定点把吊篮装到气球上',         btn: null },
    { title: '充气测试',           sub: '长按鼓风机 2 秒为气囊充气',               btn: null },
    { title: '点火测试',           sub: '点击打火机测试燃烧器',                    btn: null },
    { title: '热气球准备就绪',     sub: '点击下方按钮乘坐热气球飞往哈萨克斯坦',    btn: '🎈 乘坐热气球出发' },
  ];

  // ============== SFX 助手 (跟 qatar 一致) ==============
  window.playTurkeySfx = function (id, volume) {
    var a = document.getElementById('sfx-' + id);
    if (!a) return;
    try {
      a.volume = volume != null ? volume : 0.5;
      a.currentTime = 0;
      var p = a.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) {}
  };

  // ============== BootScene ==============
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'BootScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#FFD9A8');

      // BGM 解锁 + 卸载清理 (跟 qatar 一致)
      document.addEventListener('pointerdown', function unlockBgm() {
        var a = document.getElementById('silk-road-bgm');
        if (a) {
          a.muted = false;
          a.volume = 0.4;
          var p = a.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      }, { once: true });
      window.addEventListener('beforeunload', function () {
        var a = document.getElementById('silk-road-bgm');
        if (a) a.pause();
      });

      this.add.text(640, 360, '加载中…', {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      setTimeout(function () {
        self.scene.start('PlayScene');
      }, 30);
    },
  });

  // ============== PlayScene (地图探索模式) ==============
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#FFD9A8');

      // —— 背景 ——
      this._drawBackground();

      // —— 状态 ——
      this.state = 'PLAYING';  // PLAYING | MODAL
      this.coins = 0;
      this.luggage = this._loadLuggage();
      this.purchasedItems = {};
      this.fabric = null;
      this.merchantShown = {};  // 每个 location 的"已触发过"标记
      this.moveCount = 0;

      // 水量系统 (M28): 从 100 随行走下降, oasis 补水
      this.waterLevel = 100;
      this.maxWater = 100;
      // 骆驼骑乘 toggle (M28): 跟在 iran 一样, 默认步行
      this.camelMode = false;

      // —— 10 个地点 bubble ——
      this.locationSprites = [];
      for (var i = 0; i < LOCATIONS.length; i++) {
        var loc = LOCATIONS[i];
        var halo = this.add.graphics();
        halo.fillStyle(loc.color, 0.35);
        halo.fillCircle(0, 0, 30);
        var circle = this.add.graphics();
        circle.fillStyle(loc.color, 0.85);
        circle.fillCircle(0, 0, 22);
        circle.lineStyle(2, 0xFFFFFF, 0.7);
        circle.strokeCircle(0, 0, 22);

        // 组装场: 用热气球图形代替 emoji
        var centerGraphic;
        if (loc.key === 'assembly') {
          var balloonGfx = this.add.graphics();
          // 球囊
          balloonGfx.fillStyle(0xE74C3C, 1);
          balloonGfx.fillCircle(0, -8, 14);
          // 条纹
          balloonGfx.fillStyle(0xF39C12, 1);
          balloonGfx.fillRect(-14, -16, 28, 3);
          balloonGfx.fillRect(-14, -8, 28, 3);
          balloonGfx.fillRect(-14, 0, 28, 3);
          // 吊篮
          balloonGfx.fillStyle(0x8B4513, 1);
          balloonGfx.fillRoundedRect(-7, 12, 14, 8, 2);
          // 绳索
          balloonGfx.lineStyle(1, 0x6B4423, 0.9);
          balloonGfx.lineBetween(-7, 12, -5, 4);
          balloonGfx.lineBetween(7, 12, 5, 4);
          balloonGfx.lineBetween(0, 13, 0, 4);
          centerGraphic = balloonGfx;
        } else {
          centerGraphic = this.add.text(0, 0, loc.emoji, { fontSize: '28px' }).setOrigin(0.5);
        }
        var label = this.add.text(0, 38, loc.label, {
          fontSize: '12px', color: '#FFFFFF', fontStyle: 'bold',
          stroke: '#4A2E1A', strokeThickness: 3,
          wordWrap: false,
        }).setOrigin(0.5);
        label.setFixedSize(110, 14);
        var sprite = this.add.container(loc.x, loc.y, [halo, circle, centerGraphic, label]);
        sprite.locationData = loc;
        sprite.bobPhase = Math.random() * Math.PI * 2;
        // 完成的商铺打勾 — 用一个隐藏的勾
        sprite.checkmark = this.add.text(22, -22, '✓', {
          fontSize: '20px', color: '#5FB3A0', fontStyle: 'bold',
          stroke: '#FFFFFF', strokeThickness: 3,
        }).setOrigin(0.5);
        sprite.checkmark.setVisible(false);
        sprite.add(sprite.checkmark);
        this.locationSprites.push(sprite);
      }

      // —— 玩家 (从 localStorage 读取造型) ——
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      if (['malay', 'fala', 'cn_m', 'cn_f'].indexOf(avatarId) < 0) avatarId = 'malay';
      this._avatar = avatarId;
      var elf = this._buildAvatarSprite(avatarId);
      var shadow = this.add.ellipse(0, 22, 22, 6, 0x000000, 0.18);
      // 骆驼 sprite (hidden by default, shown when camelMode=true)
      this.camelGfx = this.add.graphics();
      this._drawCamel(this.camelGfx);
      this.camelGfx.setVisible(false);
      // 玩家起始位置: 左下角, 不在任何一个 location 上, 避开 joystick
      var startPos = { x: 150, y: 650 };
      this.playerContainer = this.add.container(startPos.x, startPos.y, [shadow, this.camelGfx, elf]);
      this.playerSprite = { shadow: shadow, elf: elf, camel: this.camelGfx, avatarId: avatarId };
      this.player = { x: startPos.x, y: startPos.y, facing: 1, lastMoveAt: 0, walkPhase: 0 };

      // —— HUD (顶部条, 7 项, 跟 iran 完全一致) ——
      var hudBg = this.add.rectangle(640, 36, 1280, 72, 0x2A1606, 0.92);

      // 1. 💧 水分 (左)
      this.waterText = this.add.text(140, 30, '', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.waterText.setDepth(100);
      this._renderJugHud();

      // 2. 💰 里拉 (中左)
      this.coinText = this.add.text(260, 30, '💰 0 ₺', {
        fontSize: '15px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);

      // 3. 🐪 骑乘切换 (中)
      this.camelBtn = this.add.text(420, 30, '🚶 步行', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        backgroundColor: '#1B5E8A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.camelBtn.setInteractive({ useHandCursor: true });
      this.camelBtn.on('pointerdown', function () { self.toggleCamelMode(); });
      this._updateCamelBtn();

      // 4. 🧳 行李 (中右, clickable)
      this.luggageBtn = this.add.text(580, 30, '🧳 行李 ' + this._luggageTotalCount(), {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.luggageBtn.setInteractive({ useHandCursor: true });
      this.luggageBtn.on('pointerdown', function () { self.openLuggageModal(); });

      // 5. 📦 材料 (右, clickable)
      this.materialBtn = this.add.text(740, 30, '📦 材料 ' + this._collectedCount() + '/7', {
        fontSize: '14px', color: '#A8D8C0', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 10, y: 3 },
      }).setOrigin(0.5);
      this.materialBtn.setInteractive({ useHandCursor: true });
      this.materialBtn.on('pointerdown', function () { self.openMaterialsModal(); });

      // 6. 🔊 BGM 按钮 (右)
      this.bgmBtn = this.add.text(1080, 30, '🔊', {
        fontSize: '18px', color: '#FFD98A',
      }).setOrigin(0.5);
      this.bgmBtn.setInteractive({ useHandCursor: true });
      this.bgmBtn.on('pointerdown', function () { self._toggleBgm(); });

      // 7. 🗺️ 世界地图按钮 (最右, 点击跳转到世界地图页)
      this.worldMapBtn = this.add.text(1200, 30, '🗺️ 世界地图', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'bold',
        backgroundColor: '#4A2E1A', padding: { x: 8, y: 4 },
      }).setOrigin(0.5);
      this.worldMapBtn.setInteractive({ useHandCursor: true });
      this.worldMapBtn.on('pointerdown', function () {
        window.location.href = '/games/silk-road/world-map';
      });

      // —— 虚拟方向键 (复用 qatar 模式, 缩小到 0.6, 左下) ——
      this.keys = { up: false, down: false, left: false, right: false };
      this.joystickContainer = this.add.container(110, 560);
      this.joystickContainer.setAlpha(0.72);
      this.joystickContainer.setScale(0.6);
      this.joystickContainer.setDepth(500);

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
          window.playTurkeySfx('click', 0.4);
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

      this.events.on('update', this._movementUpdate, this);

      // —— 键盘监听 ——
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

      // —— Modal 容器 (用于兑换/购物 modal, 复用 qatar 模式) ——
      this.modalContainer = this.add.container(640, 360);
      this.modalContainer.setDepth(2000);
      this.modalContainer.setVisible(false);

      // 启动时检测位置 — 玩家起始在左下角, 不会自动触发 modal
      this._refreshHud();
      this.checkLocationCollision();
    },

    // ============== BGM 切换按钮 ==============
    _toggleBgm: function () {
      var bgm = document.getElementById('silk-road-bgm');
      if (!bgm) return;
      window.playTurkeySfx('button', 0.4);
      if (bgm.paused) {
        bgm.muted = false;
        try {
          var p = bgm.play();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) {}
        if (this.bgmBtn) this.bgmBtn.setText('🔊');
      } else {
        bgm.pause();
        if (this.bgmBtn) this.bgmBtn.setText('🔇');
      }
    },

    // ============== 背景 ==============
    _drawBackground: function () {
      var g = this.add.graphics();

      // 天空渐变 (卡帕多奇亚日出: 橙→淡蓝)
      g.fillGradientStyle(0xFF9966, 0xFF9966, 0x87CEEB, 0x87CEEB, 1);
      g.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // 太阳
      g.fillStyle(0xFFE9B0, 1);
      g.fillCircle(1000, 120, 50);
      g.fillStyle(0xFFF4D8, 0.3);
      g.fillCircle(1000, 120, 80);

      // 远景清真寺轮廓 (右上)
      g.fillStyle(0xC46A3C, 0.5);
      g.fillCircle(1100, 380, 40);
      g.fillRect(1060, 380, 80, 30);
      g.fillRect(1150, 330, 8, 80);
      g.fillCircle(1154, 328, 6);
      g.fillRect(1045, 340, 8, 70);
      g.fillCircle(1049, 338, 6);

      // 远山轮廓 (2 层)
      g.fillStyle(0xB85A30, 0.4);
      g.beginPath();
      g.moveTo(0, 500);
      var peaks1 = [[100,440],[250,470],[400,430],[550,460],[700,420],[850,455],[1000,435],[1150,450],[1280,440]];
      for (var p1 = 0; p1 < peaks1.length; p1++) g.lineTo(peaks1[p1][0], peaks1[p1][1]);
      g.lineTo(1280, 500); g.lineTo(0, 500); g.closePath(); g.fillPath();

      g.fillStyle(0xC46A3C, 0.6);
      g.beginPath();
      g.moveTo(0, 520);
      var peaks2 = [[80,480],[200,500],[350,475],[500,495],[650,470],[800,490],[950,480],[1100,500],[1280,485]];
      for (var p2 = 0; p2 < peaks2.length; p2++) g.lineTo(peaks2[p2][0], peaks2[p2][1]);
      g.lineTo(1280, 520); g.lineTo(0, 520); g.closePath(); g.fillPath();

      // 仙女烟囱 (更多细节, 带刻窗/门)
      var chimneys = [
        { x: 80,   y: 540, w: 55,  h: 100, c: 0xC46A3C },
        { x: 160,  y: 560, w: 45,  h: 80,  c: 0xB85A30 },
        { x: 350,  y: 550, w: 60,  h: 110, c: 0xA04A24 },
        { x: 500,  y: 250, w: 50,  h: 85,  c: 0xB85A30 },
        { x: 700,  y: 230, w: 55,  h: 95,  c: 0xC46A3C },
        { x: 950,  y: 240, w: 65,  h: 105, c: 0xA04A24 },
        { x: 1200, y: 550, w: 50,  h: 90,  c: 0xB85A30 },
      ];
      chimneys.forEach(function (ch) {
        // 主体
        g.fillStyle(ch.c, 1);
        g.fillRoundedRect(ch.x - ch.w / 2, ch.y - ch.h / 2, ch.w, ch.h, { tl: 20, tr: 20, bl: 4, br: 4 });
        // 蘑菇帽
        g.fillStyle(0x8B4513, 1);
        g.fillRoundedRect(ch.x - ch.w / 2 - 6, ch.y - ch.h / 2 - 10, ch.w + 12, 18, 8);
        // 刻窗
        g.fillStyle(0x2A1606, 0.8);
        g.fillRoundedRect(ch.x - 8, ch.y - ch.h / 4, 16, 20, 3);
        // 刻门
        g.fillRoundedRect(ch.x - 10, ch.y + ch.h / 2 - 25, 20, 25, { tl: 10, tr: 10, bl: 0, br: 0 });
        // 阴影侧
        g.fillStyle(0x000000, 0.12);
        g.fillRect(ch.x + ch.w / 4, ch.y - ch.h / 2 + 10, ch.w / 4, ch.h - 20);
      });

      // 洞窟民居 (岩壁上的拱形洞)
      g.fillStyle(0xA04A24, 0.8);
      g.fillRoundedRect(240, 480, 120, 60, { tl: 30, tr: 30, bl: 0, br: 0 });
      g.fillStyle(0x2A1606, 0.7);
      g.fillRoundedRect(260, 490, 25, 40, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillRoundedRect(300, 495, 25, 35, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.fillRoundedRect(340, 490, 25, 40, { tl: 12, tr: 12, bl: 0, br: 0 });

      // 石拱桥
      g.fillStyle(0x8B6B3A, 0.9);
      g.fillRect(560, 470, 160, 12);
      g.fillStyle(0x6B4423, 0.7);
      g.fillRoundedRect(580, 482, 50, 30, { tl: 25, tr: 25, bl: 0, br: 0 });
      g.fillRoundedRect(650, 482, 50, 30, { tl: 25, tr: 25, bl: 0, br: 0 });

      // 远处热气球 (5 个)
      var balloons = [
        { x: 200, y: 140, c1: 0xE74C3C, c2: 0xF1C40F },
        { x: 380, y: 180, c1: 0xF39C12, c2: 0xE67E22 },
        { x: 550, y: 100, c1: 0xC0392B, c2: 0xF39C12 },
        { x: 750, y: 160, c1: 0xE74C3C, c2: 0xF1C40F },
        { x: 900, y: 80,  c1: 0xD35400, c2: 0xF1C40F },
      ];
      balloons.forEach(function (b) {
        g.fillStyle(b.c1, 0.6);
        g.fillCircle(b.x, b.y, 16);
        g.fillStyle(b.c2, 0.6);
        g.fillRect(b.x - 8, b.y + 14, 16, 3);
        g.fillStyle(0x6B4423, 0.6);
        g.fillRect(b.x - 5, b.y + 17, 10, 5);
        g.lineStyle(1, 0x6B4423, 0.4);
        g.lineBetween(b.x - 5, b.y + 14, b.x - 5, b.y + 17);
        g.lineBetween(b.x + 5, b.y + 14, b.x + 5, b.y + 17);
      });

      // 地面 (沙土基底)
      g.fillStyle(0xD4A574, 1);
      g.fillRect(0, 600, CANVAS_W, 120);

      // 地面纹理
      g.fillStyle(0xC49464, 0.5);
      g.fillRect(0, 620, CANVAS_W, 2);
      g.fillRect(0, 650, CANVAS_W, 1);
      g.fillRect(0, 680, CANVAS_W, 2);

      // 绿色植被斑块 (葡萄园/灌木)
      g.fillStyle(0x6B8E23, 0.3);
      g.fillCircle(400, 630, 30);
      g.fillCircle(800, 650, 25);
      g.fillCircle(1100, 640, 35);

      // 小石头
      g.fillStyle(0x8B6B3A, 0.6);
      var rocks = [[50,650],[180,670],[450,660],[620,680],[880,650],[1050,670],[1220,660]];
      for (var ri = 0; ri < rocks.length; ri++) {
        var r = rocks[ri];
        g.fillCircle(r[0], r[1], 5 + (ri * 3 % 5));
      }

      // 绿洲 oasis terrain (在 oasis1 400,500 和 oasis2 900,300 各画一片)
      // 跟 LOCATIONS 数组保持一致
      var oases = [
        { x: 400, y: 500 },
        { x: 900, y: 300 },
      ];
      oases.forEach(function (o) {
        // Green grass circle
        g.fillStyle(0x6B8E23, 0.6);
        g.fillCircle(o.x, o.y, 45);
        g.fillStyle(0x7CFC00, 0.3);
        g.fillCircle(o.x - 10, o.y - 5, 25);
        g.fillCircle(o.x + 15, o.y + 8, 20);

        // Water pond (blue)
        g.fillStyle(0x4A90D9, 0.8);
        g.fillCircle(o.x, o.y + 5, 18);
        g.fillStyle(0x6EC1E4, 0.5);
        g.fillCircle(o.x - 3, o.y + 2, 10);

        // Reeds/plants around pond
        g.lineStyle(2, 0x556B2F, 0.8);
        g.lineBetween(o.x - 20, o.y + 10, o.x - 18, o.y - 10);
        g.lineBetween(o.x - 15, o.y + 12, o.x - 12, o.y - 8);
        g.lineBetween(o.x + 18, o.y + 8, o.x + 20, o.y - 12);

        // Small palm tree
        g.fillStyle(0x8B6914, 1);
        g.fillRect(o.x + 30, o.y - 30, 4, 25);
        g.fillStyle(0x228B22, 0.8);
        g.fillCircle(o.x + 32, o.y - 35, 12);
      });
    },

    // ============== 角色 sprite (复用 iran 4 角色 graphics) ==============
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
        g.fillStyle(0x1A1208, 1); g.fillRect(-4, -10, 2, 2); g.fillRect(2, -10, 2, 2);
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

    // ============== 行李 helpers ==============
    _loadLuggage: function () {
      var isDebug = /[?&]debug=1/.test(window.location.search);
      if (isDebug) {
        return [
          { id: 0, qty: 3 }, { id: 1, qty: 3 }, { id: 2, qty: 3 },
          { id: 3, qty: 3 }, { id: 4, qty: 3 }, { id: 5, qty: 1 },
          { id: 6, qty: 3 }, { id: 7, qty: 3 },
        ];
      }
      try {
        var raw = localStorage.getItem('silkroad_luggage');
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(function (e) {
          if (typeof e === 'number') return { id: e, qty: 1 };
          return { id: Number(e.id), qty: Number(e.qty) || 0 };
        }).filter(function (e) { return e.qty > 0; });
      } catch (e) { return []; }
    },
    _luggageCount: function (id) {
      for (var i = 0; i < this.luggage.length; i++) {
        if (this.luggage[i].id === id) return this.luggage[i].qty;
      }
      return 0;
    },
    _luggageTotalCount: function () {
      var total = 0;
      for (var i = 0; i < this.luggage.length; i++) total += this.luggage[i].qty;
      return total;
    },
    _removeFromLuggage: function (id, qty) {
      for (var i = 0; i < this.luggage.length; i++) {
        if (this.luggage[i].id === id) {
          this.luggage[i].qty -= qty;
          if (this.luggage[i].qty <= 0) this.luggage.splice(i, 1);
          break;
        }
      }
    },
    _getGiftInfo: function (id) {
      for (var i = 0; i < GIFTS.length; i++) {
        if (GIFTS[i].id === id) return { emoji: GIFTS[i].emoji, name: GIFTS[i].name };
      }
      return { emoji: '🎁', name: '物品 #' + id };
    },
    _collectedCount: function () {
      var n = 0;
      for (var i = 0; i < REQUIRED.length; i++) {
        var r = REQUIRED[i];
        if (r.group === 'fabric') {
          if (this.purchasedItems.fabric_cotton ||
              this.purchasedItems.fabric_nylon ||
              this.purchasedItems.fabric_canvas) n++;
        } else if (this.purchasedItems[r.group]) {
          n++;
        }
      }
      return n;
    },
    _hasAllMaterials: function () {
      return this._collectedCount() >= REQUIRED.length;
    },
    _missingMaterials: function () {
      var missing = [];
      for (var i = 0; i < REQUIRED.length; i++) {
        var r = REQUIRED[i];
        if (r.group === 'fabric') {
          if (!(this.purchasedItems.fabric_cotton ||
                this.purchasedItems.fabric_nylon ||
                this.purchasedItems.fabric_canvas)) {
            missing.push(r.label);
          }
        } else if (!this.purchasedItems[r.group]) {
          missing.push(r.label);
        }
      }
      return missing;
    },
    _refreshHud: function () {
      this.coinText.setText('💰 ' + this.coins + ' ₺');
      this.luggageBtn.setText('🧳 行李 ' + this._luggageTotalCount());
      this.materialBtn.setText('📦 材料 ' + this._collectedCount() + '/7');
      this._renderJugHud();
      this._updateCamelBtn();
      // 更新 location 上的勾
      for (var i = 0; i < this.locationSprites.length; i++) {
        var sp = this.locationSprites[i];
        var key = sp.locationData.key;
        var done = false;
        if (key === 'exchange' || key === 'trade') done = (this._luggageTotalCount() === 0);
        else if (key === 'assembly') done = this._hasAllMaterials();
        else if (key === 'oasis1' || key === 'oasis2') done = (this.waterLevel >= this.maxWater);
        else if (SHOP_ITEMS[key]) {
          // 每个 shop 完成 = 该店所有商品都已购买
          var items = SHOP_ITEMS[key] || [];
          var all = true;
          for (var j = 0; j < items.length; j++) {
            if (!this.purchasedItems[items[j].id]) { all = false; break; }
          }
          done = all;
        }
        if (sp.checkmark) sp.checkmark.setVisible(done);
      }
    },
    // ============== 水分 HUD (跟 iran 一样, 单文本) ==============
    _renderJugHud: function () {
      if (!this.waterText) return;
      var water = this.waterLevel;
      var maxW = this.maxWater;
      var txt = '💧 水分 ' + water.toFixed(1) + ' / ' + maxW.toFixed(1);
      this.waterText.setText(txt);
      var ratio = water / maxW;
      if (ratio <= 0.3) this.waterText.setColor('#FF6B6B');
      else if (ratio <= 0.5) this.waterText.setColor('#FFB347');
      else this.waterText.setColor('#FFD98A');
    },
    // ============== 骆驼骑乘 toggle (跟 iran 一样) ==============
    toggleCamelMode: function () {
      // 简化: 任意时候都可切换 (本地 Game 没有骆驼商人, 默认有骑行能力)
      this.camelMode = !this.camelMode;
      this._updateCamelBtn();
      window.playTurkeySfx('click', 0.4);
      window.playTurkeySfx('pickup', 0.3);
    },
    _updateCamelBtn: function () {
      if (!this.camelBtn) return;
      if (this.camelMode) {
        this.camelBtn.setText('🐪 骑乘中');
        this.camelBtn.setStyle({
          backgroundColor: '#5B8C3A',
          padding: { x: 10, y: 3 },
        });
        if (this.camelGfx) this.camelGfx.setVisible(true);
        if (this.playerSprite && this.playerSprite.elf) {
          this.playerSprite.elf.setScale(0.7);
          this.playerSprite.elf.y = -20;
        }
      } else {
        this.camelBtn.setText('🚶 步行');
        this.camelBtn.setStyle({
          backgroundColor: '#1B5E8A',
          padding: { x: 10, y: 3 },
        });
        if (this.camelGfx) this.camelGfx.setVisible(false);
        if (this.playerSprite && this.playerSprite.elf) {
          this.playerSprite.elf.setScale(1.0);
          this.playerSprite.elf.y = 0;
        }
      }
    },
    // 画一个简单的骆驼 (body + hump + neck + head + 4 legs + eye)
    _drawCamel: function (g) {
      g.clear();
      // Body
      g.fillStyle(0xC4A265, 1);
      g.fillRoundedRect(-18, -8, 36, 16, 4);
      // Hump
      g.fillCircle(0, -14, 8);
      // Neck
      g.fillRect(14, -22, 6, 16);
      // Head
      g.fillRoundedRect(14, -28, 12, 8, 3);
      // Legs (4)
      g.fillRect(-14, 8, 4, 14);
      g.fillRect(-6, 8, 4, 14);
      g.fillRect(6, 8, 4, 14);
      g.fillRect(14, 8, 4, 14);
      // Eye
      g.fillStyle(0x000000, 1);
      g.fillCircle(22, -26, 2);
    },
    // ============== Modal: 行李 (点击 HUD luggage 打开) ==============
    openLuggageModal: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);
      var card = this.add.rectangle(0, 0, 640, 460, 0x2A1606, 1)
        .setStrokeStyle(2, 0xD4AF37, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -190, '🧳 我的行李 (Qatar + Iran)', {
        fontSize: '24px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -160, '点这里查看你的所有特产, 可去兑换/交易中心换钱', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      if (this.luggage.length === 0) {
        this.modalContainer.add(this.add.text(0, 20, '（行李箱空空如也）', {
          fontSize: '14px', color: '#C9B89A',
        }).setOrigin(0.5));
      } else {
        var rowH = 32;
        var visible = this.luggage.slice(0, 11);
        var startY = -(visible.length * rowH) / 2 + rowH / 2 + 10;
        for (var i = 0; i < visible.length; i++) {
          var e = visible[i];
          var info = this._getGiftInfo(e.id);
          var rate = EXCHANGE_RATES[e.id];
          var priceTxt = (rate != null) ? (rate + ' ₺') : '—';
          var isHeart = e.id === HEART_ID;
          var ry = startY + i * rowH;
          var rowBg = self.add.rectangle(0, ry, 560, rowH - 6, 0x4A2E1A, 0.85)
            .setStrokeStyle(2, isHeart ? 0xF6B5C8 : 0x6B4423, 0.4);
          this.modalContainer.add(rowBg);
          this.modalContainer.add(this.add.text(-240, ry, info.emoji, { fontSize: '20px' }).setOrigin(0.5));
          this.modalContainer.add(this.add.text(-190, ry, info.name, {
            fontSize: '14px', color: '#F4ECD8', fontStyle: 'bold',
          }).setOrigin(0, 0.5));
          this.modalContainer.add(this.add.text(50, ry, '×' + e.qty, {
            fontSize: '13px', color: '#FFD98A', fontStyle: 'bold',
          }).setOrigin(0, 0.5));
          this.modalContainer.add(this.add.text(180, ry, priceTxt, {
            fontSize: '13px', color: isHeart ? '#F6B5C8' : '#D4AF37', fontStyle: 'bold',
          }).setOrigin(0, 0.5));
        }
      }

      var closeBg = this.add.rectangle(0, 200, 200, 44, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 200, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 200, 200, 44).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },
    // ============== Modal: 材料清单 ==============
    openMaterialsModal: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);
      var card = this.add.rectangle(0, 0, 580, 440, 0x2A1606, 1)
        .setStrokeStyle(2, 0xA8D8C0, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -180, '📦 组装材料清单', {
        fontSize: '24px', color: '#A8D8C0', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -150, '收集齐 7 项就可以出发去组装场了', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      var rowH = 30;
      var startY = -(REQUIRED.length * rowH) / 2 + rowH / 2 + 30;
      for (var i = 0; i < REQUIRED.length; i++) {
        var r = REQUIRED[i];
        var done = false;
        var detail = '';
        if (r.group === 'fabric') {
          if (this.purchasedItems.fabric_cotton) { done = true; detail = '棉布'; }
          else if (this.purchasedItems.fabric_nylon) { done = true; detail = '尼龙'; }
          else if (this.purchasedItems.fabric_canvas) { done = true; detail = '帆布'; }
        } else {
          done = !!this.purchasedItems[r.group];
          if (done) detail = '✓';
        }
        var ry = startY + i * rowH;
        var rowBg = self.add.rectangle(0, ry, 500, rowH - 4,
          done ? 0x1F3D34 : 0x4A2E1A, 0.85)
          .setStrokeStyle(2, done ? 0x5FB3A0 : 0x6B4423, 0.4);
        this.modalContainer.add(rowBg);
        this.modalContainer.add(this.add.text(-220, ry, done ? '✓' : '✗', {
          fontSize: '16px', color: done ? '#5FB3A0' : '#E74C3C', fontStyle: 'bold',
        }).setOrigin(0.5));
        this.modalContainer.add(this.add.text(-180, ry, r.label, {
          fontSize: '14px', color: done ? '#A8D8C0' : '#F4ECD8', fontStyle: 'bold',
        }).setOrigin(0, 0.5));
        this.modalContainer.add(this.add.text(180, ry, detail, {
          fontSize: '12px', color: '#FFD98A',
        }).setOrigin(0.5));
      }

      var closeBg = this.add.rectangle(0, 190, 200, 44, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 190, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 190, 200, 44).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },
    // ============== 绿洲: 补水 ==============
    refillWaterAtOasis: function (loc) {
      var self = this;
      if (this.state === 'MODAL') return;
      if (this.waterLevel >= this.maxWater) {
        this.showToast('水壶已经是满的了 💧', 0x5FB3A0, 900);
        return;
      }
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);
      var card = this.add.rectangle(0, 0, 520, 340, 0x2A1606, 1)
        .setStrokeStyle(2, 0x5FB3A0, 0.7);
      this.modalContainer.add(card);
      this.modalContainer.add(this.add.text(0, -110, '💧 绿洲补水', {
        fontSize: '24px', color: '#5FB3A0', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -80, '安纳托利亚中部的泉水, 清凉甘甜', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -30, '💧 当前水分: ' + this.waterLevel.toFixed(1) + ' / ' + this.maxWater.toFixed(1), {
        fontSize: '15px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));

      var fillBg = self.add.rectangle(0, 30, 240, 56, 0x5FB3A0, 1)
        .setStrokeStyle(2, 0xFFFFFF, 0.5);
      this.modalContainer.add(fillBg);
      this.modalContainer.add(self.add.text(0, 30, '灌满水壶', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5));
      var fillZone = self.add.zone(0, 30, 240, 56).setInteractive({ useHandCursor: true });
      fillZone.on('pointerdown', function () {
        window.playTurkeySfx('pickup', 0.5);
        self.waterLevel = self.maxWater;
        self.showToast('💧 水壶已灌满!', 0x5FB3A0, 900);
        self._refreshHud();
        self.closeModal();
      });
      this.modalContainer.add(fillZone);

      var closeBg = self.add.rectangle(0, 110, 200, 44, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      self.modalContainer.add(self.add.text(0, 110, '关闭', {
        fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = self.add.zone(0, 110, 200, 44).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },

    // ============== 移动 ==============
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
      if (now - this.player.lastMoveAt < MOVE_COOLDOWN_MS) return;
      var dx = 0, dy = 0;
      if (key === 'up') dy = -STEP_PX;
      else if (key === 'down') dy = STEP_PX;
      else if (key === 'left') { dx = -STEP_PX; this.player.facing = -1; }
      else if (key === 'right') { dx = STEP_PX; this.player.facing = 1; }
      var nx = this.player.x + dx;
      var ny = this.player.y + dy;
      if (nx < 30 || nx > CANVAS_W - 30 || ny < 30 || ny > CANVAS_H - 30) {
        this.showBoundaryToast();
        return;
      }
      this.player.x = nx;
      this.player.y = ny;
      this.player.lastMoveAt = now;
      this.playerContainer.x = nx;
      this.playerContainer.y = ny;
      if (this.playerContainer) {
        var sx = this.player.facing === -1 ? -1 : 1;
        this.playerContainer.scaleX = sx;
      }
      this.moveCount++;
      this.checkLocationCollision();
    },
    showBoundaryToast: function () {
      if (!this.boundaryToast) {
        this.boundaryToast = this.add.text(CANVAS_W / 2, 200, '🚧 撞墙了', {
          fontSize: '18px', color: '#FFD98A', backgroundColor: '#2A1606',
          padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(1500);
      }
      this.boundaryToast.setAlpha(1);
      if (this._boundaryTween) this._boundaryTween.stop();
      this._boundaryTween = this.tweens.add({
        targets: this.boundaryToast,
        alpha: 0,
        duration: 600,
        delay: 400,
      });
    },
    checkLocationCollision: function () {
      // (M28) 跟 iran 一样, 走近 (d<60) 显示气泡, 点气泡触发 modal
      var nearest = null;
      var nearestD = Infinity;
      for (var i = 0; i < this.locationSprites.length; i++) {
        var sp = this.locationSprites[i];
        var loc = sp.locationData;
        var dx = this.player.x - loc.x;
        var dy = this.player.y - loc.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 60) {
          if (d < nearestD) { nearestD = d; nearest = loc; }
        }
      }
      if (nearest && this._nearestBubbleKey !== nearest.key) {
        if (this._nearestBubbleKey && this.merchantBubbles[this._nearestBubbleKey]) {
          this.hideLocationBubble(this._nearestBubbleKey);
        }
        this._nearestBubbleKey = nearest.key;
        this.showLocationBubble(nearest);
      } else if (!nearest && this._nearestBubbleKey) {
        this.hideLocationBubble(this._nearestBubbleKey);
        this._nearestBubbleKey = null;
      }
    },
    showLocationBubble: function (loc) {
      var self = this;
      if (this.merchantBubbles[loc.key]) return;
      this.merchantBubbles = this.merchantBubbles || {};
      var bg = this.add.graphics();
      var isOasis = (loc.key === 'oasis1' || loc.key === 'oasis2');
      var isTrade = (loc.key === 'trade' || loc.key === 'exchange');
      var label = isOasis ? '💧 补水' : '点击交易 💬';
      var strokeColor = isOasis ? 0x5FB3A0 : (isTrade ? 0xD4AF37 : 0xFFD98A);
      bg.fillStyle(0x2A1606, 0.92);
      bg.fillRoundedRect(-60, -16, 120, 32, 8);
      bg.lineStyle(2, strokeColor, 0.85);
      bg.strokeRoundedRect(-60, -16, 120, 32, 8);
      bg.fillTriangle(-5, 16, 5, 16, 0, 22);
      var txt = this.add.text(0, 0, label, {
        fontSize: '13px',
        color: strokeColor === 0xD4AF37 ? '#D4AF37' : '#FFD98A',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      var bubble = this.add.container(loc.x, loc.y - 38, [bg, txt]);
      bubble.setDepth(1500);
      var bubbleZone = this.add.zone(loc.x, loc.y - 38, 130, 50)
        .setInteractive({ useHandCursor: true });
      bubbleZone.setDepth(1501);
      bubbleZone.on('pointerdown', function () { self.tryOpenLocation(loc); });
      bubble.bubbleZone = bubbleZone;
      this.merchantBubbles[loc.key] = bubble;
    },
    hideLocationBubble: function (key) {
      if (this.merchantBubbles && this.merchantBubbles[key]) {
        if (this.merchantBubbles[key].bubbleZone) {
          this.merchantBubbles[key].bubbleZone.destroy();
        }
        this.merchantBubbles[key].destroy();
        this.merchantBubbles[key] = null;
      }
    },
    tryOpenLocation: function (loc) {
      // 必须还在 60px 内, 否则不打开
      if (this.state !== 'PLAYING') return;
      var dx = this.player.x - loc.x;
      var dy = this.player.y - loc.y;
      if (Math.sqrt(dx * dx + dy * dy) >= 60) return;
      this.triggerLocation(loc);
    },
    triggerLocation: function (loc) {
      if (loc.key === 'exchange') this.openExchangeModal();
      else if (loc.key === 'trade') this.openTradeCenter();
      else if (loc.key === 'assembly') this.openAssemblyCheck();
      else if (loc.key === 'oasis1' || loc.key === 'oasis2') this.refillWaterAtOasis(loc);
      else if (SHOP_ITEMS[loc.key]) this.openShopModal(loc.key);
    },

    // ============== 主循环 ==============
    update: function (time, delta) {
      if (this.state !== 'PLAYING') return;
      // 玩家走动画
      if (Date.now() - this.player.lastMoveAt < 200) {
        this.player.walkPhase += 0.2;
        if (this.playerSprite) {
          this.playerSprite.elf.y = Math.sin(this.player.walkPhase) * 1.5;
        }
      } else if (this.playerSprite) {
        this.playerSprite.elf.y = 0;
      }
      // location bubble 浮动
      for (var i = 0; i < this.locationSprites.length; i++) {
        var sp = this.locationSprites[i];
        sp.bobPhase += 0.04;
        sp.y = sp.locationData.y + Math.sin(sp.bobPhase) * 3;
      }
      // (M28) 水分随时间下降 — 跟 iran 类似 (但更慢一些)
      if (this.waterLevel > 0) {
        var d = delta || 16;
        var step = 0.012 * (d / 16);  // 每秒约 0.75 单位
        this.waterLevel -= step;
        if (this.waterLevel < 0) this.waterLevel = 0;
        if (this._lastWaterHud == null || Math.abs(this.waterLevel - this._lastWaterHud) > 0.5) {
          this._lastWaterHud = this.waterLevel;
          this._renderJugHud();
        }
        if (this.waterLevel <= 0 && !this._waterWarnedAt) {
          this._waterWarnedAt = Date.now();
          this.showToast('💧 水壶空了! 去找 oasis 补水', 0xE74C3C, 1500);
        }
        if (this._waterWarnedAt && this.waterLevel > 5) {
          // 补水后清掉警告标记
          this._waterWarnedAt = null;
        }
      }
    },

    // ============== Modal: 兑换中心 ==============
    openExchangeModal: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 680, 520, 0x2A1606, 1)
        .setStrokeStyle(2, 0xD4AF37, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -220, '💱 兑换中心', {
        fontSize: '26px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -190, '把行李物品换成土耳其里拉 ₺', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      this._coinModalText = this.add.text(0, -160, '💰 当前余额：' + this.coins + ' ₺', {
        fontSize: '16px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);
      this.modalContainer.add(this._coinModalText);

      // 行李 grid
      var gridY = -80;
      var cellW = 130, cellH = 100;
      var cols = 4;
      var tradeable = [];
      var heartEntry = null;
      for (var i = 0; i < this.luggage.length; i++) {
        var e = this.luggage[i];
        if (e.id === HEART_ID) { heartEntry = e; continue; }
        if (e.qty > 0 && EXCHANGE_RATES[e.id] !== undefined) tradeable.push(e);
      }
      var cells = tradeable.slice();
      if (heartEntry) cells.push(heartEntry);

      if (cells.length === 0) {
        this.modalContainer.add(this.add.text(0, -50, '（行李箱里没有可兑换的物品）', {
          fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0.5));
      } else {
        var startX = -((Math.min(cols, cells.length) - 1) * cellW) / 2 - cellW / 2;
        for (var i = 0; i < cells.length; i++) {
          var e = cells[i];
          var info = this._getGiftInfo(e.id);
          var rate = EXCHANGE_RATES[e.id];
          var isHeart = e.id === HEART_ID;
          var col = i % cols, row = Math.floor(i / cols);
          var cx = startX + (col + 1) * cellW;
          var cy = gridY + row * cellH;

          var cellBg = self.add.rectangle(cx, cy, cellW - 16, cellH - 16,
            isHeart ? 0xF6B5C8 : 0x4A2E1A, isHeart ? 0.45 : 0.85)
            .setStrokeStyle(2, isHeart ? 0xF6B5C8 : 0x6B4423, isHeart ? 0.7 : 0.4);
          this.modalContainer.add(cellBg);

          this.modalContainer.add(this.add.text(cx, cy - 28, info.emoji, { fontSize: '30px' }).setOrigin(0.5));
          var nm = this.add.text(cx, cy - 4, info.name, {
            fontSize: '11px', color: '#F4ECD8', fontStyle: 'bold',
            wordWrap: false,
          }).setOrigin(0.5);
          nm.setFixedSize(cellW - 28, 14);
          this.modalContainer.add(nm);
          if (isHeart) {
            this.modalContainer.add(this.add.text(cx, cy + 18, '不可兑换', {
              fontSize: '11px', color: '#F6B5C8', fontStyle: 'bold',
            }).setOrigin(0.5));
          } else {
            this.modalContainer.add(this.add.text(cx, cy + 16, '→ ' + rate + ' ₺', {
              fontSize: '12px', color: '#D4AF37', fontStyle: 'bold',
            }).setOrigin(0.5));
            this.modalContainer.add(this.add.text(cx, cy + 32, '×' + e.qty, {
              fontSize: '11px', color: '#FFD98A',
            }).setOrigin(0.5));
          }
          if (!isHeart) {
            (function (itemId) {
              var zone = self.add.zone(cx, cy, cellW - 16, cellH - 16)
                .setInteractive({ useHandCursor: true });
              zone.on('pointerdown', function () {
                window.playTurkeySfx('click', 0.4);
                self.doExchange(itemId);
              });
              self.modalContainer.add(zone);
            })(e.id);
          }
        }
      }

      this.modalContainer.add(this.add.text(0, 160, '👆 点击物品 → 卖出一件 → 获得里拉', {
        fontSize: '13px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5));

      var closeBg = this.add.rectangle(0, 220, 200, 50, 0xD4AF37, 1)
        .setStrokeStyle(2, 0xFFE9B0);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 220, '关闭', {
        fontSize: '16px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 220, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },
    doExchange: function (itemId) {
      var rate = EXCHANGE_RATES[itemId];
      if (rate === undefined) return;
      if (this._luggageCount(itemId) <= 0) {
        this.showToast('这件物品已卖完', 0xE74C3C);
        return;
      }
      this._removeFromLuggage(itemId, 1);
      this.coins += rate;
      window.playTurkeySfx('exchange', 0.55);
      window.playTurkeySfx('pickup', 0.3);
      this.showToast('💰 获得 ' + rate + ' ₺', 0x5FB3A0, 900);
      if (this._coinModalText) this._coinModalText.setText('💰 当前余额：' + this.coins + ' ₺');
      // 重新渲染 (刷新网格)
      var self = this;
      setTimeout(function () {
        if (self.state === 'MODAL') self.openExchangeModal();
      }, 350);
      this._refreshHud();
    },

    // ============== Modal: 交易中心 (列出所有 Qatar+Iran 行李, 卖出换里拉) ==============
    openTradeCenter: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      if (this.luggage.length === 0) {
        this.showToast('行李箱是空的, 先去卡塔尔/伊朗收集礼物 🎁', 0xE74C3C, 1400);
        return;
      }
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 720, 540, 0x2A1606, 1)
        .setStrokeStyle(2, 0xE67E22, 0.75);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -230, '🏪 交易中心', {
        fontSize: '26px', color: '#E67E22', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -200, '把 Qatar + Iran 行李卖掉, 换取土耳其里拉 ₺', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      this._tradeCoinText = this.add.text(0, -170, '💰 当前余额：' + this.coins + ' ₺', {
        fontSize: '16px', color: '#D4AF37', fontStyle: 'bold',
        stroke: '#2A1606', strokeThickness: 2,
      }).setOrigin(0.5);
      this.modalContainer.add(this._tradeCoinText);

      // 行李 grid (同 exchange 风格)
      var gridY = -80;
      var cellW = 140, cellH = 110;
      var cols = 4;
      // 过滤: 可交易的 (排除 HEART 且 qty>0)
      var cells = [];
      for (var i = 0; i < this.luggage.length; i++) {
        var e = this.luggage[i];
        if (e.id === HEART_ID) continue;
        if (e.qty > 0 && EXCHANGE_RATES[e.id] !== undefined) cells.push(e);
      }

      if (cells.length === 0) {
        this.modalContainer.add(this.add.text(0, 0, '（行李箱里没有可卖的物品）', {
          fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0.5));
      } else {
        var startX = -((Math.min(cols, cells.length) - 1) * cellW) / 2 - cellW / 2;
        for (var i = 0; i < cells.length; i++) {
          var e = cells[i];
          var info = this._getGiftInfo(e.id);
          var rate = EXCHANGE_RATES[e.id];
          var col = i % cols, row = Math.floor(i / cols);
          var cx = startX + (col + 1) * cellW;
          var cy = gridY + row * cellH;

          var cellBg = self.add.rectangle(cx, cy, cellW - 16, cellH - 16,
            0x4A2E1A, 0.85).setStrokeStyle(2, 0xE67E22, 0.5);
          this.modalContainer.add(cellBg);

          this.modalContainer.add(this.add.text(cx, cy - 32, info.emoji, { fontSize: '32px' }).setOrigin(0.5));
          var nm = this.add.text(cx, cy - 6, info.name, {
            fontSize: '12px', color: '#F4ECD8', fontStyle: 'bold',
            wordWrap: false,
          }).setOrigin(0.5);
          nm.setFixedSize(cellW - 28, 14);
          this.modalContainer.add(nm);

          this.modalContainer.add(this.add.text(cx, cy + 14, '→ ' + rate + ' ₺ · ×' + e.qty, {
            fontSize: '11px', color: '#D4AF37', fontStyle: 'bold',
          }).setOrigin(0.5));

          // 卖出按钮
          var btnBg = self.add.rectangle(cx, cy + 36, 70, 22, 0xE67E22, 1)
            .setStrokeStyle(2, 0xFFE9B0, 0.6);
          this.modalContainer.add(btnBg);
          this.modalContainer.add(self.add.text(cx, cy + 36, '卖出', {
            fontSize: '11px', color: '#2A190E', fontStyle: 'bold',
          }).setOrigin(0.5));

          (function (itemId) {
            var zone = self.add.zone(cx, cy + 36, 70, 22)
              .setInteractive({ useHandCursor: true });
            zone.on('pointerdown', function () {
              window.playTurkeySfx('click', 0.4);
              self.doTradeSell(itemId);
            });
            self.modalContainer.add(zone);
          })(e.id);
        }
      }

      // 底部说明
      this.modalContainer.add(this.add.text(0, 170, '点击「卖出」→ 卖出一件 → 数量 -1 → 获得里拉', {
        fontSize: '12px', color: '#F4ECD8', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 220, 200, 50, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 220, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 220, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },
    doTradeSell: function (itemId) {
      var rate = EXCHANGE_RATES[itemId];
      if (rate === undefined) return;
      if (this._luggageCount(itemId) <= 0) {
        this.showToast('这件物品已卖完', 0xE74C3C);
        return;
      }
      // 减数量
      this._removeFromLuggage(itemId, 1);
      // 加里拉
      this.coins += rate;
      window.playTurkeySfx('exchange', 0.55);
      window.playTurkeySfx('pickup', 0.3);
      this.showToast('💰 获得 ' + rate + ' ₺', 0x5FB3A0, 900);
      // 更新 modal 上的余额
      if (this._tradeCoinText) this._tradeCoinText.setText('💰 当前余额：' + this.coins + ' ₺');
      // 重新渲染 modal + HUD
      this._refreshHud();
      var self = this;
      setTimeout(function () {
        if (self.state === 'MODAL') self.openTradeCenter();
      }, 350);
    },

// ============== Modal: 单个商铺 (按 shopKey 打开) ==============
    openShopModal: function (shopKey) {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var loc = LOCATIONS.find(function (l) { return l.key === shopKey; }) || LOCATIONS[0];
      var items = SHOP_ITEMS[shopKey] || [];

      // Backdrop + card
      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      backdrop.setInteractive({ useHandCursor: true });
      this.modalContainer.add(backdrop);
      // 点 backdrop 关闭 (防止 backdrop 吞掉所有点击导致感觉 "卡住")
      backdrop.on('pointerdown', function () { self.closeModal(); });

      var cardW = 640, cardH = 480;
      var card = this.add.rectangle(0, 0, cardW, cardH, 0x2A1606, 1)
        .setStrokeStyle(2, loc.color || 0x4A90E2, 0.7);
      this.modalContainer.add(card);

      // 标题 + emoji
      this.modalContainer.add(this.add.text(0, -cardH / 2 + 32, loc.emoji + ' ' + loc.label, {
        fontSize: '24px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));

      // 余额显示 (右上)
      this._shopCoinsText = this.add.text(cardW / 2 - 24, -cardH / 2 + 32, '💰 ' + this.coins + ' ₺', {
        fontSize: '15px', color: '#D4AF37', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      this.modalContainer.add(this._shopCoinsText);

      // 副标题
      this.modalContainer.add(this.add.text(0, -cardH / 2 + 60, '用里拉 ₺ 购买热气球组装材料', {
        fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 商品列表
      var rowH = items.length > 1 ? 75 : 90;
      var startY = -(items.length * rowH) / 2 + rowH / 2 + 10;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var purchased = !!self.purchasedItems[it.id];
        var ry = startY + i * rowH;

        var rowBg = self.add.rectangle(0, ry, cardW - 60, rowH - 12,
          purchased ? 0x1F3D34 : 0x4A2E1A, purchased ? 0.85 : 0.95)
          .setStrokeStyle(2, purchased ? 0x5FB3A0 : 0x6B4423, 0.6);
        this.modalContainer.add(rowBg);

        var nameText = it.name + (it.desc ? '  (' + it.desc + ')' : '');
        this.modalContainer.add(self.add.text(-cardW / 2 + 40, ry, nameText, {
          fontSize: '14px', color: '#FFD98A', fontStyle: 'bold',
          wordWrap: { width: cardW - 220 },
        }).setOrigin(0, 0.5));

        this.modalContainer.add(self.add.text(cardW / 2 - 130, ry - 10, it.price + ' ₺', {
          fontSize: '16px', color: purchased ? '#5FB3A0' : '#E74C3C', fontStyle: 'bold',
        }).setOrigin(0.5));

        var btnBg = self.add.rectangle(cardW / 2 - 55, ry + 14, 85, 30,
          purchased ? 0x5FB3A0 : 0xD4AF37, purchased ? 0.7 : 1);
        this.modalContainer.add(btnBg);
        this.modalContainer.add(self.add.text(cardW / 2 - 55, ry + 14, purchased ? '✓ 已购' : '购买', {
          fontSize: '12px', color: purchased ? '#0E2A47' : '#2A190E', fontStyle: 'bold',
        }).setOrigin(0.5));

        if (!purchased) {
          (function (item) {
            var zone = self.add.zone(cardW / 2 - 55, ry + 14, 85, 30)
              .setInteractive({ useHandCursor: true });
            zone.on('pointerdown', function () {
              window.playTurkeySfx('click', 0.4);
              self.doBuyFromShop(item);
            });
            self.modalContainer.add(zone);
          })(it);
        }
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(0, cardH / 2 - 40, 200, 44, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, cardH / 2 - 40, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, cardH / 2 - 40, 200, 44).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },
    doBuyFromShop: function (item) {
      if (this.coins < item.price) {
        this.showToast('里拉不够！先回兑换中心换钱 💱', 0xE74C3C);
        window.playTurkeySfx('click', 0.3);
        return;
      }
      this.coins -= item.price;
      this.purchasedItems[item.id] = true;
      if (item.fabricId) this.fabric = item.fabricId;
      window.playTurkeySfx('exchange', 0.55);
      window.playTurkeySfx('pickup', 0.4);
      this.showToast('💰 -' + item.price + ' ₺  已购买 ' + item.name, 0x5FB3A0, 1100);
      this._refreshHud();
      if (this._shopCoinsText) this._shopCoinsText.setText('💰 ' + this.coins + ' ₺');
      // 重新渲染当前 modal
      var self = this;
      var shopKey = null;
      for (var k in SHOP_ITEMS) {
        if (SHOP_ITEMS[k].some(function (it) { return it.id === item.id; })) { shopKey = k; break; }
      }
      if (shopKey) {
        setTimeout(function () { self.openShopModal(shopKey); }, 200);
      }
    },
    // ============== Modal: 组装场检查 ==============
    openAssemblyCheck: function () {
      var self = this;
      if (this.state === 'MODAL') return;
      this.state = 'MODAL';
      this.modalContainer.removeAll(true);

      var loc = LOCATIONS.find(function (l) { return l.key === 'assembly'; });
      var allOk = this._hasAllMaterials();
      var missing = this._missingMaterials();

      var backdrop = this.add.rectangle(0, 0, 1280, 720, 0x140C06, 0.55);
      this.modalContainer.add(backdrop);

      var card = this.add.rectangle(0, 0, 600, 460, 0x2A1606, 1)
        .setStrokeStyle(2, loc.color, 0.7);
      this.modalContainer.add(card);

      this.modalContainer.add(this.add.text(0, -190, '🎈 热气球组装场', {
        fontSize: '26px', color: '#E74C3C', fontStyle: 'bold',
      }).setOrigin(0.5));
      this.modalContainer.add(this.add.text(0, -160, '卡帕多奇亚 · 起飞平台', {
        fontSize: '13px', color: '#C9B89A', fontStyle: 'italic',
      }).setOrigin(0.5));

      // 材料状态列表
      var statusY = -110;
      var rowH = 28;
      var purchasedGroups = [];
      for (var i = 0; i < REQUIRED.length; i++) {
        var r = REQUIRED[i];
        var done = false;
        if (r.group === 'fabric') {
          done = !!(this.purchasedItems.fabric_cotton ||
                    this.purchasedItems.fabric_nylon ||
                    this.purchasedItems.fabric_canvas);
        } else {
          done = !!this.purchasedItems[r.group];
        }
        purchasedGroups.push(done);
        var ry = statusY + i * rowH;
        var mark = done ? '✓' : '✗';
        var color = done ? '#5FB3A0' : '#E74C3C';
        this.modalContainer.add(this.add.text(-240, ry, mark, {
          fontSize: '16px', color: color, fontStyle: 'bold',
        }).setOrigin(0.5));
        this.modalContainer.add(this.add.text(-200, ry, r.label, {
          fontSize: '14px', color: done ? '#A8D8C0' : '#F4ECD8', fontStyle: 'bold',
        }).setOrigin(0, 0.5));
      }

      // 状态信息
      if (allOk) {
        this.modalContainer.add(this.add.text(0, 110, '✓ 所有材料已齐！', {
          fontSize: '16px', color: '#5FB3A0', fontStyle: 'bold',
        }).setOrigin(0.5));
        this.modalContainer.add(this.add.text(0, 140, '点击下方按钮进入组装流程', {
          fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0.5));
        var goBg = this.add.rectangle(0, 190, 280, 60, 0xE74C3C, 1)
          .setStrokeStyle(2, 0xC0392B);
        this.modalContainer.add(goBg);
        this.modalContainer.add(this.add.text(0, 190, '🎈 开始组装', {
          fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
        }).setOrigin(0.5));
        var goZone = this.add.zone(0, 190, 280, 60).setInteractive({ useHandCursor: true });
        goZone.on('pointerdown', function () {
          window.playTurkeySfx('button', 0.4);
          // 把 fabric 写入 registry, 给 AssembleScene 用
          self.registry.set('turkey_fabric', self.fabric);
          self.scene.start('AssembleScene');
        });
        this.modalContainer.add(goZone);
      } else {
        this.modalContainer.add(this.add.text(0, 110, '⚠️ 还差 ' + missing.length + ' 件材料', {
          fontSize: '15px', color: '#F6B5C8', fontStyle: 'bold',
        }).setOrigin(0.5));
        this.modalContainer.add(this.add.text(0, 140, '缺：' + missing.join(' · '), {
          fontSize: '11px', color: '#C9B89A', wordWrap: { width: 520 },
        }).setOrigin(0.5));
        this.modalContainer.add(this.add.text(0, 170, '返回去商铺买齐后再来', {
          fontSize: '12px', color: '#C9B89A', fontStyle: 'italic',
        }).setOrigin(0.5));
      }

      // 关闭按钮
      var closeBg = this.add.rectangle(0, 220, 200, 50, 0x6B4423, 1)
        .setStrokeStyle(2, 0xFFD98A, 0.7);
      this.modalContainer.add(closeBg);
      this.modalContainer.add(this.add.text(0, 220, '关闭', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5));
      var closeZone = this.add.zone(0, 220, 200, 50).setInteractive({ useHandCursor: true });
      closeZone.on('pointerdown', function () { self.closeModal(); });
      this.modalContainer.add(closeZone);

      this.modalContainer.setVisible(true);
    },

    // ============== 关闭 modal ==============
    closeModal: function () {
      this.modalContainer.setVisible(false);
      this.modalContainer.removeAll(true);
      this._coinModalText = null;
      this.state = 'PLAYING';
      this.joystickContainer.setVisible(true);
      this._refreshHud();
    },

    // ============== Toast ==============
    showToast: function (msg, color, duration) {
      if (this._toast) this._toast.destroy();
      if (duration == null) duration = 1200;
      var bgColor = (color === 0xE74C3C) ? 'rgba(231, 76, 60, 0.9)' : 'rgba(74, 46, 26, 0.9)';
      this._toast = this.add.text(CANVAS_W / 2, 540, msg, {
        fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: bgColor,
        padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setDepth(3000);
      var self = this;
      setTimeout(function () {
        if (self._toast) { self._toast.destroy(); self._toast = null; }
      }, duration);
    },
  });

  // ============== AssembleScene (6 步: 缝制 → 框架 → 吊篮 → 充气 → 点火 → 出发) ==============
  var AssembleScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function AssembleScene() { Phaser.Scene.call(this, { key: 'AssembleScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#FFD9A8');

      // 背景
      this.bgLayer = this.add.container(0, 0);
      this._drawBackground();

      // 顶部步骤指示条 (6 步)
      this._drawStepBar();

      // 内容 + 按钮层
      this.contentLayer = this.add.container(0, 0);
      this.btnLayer = this.add.container(0, 0);

      this.clickZones = [];
      this._timers = [];

      // 状态
      this.currentStep = 0;
      this.sewnPoints = 0;
      this.frameCount = 0;
      this.basketCount = 0;
      this.inflated = false;
      this.ignited = false;
      // 从 PlayScene registry 读 fabric
      this.fabric = this.registry.get('turkey_fabric') || 'nylon';

      this._renderStep();
    },

    // ---------- 背景 ----------
    _drawBackground: function () {
      var g = this.add.graphics();
      g.fillGradientStyle(0xFF9966, 0xFF9966, 0xFFD98A, 0xFFD98A, 1);
      g.fillRect(0, 0, CANVAS_W, CANVAS_H);
      g.fillStyle(0xFFE9B0, 1);
      g.fillCircle(960, 200, 60);
      g.fillStyle(0xFFF4D8, 0.4);
      g.fillCircle(960, 200, 90);
      g.fillStyle(0xC46A3C, 0.7);
      g.beginPath();
      g.moveTo(0, 480);
      g.lineTo(200, 420); g.lineTo(380, 460); g.lineTo(560, 410);
      g.lineTo(740, 450); g.lineTo(920, 415); g.lineTo(1100, 445);
      g.lineTo(1280, 425); g.lineTo(1280, 720); g.lineTo(0, 720);
      g.closePath(); g.fillPath();
      var chimneys = [
        { x: 120, y: 540, w: 80, h: 140, c: 0xC46A3C },
        { x: 320, y: 560, w: 100, h: 180, c: 0xB85A30 },
        { x: 620, y: 555, w: 120, h: 200, c: 0xA04A24 },
        { x: 920, y: 575, w: 90, h: 160, c: 0xB85A30 },
        { x: 1160, y: 555, w: 110, h: 190, c: 0xC46A3C },
      ];
      chimneys.forEach(function (ch) {
        g.fillStyle(ch.c, 1);
        g.fillRoundedRect(ch.x - ch.w / 2, ch.y - ch.h / 2, ch.w, ch.h, 12);
        g.fillStyle(0x8B4513, 1);
        g.fillRoundedRect(ch.x - ch.w / 2 - 4, ch.y - ch.h / 2 - 8, ch.w + 8, 16, 6);
        g.fillStyle(0x000000, 0.15);
        g.fillRoundedRect(ch.x + ch.w / 2 - 12, ch.y - ch.h / 2 + 8, 12, ch.h - 16, 4);
      });
      g.fillStyle(0x8B4513, 1);
      g.fillRect(0, 640, CANVAS_W, 80);
      this.bgLayer.add(g);
    },

    // ---------- 顶部步骤指示条 (6 步) ----------
    _drawStepBar: function () {
      var bar = this.add.graphics();
      bar.fillStyle(0x6B4423, 0.92);
      bar.fillRect(0, 0, CANVAS_W, 50);
      this.stepDots = [];
      var stepGap = CANVAS_W / 6;
      for (var i = 0; i < 6; i++) {
        var dot = this.add.circle(stepGap * i + stepGap / 2, 25, 12, 0xFFD98A, 1)
          .setStrokeStyle(2, 0x4A2E1A);
        var lbl = this.add.text(stepGap * i + stepGap / 2, 25, String(i + 1), {
          fontSize: '14px', color: '#4A2E1A', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.stepDots.push({ dot: dot, label: lbl });
      }
    },
    _updateStepBar: function () {
      for (var i = 0; i < 6; i++) {
        if (i < this.currentStep) {
          this.stepDots[i].dot.setFillStyle(0x5FB3A0, 1);
          this.stepDots[i].label.setColor('#FFFFFF');
        } else if (i === this.currentStep) {
          this.stepDots[i].dot.setFillStyle(0xFF6B6B, 1);
          this.stepDots[i].label.setColor('#FFFFFF');
        } else {
          this.stepDots[i].dot.setFillStyle(0xFFD98A, 1);
          this.stepDots[i].label.setColor('#4A2E1A');
        }
      }
    },

    // ---------- 标题 ----------
    _drawTitle: function () {
      var t = this.add.text(640, 80, STEPS[this.currentStep].title, {
        fontSize: '28px', color: '#4A2E1A', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 217, 138, 0.85)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);
      var s = this.add.text(640, 130, STEPS[this.currentStep].sub, {
        fontSize: '15px', color: '#6B4423', fontStyle: 'italic',
        backgroundColor: 'rgba(255, 244, 216, 0.8)',
        padding: { x: 12, y: 6 },
        wordWrap: { width: 900 },
      }).setOrigin(0.5);
      this.contentLayer.add([t, s]);
    },

    // ---------- 清空 ----------
    _clearContent: function () {
      this.contentLayer.removeAll(true);
      this.btnLayer.removeAll(true);
      for (var i = 0; i < this.clickZones.length; i++) {
        if (this.clickZones[i] && this.clickZones[i].destroy) this.clickZones[i].destroy();
      }
      this.clickZones = [];
      for (var t = 0; t < this._timers.length; t++) {
        var handle = this._timers[t];
        if (handle.type === 'interval') clearInterval(handle.id);
        else clearTimeout(handle.id);
      }
      this._timers = [];
      this._inflateTween = null;
    },

    // ---------- 原生 timer 包装 ----------
    _delay: function (ms, fn) {
      var self = this;
      var id = setTimeout(function () {
        var idx = self._timers.findIndex(function (t) { return t.id === id; });
        if (idx >= 0) self._timers.splice(idx, 1);
        fn();
      }, ms);
      this._timers.push({ id: id, type: 'timeout' });
      return id;
    },
    _interval: function (ms, fn) {
      var id = setInterval(fn, ms);
      this._timers.push({ id: id, type: 'interval' });
      return id;
    },

    _addClickZone: function (x, y, w, h) {
      var z = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
      this.clickZones.push(z);
      return z;
    },

    // ---------- 主入口 ----------
    _renderStep: function () {
      this._clearContent();
      this._updateStepBar();
      this._drawTitle();
      switch (this.currentStep) {
        case 0: this._renderSew();      break;
        case 1: this._renderFrame();    break;
        case 2: this._renderBasket();   break;
        case 3: this._renderInflate();  break;
        case 4: this._renderIgnite();   break;
        case 5: this._renderDepart();   break;
      }
    },

    _drawBottomButton: function (label, onClick, primary) {
      primary = primary !== false;
      var bg = this.add.rectangle(640, 660, 360, 64,
        primary ? 0xE74C3C : 0xFFD98A, 1).setStrokeStyle(2, primary ? 0xC0392B : 0x6B4423);
      var txt = this.add.text(640, 660, label, {
        fontSize: '22px',
        color: primary ? '#FFFFFF' : '#4A2E1A',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      var zone = this.add.zone(640, 660, 360, 64).setInteractive({ useHandCursor: true });
      this.clickZones.push(zone);
      var self = this;
      zone.on('pointerdown', function () {
        window.playTurkeySfx('button', 0.4);
        onClick();
      });
      this.btnLayer.add([bg, txt]);
    },

    _flashHint: function (msg, color) {
      if (this._hintText) this._hintText.destroy();
      this._hintText = this.add.text(640, 540, msg, {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: color === 0xE74C3C ? 'rgba(231, 76, 60, 0.9)' : 'rgba(74, 46, 26, 0.9)',
        padding: { x: 14, y: 6 },
      }).setOrigin(0.5);
      this.contentLayer.add(this._hintText);
      var self = this;
      this._delay(1200, function () {
        if (self._hintText) { self._hintText.destroy(); self._hintText = null; }
      });
    },

    // ---------- 步骤 0: 缝制 ----------
    _renderSew: function () {
      var self = this;
      this.sewnPoints = 0;
      this.sewnGraphics = this.add.graphics();
      this.contentLayer.add(this.sewnGraphics);

      var centerX = 640, centerY = 400, radius = 130;
      var outline = this.add.graphics();
      outline.lineStyle(4, 0x6B4423, 1);
      outline.beginPath();
      outline.arc(centerX, centerY, radius, -Math.PI / 2, Math.PI / 2, false);
      outline.strokePath();
      for (var d = 0; d < 30; d++) {
        var ang = Math.PI / 2 + (d / 30) * Math.PI;
        var x1 = centerX + Math.cos(ang) * radius;
        var y1 = centerY + Math.sin(ang) * radius;
        if (d % 2 === 0) {
          outline.fillStyle(0x6B4423, 1);
          outline.fillCircle(x1, y1, 2);
        }
      }
      outline.lineStyle(3, 0x6B4423, 1);
      outline.lineBetween(centerX - 20, centerY - radius, centerX + 20, centerY - radius);
      outline.lineBetween(centerX - 30, centerY + radius, centerX + 30, centerY + radius);
      this.contentLayer.add(outline);

      this.stitchMarkers = [];
      var pts = [];
      for (var i = 0; i < STITCH_POINTS.length; i++) {
        var sp = STITCH_POINTS[i];
        var px = centerX + sp.x;
        var py = centerY + sp.y;
        pts.push({ x: px, y: py });
        var dot = this.add.circle(px, py, 14, 0xFFD98A, 1).setStrokeStyle(3, 0xE74C3C);
        var numLbl = this.add.text(px, py, String(i + 1), {
          fontSize: '16px', color: '#4A2E1A', fontStyle: 'bold',
        }).setOrigin(0.5);
        this.stitchMarkers.push({ dot: dot, label: numLbl, x: px, y: py, clicked: false });
        this.contentLayer.add([dot, numLbl]);
      }
      this.stitchPts = pts;

      this._sewHint = this.add.text(940, 360, '依次点击\n1 → 2 → 3\n→ 4 → 5 → 6', {
        fontSize: '15px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(74, 46, 26, 0.9)',
        padding: { x: 12, y: 8 },
        align: 'center',
      }).setOrigin(0.5);
      this.contentLayer.add(this._sewHint);

      this.stitchMarkers.forEach(function (m, idx) {
        var zone = self.add.zone(m.x, m.y, 36, 36).setInteractive({ useHandCursor: true });
        self.clickZones.push(zone);
        zone.on('pointerdown', function () {
          if (m.clicked) return;
          if (self.sewnPoints !== idx) {
            window.playTurkeySfx('click', 0.3);
            self._flashHint('请按顺序点击！', 0xE74C3C);
            return;
          }
          m.clicked = true;
          m.dot.setFillStyle(0x5FB3A0, 1);
          m.label.setColor('#FFFFFF');
          window.playTurkeySfx('pickup', 0.4);
          self.sewnPoints++;
          self.sewnGraphics.lineStyle(4, 0x6B4423, 1);
          if (self.sewnPoints === 1) {
            self.sewnGraphics.lineBetween(centerX + 0, centerY - radius + 0, m.x, m.y);
          } else if (self.sewnPoints < 6) {
            var prev = self.stitchMarkers[idx - 1];
            self.sewnGraphics.lineBetween(prev.x, prev.y, m.x, m.y);
          } else {
            self.sewnGraphics.lineBetween(m.x, m.y, centerX + 0, centerY + radius + 0);
          }
          if (self.sewnPoints === 6) {
            self._sewHint.setText('✓ 球囊缝制完成');
            self._sewHint.setBackgroundColor('rgba(95, 179, 160, 0.95)');
            window.playTurkeySfx('exchange', 0.5);
            self._delay(1200, function () {
              self.currentStep = 1;
              self._renderStep();
            });
          }
        });
      });
    },

    // ---------- 步骤 1: 框架 ----------
    _renderFrame: function () {
      var self = this;
      this.frameCount = 0;
      var centerX = 640, centerY = 380, radius = 130;
      var frameG = this.add.graphics();
      frameG.lineStyle(3, 0x8B4513, 1);
      frameG.strokeCircle(centerX, centerY, radius);
      frameG.lineStyle(1, 0xC49A5E, 0.5);
      for (var i = 0; i < 4; i++) {
        var ang = (i / 4) * Math.PI * 2 - Math.PI / 2;
        frameG.lineBetween(centerX, centerY,
          centerX + Math.cos(ang) * radius, centerY + Math.sin(ang) * radius);
      }
      this.contentLayer.add(frameG);

      this.bambooStrips = [];
      var angles = [0, Math.PI * 2 / 3, Math.PI * 4 / 3];
      angles.forEach(function (a, idx) {
        var startX = centerX + Math.cos(a - Math.PI / 2) * 240;
        var startY = centerY + Math.sin(a - Math.PI / 2) * 240 + 200;
        var endX = centerX + Math.cos(a - Math.PI / 2) * radius;
        var endY = centerY + Math.sin(a - Math.PI / 2) * radius;
        var strip = self.add.graphics();
        strip.lineStyle(6, 0xD4A86A, 1);
        strip.lineBetween(startX, startY, startX + 30, startY + 30);
        self.contentLayer.add(strip);
        self.bambooStrips.push({ graphics: strip, startX: startX, startY: startY, endX: endX, endY: endY, installed: false });
      });

      this._frameHint = this.add.text(640, 580, '点击 3 根竹条依次安装到框架', {
        fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(74, 46, 26, 0.85)',
        padding: { x: 16, y: 6 },
      }).setOrigin(0.5);
      this.contentLayer.add(this._frameHint);

      this._frameProgressBg = this.add.rectangle(640, 620, 300, 16, 0xFFFFFF, 0.6).setStrokeStyle(2, 0x4A2E1A);
      this._frameProgressFill = this.add.rectangle(490, 620, 0, 12, 0x5FB3A0, 1);
      this.contentLayer.add([this._frameProgressBg, this._frameProgressFill]);

      this.bambooStrips.forEach(function (b, idx) {
        var zone = self.add.zone(b.startX + 15, b.startY + 15, 60, 60).setInteractive({ useHandCursor: true });
        self.clickZones.push(zone);
        zone.on('pointerdown', function () {
          if (b.installed) return;
          b.installed = true;
          window.playTurkeySfx('pickup', 0.4);
          self.tweens.add({
            targets: b.graphics,
            x: b.endX - b.startX,
            y: b.endY - b.startY,
            duration: 400,
            ease: 'Cubic.easeOut',
          });
          self.frameCount++;
          self._frameProgressFill.width = (self.frameCount / 3) * 296;
          if (self.frameCount === 3) {
            self._frameHint.setText('✓ 框架组装完成');
            self._frameHint.setBackgroundColor('rgba(95, 179, 160, 0.95)');
            window.playTurkeySfx('exchange', 0.5);
            self._delay(1200, function () {
              self.currentStep = 2;
              self._renderStep();
            });
          }
        });
      });
    },

    // ---------- 步骤 2: 安装吊篮 ----------
    _renderBasket: function () {
      var self = this;
      this.basketCount = 0;
      var centerX = 640, centerY = 380;
      var bg = this.add.graphics();
      var fc = FABRIC_COLORS[this.fabric] || FABRIC_COLORS.nylon;
      bg.fillStyle(fc.main, 1);
      bg.fillCircle(centerX, centerY - 50, 100);
      bg.fillStyle(fc.stripe, 1);
      for (var s = 0; s < 6; s++) {
        bg.fillRect(centerX - 100, centerY - 150 + s * 33, 200, 4);
      }
      bg.lineStyle(2, 0x8B4513, 1);
      bg.strokeCircle(centerX, centerY - 50, 100);
      this.contentLayer.add(bg);

      var basketY = centerY + 130;
      var basketG = this.add.graphics();
      basketG.fillStyle(0x8B4513, 1);
      basketG.fillRoundedRect(centerX - 50, basketY - 20, 100, 40, 4);
      basketG.fillStyle(0x6B4423, 1);
      basketG.fillRect(centerX - 50, basketY - 20, 100, 4);
      this.contentLayer.add(basketG);

      var ropePositions = [
        { x: centerX - 40, y: basketY - 20 },
        { x: centerX,      y: basketY - 20 },
        { x: centerX + 40, y: basketY - 20 },
      ];
      var ropes = this.add.graphics();
      ropes.lineStyle(3, 0xC49A5E, 0.6);
      ropePositions.forEach(function (rp) {
        ropes.lineBetween(centerX, centerY + 50, rp.x, rp.y);
      });
      this.contentLayer.add(ropes);

      this.basketPoints = [];
      ropePositions.forEach(function (rp, idx) {
        var screw = self.add.graphics();
        screw.fillStyle(0xC49A5E, 1);
        screw.fillCircle(rp.x, rp.y, 12);
        screw.fillStyle(0x6B4423, 1);
        screw.fillCircle(rp.x, rp.y, 4);
        self.contentLayer.add(screw);
        self.basketPoints.push({ x: rp.x, y: rp.y, screw: screw, fixed: false });

        var zone = self.add.zone(rp.x, rp.y, 36, 36).setInteractive({ useHandCursor: true });
        self.clickZones.push(zone);
        zone.on('pointerdown', function () {
          if (self.basketPoints[idx].fixed) return;
          self.basketPoints[idx].fixed = true;
          window.playTurkeySfx('pickup', 0.5);
          screw.clear();
          screw.fillStyle(0xF1C40F, 1);
          screw.fillCircle(rp.x, rp.y, 12);
          screw.fillStyle(0x8B4513, 1);
          screw.fillCircle(rp.x, rp.y, 4);
          ropes.lineStyle(3, 0x6B4423, 1);
          ropes.lineBetween(centerX, centerY + 50, rp.x, rp.y);
          self.basketCount++;
          if (self.basketCount === 3) {
            window.playTurkeySfx('exchange', 0.5);
            self._flashHint('✓ 吊篮安装完成', 0x5FB3A0);
            self._delay(1200, function () {
              self.currentStep = 3;
              self._renderStep();
            });
          }
        });
      });

      this._basketHint = this.add.text(640, 580, '点击 3 个螺丝固定吊篮', {
        fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(74, 46, 26, 0.85)',
        padding: { x: 16, y: 6 },
      }).setOrigin(0.5);
      this.contentLayer.add(this._basketHint);
    },

    // ---------- 步骤 3: 充气 ----------
    _renderInflate: function () {
      var self = this;
      var centerX = 640, centerY = 380;
      var bg = this.add.graphics();
      var fc = FABRIC_COLORS[this.fabric] || FABRIC_COLORS.nylon;
      bg.fillStyle(fc.main, 1);
      bg.fillCircle(centerX, centerY - 50, 60);
      bg.fillStyle(fc.stripe, 1);
      for (var s = 0; s < 4; s++) {
        bg.fillRect(centerX - 60, centerY - 110 + s * 30, 120, 4);
      }
      bg.fillStyle(0x8B4513, 1);
      bg.fillRoundedRect(centerX - 40, centerY + 50, 80, 30, 4);
      this._balloonGraphics = bg;
      this.contentLayer.add(bg);

      var blowerX = 250, blowerY = 480;
      var blower = this.add.graphics();
      blower.fillStyle(0x4A2E1A, 1);
      blower.fillRoundedRect(blowerX - 60, blowerY - 30, 120, 60, 8);
      blower.fillStyle(0x6B4423, 1);
      blower.fillRoundedRect(blowerX - 50, blowerY - 22, 100, 44, 4);
      blower.fillStyle(0x2A190E, 1);
      blower.fillCircle(blowerX + 60, blowerY, 18);
      this.contentLayer.add(blower);
      this.add.text(blowerX, blowerY, '💨 鼓风机', {
        fontSize: '18px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      var btnZone = this.add.zone(blowerX, blowerY, 120, 60).setInteractive({ useHandCursor: true });
      this.clickZones.push(btnZone);
      this._inflateProgress = 0;
      this._inflateStart = 0;
      this._inflateActive = false;
      this._inflateDone = false;

      var resetBlowerColor = function () {
        blower.clear();
        blower.fillStyle(0x4A2E1A, 1);
        blower.fillRoundedRect(blowerX - 60, blowerY - 30, 120, 60, 8);
        blower.fillStyle(0x6B4423, 1);
        blower.fillRoundedRect(blowerX - 50, blowerY - 22, 100, 44, 4);
        blower.fillStyle(0x2A190E, 1);
        blower.fillCircle(blowerX + 60, blowerY, 18);
      };
      var stopInflate = function () {
        self._inflateActive = false;
        resetBlowerColor();
      };
      btnZone.on('pointerdown', function () {
        if (self._inflateDone) return;
        window.playTurkeySfx('click', 0.3);
        blower.clear();
        blower.fillStyle(0xE74C3C, 1);
        blower.fillRoundedRect(blowerX - 60, blowerY - 30, 120, 60, 8);
        blower.fillStyle(0xF39C12, 1);
        blower.fillRoundedRect(blowerX - 50, blowerY - 22, 100, 44, 4);
        blower.fillStyle(0xFFE9B0, 1);
        blower.fillCircle(blowerX + 60, blowerY, 22);
        self._inflateActive = true;
        self._inflateStart = Date.now();
        self._inflateTick = self._interval(16, function () {
          if (!self._inflateActive) return;
          var elapsed = Date.now() - self._inflateStart;
          var ratio = Math.min(1, elapsed / 2000);
          var v = 0.5 + ratio * 0.5;
          self._redrawBalloon(centerX, centerY, v);
          if (self._inflatePct && self._inflatePct.active) {
            self._inflatePct.setText('充气进度: ' + Math.floor(ratio * 100) + '%');
          }
          if (ratio >= 1) {
            stopInflate();
            if (self._inflateTick) { clearInterval(self._inflateTick); self._inflateTick = null; }
            self._inflateDone = true;
            self._redrawBalloon(centerX, centerY, 1.0);
            window.playTurkeySfx('exchange', 0.5);
            self._flashHint('✓ 充气完成', 0x5FB3A0);
            self._delay(1200, function () {
              self.currentStep = 4;
              self._renderStep();
            });
          }
        });
      });
      btnZone.on('pointerup', function () {
        if (self._inflateDone) return;
        stopInflate();
      });
      btnZone.on('pointerout', function () {
        if (self._inflateDone) return;
        stopInflate();
      });

      this._inflateHint = this.add.text(640, 580, '长按鼓风机 2 秒 (按住不放)', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(74, 46, 26, 0.9)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);
      this.contentLayer.add(this._inflateHint);
      this._inflatePct = this.add.text(640, 540, '充气进度: 0%', {
        fontSize: '16px', color: '#4A2E1A', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 217, 138, 0.9)',
        padding: { x: 12, y: 4 },
      }).setOrigin(0.5);
      this.contentLayer.add(this._inflatePct);
    },

    _redrawBalloon: function (cx, cy, scale) {
      var g = this._balloonGraphics;
      if (!g) return;
      g.clear();
      var r = 60 * (scale / 0.5);
      var fc = FABRIC_COLORS[this.fabric] || FABRIC_COLORS.nylon;
      g.fillStyle(fc.main, 1);
      g.fillCircle(cx, cy - 50, r);
      g.fillStyle(fc.stripe, 1);
      var stripes = Math.floor(4 + (scale - 0.5) * 8);
      for (var s = 0; s < stripes; s++) {
        g.fillRect(cx - r, cy - 50 - r + (s * (r * 2 / stripes)), r * 2, 4);
      }
      g.fillStyle(0x8B4513, 1);
      g.fillRoundedRect(cx - 40, cy + 50, 80, 30, 4);
    },

    // ---------- 步骤 4: 点火 ----------
    _renderIgnite: function () {
      var self = this;
      var centerX = 640, centerY = 380;
      var bg = this.add.graphics();
      var fc = FABRIC_COLORS[this.fabric] || FABRIC_COLORS.nylon;
      bg.fillStyle(fc.main, 1);
      bg.fillCircle(centerX, centerY - 60, 120);
      bg.fillStyle(fc.stripe, 1);
      for (var s = 0; s < 8; s++) {
        bg.fillRect(centerX - 120, centerY - 180 + s * 30, 240, 4);
      }
      bg.fillStyle(0x8B4513, 1);
      bg.fillRoundedRect(centerX - 40, centerY + 40, 80, 30, 4);
      this.contentLayer.add(bg);

      var burnerX = centerX, burnerY = centerY + 20;
      var burner = this.add.graphics();
      burner.fillStyle(0x4A2E1A, 1);
      burner.fillRect(burnerX - 20, burnerY - 8, 40, 16);
      burner.fillStyle(0x6B4423, 1);
      burner.fillRect(burnerX - 15, burnerY - 6, 30, 4);
      this.contentLayer.add(burner);

      this._flameGfx = this.add.graphics();
      this._flameGfx.setVisible(false);
      this.contentLayer.add(this._flameGfx);

      var lighterX = 950, lighterY = 500;
      var lighter = this.add.graphics();
      lighter.fillStyle(0xC49A5E, 1);
      lighter.fillRoundedRect(lighterX - 25, lighterY - 40, 50, 80, 6);
      lighter.fillStyle(0x8B4513, 1);
      lighter.fillRect(lighterX - 8, lighterY - 60, 16, 25);
      lighter.fillStyle(0x2A190E, 1);
      lighter.fillCircle(lighterX, lighterY - 60, 6);
      this.contentLayer.add(lighter);
      this.add.text(lighterX, lighterY, '🔥 打火机', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      var lighterZone = this.add.zone(lighterX, lighterY, 60, 90).setInteractive({ useHandCursor: true });
      this.clickZones.push(lighterZone);
      this._flameFrame = 0;
      this._flameOn = false;

      lighterZone.on('pointerdown', function () {
        if (self._flameOn) return;
        self._flameOn = true;
        window.playTurkeySfx('pickup', 0.4);
        self._flameGfx.setVisible(true);
        self._flameTimer = self._interval(150, function () {
          self._flameFrame = (self._flameFrame + 1) % 2;
          self._drawFlame(burnerX, burnerY - 20);
        });
        self._delay(1500, function () {
          if (self._flameTimer) {
            clearInterval(self._flameTimer);
            self._flameTimer = null;
          }
          window.playTurkeySfx('exchange', 0.5);
          self._flashHint('🔥 热气球准备就绪！', 0x5FB3A0);
          self._delay(1200, function () {
            self.currentStep = 5;
            self._renderStep();
          });
        });
      });
      this.contentLayer.add(lighterZone);

      this.add.text(640, 580, '点击打火机点燃燃烧器', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(74, 46, 26, 0.9)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);
    },

    _drawFlame: function (x, y) {
      var g = this._flameGfx;
      if (!g) return;
      g.clear();
      g.fillStyle(0xF39C12, 1);
      g.fillTriangle(x - 14, y, x + 14, y, x, y - 36);
      g.fillStyle(0xF1C40F, 1);
      g.fillTriangle(x - 8, y, x + 8, y, x, y - 24);
      g.fillStyle(this._flameFrame === 0 ? 0xFFFFFF : 0x85C1E9, 1);
      g.fillTriangle(x - 3, y, x + 3, y, x, y - 12);
    },

    // ---------- 步骤 5: 出发 ----------
    _renderDepart: function () {
      var self = this;
      var centerX = 640, centerY = 360;
      var g = this.add.graphics();
      var fc = FABRIC_COLORS[this.fabric] || FABRIC_COLORS.nylon;
      g.fillStyle(fc.main, 1);
      g.fillCircle(centerX, centerY - 80, 140);
      g.fillStyle(fc.stripe, 1);
      for (var s = 0; s < 10; s++) {
        g.fillRect(centerX - 140, centerY - 220 + s * 28, 280, 4);
      }
      g.fillStyle(0xF39C12, 1);
      g.fillTriangle(centerX - 20, centerY + 50, centerX + 20, centerY + 50, centerX, centerY + 10);
      g.fillStyle(0xF1C40F, 1);
      g.fillTriangle(centerX - 12, centerY + 50, centerX + 12, centerY + 50, centerX, centerY + 20);
      g.fillStyle(0x8B4513, 1);
      g.fillRoundedRect(centerX - 50, centerY + 50, 100, 50, 6);
      g.fillStyle(0x6B4423, 1);
      g.fillRect(centerX - 50, centerY + 50, 100, 4);
      g.lineStyle(3, 0x6B4423, 1);
      g.lineBetween(centerX - 40, centerY + 50, centerX - 30, centerY);
      g.lineBetween(centerX + 40, centerY + 50, centerX + 30, centerY);
      g.lineBetween(centerX, centerY + 50, centerX, centerY);
      var balloonContainer = this.add.container(0, 0, [g]);
      this.tweens.add({
        targets: balloonContainer,
        y: 6,
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.contentLayer.add(balloonContainer);

      var bg = this.add.rectangle(640, 660, 480, 76, 0xE74C3C, 1).setStrokeStyle(3, 0xC0392B);
      var txt = this.add.text(640, 660, '🎈 乘坐热气球出发', {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      var zone = this.add.zone(640, 660, 480, 76).setInteractive({ useHandCursor: true });
      this.clickZones.push(zone);
      zone.on('pointerdown', function () {
        window.playTurkeySfx('voyage', 0.6);
        // 通关: 写入 cleared_levels
        try {
          var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
          if (cleared.indexOf(2) === -1) {
            cleared.push(2);
            localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
          }
        } catch (e) {}
        self.scene.start('FlightScene');
      });
      this.btnLayer.add([bg, txt]);
    },
  });

  // ============== FlightScene ==============
  var FlightScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function FlightScene() { Phaser.Scene.call(this, { key: 'FlightScene' }); },
    create: function () {
      var self = this;
      this.cameras.main.setBackgroundColor('#FF9966');
      var sky = this.add.graphics();
      sky.fillGradientStyle(0xFFE9B0, 0xFFE9B0, 0x85C1E9, 0x5DADE2, 1);
      sky.fillRect(0, 0, CANVAS_W, CANVAS_H);
      sky.fillStyle(0xFFF4D8, 1);
      sky.fillCircle(1100, 120, 50);
      sky.fillStyle(0xFFE9B0, 0.5);
      sky.fillCircle(1100, 120, 80);
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

      // 地面 (会从沙漠渐变到草原)
      var ground = this.add.graphics();
      var drawGround = function (progress) {
        // progress: 0 = 沙漠 (brown/sandy), 1 = 草原 (green)
        ground.clear();
        // 沙土基底 (lerp 棕色→绿色)
        var r = Math.round(0x8B + (0x6B - 0x8B) * progress);
        var gr = Math.round(0x45 + (0x8E - 0x45) * progress);
        var b = Math.round(0x13 + (0x23 - 0x13) * progress);
        var groundColor = (r << 16) | (gr << 8) | b;
        ground.fillStyle(groundColor, 1);
        ground.fillRect(0, 600, CANVAS_W, 200);
        // 山丘轮廓 (同样 lerp)
        var hr = Math.round(0xC4 + (0x55 - 0xC4) * progress);
        var hg = Math.round(0x6A + (0x8E - 0x6A) * progress);
        var hb = Math.round(0x3C + (0x23 - 0x3C) * progress);
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

      // 热气球 sprite
      var fabricChoice = this.registry.get('turkey_fabric') || 'nylon';
      var fabricColor = fabricChoice === 'cotton' ? 0xE8DCC4 : (fabricChoice === 'canvas' ? 0xD4B58A : 0xF5E6C8);
      var stripeColor = fabricChoice === 'cotton' ? 0xC4B594 : (fabricChoice === 'canvas' ? 0x8B6F47 : 0xD4A86A);
      var balloonG = this.add.graphics();
      var drawBalloon = function (x, y) {
        balloonG.clear();
        balloonG.fillStyle(fabricColor, 1);
        balloonG.fillCircle(x, y - 80, 100);
        balloonG.fillStyle(stripeColor, 1);
        for (var s = 0; s < 8; s++) {
          balloonG.fillRect(x - 100, y - 180 + s * 25, 200, 3);
        }
        balloonG.fillStyle(0xF39C12, 1);
        balloonG.fillTriangle(x - 14, y + 30, x + 14, y + 30, x, y);
        balloonG.fillStyle(0xF1C40F, 1);
        balloonG.fillTriangle(x - 8, y + 30, x + 8, y + 30, x, y + 10);
        balloonG.fillStyle(0x8B4513, 1);
        balloonG.fillRoundedRect(x - 35, y + 30, 70, 40, 4);
        balloonG.fillStyle(0x6B4423, 1);
        balloonG.fillRect(x - 35, y + 30, 70, 3);
        balloonG.lineStyle(2, 0x6B4423, 1);
        balloonG.lineBetween(x - 28, y + 30, x - 22, y - 10);
        balloonG.lineBetween(x + 28, y + 30, x + 22, y - 10);
        balloonG.lineBetween(x, y + 30, x, y - 10);
      };
      // 起始位置: 左下角
      drawBalloon(100, 650);

      // 标题 + 进度提示
      this._flightTitle = this.add.text(640, 80, '✈️ 飞越安纳托利亚高原 → 哈萨克草原...', {
        fontSize: '22px', color: '#4A2E1A', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 217, 138, 0.85)',
        padding: { x: 16, y: 8 },
      }).setOrigin(0.5);

      // 三阶段动画:
      //   阶段 1 (0-2s): 上升 (100, 650) → (100, 150)
      //   阶段 2 (2-5s): 横向飞行 (100, 150) → (1100, 150)
      //   阶段 3 (5-7s): 下降 (1100, 150) → (1200, 500)
      //   背景颜色: 沙漠(0x8B4513) → 草原(0x6B8E23), 跟随飞行进度
      var phase1Dur = 2000;
      var phase2Dur = 3000;
      var phase3Dur = 2000;
      var startX = 100, startY = 650;
      var peakX = 100, peakY = 150;
      var farX = 1100, farY = 150;
      var endX = 1200, endY = 500;
      var startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      this._flightDone = false;
      this._flightTick = setInterval(function () {
        if (self._flightDone) return;
        var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        var elapsed = now - startTime;
        var totalDur = phase1Dur + phase2Dur + phase3Dur;
        if (elapsed > totalDur + 500) elapsed = totalDur;

        var curX, curY, bgProg;
        if (elapsed < phase1Dur) {
          // 阶段 1: 上升 (left-bottom → 150)
          var t1 = elapsed / phase1Dur;
          var e1 = 1 - Math.pow(1 - t1, 2);
          curX = startX + (peakX - startX) * e1;
          curY = startY - (startY - peakY) * e1;
          bgProg = t1 * 0.3;
        } else if (elapsed < phase1Dur + phase2Dur) {
          // 阶段 2: 横向飞行 (top-left → top-right)
          var t2 = (elapsed - phase1Dur) / phase2Dur;
          var e2 = 1 - Math.pow(1 - t2, 2);
          curX = peakX + (farX - peakX) * e2;
          curY = peakY + (farY - peakY) * e2;
          bgProg = 0.3 + t2 * 0.5;
        } else {
          // 阶段 3: 下降 (→ 哈萨克草原)
          var t3 = (elapsed - phase1Dur - phase2Dur) / phase3Dur;
          var e3 = 1 - Math.pow(1 - t3, 2);
          curX = farX + (endX - farX) * e3;
          curY = farY + (endY - farY) * e3;
          bgProg = 0.8 + t3 * 0.2;
        }
        drawBalloon(curX, curY);
        drawGround(bgProg);

        if (elapsed >= totalDur) {
          self._flightDone = true;
          clearInterval(self._flightTick);
          self._flightTick = null;
          if (self._flightTitle) self._flightTitle.setText('🇰🇿 抵达哈萨克草原');
          window.playTurkeySfx('voyage', 0.5);
          setTimeout(function () {
            try { window.location.href = '/games/silk-road/level/3'; }
            catch (e) { window.location.reload(); }
          }, 500);
        }
      }, 16);
    },
  });

  // ============== Game 初始化 ==============
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startGame);
  } else {
    startGame();
  }

  function startGame() {
    var config = {
      type: Phaser.AUTO,
      parent: 'game-container',
      width: CANVAS_W,
      height: CANVAS_H,
      backgroundColor: '#2A1606',
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [BootScene, PlayScene, AssembleScene, FlightScene],
    };
    try {
      var game = new Phaser.Game(config);
      window.__turkeyGame = game;
      console.log('[turkey-m27] Phaser game initialized, scenes:', game.scene.scenes.map(function (s) { return s.scene.key; }));
    } catch (e) {
      console.error('[turkey-m27] Phaser init failed:', e);
    }
  }
})();