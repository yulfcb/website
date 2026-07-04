// M4 烟花粒子 —— Canvas 2D 实现（金色彩屑）
// 设计目标：
//  - 200 颗粒子，3 秒后散掉
//  - 满屏（fixed inset:0）
//  - 不依赖 Pixi，纯 Canvas2D（关 5 也没 Pixi）
//  - 暴露 window.SLK_Fireworks.start(canvas) / .stop()
(function () {
  'use strict';

  // —— 调色板：金粉/暖橙/樱粉/奶白 ——
  var COLORS = [
    '#ffd98a', // 金黄
    '#f6b5c8', // 樱粉
    '#fff3c4', // 奶白
    '#ffb86c', // 暖橙
    '#e8b96a', // 暗金
    '#a8d8c0', // 薄荷（点缀）
  ];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 单次爆破：从屏幕下方爆开，向上抛物
  function makeBurst(width, height) {
    var cx = rand(width * 0.15, width * 0.85);
    var cy = height + 10; // 从屏外
    var count = 70;       // 单次爆破 70 粒
    var particles = [];
    for (var i = 0; i < count; i++) {
      var angle = rand(-Math.PI * 1.15, -Math.PI * 0.35); // 主要向上 + 两侧
      var speed = rand(3, 9);
      particles.push({
        x: cx + rand(-6, 6),
        y: cy + rand(-4, 4),
        vx: Math.cos(angle) * speed + rand(-1.5, 1.5),
        vy: Math.sin(angle) * speed,
        gravity: 0.12,
        size: rand(2, 5),
        color: pick(COLORS),
        life: 1.0,
        decay: rand(0.006, 0.012),
        rotate: rand(0, Math.PI * 2),
        rotSpeed: rand(-0.15, 0.15),
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
      });
    }
    return particles;
  }

  var running = false;
  var rafId = null;
  var canvas = null;
  var ctx = null;
  var particles = [];
  var lastBurstAt = 0;
  var startedAt = 0;

  function tick(now) {
    if (!running) return;
    var w = canvas.width;
    var h = canvas.height;

    // 半透明覆盖 → 拖尾
    ctx.fillStyle = 'rgba(20, 16, 36, 0.18)';
    ctx.fillRect(0, 0, w, h);

    // 每 250ms 一次爆破（3 秒内约 12 次 × 70 = ~840 粒，但 life 衰很快，最终 ~200 可见）
    if (now - lastBurstAt > 250) {
      particles = particles.concat(makeBurst(w, h));
      lastBurstAt = now;
    }

    // 渲染
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotate += p.rotSpeed;
      p.life -= p.decay;
      if (p.life <= 0 || p.y > h + 30) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotate);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3 秒后自动停
    if (now - startedAt > 3000) {
      stop();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function resize() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function start(targetCanvas) {
    if (running) return;
    canvas = targetCanvas || document.getElementById('slk-finale-fireworks');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    running = true;
    particles = [];
    startedAt = performance.now();
    lastBurstAt = 0;
    resize();
    ctx.fillStyle = 'rgba(20, 16, 36, 1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    rafId = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', resize);
    // 让残留粒子淡出（不再 add，但留 1 帧清屏）
    if (canvas && ctx) {
      ctx.fillStyle = 'rgba(20, 16, 36, 0.6)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  window.SLK_Fireworks = { start: start, stop: stop };
})();