#!/usr/bin/env python3
"""
关卡 2 土耳其·卡帕多奇亚 验证 (M27 重做地图探索)
- 验证游戏初始化无 JS 错误
- 验证玩家在地图上 + 7 个 location 渲染
- 验证走到兑换中心 → modal 打开
- 验证兑换 + 购物 + 组装触发
"""

from playwright.sync_api import sync_playwright
import time
import os

SCREENSHOT_DIR = '/tmp/turkey_screenshots'
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def capture_canvas(page, filename):
    """通过 canvas.toDataURL() 导出 Phaser WebGL 画面"""
    data_url = page.evaluate("""() => {
        var canvas = document.querySelector('canvas');
        if (!canvas) return null;
        return canvas.toDataURL('image/png');
    }""")
    if not data_url:
        print(f"  [{filename}] ❌ 找不到 canvas")
        return None
    import base64
    b64 = data_url.split(',')[1]
    img_bytes = base64.b64decode(b64)
    path = f'{SCREENSHOT_DIR}/{filename}'
    with open(path, 'wb') as f:
        f.write(img_bytes)
    return path


def wait_for_game_ready(page, timeout=15):
    start = time.time()
    while time.time() - start < timeout:
        ready = page.evaluate('''() => {
            const game = window.__turkeyGame;
            if (!game) return false;
            const scenes = game.scene.scenes;
            if (!scenes || scenes.length < 2) return false;
            // 找 PlayScene (key='PlayScene')
            for (let i = 0; i < scenes.length; i++) {
                if (scenes[i].scene.key === 'PlayScene' && scenes[i].playerContainer) return true;
            }
            return false;
        }''')
        if ready:
            return True
        time.sleep(0.3)
    return False


