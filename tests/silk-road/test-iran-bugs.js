// @ts-check
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8000';
const IRAN_URL = `${BASE_URL}/games/silk-road/level/1`;

test.describe('Iran Level Bug Fixes', () => {
  
  test('Bug 1: 骆驼头朝向应该跟随移动方向', async ({ page }) => {
    await page.goto(IRAN_URL);
    await page.waitForTimeout(2000); // 等待游戏初始化
    
    // 检查初始状态
    const initialState = await page.evaluate(() => {
      const game = window.game;
      if (!game) return { error: 'Game not initialized' };
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return { error: 'PlayScene not found' };
      
      return {
        camelScaleX: scene.camelBackEmoji?.scaleX,
        camelVisible: scene.camelBackEmoji?.visible,
        playerFacing: scene.player?.facing,
        containerScaleX: scene.playerContainer?.scaleX
      };
    });
    
    console.log('Initial state:', initialState);
    expect(initialState.error).toBeUndefined();
    expect(initialState.camelScaleX).toBe(1);
    
    // 模拟向左移动（通过按键）
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    
    const afterLeftMove = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      return {
        camelScaleX: scene.camelBackEmoji?.scaleX,
        playerFacing: scene.player?.facing,
        containerScaleX: scene.playerContainer?.scaleX,
        playerX: scene.player?.x
      };
    });
    
    console.log('After left move:', afterLeftMove);
    // 向左移动后，camel 应该朝左
    // 如果 player.facing = -1，container.scaleX 可能是 -1
    // camelBackEmoji.scaleX 应该是 1（相对于 container）
    expect(afterLeftMove.camelScaleX).toBe(1);
    expect(afterLeftMove.playerFacing).toBe(-1);
    
    // 模拟向右移动
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    
    const afterRightMove = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      return {
        camelScaleX: scene.camelBackEmoji?.scaleX,
        playerFacing: scene.player?.facing,
        containerScaleX: scene.playerContainer?.scaleX,
        playerX: scene.player?.x
      };
    });
    
    console.log('After right move:', afterRightMove);
    expect(afterRightMove.camelScaleX).toBe(1);
    expect(afterRightMove.playerFacing).toBe(1);
  });
  
  test('Bug 2: 默认水分值应该是 20', async ({ page }) => {
    await page.goto(IRAN_URL);
    await page.waitForTimeout(2000);
    
    const waterState = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return { error: 'PlayScene not found' };
      
      const jugs = scene.jugs || [];
      const totalWater = jugs.reduce((sum, jug) => sum + (jug.water || 0), 0);
      
      return {
        jugsCount: jugs.length,
        jugs: jugs.map(j => ({ capacity: j.capacity, water: j.water })),
        totalWater: totalWater,
        JUG_CAPACITY: window.IRAN_LEVEL?.JUG_CAPACITY
      };
    });
    
    console.log('Water state:', waterState);
    expect(waterState.error).toBeUndefined();
    // 检查 JUG_CAPACITY 配置
    expect(waterState.JUG_CAPACITY).toBe(20);
    
    // 如果有水壶，检查总水量
    if (waterState.jugsCount > 0) {
      // 根据游戏逻辑，初始可能有水也可能没水
      // 但每个水壶的容量应该是 20
      for (const jug of waterState.jugs) {
        expect(jug.capacity).toBe(20);
      }
    }
  });
  
  test('Bug 3: 4 个水壶应该能过关', async ({ page }) => {
    await page.goto(IRAN_URL);
    await page.waitForTimeout(2000);
    
    // 检查 TARGET_JUGS 配置
    const config = await page.evaluate(() => {
      return {
        TARGET_JUGS: window.IRAN_LEVEL?.TARGET_JUGS
      };
    });
    
    console.log('Config:', config);
    expect(config.TARGET_JUGS).toBe(4);
    
    // 模拟购买 4 个水壶并灌满
    await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return;
      
      // 清空现有水壶
      scene.jugs = [];
      
      // 添加 4 个满水壶
      for (let i = 0; i < 4; i++) {
        scene.jugs.push({
          capacity: 20,
          water: 20
        });
      }
      
      // 刷新 HUD
      if (scene._refreshHudCounts) scene._refreshHudCounts();
    });
    
    await page.waitForTimeout(500);
    
    // 检查水壶状态
    const jugState = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      return {
        jugsCount: scene.jugs.length,
        totalWater: scene.jugs.reduce((sum, j) => sum + j.water, 0)
      };
    });
    
    console.log('Jug state after adding:', jugState);
    expect(jugState.jugsCount).toBe(4);
    expect(jugState.totalWater).toBe(80); // 4 * 20
    
    // 检查 _allJugsFull 逻辑
    const allFull = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (scene._allJugsFull) {
        return scene._allJugsFull();
      }
      return null;
    });
    
    console.log('All jugs full:', allFull);
    expect(allFull).toBe(true);
    
    // 注意：实际过关需要走到出口并触发，这里只验证逻辑正确性
    // 如果要完整测试，需要模拟移动到出口位置
  });
  
  test('Bug 4: 过关失败提示语应该正确', async ({ page }) => {
    await page.goto(IRAN_URL);
    await page.waitForTimeout(2000);
    
    // 设置水壶不足的状态（1 个水壶，不满）
    await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return;
      
      scene.jugs = [{ capacity: 20, water: 10 }];
      if (scene._refreshHudCounts) scene._refreshHudCounts();
    });
    
    await page.waitForTimeout(500);
    
    // 触发过关失败（点击出口按钮或调用相关函数）
    // 需要找到出口按钮的触发方式
    const exitTriggered = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return { error: 'Scene not found' };
      
      // 找到出口按钮并点击
      const exitBtn = scene.exitBtn;
      if (exitBtn && exitBtn.emit) {
        exitBtn.emit('pointerdown');
        return { triggered: true };
      }
      
      // 或者直接调用 tryEnterExit
      if (scene.tryEnterExit) {
        scene.tryEnterExit();
        return { triggered: true, method: 'tryEnterExit' };
      }
      
      return { triggered: false, error: 'No exit method found' };
    });
    
    console.log('Exit triggered:', exitTriggered);
    
    // 等待 toast 显示
    await page.waitForTimeout(1000);
    
    // 检查 toast 文字
    const toastText = await page.evaluate(() => {
      const game = window.game;
      const scene = game.scene.scenes.find(s => s.key === 'PlayScene');
      if (!scene) return null;
      
      // 查找 showToast 创建的文本对象
      // 通常是 scene.children.list 中的 Text 对象
      for (const child of scene.children.list) {
        if (child.type === 'Text' && child.text && child.text.includes('路途遥远')) {
          return child.text;
        }
      }
      return null;
    });
    
    console.log('Toast text:', toastText);
    expect(toastText).toContain('到土耳其路途遥远，水量少于20，骆驼少于3头，是过不去的');
  });
  
});
