#!/usr/bin/env python3
"""
测试伊朗关卡的 4 个 bug 修复
Bug 1: 骆驼头朝向反了
Bug 2: 默认水分值应该是 20（不是 10）
Bug 3: 4 个水壶应该能过关
Bug 4: 过关失败提示语
"""

from playwright.sync_api import sync_playwright
import time

def wait_for_game_ready(page, timeout=10):
    """等待游戏完全初始化"""
    start = time.time()
    while time.time() - start < timeout:
        ready = page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return false;
            const scenes = game.scene.scenes;
            if (!scenes || scenes.length < 2) return false;
            const playScene = scenes[1];
            return playScene && playScene.playerContainer != null;
        }''')
        if ready:
            return True
        time.sleep(0.5)
    return False


def test_bug1_camel_direction():
    """测试骆驼头朝向是否跟随移动方向"""
    print("\n=== Bug 1: 骆驼头朝向测试 ===")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 访问伊朗关卡
        page.goto('http://127.0.0.1/games/silk-road/level/1', wait_until="commit", timeout=60000)
        page.wait_for_load_state('domcontentloaded')
        
        # 等待游戏初始化
        if not wait_for_game_ready(page):
            raise Exception("游戏初始化超时")
        
        time.sleep(1)
        
        # 检查初始状态
        state = page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return null;
            const scene = game.scene.scenes[1];
            if (!scene) return null;
            return {
                camelScaleX: scene.camelBackEmoji?.scaleX,
                playerFacing: scene.player?.facing,
                containerScaleX: scene.playerContainer?.scaleX
            };
        }''')
        
        if not state:
            raise Exception("无法读取游戏初始状态")
        
        print(f"初始状态: camelScaleX={state.get('camelScaleX')}, "
              f"playerFacing={state.get('playerFacing')}, "
              f"containerScaleX={state.get('containerScaleX')}")
        
        # 验证初始状态
        assert state.get('camelScaleX') == 1, \
            f"初始 camelScaleX 应该是 1，实际是 {state.get('camelScaleX')}"
        
        # 直接用 JS 触发向左移动（绕过 Playwright 键盘导航问题）
        # 设置 keys 状态，让游戏的 _movementUpdate 处理移动
        page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return;
            const scene = game.scene.scenes[1];
            if (!scene) return;
            
            // 模拟向左移动：设置 keys['left'] = true
            scene.keys['left'] = true;
        }''')
        
        # 等待几帧让移动生效
        time.sleep(0.3)
        
        # 重置 keys 状态
        page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return;
            const scene = game.scene.scenes[1];
            if (!scene) return;
            scene.keys['left'] = false;
        }''')
        
        time.sleep(0.2)
        
        # 检查移动后的状态
        after_move = page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return null;
            const scene = game.scene.scenes[1];
            if (!scene) return null;
            return {
                camelScaleX: scene.camelBackEmoji?.scaleX,
                playerFacing: scene.player?.facing,
                containerScaleX: scene.playerContainer?.scaleX
            };
        }''')
        
        if after_move:
            print(f"移动后: camelScaleX={after_move.get('camelScaleX')}, "
                  f"playerFacing={after_move.get('playerFacing')}, "
                  f"containerScaleX={after_move.get('containerScaleX')}")
            
            # 关键验证：camelScaleX 应该始终为 1（骆驼头朝向正确）
            assert after_move.get('camelScaleX') == 1, \
                f"移动后 camelScaleX 应该是 1，实际是 {after_move.get('camelScaleX')}"
            
            # 验证 container 翻转了（角色朝左）
            assert after_move.get('containerScaleX') == -1, \
                f"向左移动后 containerScaleX 应该是 -1，实际是 {after_move.get('containerScaleX')}"
            
            print("✓ Bug 1 测试通过")
        else:
            print("⚠️ 警告: 无法读取移动后状态")
        
        browser.close()


def test_bug2_default_water():
    """测试默认水分值"""
    print("\n=== Bug 2: 默认水分值测试 ===")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        page.goto('http://127.0.0.1/games/silk-road/level/1', wait_until="commit", timeout=60000)
        page.wait_for_load_state('domcontentloaded')
        
        if not wait_for_game_ready(page):
            raise Exception("游戏初始化超时")
        
        time.sleep(1)
        
        # 检查 JUG_CAPACITY 配置
        config = page.evaluate('''() => {
            const L = window.IRAN_LEVEL;
            return {
                JUG_CAPACITY: L?.JUG_CAPACITY,
                TARGET_JUGS: L?.TARGET_JUGS
            };
        }''')
        
        print(f"配置: JUG_CAPACITY={config.get('JUG_CAPACITY')}, "
              f"TARGET_JUGS={config.get('TARGET_JUGS')}")
        
        assert config.get('JUG_CAPACITY') == 20, \
            f"JUG_CAPACITY 应该是 20，实际是 {config.get('JUG_CAPACITY')}"
        
        print("✓ Bug 2 测试通过")
        
        browser.close()


def test_bug3_four_jugs_pass():
    """测试 4 个满水壶能过关"""
    print("\n=== Bug 3: 4 个水壶过关测试 ===")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        page.goto('http://127.0.0.1/games/silk-road/level/1', wait_until="commit", timeout=60000)
        page.wait_for_load_state('domcontentloaded')
        
        if not wait_for_game_ready(page):
            raise Exception("游戏初始化超时")
        
        time.sleep(1)
        
        # 设置 4 个满水壶 + 注入监听器捕获 toast
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            scene.jugs = [
                { capacity: 20, water: 20 },
                { capacity: 20, water: 20 },
                { capacity: 20, water: 20 },
                { capacity: 20, water: 20 }
            ];
            if (scene._refreshHudCounts) scene._refreshHudCounts();
            
            // 注入 toast 监听器
            window.__testToasts = [];
            const origAdd = scene.add.text.bind(scene.add);
            scene.add.text = function(...args) {
                const t = origAdd(...args);
                if (args[2] && (args[2].includes('路途遥远') || args[2].includes('过不去'))) {
                    window.__testToasts.push(args[2]);
                }
                return t;
            };
        }''')
        
        time.sleep(0.5)
        
        # 验证水壶状态
        jug_state = page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return null;
            const scene = game.scene.scenes[1];
            if (!scene) return null;
            const jugs = scene.jugs || [];
            return {
                count: jugs.length,
                totalWater: jugs.reduce((sum, j) => sum + j.water, 0),
                allFull: jugs.every(j => j.water >= j.capacity)
            };
        }''')
        
        print(f"水壶状态: count={jug_state.get('count')}, "
              f"totalWater={jug_state.get('totalWater')}, "
              f"allFull={jug_state.get('allFull')}")
        
        assert jug_state.get('count') == 4, \
            f"应该有 4 个水壶，实际 {jug_state.get('count')}"
        assert jug_state.get('totalWater') == 80, \
            f"总水量应该是 80，实际 {jug_state.get('totalWater')}"
        
        # 移动到出口并触发检查
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            const L = window.IRAN_LEVEL;
            if (L && L.exit) {
                scene.player.x = L.exit.x;
                scene.player.y = L.exit.y;
                scene.playerContainer.x = L.exit.x;
                scene.playerContainer.y = L.exit.y;
                if (scene.checkExitTrigger) scene.checkExitTrigger();
            }
        }''')
        
        time.sleep(1.5)
        
        # 从全局变量读取 toast（即使 game 被销毁也能读到）
        toasts = page.evaluate('() => window.__testToasts || []')
        print(f"捕获到的 toast: {toasts}")
        
        # 4 个满水壶不应该弹出失败提示
        assert len(toasts) == 0, \
            f"4 个满水壶应该能过关，但弹出了: {toasts}"
        
        print("✓ Bug 3 测试通过")
        
        browser.close()


