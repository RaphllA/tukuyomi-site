# 2ch-generator（所长的谣言板）

这是《超时空辉夜姬！》同人创作用的 2ch 风格静态模拟器。  
推荐先观看原作，再使用本工具进行二创内容编排。请遵守同人礼仪，尊重原作与作者。

> 📖 **作品背景与剧情设定** 请参阅 [BACKGROUND.md](BACKGROUND.md)

## 功能特性

- 浏览预设线程，保留古早 2ch 阅读体验。
- 本地新建线程（发新帖）、追加楼层。
- 直接在对应楼层位置展开编辑器（不是底部统一编辑）。
- 编辑楼层字段：姓名、发言人、ID 模式与颜色、正文颜色、时间、正文。
- 引用与翻译为独立编辑条目：
  - 引用支持输入楼层号连续添加。
  - 输入框为空时按退格可回删最后一条引用。
  - 翻译会自动包装为 `fake-trans` 区块。

## 本地使用

直接打开 `index.html` 即可使用。  
推荐用静态服务器预览：

```powershell
cd /path/to/2ch-generator
python -m http.server 8000
```

访问 `http://localhost:8000/`。

## 数据与保存机制

- 项目为本地优先，状态保存在浏览器 `IndexedDB`。
- 浏览器缓存/站点数据被清除后，本地编辑内容会丢失。
- 预设线程来源于 `threads/*.js`，运行时会与本地状态进行合并。

## 如何创建新帖子

### 第一步：分析原帖内容

从用户提供的截图中提取以下信息：
1. **帖子标题**（日文原文 + 中文翻译）
2. **帖子数量**（共有几楼）
3. **每楼信息**：楼层号、用户名、日期时间、ID、正文内容、中文翻译
4. **特殊样式**：是否有特殊ID（如红色ID）、金色标题等

### 第二步：确定角色名称写法

根据角色对应表（见 [BACKGROUND.md](BACKGROUND.md)），将原图中的角色名替换为正确写法：
- 八千代 → **ヤチヨ**（片假名）
- 彩叶/彩P → **彩P**
- 辉夜 → **かぐや**（平假名）

### 第三步：确定ID格式

有两种ID格式可选：
1. **乱码型**：`ID:x9Fk3A2s`、`ID:Qw7mN4pL` 等随机8位字符
2. **语义型**：`ID:SimP_L0ve`、`ID:NaNaSh1` 等有含义的ID

**注意**：同一用户在同一帖子中的ID必须一致。

### 第四步：确定特殊样式

检查是否需要以下特殊样式：
- **金色标题**：使用 `<span class=\"gold-title\">标题</span>`
- **红色ID**：使用 `<span style=\"color:red\">ID:xxx</span>`
- **良スレ标签**：在标题前加 `★【良スレ】`

### 第五步：创建 JS 文件

在 `threads/` 目录下创建新文件，文件名使用英文小写+下划线。

#### 文件结构模板：

```javascript
app.setThreadData({
    "title": "日文标题<div class=\"title-subtitle\">（中文翻译）</div>",
    "posts": [
        {
            "number": 1,
            "name": "風吹けば名無し",
            "date": "YYYY/MM/DD(曜) HH:MM:SS.ms",
            "uid": "ID:xxxxxxxx",
            "body": "日文正文\\n换行用\\\\n\\n<div class=\"fake-trans\">中文翻译\\n同样换行</div>"
        }
    ]
});
```

#### 关键格式规则：

| 元素 | 格式说明 |
|------|----------|
| 日期 | `YYYY/MM/DD(曜) HH:MM:SS.ms`，曜日用日文：月火水木金土日 |
| 换行 | 使用 `\\n`（在JSON字符串中） |
| 引用链接 | 使用 `&gt;&gt;楼层号` |
| 中文翻译 | 用 `<div class=\"fake-trans\">内容</div>` 包裹 |
| 翻译换行 | 必须与日文原文对应，每行一一对应 |

#### 常见用户名：
- `風吹けば名無し` - 最常用
- `名無しさん@お腹いっぱい。` - 较正式

### 第六步：注册到 index.js

打开 `threads/index.js`，在 threads 数组中添加新条目：

