// M4 跨关进度条 —— 读 localStorage 已通关列表，渲染顶部进度条
// 数据源：
//   silkroad_cleared_levels: [0,1,3] （引擎通关时写入）
//   silkroad_session_id / silkroad_nickname （沿用 M2/M3）
// 用法：在模板 <head> 后插入 <div id="silk-progress-bar-host"></div> 即可
(function () {
  'use strict';

  // 关卡展示配置（与 data/game_config.json 同步，前端写死方便进度条 hover 提示）
  var LEVEL_META = [
    { id: 0, title: '起航·多哈',          emoji: '🛳️' },
    { id: 1, title: '伊朗·沙漠骆驼',      emoji: '🐪' },
    { id: 2, title: '土耳其·热气球',      emoji: '🎈' },
    { id: 3, title: '哈萨克·草原骑马',    emoji: '🐎' },
    { id: 4, title: '新疆·雪山滑雪',      emoji: '🏂' },
    { id: 5, title: '成都·到家',          emoji: '🏠' },
  ];

  function getCleared() {
    try { return JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]'); }
    catch (e) { return []; }
  }
  function getCurrentLevel() {
    // 关卡页把 window.LEVEL_ID 暴露在全局；mode 页无 LEVEL_ID → 用空
    if (typeof window.LEVEL_ID === 'number') return window.LEVEL_ID;
    // 兜底：从 URL /level/<n> 解析
    var m = window.location.pathName || window.location.pathname || '';
    var match = m.match(/\/level\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
  function getNickname() {
    return (localStorage.getItem('silkroad_nickname') || '').trim() || '小卡';
  }

  function build() {
    var cleared = getCleared();
    var current = getCurrentLevel();
    var nick = getNickname();
    var clearedSet = {};
    cleared.forEach(function (n) { clearedSet[n] = true; });
    var clearedCount = cleared.length;

    var dots = LEVEL_META.map(function (lv) {
      var stateCls = clearedSet[lv.id] ? 'cleared'
                   : (lv.id === current ? 'current' : 'todo');
      var check = clearedSet[lv.id] ? '✅' : (lv.id === current ? '●' : '');
      return ''
        + '<div class="slk-pg-step ' + stateCls + '" data-level="' + lv.id + '" '
        +     'title="关 ' + lv.id + ' · ' + lv.title + '">'
        +   '<span class="slk-pg-dot">' + lv.emoji + '</span>'
        +   '<span class="slk-pg-check">' + check + '</span>'
        +   '<span class="slk-pg-label">关 ' + lv.id + '</span>'
        + '</div>';
    }).join('<span class="slk-pg-sep">›</span>');

    var html = ''
      + '<div class="slk-pg-wrap">'
      +   '<div class="slk-pg-bar">'
      +     '<div class="slk-pg-track">' + dots + '</div>'
      +     '<div class="slk-pg-count">'
      +       '<span class="slk-pg-count-num">' + clearedCount + '</span> / 6 关'
      +     '</div>'
      +   '</div>'
      + '</div>';

    return html;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function mount() {
    var host = document.getElementById('silk-progress-bar-host');
    if (!host) return;
    host.innerHTML = build();
    // 关卡页：点 dot 跳到对应 level（仅已通关 + 当前 + 下一关）
    var cleared = getCleared();
    var current = getCurrentLevel();
    host.querySelectorAll('.slk-pg-step').forEach(function (el) {
      el.addEventListener('click', function () {
        var lv = parseInt(el.getAttribute('data-level'), 10);
        if (cleared.indexOf(lv) !== -1 || lv === current || lv === (current + 1)) {
          window.location.href = '/games/silk-road/level/' + lv;
        }
      });
    });
  }

  // 暴露给其他模块用
  window.SLK_Progress = {
    mount: mount,
    rebuild: function () {
      var host = document.getElementById('silk-progress-bar-host');
      if (host) { host.innerHTML = build(); mount(); }
    },
    LEVEL_META: LEVEL_META,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();