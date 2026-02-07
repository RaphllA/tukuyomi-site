# site-publish

发布仓库（静态站点聚合）：

- `/`：Twitter 模拟器（来自同级目录 `twitter-simulator-v2-static`）
- `/2ch/`：2ch 模拟器（来自同级目录 `2ch-generator`）
- `/hub/`：入口页（本仓库维护）

## 同步组装

在 `F:\所长的谣言\` 下三仓库并列时，运行：

```powershell
cd 'F:\所长的谣言\site-publish'
powershell -ExecutionPolicy Bypass -File .\scripts\sync-from-sources.ps1
```

说明：

- `hub/` 与 `sw.js` 属于发布仓库自定义内容，不会被覆盖。
- 其它静态文件会从两个前端仓库重新复制生成。

## 本地预览

```powershell
cd 'F:\所长的谣言\site-publish'
python -m http.server 8000
```

访问：

- `http://localhost:8000/`
- `http://localhost:8000/hub/`
- `http://localhost:8000/2ch/`

