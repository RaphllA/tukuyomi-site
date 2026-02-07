# 2ch-generator（所长的谣言板）

这是《超时空辉夜姬！》同人创作用的 2ch 风格静态模拟器。  
推荐先观看原作，再使用本工具进行二创内容编排。请遵守同人礼仪，尊重原作与作者。

## 这个页面能做什么

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

## 如何把你的内容发布为默认预设

目前通过 GitHub PR 协作：

1. 在 `threads/` 新建或修改线程数据文件。
2. 在 `threads/index.js` 注册线程并维护楼层数量。
3. 提交 PR，等待维护者审核合并。

后续会提供更便捷的“快速发布社区功能”，减少手动提交流程。

## 文件结构

- `index.html`：线程列表页
- `thread.html`：线程详情页
- `js/app.js`：渲染与编辑逻辑
- `css/style.css`：页面样式
- `threads/index.js`：线程目录
- `threads/*.js`：线程数据

## 同人声明与版权

- 本项目仅用于同人创作与展示，不代表官方立场，不用于商业用途。
- 《超时空辉夜姬！》相关版权归原作者与权利方所有。
- 同人设定参考：
  - [STORY_FOR_CREATORS](https://github.com/RaphllA/twitter-simulator-v2-static/blob/master/STORY_FOR_CREATORS.md)
- 相关链接：
  - [Github：RaphllA](https://github.com/RaphllA/site-publish)
  - [@lofter：古法呛面馒头](https://gufaqiangmianmantou.lofter.com)
  - [@小红书：幼儿园老大](https://xhslink.com/m/GI5hv5bP5d)
