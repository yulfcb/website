# 关 2 · 土耳其 · 伊斯坦布尔大巴扎 — 资源清单

> **来源原则**：CC0 / Public Domain 优先；找不到则用 Phaser.Graphics 程序绘制兜底
> **参考样板**：qatar 使用 `voyage-ship.png` (CC0 OpenGameArt, 2nd_ship_new_4)
> **占位策略**：先 emoji 占位，PNG 后续补齐；测试期间不影响游戏可玩

---

## 1. 精灵图（PNG / SVG）

### 1.1 必要资源（M24 第一版必须有）

| 文件 | 尺寸 | 用途 | 来源建议 | 必需 |
|------|------|------|----------|------|
| `assets/ships/galata-ship.png` | 400×400 | 金角湾帆船 (voyage 动画用) | CC0 OpenGameArt (仿 qatar 2nd_ship_new_4 暗红剪影) | ✅ |
| `assets/icons/byzantine-coin.png` | 128×128 | 拜占庭金币 (隐藏宝藏) | 自绘: 金圆 + 双头鹰 + 拉丁铭文 | ✅ |
| `assets/icons/venice-glass.png` | 56×56 | 威尼斯玻璃杯 (西方货) | 自绘 Graphics 或 OpenGameArt | ⭐ |
| `assets/icons/florence-fabric.png` | 56×56 | 佛罗伦萨绒布 (西方货) | 自绘 Graphics | ⭐ |
| `assets/icons/spice-box.png` | 56×56 | 香料礼盒 (西方货) | 自绘 Graphics | ⭐ |
| `assets/icons/ruby-ring.png` | 56×56 | 红宝石戒指 (西方货) | 自绘 Graphics | ⭐ |

⭐ = emoji 兜底可用，但建议有 PNG

### 1.2 可选资源（提升视觉）

| 文件 | 尺寸 | 用途 | 来源建议 |
|------|------|------|----------|
| `assets/npcs/nikolaos.png` | 64×64 | 翻译官头像 | 自绘 (希腊帽 + 胡子) |
| `assets/npcs/yusuf.png` | 64×64 | 丝绸商人 | 自绘 (土耳其帽 + 卷胡) |
| `assets/npcs/marco.png` | 64×64 | 威尼斯商人 | 自绘 (狮子纹章衣) |
| `assets/npcs/giovanni.png` | 64×64 | 热那亚商人 | 自绘 (圣乔治十字衣) |
| `assets/npcs/kapici.png` | 64×64 | 海关官员 | 自绘 (奥斯曼军装) |
| `assets/npcs/priest.png` | 64×64 | 东正教神父 | 自绘 (黑袍 + 高帽) |
| `assets/backgrounds/bazaar.png` | 1280×720 | 大巴扎室内背景 | CC0 OpenGameArt (集市场景) |
| `assets/backgrounds/hagia-sophia.png` | 1280×720 | 圣索菲亚外景 | CC0 (教堂外观) |
| `assets/backgrounds/galata-bridge.png` | 1280×720 | 加拉塔桥 | CC0 (桥梁 + 金角湾) |

### 1.3 全部用 emoji 兜底（最小可行版）

如果时间紧，可以**全部用 emoji 代替 PNG**，跟 qatar 的 gift 系统一致：

```
🇹🇷 土耳其·伊斯坦布尔
   ↓
Yusuf 🧵, Hadji 🌿, Marco 🦁, Giovanni 🐺, Kapıcı ⚔️
   ↓
西方货 emoji: 🪟 🧵 🪙 🎁 💍
   ↓
帆船 🚢 (直接用 qatar 的 voyage-ship)
```

⚠️ 注意：emoji 在不同浏览器/系统下显示不一致；如发现跨平台问题再补 PNG。

---

## 2. 背景音乐（BGM）

### 2.1 复用策略

**优先方案**：复用 qatar 现有的 `<audio id="silk-road-bgm">` 元素，不引入新的 BGM。

- 优点：跨关 BGM 风格统一，浏览器自动恢复播放状态
- 缺点：可能跟伊斯坦布尔主题不够契合

### 2.2 推荐新 BGM（如果决定替换）

