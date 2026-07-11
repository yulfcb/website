// 丝绸之路 — 关卡间共享代码 (avatar sprite / 边界 toast / 骆驼骑乘)
//
// 用法: 先加载此文件, 再加载各关 game.js.
//   window.SilkRoadCommon.buildAvatarSprite(scene, avatarId)
//   window.SilkRoadCommon.showBoundaryToast(scene, yPos)
//   window.SilkRoadCommon.createCamelSystem(scene, opts) -> { camelEmoji, toggleMode, updateBtn }
//
// 设计: 各关 camel emoji id=-1004 与伊朗关保持一致. 各关 _luggageCount(id)
// 必须存在 (返回该 id 在 luggage 里的数量).

(function () {
  'use strict';
  if (!window.SilkRoadCommon) {
    window.SilkRoadCommon = {};
  }

  // ============================================================
  // 1) buildAvatarSprite — 4 角色 graphics (malay/fala/cn_m/cn_f)
  //    跟卡塔尔/伊朗/土耳其之前手写版本 100% 一致, 统一在这.
  // ============================================================
  window.SilkRoadCommon.buildAvatarSprite = function (scene, avatarId) {
    var g = scene.add.graphics();
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
      for (var j = 0; j < 3; j++) g.fillCircle(0, j * 5, 1);
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
  };

  // ============================================================
  // 2) showBoundaryToast — 撞墙提示 (跟伊朗关/卡塔尔关一致)
  // ============================================================
  window.SilkRoadCommon.showBoundaryToast = function (scene, yPos) {
    yPos = yPos || 200;
    if (!scene.boundaryToast) {
      scene.boundaryToast = scene.add.text(scene.scale.width / 2, yPos, '🚧 撞墙了', {
        fontSize: '18px', color: '#FFD98A', backgroundColor: '#2A1606',
        padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setDepth(1000);
    }
    scene.boundaryToast.setAlpha(1);
    scene.boundaryToast.setPosition(scene.scale.width / 2, yPos);
    if (scene._boundaryTween) scene._boundaryTween.stop();
    scene._boundaryTween = scene.tweens.add({
      targets: scene.boundaryToast,
      alpha: 0,
      duration: 600,
      delay: 400,
    });
  };

  // ============================================================
  // 3) createCamelSystem — 骆驼骑乘系统 (跟伊朗关一致)
  //    返回 { camelEmoji, toggleMode, updateBtn, hasCamel }
  // ============================================================
  window.SilkRoadCommon.createCamelSystem = function (scene, opts) {
    opts = opts || {};
    var luggageId = opts.luggageId != null ? opts.luggageId : -1004;
    var camelEmoji = scene.add.text(0, 22, '🐪', { fontSize: '44px' }).setOrigin(0.5);
    camelEmoji.setVisible(false);
    camelEmoji.setName('silkroad:camelEmoji');

    function toggleMode() {
      if (typeof scene._luggageCount !== 'function') return;
      if (scene._luggageCount(luggageId) <= 0) {
        var msg = opts.toastNoCamel || '先去骆驼商人那儿买骆驼 🐫';
        if (typeof scene.showToast === 'function') scene.showToast(msg);
        return;
      }
      scene.camelMode = !scene.camelMode;
      updateBtn();
      if (typeof opts.sfxToggle === 'function') opts.sfxToggle();
    }

    function updateBtn() {
      var has = (typeof scene._luggageCount === 'function')
        ? scene._luggageCount(luggageId) > 0
        : false;
      if (scene.camelBtn) {
        if (has) {
          scene.camelBtn.setVisible(true);
          scene.camelBtn.setText(scene.camelMode ? '🐪 骑乘中' : '🚶 步行');
          scene.camelBtn.setStyle({
            backgroundColor: scene.camelMode ? '#5B8C3A' : '#1B5E8A',
            padding: { x: 10, y: 3 },
          });
        } else {
          scene.camelBtn.setVisible(false);
          scene.camelMode = false;
        }
      }
      camelEmoji.setVisible(scene.camelMode && has);
      if (scene.playerSprite && scene.playerSprite.elf) {
        var s = (scene.camelMode && has) ? 0.7 : 1.0;
        scene.playerSprite.elf.setScale(s);
        scene.playerSprite.elf.y = (scene.camelMode && has) ? -16 : 0;
      }
    }

    function hasCamel() {
      return typeof scene._luggageCount === 'function' && scene._luggageCount(luggageId) > 0;
    }

    return {
      camelEmoji: camelEmoji,
      toggleMode: toggleMode,
      updateBtn: updateBtn,
      hasCamel: hasCamel,
    };
  };
})();