def test_bug4_error_message():
    """测试过关失败提示语"""
    print("\n=== Bug 4: 过关失败提示语测试 ===")
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        page.goto('http://127.0.0.1/games/silk-road/level/1', wait_until="commit", timeout=60000)
        page.wait_for_load_state('domcontentloaded')
        
        if not wait_for_game_ready(page):
            raise Exception("游戏初始化超时")
        
        time.sleep(1)
        
        # 设置 4 个未满的水壶
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            scene.jugs = [
                { capacity: 20, water: 10 },
                { capacity: 20, water: 15 },
                { capacity: 20, water: 12 },
                { capacity: 20, water: 18 }
            ];
            if (scene._refreshHudCounts) scene._refreshHudCounts();
        }''')
        
        time.sleep(0.5)
        
        # 拦截 showToast 方法，记录调用
        page.evaluate('''() => {
            const game = window.__iranGame;
            const scene = game.scene.scenes[1];
            
            // 保存原始方法
            const originalShowToast = scene.showToast;
            
            // 拦截并记录
            window.__toastCalls = [];
            scene.showToast = function(msg, duration) {
                window.__toastCalls.push({ msg, duration, time: Date.now() });
                return originalShowToast.call(this, msg, duration);
            };
        }''')
        
        # 触发过关检查（直接调用 tryExit 绕过距离检查）
        result = page.evaluate('''() => {
            const game = window.__iranGame;
            if (!game) return { error: 'no game' };
            const scene = game.scene.scenes[1];
            if (!scene) return { error: 'no scene' };
            
            // 先检查状态
            const before = {
                jugs: scene.jugs.length,
                allFull: scene._allJugsFull ? scene._allJugsFull() : 'no method',
                hasTryExit: typeof scene.tryExit,
                hasShowToast: typeof scene.showToast,
                showToastIsOverridden: scene.showToast._testMarker === true,
            };
            
            try {
                if (scene.tryExit) scene.tryExit();
            } catch (e) {
                before.tryExitError = e.message;
            }
            
            before.toastCalls = window.__toastCalls || [];
            return before;
        }''')
        
        print(f"tryExit 结果: {result}")
        
        # 读取 showToast 调用记录
        toast_calls = result.get('toastCalls', [])
        print(f"showToast 调用记录: {toast_calls}")
        
        # 从场景中读取 toast 文本
        toast_text = None
        if toast_calls:
            # 找到包含目标文本的调用
            for call in toast_calls:
                if '路途遥远' in call['msg']:
                    toast_text = call['msg']
                    break
        
        print(f"提示语: {toast_text}")
        
        expected = "到土耳其路途遥远，水量少于20，骆驼少于3头，是过不去的"
        assert toast_text == expected, \
            f"提示语应该是 '{expected}'，实际是 '{toast_text}'"
        
        print("✓ Bug 4 测试通过")
        
        browser.close()


if __name__ == '__main__':
    print("开始测试伊朗关卡 bug 修复...")
    
    try:
        test_bug1_camel_direction()
        test_bug2_default_water()
        test_bug3_four_jugs_pass()
        test_bug4_error_message()
        
        print("\n✅ 所有测试通过！")
        
    except AssertionError as e:
        print(f"\n❌ 测试失败: {e}")
        raise
    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
        raise
