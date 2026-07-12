// 新疆·天山滑雪 —— 关卡 4 游戏引擎
//
// v8 (2026-07-12) — 5 个 bug 修复
//   Bug 1: 单板滑雪 — 用 Phaser Graphics 自绘单板 (深蓝 #1976D2, 高光 #42A5F5, 尖端上翘)
//          替换 emoji 🎿, 跨平台一致, avatar 踩在板面上 (avatar.y=-8, board.y=12)
//   Bug 2: 玩家 y 移到中上 (playerScreenY 480 → 320), 720 高画面的 1/3 位置
//   Bug 3: 4 个 DOM 方向键 → 田字格紧凑布局 (全部聚拢屏幕左下角), 统一新疆蓝色系
//          整体包裹在 wrapper (left:20, bottom:20, 164×164) 里
//          ▲ top:0 left:42, ▼ bottom:0 left:42, ◀ top:42 left:0, ▶ top:42 left:84
//   Bug 4: 物品从屏幕底部出生 (y=CANVAS_H+80) + 向上移动 (y -= scrollSpeed * dt)
//          跟背景方向一致, 像"地面从脚下往身后流过"
//   Bug 5: 终点小屋 x=1240 右下角 (CANVAS_W-40) + 路径三角形斜向左下引导
//
// v7 (2026-07-12) — 真正修复背景方向 bug + 4 按钮 viewport 相对坐标
//   - v6 改错了: 只把 offset 改成 -= 反向累加, 但 draw 里仍是 `y = baseY + modOff`
//     结果: offset=-33.44 → modOff=686.56 (正数!) → y = baseY + 686 = 屏幕底部 (反了!)
//   - v7 正解:
//     1. offset 累加保持正向 (+=) → modOff 0→719
//     2. draw 公式改成 `y = baseY - modOff` → modOff 增加 → y 减小 → 元素上移
//     3. 效果: 远/中/近层元素向上飞 = 真正的滑雪感
//   - v6 4 按钮在真机看不到, v7 改用 viewport 相对坐标 (不依赖 canvas rect)
//     ◀ position fixed left:20px bottom:80px
//     ▶ position fixed right:20px bottom:80px
//     ▲ position fixed left:calc(50% - 160px) top:80px
//     ▼ position fixed right:calc(50% - 160px) top:80px
//     z-index 99999 → 2147483647 (int32 max, 永远置顶)
//     pointer-events:auto + touch-action:none (iOS Safari 必加)
//
// v6 (2026-07-12) — 修复视差方向 + 按钮缩小 (v7 才发现改错了)
// v5 (2026-07-12) — 4 按钮大小统一
//   - 用户反馈"上下左右, 四个按键大小一样"
//   - 4 个按钮统一为 120×120, 布局 C (左右在屏幕底部, 上下在玩家头顶上方)
//   - 上下按钮 y=380 (玩家 y=480 上方 100px), 左右按钮 y=620 (屏幕底部)
//   - 4 个按钮完全不重叠 (240px 间距), 颜色仍区分功能
//
// v4 (2026-07-12) — 视觉效果第二轮调优 + 屏幕 DOM 方向键 + 终点小屋
//   - 视差比例加大 (0.4 / 0.7 / 1.2, 让"地图往上走"更明显)
//   - 玩家位置移到屏幕中下 (y=480, 原来 240 = 屏幕 1/3)
//   - 屏幕 DOM 方向键: ← → ▲ ▼ (真机可触屏, 不依赖键盘)
//   - 上下按钮手动加速/减速: ▼ +60, ▲ -60, max(0, ...) 保证不能往上走
//   - biome 切换时 scroll offset 重置 (避免视差错位)
//   - biome 4 草原延长 1100 → 1500, 终点出现"成都小屋"拱门
//   - 通关前 200px 提示 "🏠 即将到家! 滑进去"
//
// v3 (2026-07-12) — biome 系统重构 + 5 种新疆主题奖品 + 45s 沉浸时长
//
// 流程: 哈萨克斯坦 → 进入新疆 (本场景) → 一路下滑到成都
//   BootScene → SlidingScene (4 段 biome + 5 种奖品) → DepartScene → /level/5
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (DOM 方向键 + 触屏, 不依赖 Phaser zone)
//
// biome 系统 (4 段, 共 ~5400 px 滚动):
//   1. 🏔️ 雪山顶   (缓坡 0.3→0.5,  1200 px)
//   2. 🌲 针叶林   (中坡 0.5→1.0,  1400 px)
//   3. ❄️ 冰川     (陡坡 1.0→1.5,  1300 px)
//   4. 🌾 山脚草原 (平缓 0.3→0.6,  1500 px — 含屋前 600 + 屋门 900)
//
// 5 种奖品:
//   🍇 葡萄干  +10 分
//   🍈 哈密瓜  +2s 时间
//   🍢 羊肉串  5s shield (撞墙免疫)
//   ❄️ 雪莲    5s magnet (奖品吸附)
//   🫓 馕饼    3s slow  (速度 -50%)
//
// 速度公式 (v4):
//   baseSpeed = 80 (用户反馈"不能跑太快")
//   slopeBoost = currentSlope × 60
//   accelBoost = Δslope × 30
//   manualBoost = ▼ 按下 +60, ▲ 按下 -60, 松开 = 0  (v4 新增)
//   targetSpeed = baseSpeed + slopeBoost + accelBoost + manualBoost
//   scrollSpeed = max(0, min(maxSpeed, targetSpeed))   ← max 0 是关键, 不能往上滑
//
// 视差 (3 层, v4 加大):
//   far   × 0.4  (远景雪山/林海, 原来 0.2)
//   mid   × 0.7  (中景山脊/树线, 原来 0.5)
//   near  × 1.2  (近景地面纹理 + 障碍物/奖品, 原来 1.0)
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
      continueZone.on('pointerdown', function () { try { window.playXinjiangSfx('button', 0.4); } catch (e) {} self._goNextLevel(); });
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

      // v11: BGM 删除, BGM 初始化逻辑也删掉

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
  });// ============== SlidingScene (v3 — biome 系统 + 5 种奖品) ==============
  // 玩家固定屏幕 1/3 (y=240), 4 段 biome 顺坡度加速下滑, 5 种新疆主题奖品,
  // 3 层视差背景 (远景/中景/近景), 45s 沉浸通关
  var SlidingScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function SlidingScene() { Phaser.Scene.call(this, { key: 'SlidingScene' }); },
    create: function () {
      var self = this;
      var config = window.XINJIANG_LEVEL.sliding;
      var biomes = window.XINJIANG_LEVEL.biomes;
      var prizes = window.XINJIANG_LEVEL.prizes;

      // ===== 状态初始化 =====
      this.cameras.main.setBackgroundColor('#B3E5FC');
      this.state = 'SLIDING';  // SLIDING | WIN | FAIL
      this.startTime = Date.now();
      this.timeLeft = config.timeLimit;

      // 玩家
      this.playerX = config.initialX;
      this.playerY = config.playerScreenY;  // v4: 固定屏幕中下 (480)
      this.scrollY = 0;                      // 累计滚动距离 (biome 进度)
      this.scrollSpeed = config.baseSpeed;
      this.lastSlope = 0;

      // v4 新增: 手动加速/减速 (屏幕 ▼ ▲ 按钮, 松开 = 0)
      this.speedBoost = 0;

      // Biome 状态
      this.currentBiomeIdx = 0;
      this.transitioningBiome = false;       // biome 切换淡入淡出中
      this.transitionStart = 0;

      // 数组
      this.obstacles = [];
      this.prizes = [];
      this.trails = [];
      this.lastObstacleTime = Date.now();
      this.lastPrizeTime = Date.now();
      this.lastTrailTime = Date.now();

      // 视差滚动偏移
      this.farScrollOffset = 0;
      this.midScrollOffset = 0;
      this.nearScrollOffset = 0;

      // 道具计数 / 分数
      this.score = 0;
      this.prizeCount = {};                 // { grape: 3, melon: 1, ... }
      prizes.forEach(function (p) { self.prizeCount[p.id] = 0; });

      // 道具效果 (timestamp 到期)
      this.shieldUntil = 0;
      this.magnetUntil = 0;
      this.slowUntil = 0;

      // 撞墙次数
      this.crashCount = 0;
      this.maxCrashes = config.maxCrashes;

      // ===== 3 层视差 Graphics =====
      // 远景 (depth 5) - 雪山/林海/冰山轮廓 (慢速 0.2×)
      this.farLayer = this.add.graphics();
      this.farLayer.setDepth(5);
      // 中景 (depth 10) - 山脊/树线/冰裂缝 (中速 0.5×)
      this.midLayer = this.add.graphics();
      this.midLayer.setDepth(10);
      // 近景背景 (depth 15) - 地面纹理/雪线/草地 (全速 1.0×)
      this.nearBgLayer = this.add.graphics();
      this.nearBgLayer.setDepth(15);
      // 起点旗 / 终点旗 (固定装饰, 不滚动)
      this._drawStaticMarkers();

      // 第一段 biome 背景
      this._redrawLayers();

      // ===== 飘雪粒子 (depth 25) =====
      this._initSnowParticles();

      // ===== 开场山巅远眺 =====
      this._playIntro();

      // ===== 玩家容器 (depth 50) =====
      this.playerContainer = this.add.container(this.playerX, this.playerY);
      this.playerContainer.setDepth(50);
      this._drawPlayer();

      // ===== UI (HUD 顶栏) =====
      this._createUI();

      // ===== v4 重写: 屏幕 DOM 方向键 (← → ▲ ▼) =====
      // 替换 v3 的 Phaser joystick + 键盘监听
      // v9: Phaser 虚拟方向键 (跟哈萨克斯坦一致, 圆盘 + 4 圆按钮 + 金箭头)
      this.keys = { left: false, right: false };
      this.speedBoost = 0;
      this._createJoystick();

      // ===== 键盘监听 (桌面端, 调试备用) =====
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
      // 上下键控制 manualBoost (桌面端调试备用)
      this.input.keyboard.on('keydown-DOWN', function () { self.speedBoost = config.manualBoostPress; });
      this.input.keyboard.on('keyup-DOWN',   function () { self.speedBoost = 0; });
      this.input.keyboard.on('keydown-UP',   function () { self.speedBoost = -config.manualBoostPress; });
      this.input.keyboard.on('keyup-UP',     function () { self.speedBoost = 0; });

      // ===== 提示 =====
      this.add.text(640, 80, '🎯 用 ← → 键躲开障碍, 吃奖品获加成, 45 秒内到达山脚!', {
        fontSize: '16px', color: '#0D47A1', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setDepth(100);

      // ===== 更新循环 =====
      this._lastUpdateTime = Date.now();
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },

    // ============================================================
    //  视差背景层 (3 层, 每帧重绘 + biome 切换时重绘)
    // ============================================================

    // 固定装饰 (起点旗 / 终点旗 / 雪线) - 不滚动
    _drawStaticMarkers: function () {
      var markerGfx = this.add.graphics();
      markerGfx.setDepth(12);

      // 起点旗 (左上, y=60)
      markerGfx.fillStyle(0x1565C0, 1);
      markerGfx.fillRect(20, 60, 6, 60);
      markerGfx.fillTriangle(26, 60, 60, 75, 26, 90);

      // 终点旗 (右下, y=680)
      markerGfx.fillStyle(0xC62828, 1);
      markerGfx.fillRect(CANVAS_W - 26, CANVAS_H - 60, 6, 60);
      markerGfx.fillTriangle(CANVAS_W - 20, CANVAS_H - 60, CANVAS_W - 60, CANVAS_H - 45, CANVAS_W - 20, CANVAS_H - 30);

      // 山脚草原的水平线 (玩家脚下的"地面参考线")
      markerGfx.lineStyle(1, 0xFFFFFF, 0.4);
      markerGfx.lineBetween(0, this.playerY + 40, CANVAS_W, this.playerY + 40);
    },

    // 重绘 3 层 (biome 切换或每帧滚动后)
    _redrawLayers: function () {
      var biome = window.XINJIANG_LEVEL.biomes[this.currentBiomeIdx];
      // 暂时禁用层更新以避免闪烁
      this._drawFarLayer(this.farLayer, biome, this.farScrollOffset);
      this._drawMidLayer(this.midLayer, biome, this.midScrollOffset);
      this._drawNearBgLayer(this.nearBgLayer, biome, this.nearScrollOffset);
    },

    // 远景层 (depth 5) - 视差 0.2×
    // 4 种 biome 不同形状: 雪山轮廓 / 森林剪影 / 冰山轮廓 / 远山轮廓
    _drawFarLayer: function (g, biome, offset) {
      g.clear();
      var LAYER_H = 720;
      var modOff = ((offset % LAYER_H) + LAYER_H) % LAYER_H;

      // 根据 biome id 选形状
      var shapes = [];
      if (biome.id === 'snow_peak') {
        // 远景雪山轮廓 (3 座, 浅灰蓝)
        shapes = [
          { kind: 'triangle', x: 200,  baseY: -40, w: 380, h: 180, color: biome.farColor, alpha: 0.7 },
          { kind: 'triangle', x: 640,  baseY: -60, w: 480, h: 220, color: biome.farColor, alpha: 0.7 },
          { kind: 'triangle', x: 1080, baseY: -30, w: 420, h: 190, color: biome.farColor, alpha: 0.7 },
          { kind: 'triangle', x: 400,  baseY:  60, w: 320, h: 140, color: biome.farColor2, alpha: 0.5 },
          { kind: 'triangle', x: 900,  baseY:  80, w: 360, h: 160, color: biome.farColor2, alpha: 0.5 },
        ];
      } else if (biome.id === 'pine_forest') {
        // 远景森林 (深绿三角 + 圆形树冠)
        shapes = [
          { kind: 'triangle', x: 150,  baseY: -40, w: 200, h: 160, color: biome.farColor, alpha: 0.85 },
          { kind: 'triangle', x: 350,  baseY: -50, w: 220, h: 170, color: biome.farColor, alpha: 0.85 },
          { kind: 'triangle', x: 560,  baseY: -30, w: 200, h: 150, color: biome.farColor2, alpha: 0.9 },
          { kind: 'triangle', x: 780,  baseY: -40, w: 240, h: 170, color: biome.farColor, alpha: 0.85 },
          { kind: 'triangle', x: 1000, baseY: -20, w: 200, h: 150, color: biome.farColor2, alpha: 0.9 },
          { kind: 'triangle', x: 1200, baseY: -40, w: 220, h: 170, color: biome.farColor, alpha: 0.85 },
        ];
      } else if (biome.id === 'glacier') {
        // 远景冰山 (浅蓝, 半透明, 棱角)
        shapes = [
          { kind: 'triangle', x: 220,  baseY: -50, w: 360, h: 180, color: biome.farColor, alpha: 0.75 },
          { kind: 'triangle', x: 700,  baseY: -40, w: 420, h: 200, color: biome.farColor, alpha: 0.75 },
          { kind: 'triangle', x: 1100, baseY: -60, w: 380, h: 190, color: biome.farColor2, alpha: 0.65 },
          { kind: 'triangle', x: 450,  baseY:  50, w: 280, h: 130, color: biome.farColor2, alpha: 0.55 },
        ];
      } else if (biome.id === 'grassland') {
        // 远景雪山 + 草原起伏
        shapes = [
          { kind: 'triangle', x: 200,  baseY: -40, w: 400, h: 160, color: biome.farColor, alpha: 0.55 },
          { kind: 'triangle', x: 700,  baseY: -60, w: 460, h: 180, color: biome.farColor, alpha: 0.55 },
          { kind: 'triangle', x: 1100, baseY: -30, w: 380, h: 150, color: biome.farColor2, alpha: 0.45 },
        ];
      }

      // 绘制 (双份: 主 + 偏移 LAYER_H 上方, 处理 wrap)
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        for (var k = 0; k < 2; k++) {
          var y = s.baseY - modOff - k * LAYER_H;
          if (y < -300 || y > LAYER_H + 100) continue;
          g.fillStyle(s.color, s.alpha);
          if (s.kind === 'triangle') {
            g.fillTriangle(s.x - s.w / 2, y + s.h, s.x, y, s.x + s.w / 2, y + s.h);
          }
        }
      }
    },

    // 中景层 (depth 10) - 视差 0.5×
    _drawMidLayer: function (g, biome, offset) {
      g.clear();
      var LAYER_H = 720;
      var modOff = ((offset % LAYER_H) + LAYER_H) % LAYER_H;
      var shapes = [];
      if (biome.id === 'snow_peak') {
        // 中景山脊 (灰色)
        shapes = [
          { kind: 'triangle', x: 100,  baseY: 180, w: 240, h: 100, color: biome.midColor, alpha: 0.6 },
          { kind: 'triangle', x: 400,  baseY: 200, w: 280, h: 120, color: biome.midColor, alpha: 0.6 },
          { kind: 'triangle', x: 750,  baseY: 190, w: 260, h: 110, color: biome.midColor, alpha: 0.6 },
          { kind: 'triangle', x: 1100, baseY: 210, w: 300, h: 130, color: biome.midColor, alpha: 0.6 },
        ];
      } else if (biome.id === 'pine_forest') {
        // 中景松树 (深绿)
        shapes = [
          { kind: 'triangle', x: 80,   baseY: 200, w: 100, h: 130, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 260,  baseY: 220, w: 110, h: 140, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 460,  baseY: 200, w: 100, h: 130, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 660,  baseY: 220, w: 110, h: 140, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 860,  baseY: 200, w: 100, h: 130, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 1060, baseY: 220, w: 110, h: 140, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 1240, baseY: 200, w: 100, h: 130, color: biome.midColor, alpha: 0.85 },
        ];
      } else if (biome.id === 'glacier') {
        // 中景冰裂缝 (深蓝条)
        shapes = [
          { kind: 'rect', x: 200,  baseY: 220, w: 6,   h: 80, color: biome.midColor, alpha: 0.7 },
          { kind: 'rect', x: 500,  baseY: 230, w: 8,   h: 60, color: biome.midColor, alpha: 0.7 },
          { kind: 'rect', x: 850,  baseY: 220, w: 6,   h: 80, color: biome.midColor, alpha: 0.7 },
          { kind: 'rect', x: 1150, baseY: 230, w: 8,   h: 70, color: biome.midColor, alpha: 0.7 },
          { kind: 'triangle', x: 350,  baseY: 180, w: 200, h: 100, color: biome.farColor2, alpha: 0.4 },
          { kind: 'triangle', x: 950,  baseY: 200, w: 220, h: 110, color: biome.farColor2, alpha: 0.4 },
        ];
      } else if (biome.id === 'grassland') {
        // 中景草原 (绿色小山丘)
        shapes = [
          { kind: 'triangle', x: 150,  baseY: 220, w: 280, h: 80, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 500,  baseY: 230, w: 300, h: 90, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 900,  baseY: 220, w: 280, h: 80, color: biome.midColor, alpha: 0.85 },
          { kind: 'triangle', x: 1200, baseY: 230, w: 280, h: 90, color: biome.midColor, alpha: 0.85 },
        ];
      }
      for (var i = 0; i < shapes.length; i++) {
        var s = shapes[i];
        for (var k = 0; k < 2; k++) {
          var y = s.baseY - modOff - k * LAYER_H;
          if (y < -200 || y > LAYER_H + 100) continue;
          g.fillStyle(s.color, s.alpha);
          if (s.kind === 'triangle') {
            g.fillTriangle(s.x - s.w / 2, y + s.h, s.x, y, s.x + s.w / 2, y + s.h);
          } else if (s.kind === 'rect') {
            g.fillRect(s.x - s.w / 2, y, s.w, s.h);
          }
        }
      }
    },

    // 近景背景 (depth 15) - 视差 1.0× (全速)
    _drawNearBgLayer: function (g, biome, offset) {
      g.clear();
      var LAYER_H = 720;
      var modOff = ((offset % LAYER_H) + LAYER_H) % LAYER_H;

      // 地面基础色 (玩家脚下到屏幕底)
      g.fillStyle(biome.nearColor, 0.8);
      g.fillRect(0, this.playerY + 40, CANVAS_W, CANVAS_H - (this.playerY + 40));

      // biome 主题的近景纹理
      var stripes = [];
      if (biome.id === 'snow_peak') {
        // 雪地纹理: 横向白条
        for (var i = 0; i < 8; i++) {
          stripes.push({ y: 320 + i * 50, h: 4, color: 0xFFFFFF, alpha: 0.5 });
        }
      } else if (biome.id === 'pine_forest') {
        // 雪地 + 棕色松针
        for (var j = 0; j < 6; j++) {
          stripes.push({ y: 320 + j * 60, h: 3, color: 0xFFFFFF, alpha: 0.4 });
          stripes.push({ y: 340 + j * 60, h: 2, color: 0x6D4C2A, alpha: 0.5 });
        }
      } else if (biome.id === 'glacier') {
        // 冰面裂纹 (浅蓝细条)
        for (var m = 0; m < 10; m++) {
          stripes.push({ y: 300 + m * 45, h: 2, color: biome.midColor, alpha: 0.55 });
        }
      } else if (biome.id === 'grassland') {
        // 草地竖条 (深绿)
        for (var n = 0; n < 30; n++) {
          stripes.push({ y: 320 + n * 14, h: 8, color: 0x33691E, alpha: 0.45, kind: 'vertical' });
        }
      }
      for (var p = 0; p < stripes.length; p++) {
        var s = stripes[p];
        var y = s.y - modOff;
        while (y > LAYER_H + 10) y -= LAYER_H;
        while (y < -20) y += LAYER_H;
        g.fillStyle(s.color, s.alpha);
        if (s.kind === 'vertical') {
          for (var gx = 0; gx < CANVAS_W; gx += 40 + (p % 3) * 5) {
            g.fillRect(gx, y, 3, s.h);
          }
        } else {
          g.fillRect(0, y, CANVAS_W, s.h);
        }
      }
    },

    // ============================================================
    //  v4 新增: 终点"成都小屋" (biome 4 草原段位)
    //  biome 4 segmentLength=1500, 600=屋前小路, 1500=滑进屋门
    //  静态绘制 (depth 20), 不参与视差 — 玩家到达时正好在门口
    // ============================================================
    _buildExitHouse: function (biome) {
      this._exitHouseGfx = this.add.graphics();
      this._exitHouseGfx.setDepth(20);

      // —— 屋前小路: 从 houseStart (600) 开始, 到 houseEnd (1500) ——
      // 路径中央逐渐变窄 + 两侧出现房屋轮廓, 引导玩家向中央滑行
      // 路径颜色 (暖棕, 跟草原对比)
      var pathColor = 0xC9A06A;
      var pathEdgeColor = 0x8D6E63;

      // —— 屋本体: 位于 biome 4 末尾 (scrollY ~ 1500), 默认 y=-1500 在屏幕外
      // y 表示该物体在 biome 4 内"距离玩家多远才到达"
      // 我们用相对 scrollY 的 y 坐标计算屏幕位置:
      //   screenY = -scrollYOffset + biomeBaseY
      // 实际绘制策略: 用固定的"目标点 y"表示屋门入口 (玩家到达时正好对准)
      // 玩家 y = 480 (屏幕中下), 屋门应该出现在屏幕底部边缘 (y ~ 660, 玩家脚下偏下)
      // 屋本体静态画在屏幕底部, 通过 nearScrollOffset 跟随滚动
      // 但这样屋会跟着移走 — 因此我们用绝对位置 (scrollY 实时算 offset):

      // 思路: 玩家到达 biome 4 末尾 (scrollY ~ 5400 = 总长) 时, 屋门应在屏幕底部
      // 玩家从 biome 4 起点 (scrollY 3900) 滑到 5400 时, 屋门从屏幕上方 (y=-200) 滚到 y=720
      // 屋本体 y (屏幕坐标) = -200 + (scrollY - 3900) (近似, 假设匀速)
      // 改用 playerContainer 同步位置: 屋本体深度挂 _exitHouseGfx, 在 update 中每帧重画位置

      // 把"屋本体容器"存到 this._exitHouseContainer, 在 update 里逐帧定位
      // v8: x 从 640 (居中) 改成 1240 (CANVAS_W-40, 右下角)
this._exitHouseContainer = this.add.container(CANVAS_W - 200, -200);  // v10: 1240 → 1080 (往左 160px)
      this._exitHouseContainer.setDepth(20);

      // 计算 biome 4 在总滚动中的起始 offset (前三段之和)
      var biomes = window.XINJIANG_LEVEL.biomes;
      var biome4Start = biomes[0].segmentLength + biomes[1].segmentLength + biomes[2].segmentLength;  // 1200+1400+1300=3900
      this._exitHouseBiomeStart = biome4Start;

      // —— 屋内容: 棕色墙 + 三角屋顶 + 深色门 + 暖黄门内光 + 红灯笼 + 成都文字 ——
      // 拆成 3 个 graphics: path / house / label — 分别控制 alpha
      // (按 scrollInBiome 渐显/渐隐, 让"路径先出现 → 主屋后接管"的视觉节奏)

      // —— 屋前小路 (在 _exitHousePath) ——
      // v8: 斜向左下的引导三角形, 从屋体右上方开始, 斜向左下方展开
      //   起点 (屋体上方, x 跟屋体同 x=1240): (0, 300) — 屋体正上方窄口
      //   终点 (屏幕底部稍偏左, x=1100): (-140, 700) — 斜向左下
      this._exitHousePath = this.add.graphics();
      this._exitHousePath.fillStyle(pathColor, 0.85);
      // 单三角形: 屋体正上方 (0,300) → 斜向左下 (-200, 700) → 屋体底部 (0, 700)
      this._exitHousePath.fillTriangle(0, 300, -200, 700, 0, 700);
      // 路边深色边 (沿斜边 + 右竖边)
      this._exitHousePath.lineStyle(3, pathEdgeColor, 0.7);
      this._exitHousePath.lineBetween(0, 300, -200, 700);
      this._exitHousePath.lineBetween(0, 300, 0, 700);
      this._exitHouseContainer.add(this._exitHousePath);

      // —— 屋本体 (在 _exitHouseHouse) ——
      // v8: 缩小到 180x130 (从 220x160), 适合右下角不拥挤
      this._exitHouseHouse = this.add.graphics();
      var house = this._exitHouseHouse;

      // 屋主体 — 棕色墙 (rect 180x130, 居中底部)
      house.fillStyle(0x8D6E63, 1);
      house.fillRect(-90, 20, 180, 130);

      // 屋主体深色边框
      house.lineStyle(2, 0x4E342E, 1);
      house.strokeRect(-90, 20, 180, 130);

      // 屋顶 — 大三角 (深棕色, 顶部到 y=-75)
      house.fillStyle(0x5D4037, 1);
      house.fillTriangle(-105, 20, 105, 20, 0, -75);
      // 屋脊装饰线
      house.lineStyle(2, 0x3E2723, 1);
      house.lineBetween(-105, 20, 105, 20);
      house.lineBetween(0, -75, 0, 20);

      // 屋瓦横纹 (3 条)
      house.lineStyle(1, 0x3E2723, 0.6);
      house.lineBetween(-72, -42, 72, -42);
      house.lineBetween(-82, -21, 82, -21);
      house.lineBetween(-90, 0, 90, 0);

      // 屋门 — 深色矩形 (内嵌, 居中, 65x75)
      house.fillStyle(0x3E2723, 1);
      house.fillRect(-32, 80, 64, 70);
      // 门内暖光 (浅黄)
      house.fillStyle(0xFFE082, 0.85);
      house.fillRect(-27, 85, 54, 65);
      // 门框深色描边
      house.lineStyle(2, 0x3E2723, 1);
      house.strokeRect(-32, 80, 64, 70);
      // 门中线 (双开门)
      house.lineBetween(0, 85, 0, 149);

      // 门两侧红灯笼
      house.fillStyle(0xC62828, 1);
      house.fillCircle(-72, 72, 11);
      house.fillCircle(72, 72, 11);
      // 灯笼顶部黑带
      house.fillStyle(0x3E2723, 1);
      house.fillRect(-77, 61, 10, 3);
      house.fillRect(67, 61, 10, 3);
      // 灯笼底部流苏
      house.fillStyle(0xFFD54F, 1);
      house.fillRect(-74, 83, 3, 6);
      house.fillRect(71, 83, 3, 6);

      // 屋顶两侧屋檐翘起 (传统中式)
      house.fillStyle(0x3E2723, 1);
      house.fillTriangle(-105, 20, -130, 12, -90, 38);
      house.fillTriangle(105, 20, 130, 12, 90, 38);

      // 屋前小台阶
      house.fillStyle(0x4E342E, 1);
      house.fillRect(-40, 148, 80, 5);
      house.fillRect(-35, 153, 70, 5);

      this._exitHouseContainer.add(this._exitHouseHouse);

      // —— 屋顶部 "🏠 成都" 红色大字 ——
      this._exitHouseLabel = this.add.text(0, -130, '🏠 成都', {
        fontSize: '40px', color: '#C62828', fontStyle: 'bold',
        stroke: '#FFFFFF', strokeThickness: 4,
      }).setOrigin(0.5);
      this._exitHouseContainer.add(this._exitHouseLabel);

      // 屋前提示牌 "滑进屋里 = 到家!" (玩家接近时显示)
      this._exitHouseSign = this.add.text(0, 230, '滑进屋里 = 到家!', {
        fontSize: '24px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(198, 40, 40, 0.85)',
        padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setAlpha(0);
      this._exitHouseContainer.add(this._exitHouseSign);

      // —— 屋前小屋轮廓 (在 houseStart=600 之后出现, 引导玩家) ——
      // 这些小屋在 biome 4 中段出现, 给玩家"快到家"的视觉提示
      // 它们也跟随 _exitHouseContainer 一起滚动, 不参与 parallax
      this._buildCottages();

      // —— 房屋在屏幕外的"屋前小路指示牌" (玩家进 biome 4 立刻看到) ——
      this._exitHouseGuide = this.add.text(640, 110, '🏠 沿小路滑向成都小屋!', {
        fontSize: '20px', color: '#5D4037', fontStyle: 'bold',
        backgroundColor: 'rgba(255, 248, 225, 0.9)',
        padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setDepth(101).setAlpha(1);
    },

    // biome 4 中段小屋轮廓 (引导玩家向中央)
    _buildCottages: function () {
      var cottages = [
        { x: 200, y: -80,  scale: 0.5 },
        { x: 1080, y: -80, scale: 0.5 },
        { x: 320, y: 100,  scale: 0.6 },
        { x: 960, y: 100,  scale: 0.6 },
      ];
      this._cottageGfx = [];
      for (var i = 0; i < cottages.length; i++) {
        var c = cottages[i];
        var g = this.add.graphics();
        // 简单棕色小三角屋
        g.fillStyle(0x6D4C2A, 0.55 * c.scale + 0.3);
        g.fillRect(c.x - 50 * c.scale, c.y, 100 * c.scale, 60 * c.scale);
        g.fillStyle(0x4E342E, 1);
        g.fillTriangle(
          c.x - 60 * c.scale, c.y,
          c.x + 60 * c.scale, c.y,
          c.x, c.y - 40 * c.scale
        );
        g.fillStyle(0xFFE082, 0.9);
        g.fillRect(c.x - 12 * c.scale, c.y + 20 * c.scale, 24 * c.scale, 24 * c.scale);
        this._cottageGfx.push({ gfx: g, cx: c.x, cy: c.y });
      }
    },

    // 每帧更新屋本体位置 (跟玩家滚动同步)
    _updateExitHouse: function () {
      if (!this._exitHouseContainer) return;
      var biomeStart = this._exitHouseBiomeStart || 0;
      var scrollInBiome = this.scrollY - biomeStart;

      // v9 位置公式 (屋从屏幕底部下方滚上来, 终点对准玩家脚):
      //   scrollInBiome=0    → container.y = CANVAS_H + 200 = 920  (屋在屏幕下方外)
      //   scrollInBiome=300  → container.y = ~782  (屋接近屏幕底部边缘)
      //   scrollInBiome=1500 → container.y = ~30   (屋在玩家脚下, 玩家滑进屋门)
      var houseScreenY = (CANVAS_H + 200) - scrollInBiome * 0.46;
      this._exitHouseContainer.y = houseScreenY;

      // 接近门口 (scrollInBiome > 1300) 时显示提示牌
      if (scrollInBiome > 1300 && this._exitHouseSign) {
        this._exitHouseSign.setAlpha(1);
      } else if (this._exitHouseSign) {
        this._exitHouseSign.setAlpha(0);
      }

      // —— 屋体可见性 gating (v9: 屋从下往上滚, alpha 时机反向) ——
      // 路径: scrollInBiome 100-300 渐显 (屋接近屏幕底部时出现), 1300-1500 渐隐
      if (this._exitHousePath) {
        var pathAlpha = scrollInBiome < 100 ? 0 :
                        scrollInBiome < 300 ? (scrollInBiome - 100) / 200 :
                        scrollInBiome > 1300 ? Math.max(0, 1 - (scrollInBiome - 1300) / 200) : 1;
        this._exitHousePath.setAlpha(pathAlpha);
      }
      // 屋本体: 300-500 渐显 (屋进入屏幕底部), 通关后由 _showWin 接管
      if (this._exitHouseHouse) {
        var houseAlpha = scrollInBiome < 300 ? 0 :
                         scrollInBiome < 500 ? (scrollInBiome - 300) / 200 : 1;
        this._exitHouseHouse.setAlpha(houseAlpha);
      }
      // 屋顶"🏠 成都"大字: 400-600 渐显
      if (this._exitHouseLabel) {
        var labelAlpha = scrollInBiome < 400 ? 0 :
                         scrollInBiome < 600 ? (scrollInBiome - 400) / 200 : 1;
        this._exitHouseLabel.setAlpha(labelAlpha);
      }

      // 屋前小屋轮廓: 随 biome 4 滚动整体上移 (屏幕 y 跟随 houseScreenY 比例)
      // 让小屋在 biome 4 后半段可见
      if (this._cottageGfx) {
        for (var i = 0; i < this._cottageGfx.length; i++) {
          var c = this._cottageGfx[i];
          // 屋前小屋 y 跟随 houseScreenY 的一个比例偏移
          // scrollInBiome 600 (houseStart) 时, 小屋在屏幕底部下方 (y = CANVAS_H + 100 = 820)
          // scrollInBiome 1500 时, 小屋在玩家上方 (y = ~80)
          var cottageScreenY = (CANVAS_H + 100) - Math.max(0, scrollInBiome - 600) * (700 / 900);
          c.gfx.y = cottageScreenY - c.cy;
          // 小屋 alpha: 600→800 渐显, 1300→1500 渐隐 (让玩家关注主屋)
          if (scrollInBiome < 600) c.gfx.setAlpha(0);
          else if (scrollInBiome < 800) c.gfx.setAlpha((scrollInBiome - 600) / 200);
          else if (scrollInBiome < 1300) c.gfx.setAlpha(1);
          else c.gfx.setAlpha(Math.max(0, 1 - (scrollInBiome - 1300) / 200));
        }
      }
    },

    // ============================================================
    //  Biome 系统 + 连续坡度
    // ============================================================

    // 获取当前 biome 在 scrollY 处的索引
    _getBiomeInfo: function () {
      var biomes = window.XINJIANG_LEVEL.biomes;
      var accum = 0;
      for (var i = 0; i < biomes.length; i++) {
        if (this.scrollY < accum + biomes[i].segmentLength) {
          return {
            idx: i,
            progress: (this.scrollY - accum) / biomes[i].segmentLength,
            scrollInBiome: this.scrollY - accum,
            biome: biomes[i],
          };
        }
        accum += biomes[i].segmentLength;
      }
      var last = biomes.length - 1;
      return { idx: last, progress: 1, scrollInBiome: biomes[last].segmentLength, biome: biomes[last] };
    },

    // 当前 biome 的坡度 (在 [slopeMin, slopeMax] 间线性插值)
    _getCurrentSlope: function () {
      var info = this._getBiomeInfo();
      var b = info.biome;
      return b.slopeMin + (b.slopeMax - b.slopeMin) * info.progress;
    },

    // 总滚动距离 (通关条件)
    _getTotalScrollLength: function () {
      var biomes = window.XINJIANG_LEVEL.biomes;
      var total = 0;
      for (var i = 0; i < biomes.length; i++) total += biomes[i].segmentLength;
      return total;
    },

    // biome 切换检测 + 淡入淡出
    _checkBiomeTransition: function () {
      var info = this._getBiomeInfo();
      if (info.idx !== this.currentBiomeIdx) {
        // biome 切换!
        this.currentBiomeIdx = info.idx;
        this._onBiomeEnter(info.biome);
      }
    },

    _onBiomeEnter: function (biome) {
      var self = this;
      // 0.5s 淡入淡出遮罩
      var fadeDur = window.XINJIANG_LEVEL.sliding.biomeTransitionDuration;
      this.transitioningBiome = true;
      var overlay = this.add.rectangle(640, 360, CANVAS_W, CANVAS_H, 0xFFFFFF, 0)
        .setDepth(800);
      this.tweens.add({
        targets: overlay,
        alpha: { 0: 0.7 },
        duration: fadeDur / 2,
        yoyo: true,
        onComplete: function () {
          overlay.destroy();
          self.transitioningBiome = false;
        }
      });
      // v4: biome 切换时重置 3 层 scroll offset (避免视差错位 / 重叠)
      this.farScrollOffset = 0;
      this.midScrollOffset = 0;
      this.nearScrollOffset = 0;
      // 重绘 3 层 (新 biome 形状)
      this._redrawLayers();
      // biome 4 进入时画"成都小屋" — 通关目标建筑
      if (biome.id === 'grassland') {
        this._buildExitHouse(biome);
      }
      // 顶部 toast 提示
      this._showToast('🏔️ 进入 ' + biome.name, 0x1565C0);
      window.playXinjiangSfx('exchange', 0.3);
    },

    // ============================================================
    //  飘雪粒子 (v2 保留, 在 biome 1/2/3 都生成, biome 4 不生成)
    // ============================================================
    _initSnowParticles: function () {
      this._snowParticles = [];
      this._lastSnowSpawn = Date.now();
      this._snowGfx = this.add.graphics();
      this._snowGfx.setDepth(25);
    },

    _spawnSnowParticle: function () {
      var config = window.XINJIANG_LEVEL.sliding;
      var speedFactor = Math.max(0.6, this.scrollSpeed / config.baseSpeed);
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
    },

    _updateSnowParticles: function () {
      if (!this._snowGfx) return;
      var now = Date.now();
      var biome = window.XINJIANG_LEVEL.biomes[this.currentBiomeIdx];

      // biome 4 草原没有雪
      var snowEnabled = biome.id !== 'grassland';

      // 1. 生成新粒子
      if (snowEnabled) {
        var interval = window.XINJIANG_LEVEL.sliding.snowParticleRate;
        if (now - this._lastSnowSpawn > interval) {
          this._spawnSnowParticle();
          this._lastSnowSpawn = now;
        }
      }

      // 2. 更新位置 + 3. 绘制
      this._snowGfx.clear();
      for (var i = this._snowParticles.length - 1; i >= 0; i--) {
        var p = this._snowParticles[i];
        p.y += p.vy * 0.016;
        p.x += p.vx * 0.016;
        if (p.y > CANVAS_H + 20 || p.x < -20 || p.x > CANVAS_W + 20) {
          this._snowParticles.splice(i, 1);
          continue;
        }
        // 草原 biome 雪花变透明
        var a = snowEnabled ? p.alpha : p.alpha * 0.2;
        this._snowGfx.fillStyle(0xFFFFFF, a);
        if (p.shape === 'circle') {
          this._snowGfx.fillCircle(p.x, p.y, p.size / 2);
        } else {
          this._snowGfx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
    },

    // ============================================================
    //  滑痕轨迹 (v2 保留)
    // ============================================================
    _spawnTrail: function () {
      var config = window.XINJIANG_LEVEL.sliding;
      this.trails.push({
        x: this.playerX,
        y: this.playerY + 22,
        size: 6 + Math.random() * 4,
        bornAt: Date.now(),
      });
      if (this.trails.length > 40) this.trails.shift();
    },

    _updateTrails: function () {
      if (!this.trails || this.trails.length === 0) return;
      var fadeMs = window.XINJIANG_LEVEL.sliding.snowTrailFadeMs;
      var now = Date.now();
      if (!this._trailGfx) {
        this._trailGfx = this.add.graphics();
        this._trailGfx.setDepth(30);
      }
      this._trailGfx.clear();
      for (var i = this.trails.length - 1; i >= 0; i--) {
        var t = this.trails[i];
        var age = now - t.bornAt;
        if (age > fadeMs) { this.trails.splice(i, 1); continue; }
        var alpha = (1 - age / fadeMs) * 0.7;
        this._trailGfx.fillStyle(0xFFFFFF, alpha);
        this._trailGfx.fillCircle(t.x, t.y, t.size / 2);
      }
    },

    // ============================================================
    //  开场山巅远眺 (v2 保留)
    // ============================================================
    _playIntro: function () {
      var self = this;
      var introDur = window.XINJIANG_LEVEL.sliding.introDuration;
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
      var titleText = this.add.text(640, 360, '🏔️ 新疆·天山', {
        fontSize: '52px', color: '#0D47A1', fontStyle: 'bold',
        stroke: '#FFFFFF', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(150).setAlpha(0);
      var subtitleText = this.add.text(640, 420, '从山巅一路滑向成都', {
        fontSize: '20px', color: '#1565C0', fontStyle: 'italic',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        padding: { x: 14, y: 6 },
      }).setOrigin(0.5).setDepth(150).setAlpha(0);
      this.tweens.add({
        targets: [farMtn, titleText, subtitleText],
        alpha: { 0: 1 },
        duration: introDur / 2,
        onComplete: function () {
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
      this._introLock = true;
      setTimeout(function () { self._introLock = false; }, introDur);
    },

    // ============================================================
    //  玩家 (单板 + 角色)
    //  v9: 用 emoji 🏂 (snowboarder = 人+板一体) 替代 v8 Graphics 自绘
    //      跨关统一 (跟 levels.js LEVEL_META 一致)
    //      avatar 跟 🏂 自然叠合, 看起来角色踩在单板上
    // ============================================================
    _drawPlayer: function () {
      this.playerContainer.removeAll(true);

      // —— 单板 🏂 emoji (snowboarder, 50px) ——
      var board = this.add.text(0, 6, '🏂', { fontSize: '50px' }).setOrigin(0.5);
      this.playerContainer.add(board);

      // —— 角色 avatar (跟 🏂 叠合, 站在板上) ——
      var avatarId = null;
      try { avatarId = localStorage.getItem('silkroad_avatar'); } catch (e) {}
      if (!avatarId) avatarId = 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.7);
      avatar.setPosition(0, -4);
      this.playerContainer.add(avatar);

      // 道具效果指示器 (玩家头顶)
      this._effectIndicator = this.add.text(0, -42, '', {
        fontSize: '20px',
      }).setOrigin(0.5);
      this.playerContainer.add(this._effectIndicator);
    },

    _updateEffectIndicator: function () {
      if (!this._effectIndicator) return;
      var now = Date.now();
      var txt = '';
      if (now < this.shieldUntil) txt += '🛡️';
      if (now < this.magnetUntil) txt += '🧲';
      if (now < this.slowUntil) txt += '🐢';
      this._effectIndicator.setText(txt);
    },

    // ============================================================
    //  HUD UI (顶栏 + 奖品计数 + 总分)
    // ============================================================
    _createUI: function () {
      // 顶部 HUD 背景
      this.add.rectangle(640, 30, CANVAS_W, 60, 0x0D47A1, 0.85);

      // 倒计时 (左上)
      this.timerText = this.add.text(90, 30, '⏱️ 45s', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 距离进度 (左中)
      this.progressText = this.add.text(220, 30, '📏 0m', {
        fontSize: '16px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 进度条
      var barX = 480, barY = 30, barW = 320, barH = 16;
      this.add.rectangle(barX, barY, barW, barH, 0xFFFFFF, 0.3);
      this.progressBar = this.add.rectangle(barX - barW / 2, barY, 0, barH, 0x76FF03, 1)
        .setOrigin(0, 0.5);

      // biome 指示 (中右)
      this.biomeText = this.add.text(700, 30, '', {
        fontSize: '14px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 撞墙次数 (右上)
      this.crashText = this.add.text(890, 30, '💥 0', {
        fontSize: '14px', color: '#FFEB3B', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 总分 (最右)
      this.scoreText = this.add.text(1180, 30, '⭐ 0', {
        fontSize: '20px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 奖品计数行 (顶部 HUD 下, 第二行) — 5 个奖品 × 220 gap, 居中分布
      var prizes = window.XINJIANG_LEVEL.prizes;
      this._prizeTexts = {};
      var prizeGap = 200;
      var prizeStartX = (CANVAS_W - (prizes.length - 1) * prizeGap) / 2;
      var sceneRef = this;
      prizes.forEach(function (p, i) {
        var tx = prizeStartX + i * prizeGap;
        var txt = sceneRef.add.text(tx, 70, p.emoji + ' ' + p.name + ' 0', {
          fontSize: '13px', color: '#FFFFFF', fontStyle: 'bold',
          backgroundColor: '#' + p.color.toString(16).padStart(6, '0'),
          padding: { x: 8, y: 3 },
        }).setOrigin(0.5);
        sceneRef._prizeTexts[p.id] = txt;
      });
    },

    // ============================================================
    //  v8 重写: 屏幕 DOM 方向键 — 4 按钮田字格紧凑布局 + 统一新疆蓝色系
    //  v7 之前布局 C: ◀▶ 在屏幕底部两端, ▲▼ 在屏幕顶部中央两侧 (4 个按钮散落各处)
    //  v8 新布局:
    //    - 4 个按钮全部聚拢到屏幕**左下角**, 形成田字格 (土耳其参考)
    //    - 整体包裹在 wrapper div (left:20, bottom:20, 164×164, pointer-events:none)
    //    - 4 个按钮 position:absolute 在 wrapper 内 (pointer-events:auto)
// ============================================================
    //  v9: 虚拟方向键 (跟哈萨克斯坦 kazakhstan/game.js:1418-1461 一致)
    //    Phaser Graphics 圆盘 + 4 个圆形按钮 + 金色箭头
    //    容器位置 (110, 560) 左下角, scale 0.6, depth 500, alpha 0.72
    //    颜色: 0x4A2E1A 棕底 + 0xFFD98A 金色箭头/stroke (跟 kazakhstan 一致)
    //    ▲ 减速 (speedBoost = -60), ▼ 加速 (speedBoost = +60)
    //    ◀ ▶ 左右移动 (keys.left/right)
    // ============================================================
    _createJoystick: function () {
      var self = this;
      var config = window.XINJIANG_LEVEL.sliding;

      this.joystickContainer = this.add.container(110, 560);
      this.joystickContainer.setAlpha(0.72);
      this.joystickContainer.setScale(0.6);
      this.joystickContainer.setDepth(500);

      // 圆盘背景 (跟 kazakhstan 一致)
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
          // v9: 4 个方向键映射到不同动作 (跟 kazakhstan 不同, 新疆有 speedBoost)
          if (key === 'up') self.speedBoost = -config.manualBoostPress;
          else if (key === 'down') self.speedBoost = config.manualBoostPress;
          else self.keys[key] = true;
          bg.setFillStyle(0xFFD98A, 0.95);
          arrow.setColor('#2A190E');
          try { window.playXinjiangSfx('click', 0.4); } catch (err) {}
        };
        var release = function () {
          if (key === 'up' || key === 'down') self.speedBoost = 0;
          else self.keys[key] = false;
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

      // Phaser joystick 是 scene 内对象, shutdown 时自动销毁, 不需要手动清理 DOM
    },

    // ============================================================
    //  障碍物 / 奖品生成 (权重随机 + 横向间距保证 + 当前 biome 限定)
    // ============================================================
    _weightedPick: function (items) {
      var totalW = 0;
      for (var i = 0; i < items.length; i++) totalW += items[i].weight;
      var r = Math.random() * totalW;
      for (var j = 0; j < items.length; j++) {
        r -= items[j].weight;
        if (r <= 0) return items[j];
      }
      return items[items.length - 1];
    },

    _pickFreeX: function (existing, minGap, tries) {
      tries = tries || 8;
      for (var t = 0; t < tries; t++) {
        var x = 80 + Math.random() * (CANVAS_W - 160);
        var ok = true;
        for (var k = 0; k < existing.length; k++) {
          if (Math.abs(existing[k].x - x) < minGap) { ok = false; break; }
        }
        if (ok) return x;
      }
      // fallback: 在允许范围内取随机
      return 80 + Math.random() * (CANVAS_W - 160);
    },

    _spawnObstacle: function () {
      var config = window.XINJIANG_LEVEL.sliding;
      var biome = window.XINJIANG_LEVEL.biomes[this.currentBiomeIdx];
      var chosen = this._weightedPick(biome.obstacles);
      var x = this._pickFreeX(this.obstacles, config.obstacleMinGap);
      // v8: 物品从屏幕底部出生 (CANVAS_H + 80), 向上移动, 跟背景方向一致
      var startY = CANVAS_H + 80;
      var ob = {
        id: chosen.id,
        emoji: chosen.emoji,
        size: chosen.size,
        x: x,
        y: startY,
        gfx: this.add.text(x, startY, chosen.emoji, {
          fontSize: chosen.size + 'px',
        }).setOrigin(0.5).setDepth(40),
      };
      if (chosen.id === 'friendly_npc') {
        ob.glow = this.add.circle(x, startY, chosen.size * 0.8, 0xFFD54F, 0.35)
          .setDepth(39);
      }
      this.obstacles.push(ob);
    },

    _spawnPrize: function () {
      var config = window.XINJIANG_LEVEL.sliding;
      var prizes = window.XINJIANG_LEVEL.prizes;
      var chosen = this._weightedPick(prizes);
      // 奖品跟障碍物 + 已存在奖品 都不重叠
      var occupied = this.obstacles.concat(this.prizes);
      var x = this._pickFreeX(occupied, config.prizeMinGap);
      // v8: 物品从屏幕底部出生 (CANVAS_H + 80), 向上移动, 跟背景方向一致
      var startY = CANVAS_H + 80;
      var p = {
        id: chosen.id,
        emoji: chosen.emoji,
        name: chosen.name,
        color: chosen.color,
        effect: chosen.effect,
        value: chosen.value,
        duration: chosen.duration,
        size: 38,
        x: x,
        y: startY,
        gfx: this.add.text(x, startY, chosen.emoji, {
          fontSize: '42px',
        }).setOrigin(0.5).setDepth(41),
        glow: this.add.circle(x, startY, 30, chosen.color, 0.35).setDepth(40),
      };
      this.prizes.push(p);
    },

    // ============================================================
    //  撞墙 / 撞奖品 / 撞 NPC
    // ============================================================
    _onCrash: function (ob) {
      var config = window.XINJIANG_LEVEL.sliding;
      var now = Date.now();

      // 友好 NPC: 加时间 + toast
      if (ob.id === 'friendly_npc') {
        this.timeLeft += config.npcBonusTime;
        this.timerText.setText('⏱️ ' + Math.ceil(this.timeLeft / 1000) + 's');
        window.playXinjiangSfx('pickup', 0.4);
        ob.gfx.destroy();
        if (ob.glow) ob.glow.destroy();
        var idx = this.obstacles.indexOf(ob);
        if (idx >= 0) this.obstacles.splice(idx, 1);
        this._showToast('👨‍🌾 牧民送你一段！+1s', 0xD2691E);
        return;
      }

      // 普通障碍物
      this.crashCount++;
      this.crashText.setText('💥 ' + this.crashCount);
      window.playXinjiangSfx('pickup', 0.3);

      // shield 期间免疫 (无 -50 速度, 无屏幕震动)
      if (now < this.shieldUntil) {
        this._showToast('🛡️ 无敌！', 0xD84315);
      } else {
        // 屏幕震动 + 减速度 (用户反馈: 200ms, 0.012 intensity)
        this.cameras.main.shake(200, 0.012);
        this.scrollSpeed = Math.max(config.minSpeed, this.scrollSpeed - 50);
      }

      // 移除撞到的障碍
      ob.gfx.destroy();
      if (ob.glow) ob.glow.destroy();
      var idx2 = this.obstacles.indexOf(ob);
      if (idx2 >= 0) this.obstacles.splice(idx2, 1);

      if (this.crashCount >= this.maxCrashes) {
        this._showFail('撞太多次了！');
      }
    },

    _onPickupPrize: function (p) {
      var now = Date.now();
      var name = p.name;
      var cfg = window.XINJIANG_LEVEL.prizes.find(function (x) { return x.id === p.id; });
      // 计分 + 计数
      this.prizeCount[p.id] = (this.prizeCount[p.id] || 0) + 1;
      if (this._prizeTexts[p.id]) {
        this._prizeTexts[p.id].setText(p.emoji + ' ' + name + ' ' + this.prizeCount[p.id]);
      }

      var toastMsg = '', toastColor = p.color;
      switch (p.effect) {
        case 'score':
          this.score += cfg.value;
          toastMsg = p.emoji + ' ' + name + ' +' + cfg.value + ' 分！';
          break;
        case 'time':
          this.timeLeft += cfg.value;
          this.timerText.setText('⏱️ ' + Math.ceil(this.timeLeft / 1000) + 's');
          toastMsg = p.emoji + ' ' + name + ' +' + (cfg.value / 1000) + ' 秒！';
          break;
        case 'shield':
          this.shieldUntil = Math.max(this.shieldUntil, now + cfg.duration);
          toastMsg = '🍢 羊肉串！' + (cfg.duration / 1000) + '秒无敌！';
          break;
        case 'magnet':
          this.magnetUntil = Math.max(this.magnetUntil, now + cfg.duration);
          toastMsg = '❄️ 雪莲！' + (cfg.duration / 1000) + '秒吸附！';
          break;
        case 'slow':
          this.slowUntil = Math.max(this.slowUntil, now + cfg.duration);
          toastMsg = '🫓 馕饼！' + (cfg.duration / 1000) + '秒减速！';
          break;
      }
      this._showToast(toastMsg, toastColor);
      window.playXinjiangSfx('pickup', 0.5);

      // 移除奖品
      p.gfx.destroy();
      if (p.glow) p.glow.destroy();
      var idx = this.prizes.indexOf(p);
      if (idx >= 0) this.prizes.splice(idx, 1);
    },

    // ============================================================
    //  Toast 提示
    // ============================================================
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

    // ============================================================
    //  v4: 通关前 200px 提示 — "🏠 即将到家! 滑进去"
    //  在 biome 4 后 housePromptOffset 距离开始显示, 通关触发时消失
    // ============================================================
    _checkHousePrompt: function () {
      var biomes = window.XINJIANG_LEVEL.biomes;
      var lastBiome = biomes[biomes.length - 1];
      if (lastBiome.id !== 'grassland') return;
      var biomeStart = biomes[0].segmentLength + biomes[1].segmentLength + biomes[2].segmentLength;
      var scrollInBiome = this.scrollY - biomeStart;
      var distanceToEnd = lastBiome.houseEnd - scrollInBiome;

      // 进入 biome 4 时显示"沿小路滑向成都小屋"
      if (scrollInBiome > 0 && scrollInBiome < 100 && !this._exitHouseGuideShown) {
        this._exitHouseGuideShown = true;
        // 已在 _buildExitHouse 中创建, 此处只是淡入效果
      }

      // 距终点 200px 内显示"即将到家"
      if (distanceToEnd > 0 && distanceToEnd <= (lastBiome.housePromptOffset || 200)) {
        if (!this._arrivalPrompt) {
          this._arrivalPrompt = this.add.text(640, 200, '🏠 即将到家! 滑进去', {
            fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold',
            backgroundColor: 'rgba(198, 40, 40, 0.92)',
            padding: { x: 20, y: 10 },
            stroke: '#FFFFFF', strokeThickness: 2,
          }).setOrigin(0.5).setDepth(500);
          // 上下浮动提示
          this.tweens.add({
            targets: this._arrivalPrompt,
            y: 180,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          window.playXinjiangSfx('exchange', 0.4);
        }
      } else if (this._arrivalPrompt && distanceToEnd <= 0) {
        // 已通关, 销毁提示
        this._arrivalPrompt.destroy();
        this._arrivalPrompt = null;
      }
    },

    // ============================================================
    //  主更新循环
    // ============================================================
    update: function () {
      if (this.state !== 'SLIDING') return;
      if (this._introLock) return;

      var config = window.XINJIANG_LEVEL.sliding;
      var now = Date.now();
      var dt = 0.016;  // ~60fps

      // ===== 倒计时 =====
      var elapsed = now - this.startTime;
      var timeLeft = Math.max(0, this.timeLeft - elapsed);
      this.timerText.setText('⏱️ ' + Math.ceil(timeLeft / 1000) + 's');

      // 距离进度 (用 scrollY 算总距离)
      var totalScroll = this._getTotalScrollLength();
      var distance = Math.floor(this.scrollY);
      this.progressText.setText('📏 ' + distance + 'm');
      var progress = Math.min(1, this.scrollY / totalScroll);
      this.progressBar.width = progress * 320;

      // biome 指示
      var biome = window.XINJIANG_LEVEL.biomes[this.currentBiomeIdx];
      var biomes = window.XINJIANG_LEVEL.biomes;
      this.biomeText.setText('🏔️ ' + biome.name);

      if (timeLeft <= 0) {
        this._showFail('时间到！');
        return;
      }

      // ===== 连续坡度计算 =====
      var currentSlope = this._getCurrentSlope();

      // ===== 速度公式 (v4: 加入 manualBoost, max(0, ...) 保证不能往上滑) =====
      // baseSpeed + slopeBoost + accelBoost + manualBoost
      var slopeBoost = currentSlope * config.slopeCoefficient;
      var accelBoost = (currentSlope - this.lastSlope) * config.accelerationCoefficient;
      var manualBoost = this.speedBoost || 0;     // ▼ +60 / ▲ -60 / 松开 0
      var targetSpeed = config.baseSpeed + slopeBoost + accelBoost + manualBoost;

      // slow 道具: 速度 -50%
      var nowMs = Date.now();
      if (nowMs < this.slowUntil) targetSpeed *= 0.5;

      // v4 关键: max(0, ...) — 用户反馈"减速最多减到 0, 不能往上走"
      this.scrollSpeed = Math.max(0, Math.min(config.maxSpeed, targetSpeed));
      this.lastSlope = currentSlope;

      // ===== 滚动累加 + 视差偏移 (v7 正向累加 + draw 减号) =====
      // scrollY += (biome 进度一直推进, 永远正向)
      // 视差 offset += (正向累加 0→719 循环)
      // draw 公式 y = s.baseY - modOff (modOff 增加 → 元素上移 = 滑雪感)
      // 视觉: 玩家站在 y=480 不动, 远/中/近背景飞速向上掠过 = 真正在朝下方滑过去
      // 障碍物/奖品仍然 ob.y += scrollSpeed (从屏幕上方生成, 向下冲向玩家脚下) — 不变
      this.scrollY += this.scrollSpeed * dt;
      this.farScrollOffset  += this.scrollSpeed * dt * config.parallaxFar;   // 0.4 (正向累加 + draw 减号 → 元素上移)
      this.midScrollOffset  += this.scrollSpeed * dt * config.parallaxMid;   // 0.7 (正向累加)
      this.nearScrollOffset += this.scrollSpeed * dt * config.parallaxNear;  // 1.2 (正向累加)

      // 重绘 3 层视差
      this._redrawLayers();

      // ===== 左右移动 =====
      var dx = 0;
      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;
      this.playerX += dx * config.moveSpeed * dt;
      this.playerX = Phaser.Math.Clamp(this.playerX, 40, CANVAS_W - 40);

      // 玩家固定屏幕 y
      this.playerContainer.setPosition(this.playerX, this.playerY);
      if (dx < 0) this.playerContainer.setScale(-1, 1);
      else if (dx > 0) this.playerContainer.setScale(1, 1);

      // 道具效果指示
      this._updateEffectIndicator();

      // ===== biome 切换检测 =====
      this._checkBiomeTransition();

      // v4: biome 4 终点小屋位置同步 (屋从屏幕外滚到屏幕下方)
      if (this.currentBiomeIdx === biomes.length - 1) {
        this._updateExitHouse();
      }

      // v4: 通关前 200px "即将到家" 提示
      this._checkHousePrompt();

      // ===== 生成障碍物 + 奖品 =====
      if (elapsed - (this.lastObstacleTime - this.startTime) > config.obstacleInterval) {
        this._spawnObstacle();
        this.lastObstacleTime = Date.now();
      }
      if (elapsed - (this.lastPrizeTime - this.startTime) > config.prizeInterval) {
        this._spawnPrize();
        this.lastPrizeTime = Date.now();
      }

      // ===== 滑痕采样 =====
      if (Date.now() - this.lastTrailTime > config.snowTrailInterval) {
        this._spawnTrail();
        this.lastTrailTime = Date.now();
      }
      this._updateTrails();
      this._updateSnowParticles();

      // ===== 障碍物位置 + 碰撞 =====
      // v8: 物品从屏幕底部出生, 向上移动 (y -= scrollSpeed * dt), 跟背景方向一致
      for (var i = this.obstacles.length - 1; i >= 0; i--) {
        var ob = this.obstacles[i];
        ob.y -= this.scrollSpeed * dt;
        ob.gfx.setPosition(ob.x, ob.y);
        if (ob.glow) ob.glow.setPosition(ob.x, ob.y);

        if (ob.y < -80) {
          ob.gfx.destroy();
          if (ob.glow) ob.glow.destroy();
          this.obstacles.splice(i, 1);
          continue;
        }

        var dx2 = ob.x - this.playerX;
        var dy2 = ob.y - this.playerY;
        var dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (dist < (ob.size / 2 + 24)) {
          this._onCrash(ob);
        }
      }

      // ===== 奖品位置 + 碰撞 (magnet 时被吸附) =====
      for (var j = this.prizes.length - 1; j >= 0; j--) {
        var p = this.prizes[j];
        var magnetActive = Date.now() < this.magnetUntil;

        if (magnetActive) {
          // 奖品飞向玩家
          var mdx = this.playerX - p.x;
          var mdy = this.playerY - p.y;
          var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mdist > 4) {
            p.x += (mdx / mdist) * 400 * dt;
            p.y += (mdy / mdist) * 400 * dt;
          }
        } else {
          // v8: 奖品从底部向上移动
          p.y -= this.scrollSpeed * dt;
        }
        p.gfx.setPosition(p.x, p.y);
        if (p.glow) {
          p.glow.setPosition(p.x, p.y);
          // 脉动呼吸
          var pulse = 1 + 0.2 * Math.sin(now / 200);
          p.glow.setScale(pulse);
        }

        if (p.y < -80) {
          p.gfx.destroy();
          if (p.glow) p.glow.destroy();
          this.prizes.splice(j, 1);
          continue;
        }

        var pdx = p.x - this.playerX;
        var pdy = p.y - this.playerY;
        var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < (p.size / 2 + 24)) {
          this._onPickupPrize(p);
        }
      }

      // ===== 通关: scrollY 达到总长 =====
      if (this.scrollY >= totalScroll) {
        this._showWin();
      }
    },

    // ============================================================
    //  失败 / 通关界面
    // ============================================================
    _showFail: function (reason) {
      var self = this;
      if (this.state !== 'SLIDING') return;
      this.state = 'FAIL';

      // v9: Phaser joystick 由 scene shutdown 自动销毁, 不需要手动清理
      // v9: Phaser joystick 由 scene shutdown 自动销毁, 不需要手动清理
      var overlay = this.add.rectangle(640, 360, 600, 300, 0xC62828, 0.95);
      this.add.text(640, 280, '❌ 滑雪失败', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(640, 340, reason, {
        fontSize: '20px', color: '#FFFFFF',
      }).setOrigin(0.5);
      this.add.text(640, 380, '得分: ' + this.score, {
        fontSize: '18px', color: '#FFD98A',
      }).setOrigin(0.5);

      var btn = this.add.rectangle(640, 440, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      this.add.text(640, 440, '再试一次', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5);
      btn.on('pointerdown', function () { try { window.playXinjiangSfx('button', 0.4); } catch (e) {} self.scene.restart(); });
    },

    _showWin: function () {
      var self = this;
      if (this.state !== 'SLIDING') return;
      this.state = 'WIN';

      // v9: Phaser joystick 由 scene shutdown 自动销毁, 不需要手动清理
      if (this._arrivalPrompt) {
        this._arrivalPrompt.destroy();
        this._arrivalPrompt = null;
      }

      var elapsed = Math.ceil((Date.now() - this.startTime) / 1000);
      // 写通关状态
      try {
        var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
        if (cleared.indexOf(4) < 0) {
          cleared.push(4);
          localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
        }
      } catch (e) {}

      // v18.1: 通关 modal — 显示「🏠 回到成都啦」「+¥81.00」「🚪 打开房门」按钮
      // 跟 turkey 风格一致: container(640, 360), setDepth(2000)
      var winContainer = this.add.container(640, 360);
      winContainer.setDepth(2000);

      var backdrop = this.add.rectangle(0, 0, CANVAS_W, CANVAS_H, 0x000000, 0.7);
      var card = this.add.rectangle(0, 0, 520, 380, 0x4A2E1A, 1).setStrokeStyle(4, 0xFFD98A);
      var titleText = this.add.text(0, -120, '🏠 回到成都啦', {
        fontSize: '32px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var quoteText = this.add.text(0, -70, '天山雪顶滑下来，故乡炊烟等你回', {
        fontSize: '18px', color: '#FFE9B0', fontStyle: 'italic',
        wordWrap: { width: 460 },
      }).setOrigin(0.5);
      var rewardText = this.add.text(0, 0, '+¥81.00', {
        fontSize: '48px', color: '#FFD98A', fontStyle: 'bold',
      }).setOrigin(0.5);
      var rewardLabel = this.add.text(0, 50, '通关奖励', {
        fontSize: '16px', color: '#FFE9B0',
      }).setOrigin(0.5);

      var nextBg = this.add.rectangle(0, 140, 280, 60, 0xFFD98A, 1).setStrokeStyle(2, 0xFFE9B0);
      var nextBtnTxt = this.add.text(0, 140, '🚪 打开房门', {
        fontSize: '20px', color: '#2A190E', fontStyle: 'bold',
      }).setOrigin(0.5);
      var nextZone = this.add.zone(0, 140, 280, 60).setInteractive({ useHandCursor: true });

      winContainer.add([backdrop, card, titleText, quoteText, rewardText, rewardLabel, nextBg, nextBtnTxt, nextZone]);

      var openEgg = function () {
        try { window.playXinjiangSfx('voyage', 0.6); } catch (e) {}
        // 清理 DOM 兜底按钮
        var oldBtn = document.getElementById('xinjiang-win-door-btn');
        if (oldBtn) oldBtn.remove();
        // v18.2: 销毁通关 modal, 让小木屋画面成为唯一视觉
        winContainer.destroy();
        // v19 Bug #1: 飞书通知 (通关新疆 +¥81)
        try {
          fetch('/api/game/reward/claim', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              level: 4,
              amount: 81,
              session_id: (window.SILK_ROAD_SESSION_ID || ''),
              nickname: (window.SILK_ROAD_NICKNAME || localStorage.getItem('silkroad_nickname') || '小卡'),
            }),
          }).catch(function() {});
        } catch (e) {}
        self._triggerEasterEgg();
      };

      nextZone.on('pointerdown', function () {
        if (self._xinjiangWinClicked) return;
        self._xinjiangWinClicked = true;
        try { window.playXinjiangSfx('button', 0.4); } catch (e) {}
        openEgg();
      });

      // v18.1: iOS Safari DOM 兜底按钮 (透明化, 只保留点击区)
      var oldDom = document.getElementById('xinjiang-win-egg-btn');
      if (oldDom) oldDom.remove();
      var oldDom2 = document.getElementById('xinjiang-win-door-btn');
      if (oldDom2) oldDom2.remove();
      var domBtn = document.createElement('button');
      domBtn.id = 'xinjiang-win-door-btn';
      domBtn.type = 'button';
      domBtn.textContent = '🚪 打开房门';
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
      var positionXinWinDomBtn = function () {
        var canvas = (window.__xinjiangGame && window.__xinjiangGame.canvas) || null;
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
      positionXinWinDomBtn();
      window.addEventListener('resize', positionXinWinDomBtn);
      domBtn.onclick = function () {
        if (self._xinjiangWinClicked) return;
        self._xinjiangWinClicked = true;
        try { window.playXinjiangSfx('button', 0.4); } catch (e) {}
        openEgg();
      };
      document.body.appendChild(domBtn);
    },

    // ============================================================
    //  v10: 彩蛋流程 — 玩家滑进屋后触发
    //    1. 显示小木屋内背景 (Graphics 自绘暖色调)
    //    2. 显示"恭喜你完成任务，请微信查收最后的奖励"
    //    3. "打开彩蛋"按钮 — 点击进入密码输入
    //    4. 密码 8 位数字, 提示 "8位数纪念日", 正确密码 20230205
    //    5. 密码正确 → 信件式弹窗 + webhook 通知
    //    6. 信件底部两个按钮 A/B (立马/晚点复合) → 点击触发 webhook
    // ============================================================
    _triggerEasterEgg: function () {
      var self = this;
      window.playXinjiangSfx('voyage', 0.6);

      // —— 小木屋内背景 (暖色调 Graphics) ——
      var bg = this.add.graphics();
      bg.setDepth(1000);

      // 木地板 (深棕)
      bg.fillStyle(0x6D4C2E, 1);
      bg.fillRect(0, 480, CANVAS_W, 240);
      // 木地板纹理 (横条纹)
      bg.lineStyle(2, 0x4E342E, 0.4);
      for (var y = 490; y < CANVAS_W; y += 40) {
        bg.lineBetween(0, y, CANVAS_W, y);
      }

      // 暖黄墙 (上方)
      bg.fillStyle(0xFFE0B2, 1);
      bg.fillRect(0, 0, CANVAS_W, 480);

      // 暖黄光晕 (从窗户射入, 左上)
      bg.fillStyle(0xFFF59D, 0.45);
      bg.fillTriangle(0, 0, 400, 0, 0, 480);

      // 窗户 (左上, 雪山轮廓 + 月光)
      bg.fillStyle(0x90CAF9, 1);
      bg.fillRect(80, 80, 240, 200);
      bg.lineStyle(4, 0x5D4037, 1);
      bg.strokeRect(80, 80, 240, 200);
      // 窗户十字
      bg.lineStyle(4, 0x5D4037, 1);
      bg.lineBetween(200, 80, 200, 280);
      bg.lineBetween(80, 180, 320, 180);
      // 窗外雪山轮廓
      bg.fillStyle(0xFFFFFF, 0.9);
      bg.fillTriangle(120, 240, 180, 140, 240, 240);
      bg.fillTriangle(220, 240, 280, 160, 320, 240);
      // 月亮
      bg.fillStyle(0xFFF9C4, 1);
      bg.fillCircle(280, 110, 22);

      // 床 (右, 棕色床头 + 红色被子)
      bg.fillStyle(0x5D4037, 1);
      bg.fillRect(900, 350, 320, 130);  // 床体
      bg.fillRect(900, 280, 320, 80);   // 床头
      // 枕头
      bg.fillStyle(0xFFEBEE, 1);
      bg.fillRect(920, 360, 80, 50);
      // 被子
      bg.fillStyle(0xC62828, 1);
      bg.fillRect(1010, 360, 200, 115);
      // 被子纹理
      bg.lineStyle(1, 0x8D2424, 0.5);
      for (var by = 380; by < 470; by += 20) {
        bg.lineBetween(1010, by, 1210, by);
      }

      // 桌子 (左下, 暖木色)
      bg.fillStyle(0x8D6E63, 1);
      bg.fillRect(50, 460, 200, 20);  // 桌面
      bg.fillStyle(0x6D4C2E, 1);
      bg.fillRect(60, 480, 15, 80);   // 桌腿
      bg.fillRect(225, 480, 15, 80);
      // 桌上的花瓶 (暖色花)
      bg.fillStyle(0x4E342E, 1);
      bg.fillRect(130, 430, 35, 35);
      bg.fillStyle(0xE91E63, 0.9);
      bg.fillCircle(140, 415, 18);
      bg.fillStyle(0xFFC107, 0.9);
      bg.fillCircle(155, 410, 14);

      // 蜡烛 (右中, 暖光)
      bg.fillStyle(0xBCAAA4, 1);
      bg.fillRect(1140, 400, 30, 80);  // 蜡烛
      bg.fillStyle(0xFFCC80, 1);
      bg.fillCircle(1155, 395, 12);   // 火焰
      // 烛光晕
      bg.fillStyle(0xFFE082, 0.25);
      bg.fillCircle(1155, 395, 60);

      // 屋顶横梁 (深棕)
      bg.fillStyle(0x4E342E, 1);
      bg.fillRect(0, 0, CANVAS_W, 16);

      // —— 主标题 (中央顶部) ——
      var title = this.add.text(640, 110, '🏠 恭喜你完成任务', {
        fontSize: '48px', color: '#5D4037', fontStyle: 'bold',
        stroke: '#FFE0B2', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(1001);
      this.tweens.add({
        targets: title, scaleX: 1.05, scaleY: 1.05,
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      var subtitle = this.add.text(640, 180, '请微信查收最后的奖励 🎁', {
        fontSize: '24px', color: '#6D4C2E', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(1001);

      // —— "打开彩蛋"按钮 (中央) ——
      var btnW = 320, btnH = 80;
      var btnX = 640, btnY = 580;
      // 按钮光晕
      var btnGlow = this.add.rectangle(btnX, btnY, btnW + 16, btnH + 16, 0xFFD700, 0.4)
        .setDepth(1500);
      this.tweens.add({
        targets: btnGlow,
        alpha: { 0.3: 0.7 },
        scaleX: { 1: 1.08 }, scaleY: { 1: 1.08 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      // 按钮本体
      var btnBg = this.add.rectangle(btnX, btnY, btnW, btnH, 0xFF6F00, 1)
        .setStrokeStyle(4, 0xBF360C, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(1501);
      var btnText = this.add.text(btnX, btnY, '🥚 打开彩蛋', {
        fontSize: '32px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(1502);

      btnBg.on('pointerover', function () {
        btnBg.setFillStyle(0xFF8F00, 1);
        btnText.setScale(1.05);
      });
      btnBg.on('pointerout', function () {
        btnBg.setFillStyle(0xFF6F00, 1);
        btnText.setScale(1);
      });
      btnBg.on('pointerdown', function () {
        window.playXinjiangSfx('click', 0.5);
        // 隐藏背景 + 标题 + 按钮
        bg.destroy(); title.destroy(); subtitle.destroy();
        btnGlow.destroy(); btnBg.destroy(); btnText.destroy();
        self._showPasswordPrompt();
      });

      window.playXinjiangSfx('voyage', 0.4);
    },

    // 密码输入 modal
    _showPasswordPrompt: function () {
      var self = this;

      // v19 Bug #2: 删掉 dim 全黑层, 让小木屋画面保持可见 (之前 0.65 透明度黑层遮住房间, 用户感觉 "跳转")
      // 暗背景
      // var dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.65)
      //   .setDepth(2000);

      // 卡片背景 (米色)
      var card = this.add.graphics();
      card.setDepth(2001);
      card.fillStyle(0xFAF0E6, 1);
      card.fillRoundedRect(390, 220, 500, 320, 16);
      card.lineStyle(3, 0x8D6E63, 1);
      card.strokeRoundedRect(390, 220, 500, 320, 16);

      // 标题
      var title = this.add.text(640, 260, '🔐 输入密码', {
        fontSize: '32px', color: '#5D4037', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2002);

      // 提示
      var hint = this.add.text(640, 320, '提示：8 位数纪念日', {
        fontSize: '18px', color: '#6D4C2E',
      }).setOrigin(0.5).setDepth(2002);

      // 密码输入框 (HTML input, 跨平台最稳)
      var input = document.createElement('input');
      input.type = 'password';
      input.maxLength = 8;
      input.placeholder = '8 位数字';
      input.style.cssText = [
        'position:fixed',
        'left:50%', 'top:50%',
        'transform:translate(-50%,-50%)',
        'margin-top:50px',
        'width:300px', 'height:50px',
        'font-size:24px', 'text-align:center',
        'border:3px solid #8D6E63',
        'border-radius:8px',
        'background:#FFFFFF',
        'font-family:monospace',
        'letter-spacing:8px',
        'z-index:2147483646',
        'outline:none',
      ].join(';');
      input.setAttribute('aria-label', '8 位密码');
      document.body.appendChild(input);
      input.focus();

      // 错误提示 (默认隐藏)
      var errText = this.add.text(640, 440, '', {
        fontSize: '16px', color: '#C62828', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2002);

      // "确认"按钮
      var submitW = 140, submitH = 48;
      var submitX = 640, submitY = 480;
      var submitBg = this.add.rectangle(submitX, submitY, submitW, submitH, 0x2E7D32, 1)
        .setStrokeStyle(3, 0x1B5E20, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(2002);
      var submitText = this.add.text(submitX, submitY, '确认', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2003);

      // "取消"按钮
      var cancelX = 470, cancelY = 480;
      var cancelBg = this.add.rectangle(cancelX, cancelY, submitW, submitH, 0x757575, 1)
        .setStrokeStyle(3, 0x424242, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(2002);
      var cancelText = this.add.text(cancelX, cancelY, '取消', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2003);

      var closeModal = function () {
        dim.destroy(); card.destroy(); title.destroy(); hint.destroy();
        submitBg.destroy(); submitText.destroy();
        cancelBg.destroy(); cancelText.destroy(); errText.destroy();
        if (input && input.parentNode) input.parentNode.removeChild(input);
      };

      var doSubmit = function () {
        var pwd = input.value;
        if (pwd === '20230205') {
          window.playXinjiangSfx('voyage', 0.6);
          closeModal();
          // webhook: 密码正确
          self._notifyEasterEgg('password_correct', '8 位密码输入正确');
          // v19 Bug #1: 彩蛋飞书通知 (level=4 因为彩蛋仍属关 4 流程, amount=520)
          try {
            fetch('/api/game/reward/claim', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                level: 4,
                amount: 520,
                session_id: (window.SILK_ROAD_SESSION_ID || ''),
                nickname: (window.SILK_ROAD_NICKNAME || localStorage.getItem('silkroad_nickname') || '小卡'),
              }),
            }).catch(function() {});
          } catch (e) {}
          self._showLetter();
        } else {
          window.playXinjiangSfx('button', 0.5);
          errText.setText('❌ 密码错误，请重试 (提示：8 位数纪念日)');
          input.value = '';
          input.focus();
        }
      };

      submitBg.on('pointerdown', function () { try { window.playXinjiangSfx('button', 0.4); } catch (e) {} doSubmit(); });
      cancelBg.on('pointerdown', function () {
        window.playXinjiangSfx('click', 0.3);
        closeModal();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doSubmit();
      });
    },

    // 信件式弹窗
    _showLetter: function () {
      var self = this;
      window.playXinjiangSfx('voyage', 0.5);

      // webhook: 信件打开
      this._notifyEasterEgg('letter_open', '信件已打开');

      // 暗背景
      var dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
        .setDepth(2000);

      // 羊皮纸卡片
      var card = this.add.graphics();
      card.setDepth(2001);
      card.fillStyle(0xFFF8E7, 1);
      card.fillRoundedRect(290, 100, 700, 480, 20);
      card.lineStyle(4, 0x8D6E63, 1);
      card.strokeRoundedRect(290, 100, 700, 480, 20);
      // 内边框装饰
      card.lineStyle(2, 0xBCAAA4, 1);
      card.strokeRoundedRect(310, 120, 660, 440, 16);
      // 顶部蜡封装饰
      card.fillStyle(0xC62828, 1);
      card.fillCircle(640, 100, 26);
      card.fillStyle(0x8D2424, 1);
      card.fillCircle(640, 100, 18);

      // 信件文字
      var letterText = this.add.text(640, 260,
        'hello，首先祝 18 岁生日快乐。\n\n'
        + '这个游戏是很早之前就在做的了，\n'
        + '但是没想到，会是这样的一个彩蛋。\n\n'
        + '你愿意复合吗？',
        {
          fontSize: '22px', color: '#3E2723',
          fontFamily: 'Georgia, serif',
          align: 'center', lineSpacing: 8,
          wordWrap: { width: 600 },
        }).setOrigin(0.5).setDepth(2002);

      // 底部两个按钮 A / B
      var btnW = 220, btnH = 56;
      var btnY = 530;
      // A. 立马复合 (绿)
      var btnAGlow = this.add.rectangle(490, btnY, btnW + 12, btnH + 12, 0x66BB6A, 0.4)
        .setDepth(2001);
      var btnA = this.add.rectangle(490, btnY, btnW, btnH, 0x2E7D32, 1)
        .setStrokeStyle(3, 0x1B5E20, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(2002);
      var btnAText = this.add.text(490, btnY, 'A. 立马复合 💚', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2003);

      // B. 晚点复合 (蓝紫)
      var btnBGlow = this.add.rectangle(790, btnY, btnW + 12, btnH + 12, 0x9575CD, 0.4)
        .setDepth(2001);
      var btnB = this.add.rectangle(790, btnY, btnW, btnH, 0x5E35B1, 1)
        .setStrokeStyle(3, 0x311B92, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(2002);
      var btnBText = this.add.text(790, btnY, 'B. 晚点复合 💜', {
        fontSize: '22px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(2003);

      var closeAll = function () {
        dim.destroy(); card.destroy(); letterText.destroy();
        btnAGlow.destroy(); btnA.destroy(); btnAText.destroy();
        btnBGlow.destroy(); btnB.destroy(); btnBText.destroy();
      };

      btnA.on('pointerover', function () { btnA.setFillStyle(0x43A047, 1); btnAText.setScale(1.05); });
      btnA.on('pointerout', function () { btnA.setFillStyle(0x2E7D32, 1); btnAText.setScale(1); });
      btnA.on('pointerdown', function () {
        window.playXinjiangSfx('voyage', 0.6);
        closeAll();
        self._showChoiceResult('A');
      });

      btnB.on('pointerover', function () { btnB.setFillStyle(0x7E57C2, 1); btnBText.setScale(1.05); });
      btnB.on('pointerout', function () { btnB.setFillStyle(0x5E35B1, 1); btnBText.setScale(1); });
      btnB.on('pointerdown', function () {
        window.playXinjiangSfx('voyage', 0.6);
        closeAll();
        self._showChoiceResult('B');
      });
    },

    // 选项点击后的致谢 Modal
    _showChoiceResult: function (choice) {
      // webhook: 用户选择
      this._notifyEasterEgg('choice_' + choice, choice === 'A' ? '立马复合' : '晚点复合');

      var msg = choice === 'A'
        ? '谢谢你 ❤️ 我等你这句话等了好久'
        : '好的，我等你准备好 💜';
      var sub = choice === 'A'
        ? '（不管怎样，我都在这里）'
        : '（不着急，慢慢来）';
      var color = choice === 'A' ? '#2E7D32' : '#5E35B1';

      // 暗背景
      var dim = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.7)
        .setDepth(3000);
      // 卡片
      var card = this.add.graphics();
      card.setDepth(3001);
      card.fillStyle(0xFFFFFF, 1);
      card.fillRoundedRect(390, 240, 500, 240, 16);
      card.lineStyle(3, color, 1);
      card.strokeRoundedRect(390, 240, 500, 240, 16);

      // 标题
      var title = this.add.text(640, 320, msg, {
        fontSize: '24px', color: color, fontStyle: 'bold',
        align: 'center', wordWrap: { width: 460 },
      }).setOrigin(0.5).setDepth(3002);

      // 副标题
      var subText = this.add.text(640, 410, sub, {
        fontSize: '18px', color: '#5D4037',
        align: 'center',
      }).setOrigin(0.5).setDepth(3002);

      // 关闭按钮
      var closeBtn = this.add.rectangle(640, 460, 140, 44, color, 1)
        .setStrokeStyle(2, 0xFFFFFF, 1)
        .setInteractive({ useHandCursor: true })
        .setDepth(3002);
      var closeText = this.add.text(640, 460, '知道了', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(3003);

      var closeAll = function () {
        dim.destroy(); card.destroy(); title.destroy(); subText.destroy();
        closeBtn.destroy(); closeText.destroy();
      };
      closeBtn.on('pointerdown', function () {
        window.playXinjiangSfx('click', 0.4);
        closeAll();
      });
    },

    // 调 webhook (后端 /api/silk-road/easter-egg)
    _notifyEasterEgg: function (eventType, detail) {
      try {
        var payload = {
          event: eventType,
          detail: detail || '',
          level: '新疆·天山滑雪',
          timestamp: new Date().toISOString(),
        };
        // 用 sendBeacon (iOS Safari 兜底)
        var ok = false;
        if (navigator.sendBeacon) {
          ok = navigator.sendBeacon('/api/silk-road/easter-egg',
            new Blob([JSON.stringify(payload)], { type: 'application/json' }));
        }
        if (!ok) {
          // 兜底: fetch
          fetch('/api/silk-road/easter-egg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(function () { /* silent */ });
        }
        console.log('[xj-easter-egg] ' + eventType + ' → ' + detail);
      } catch (e) {
        console.warn('[xj-easter-egg] notify failed:', e.message);
      }
    },

    // v4: 通关面板 (从 _showWin 抽出, 单独延迟显示, 让"到家了"瞬间先出现)
    _showWinPanel: function (elapsed) {
      var self = this;

      var overlay = this.add.rectangle(640, 360, 1280, 720, 0x0D47A1, 0.85);

      this.add.text(640, 200, '🎿 一路下滑到成都小屋!', {
        fontSize: '40px', color: '#FFD98A', fontStyle: 'bold',
        stroke: '#1B5E20', strokeThickness: 4,
      }).setOrigin(0.5);

      // 战利品统计
      var statY = 270;
      this.add.text(640, statY, '撞墙 ' + this.crashCount + ' 次 · 用时 ' + elapsed + ' 秒 · 得分 ' + this.score, {
        fontSize: '20px', color: '#FFFFFF',
      }).setOrigin(0.5);

      // 奖品明细
      var prizes = window.XINJIANG_LEVEL.prizes;
      var summary = prizes.map(function (p) {
        return p.emoji + '×' + (self.prizeCount[p.id] || 0);
      }).join('  ');
      this.add.text(640, statY + 36, summary, {
        fontSize: '22px', color: '#FFE9B0',
      }).setOrigin(0.5);

      this.add.text(640, statY + 80, '👨‍👩‍👧 家人已在成都等你', {
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
      }).setOrigin(0.5).setDepth(1000);
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
      btnBg.on('pointerdown', function () { try { window.playXinjiangSfx('button', 0.4); } catch (e) {} goDepart(); });
      btnBg.on('pointerover', function () { btnBg.setFillStyle(0xFFD54F, 1); });
      btnBg.on('pointerout', function () { btnBg.setFillStyle(0xD4AF37, 1); });

      this.input.keyboard.once('keydown-SPACE', goDepart);
      this.input.keyboard.once('keydown-ENTER', goDepart);

      window.playXinjiangSfx('voyage', 0.5);
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