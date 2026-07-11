#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Playwright E2E 测试：Bug 1 - 骆驼朝向
测试目标：验证骑骆驼向左移动时，骆驼 emoji 头朝向正确（不被容器翻转带歪）

关键：必须先给玩家加骆驼（_addToLuggage），然后调用 toggleCamelMode()
"""

import time
import base64
from playwright.sync_api import sync_playwright


def test_camel_orientation():
    print("=== Bug 1: 骆驼朝向测试 ===\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        
        page = context.new_page()
        
        # 先设置 localStorage
        page.goto('http://127.0.0.1/games/silk-road/mode', wait_until="networkidle")
        page.evaluate('''() => {
            localStorage.setItem('silkroad_cleared_levels', '[0]');
            localStorage.setItem('silkroad_session_id', 'test_session');
        }''')
        
        # 访问伊朗关卡
        print("1. 导航到伊朗关卡...")
        page.goto('http://127.0.0.1/games/silk-road/level/1', wait_until="networkidle", timeout=60000)
        
        # 等待游戏初始化
        print("2. 等待游戏初始化...")
        for i in range(20):
            ready = page.evaluate('''() => {
                const game = window.__iranGame;
                if (!game) return false;
                const scenes = game.scene.scenes;
                return scenes && scenes.length >= 2 && scenes[1] && scenes[1].playerContainer;
            }''')
            if ready:
                print(f"   ✅ 游戏在第 {i+1} 次检查时初始化完成")
                break
            time.sleep(0.5)
        
        time.sleep(1)
        
        # === 关键：给玩家加骆驼，然后进入骑骆驼状态 ===
        print("3. 给玩家加骆驼并进入骑骆驼状态...")
        state = page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            
            // 1. 给玩家加一头骆驼（id=-1004）
            scene._addToLuggage(-1004, 1);
            
            // 2. 切换骑骆驼模式
            scene.toggleCamelMode();
            
            // 3. 返回状态
            return {
                camelMode: scene.camelMode,
                camelVisible: scene.camelBackEmoji ? scene.camelBackEmoji.visible : false,
                camelScaleX: scene.camelBackEmoji ? scene.camelBackEmoji.scaleX : null,
                containerScaleX: scene.playerContainer.scaleX,
                playerX: scene.player.x,
                luggageCount: scene._luggageCount(-1004)
            };
        }''')
        print(f"   骑骆驼初始状态: {state}")
        
        if not state['camelMode'] or not state['camelVisible']:
            print("   ❌ 骆驼模式未成功启用！")
            browser.close()
            return False
        
        # === 截图 1：骑骆驼朝右 ===
        print("\n4. 截图：骑骆驼初始状态（朝右）...")
        time.sleep(0.5)
        page.screenshot(path='/tmp/bug1-camel-right.png')
        print("   ✅ 截图 1 已保存: /tmp/bug1-camel-right.png")
        
        # === 向左移动 ===
        print("\n5. 模拟向左移动...")
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            scene.keys['left'] = true;
        }''')
        time.sleep(0.5)
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            scene.keys['left'] = false;
        }''')
        time.sleep(1)
        
        # === 检查移动后的状态 ===
        print("6. 检查移动后的状态...")
        after_state = page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            return {
                camelMode: scene.camelMode,
                camelVisible: scene.camelBackEmoji ? scene.camelBackEmoji.visible : false,
                camelScaleX: scene.camelBackEmoji ? scene.camelBackEmoji.scaleX : null,
                containerScaleX: scene.playerContainer.scaleX,
                playerX: scene.player.x,
                luggageCount: scene._luggageCount(-1004)
            };
        }''')
        print(f"   移动后状态: {after_state}")
        
        # === 截图 2：骑骆驼向左 ===
        print("\n7. 截图：骑骆驼向左移动后...")
        time.sleep(0.5)
        page.screenshot(path='/tmp/bug1-camel-left.png')
        print("   ✅ 截图 2 已保存: /tmp/bug1-camel-left.png")
        
        # === 验证结果 ===
        print("\n8. 验证结果...")
        success = True
        
        # 确认骆驼仍然可见
        if not after_state.get('camelVisible'):
            print(f"   ❌ 骆驼不可见! camelVisible={after_state.get('camelVisible')}")
            success = False
        else:
            print("   ✅ 骆驼 emoji 可见")
        
        # 核心验证：camelScaleX 始终为 1
        if after_state.get('camelScaleX') == 1:
            print("   ✅ camelScaleX = 1（骆驼头朝向正确，未被容器翻转带歪）")
        else:
            print(f"   ❌ camelScaleX = {after_state.get('camelScaleX')}（骆驼头被错误翻转）")
            success = False
        
        # 确认 container 确实翻转了
        if after_state.get('containerScaleX') == -1:
            print(f"   ✅ containerScaleX = -1（容器已翻转，角色朝左）")
        else:
            print(f"   ⚠️ containerScaleX = {after_state.get('containerScaleX')}")
        
        # 确认玩家确实向左移动了
        if after_state.get('playerX', 200) < state.get('playerX', 200):
            print(f"   ✅ 玩家向左移动了: {state['playerX']} → {after_state['playerX']}")
        else:
            print(f"   ⚠️ 玩家未移动或向右: {state.get('playerX')} → {after_state.get('playerX')}")
        
        browser.close()
        
        if success:
            print("\n✅ Bug 1 测试通过！（骑骆驼状态下验证）")
            return True
        else:
            print("\n❌ Bug 1 测试失败！")
            return False


if __name__ == '__main__':
    success = test_camel_orientation()
    exit(0 if success else 1)
