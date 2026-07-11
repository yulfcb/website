#!/usr/bin/env python3
"""
关卡1伊朗完整流程验证 - 带截图的版本
每个步骤都截图，生成验证报告
"""
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np
from collections import Counter
import os, base64, io, json
from datetime import datetime

SCREENSHOT_DIR = '/tmp/silkroad_verification'
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def capture_canvas_with_playwright(page, filename):
    """用 Playwright 直接截图整个页面"""
    path = f'{SCREENSHOT_DIR}/{filename}'
    page.screenshot(path=path, full_page=False)
    return path

def capture_canvas_via_dataurl(page, filename):
    """通过 canvas.toDataURL() 导出 WebGL 内容"""
    data_url = page.evaluate("""() => {
        var canvas = document.querySelector('canvas');
        if (!canvas) return null;
        return canvas.toDataURL('image/png');
    }""")
    if not data_url:
        return None
    
    b64 = data_url.split(',')[1]
    img_bytes = base64.b64decode(b64)
    path = f'{SCREENSHOT_DIR}/{filename}'
    with open(path, 'wb') as f:
        f.write(img_bytes)
    return path

def analyze_image(path, label):
    """分析截图颜色分布"""
    try:
        img = Image.open(path)
        arr = np.array(img)
        
        # 找金色像素 (按钮 0xFFD98A)
        gold_mask = (arr[:,:,0] > 200) & (arr[:,:,1] > 180) & (arr[:,:,2] < 180) & (arr[:,:,2] > 80)
        gold_count = gold_mask.sum()
        
        # 找黑色像素
        black_mask = (arr[:,:,0] < 30) & (arr[:,:,1] < 30) & (arr[:,:,2] < 30)
        black_pct = black_mask.sum() / (arr.shape[0] * arr.shape[1]) * 100
        
        # 主色
        rgb = arr[:,:,:3]
        sample = rgb[::10, ::10].reshape(-1, 3)
        quantized = (sample // 32) * 32
        top = Counter([tuple(c) for c in quantized]).most_common(3)
        
        result = {
            'golden_pixels': int(gold_count),
            'black_percentage': round(float(black_pct), 1),
            'dominant_color': [int(x) for x in top[0][0]] if top else [0,0,0],
            'dominant_color_percentage': round(float(top[0][1] / len(sample) * 100), 1) if top else 0
        }
        
        print(f"  [{label}] 金色={result['golden_pixels']}, 黑屏={result['black_percentage']}%, "
              f"主色=RGB{result['dominant_color']}({result['dominant_color_percentage']}%)")
        
        return result
    except Exception as e:
        print(f"  [{label}] 分析失败: {e}")
        return {}

def main():
    report = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--enable-webgl'])
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()
        
        # ========== 步骤1: 进入关卡1 ==========
        print("\n[步骤1] 进入关卡1伊朗")
        page.goto('http://localhost:5000/games/silk-road/level/0')
        page.evaluate("localStorage.setItem('silkroad_cleared_levels', JSON.stringify([0]))")
        page.wait_for_timeout(500)
        
        page.goto('http://localhost:5000/games/silk-road/level/1')
        page.wait_for_timeout(5000)
        
        path1 = capture_canvas_with_playwright(page, '01_step1_playwright.png')
        analyze_image(path1, '步骤1-Playwright截图')
        
        path1b = capture_canvas_via_dataurl(page, '01_step1_canvas.png')
        analyze_image(path1b, '步骤1-Canvas导出')
        
        game_state = page.evaluate("""() => {
            var game = window.__iranGame;
            var scene = game.scene.scenes[game.scene.scenes.length - 1];
            return {
                state: scene.state,
                playerPos: {x: Math.round(scene.player.x), y: Math.round(scene.player.y)},
                camels: scene._luggageCount(-1004),
                water: scene._totalWater()
            };
        }""")
        
        report.append({
            'step': 1,
            'action': '进入关卡1伊朗，初始化游戏',
            'expected': '游戏正常加载，state=PLAYING，玩家在(200,580)',
            'actual': f"state={game_state['state']}, 玩家={game_state['playerPos']}",
            'screenshots': ['01_step1_playwright.png', '01_step1_canvas.png']
        })
        
        # ========== 步骤2: 设置出发条件 ==========
        print("\n[步骤2] 设置出发条件（3骆驼+30L水）")
        page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            for (var i = 0; i < 3; i++) scene._addToLuggage(-1004);
            scene.jugs.push({capacity: 10, water: 10});
            scene.jugs.push({capacity: 10, water: 10});
        }""")
        
        state2 = page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            return {
                camels: scene._luggageCount(-1004),
                water: scene._totalWater(),
                canDepart: scene._luggageCount(-1004) >= 3 && scene._totalWater() > 20
            };
        }""")
        
        path2 = capture_canvas_with_playwright(page, '02_step2.png')
        
        report.append({
            'step': 2,
            'action': '添加3头骆驼和2个满水壶（总30L水）',
            'expected': '骆驼数=3，水量=30L，canDepart=True',
            'actual': f"骆驼={state2['camels']}, 水={state2['water']}L, canDepart={state2['canDepart']}",
            'screenshots': ['02_step2.png']
        })
        
        # ========== 步骤3: 移动到出口并触发 ==========
        print("\n[步骤3] 移动到出口并触发departIran()")
        page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            scene.player.x = 105;
            scene.player.y = 115;
            scene._checkExitProximity();
        }""")
        
        state3 = page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            return {
                exitTriggered: scene._exitTriggered,
                exiting: scene._exitingIran,
                state: scene.state
            };
        }""")
        
        report.append({
            'step': 3,
            'action': '移动玩家到出口(105,115)，触发_checkExitProximity()',
            'expected': 'exitTriggered=True, exitingIran=True, state=TRADING',
            'actual': f"exitTriggered={state3['exitTriggered']}, exiting={state3['exiting']}, state={state3['state']}",
            'screenshots': []
        })
        
        # ========== 步骤4: 1秒后（fade进行中）==========
        print("\n[步骤4] 等待1秒（camera fade out进行中）")
        page.wait_for_timeout(1000)
        
        path4a = capture_canvas_with_playwright(page, '03_step4_1s_playwright.png')
        analyze_image(path4a, '步骤4-1s-Playwright')
        
        path4b = capture_canvas_via_dataurl(page, '03_step4_1s_canvas.png')
        analyze_image(path4b, '步骤4-1s-Canvas')
        
        report.append({
            'step': 4,
            'action': '等待1秒，观察camera fade out效果',
            'expected': '画面开始变暗，黑屏占比10-20%',
            'actual': '见截图分析',
            'screenshots': ['03_step4_1s_playwright.png', '03_step4_1s_canvas.png']
        })
        
        # ========== 步骤5: 2秒后（fade完成）==========
        print("\n[步骤5] 等待2秒（fade out完成，应显示文字）")
        page.wait_for_timeout(1000)
        
        path5a = capture_canvas_with_playwright(page, '04_step5_2s_playwright.png')
        analyze_image(path5a, '步骤5-2s-Playwright')
        
        path5b = capture_canvas_via_dataurl(page, '04_step5_2s_canvas.png')
        analyze_image(path5b, '步骤5-2s-Canvas')
        
        report.append({
            'step': 5,
            'action': '等待2秒，fade out完成，应显示"🚪 伊朗 → 土耳其"文字',
            'expected': '画面全黑或显示金色文字',
            'actual': '见截图分析',
            'screenshots': ['04_step5_2s_playwright.png', '04_step5_2s_canvas.png']
        })
        
        # ========== 步骤6: 4秒后（按钮应出现）==========
        print("\n[步骤6] 等待4秒（按钮应出现）")
        page.wait_for_timeout(2000)
        
        path6a = capture_canvas_with_playwright(page, '05_step6_4s_playwright.png')
        analyze_image(path6a, '步骤6-4s-Playwright')
        
        path6b = capture_canvas_via_dataurl(page, '05_step6_4s_canvas.png')
        analyze_image(path6b, '步骤6-4s-Canvas')
        
        button_check = page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            var rects = scene.children.list.filter(c => c.type === 'Rectangle' && c.x === 1100);
            var texts = scene.children.list.filter(c => c.type === 'Text' && c.x === 1100);
            return {
                hasRect: rects.length > 0,
                hasText: texts.length > 0,
                rectAlpha: rects[0].alpha if rects.length > 0 else -1,
                textAlpha: texts[0].alpha if texts.length > 0 else -1
            };
        }""")
        
        report.append({
            'step': 6,
            'action': '等待4秒，"🐫 继续旅程"按钮应出现',
            'expected': '按钮对象存在，alpha=1，应该可见',
            'actual': f"hasRect={button_check['hasRect']}, rectAlpha={button_check['rectAlpha']}",
            'screenshots': ['05_step6_4s_playwright.png', '05_step6_4s_canvas.png']
        })
        
        # ========== 步骤7: 点击按钮 ==========
        print("\n[步骤7] 点击'继续旅程'按钮")
        page.evaluate("""() => {
            var scene = window.__iranGame.scene.scenes[window.__iranGame.scene.scenes.length - 1];
            var zones = scene.children.list.filter(c => c.type === 'Zone' && c.x === 1100 && c.y === 650);
            if (zones.length > 0) zones[0].emit('pointerdown');
        }""")
        page.wait_for_timeout(3000)
        
        final_url = page.url
        final_title = page.title()
        
        path7 = capture_canvas_with_playwright(page, '06_step7_after_click.png')
        
        report.append({
            'step': 7,
            'action': '点击"继续旅程"按钮，触发跳转',
            'expected': '跳转到 /games/silk-road/level/2，title包含"土耳其"',
            'actual': f"URL={final_url}, title={final_title}",
            'screenshots': ['06_step7_after_click.png']
        })
        
        browser.close()
    
    # 生成报告
    print("\n" + "="*70)
    print("关卡1伊朗完整流程验证报告")
    print("="*70)
    
    for item in report:
        print(f"\n步骤{item['step']}: {item['action']}")
        print(f"  期待: {item['expected']}")
        print(f"  实际: {item['actual']}")
        if item['screenshots']:
            print(f"  截图: {', '.join(item['screenshots'])}")
    
    print("\n" + "="*70)
    print(f"截图保存目录: {SCREENSHOT_DIR}")
    for f in sorted(os.listdir(SCREENSHOT_DIR)):
        if f.endswith('.png'):
            size = os.path.getsize(f'{SCREENSHOT_DIR}/{f}')
            print(f"  {f} ({size//1024}K)")
    
    # 保存JSON报告
    with open(f'{SCREENSHOT_DIR}/report.json', 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()
