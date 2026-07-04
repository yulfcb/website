// 卡塔尔·多哈·沙海寻路 —— 游戏引擎（M5）
//
// 状态机：INTRO → PLAYING → PICKUP_MODAL × N → RESULT → claimReward / claimSecret
//
// 与 level-engine.js 不同：本文件**完全自管 UI**。M2 的 silk-start/clickN 次 那条路不走。
// 关 0 通关判定 = 玩家拾取 ≥ 3 件礼物（且全部 6 件走完或渴死）。
//
// 真实接口（不改动）：
//   /api/game/reward/claim —— 通关领奖（4 档之一）
//   /api/game/secret      —— 渴死复活（只发秘密，不调 reward）
//   /api/game/session     —— session 兜底
//
// 暴露给 level-engine.js 的钩子：window.SLK_QATAR_INIT() 被外部调起。

(function () {
  'use strict';

  // —— DOM 引用 ——
  var stageEl = document.getElementById('qatar-canvas');
  var waterEl = document.getElementById('qatar-water-value');
  var pickupEl = document.getElementById('qatar-pickup-value');
  var luggageEl = document.getElementById('qatar-luggage-value');
  var npcBanner = document.getElementById('qatar-npc-banner');
  var npcText = document.getElementById('qatar-npc-text');
  var pauseBtn = document.getElementById('qatar-pause');
  var hintEl = document.getElementById('qatar-hint');
  var winPanel = document.getElementById('silk-win');
  var quoteText = document.getElementById('silk-quote');
  var rewardText = document.getElementById('silk-reward');
  var nextBtn = document.getElementById('silk-next');
  var statusEl = document.getElementById('silk-webhook-status');

  // 礼物 modal 元素（_level_qatar.html 提供）
  var giftModal = document.getElementById('qatar-gift-modal');
  var giftTitle = document.getElementById('qatar-gift-title');
  var giftSub = document.getElementById('qatar-gift-sub');
  var giftBucketBtn = document.getElementById('qatar-gift-bucket');
  var giftStayBtn = document.getElementById('qatar-gift-stay');
  var giftDropBtn = document.getElementById('qatar-gift-drop');

  // 老商人 popup
  var merchantPopup = document.getElementById('qatar-merchant-popup');
  var merchantCloseBtn = document.getElementById('qatar-merchant-close');

  // 结果 modal（RESULT 档位展示）
  var resultModal = document.getElementById('qatar-result-modal');
  var resultTier = document.getElementById('qatar-result-tier');
  var resultQuote = document.getElementById('qatar-result-quote');
  var resultStats = document.getElementById('qatar-result-stats');
  var resultContinueBtn = document.getElementById('qatar-result-continue');

  // 复活 modal 容器（page-level，模板会 include 现有的 _revive_modal.html）
  // 复用 _revive_modal.html 的元素
  var reviveModal = document.getElementById('silk-revive');
  var reviveText = document.getElementById('silk-revive-text');
  var reviveSendBtn = document.getElementById('slk-revive-send');
  var reviveGiveupBtn = document.getElementById('slk-revive-giveup');
  var reviveStatus = document.getElementById('slk-revive-status');

  if (!stageEl) {
    console.error('[qatar] #qatar-canvas missing, abort');
    return;
  }

  var LEVEL_ID = 0;
  var L = window.QATAR_LEVEL;
  if (!L) {
    console.error('[qatar] window.QATAR_LEVEL missing, abort');
    return;
  }

  // 4 档奖励映射（M5 spec：所有 amount 在前端 game.js 里查表）
  var QATAR_REWARD_TIERS = {
    PERFECT: 20.20,    // 6 件全收 + 水分 > 5
    NORMAL:  13.14,    // 4-5 件收 + 水分 > 0
    HARD:    6.66,     // 3 件 + 水分 > 0
    DEAD:    0,        // 渴死（不调 reward/claim，只调 secret）
  };

  // —— 状态 ——
  var nickname = (localStorage.getItem('silkroad_nickname') || '小卡').slice(0, 20);
  var SESSION_ID = localStorage.getItem('silkroad_session_id') || '';
  var claimedKey = 'silkroad_claimed_' + SESSION_ID + '_' + LEVEL_ID;
  var alreadyClaimed = !!SESSION_ID && localStorage.getItem(claimedKey) === '1';

  var STATE = { INTRO: 0, PLAYING: 1, PICKUP: 2, RESULT: 3, DEAD: 4 };
  var state = STATE.INTRO;

  // —— 玩家 ——
  var player = {
    x: L.start.x,
    y: L.start.y,
    lastMoveAt: 0,
    walkPhase: 0,
    facing: 1, // 1=right, -1=left
  };

  // —— 资源 ——
  var water = L.WATER_MAX;
  var pickupCount = 0;        // 拾取动作总数（包含放弃的）
  var luggageCount = 0;       // 装进行李的件数
  var giftBuckets = {};       // gift_id → 'bucket' | 'stay' | 'drop'
  var currentGiftId = null;   // 弹 modal 时锁定的礼物 id

  // —— Pixi 应用 ——
  var app = null;
  var bgLayer = null;
  var midLayer = null;
  var fgLayer = null;     // 玩家 / 礼物 / 绿洲
  var placeTexts = [];    // 6 个地名 chip
  var giftSprites = [];
  var oasisSprites = [];
  var playerSprite = null;
  var merchantSprite = null;
  var dustTrail = [];

  // —— NPC banner 帧控制 ——
  var npcFrame = 0;
  var npcShownPickup3 = false;

  // —— 暂停 ——
  var paused = false;

  // —— 移动步数（淡出方向键提示）——
  var moveCount = 0;
  var hintHidden = false;

  // ==================== 初始化 ====================

  function initPixi() {
    // M6: 跟随 .qatar-canvas-wrap 容器 resize（横竖屏切换自动缩放）
    var canvasWrap = document.querySelector('.qatar-canvas-wrap') || stageEl;
    app = new PIXI.Application({
      width: L.CANVAS_W,
      height: L.CANVAS_H,
      backgroundColor: 0xE8C282,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      resizeTo: canvasWrap,
    });
    stageEl.appendChild(app.view);

    bgLayer = new PIXI.Container();
    midLayer = new PIXI.Container();
    fgLayer = new PIXI.Container();
    app.stage.addChild(bgLayer);
    app.stage.addChild(midLayer);
    app.stage.addChild(fgLayer);

    // 顶部沙金 → 底部深沙 渐变背景（模拟沙漠日落）
    var bg = new PIXI.Graphics();
    bg.beginFill(0xC49A5E);
    bg.drawRect(0, 0, L.CANVAS_W, L.CANVAS_H * 0.4);
    bg.endFill();
    bg.beginFill(0xE8C282);
    bg.drawRect(0, L.CANVAS_H * 0.4, L.CANVAS_W, L.CANVAS_H * 0.6);
    bg.endFill();
    bgLayer.addChild(bg);

    // 远景沙丘（3 层 parallax 0.3x）—— 用简单半透明白曲线
    drawDunes(bgLayer, 0xD4A86A, 0.30, 40);
    drawDunes(bgLayer, 0xC49A5E, 0.45, 60);
    drawDunes(bgLayer, 0xB58A55, 0.60, 90);

    // 地名 chip（6 个）—— 放 midLayer
    L.places.forEach(function (p) {
      var chip = makePlaceChip(p);
      midLayer.addChild(chip);
      placeTexts.push(chip);
    });

    // 绿洲（2 个）
    L.oases.forEach(function (o) {
      var oasis = makeOasisSprite(o);
      fgLayer.addChild(oasis);
      oasisSprites.push(oasis);
    });

    // 礼物（6 个）
    L.gifts.forEach(function (g) {
      var sp = makeGiftSprite(g);
      fgLayer.addChild(sp);
      giftSprites.push(sp);
    });

    // 老商人 NPC（Souq Waqif 位置）
    var merchant = makeMerchantSprite(L.merchant);
    fgLayer.addChild(merchant);
    merchantSprite = merchant;

    // 玩家 = 🧝 + 🐪 在身后（小驼队）
    var camel = new PIXI.Text('🐪', {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 38,
    });
    camel.anchor.set(0.5);
    camel.x = player.x - 30;
    camel.y = player.y + 5;
    fgLayer.addChild(camel);

    var elf = new PIXI.Text('🧝', {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 44,
    });
    elf.anchor.set(0.5);
    elf.x = player.x;
    elf.y = player.y;
    fgLayer.addChild(elf);
    playerSprite = { elf: elf, camel: camel, dust: null };
  }

  function drawDunes(layer, color, baseY, amplitude) {
    var g = new PIXI.Graphics();
    g.beginFill(color, 0.6);
    g.moveTo(0, baseY);
    for (var x = 0; x <= L.CANVAS_W; x += 30) {
      var peak = Math.sin(x * 0.013) * amplitude + Math.cos(x * 0.027) * (amplitude / 2);
      g.lineTo(x, baseY - peak);
    }
    g.lineTo(L.CANVAS_W, L.CANVAS_H);
    g.lineTo(0, L.CANVAS_H);
    g.endFill();
    layer.addChild(g);
  }

  function makePlaceChip(place) {
    var container = new PIXI.Container();
    var padX = 10, padY = 6;
    // 用 Text 测宽度
    var text = new PIXI.Text(place.label, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: 12,
      fontWeight: '600',
      fill: 0x4A2E1A,
    });
    var w = text.width + padX * 2;
    var h = text.height + padY * 2;
    var bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF, 0.92);
    bg.drawRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.endFill();
    bg.beginFill(0x4A2E1A, 0.15);
    bg.drawRoundedRect(-w / 2, h / 2 - 1, w, 1, 0);
    bg.endFill();
    container.addChild(bg);
    container.addChild(text);
    container.x = place.x;
    container.y = place.y;
    container.placeData = place;
    return container;
  }

  function makeOasisSprite(o) {
    var c = new PIXI.Container();
    var halo = new PIXI.Graphics();
    halo.beginFill(0x6EC1E4, 0.35);
    halo.drawCircle(0, 0, 26);
    halo.endFill();
    c.addChild(halo);
    var palm = new PIXI.Text('🌴', {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 32,
    });
    palm.anchor.set(0.5);
    c.addChild(palm);
    var label = new PIXI.Text(o.label, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: 11,
      fill: 0xFFFFFF,
      fontWeight: '600',
    });
    label.anchor.set(0.5);
    label.y = 22;
    c.addChild(label);
    c.x = o.x;
    c.y = o.y;
    c.oasisData = o;
    return c;
  }

  function makeGiftSprite(g) {
    var c = new PIXI.Container();
    var glow = new PIXI.Graphics();
    glow.beginFill(0xFFD98A, 0.35);
    glow.drawCircle(0, 0, 22);
    glow.endFill();
    c.addChild(glow);
    var bag = new PIXI.Text('🎁', {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 32,
    });
    bag.anchor.set(0.5);
    c.addChild(bag);
    var label = new PIXI.Text(g.name, {
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
      fontSize: 11,
      fill: 0x4A2E1A,
      fontWeight: '600',
    });
    label.anchor.set(0.5);
    label.y = 22;
    c.addChild(label);
    c.x = g.x;
    c.y = g.y;
    c.giftData = g;
    c.collected = false;
    c.bobPhase = Math.random() * Math.PI * 2;
    return c;
  }

  function makeMerchantSprite(m) {
    var c = new PIXI.Container();
    var bg = new PIXI.Graphics();
    bg.beginFill(0x8B4513, 0.3);
    bg.drawCircle(0, 0, 18);
    bg.endFill();
    c.addChild(bg);
    var emoji = new PIXI.Text(m.emoji, {
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
      fontSize: 28,
    });
    emoji.anchor.set(0.5);
    c.addChild(emoji);
    c.x = m.x;
    c.y = m.y;
    return c;
  }

  // ==================== 主循环 ====================

  function startTicker() {
    app.ticker.add(function () {
      // 礼物 bob 动画
      giftSprites.forEach(function (sp) {
        if (sp.collected) return;
        sp.bobPhase += 0.04;
        sp.children[1].y = Math.sin(sp.bobPhase) * 2;
      });

      // 玩家走动画（切换 emoji 偏移）
      if (state === STATE.PLAYING && !paused) {
        if (Date.now() - player.lastMoveAt < 200) {
          player.walkPhase += 0.2;
          if (playerSprite) {
            playerSprite.elf.y = player.y + Math.sin(player.walkPhase) * 1.5;
            playerSprite.camel.y = player.y + 5 + Math.sin(player.walkPhase) * 1.5;
          }
        } else {
          if (playerSprite) {
            playerSprite.elf.y = player.y;
            playerSprite.camel.y = player.y + 5;
          }
        }

        // 老商人距离检测（走到 Souq Waqif chip 附近显示 popup）
        var dx = player.x - L.merchant.x;
        var dy = player.y - L.merchant.y;
        if (Math.sqrt(dx * dx + dy * dy) < 50 && merchantPopup) {
          showMerchant();
        }
      }

      // 沙尘尾巴粒子
      for (var i = dustTrail.length - 1; i >= 0; i--) {
        var p = dustTrail[i];
        p.alpha -= 0.04;
        p.y += 0.5;
        if (p.alpha <= 0) {
          fgLayer.removeChild(p);
          p.destroy();
          dustTrail.splice(i, 1);
        }
      }
    });
  }

  function spawnDust() {
    var p = new PIXI.Text('·', {
      fontFamily: 'sans-serif',
      fontSize: 18,
      fill: 0xB58A55,
    });
    p.anchor.set(0.5);
    p.x = player.x + (Math.random() - 0.5) * 16;
    p.y = player.y + 10;
    p.alpha = 0.7;
    fgLayer.addChild(p);
    dustTrail.push(p);
  }

  // ==================== 输入 ====================

  function bindInput() {
    var keys = {
      ArrowUp: 0, ArrowDown: 0, ArrowLeft: 0, ArrowRight: 0,
      w: 0, a: 0, s: 0, d: 0, W: 0, A: 0, S: 0, D: 0,
    };

    // M6: 抽象按键处理函数 —— 键盘 / 虚拟键都走这个
    var onKey = function (key, isDown) {
      if (keys.hasOwnProperty(key)) {
        if (isDown) {
          if (keys[key] === 0) tryMove(key);
          keys[key] = 1;
        } else {
          keys[key] = 0;
        }
      }
    };

    // 键盘监听
    document.addEventListener('keydown', function (e) {
      if (keys.hasOwnProperty(e.key)) {
        onKey(e.key, true);
        e.preventDefault();
      }
    });
    document.addEventListener('keyup', function (e) {
      if (keys.hasOwnProperty(e.key)) {
        onKey(e.key, false);
        e.preventDefault();
      }
    });

    // M6: 虚拟键绑定 —— 用 touch 事件（更灵敏）+ 鼠标兜底
    var virtualBtns = document.querySelectorAll('.qtr-btn[data-key]');
    virtualBtns.forEach(function (btn) {
      var k = btn.dataset.key;

      // touchstart —— 按下
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        btn.classList.add('qtr-pressed');
        onKey(k, true);
      }, { passive: false });

      // touchend —— 抬起
      btn.addEventListener('touchend', function (e) {
        e.preventDefault();
        btn.classList.remove('qtr-pressed');
        onKey(k, false);
      }, { passive: false });

      // touchcancel —— 取消（系统手势拦截）
      btn.addEventListener('touchcancel', function (e) {
        btn.classList.remove('qtr-pressed');
        onKey(k, false);
      }, { passive: false });

      // 鼠标兜底（PC 调试）
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        btn.classList.add('qtr-pressed');
        onKey(k, true);
      });
      btn.addEventListener('mouseup', function (e) {
        e.preventDefault();
        btn.classList.remove('qtr-pressed');
        onKey(k, false);
      });
      btn.addEventListener('mouseleave', function (e) {
        if (btn.classList.contains('qtr-pressed')) {
          btn.classList.remove('qtr-pressed');
          onKey(k, false);
        }
      });

      // 阻止 contextmenu 长按菜单
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  // ==================== M6 全屏 / 横竖屏切换 ====================

  function bindFullscreen() {
    var fsBtn = document.getElementById('qatar-fullscreen');
    var fsIcon = fsBtn ? fsBtn.querySelector('.qtr-fs-icon') : null;
    var fsLabel = fsBtn ? fsBtn.querySelector('.qtr-fs-label') : null;

    var updateFsLabel = function () {
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
        } catch (e) { /* 静默 */ }
      });
    }

    document.addEventListener('fullscreenchange', updateFsLabel);
    document.addEventListener('webkitfullscreenchange', updateFsLabel);
    updateFsLabel();
  }

  function bindOrientationLock() {
    var lock = document.getElementById('orientation-lock');
    if (!lock) return;

    var apply = function () {
      var isPortrait = false;
      try {
        if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) {
          isPortrait = true;
        }
      } catch (e) {}
      // fallback: 比 width/height
      if (!isPortrait && window.innerHeight > window.innerWidth) isPortrait = true;
      if (isPortrait) {
        lock.classList.add('show');
        document.documentElement.classList.add('qtr-portrait');
      } else {
        lock.classList.remove('show');
        document.documentElement.classList.remove('qtr-portrait');
      }
    };

    apply();
    if (window.matchMedia) {
      var mql = window.matchMedia('(orientation: portrait)');
      var mqHandler = function () { apply(); };
      if (mql.addEventListener) mql.addEventListener('change', mqHandler);
      else if (mql.addListener) mql.addListener(mqHandler);
    }
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', function () { setTimeout(apply, 100); });
  }

  function tryMove(key) {
    if (state !== STATE.PLAYING) return;
    if (paused) return;
    var now = Date.now();
    if (now - player.lastMoveAt < L.MOVE_COOLDOWN_MS) return;
    var dx = 0, dy = 0;
    if (key === 'ArrowUp' || key === 'w' || key === 'W') dy = -L.STEP_PX;
    else if (key === 'ArrowDown' || key === 's' || key === 'S') dy = L.STEP_PX;
    else if (key === 'ArrowLeft' || key === 'a' || key === 'A') { dx = -L.STEP_PX; player.facing = -1; }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { dx = L.STEP_PX; player.facing = 1; }
    var nx = player.x + dx;
    var ny = player.y + dy;
    // 边界检测
    if (nx < 30 || nx > L.CANVAS_W - 30 || ny < 30 || ny > L.CANVAS_H - 30) {
      hitBoundary();
      return;
    }
    player.x = nx;
    player.y = ny;
    player.lastMoveAt = now;
    if (playerSprite) {
      playerSprite.elf.x = player.x;
      playerSprite.elf.y = player.y;
      playerSprite.camel.x = player.x - 30 * player.facing;
      playerSprite.camel.y = player.y + 5;
    }
    spawnDust();
    moveCount += 1;
    if (!hintHidden && moveCount >= 3 && hintEl) {
      hintEl.classList.add('qatar-hidden');
      hintHidden = true;
    }
    // 水分 -0.1
    changeWater(-L.WATER_PER_STEP);
    // 检查绿洲 / 礼物碰撞
    checkOasisCollision();
    checkGiftCollision();
  }

  function hitBoundary() {
    changeWater(-L.WATER_BOUNDARY_HIT);
    // 短哔提示：浏览器 beep 限制多，跳过音，改 UI 闪烁
    flashWaterUI();
  }

  function flashWaterUI() {
    if (!waterEl) return;
    waterEl.parentElement.classList.add('qatar-water-warn');
    setTimeout(function () {
      waterEl.parentElement.classList.remove('qatar-water-warn');
    }, 200);
  }

  function changeWater(delta) {
    water = Math.max(0, Math.min(L.WATER_MAX, +(water + delta).toFixed(2)));
    if (waterEl) waterEl.textContent = water.toFixed(1) + ' / ' + L.WATER_MAX;
    if (water <= 0 && state === STATE.PLAYING) {
      // 进入 DEAD 流程
      dieFromThirst();
    } else if (water <= 3 && waterEl) {
      waterEl.parentElement.classList.add('qatar-water-low');
    } else {
      if (waterEl) waterEl.parentElement.classList.remove('qatar-water-low');
    }
  }

  function checkOasisCollision() {
    for (var i = 0; i < L.oases.length; i++) {
      var o = L.oases[i];
      var dx = player.x - o.x;
      var dy = player.y - o.y;
      if (Math.sqrt(dx * dx + dy * dy) < 40) {
        // 简单防抖：每步都检测，只在第一次触发时弹文字
        if (!o._lastTouch || Date.now() - o._lastTouch > 2000) {
          o._lastTouch = Date.now();
          changeWater(L.WATER_OASIS_REWARD);
          flashWaterUI();
        }
      }
    }
  }

  function checkGiftCollision() {
    for (var i = 0; i < giftSprites.length; i++) {
      var sp = giftSprites[i];
      if (sp.collected) continue;
      var dx = player.x - sp.x;
      var dy = player.y - sp.y;
      if (Math.sqrt(dx * dx + dy * dy) < 36) {
        openGiftModal(sp.giftData);
        sp.collected = true;
        sp.visible = false;
        return;
      }
    }
  }

  // ==================== 礼物 modal ====================

  function openGiftModal(g) {
    state = STATE.PICKUP;
    currentGiftId = g.id;
    if (giftTitle) giftTitle.textContent = '你拾起了「' + g.name + '」';
    if (giftSub) giftSub.textContent = g.hint;
    if (giftModal) giftModal.style.display = 'flex';
    // 装进按钮在装满后禁用
    if (giftBucketBtn) {
      giftBucketBtn.disabled = luggageCount >= L.LUGGAGE_MAX;
      giftBucketBtn.textContent = luggageCount >= L.LUGGAGE_MAX
        ? '🧳 行李满' : '🧳 装进 (' + luggageCount + '/' + L.LUGGAGE_MAX + ')';
    }
  }

  function closeGiftModal() {
    if (giftModal) giftModal.style.display = 'none';
    currentGiftId = null;
    state = STATE.PLAYING;
    // 检查是否完成 6 件或仍可继续
    pickupCount += 1;
    if (pickupEl) pickupEl.textContent = pickupCount + ' / 6';
    // NPC 第 3 件切换到帧 2
    if (!npcShownPickup3 && pickupCount >= 3) {
      npcShownPickup3 = true;
      setNpcFrame(1);
    }
    // 完成 6 件 → 进入 RESULT
    if (pickupCount >= 6) {
      enterResult();
    }
  }

  function decideGift(choice) {
    if (currentGiftId === null) return;
    giftBuckets[currentGiftId] = choice;
    if (choice === 'bucket') {
      luggageCount += 1;
      if (luggageEl) luggageEl.textContent = luggageCount + ' / ' + L.LUGGAGE_MAX;
    }
    closeGiftModal();
  }

  if (giftBucketBtn) giftBucketBtn.addEventListener('click', function () { decideGift('bucket'); });
  if (giftStayBtn) giftStayBtn.addEventListener('click', function () { decideGift('stay'); });
  if (giftDropBtn) giftDropBtn.addEventListener('click', function () { decideGift('drop'); });

  // ==================== 老商人 popup ====================

  var merchantShown = false;
  function showMerchant() {
    if (merchantShown || !merchantPopup) return;
    merchantShown = true;
    merchantPopup.style.display = 'flex';
  }
  if (merchantCloseBtn) merchantCloseBtn.addEventListener('click', function () {
    if (merchantPopup) merchantPopup.style.display = 'none';
    setTimeout(function () { merchantShown = false; }, 1000);
  });

  // ==================== NPC banner ====================

  function setNpcFrame(idx) {
    npcFrame = idx;
    if (npcText) npcText.textContent = L.npcFrames[idx];
  }
  setNpcFrame(0);

  // ==================== 暂停 ====================

  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶ 继续' : '⏸ 暂停';
    });
  }

  // ==================== 结果 4 档 ====================

  function determineTier() {
    // dead 优先（water=0 时已经在 dieFromThirst 走完）
    var bucket = Object.keys(giftBuckets).filter(function (k) { return giftBuckets[k] === 'bucket'; }).length;
    var allPicked = pickupCount >= 6;
    if (allPicked && water > 5) return 'PERFECT';
    if ((bucket >= 4 || allPicked) && water > 0) return 'NORMAL';
    if (bucket >= 3 || pickupCount >= 3) {
      if (water > 0) return 'HARD';
      return 'DEAD';
    }
    // pickupCount < 3 → 不准调 reward，弹 modal 继续
    return null;
  }

  function enterResult() {
    state = STATE.RESULT;
    var tier = determineTier();
    if (tier === null) {
      // 礼物不够 → 弹 modal 让玩家继续收集
      alert('礼物还不够（至少 3 件），继续走走吧 🌵');
      state = STATE.PLAYING;
      return;
    }
    renderResultModal(tier);
  }

  function renderResultModal(tier) {
    var amount = L.rewardTiers[tier];
    var quote = L.tierQuotes[tier];
    var bucketCount = Object.keys(giftBuckets).filter(function (k) { return giftBuckets[k] === 'bucket'; }).length;
    if (resultTier) resultTier.textContent =
      tier === 'PERFECT' ? '🌟 完美'
      : tier === 'NORMAL' ? '☀️ 普通'
      : tier === 'HARD' ? '🌾 勉强'
      : '🏜️ 渴死';
    if (resultQuote) resultQuote.textContent = quote;
    if (resultStats) resultStats.textContent =
      '收 ' + bucketCount + ' 件 · 拾 ' + pickupCount + ' / 6 · 水分 ' + water.toFixed(1) + ' / ' + L.WATER_MAX;
    if (resultModal) resultModal.style.display = 'flex';
    setNpcFrame(2);
    // 调用后端
    if (tier === 'DEAD') {
      // 渴死档：只调 secret，不调 reward
      showReviveForQatar();
    } else {
      claimRewardForQatar(amount, tier);
    }
  }

  if (resultContinueBtn) resultContinueBtn.addEventListener('click', function () {
    if (resultModal) resultModal.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'inline-block';
  });

  // ==================== reward/claim ====================

  function claimRewardForQatar(amount, tier) {
    if (!SESSION_ID) {
      ensureSession().then(function () {
        if (SESSION_ID) claimRewardForQatar(amount, tier);
      });
      return;
    }
    if (alreadyClaimed) {
      renderRewardUI(amount, tier, '本关已领取（前端去重命中）', true, false);
      return;
    }
    fetch('/api/game/reward/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: SESSION_ID,
        level: LEVEL_ID,
        nickname: nickname,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) {
          localStorage.setItem(claimedKey, '1');
          var msg = data.duplicate
            ? '已领取过（服务端去重）'
            : (data.triggered ? '飞书已通知 ✉️' : '飞书未推送（webhook 未配置）');
          renderRewardUI(amount, tier, msg, true, !!data.duplicate);
        } else {
          renderRewardUI(amount, tier, '领取失败：' + (data && data.error ? data.error : '未知错误'), false, false);
        }
      })
      .catch(function (err) {
        renderRewardUI(amount, tier, '网络错误：' + err.message, false, false);
      });
  }

  function renderRewardUI(amount, tier, statusMsg, ok, duplicate) {
    // 主页面 silk-win 也展示（关 0 复用 M2 的样式）
    if (winPanel) winPanel.style.display = 'block';
    if (rewardText) rewardText.textContent = '+¥' + amount.toFixed(2) + ' · ' + (
      tier === 'PERFECT' ? '🌟 完美档' :
      tier === 'NORMAL' ? '☀️ 普通档' :
      '🌾 勉强档'
    );
    if (quoteText) quoteText.textContent = L.tierQuotes[tier];
    if (statusEl) {
      statusEl.textContent = statusMsg;
      statusEl.style.color = ok ? '#a8d8c0' : '#f6b5c8';
    }
    if (nextBtn) {
      nextBtn.style.display = 'inline-block';
      nextBtn.href = '/games/silk-road/level/1';
    }
    // 写入通关列表
    try {
      var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
      if (cleared.indexOf(LEVEL_ID) === -1) {
        cleared.push(LEVEL_ID);
        localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
      }
    } catch (e) {}
  }

  // ==================== 渴死 / 复活 ====================

  function dieFromThirst() {
    state = STATE.DEAD;
    // 停 Pixi 输入
    paused = true;
    if (pauseBtn) pauseBtn.textContent = '▶ 继续';
    // 立即弹复活 modal（_revive_modal.html）
    if (pickupCount >= 3) {
      // 拾够 3 件 → 复活成功仍可领奖
      showReviveForQatar();
    } else {
      // 没拾够 3 件 → 复活后强制再走
      showReviveForQatar(true);
    }
  }

  function showReviveForQatar(forceRestart) {
    if (!reviveModal) {
      // 没 modal 兜底：直接放弃
      giveUpQatar();
      return;
    }
    reviveModal.style.display = 'flex';
    if (reviveText) {
      reviveText.value = '';
      reviveText.disabled = false;
      setTimeout(function () { reviveText.focus(); }, 50);
    }
    if (reviveSendBtn) {
      reviveSendBtn.disabled = false;
      reviveSendBtn.textContent = forceRestart ? '发送 · 然后继续沙海' : '发送 · 复活继续';
    }
    if (reviveStatus) reviveStatus.textContent = '';
    // 绑定一次性回调（绑定多次会重复发）
    reviveSendBtn.onclick = function () { submitSecretForQatar(forceRestart); };
    reviveGiveupBtn.onclick = giveUpQatar;
  }

  function submitSecretForQatar(forceRestart) {
    if (!reviveText) return;
    var text = (reviveText.value || '').trim();
    if (!text) {
      if (reviveStatus) {
        reviveStatus.textContent = '先写点什么吧…';
        reviveStatus.style.color = '#f6b5c8';
      }
      return;
    }
    if (reviveSendBtn) reviveSendBtn.disabled = true;
    if (reviveText) reviveText.disabled = true;
    if (reviveStatus) {
      reviveStatus.textContent = '发送中…';
      reviveStatus.style.color = '#a8d8c0';
    }
    if (!SESSION_ID) {
      ensureSession().then(function () {
        if (SESSION_ID) submitSecretForQatar(forceRestart);
        else {
          if (reviveStatus) reviveStatus.textContent = 'session 创建失败，请重试';
          if (reviveSendBtn) reviveSendBtn.disabled = false;
          if (reviveText) reviveText.disabled = false;
        }
      });
      return;
    }
    fetch('/api/game/secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: SESSION_ID,
        level: LEVEL_ID,
        secret_text: text,
        nickname: nickname,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.success) {
          if (reviveStatus) {
            reviveStatus.textContent = '已发送 ❤️';
            reviveStatus.style.color = '#a8d8c0';
          }
          setTimeout(function () {
            hideRevive();
            if (forceRestart) {
              // 没拾够 3 件 → 复活 +1 滴回原点重走
              water = 1;
              player.x = L.start.x;
              player.y = L.start.y;
              if (playerSprite) {
                playerSprite.elf.x = player.x;
                playerSprite.elf.y = player.y;
                playerSprite.camel.x = player.x - 30;
                playerSprite.camel.y = player.y + 5;
              }
              if (waterEl) waterEl.textContent = water.toFixed(1) + ' / ' + L.WATER_MAX;
              paused = false;
              if (pauseBtn) pauseBtn.textContent = '⏸ 暂停';
              state = STATE.PLAYING;
            } else {
              // 已拾够 3 件 → 复活后直接领奖（DEAD 档 amount=0 但按 spec 不调 reward）
              // spec: dead 档永远不要调 reward/claim，只调 secret
              // 因此 DEAD 档只能放弃或重走（已经在 forceRestart 路径）
              giveUpQatar();
            }
          }, 1500);
        } else {
          if (reviveStatus) {
            reviveStatus.textContent = '发送失败：' + (data && data.error ? data.error : '未知错误');
            reviveStatus.style.color = '#f6b5c8';
          }
          if (reviveSendBtn) reviveSendBtn.disabled = false;
          if (reviveText) reviveText.disabled = false;
        }
      })
      .catch(function (err) {
        if (reviveStatus) {
          reviveStatus.textContent = '网络错误：' + err.message;
          reviveStatus.style.color = '#f6b5c8';
        }
        if (reviveSendBtn) reviveSendBtn.disabled = false;
        if (reviveText) reviveText.disabled = false;
      });
  }

  function hideRevive() {
    if (reviveModal) reviveModal.style.display = 'none';
  }

  function giveUpQatar() {
    hideRevive();
    if (nextBtn) {
      nextBtn.textContent = '已放弃 → 下一关';
      nextBtn.style.display = 'inline-block';
      nextBtn.href = '/games/silk-road/level/1';
    }
    if (winPanel) {
      winPanel.style.display = 'block';
      if (quoteText) quoteText.textContent = '沙海暂时不适合你，下一关再见 🌵';
      if (rewardText) rewardText.textContent = '';
      if (statusEl) {
        statusEl.textContent = '未通关，没领奖（放弃了复活）';
        statusEl.style.color = '#c9c2d8';
      }
    }
  }

  // ==================== session 兜底 ====================

  function ensureSession() {
    if (SESSION_ID) return Promise.resolve();
    return fetch('/api/game/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'land', nickname: nickname }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.session_id) {
          SESSION_ID = data.session_id;
          localStorage.setItem('silkroad_session_id', SESSION_ID);
          claimedKey = 'silkroad_claimed_' + SESSION_ID + '_' + LEVEL_ID;
          alreadyClaimed = localStorage.getItem(claimedKey) === '1';
        }
      })
      .catch(function () {});
  }

  // ==================== 启动 ====================

  function start() {
    initPixi();
    bindInput();
    bindFullscreen();        // M6
    bindOrientationLock();   // M6
    startTicker();
    state = STATE.PLAYING;
    // 写 localStorage flag —— 标记 M5 启用
    localStorage.setItem('silkroad_qatar_v2', '1');
    // 兜底建 session
    ensureSession();
  }

  // 已通关：直接展示通关态
  if (alreadyClaimed) {
    // 等 Pixi 起来后展示
    setTimeout(function () {
      var lastTier = localStorage.getItem('silkroad_qatar_last_tier') || 'HARD';
      renderRewardUI(L.rewardTiers[lastTier] || 6.66, lastTier, '本关已通关（前端去重命中）', true, true);
    }, 100);
  }

  // 等 DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();