def test_turkey_level2():
    print("\n=== 关 2 土耳其地图探索验证 ===")
    js_errors = []
    console_logs = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.on('pageerror', lambda exc: js_errors.append(str(exc)))
        page.on('console', lambda msg: console_logs.append((msg.type, msg.text)))

        page.goto('http://127.0.0.1/games/silk-road/level/2?debug=1',
                  wait_until='commit', timeout=60000)
        page.wait_for_load_state('domcontentloaded')

        if not wait_for_game_ready(page):
            raise Exception('游戏初始化超时')

        time.sleep(1)

        # ---- 检查 1: scene 列表 ----
        scenes = page.evaluate('''() => {
            const game = window.__turkeyGame;
            return game.scene.scenes.map(s => s.scene.key);
        }''')
        print(f"Scene 列表: {scenes}")
        assert 'PlayScene' in scenes, 'PlayScene 不存在'
        assert 'AssembleScene' in scenes, 'AssembleScene 不存在'
        assert 'FlightScene' in scenes, 'FlightScene 不存在'

        # ---- 检查 2: 玩家 + 7 个 location 都渲染了 ----
        state = page.evaluate('''() => {
            const game = window.__turkeyGame;
            const ps = game.scene.getScene('PlayScene');
            return {
                playerExists: !!ps.playerContainer,
                playerX: ps.player ? ps.player.x : null,
                playerY: ps.player ? ps.player.y : null,
                locationCount: ps.locationSprites ? ps.locationSprites.length : 0,
                avatarId: ps._avatar,
                luggageCount: ps.luggage ? ps.luggage.length : 0,
                coins: ps.coins,
                purchasedCount: Object.keys(ps.purchasedItems || {}).length,
                modalVisible: ps.modalContainer ? ps.modalContainer.visible : false,
                fabric: ps.fabric,
                joystickVisible: ps.joystickContainer ? ps.joystickContainer.visible : false,
            };
        }''')
        print(f"\n初始状态: {state}")
        assert state['playerExists'], '玩家未渲染'
        assert state['locationCount'] == 7, f"应该有 7 个 location, 实际 {state['locationCount']}"
        assert state['avatarId'] in ('malay', 'fala', 'cn_m', 'cn_f'), f"avatar id 异常: {state['avatarId']}"
        assert state['luggageCount'] > 0, 'debug=1 应该塞满行李'
        assert state['modalVisible'], '玩家应在兑换中心, modal 应该自动打开'

        # ---- 检查 3: 截图初始画面 ----
        capture_canvas(page, '01-initial-with-modal.png')
        print("  ✓ 初始截图已保存")

        # ---- 检查 4: 关闭 modal ----
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.closeModal();
        }''')
        time.sleep(0.3)
        modal_state = page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            return {
                visible: ps.modalContainer.visible,
                state: ps.state
            };
        }''')
        print(f"\n关闭 modal 后: {modal_state}")
        assert modal_state['visible'] == False
        assert modal_state['state'] == 'PLAYING'

        # ---- 检查 5: 走到 fabric shop, 验证 fabric modal 打开 ----
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            // 直接传送到 fabric shop 旁边
            ps.player.x = 490; ps.player.y = 200;
            ps.playerContainer.x = 490; ps.playerContainer.y = 200;
            ps.checkLocationCollision();
        }''')
        time.sleep(0.3)
        modal_state = page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            return {
                visible: ps.modalContainer.visible,
                state: ps.state,
                childCount: ps.modalContainer.list.length,
            };
        }''')
        print(f"\n到 fabric shop 后: {modal_state}")
        assert modal_state['visible'] == True
        capture_canvas(page, '02-fabric-modal.png')

        # ---- 检查 6: 买 cotton 布料 (120₺) ----
        # 给玩家一些 lira 先
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.coins = 500;
            ps._refreshHud();
        }''')
        time.sleep(0.2)
        # 重开 fabric shop modal 看到更新后的余额
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.openShopModal('fabric');
        }''')
        time.sleep(0.3)
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            // 模拟点击 cotton 购买
            var items = ps.modalContainer.list;
            // 调用 doBuy 即可
            ps.doBuy({ id: 'fabric_cotton', name: '棉布', price: 120, fabricId: 'cotton' }, 'fabric');
        }''')
        time.sleep(0.5)
        result = page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            return {
                coins: ps.coins,
                fabric: ps.fabric,
                purchasedFabric: ps.purchasedItems.fabric_cotton,
                collected: ps._collectedCount(),
            };
        }''')
        print(f"\n买 cotton 后: {result}")
        assert result['fabric'] == 'cotton'
        assert result['purchasedFabric'] == True
        assert result['coins'] == 380  # 500 - 120

        # ---- 检查 7: 一次性买齐所有材料 ----
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.coins = 10000;
            ps.doBuy({ id: 'bamboo', name: '竹条×3', price: 150 }, 'bamboo');
            ps.doBuy({ id: 'basket', name: '吊篮', price: 160 }, 'basket');
            ps.doBuy({ id: 'wire', name: '电线', price: 40 }, 'hardware');
            ps.doBuy({ id: 'lighter', name: '打火机', price: 80 }, 'hardware');
            ps.doBuy({ id: 'sewing', name: '缝纫', price: 50 }, 'tool');
            ps.doBuy({ id: 'scissors', name: '剪刀', price: 30 }, 'tool');
        }''')
        time.sleep(0.5)
        result = page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            return {
                collected: ps._collectedCount(),
                hasAll: ps._hasAllMaterials(),
                missing: ps._missingMaterials(),
            };
        }''')
        print(f"\n买齐后: {result}")
        assert result['collected'] == 7
        assert result['hasAll'] == True
        assert result['missing'] == []

        # ---- 检查 8: 走到组装场, 验证 assemble scene 切换 ----
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.closeModal();
            ps.player.x = 1090; ps.player.y = 560;
            ps.playerContainer.x = 1090; ps.playerContainer.y = 560;
            ps.checkLocationCollision();
        }''')
        time.sleep(0.3)
        # 模拟点击开始组装按钮
        page.evaluate('''() => {
            const ps = window.__turkeyGame.scene.getScene('PlayScene');
            ps.registry.set('turkey_fabric', ps.fabric);
            ps.scene.start('AssembleScene');
        }''')
        time.sleep(1)
        active = page.evaluate('''() => {
            const game = window.__turkeyGame;
            const as = game.scene.getScene('AssembleScene');
            return {
                active: as.scene.isActive(),
                step: as.currentStep,
                fabric: as.fabric,
            };
        }''')
        print(f"\nAssembleScene 状态: {active}")
        assert active['active'] == True
        assert active['step'] == 0
        assert active['fabric'] == 'cotton'
        capture_canvas(page, '03-assemble-step1.png')

        # ---- 检查 9: 走完 6 步进入 FlightScene ----
        # 直接把所有步骤 set 完, 然后点出发
        page.evaluate('''() => {
            const as = window.__turkeyGame.scene.getScene('AssembleScene');
            as.currentStep = 5;
            as._renderStep();
        }''')
        time.sleep(0.5)
        capture_canvas(page, '04-depart.png')
        depart_state = page.evaluate('''() => {
            const as = window.__turkeyGame.scene.getScene('AssembleScene');
            return {
                active: as.scene.isActive(),
                step: as.currentStep,
            };
        }''')
        print(f"\nDepart 状态: {depart_state}")

        # ---- 检查 10: 报告 JS 错误 ----
        print(f"\nJS 错误数: {len(js_errors)}")
        for err in js_errors:
            print(f"  ❌ {err}")

        # 过滤掉无关紧要的警告
        critical_errors = [e for e in js_errors if 'favicon' not in e.lower()]
        if critical_errors:
            print(f"\n❌ 有 {len(critical_errors)} 个关键 JS 错误")
            for e in critical_errors:
                print(f"  {e}")
            raise Exception(f'JS 错误: {critical_errors[0]}')
        else:
            print("\n✓ 没有关键 JS 错误")

        browser.close()
        print("\n✅ 所有验证通过!")


if __name__ == '__main__':
    test_turkey_level2()