```javascript
{
    "id": "文件名不带.js",
    "title": "显示在首页的标题",
    "count": 帖子数量,
    "date": "YYYY/MM/DD(曜) HH:MM:SS"
}
```

**注意**：如果标题需要金色，index.js 中的 title 也要加 `<span class=\"gold-title\">` 包裹。

### 第七步：验证语法

确保所有引号正确转义：
- 中文翻译中的引号用 `\"` 或使用中文引号 `""`
- HTML属性中的引号用 `\\\"`

### 第八步：更新版本号

#### 什么时候需要更新版本号？

每次修改以下内容后需要更新版本号：
- 新增或修改帖子内容（`threads/*.js`）
- 修改样式文件（`css/style.css`）
- 修改主逻辑（`js/app.js`）

**目的**：防止用户浏览器缓存旧文件，确保显示最新内容。

#### 需要更新的文件（共3处）

| 文件 | 位置 | 作用 |
|------|------|------|
| `index.html` | 第16行 `<script src="js/app.js?v=YYYYMMDD-N">` | 缓存破坏-首页脚本 |
| `thread.html` | 第16行 `<script src="js/app.js?v=YYYYMMDD-N">` | 缓存破坏-帖子页脚本 |
| `js/app.js` | 第10行 `const APP_BUILD_TAG = 'bYYYYMMDD-N';` | 首页显示的版本标识 |

#### 版本号格式说明

- **HTML文件中**：`?v=20260208-5`
  - `20260208` = 日期（YYYYMMDD）
  - `5` = 当天第几次更新（从1开始递增）
  
- **JS常量中**：`'b20260208-5'`
  - 前缀 `b` 表示 "build"
  - 数字部分与HTML保持一致

#### 更新步骤

1. 打开 `index.html`，找到第16行，将版本号 +1
2. 打开 `thread.html`，找到第16行，将版本号 +1（与index.html保持一致）
3. 打开 `js/app.js`，找到第10行，将 `APP_BUILD_TAG` 的版本号 +1（与前两者保持一致）

**示例**：
```
从 20260208-4 更新到 20260208-5
从 b20260208-4 更新到 b20260208-5
```

#### 首页版本标识显示位置

打开首页后，标题"所长的谣言板"右侧有一个灰色小字显示当前版本号（如 `b20260208-5`），这个值来自 `js/app.js` 中的 `APP_BUILD_TAG` 常量。

## 常见错误检查清单

- [ ] 中文翻译中的英文引号是否已转义？
- [ ] 每个 post 对象后是否有逗号（最后一个除外）？
- [ ] ID格式是否一致？同一用户ID相同？
- [ ] 日期格式是否正确？曜日是否为日文？
- [ ] `&gt;&gt;` 是否正确转义用于引用链接？
- [ ] 版本号是否已更新（3处文件）？

## 如何把你的内容发布为默认预设

目前通过 GitHub PR 协作：

1. 在 `threads/` 新建或修改线程数据文件。
2. 在 `threads/index.js` 注册线程并维护楼层数量。
3. 更新版本号（见上方"第八步"）。
4. 提交 PR，等待维护者审核合并。

后续会提供更便捷的"快速发布社区功能"，减少手动提交流程。

## 文件结构

- `index.html`：线程列表页
- `thread.html`：线程详情页
- `js/app.js`：渲染与编辑逻辑
- `css/style.css`：页面样式
- `threads/index.js`：线程目录
- `threads/*.js`：线程数据
- `BACKGROUND.md`：作品背景与角色设定

## 同人声明与版权

- 本项目仅用于同人创作与展示，不代表官方立场，不用于商业用途。
- 《超时空辉夜姬！》相关版权归原作者与权利方所有。
- 同人设定参考：
  - [STORY_FOR_CREATORS](https://github.com/RaphllA/twitter-simulator-v2-static/blob/master/STORY_FOR_CREATORS.md)
- 相关链接：
  - [Github：RaphllA](https://github.com/RaphllA/tukuyomi-site)
  - [@lofter：古法呛面馒头](https://gufaqiangmianmantou.lofter.com)
  - [@小红书：幼儿园老大](https://xhslink.com/m/GI5hv5bP5d)

