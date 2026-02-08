# twitter-simulator-v2-static（月読 Tsukuyomi）

一个“推特/X 风格”的静态模拟器：写推文、写回复、加翻译、改互动数字、换头像和配图，然后导出 JSON 或静态 HTML 快照。

同人背景设定（给创作者写默认内容用）：`STORY_FOR_CREATORS.md`

---

## 快速开始（部署/打开）

1. 直接双击打开 `index.html`。
2. 首次加载会把默认数据写入浏览器本地状态（主状态在 `IndexedDB`）。

可选（更推荐，用于 PWA/Service Worker 正常工作）：用任意静态服务器打开目录。

```powershell
cd /path/to/twitter-simulator-v2-static
python -m http.server 8000
```

然后访问 `http://localhost:8000/`。

---

## 面向人类：使用指南（从零到能用）

### 0) 先看置顶教程推

默认首页有一条 `nihoheYCY` 发布的置顶“新手教程推”：

- 它默认置顶。
- 它默认不可编辑（避免误改教程）。
- 编辑模式下可以“隐藏本教程”；隐藏后点左侧/上方 `通知` 按钮可再次显示。

最简单的用法（先记住这两句就够了）：

1. 在「编辑模式」创建账户、发布推、编辑内容。
2. 切换到「查看模式」，把页面分享给别人看。

### 1) 先学两个模式

- `编辑模式`：可以改文字、数字、头像、图片、翻译、导入导出。
- `查看模式`：只展示，不给编辑入口。

入口：左侧点 `更多`，在工具面板里切换。

### 2) 先搞懂账户（最重要）

有两个概念：

- `浏览账户`：左下角个人区显示的是谁。
- `发帖账户`：你新发推文/回复时是谁在发。

怎么操作：

1. 点左下角个人区右侧 `...` 切换浏览账户。  
2. 在同一个菜单点 `账户管理`，新增/编辑/删账户。  
3. 在主页发帖框上方下拉框选择“发帖账户”。  

推荐：先把角色账户建好，再写剧情推。

### 3) 发一条主帖

1. 在主页顶部输入框输入正文。  
2. 选择发帖账户。  
3. 可选：上传配图。  
4. 可选：填写显示时间（年/月/日/时/分）。  
5. 可选：点“附翻译/翻译を付ける”添加翻译文本。  
6. 点 `发帖`。  

### 4) 写回复和楼中楼

1. 点击一条推文进入详情页。  
2. 在回复输入框输入内容，可附图、可写时间。  
3. 对某条回复继续回复，就是楼中楼。  
4. 楼中楼同样支持配图和时间。  

### 5) 编辑能力（你能改什么）

在编辑模式下：

- 点文字：改昵称、ID、正文、时间、翻译文本、翻译来源。
- 点数字：改评论/转推/点赞/浏览等。
- 点头像：换头像并裁剪。
- 点帖子图片区：添加/删除帖子配图。

头像同步规则：

- 改“主推头像”时，会出现“同时同步为该账号头像”勾选。
- 勾选：同步到账号头像；不勾选：只改当前这条推。
- 回复头像不会弹这个勾选（回复默认只改当前回复）。

### 6) 搜索、排序、语言

- 右侧搜索框可按作者名/ID/正文/翻译/时间过滤。
- `更多` 面板可切换语言与时间线排序（按发帖顺序/按日期）。

### 7) 保存、备份、分发

- `导出数据`：导出 JSON（推荐作为项目备份）。
- `导入数据`：导入 JSON（会替换当前项目状态）。
- `导出HTML`：导出静态快照（给别人看成品）。

注意图片：图片二进制在浏览器 `IndexedDB` 里；JSON 导出默认不带二进制，只带图片引用 ID（`img_...`）。

---

## 让别人也能看到你的推（GitHub PR 分包协作）

项目发布到 GitHub Pages 后，网页上的“本地编辑”只会保存在你自己的浏览器里，别人看不到。

如果你希望“你的几条推文”成为默认内容，让所有新用户第一次打开就能看到，需要通过 GitHub PR 提交一个“包”。  
约定：一个作者一个包（或一个 PR 一个包）。维护者可以只合并某个 PR 的包，实现“只合并你那几条推”。

### PR 需要提交什么（图片策略：只用 assets）

