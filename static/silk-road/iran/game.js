// 伊朗·阿巴斯港大巴扎 —— 关 1 独立 DOM 游戏（M30 重做版）
//
// 设计：参照关 0 (卡塔尔 Phaser) 的独立引擎模式。完全不走 level-engine.js，
//       所以关 2-5 的 Pixi 旧逻辑不受影响。
//
// 流程：
//   1. 读 localStorage.silkroad_luggage (卡塔尔关存下来的 gift ids) → 初始化背包
//   2. 5 个波斯商贩 + 8 件商品（含归家之心 id=5 不可交易）
//   3. 点击商品 → 选中；点击商贩 → 检查接受 → 交易动画 + 资源加减
//   4. ≥3🐪 + ≥3💧 → 显示「启程出发」按钮
//   5. 点启程 → 沙漠场景 + 骆驼商队动画 → 通关卡片 + reward claim
//   6. 背包底部「信使铺」→ 复用 .slk-revive-* 样式 modal → POST /api/game/secret → 奖励 💧×1
//
// 数据：商品从 QATAR_LEVEL.gifts 读 (若 levels.js 已加载) 否则用本地硬编码兜底。

(function () {
  'use strict';

  if (!window.IRAN_MODE) {
    console.warn('[iran] IRAN_MODE not set, abort');
    return;
  }

  // ============== 商品数据 ==============
  // 优先读卡塔尔的 QATAR_LEVEL.gifts (id/emoji/name/price 跟关 0 一致)
  function loadItems() {
    var fallback = [
      { id: 0, name: '沙漠玫瑰',   emoji: '🌹', price: 30  },
      { id: 1, name: '古兰经',     emoji: '📖', price: 40  },
      { id: 2, name: '游隼',       emoji: '🦅', price: 25  },
      { id: 3, name: '波斯湾珍珠', emoji: '🦪', price: 35  },
      { id: 4, name: '天然气',     emoji: '🏭', price: 60  },
      { id: 5, name: '归家之心',   emoji: '❤️', price: 80  },
      { id: 6, name: '火炬塔之火', emoji: '🔥', price: 50  },
      { id: 7, name: '大力神杯',   emoji: '🏆', price: 100 },
    ];
    try {
      if (window.QATAR_LEVEL && Array.isArray(window.QATAR_LEVEL.gifts)) {
        return window.QATAR_LEVEL.gifts.map(function (g) {
          return { id: g.id, name: g.name, emoji: g.emoji, price: g.price || 0 };
        });
      }
    } catch (e) {}
    return fallback;
  }

  // 5 个波斯商贩 —— 每个接受一组商品，给出资源 (🐪 骆驼 或 💧 水)
  var MERCHANTS = [
    {
      id: 0, emoji: '🧶', name: '波斯地毯商',
      tip: '伊朗手织地毯，世界闻名',
      accept: [3, 4, 0], reward: { type: 'camel', n: 1 },
    },
    {
      id: 1, emoji: '🌿', name: '藏红花商',
      tip: '伊朗占全球 90% 产量',
      accept: [1, 6], reward: { type: 'water', n: 1 },
    },
    {
      id: 2, emoji: '🫖', name: '茶馆老板',
      tip: '坐下来喝杯 chai 吧',
      accept: [7, 2], rejectHeart: true, reward: { type: 'camel', n: 1 },
    },
    {
      id: 3, emoji: '🏺', name: '伊斯法罕陶匠',
      tip: '蓝色清真寺陶器',
      accept: [0, 1], reward: { type: 'water', n: 1 },
    },
    {
      id: 4, emoji: '🐫', name: '骆驼商人',
      tip: '丝路商旅，骆驼是命',
      accept: [4, 6], reward: { type: 'camel', n: 1 },
    },
  ];

  // ============== 状态 ==============
  var state = {
    items: [],          // 8 件商品
    consumedIds: [],    // 已经交易消耗的商品 ids
    selectedItemId: null,
    completedMerchantIds: [],
    camels: 0,
    waters: 0,
    tradesCount: 0,     // 已完成交易笔数
    courierSent: false,
    departable: false,
    sessionId: localStorage.getItem('silkroad_session_id') || '',
    nickname: (localStorage.getItem('silkroad_nickname') || '小卡').slice(0, 20),
    finished: false,    // 已经领过奖
  };

  // 从 localStorage 读取行李 → 初始化背包 (默认给全 8 件)
  function initItems() {
    var ids = [];
    try {
      var raw = localStorage.getItem('silkroad_luggage');
      if (raw) ids = JSON.parse(raw);
    } catch (e) {}
    var all = loadItems();
    if (!Array.isArray(ids) || ids.length === 0) {
      ids = all.map(function (it) { return it.id; });
    }
    // 关 0 只让装 6 件 (LUGGAGE_MAX=6). 关 1 兜底仍可拿到全部 8 件
    // (兜底逻辑: 如果 ids 缺失部分 id, 补全默认全部)
    var have = {};
    ids.forEach(function (id) { have[id] = true; });
    all.forEach(function (it) { if (!have[it.id]) ids.push(it.id); });
    state.items = all.map(function (it) {
      return Object.assign({}, it, { available: ids.indexOf(it.id) !== -1 });
    });
  }

  // ============== DOM 构建 ==============
  var root = document.getElementById('iran-game-root');
  if (!root) {
    console.error('[iran] #iran-game-root missing');
    return;
  }

  function el(tag, opts, children) {
    var e = document.createElement(tag);
    if (opts) {
      if (opts.cls) e.className = opts.cls;
      if (opts.id) e.id = opts.id;
      if (opts.html != null) e.innerHTML = opts.html;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.attrs) Object.keys(opts.attrs).forEach(function (k) { e.setAttribute(k, opts.attrs[k]); });
      if (opts.on) Object.keys(opts.on).forEach(function (k) { e.addEventListener(k, opts.on[k]); });
      if (opts.style) Object.keys(opts.style).forEach(function (k) { e.style[k] = opts.style[k]; });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') e.appendChild(document.createTextNode(c));
        else e.appendChild(c);
      });
    }
    return e;
  }

  function buildUI() {
    root.innerHTML = '';

    var bazaar = el('div', { cls: 'iran-bazaar' });

    // 顶部资源条
    var bar = el('div', { cls: 'iran-resource-bar' });
    bar.appendChild(buildResourceCell('camel', 0, 3));
    bar.appendChild(buildResourceCell('water', 0, 3));
    bazaar.appendChild(bar);

    // 商贩区
    bazaar.appendChild(el('h3', {
      text: '🏪 阿巴斯港大巴扎',
      style: { fontSize: '15px', color: '#FFD98A', margin: '0 0 10px', textAlign: 'center', letterSpacing: '1px' },
    }));
    var merchantsGrid = el('div', { cls: 'iran-merchants' });
    MERCHANTS.forEach(function (m) { merchantsGrid.appendChild(buildMerchantCard(m)); });
    bazaar.appendChild(merchantsGrid);

    // 背包区
    var backpack = el('div', { cls: 'iran-backpack' });
    backpack.appendChild(el('h3', { text: '🎒 行李 · 选一件送给商贩' }));
    backpack.appendChild(el('p', { cls: 'iran-backpack-tip', text: '点击商品 → 点击商贩完成交易' }));
    var itemsGrid = el('div', { cls: 'iran-items' });
    state.items.forEach(function (it) { itemsGrid.appendChild(buildItemCard(it)); });
    backpack.appendChild(itemsGrid);

    // 信使铺按钮
    var courierBtn = el('button', {
      cls: 'iran-courier-btn',
      id: 'iran-courier-btn',
      on: { click: openCourierModal },
    }, [
      el('span', { text: '🕊️' }),
      el('span', { text: '信使铺 · 写一句话寄回家' }),
    ]);
    if (state.courierSent) {
      courierBtn.classList.add('sent');
      courierBtn.querySelectorAll('span')[1].textContent = '密信已送达 ✉️';
      courierBtn.onclick = null;
    }
    backpack.appendChild(courierBtn);
    bazaar.appendChild(backpack);

    // 启程按钮（满足 ≥3🐪 + ≥3💧 才显示）
    var departBtn = el('button', {
      cls: 'iran-depart-btn',
      id: 'iran-depart-btn',
      text: '启程出发 → 土耳其 🎈',
      on: { click: startDesertVoyage },
    });
    bazaar.appendChild(departBtn);

    // 沙漠场景（通关动画）
    var desertScene = buildDesertScene();
    root.appendChild(bazaar);
    root.appendChild(desertScene);

    // toast
    if (!document.getElementById('iran-toast')) {
      var toast = el('div', { cls: 'iran-toast', id: 'iran-toast' });
      document.body.appendChild(toast);
    }

    // 信使铺 modal（独立 modal，跟 _revive_modal 隔离避免冲突）
    if (!document.getElementById('iran-courier-modal')) {
      buildCourierModal();
    }
  }

  function buildResourceCell(kind, n, target) {
    var icon = kind === 'camel' ? '🐪' : '💧';
    var cell = el('div', { cls: 'iran-resource-cell', attrs: { 'data-kind': kind } });
    cell.appendChild(el('span', { cls: 'icon', text: icon }));
    cell.appendChild(el('span', { cls: 'count', text: '×0' }));
    cell.appendChild(el('span', { cls: 'target', text: '目标 ' + target }));
    return cell;
  }

  function buildMerchantCard(m) {
    var acceptNames = m.accept.map(function (id) {
      var it = state.items.find(function (x) { return x.id === id; });
      return it ? it.emoji : '';
    }).join(' ');
    var card = el('div', {
      cls: 'iran-merchant-card',
      attrs: { 'data-merchant-id': String(m.id) },
      on: { click: function () { onMerchantClick(m.id); } },
    });
    card.appendChild(el('span', { cls: 'm-emoji', text: m.emoji }));
    card.appendChild(el('div', { cls: 'm-name', text: m.name }));
    card.appendChild(el('div', { cls: 'm-tip', text: m.tip }));
    card.appendChild(el('div', { cls: 'm-reward', text: '收 ' + acceptNames + ' → 换 ' + (m.reward.type === 'camel' ? '🐪' : '💧') }));
    return card;
  }

  function buildItemCard(it) {
    var isHeart = it.id === 5;
    var card = el('div', {
      cls: 'iran-item-card' + (isHeart ? ' home-heart' : ''),
      attrs: { 'data-item-id': String(it.id) },
      on: { click: function () { onItemClick(it.id); } },
    });
    card.appendChild(el('span', { cls: 'i-emoji', text: it.emoji }));
    card.appendChild(el('div', { cls: 'i-name', text: it.name }));
    card.appendChild(el('div', { cls: 'i-price', text: '¥' + it.price }));
    return card;
  }

  function buildDesertScene() {
    var scene = el('div', { cls: 'iran-desert-scene', id: 'iran-desert-scene' });
    var sky = el('div', { cls: 'iran-desert-sky' });
    sky.appendChild(el('div', { cls: 'iran-sun' }));
    scene.appendChild(sky);
    var dunes = el('div', { cls: 'iran-desert-dunes' });
    dunes.appendChild(el('div', { cls: 'iran-dune d1' }));
    dunes.appendChild(el('div', { cls: 'iran-dune d2' }));
    dunes.appendChild(el('div', { cls: 'iran-dune d3' }));
    dunes.appendChild(el('div', { cls: 'iran-dune d4' }));
    scene.appendChild(dunes);
    var caravan = el('div', { cls: 'iran-caravan', id: 'iran-caravan' });
    for (var i = 1; i <= 5; i++) {
      caravan.appendChild(el('div', { cls: 'iran-camel c' + i, text: '🐪' }));
    }
    scene.appendChild(caravan);
    scene.appendChild(buildEndCard());
    return scene;
  }

  function buildEndCard() {
    var card = el('div', { cls: 'iran-desert-endcard', id: 'iran-endcard' });
    card.appendChild(el('p', { cls: 'end-quote', text: '你还记得吗，那晚的沙漠\n抬头看，整片天都是你的' }));
    card.appendChild(el('p', { cls: 'end-reward', id: 'iran-end-reward', text: '+¥13.14' }));
    card.appendChild(el('p', { cls: 'end-webhook', id: 'iran-end-webhook', text: '推送中…' }));
    card.appendChild(el('a', {
      cls: 'end-next',
      id: 'iran-end-next',
      attrs: { href: '/games/silk-road/level/2' },
      text: '继续 → 土耳其 🎈',
      style: { display: 'none' },
    }));
    return card;
  }

  // ============== 交互逻辑 ==============
  function onItemClick(id) {
    var it = state.items.find(function (x) { return x.id === id; });
    if (!it) return;

    // 已消耗的商品不能再点
    if (state.consumedIds.indexOf(id) !== -1) {
      showToast('这件已经换出去啦', 'err');
      return;
    }

    // 归家之心特殊处理 —— 任何商贩都不接受
    if (id === 5) {
      showToast('❤️ 这个太珍贵了，不能拿去交易', 'err');
      return;
    }

    // 选中 / 取消选中
    if (state.selectedItemId === id) {
      state.selectedItemId = null;
    } else {
      state.selectedItemId = id;
    }
    refreshItemCards();
  }

  function onMerchantClick(merchantId) {
    var m = MERCHANTS.find(function (x) { return x.id === merchantId; });
    if (!m) return;
    var cardEl = document.querySelector('.iran-merchant-card[data-merchant-id="' + merchantId + '"]');
    if (!cardEl) return;

    // 已完成
    if (state.completedMerchantIds.indexOf(merchantId) !== -1) {
      showToast('这位商贩已经成交过了', 'err');
      return;
    }

    // 必须先选中商品
    if (state.selectedItemId == null) {
      shakeCard(cardEl);
      showToast('先在背包里选一件商品吧', 'err');
      return;
    }

    var itemId = state.selectedItemId;

    // 归家之心 → 茶馆老板专属文案 (茶馆 rejectHeart=true, 但全局 id=5 已在 onItemClick 拒绝)
    if (itemId === 5) {
      shakeCard(cardEl);
      showToast('❤️ 这个太珍贵了，我不能收', 'err');
      return;
    }

    // 是否接受该商品
    if (m.accept.indexOf(itemId) === -1) {
      shakeCard(cardEl);
      var it = state.items.find(function (x) { return x.id === itemId; });
      showToast((m.name) + '：这件 ' + (it ? it.name : '') + ' 我不收', 'err');
      return;
    }

    // ✅ 成交
    flyItemToMerchant(itemId, cardEl, function () {
      // 标记商贩完成
      state.completedMerchantIds.push(merchantId);
      cardEl.classList.add('completed');

      // 消耗商品
      state.consumedIds.push(itemId);

      // 增加资源
      if (m.reward.type === 'camel') state.camels += m.reward.n;
      else if (m.reward.type === 'water') state.waters += m.reward.n;

      state.tradesCount += 1;
      state.selectedItemId = null;

      refreshItemCards();
      refreshResourceBar();
      refreshDepartBtn();

      var item = state.items.find(function (x) { return x.id === itemId; });
      var rewardIcon = m.reward.type === 'camel' ? '🐪×' : '💧×';
      showToast('成交！' + (item ? item.emoji + ' ' + item.name : '') + ' → ' + rewardIcon + m.reward.n, 'ok');
    });
  }

  function refreshItemCards() {
    document.querySelectorAll('.iran-item-card').forEach(function (cardEl) {
      var id = parseInt(cardEl.getAttribute('data-item-id'), 10);
      cardEl.classList.remove('selected');
      if (state.consumedIds.indexOf(id) !== -1) {
        cardEl.classList.add('consumed');
      } else {
        cardEl.classList.remove('consumed');
      }
      if (state.selectedItemId === id) {
        cardEl.classList.add('selected');
      }
    });
  }

  function refreshResourceBar() {
    var cells = document.querySelectorAll('.iran-resource-cell');
    cells.forEach(function (c) {
      var kind = c.getAttribute('data-kind');
      var countEl = c.querySelector('.count');
      var n = kind === 'camel' ? state.camels : state.waters;
      var target = 3;
      countEl.textContent = '×' + n;
      if (n >= target) c.classList.add('met');
      else c.classList.remove('met');
    });
  }

  function refreshDepartBtn() {
    var ready = state.camels >= 3 && state.waters >= 3;
    state.departable = ready;
    var btn = document.getElementById('iran-depart-btn');
    if (!btn) return;
    if (ready) btn.classList.add('show');
    else btn.classList.remove('show');
  }

  function shakeCard(cardEl) {
    cardEl.classList.remove('shake');
    // 强制 reflow 让动画重新触发
    void cardEl.offsetWidth;
    cardEl.classList.add('shake');
    setTimeout(function () { cardEl.classList.remove('shake'); }, 600);
  }

  // 商品飞向商贩动画（克隆 emoji → 移到 fixed → 用 transition 飞到目标 → 销毁）
  function flyItemToMerchant(itemId, merchantCardEl, onDone) {
    var itemEl = document.querySelector('.iran-item-card[data-item-id="' + itemId + '"]');
    if (!itemEl) { if (onDone) onDone(); return; }
    var it = state.items.find(function (x) { return x.id === itemId; });
    if (!it) { if (onDone) onDone(); return; }

    var startRect = itemEl.getBoundingClientRect();
    var endRect = merchantCardEl.getBoundingClientRect();

    var flyer = document.createElement('div');
    flyer.className = 'iran-flying-item';
    flyer.textContent = it.emoji;
    flyer.style.left = (startRect.left + startRect.width / 2 - 16) + 'px';
    flyer.style.top = (startRect.top + startRect.height / 2 - 16) + 'px';
    document.body.appendChild(flyer);

    var dx = (endRect.left + endRect.width / 2) - (startRect.left + startRect.width / 2);
    var dy = (endRect.top + endRect.height / 2) - (startRect.top + startRect.height / 2);
    // 强制 reflow
    void flyer.offsetWidth;
    flyer.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(0.4)';
    flyer.style.opacity = '0.2';

    setTimeout(function () {
      if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
      if (onDone) onDone();
    }, 520);
  }

  // ============== Toast ==============
  var toastTimer = null;
  function showToast(msg, type) {
    var t = document.getElementById('iran-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'iran-toast show' + (type ? ' ' + type : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.className = 'iran-toast' + (type ? ' ' + type : '');
    }, 1600);
  }

  // ============== 信使铺 modal ==============
  function buildCourierModal() {
    var overlay = el('div', { id: 'iran-courier-modal', cls: 'slk-revive-overlay', style: { display: 'none' } });
    var modal = el('div', { cls: 'slk-revive-modal' });
    modal.appendChild(el('h3', { cls: 'slk-revive-title iran-courier-modal-title', text: '🕊️ 信使铺' }));
    modal.appendChild(el('p', { cls: 'slk-revive-tip', html: '写一句话，通过飞书秘密送达<br><span class="slk-revive-sub">（仅发飞书，不存在数据库）</span>' }));
    var ta = el('textarea', {
      id: 'iran-courier-text',
      attrs: { maxlength: '500', placeholder: '写点什么…' },
    });
    // 复用 _revive_modal 里的 textarea 样式
    ta.style.cssText = 'width:100%;min-height:88px;box-sizing:border-box;padding:10px 14px;border-radius:12px;border:1px solid #4a5578;background:#2a2140;color:#f4ecd8;font-size:15px;line-height:1.5;font-family:inherit;resize:vertical;';
    modal.appendChild(ta);

    var actions = el('div', { cls: 'slk-revive-actions' });
    var sendBtn = el('button', { cls: 'slk-revive-send', text: '发送', on: { click: submitCourier } });
    var closeBtn = el('button', { cls: 'slk-revive-giveup', text: '关闭', on: { click: closeCourierModal } });
    actions.appendChild(sendBtn);
    actions.appendChild(closeBtn);
    modal.appendChild(actions);

    var status = el('p', { id: 'iran-courier-status', cls: 'slk-revive-status' });
    modal.appendChild(status);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  function openCourierModal() {
    if (state.courierSent) {
      showToast('密信已送达 ✉️', 'ok');
      return;
    }
    var overlay = document.getElementById('iran-courier-modal');
    if (!overlay) return;
    overlay.style.display = 'flex';
  }
  function closeCourierModal() {
    var overlay = document.getElementById('iran-courier-modal');
    if (overlay) overlay.style.display = 'none';
  }

  function submitCourier() {
    var overlay = document.getElementById('iran-courier-modal');
    var ta = document.getElementById('iran-courier-text');
    var sendBtn = overlay.querySelector('.slk-revive-send');
    var status = document.getElementById('iran-courier-status');
    var text = (ta && ta.value || '').trim();
    if (!text) {
      if (status) { status.textContent = '先写点什么吧…'; status.style.color = '#f6b5c8'; }
      return;
    }
    if (sendBtn) sendBtn.disabled = true;
    if (ta) ta.disabled = true;
    if (status) { status.textContent = '发送中…'; status.style.color = '#a8d8c0'; }

    function doSend(sid) {
      fetch('/api/game/secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          level: 1,
          secret_text: text,
          nickname: state.nickname,
        }),
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            if (status) {
              status.textContent = data.triggered ? '已发送 ✉️' : '飞书未推送（webhook 未配置）';
              status.style.color = '#a8d8c0';
            }
            // 标记 + 奖励 💧×1
            state.courierSent = true;
            try { localStorage.setItem('silkroad_secret_sent_1', '1'); } catch (e) {}
            state.waters += 1;
            refreshResourceBar();
            refreshDepartBtn();
            // 改按钮
            var btn = document.getElementById('iran-courier-btn');
            if (btn) {
              btn.classList.add('sent');
              var spans = btn.querySelectorAll('span');
              if (spans.length >= 2) spans[1].textContent = '密信已送达 ✉️';
              btn.onclick = null;
            }
            setTimeout(closeCourierModal, 1500);
          } else {
            if (status) {
              status.textContent = '发送失败：' + (data && data.error ? data.error : '未知错误');
              status.style.color = '#f6b5c8';
            }
            if (sendBtn) sendBtn.disabled = false;
            if (ta) ta.disabled = false;
          }
        })
        .catch(function (err) {
          if (status) { status.textContent = '网络错误：' + err.message; status.style.color = '#f6b5c8'; }
          if (sendBtn) sendBtn.disabled = false;
          if (ta) ta.disabled = false;
        });
    }

    if (state.sessionId) {
      doSend(state.sessionId);
    } else {
      // 兜底创建 session
      fetch('/api/game/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'land', nickname: state.nickname }),
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.session_id) {
            state.sessionId = data.session_id;
            try { localStorage.setItem('silkroad_session_id', data.session_id); } catch (e) {}
            doSend(data.session_id);
          } else {
            if (status) { status.textContent = 'session 创建失败，请重试'; status.style.color = '#f6b5c8'; }
            if (sendBtn) sendBtn.disabled = false;
            if (ta) ta.disabled = false;
          }
        })
        .catch(function (err) {
          if (status) { status.textContent = 'session 创建失败：' + err.message; status.style.color = '#f6b5c8'; }
          if (sendBtn) sendBtn.disabled = false;
          if (ta) ta.disabled = false;
        });
    }
  }

  // ============== 通关 / 沙漠动画 ==============
  function startDesertVoyage() {
    if (!state.departable || state.finished) return;
    state.finished = true; // 防双击

    var bazaar = document.querySelector('.iran-bazaar');
    if (bazaar) bazaar.style.transition = 'opacity 0.5s ease';
    if (bazaar) bazaar.style.opacity = '0';

    var scene = document.getElementById('iran-desert-scene');
    if (!scene) return;

    setTimeout(function () {
      if (bazaar) bazaar.style.display = 'none';
      scene.classList.add('show');

      // 5.5s 骆驼商队动画 → 显示通关卡片
      setTimeout(function () {
        showEndCard();
      }, 5800);
    }, 500);
  }

  function showEndCard() {
    var card = document.getElementById('iran-endcard');
    if (!card) return;

    // 决定 tier
    var perfect = state.tradesCount >= 5 && state.camels >= 4 && state.waters >= 4;
    var tier = perfect ? 'PERFECT' : 'NORMAL';
    var reward = perfect ? 20.20 : 13.14;

    var rewardEl = document.getElementById('iran-end-reward');
    if (rewardEl) rewardEl.textContent = '+¥' + reward.toFixed(2);

    card.classList.add('show');
    // 触发 reward claim
    claimReward(tier, reward);
  }

  function claimReward(tier, amount) {
    var statusEl = document.getElementById('iran-end-webhook');
    var nextBtn = document.getElementById('iran-end-next');
    if (nextBtn) nextBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = '推送中…';

    function postClaim(sid) {
      fetch('/api/game/reward/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          level: 1,
          amount: amount,
          nickname: state.nickname,
        }),
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success) {
            try {
              localStorage.setItem('silkroad_claimed_' + sid + '_1', '1');
              var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
              if (cleared.indexOf(1) === -1) {
                cleared.push(1);
                localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
              }
              // 刷新顶部进度条
              if (window.SLK_Progress && window.SLK_Progress.rebuild) window.SLK_Progress.rebuild();
            } catch (e) {}
            if (statusEl) {
              statusEl.textContent = data.triggered ? '飞书已通知 ✉️' : '飞书未推送（webhook 未配置）';
              statusEl.style.color = '#a8d8c0';
            }
            if (nextBtn) {
              nextBtn.style.display = 'inline-block';
              nextBtn.textContent = '继续 → 土耳其 🎈';
              nextBtn.href = '/games/silk-road/level/2';
            }
          } else {
            if (statusEl) {
              statusEl.textContent = '领取失败：' + (data && data.error ? data.error : '未知错误');
              statusEl.style.color = '#f6b5c8';
            }
            if (nextBtn) nextBtn.style.display = 'inline-block';
          }
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent = '网络错误：' + err.message;
            statusEl.style.color = '#f6b5c8';
          }
          if (nextBtn) nextBtn.style.display = 'inline-block';
        });
    }

    if (state.sessionId) {
      postClaim(state.sessionId);
    } else {
      fetch('/api/game/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'land', nickname: state.nickname }),
      }).then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.session_id) {
            state.sessionId = data.session_id;
            try { localStorage.setItem('silkroad_session_id', data.session_id); } catch (e) {}
            postClaim(data.session_id);
          } else {
            if (statusEl) {
              statusEl.textContent = 'session 创建失败';
              statusEl.style.color = '#f6b5c8';
            }
            if (nextBtn) nextBtn.style.display = 'inline-block';
          }
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent = 'session 创建失败：' + err.message;
            statusEl.style.color = '#f6b5c8';
          }
          if (nextBtn) nextBtn.style.display = 'inline-block';
        });
    }
  }

  // ============== 启动 ==============
  function start() {
    // 检查是否已发过密信 (防止刷新重发)
    try {
      if (localStorage.getItem('silkroad_secret_sent_1') === '1') state.courierSent = true;
    } catch (e) {}

    initItems();
    buildUI();
    refreshResourceBar();
    refreshItemCards();
    refreshDepartBtn();

    // 解锁 BGM
    var unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      var bgm = document.getElementById('silk-road-bgm');
      if (bgm) {
        bgm.muted = false;
        bgm.volume = 0.35;
        var p = bgm.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    }
    document.addEventListener('pointerdown', unlock, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();