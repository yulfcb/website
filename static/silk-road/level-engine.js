// 丝绸之路 M2 关卡引擎 —— Pixi.js v7（CDN 全局 PIXI）
// 关卡状态机：IDLE → PLAY → WIN
// 通关条件：连续点击载具 5 次（M2 极简玩法，链路真打通优先）
// 通关后真实 fetch /api/game/reward/claim，前端 localStorage 去重避免重复 webhook
(function () {
  'use strict';

  // —— DOM 引用 ——
  var stageEl = document.getElementById('pixi-stage');
  var startBtn = document.getElementById('silk-start');
  var winPanel = document.getElementById('silk-win');
  var rewardText = document.getElementById('silk-reward');
  var quoteText = document.getElementById('silk-quote');
  var nextBtn = document.getElementById('silk-next');
  var progressLabel = document.getElementById('silk-progress');
  if (!stageEl) return; // 不是关卡页直接退出

  // —— 关卡配置 ——
  var LEVEL_ID = window.LEVEL_ID;
  var cfg = (window.SILK_ROAD_LEVELS || {})[LEVEL_ID];
  if (!cfg) {
    stageEl.innerHTML = '<p style="color:#f6b5c8">关卡配置缺失</p>';
    return;
  }

  // —— 昵称 / session ——
  var nickname = (localStorage.getItem('silkroad_nickname') || '小卡').slice(0, 20);
  var SESSION_ID = localStorage.getItem('silkroad_session_id') || '';

  // —— localStorage 去重键：同 session_id+level 只打一次 webhook ——
  var claimedKey = 'silkroad_claimed_' + SESSION_ID + '_' + LEVEL_ID;
  var alreadyClaimed = !!SESSION_ID && localStorage.getItem(claimedKey) === '1';

  // —— 状态机 ——
  var STATE = { IDLE: 0, PLAY: 1, WIN: 2 };
  var state = STATE.IDLE;
  var clicks = 0;
  var vehicle = null;
  var ripples = []; // 漂浮的 emoji 涟漪

  // —— Pixi 应用（v7 API）——
  var app = new PIXI.Application({
    width: stageEl.clientWidth || 720,
    height: 320,
    backgroundColor: cfg.bgBottom,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });
  stageEl.appendChild(app.view);

  // —— 渐变背景（沙色 + 晚霞）——
  var bg = new PIXI.Graphics();
  bg.beginFill(cfg.bgTop);
  bg.drawRect(0, 0, app.screen.width, app.screen.height * 0.6);
  bg.endFill();
  bg.beginFill(cfg.bgBottom);
  bg.drawRect(0, app.screen.height * 0.6, app.screen.width, app.screen.height * 0.4);
  bg.endFill();
  app.stage.addChild(bg);

  // 远山轮廓
  var mountains = new PIXI.Graphics();
  mountains.beginFill(cfg.ground, 0.4);
  mountains.moveTo(0, app.screen.height * 0.55);
  for (var x = 0; x <= app.screen.width; x += 40) {
    var peak = Math.sin(x * 0.02) * 18 + Math.cos(x * 0.05) * 10;
    mountains.lineTo(x, app.screen.height * 0.55 - peak);
  }
  mountains.lineTo(app.screen.width, app.screen.height);
  mountains.lineTo(0, app.screen.height);
  mountains.endFill();
  app.stage.addChild(mountains);

  // 沙地
  var ground = new PIXI.Graphics();
  ground.beginFill(cfg.ground);
  ground.drawRect(0, app.screen.height * 0.65, app.screen.width, app.screen.height * 0.35);
  ground.endFill();
  app.stage.addChild(ground);

  // 装饰星点
  for (var i = 0; i < 24; i++) {
    var star = new PIXI.Graphics();
    star.beginFill(0xffffff, 0.3 + Math.random() * 0.5);
    star.drawCircle(0, 0, 1 + Math.random() * 1.5);
    star.endFill();
    star.x = Math.random() * app.screen.width;
    star.y = Math.random() * app.screen.height * 0.55;
    app.stage.addChild(star);
  }

  // 载具 emoji
  var vehicleText = new PIXI.Text(cfg.emoji, {
    fontFamily: 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif',
    fontSize: 96,
    fill: 0xffffff,
  });
  vehicleText.anchor.set(0.5);
  vehicleText.x = app.screen.width / 2;
  vehicleText.y = app.screen.height * 0.72;
  vehicleText.eventMode = 'static';
  vehicleText.cursor = 'pointer';
  app.stage.addChild(vehicleText);
  vehicle = vehicleText;

  // —— 主循环（Pixi v7 ticker，内部走 rAF）——
  app.ticker.add(function () {
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      r.y -= 0.6;
      r.alpha -= 0.02;
      if (r.alpha <= 0) {
        app.stage.removeChild(r);
        r.destroy();
        ripples.splice(i, 1);
      }
    }
    if (state !== STATE.WIN) {
      vehicle.y = app.screen.height * 0.72 + Math.sin(app.ticker.lastTime * 0.003) * 4;
    }
  });

  // —— 点击载具 ——
  vehicle.on('pointertap', function () {
    if (state !== STATE.PLAY) return;
    clicks += 1;
    if (progressLabel) progressLabel.textContent = '进度 ' + clicks + ' / ' + cfg.targetClicks;
    spawnRipple(vehicle.x + (Math.random() - 0.5) * 30, vehicle.y - 20);
    if (clicks >= cfg.targetClicks) {
      winLevel();
    }
  });

  function spawnRipple(x, y) {
    var t = new PIXI.Text(cfg.emoji, {
      fontFamily: vehicleText.style.fontFamily,
      fontSize: 32,
      fill: 0xffffff,
    });
    t.anchor.set(0.5);
    t.x = x;
    t.y = y;
    t.alpha = 1;
    app.stage.addChild(t);
    ripples.push(t);
  }

  // —— 出发按钮 ——
  if (startBtn) {
    startBtn.addEventListener('click', function () {
      if (state !== STATE.IDLE) return;
      state = STATE.PLAY;
      startBtn.disabled = true;
      startBtn.textContent = '航行中…';
      if (progressLabel) {
        progressLabel.style.display = 'inline-block';
        progressLabel.textContent = '进度 0 / ' + cfg.targetClicks;
      }
    });
  }

  // —— 通关 ——
  function winLevel() {
    state = STATE.WIN;
    if (progressLabel) progressLabel.textContent = '✅ 已到达';

    if (quoteText) quoteText.textContent = cfg.quote;
    if (rewardText) rewardText.textContent = '+¥' + cfg.reward.toFixed(2);

    claimReward(cfg.reward);
  }

  function claimReward(amount) {
    if (!SESSION_ID) {
      // session 还没拿到 → 先建
      ensureSession().then(function () {
        if (!SESSION_ID) { renderWin('session 创建失败', false); return; }
        claimReward(amount);
      });
      return;
    }
    if (alreadyClaimed) {
      renderWin('本关已领取（前端去重命中）', true);
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
          renderWin(msg, true);
        } else {
          renderWin('领取失败：' + (data && data.error ? data.error : '未知错误'), false);
        }
      })
      .catch(function (err) {
        renderWin('网络错误：' + err.message, false);
      });
  }

  function renderWin(webhookMsg, ok) {
    if (!winPanel) return;
    winPanel.style.display = 'block';
    var statusEl = document.getElementById('silk-webhook-status');
    if (statusEl) {
      statusEl.textContent = webhookMsg;
      statusEl.style.color = ok ? '#a8d8c0' : '#f6b5c8';
    }
    if (nextBtn) {
      nextBtn.style.display = 'inline-block';
      nextBtn.href = cfg.nextUrl;
    }
  }

  // —— session 兜底建（mode 页可能没建过）——
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

  // —— 进站时已通关：直接展示通关态，不再要求点击 ——
  if (alreadyClaimed) {
    if (startBtn) startBtn.style.display = 'none';
    if (quoteText) quoteText.textContent = cfg.quote;
    if (rewardText) rewardText.textContent = '+¥' + cfg.reward.toFixed(2);
    if (progressLabel) progressLabel.textContent = '本关已通关（前端去重命中，不重复发飞书）';
    renderWin('本关已领取（前端去重命中）', true);
  } else {
    // 预先建 session（不阻塞 UI，缓存到 localStorage 给下一关用）
    ensureSession();
  }
})();