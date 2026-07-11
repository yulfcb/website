// 哈萨克斯坦·草原套马 —— 关卡 3 游戏引擎
//
// 流程: 土耳其 → 进入哈萨克斯坦 (本场景) → 套马 → 骑马买补给 → 出发去新疆
//   BootScene → TamingScene (套马) → PlayScene (骑马探索 + 购物) → /games/silk-road/level/4
//
// 设计: 所有图形 Phaser Graphics 绘制, 不依赖外部图片
//      复用 qatar 的 BGM/SFX 音频通道
//      移动端兼容 (pointerdown/up 即可触屏 + 长按)
//
// localStorage 写入 (通关时):
//   silkroad_cleared_levels 追加 3

(function () {
  'use strict';

  var CANVAS_W = 1280;
  var CANVAS_H = 720;

  // ============== SFX 助手 ==============
  window.playKazakhstanSfx = function (id, volume) {
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
      this.cameras.main.setBackgroundColor('#81D4FA');
      this.add.text(640, 360, '哈萨克斯坦·草原套马\n加载中…', {
        fontSize: '26px', color: '#2E7D32', fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5);

      // BGM 初始化
      var bgm = document.getElementById('silk-road-bgm');
      if (bgm) {
        var muted = localStorage.getItem('silkroad_bgm_muted') === '1';
        bgm.muted = muted;
        if (!muted) {
          var tryPlay = function () {
            bgm.play().catch(function () {});
          };
          this.input.once('pointerdown', tryPlay);
          setTimeout(tryPlay, 500);
        }
      }

      this.time.delayedCall(800, function () {
        this.scene.start('TamingScene');
      }, [], this);
    }
  });

  // ============== TamingScene (套马场景) ==============
  var TamingScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function TamingScene() { Phaser.Scene.call(this, { key: 'TamingScene' }); },
    create: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL.taming;
      
      this.cameras.main.setBackgroundColor('#81D4FA');
      
      // 绘制草原背景
      this.drawBackground();
      
      // 状态
      this.state = 'AIMING'; // AIMING, THROWING, CAUGHT, SUCCESS, FAIL
      this.catches = 0;
      this.misses = 0;
      this.timeLeft = config.timeLimit;
      this.startTime = Date.now();
      
      // 野马群
      this.horses = [];
      this.createHorses(config.horseCount);
      
      // 玩家位置
      this.playerX = 640;
      this.playerY = 500;
      
      // 套马索
      this.rope = null;
      this.ropeCircle = null;
      
      // UI
      this.createUI();
      
      // 输入
      this.input.on('pointerdown', function (pointer) {
        if (self.state === 'AIMING') {
          self.throwRope(pointer.x, pointer.y);
        }
      });
      
      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },
    
    drawBackground: function () {
      var gfx = this.add.graphics();
      
      // 天空渐变
      gfx.fillGradientStyle(0x81D4FA, 0x81D4FA, 0xB3E5FC, 0xB3E5FC, 1);
      gfx.fillRect(0, 0, CANVAS_W, CANVAS_H / 2);
      
      // 远处雪山
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillTriangle(100, 300, 200, 200, 300, 300);
      gfx.fillTriangle(400, 320, 500, 220, 600, 320);
      gfx.fillTriangle(800, 310, 900, 210, 1000, 310);
      
      // 草原
      gfx.fillStyle(0x7CB342, 1);
      gfx.fillRect(0, CANVAS_H / 2, CANVAS_W, CANVAS_H / 2);
      
      // 草地纹理
      gfx.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 50; i++) {
        var x = Math.random() * CANVAS_W;
        var y = CANVAS_H / 2 + Math.random() * (CANVAS_H / 2);
        gfx.fillRect(x, y, 20, 3);
      }
    },
    
    createHorses: function (count) {
      for (var i = 0; i < count; i++) {
        var horse = {
          x: 200 + Math.random() * 800,
          y: 200 + Math.random() * 300,
          vx: (Math.random() - 0.5) * 100,
          vy: (Math.random() - 0.5) * 50,
          speed: window.KAZAKHSTAN_LEVEL.taming.speeds[0],
          caught: false,
          gfx: this.add.graphics()
        };
        this.drawHorse(horse);
        this.horses.push(horse);
      }
    },
    
    drawHorse: function (horse) {
      var g = horse.gfx;
      g.clear();
      
      if (horse.caught) return;
      
      var x = horse.x;
      var y = horse.y;
      
      // 马身
      g.fillStyle(0x8B4513, 1);
      g.fillRoundedRect(x - 30, y - 15, 60, 30, 8);
      
      // 马头
      g.fillStyle(0x6B3410, 1);
      g.fillRoundedRect(x + 25, y - 25, 20, 25, 5);
      
      // 马腿
      g.fillStyle(0x8B4513, 1);
      g.fillRect(x - 20, y + 15, 8, 20);
      g.fillRect(x - 5, y + 15, 8, 20);
      g.fillRect(x + 10, y + 15, 8, 20);
      g.fillRect(x + 25, y + 15, 8, 20);
      
      // 马尾
      g.lineStyle(3, 0x4A2511, 1);
      g.beginPath();
      g.moveTo(x - 30, y - 5);
      g.lineTo(x - 40, y + 10);
      g.strokePath();
      
      // 马鬃
      g.lineStyle(3, 0x4A2511, 1);
      g.beginPath();
      g.moveTo(x + 25, y - 25);
      g.lineTo(x + 30, y - 30);
      g.strokePath();
    },
    
    createUI: function () {
      // 顶部信息栏
      var uiBg = this.add.rectangle(640, 40, 1280, 60, 0x2E7D32, 0.9);
      
      this.catchesText = this.add.text(200, 40, '🎯 套中: 0/3', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.missesText = this.add.text(500, 40, '❌ 套空: 0/5', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.timerText = this.add.text(800, 40, '⏱️ 30s', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      // 提示
      this.hintText = this.add.text(640, 680, '点击野马甩出套马索！', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(46, 125, 50, 0.8)',
        padding: { x: 16, y: 8 }
      }).setOrigin(0.5);
    },
    
    throwRope: function (targetX, targetY) {
      var self = this;
      this.state = 'THROWING';
      
      // 创建套马索
      this.rope = this.add.graphics();
      this.ropeCircle = this.add.graphics();
      
      // 动画
      var startX = this.playerX;
      var startY = this.playerY;
      var config = window.KAZAKHSTAN_LEVEL.taming.rope;
      
      this.tweens.add({
        targets: { x: startX, y: startY },
        x: targetX,
        y: targetY,
        duration: config.throwDuration,
        ease: 'Quad.easeOut',
        onUpdate: function (tween) {
          var obj = tween.targets[0];
          self.drawRope(startX, startY, obj.x, obj.y);
        },
        onComplete: function () {
          self.checkRopeHit(targetX, targetY);
        }
      });
    },
    
    drawRope: function (x1, y1, x2, y2) {
      this.rope.clear();
      this.rope.lineStyle(3, 0x8B4513, 1);
      this.rope.beginPath();
      this.rope.moveTo(x1, y1);
      this.rope.lineTo(x2, y2);
      this.rope.strokePath();
      
      this.ropeCircle.clear();
      this.ropeCircle.lineStyle(4, 0xD2691E, 1);
      this.ropeCircle.strokeCircle(x2, y2, window.KAZAKHSTAN_LEVEL.taming.rope.circleRadius);
    },
    
    checkRopeHit: function (tx, ty) {
      var config = window.KAZAKHSTAN_LEVEL.taming.rope;
      var hit = false;
      
      for (var i = 0; i < this.horses.length; i++) {
        var horse = this.horses[i];
        if (horse.caught) continue;
        
        var dx = horse.x - tx;
        var dy = horse.y - ty;
        var dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < config.circleRadius + 30) {
          // 套中！
          horse.caught = true;
          this.drawHorse(horse);
          hit = true;
          this.catches++;
          
          window.playKazakhstanSfx('pickup', 0.5);
          this.showToast('🎉 套中了！', 0x4CAF50);
          
          // 提升剩余马匹速度
          if (this.catches < 3) {
            var newSpeed = window.KAZAKHSTAN_LEVEL.taming.speeds[this.catches];
            for (var j = 0; j < this.horses.length; j++) {
              if (!this.horses[j].caught) {
                this.horses[j].speed = newSpeed;
              }
            }
          }
          break;
        }
      }
      
      if (!hit) {
        this.misses++;
        window.playKazakhstanSfx('click', 0.3);
        this.showToast('套空了', 0xFF5722);
      }
      
      // 清理绳索
      this.rope.destroy();
      this.ropeCircle.destroy();
      this.rope = null;
      this.ropeCircle = null;
      
      // 更新 UI
      this.catchesText.setText('🎯 套中: ' + this.catches + '/3');
      this.missesText.setText('❌ 套空: ' + this.misses + '/5');
      
      // 检查胜负
      if (this.catches >= 3) {
        this.state = 'SUCCESS';
        this.showSuccess();
      } else if (this.misses >= 5) {
        this.state = 'FAIL';
        this.showFail('套空次数太多');
      } else {
        this.state = 'AIMING';
      }
    },
    
    showToast: function (msg, color) {
      var toast = this.add.text(640, 120, msg, {
        fontSize: '24px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
        padding: { x: 20, y: 12 }
      }).setOrigin(0.5).setDepth(1000);
      
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 80,
        duration: 1500,
        onComplete: function () { toast.destroy(); }
      });
    },
    
    showSuccess: function () {
      var self = this;
      var overlay = this.add.rectangle(640, 360, 600, 300, 0x2E7D32, 0.95);
      
      this.add.text(640, 280, '🎉 驯服成功！', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.add.text(640, 340, '你成功驯服了一匹骏马', {
        fontSize: '20px', color: '#FFFFFF'
      }).setOrigin(0.5);
      
      var btn = this.add.rectangle(640, 420, 200, 50, 0x4CAF50)
        .setInteractive({ useHandCursor: true });
      
      this.add.text(640, 420, '骑马出发', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      btn.on('pointerdown', function () {
        self.scene.start('PlayScene');
      });
    },
    
    showFail: function (reason) {
      var self = this;
      var overlay = this.add.rectangle(640, 360, 600, 300, 0xC62828, 0.95);
      
      this.add.text(640, 280, '❌ 套马失败', {
        fontSize: '36px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.add.text(640, 340, reason, {
        fontSize: '20px', color: '#FFFFFF'
      }).setOrigin(0.5);
      
      var btn = this.add.rectangle(640, 420, 200, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      
      this.add.text(640, 420, '再试一次', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      btn.on('pointerdown', function () {
        self.scene.restart();
      });
    },
    
    update: function () {
      if (this.state !== 'AIMING' && this.state !== 'THROWING') return;
      
      // 更新计时器
      var elapsed = Date.now() - this.startTime;
      var timeLeft = Math.max(0, this.timeLeft - elapsed);
      this.timerText.setText('⏱️ ' + Math.ceil(timeLeft / 1000) + 's');
      
      if (timeLeft <= 0) {
        this.state = 'FAIL';
        this.showFail('时间到');
        return;
      }
      
      // 更新野马移动
      for (var i = 0; i < this.horses.length; i++) {
        var horse = this.horses[i];
        if (horse.caught) continue;
        
        // 随机变向
        if (Math.random() < 0.02) {
          horse.vx = (Math.random() - 0.5) * horse.speed;
          horse.vy = (Math.random() - 0.5) * horse.speed * 0.5;
        }
        
        // 移动
        horse.x += horse.vx * 0.016;
        horse.y += horse.vy * 0.016;
        
        // 边界反弹
        if (horse.x < 100 || horse.x > CANVAS_W - 100) horse.vx *= -1;
        if (horse.y < 150 || horse.y > CANVAS_H - 150) horse.vy *= -1;
        
        horse.x = Phaser.Math.Clamp(horse.x, 100, CANVAS_W - 100);
        horse.y = Phaser.Math.Clamp(horse.y, 150, CANVAS_H - 150);
        
        this.drawHorse(horse);
      }
    }
  });

  // ============== PlayScene (骑马探索) ==============
  var PlayScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'PlayScene' }); },
    create: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL;
      
      this.cameras.main.setBackgroundColor('#81D4FA');
      
      // 状态
      this.state = 'PLAYING'; // PLAYING, MODAL, DEPARTING
      this.coins = this.loadCoins(); // 里拉
      this.tenge = 0; // 坚戈
      this.items = this.loadItems();
      this.hasHorse = true; // 套马成功后有马
      
      // 绘制地图
      this.drawMap();
      
      // 玩家
      var startPos = config.map.playerStart;
      this.playerX = startPos.x;
      this.playerY = startPos.y;
      this.playerContainer = this.add.container(startPos.x, startPos.y);
      this.drawPlayer();
      
      // 蒙古包
      this.yurts = [];
      for (var i = 0; i < config.yurts.length; i++) {
        this.createYurt(config.yurts[i]);
      }
      
      // 兑换中心
      this.createExchangeCenter();
      
      // 出口
      this.createExit();
      
      // HUD
      this.createHUD();
      
      // 输入
      this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
      
      // 更新循环
      this.time.addEvent({
        delay: 16,
        loop: true,
        callback: this.update,
        callbackScope: this
      });
    },
    
    loadCoins: function () {
      try {
        return parseInt(localStorage.getItem('silkroad_coins') || '0', 10);
      } catch (e) {
        return 0;
      }
    },
    
    saveCoins: function () {
      try {
        localStorage.setItem('silkroad_coins', this.coins.toString());
      } catch (e) {}
    },
    
    loadItems: function () {
      try {
        return JSON.parse(localStorage.getItem('silkroad_kazakhstan_items') || '[]');
      } catch (e) {
        return [];
      }
    },
    
    saveItems: function () {
      try {
        localStorage.setItem('silkroad_kazakhstan_items', JSON.stringify(this.items));
      } catch (e) {}
    },
    
    drawMap: function () {
      var gfx = this.add.graphics();
      
      // 天空
      gfx.fillGradientStyle(0x81D4FA, 0x81D4FA, 0xB3E5FC, 0xB3E5FC, 1);
      gfx.fillRect(0, 0, CANVAS_W, CANVAS_H / 2);
      
      // 雪山
      gfx.fillStyle(0xFFFFFF, 0.8);
      gfx.fillTriangle(100, 300, 200, 200, 300, 300);
      gfx.fillTriangle(400, 320, 500, 220, 600, 320);
      gfx.fillTriangle(800, 310, 900, 210, 1000, 310);
      
      // 草原
      gfx.fillStyle(0x7CB342, 1);
      gfx.fillRect(0, CANVAS_H / 2, CANVAS_W, CANVAS_H / 2);
      
      // 草地纹理
      gfx.fillStyle(0x558B2F, 0.5);
      for (var i = 0; i < 100; i++) {
        var x = Math.random() * CANVAS_W;
        var y = CANVAS_H / 2 + Math.random() * (CANVAS_H / 2);
        gfx.fillRect(x, y, 20, 3);
      }
    },
    
    drawPlayer: function () {
      this.playerContainer.removeAll(true);
      
      // 马
      if (this.hasHorse) {
        var horseGfx = this.add.graphics();
        horseGfx.fillStyle(0x8B4513, 1);
        horseGfx.fillRoundedRect(-30, -5, 60, 25, 8);
        horseGfx.fillStyle(0x6B3410, 1);
        horseGfx.fillRoundedRect(25, -15, 18, 20, 5);
        horseGfx.fillStyle(0x8B4513, 1);
        horseGfx.fillRect(-20, 20, 8, 15);
        horseGfx.fillRect(-5, 20, 8, 15);
        horseGfx.fillRect(10, 20, 8, 15);
        horseGfx.fillRect(25, 20, 8, 15);
        this.playerContainer.add(horseGfx);
      }
      
      // 角色（骑在马上）
      var avatarId = localStorage.getItem('silkroad_avatar') || 'malay';
      var avatar = window.SilkRoadCommon.buildAvatarSprite(this, avatarId);
      avatar.setScale(0.8);
      avatar.setPosition(0, this.hasHorse ? -20 : 0);
      this.playerContainer.add(avatar);
    },
    
    createYurt: function (yurtConfig) {
      var self = this;
      var yurt = {
        config: yurtConfig,
        gfx: this.add.graphics(),
        label: this.add.text(yurtConfig.x, yurtConfig.y + 50, yurtConfig.emoji + ' ' + yurtConfig.name, {
          fontSize: '14px', color: '#FFFFFF', fontStyle: 'bold',
          backgroundColor: 'rgba(46, 125, 50, 0.8)',
          padding: { x: 8, y: 4 }
        }).setOrigin(0.5)
      };
      
      this.drawYurt(yurt);
      this.yurts.push(yurt);
      
      // 点击交互
      var hitArea = this.add.rectangle(yurtConfig.x, yurtConfig.y, 100, 100, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      
      hitArea.on('pointerdown', function () {
        var dx = self.playerX - yurtConfig.x;
        var dy = self.playerY - yurtConfig.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 80) {
          self.openYurtModal(yurtConfig);
        } else {
          self.showToast('太远了，走近一点', 0xFF9800);
        }
      });
    },
    
    drawYurt: function (yurt) {
      var g = yurt.gfx;
      var x = yurt.config.x;
      var y = yurt.config.y;
      
      g.clear();
      
      // 蒙古包底座
      g.fillStyle(0xF5F5DC, 1);
      g.fillCircle(x, y, 35);
      
      // 蒙古包顶
      g.fillStyle(0x8D6E63, 1);
      g.fillTriangle(x - 30, y - 10, x + 30, y - 10, x, y - 40);
      
      // 门
      g.fillStyle(0x5D4037, 1);
      g.fillRect(x - 8, y - 5, 16, 20);
      
      // 装饰
      g.lineStyle(2, 0xD84315, 1);
      g.strokeCircle(x, y, 35);
    },
    
    createExchangeCenter: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL.exchange;
      
      this.exchangeGfx = this.add.graphics();
      this.drawExchangeCenter();
      
      this.exchangeLabel = this.add.text(config.position.x, config.position.y + 50, '💱 货币兑换', {
        fontSize: '14px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(46, 125, 50, 0.8)',
        padding: { x: 8, y: 4 }
      }).setOrigin(0.5);
      
      var hitArea = this.add.rectangle(config.position.x, config.position.y, 100, 100, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      
      hitArea.on('pointerdown', function () {
        var dx = self.playerX - config.position.x;
        var dy = self.playerY - config.position.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 80) {
          self.openExchangeModal();
        } else {
          self.showToast('太远了，走近一点', 0xFF9800);
        }
      });
    },
    
    drawExchangeCenter: function () {
      var g = this.exchangeGfx;
      var config = window.KAZAKHSTAN_LEVEL.exchange;
      var x = config.position.x;
      var y = config.position.y;
      
      g.clear();
      
      // 帐篷
      g.fillStyle(0xFFEB3B, 1);
      g.fillTriangle(x - 40, y + 20, x + 40, y + 20, x, y - 30);
      
      // 底座
      g.fillStyle(0xF57F17, 1);
      g.fillRect(x - 35, y + 20, 70, 15);
      
      // 装饰
      g.lineStyle(3, 0xE65100, 1);
      g.strokeTriangle(x - 40, y + 20, x + 40, y + 20, x, y - 30);
    },
    
    createExit: function () {
      var self = this;
      var config = window.KAZAKHSTAN_LEVEL.departure;
      
      this.exitGfx = this.add.graphics();
      this.drawExit();
      
      this.exitLabel = this.add.text(config.exitZone.x, config.exitZone.y + 70, '🚪 → 新疆', {
        fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: 'rgba(198, 40, 40, 0.9)',
        padding: { x: 10, y: 6 }
      }).setOrigin(0.5);
      
      var hitArea = this.add.circle(config.exitZone.x, config.exitZone.y, config.exitZone.radius, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      
      hitArea.on('pointerdown', function () {
        var dx = self.playerX - config.exitZone.x;
        var dy = self.playerY - config.exitZone.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < config.exitZone.radius) {
          self.tryDepart();
        } else {
          self.showToast('太远了，走近一点', 0xFF9800);
        }
      });
    },
    
    drawExit: function () {
      var g = this.exitGfx;
      var config = window.KAZAKHSTAN_LEVEL.departure;
      var x = config.exitZone.x;
      var y = config.exitZone.y;
      
      g.clear();
      
      // 门框
      g.fillStyle(0x8D6E63, 1);
      g.fillRect(x - 25, y - 30, 50, 60);
      
      // 门
      g.fillStyle(0x5D4037, 1);
      g.fillRect(x - 20, y - 25, 40, 50);
      
      // 箭头
      g.fillStyle(0xFFFFFF, 1);
      g.fillTriangle(x - 10, y, x + 10, y, x, y - 15);
    },
    
    createHUD: function () {
      var uiBg = this.add.rectangle(640, 40, 1280, 60, 0x2E7D32, 0.9);
      
      this.coinsText = this.add.text(150, 40, '💰 ' + this.coins + ' ₺', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.tengeText = this.add.text(350, 40, '💵 ' + this.tenge + ' ₸', {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      this.itemsText = this.add.text(600, 40, '🎒 物品: ' + this.items.length, {
        fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      
      // 必需品提示
      var required = window.KAZAKHSTAN_LEVEL.departure.requiredItems;
      var hasWarm = this.items.indexOf('warm_clothes') >= 0;
      var hasKumis = this.items.indexOf('kumis') >= 0;
      
      this.requiredText = this.add.text(900, 40, 
        (hasWarm ? '✅' : '❌') + ' 保暖衣物  ' + (hasKumis ? '✅' : '❌') + ' 马奶酒', {
        fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
    },
    
    updateHUD: function () {
      this.coinsText.setText('💰 ' + this.coins + ' ₺');
      this.tengeText.setText('💵 ' + this.tenge + ' ₸');
      this.itemsText.setText('🎒 物品: ' + this.items.length);
      
      var required = window.KAZAKHSTAN_LEVEL.departure.requiredItems;
      var hasWarm = this.items.indexOf('warm_clothes') >= 0;
      var hasKumis = this.items.indexOf('kumis') >= 0;
      
      this.requiredText.setText(
        (hasWarm ? '✅' : '❌') + ' 保暖衣物  ' + (hasKumis ? '✅' : '❌') + ' 马奶酒'
      );
    },
    
    openYurtModal: function (yurtConfig) {
      var self = this;
      this.state = 'MODAL';
      
      var modal = this.add.container(640, 360);
      modal.setDepth(2000);
      
      // 背景
      var bg = this.add.rectangle(0, 0, 700, 500, 0x2E7D32, 0.95);
      modal.add(bg);
      
      // 标题
      var title = this.add.text(0, -200, yurtConfig.emoji + ' ' + yurtConfig.name, {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(title);
      
      // 商品列表
      var itemY = -100;
      for (var i = 0; i < yurtConfig.items.length; i++) {
        var item = yurtConfig.items[i];
        
        // 商品卡片
        var card = this.add.rectangle(0, itemY, 600, 80, 0x1B5E20, 0.9);
        modal.add(card);
        
        // 名称
        var name = this.add.text(-200, itemY - 10, item.name, {
          fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        modal.add(name);
        
        // 描述
        var desc = this.add.text(-200, itemY + 15, item.desc, {
          fontSize: '14px', color: '#B9F6CA'
        }).setOrigin(0, 0.5);
        modal.add(desc);
        
        // 价格
        var price = this.add.text(150, itemY, item.price + ' ₸', {
          fontSize: '20px', color: '#FFEB3B', fontStyle: 'bold'
        }).setOrigin(0, 0.5);
        modal.add(price);
        
        // 购买按钮
        var btnBg = this.add.rectangle(250, itemY, 100, 40, 0x4CAF50);
        modal.add(btnBg);
        
        var btnText = this.add.text(250, itemY, '购买', {
          fontSize: '16px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0.5);
        modal.add(btnText);
        
        // 按钮交互
        (function (itemId, itemPrice) {
          btnBg.setInteractive({ useHandCursor: true });
          btnBg.on('pointerdown', function () {
            self.buyItem(itemId, itemPrice);
          });
        })(item.id, item.price);
        
        itemY += 100;
      }
      
      // 关闭按钮
      var closeBg = this.add.rectangle(0, 200, 150, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      
      var closeText = this.add.text(0, 200, '关闭', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(closeText);
      
      closeBg.on('pointerdown', function () {
        modal.destroy();
        self.state = 'PLAYING';
      });
      
      this.currentModal = modal;
    },
    
    buyItem: function (itemId, price) {
      if (this.tenge < price) {
        this.showToast('坚戈不够！先去兑换', 0xFF5722);
        return;
      }
      
      if (this.items.indexOf(itemId) >= 0) {
        this.showToast('你已经有了', 0xFF9800);
        return;
      }
      
      this.tenge -= price;
      this.items.push(itemId);
      this.saveItems();
      
      window.playKazakhstanSfx('pickup', 0.5);
      this.showToast('✅ 购买成功', 0x4CAF50);
      
      this.updateHUD();
      
      // 关闭 modal
      if (this.currentModal) {
        this.currentModal.destroy();
        this.currentModal = null;
      }
      this.state = 'PLAYING';
    },
    
    openExchangeModal: function () {
      var self = this;
      this.state = 'MODAL';
      
      var modal = this.add.container(640, 360);
      modal.setDepth(2000);
      
      // 背景
      var bg = this.add.rectangle(0, 0, 600, 400, 0x2E7D32, 0.95);
      modal.add(bg);
      
      // 标题
      var title = this.add.text(0, -150, '💱 货币兑换', {
        fontSize: '28px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(title);
      
      // 汇率
      var rate = window.KAZAKHSTAN_LEVEL.exchange.rate;
      var rateText = this.add.text(0, -100, '汇率: 1 ₺ = ' + rate + ' ₸', {
        fontSize: '20px', color: '#FFEB3B', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(rateText);
      
      // 当前余额
      var balance = this.add.text(0, -50, '当前: ' + this.coins + ' ₺  |  ' + this.tenge + ' ₸', {
        fontSize: '18px', color: '#FFFFFF'
      }).setOrigin(0.5);
      modal.add(balance);
      
      // 兑换按钮
      var amounts = [10, 50, 100];
      var btnY = 0;
      
      for (var i = 0; i < amounts.length; i++) {
        var amount = amounts[i];
        
        var btnBg = this.add.rectangle(0, btnY, 400, 50, 0x4CAF50);
        modal.add(btnBg);
        
        var btnText = this.add.text(0, btnY, '兑换 ' + amount + ' ₺ → ' + (amount * rate) + ' ₸', {
          fontSize: '18px', color: '#FFFFFF', fontStyle: 'bold'
        }).setOrigin(0.5);
        modal.add(btnText);
        
        (function (amt) {
          btnBg.setInteractive({ useHandCursor: true });
          btnBg.on('pointerdown', function () {
            self.exchangeCoins(amt);
          });
        })(amount);
        
        btnY += 70;
      }
      
      // 关闭按钮
      var closeBg = this.add.rectangle(0, 170, 150, 50, 0xE53935)
        .setInteractive({ useHandCursor: true });
      modal.add(closeBg);
      
      var closeText = this.add.text(0, 170, '关闭', {
        fontSize: '20px', color: '#FFFFFF', fontStyle: 'bold'
      }).setOrigin(0.5);
      modal.add(closeText);
      
      closeBg.on('pointerdown', function () {
        modal.destroy();
        self.state = 'PLAYING';
      });
      
      this.currentModal = modal;
    },
    
    exchangeCoins: function (amount) {
      if (this.coins < amount) {
        this.showToast('里拉不够！', 0xFF5722);
        return;
      }
      
      var rate = window.KAZAKHSTAN_LEVEL.exchange.rate;
      this.coins -= amount;
      this.tenge += amount * rate;
      this.saveCoins();
      
      window.playKazakhstanSfx('exchange', 0.5);
      this.showToast('✅ 兑换成功', 0x4CAF50);
      
      this.updateHUD();
      
      // 关闭 modal
      if (this.currentModal) {
        this.currentModal.destroy();
        this.currentModal = null;
      }
      this.state = 'PLAYING';
    },
    
    tryDepart: function () {
      var required = window.KAZAKHSTAN_LEVEL.departure.requiredItems;
      var hasWarm = this.items.indexOf('warm_clothes') >= 0;
      var hasKumis = this.items.indexOf('kumis') >= 0;
      
      if (!hasWarm || !hasKumis) {
        this.showToast('还需要购买必需品！', 0xFF5722);
        return;
      }
      
      this.depart();
    },
    
    depart: function () {
      var self = this;
      this.state = 'DEPARTING';
      
      // 保存通关状态
      try {
        var cleared = JSON.parse(localStorage.getItem('silkroad_cleared_levels') || '[]');
        if (cleared.indexOf(3) < 0) {
          cleared.push(3);
          localStorage.setItem('silkroad_cleared_levels', JSON.stringify(cleared));
        }
      } catch (e) {}
      
      // 出发动画
      var overlay = this.add.rectangle(640, 360, CANVAS_W, CANVAS_H, 0x000000, 0);
      overlay.setDepth(3000);
      
      this.tweens.add({
        targets: overlay,
        alpha: 0.8,
        duration: 1000,
        onComplete: function () {
          var title = self.add.text(640, 360, '🏔️ 新疆·天山', {
            fontSize: '48px', color: '#FFFFFF', fontStyle: 'bold'
          }).setOrigin(0.5).setDepth(3001);
          
          self.time.delayedCall(2000, function () {
            window.location.href = '/games/silk-road/level/4';
          });
        }
      });
    },
    
    showToast: function (msg, color) {
      var toast = this.add.text(640, 120, msg, {
        fontSize: '24px', color: '#FFFFFF', fontStyle: 'bold',
        backgroundColor: Phaser.Display.Color.IntegerToColor(color).rgba,
        padding: { x: 20, y: 12 }
      }).setOrigin(0.5).setDepth(1000);
      
      this.tweens.add({
        targets: toast,
        alpha: 0,
        y: 80,
        duration: 1500,
        onComplete: function () { toast.destroy(); }
      });
    },
    
    update: function () {
      if (this.state !== 'PLAYING') return;
      
      var speed = window.KAZAKHSTAN_LEVEL.movement.rideSpeed;
      var dx = 0, dy = 0;
      
      if (this.keys.A.isDown || this.keys.LEFT.isDown) dx -= 1;
      if (this.keys.D.isDown || this.keys.RIGHT.isDown) dx += 1;
      if (this.keys.W.isDown || this.keys.UP.isDown) dy -= 1;
      if (this.keys.S.isDown || this.keys.DOWN.isDown) dy += 1;
      
      if (dx !== 0 || dy !== 0) {
        // 归一化
        var len = Math.sqrt(dx * dx + dy * dy);
        dx /= len;
        dy /= len;
        
        this.playerX += dx * speed * 0.016;
        this.playerY += dy * speed * 0.016;
        
        // 边界
        this.playerX = Phaser.Math.Clamp(this.playerX, 50, CANVAS_W - 50);
        this.playerY = Phaser.Math.Clamp(this.playerY, 100, CANVAS_H - 50);
        
        this.playerContainer.setPosition(this.playerX, this.playerY);
        
        // 翻转
        if (dx < 0) this.playerContainer.setScale(-1, 1);
        else if (dx > 0) this.playerContainer.setScale(1, 1);
      }
    }
  });

  // ============== 游戏初始化 ==============
  var config = {
    type: Phaser.AUTO,
    width: CANVAS_W,
    height: CANVAS_H,
    parent: 'game-container',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [BootScene, TamingScene, PlayScene]
  };

  var game = new Phaser.Game(config);

  // 全屏按钮
  var fsBtn = document.getElementById('kazakhstan-fullscreen');
  if (fsBtn) {
    fsBtn.addEventListener('click', function () {
      if (game.scale.isFullscreen) {
        game.scale.stopFullscreen();
      } else {
        game.scale.startFullscreen();
      }
    });
  }

  // 竖屏提示
  function checkOrientation() {
    var lock = document.getElementById('orientation-lock');
    if (!lock) return;
    
    if (window.innerHeight > window.innerWidth) {
      lock.style.display = 'flex';
    } else {
      lock.style.display = 'none';
    }
  }
  
  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', checkOrientation);
  checkOrientation();

})();