1. 默认数据：编辑 `js/data.js` 的 `tweetsData`，把你的推文作为新条目追加进去。
2. 账号、头像、推文配图：把图片文件放进 `assets/default/...`（例如 `assets/default/avatars/`、`assets/default/tweets/`），然后在数据里用 `assets/...` 路径引用。

不建议用 `img_...` 作为默认图（它依赖浏览器 IndexedDB，换设备就丢）。

### ID 规则（避免冲突）

本项目用 `id` 合并默认数据与用户本地数据。为了方便维护者只合并你提交的几条推，并避免冲突：

- 不要修改已有推文的 `id`，只追加新条目。
- 推荐使用 16 位以内的“时间戳式数字 ID”：`YYYYMMDDHHMMSSNN`
- `NN` 为本 PR 内序号（00-99）。例如：`2040091014300001`
- 回复/楼中楼也用同样规则，保证在同一 replies 数组里不重复即可（全局唯一更省心）。

### 为什么更新静态页面不会破坏用户本地数据

- 用户的推文/账号/图片都在浏览器本地（IndexedDB + 少量 localStorage）。升级网页代码不会清空它。
- 程序启动时用推文 `id` 做深度合并：默认新增的 `id` 会补进来；用户自己写的推仍保留；用户已改过的旧 `id` 不会被强行覆盖。

---

## 面向开发：数据与改造

### 文件入口

- `index.html`：结构与静态节点（含模态框、侧栏区块）。
- `css/style.css`：样式与响应式布局。
- `js/data.js`：默认推文、默认账户、状态归一化与持久化。
- `js/app.js`：渲染、交互、编辑、账户管理、导入导出。
- `js/image-store.js`：图片读写（`IndexedDB`，`img_...` ID）。

### 存储结构（最新）

- 主状态：`IndexedDB` 数据库 `TwitterSimulatorDB`。
- 主状态 store：`appState`，record key：`current`。
- 图片 store：`images`（key 为 `img_...`）。
- `localStorage` 只保留 `tukuyomi-locale` 与 `tukuyomi-timeline-sort`。

兼容逻辑：旧版 `twitter-simulator-state / twitter-simulator-data / twitter-simulator-version` 会自动迁移并清理。

### 导入导出 JSON（v3）

```ts
type ProjectExportV3 = {
  schemaVersion: 3;
  exportedAt: string;
  tweets: Tweet[];
  accounts: Account[];
  ui: UIState;
  locale?: "zh-CN" | "ja-JP";
};
```

### 关键字段（当前实现）

```ts
type TweetUser = {
  name: string;
  handle: string;
  avatar: string;               // "", "img_...", 或 URL
  verified: boolean;
  accountId?: string | null;
  avatarLinked?: boolean;       // false 表示不跟随账户头像
};

type Tweet = {
  id: number;
  isGuide?: boolean;            // 教程推（只读）
  isPinned?: boolean;           // 置顶
  user: TweetUser;
  content: string;
  media: { type: "image"; url: string; images?: string[] } | null;
  time: string;
  views: string;
  stats: { comments: number; retweets: number; likes: number; bookmarks: number };
  translation: { text: string; source: string; visible?: boolean } | null;
  replies: Reply[];
  userLiked?: boolean;
};

type Reply = {
  id: number;
  user: TweetUser;
  content: string;
  time: string;
  media?: { type: "image"; url: string; images?: string[] } | null;
  translation: { text: string; source: string; visible?: boolean } | null;
  stats: { comments: number; retweets: number; likes: number; views: number; bookmarks?: number };
  replies?: Reply[];
  userLiked?: boolean;
};

type UIState = {
  mode: "edit" | "view";
  defaultAuthorId: string | null;
  composeAuthorId: string | null;
  guideTweetHidden?: boolean;
  textFields: Record<string, string>;
  avatarFields: Record<string, string>;
};
```

### 修改默认内容的推荐方式

1. 改默认推文/账户：编辑 `js/data.js`。  
2. 改静态 UI 默认文案：编辑 `index.html`。  
3. 改可导出 UI 覆盖项：使用 `ui.textFields / ui.avatarFields`。  
4. 改动默认数据后同步提高 `DATA_VERSION`。  

### 常见任务映射

- 主题/排版/布局：`css/style.css`
- 交互行为（模式、账户、导入导出、移动端抽屉）：`js/app.js`
- 默认推文与首次状态：`js/data.js`
