// 丝绸之路 M3 关卡引擎 —— Pixi.js v7（CDN 全局 PIXI）
// 关卡状态机：
//   IDLE → PLAY → WIN                                       （关 0/1/2 + 关 5 简化路径）
//   IDLE → PLAY → (WIN | FAIL → REVIVE → WIN)               （关 3/4 can_fail=true）
// 通关条件：连续点击载具 N 次（默认 5 次）
// 通关后真实 fetch /api/game/reward/claim，前端 localStorage 去重
// 失败后真实 fetch /api/game/fail_level 标记 + 弹复活 modal
// 复活 modal 调 /api/game/secret 真发飞书 → 2 秒后跳下一关
(function () {
  'use strict';

  // —— DOM 引用（公共）——
  var stageEl = document.getElementById('pixi-stage'); // 关 5 无此 div
  var startBtn = document.getElementById('silk-start');
  var winPanel = document.getElementById('silk-win');
  var rewardText = document.getElementById('silk-reward');
  var quoteText = document.getElementById('silk-quote');
  var nextBtn = document.getElementById('silk-next');
  var progressLabel = document.getElementById('silk-progress');
  var timerLabel = document.getElementById('silk-timer');

  // 关 5 简化路径判定：没有 pixi-stage 容器 → 走简化分支
  var SIMPLIFIED = !stageEl;

  // —— 关卡配置 ——
  var LEVEL_ID = window.LEVEL_ID;
  var cfg = (window.SILK_ROAD_LEVELS || {})[LEVEL_ID];
  if (!cfg) {
    // 没配置：占位文案兜底
    if (stageEl) stageEl.innerHTML = '<p style="color:#f6b5c8">关卡配置缺失</p>';
    return;
  }

  // —— 昵称 / session ——
  var nickname = (localStorage.getItem('silkroad_nickname') || '小卡').slice(0, 20);
  var SESSION_ID = localStorage.getItem('silkroad_session_id') || '';

  // —— localStorage 去重键：同 session_id+level 只打一次 webhook ——
  var claimedKey = 'silkroad_claimed_' + SESSION_ID + '_' + LEVEL_ID;
  var alreadyClaimed = !!SESSION_ID && localStorage.getItem(claimedKey) === '1';

  // —— 状态机 ——
  var STATE = { IDLE: 0, PLAY: 1, WIN: 2, FAIL: 3, REVIVE: 4 };
  var state = STATE.IDLE;
  var clicks = 0;
  var vehicle = null;
  var ripples = []; // 漂浮的 emoji 涟漪
  var timeLeft = 0;   // 倒计时剩余秒
  var timerId = null; // setInterval id

  // —— Pixi 应用（关 5 不创建）——
  var app = null;
  if (!SIMPLIFIED) {
    app = new PIXI.Application({
      width: stageEl.clientWidth || 720,
      height: 320,
      backgroundColor: cfg.bgBottom,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    stageEl.appendChild(app.view);

    // 渐变背景
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

    // 主循环
    app.ticker.add(function () {
      for (var j = ripples.length - 1; j >= 0; j--) {
        var r = ripples[j];
        r.y -= 0.6;
        r.alpha -= 0.02;
        if (r.alpha <= 0) {
          app.stage.removeChild(r);
          r.destroy();
          ripples.splice(j, 1);
        }
      }
      if (state !== STATE.WIN && state !== STATE.FAIL) {
        vehicle.y = app.screen.height * 0.72 + Math.sin(app.ticker.lastTime * 0.003) * 4;
      }
    });

    // 点击载具
    vehicle.on('pointertap', function () {
      if (state !== STATE.PLAY) return;
      clicks += 1;
      if (progressLabel) progressLabel.textContent = '进度 ' + clicks + ' / ' + cfg.targetClicks;
      spawnRipple(vehicle.x + (Math.random() - 0.5) * 30, vehicle.y - 20);
      if (clicks >= cfg.targetClicks) {
        stopTimer();
        winLevel();
      }
    });
  }

  function spawnRipple(x, y) {
    if (!app) return;
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

  // —— 关 5 简化分支：点击 "推开家门" → 直接 winLevel ——
  // 关 5 的 startBtn 单独处理；其余关照旧走"出发 → 进入 PLAY"路径

  // —— 出发按钮 ——
  if (startBtn) {
    startBtn.addEventListener('click', function () {
      if (state !== STATE.IDLE) return;

      if (SIMPLIFIED) {
        // 关 5：一步通关（点击直接 win）
        winLevel();
        return;
      }

      state = STATE.PLAY;
      startBtn.disabled = true;
      startBtn.textContent = cfg.timeLimitSec > 0 ? '倒计时中…' : '航行中…';
      if (progressLabel) {
        progressLabel.style.display = 'inline-block';
        progressLabel.textContent = '进度 0 / ' + cfg.targetClicks;
      }
      if (cfg.timeLimitSec > 0) {
        startCountdown(cfg.timeLimitSec);
      }
    });
  }

  // —— 倒计时 ——
  function startCountdown(sec) {
    timeLeft = sec;
    if (timerLabel) {
      timerLabel.style.display = 'inline-block';
      timerLabel.textContent = '剩余 ' + timeLeft + 's';
      timerLabel.classList.remove('warn', 'danger');
    }
    timerId = setInterval(function () {
      timeLeft -= 1;
      if (timerLabel) {
        timerLabel.textContent = '剩余 ' + Math.max(0, timeLeft) + 's';
        timerLabel.classList.remove('warn', 'danger');
        if (timeLeft <= 3) timerLabel.classList.add('danger');
        else if (timeLeft <= 5) timerLabel.classList.add('warn');
      }
      if (timeLeft <= 0) {
        stopTimer();
        if (state === STATE.PLAY && clicks < cfg.targetClicks) {
          failLevel();
        }
      }
    }, 1000);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
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

  // —— 失败：can_fail 关 timeLeft=0 未达成 ——
  function failLevel() {
    state = STATE.FAIL;
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = '时间到啦…';
    }
    if (progressLabel) progressLabel.textContent = '进度 ' + clicks + ' / ' + cfg.targetClicks + ' ✗';

    // 后台异步标记失败（不发飞书）
    markFail();

    // 弹复活 modal
    showReviveModal();
  }

  function markFail() {
    if (!SESSION_ID) {
      ensureSession().then(function () {
        if (SESSION_ID) markFail();
      });
      return;
    }
    fetch('/api/game/fail_level', {
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
        // 不影响 UI：失败标记只用于去重 / 反作弊
        // eslint-disable-next-line no-console
        console.log('[game] fail_level marked:', data);
      })
      .catch(function (err) {
        // eslint-disable-next-line no-console
        console.warn('[game] fail_level request failed:', err);
      });
  }

  // —— 复活 modal ——
  var reviveModal = document.getElementById('silk-revive');
  var reviveText = document.getElementById('silk-revive-text');
  var reviveSendBtn = document.getElementById('slk-revive-send');
  var reviveGiveupBtn = document.getElementById('slk-revive-giveup');
  var reviveStatus = document.getElementById('slk-revive-status');

  function showReviveModal() {
    if (!reviveModal) {
      // 没 modal（关 0/1/2 不会失败）→ 走放弃路径
      giveUp();
      return;
    }
    state = STATE.REVIVE;
    reviveModal.style.display = 'flex';
    if (reviveText) {
      reviveText.value = '';
      reviveText.disabled = false;
      setTimeout(function () { reviveText.focus(); }, 50);
    }
    if (reviveSendBtn) reviveSendBtn.disabled = false;
    if (reviveStatus) reviveStatus.textContent = '';
  }

  function hideReviveModal() {
    if (reviveModal) reviveModal.style.display = 'none';
  }

  function giveUp() {
    // 放弃复活：跳下一关（不复通关，不能领奖）
    hideReviveModal();
    if (nextBtn) {
      nextBtn.textContent = '已放弃 → 下一关';
      nextBtn.style.display = 'inline-block';
      nextBtn.href = cfg.nextUrl;
    }
    if (winPanel) {
      winPanel.style.display = 'block';
      if (quoteText) quoteText.textContent = '这一关先过啦，下一关再见 ✨';
      if (rewardText) rewardText.textContent = '';
      var statusEl = document.getElementById('silk-webhook-status');
      if (statusEl) {
        statusEl.textContent = '未通关，没领奖（放弃了复活）';
        statusEl.style.color = '#c9c2d8';
      }
    }
  }

  function submitSecret() {
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
        if (SESSION_ID) submitSecret();
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
          // 2 秒后关 modal + 自动跳下一关（带 reward：失败复活也允许继续走完）
          setTimeout(function () {
            hideReviveModal();
            // 复活成功：也允许下一关（这里直接跳，不调 reward 因为本关已失败）
            if (nextBtn) {
              nextBtn.textContent = '复活成功 → 下一关';
              nextBtn.style.display = 'inline-block';
              nextBtn.href = cfg.nextUrl;
            }
            if (winPanel) {
              winPanel.style.display = 'block';
              if (quoteText) quoteText.textContent = cfg.quote + '（复活成功，本关无奖）';
              if (rewardText) rewardText.textContent = '';
              var statusEl = document.getElementById('silk-webhook-status');
              if (statusEl) {
                statusEl.textContent = data.triggered
                  ? '秘密已飞书送达 ✉️'
                  : '飞书未推送（webhook 未配置）';
                statusEl.style.color = '#a8d8c0';
              }
            }
          }, 2000);
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

  if (reviveSendBtn) reviveSendBtn.addEventListener('click', submitSecret);
  if (reviveGiveupBtn) reviveGiveupBtn.addEventListener('click', giveUp);
  if (reviveText) {
    reviveText.addEventListener('keydown', function (e) {
      // Ctrl+Enter 提交
      if (e.ctrlKey && e.key === 'Enter') submitSecret();
    });
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