| 曲目 | 风格 | 来源 | 时长 | 建议 |
|------|------|------|------|------|
| **Ottoman March** | 奥斯曼军乐风 | CC0 OpenGameArt | 2-3 分钟循环 | 主 BGM (大氛围) |
| **Whirling Dervish** | 苏菲旋转舞风 | CC0 | 2-3 分钟 | 备用 (慢节奏) |
| **Bazaar Chatter** | 集市喧闹 + 乌德琴 | CC0 / 自制 | 2-3 分钟 | 热闹版 (开场用) |

#### 推荐资源链接（CC0 / Public Domain）

- [OpenGameArt.org](https://opengameart.org/) — 搜 "ottoman" / "turkish" / "bazaar"
- [FreePD.com](https://freepd.com/) — Public Domain music (搜 "middle east" / "ottoman")
- [Incompetech (CC-BY)](https://incompetech.com/) — Kevin MacLeod, 标 CC-BY 即可商用
- [Freesound.org](https://freesound.org/) — 短音乐片段

#### 土耳其传统音乐元素（作曲参考）

- 乌德琴 (Oud)：阿拉伯/土耳其弹拨乐器，柔和拨弦
- 内伊笛 (Ney)：苏菲派旋转舞配乐
- 达尔布卡鼓 (Darbuka)：手鼓，节奏感强
- 土耳其唢呐 (Zurna)：热闹场景用
- 卡龙琴 (Qanun)：古典宫廷音乐

### 2.3 BGM 文件路径

```
static/silk-road/turkey/audio/
├── bgm-ottoman-march.mp3     # 主 BGM
└── bgm-bazaar-chatter.mp3    # 备用
```

或者直接复用：
```
static/silk-road/qatar/audio/bgm-*.mp3
```

---

## 3. 音效（SFX）

### 3.1 复用 qatar 现有 SFX（不重复造）

| SFX ID | 用途 | 来源 |
|--------|------|------|
| `pickup` | 拾起商品 / 找到金币 | qatar/audio/sfx-pickup.mp3 |
| `button` | 按钮点击 | qatar/audio/sfx-button.mp3 |
| `click` | dpad 点击 | qatar/audio/sfx-click.mp3 |
| `exchange` | 兑换货币 / 货币叮当 | qatar/audio/sfx-exchange.mp3 |
| `die` | 失败 / 收市 | qatar/audio/sfx-die.mp3 |
| `voyage` | voyage 出发 whoosh | qatar/audio/sfx-voyage.mp3 |

⚠️ SFX 通过 `<audio id="sfx-{id}">` 元素全局共享，跟 qatar 共用同一套。

### 3.2 新增 SFX（turkey 特有）

| SFX ID | 触发场景 | 时长 | 风格建议 | 来源 |
|--------|----------|------|----------|------|
| `negotiate` | 讨价还价中（每轮开价） | 0.5-1s | 摊位人声 + 算盘珠子 | CC0 / 自制 |
| `coin-drop` | 货币兑换（银币落入袋） | 0.3-0.5s | 银币叮当 | CC0 |
| `taboo` | 文化禁忌警告 | 0.5-1s | 警钟 + 人群嘘声 | CC0 |
| `genoa-fake` | 热那亚商人报假价 | 0.5s | 滑头笑声 + 硬币晃动 | CC0 |
| `genoa-caught` | 揭穿热那亚假价 | 1s | 成功铃 + 掌声 | CC0 |
| `byzantine` | 发现拜占庭金币 | 1-2s | 神秘圣咏 + 金光 | CC0 |
| `venice-buy` | 威尼斯商人抢货 | 0.5s | 急促脚步 + "我要了!" | CC0 |
| `kapici-angry` | 海关官员出现 | 1s | 奥斯曼战鼓 + 军靴 | CC0 |
| `bazaar-close` | 收市 (AP 用完) | 1.5s | 铜锣 + 人群散去 | CC0 |

### 3.3 SFX 文件路径

```
static/silk-road/turkey/audio/
├── sfx-negotiate.mp3
├── sfx-coin-drop.mp3
├── sfx-taboo.mp3
├── sfx-genoa-fake.mp3
├── sfx-genoa-caught.mp3
├── sfx-byzantine.mp3
├── sfx-venice-buy.mp3
├── sfx-kapici-angry.mp3
└── sfx-bazaar-close.mp3
```

### 3.4 复用 qatar SFX 的 audio 元素（HTML 模板）

```html
<!-- index.html 头部, 跟 qatar 一致 -->
<audio id="silk-road-bgm" loop preload="auto">
  <source src="/static/silk-road/qatar/audio/bgm.mp3" type="audio/mpeg">
</audio>
<audio id="sfx-pickup" src="/static/silk-road/qatar/audio/sfx-pickup.mp3" preload="auto"></audio>
<audio id="sfx-button" src="/static/silk-road/qatar/audio/sfx-button.mp3" preload="auto"></audio>
<audio id="sfx-click" src="/static/silk-road/qatar/audio/sfx-click.mp3" preload="auto"></audio>
<audio id="sfx-exchange" src="/static/silk-road/qatar/audio/sfx-exchange.mp3" preload="auto"></audio>
<audio id="sfx-die" src="/static/silk-road/qatar/audio/sfx-die.mp3" preload="auto"></audio>
<audio id="sfx-voyage" src="/static/silk-road/qatar/audio/sfx-voyage.mp3" preload="auto"></audio>

<!-- 新增 turkey SFX -->
<audio id="sfx-negotiate" src="/static/silk-road/turkey/audio/sfx-negotiate.mp3" preload="auto"></audio>
<audio id="sfx-coin-drop" src="/static/silk-road/turkey/audio/sfx-coin-drop.mp3" preload="auto"></audio>
<!-- ... -->
```

---

## 4. 字体 / 排版

| 用途 | 字体 | 来源 |
|------|------|------|
| 中文 | 系统默认 (PingFang SC / Microsoft YaHei) | 浏览器自带 |
| 英文 | 系统默认 (Helvetica / Arial) | 浏览器自带 |
| 阿拉伯文字 (装饰用) | Noto Naskh Arabic | Google Fonts (CC-OFL) |
| 奥斯曼风格装饰 | 系统衬线字体 + 16-20px italic | — |

⚠️ 不要依赖特殊字体显示关键 UI（跨平台 fallback 会乱）；emoji + 系统字体足够。

---

## 5. 颜色调色板

### 5.1 奥斯曼主题色

| 名称 | HEX | 用途 |
|------|-----|------|
| **苏丹金** | `#D4AF37` | 货币 / 重点按钮 |
| **深紫红** | `#3A2140` | 主背景 |
| **宝石蓝** | `#1B3A5E` | modal 卡片 |
| **奶白** | `#F4ECD8` | 主文字 |
| **沙黄** | `#FFD98A` | 标题 / 高亮 |
| **铜橙** | `#B87333` | 边框 / 次要按钮 |
| **砖红** | `#8B2A2A` | 警告 / 失败状态 |
| **薄荷绿** | `#A8D8C0` | 成功 / 完成状态 |
| **靛蓝** | `#0E2A47` | 海水 / voyage 背景 |

### 5.2 渐变 (CSS / Phaser.Graphics)

```css
/* 顶部 HUD 横条 */
background: linear-gradient(180deg, #3A2140 0%, #1B0E2A 100%);

/* 大巴扎石板地 */
background: linear-gradient(180deg, #D4B07A 0%, #8B6B3A 100%);

/* 圣索菲亚穹顶光 */
background: radial-gradient(circle, #FFE9B0 0%, #FFD98A 50%, #B87333 100%);
```

---

## 6. 美术资源获取清单（采购清单）

### 6.1 第一优先级（必需）

- [ ] `galata-ship.png` — 仿 qatar 2nd_ship_new_4 风格的金角湾帆船
- [ ] `byzantine-coin.png` — 拜占庭双头鹰金币 (128×128)
- [ ] 6 个新增 SFX MP3 (negotiate / coin-drop / taboo / genoa-2 个 / venice-buy / byzantine / kapici / bazaar-close)
- [ ] 1-2 个 BGM（如果决定替换 qatar BGM）

### 6.2 第二优先级（提升视觉）

- [ ] 9 个 NPC 头像 PNG (64×64)
- [ ] 5 个西方货 PNG (56×56)
- [ ] 3 张背景 PNG (大巴扎 / 圣索菲亚 / 加拉塔桥)
- [ ] 1 张博斯普鲁斯海峡风景 (voyage 背景)

### 6.3 第三优先级（锦上添花）

- [ ] 4 角色奥斯曼服装版本 (复用 qatar 4 角色)
- [ ] 文化禁忌触发时的红色闪屏特效
- [ ] 拜占庭金币发现时的金光粒子效果

---

## 7. 资源版权清单

### 7.1 第三方资源（需保留许可）

| 资源 | 许可证 | 备注 |
|------|--------|------|
| 2nd_ship_new_4.png (qatar 已用) | CC0 OpenGameArt | 仿风格做 galata-ship |
| countries-110m.json (qatar voyage) | CC-BY | d3 自然地球数据 |
| Noto Naskh Arabic (如使用) | SIL OFL 1.1 | Google Fonts |

### 7.2 自有资源（无需声明）

- Phaser.Graphics 程序绘制的所有 NPC / 商品 sprite（伊斯坦布尔特有）
- 自制 emoji 兜底 UI
- 项目配色方案

### 7.3 项目 README 应增加一行

```markdown
## 关 2 资源

- 大巴扎/圣索菲亚/加拉塔桥 美术素材: CC0 来源（待采购）
- BGM: 复用 qatar 资源 / 自制（CC0）
- SFX: 复用 qatar 6 个 + 新增 9 个（CC0 / 自制）
```

---

## 8. 资源缺失应急方案

| 缺失资源 | 应急方案 |
|----------|----------|
| 西方货 PNG | 用 emoji 🪟🧵🪙🎁💍 替代（已通过 qatar 测试，跨平台 OK） |
| BGM | 复用 qatar `<audio id="silk-road-bgm">` 不变 |
| 拜占庭金币 PNG | Phaser.Graphics 画金色圆 + 双头鹰剪影 |
| SFX | 用 qatar 现有 SFX 复用（如 taboo 暂用 die SFX） |
| NPC 头像 PNG | 全部用 emoji 替代（兜底策略） |
| 背景 PNG | Phaser.Graphics 画大巴扎网格 + 圆顶轮廓 |

**最小可行版本（MVP）**：仅 `galata-ship.png` 必需 + 全部 emoji 兜底 + 复用 qatar BGM。

---

## 9. 资源文件命名规范

参考 qatar 已有命名：

```
qatar/assets/
├── ships/2nd_ship_new_4.png        # 帆船
├── waterskin-icon.png              # 水壶图标
└── trophy/world-cup-trophy-128.png # 大力神杯

turkey/assets/
├── ships/galata-ship.png            # 帆船 (仿 qatar 风格)
├── icons/byzantine-coin.png         # 拜占庭金币
├── icons/venice-glass.png           # 威尼斯玻璃
├── icons/florence-fabric.png        # 佛罗伦萨绒布
├── icons/spice-box.png              # 香料礼盒
├── icons/ruby-ring.png              # 红宝石戒指
├── npcs/{id}.png                    # 9 个 NPC (可选)
└── backgrounds/{id}.png             # 背景 (可选)

turkey/audio/
├── bgm-ottoman-march.mp3            # 主 BGM (可选)
└── sfx-{id}.mp3                     # 9 个新 SFX
```

---

## 10. 验证清单（实现前自检）

- [ ] 所有 PNG 文件 ≤ 256×256（避免大图加载慢）
- [ ] 所有 SFX ≤ 3 秒（避免延迟感）
- [ ] BGM ≤ 4 MB（CDN 友好）
- [ ] 跨平台测试：Chrome / Safari / iOS Safari / Android Chrome
- [ ] iOS Safari 低音量/静音模式正常
- [ ] 移动端 4G 网络下首屏 ≤ 5 秒（CDN + 懒加载）
- [ ] Phaser.Graphics 兜底 sprite 颜色与设计文档配色一致