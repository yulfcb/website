#!/usr/bin/env python3
"""
关卡1 伊朗完整流程验证 (Playwright + canvas.toDataURL + PIL)
关键：Phaser WebGL canvas 必须用 canvas.toDataURL() 截图，page.screenshot() 截不到。
"""
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np
from collections import Counter
import os, base64, io

SCREENSHOT_DIR = '/tmp/silkroad_screenshots'
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
    
    # 解码保存
    b64 = data_url.split(',')[1]
    img_bytes = base64.b64decode(b64)
    path = f'{SCREENSHOT_DIR}/{filename}'
    with open(path, 'wb') as f:
        f.write(img_bytes)
    return path


def analyze_screenshot(path, label, region=None):
    """分析截图颜色分布"""
    try:
        img = Image.open(path)
        arr = np.array(img)
        
        if region:
            x1, y1, x2, y2 = region
            arr = arr[y1:y2, x1:x2]
        
        # 找金色/黄色像素 (按钮 0xFFD98A ≈ RGB 255,217,138)
        gold_mask = (arr[:,:,0] > 200) & (arr[:,:,1] > 180) & (arr[:,:,2] < 180) & (arr[:,:,2] > 80)
        gold_count = gold_mask.sum()
        
        # 找黑色像素
        black_mask = (arr[:,:,0] < 30) & (arr[:,:,1] < 30) & (arr[:,:,2] < 30)
        black_pct = black_mask.sum() / (arr.shape[0] * arr.shape[1]) * 100
        
        # 主色（采样）
        sample = arr[::10, ::10].reshape(-1, 3)
        quantized = (sample // 16) * 16
        top = Counter([tuple(c) for c in quantized]).most_common(3)
        
        print(f"  [{label}] 金色={gold_count}, 黑屏={black_pct:.1f}%, 主色=RGB{top[0][0]}({top[0][1]/len(sample)*100:.1f}%)")
        
        return {'gold': gold_count, 'black_pct': black_pct, 'top_color': top[0][0], 'img': img}
    except Exception as e:
        print(f"  [{label}] 分析失败: {e}")
        return {}


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()
        
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        
        # ============ Step 1: 初始化并进入关卡1 ============
        print("\n[Step 1] 初始化 localStorage → 进入关卡1")
        page.goto('http://localhost:5000/games/silk-road/level/0')
        page.evaluate("localStorage.setItem('silkroad_cleared_levels', JSON.stringify([0]))")
        page.wait_for_timeout(500)
        
        page.goto('http://localhost:5000/games/silk-road/level/1')
        page.wait_for_timeout(5000)
        
        path = capture_canvas(page, '01_initial.png')
        analyze_screenshot(path, '初始画面')
        
        game_info = page.evaluate("""() => {
            var game = window.__iranGame;
            if (!game) return {error: 'no game'};
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            return {
                state: scene.state,
                playerPos: {x: Math.round(scene.player.x), y: Math.round(scene.player.y)},
                camelCount: scene._luggageCount(-1004),
                totalWater: scene._totalWater(),
                canvasSize: {w: game.config.width, h: game.config.height}
            };
        }""")
        print(f"  游戏状态: {game_info}")
        
        # ============ Step 2: 设置出发条件 ============
        print("\n[Step 2] 设置出发条件（3骆驼 + 水>20）")
        setup_result = page.evaluate("""() => {
            var game = window.__iranGame;
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            for (var i = 0; i < 3; i++) scene._addToLuggage(-1004);
            scene.jugs.push({capacity: 10, water: 10});
            scene.jugs.push({capacity: 10, water: 10});
            return {
                camelCount: scene._luggageCount(-1004),
                totalWater: scene._totalWater(),
                canDepart: scene._luggageCount(-1004) >= 3 && scene._totalWater() > 20
            };
        }""")
        print(f"  设置结果: {setup_result}")
        
        # ============ Step 3: 移动到出口并触发 ============
        print("\n[Step 3] 移动玩家到出口 → 触发 departIran()")
        move_result = page.evaluate("""() => {
            var game = window.__iranGame;
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            scene.player.x = 105;
            scene.player.y = 115;
            scene._checkExitProximity();
            return {
                exitTriggered: scene._exitTriggered,
                exitingIran: scene._exitingIran,
                state: scene.state
            };
        }""")
        print(f"  触发结果: {move_result}")
        
        # ============ Step 4: 1s后截图（fade out 进行中）============
        print("\n[Step 4] 1s后截图 — fade out 进行中")
        page.wait_for_timeout(1000)
        path = capture_canvas(page, '02_fadeout_1s.png')
        analyze_screenshot(path, 'fade 1s')
        
        # ============ Step 5: 2s后截图（fade out 完成，文字可见）============
        print("\n[Step 5] 2s后截图 — fade out 完成，应有文字")
        page.wait_for_timeout(1000)
        path = capture_canvas(page, '03_fadeout_2s.png')
        analyze_screenshot(path, 'fade 2s')
        
        # ============ Step 6: 4s后截图（按钮应出现）============
        print("\n[Step 6] 4s后截图 — 按钮应出现")
        page.wait_for_timeout(2000)
        path = capture_canvas(page, '04_button.png')
        result = analyze_screenshot(path, '按钮区', region=(900, 600, 1250, 700))
        
        btn_check = page.evaluate("""() => {
            var game = window.__iranGame;
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            var children = scene.children.list;
            var rects = children.filter(c => c.type === 'Rectangle' && c.x === 1100);
            var texts = children.filter(c => c.type === 'Text' && c.x === 1100);
            return {
                hasRect: rects.length > 0,
                hasText: texts.length > 0,
                rectAlpha: rects.length > 0 ? rects[0].alpha : -1,
                textAlpha: texts.length > 0 ? texts[0].alpha : -1,
                state: scene.state,
                exiting: scene._exitingIran
            };
        }""")
        print(f"  按钮对象: {btn_check}")
        
        # ============ Step 7: 点击"继续旅程" ============
        print("\n[Step 7] 点击'继续旅程'按钮 (canvas内 1100, 650)")
        
        # 用 page.evaluate 直接触发 pointerdown
        click_result = page.evaluate("""() => {
            var game = window.__iranGame;
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            var zones = scene.children.list.filter(c => 
                c.type === 'Zone' && c.x === 1100 && c.y === 650);
            if (zones.length > 0) {
                zones[0].emit('pointerdown');
                return {clicked: true, zoneCount: zones.length};
            }
            return {clicked: false, zoneCount: 0};
        }""")
        print(f"  点击结果: {click_result}")
        
        page.wait_for_timeout(3000)
        
        # ============ Step 8: 验证跳转 ============
        print("\n[Step 8] 验证跳转")
        final_url = page.url
        final_title = page.title()
        print(f"  URL: {final_url}")
        print(f"  Title: {final_title}")
        
        # 截关卡2的画面
        page.wait_for_timeout(3000)
        path = capture_canvas(page, '05_turkey.png')
        if path:
            analyze_screenshot(path, '关卡2')
        
        # ============ 结果汇总 ============
        print("\n" + "=" * 60)
        print("验证结果汇总:")
        print("=" * 60)
        
        checks = {
            '游戏初始化(PLAYING)': game_info.get('state') == 'PLAYING',
            '出发条件满足(canDepart)': setup_result.get('canDepart', False),
            '出口触发(exitTriggered)': move_result.get('exitTriggered', False),
            '出发流程启动(exiting)': move_result.get('exitingIran', False),
            '按钮对象出现(hasRect+Text)': btn_check.get('hasRect', False) and btn_check.get('hasText', False),
            '跳转到关卡2': 'level/2' in final_url,
        }
        
        all_pass = True
        for name, passed in checks.items():
            status = '✅' if passed else '❌'
            print(f"  {status} {name}")
            if not passed:
                all_pass = False
        
        if errors:
            print(f"\n⚠️ JS 错误 ({len(errors)}):")
            for e in errors[:5]:
                print(f"    - {e[:200]}")
        else:
            print(f"\n✅ 零 JS 错误")
        
        print(f"\n总结: {'✅ 全部通过' if all_pass else '❌ 部分失败'}")
        print(f"\n截图目录: {SCREENSHOT_DIR}/")
        for f in sorted(os.listdir(SCREENSHOT_DIR)):
            if f.endswith('.png'):
                size = os.path.getsize(f'{SCREENSHOT_DIR}/{f}')
                print(f"  {f} ({size//1024}K)")
        
        browser.close()
        return 0 if all_pass else 1


if __name__ == '__main__':
    exit(main())
