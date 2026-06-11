# 华夏纪 · 部署手册（GitHub Pages 静态发布）

本仓库把原单文件 `华夏纪.html` 改造为可被搜索引擎收录、首屏更轻、字体自托管的静态站点，并通过 GitHub Actions 自动发布到 GitHub Pages。

---

## 一、它做了什么（对应你提的"工程化债"）

| 债 | 措施 | 产物 | 效果 |
|---|---|---|---|
| 1 数据懒加载 | 把 90 万字符里 80% 的大数据拆成 `public/data/*.json`，运行时按路由 `fetch` | `core.json`(30KB) + 28 朝 + 23 专题 + 索引 | 首包从 ~900KB → ~150KB |
| 2 事件委托 | 站内链接统一在 `router-history.js` 用一个监听器分发 | — | 消除数百处内联 onclick 的注入面 |
| 3 构建期处理 | 数据在构建时定型，运行时不再反复正则 | — | 低端机更顺 |
| 4 字体自托管 | 扫描全站用字，子集化 Noto Serif SC | `public/fonts/*.woff2` | 弱网/离线不再退回系统宋体 |
| 5 SSG + SEO | 无头浏览器预渲染每条路由为真 HTML + History 路由 | `dist/<route>/index.html` + `sitemap.xml` | 28 朝 + 24 专题可被收录 |

> 说明：你已选择"放弃双击离线、换取首包减半 + 字体自托 + SEO"。因此产物必须经 HTTP 访问（GitHub Pages 即满足），不能再用浏览器双击打开本地 html。

---

## 二、你需要准备什么

**如果用全自动 CI（推荐）——你本地几乎不用装任何东西：**
- 一个 GitHub 账号与仓库
- 仅此而已。字体下载、子集化、无头浏览器、预渲染、部署全在 GitHub 服务器完成。

**如果想本地构建预览：**
- Node.js 18+（[nodejs.org](https://nodejs.org)）
- 一次 `npm install`（自动装好字体源包、子集化器、playwright）
- 一次 `npx playwright install chromium`（拉无头浏览器，约 150MB）

字体**不用手动下载**：`@fontsource/noto-serif-sc` 这个 npm 包里就带原始 woff2，子集化脚本自动读取。

---

## 三、部署形态：先定一个变量

整个构建只有一个关键开关 `BASE_PATH`，在两个地方保持一致：
`.github/workflows/deploy.yml` 的 `env.BASE_PATH`、以及本地构建时的环境变量。

| 你的情况 | BASE_PATH | 示例访问地址 |
|---|---|---|
| 项目仓库页（默认） | `/huaxiaji` | `name.github.io/huaxiaji/` |
| 用户主页仓库 `name.github.io` | 留空 `` | `name.github.io/` |
| 绑定自定义域名 | 留空 `` | `your-domain.com/` |

> 仓库名若不叫 `huaxiaji`，把 `/huaxiaji` 换成你的仓库名（前面带斜杠）。
> 同时把 `deploy.yml` 里的 `SITE_URL` 和 `public/robots.txt` 里的 sitemap 地址改成你的真实地址。

---

## 四、发布步骤（全自动 CI）

1. **建仓库**：在 GitHub 新建仓库（如 `huaxiaji`），把本目录所有文件推上去。
   ```bash
   git init && git add . && git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/huaxiaji.git
   git push -u origin main
   ```
2. **改 BASE_PATH**：按上表编辑 `.github/workflows/deploy.yml` 的 `env`（项目页默认即可，无需改）。
3. **开 Pages**：仓库 → Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。
4. **等构建**：推送后 Actions 自动跑（约 3–6 分钟）。完成后 Pages 给出网址。
5. **访问验证**（见第六节）。

之后每次 `git push` 到 `main` 都会自动重建发布。

---

## 五、本地构建与预览（可选）

```bash
npm install                       # 装依赖（含字体源、子集化器、playwright）
npx playwright install chromium   # 拉无头浏览器
BASE_PATH=/huaxiaji npm run build # 抽数据→子集化→预渲染，产物在 dist/
npm run serve                     # 本地起站，打开 http://127.0.0.1:4178/huaxiaji/
```

单独跑某一步：
```bash
npm run extract   # 只抽数据 → public/data
npm run font      # 只子集化字体 → public/fonts
```

---

## 六、如何验证每一项

**懒加载（债 1）**
打开站点 → DevTools → Network，刷新首页只应看到 `core.json` 等小文件；点进某个朝代时才出现 `dynasty/<id>.json`。

**字体自托管（债 4）**
DevTools → Network 勾选"Disable cache"或限速 → 刷新，确认请求的是本站 `/fonts/*.woff2` 而非 fonts.googleapis.com，且中文显示为宋体而非系统默认。
若线上出现"豆腐块"（缺字方框）：把缺的字写进 `scripts/extra-chars.txt`（每行若干字即可），重新构建。

**SSG / SEO（债 5）**
1. 直接访问深链接并**刷新**：`你的站点/dynasty/tang` 能正常显示（不白屏）= History 路由 + 404 fallback 正常。
2. 对该页点右键 → **查看网页源代码**（不是 DevTools Elements，是原始响应），能看到唐朝正文文字 = 预渲染成功、爬虫可见。
3. 打开 `你的站点/sitemap.xml`，应列出全部 28 朝 + 24 页面。
4. （可选）Google Search Console → 网址检查，看抓取到的渲染内容。

**返回逻辑**
进入某朝 → 点站内链接到专题 → 浏览器后退，应回到上一页而非乱跳；右下角"← 返回"按钮逻辑同原版保留。

---

## 七、目录结构

```
huaxiaji/
├─ 华夏纪.src.html            # 源单文件（已含史实/bug/IA 修复；构建从它抽数据）
├─ src/
│  ├─ index.template.html     # 页面外壳模板（含 __BASE__ 占位、<!--DATA_LOADER-->）
│  ├─ data-loader.js          # 运行时异步数据加载层（缓存/重试）
│  ├─ router-history.js       # History 路由 + 异步渲染分发（替换原 hash 路由）
│  └─ 404.template.html       # 深链接 fallback（GitHub Pages 用）
├─ scripts/
│  ├─ extract-data.mjs        # 抽数据 → public/data/*.json（含 figures/search 索引）
│  ├─ subset-font.mjs         # 字体子集化
│  ├─ prerender.mjs           # 无头浏览器预渲染 + sitemap
│  ├─ serve.mjs               # 本地静态服务（SPA fallback）
│  ├─ build.mjs               # 一键编排
│  └─ extra-chars.txt         # （可选）字体补字白名单
├─ public/
│  ├─ data/…                  # 构建生成的 JSON（也可提交，CI 会重生成）
│  ├─ fonts/…                 # 子集化字体
│  └─ robots.txt
├─ .github/workflows/deploy.yml
└─ package.json
```

---

## 八、注意事项与已知边界

- **必须 HTTP 访问**：拆包后不能再双击本地 html 打开（这是你选定的取舍）。需离线分发时另说。
- **base path 必须一致**：`deploy.yml`、`SITE_URL`、`robots.txt` 三处对齐，否则深链接或资源 404。
- **字体许可**：Noto Serif SC 为 SIL OFL 开源字体，可自由自托管分发。
- **预渲染时长**：52 条路由约 1–3 分钟，CI 有缓存后更快。
- **数据更新流程**：内容改在 `华夏纪.src.html`（仍是单文件，便于编辑），push 后 CI 自动重抽、重渲染、重发布。

---

## 九、史实与功能修复（本次随附）

源文件 `华夏纪.src.html` 已包含此前的全部修复：13 项史实硬伤（西夏献宗、北宋钦宗纪年、东汉/辽断代衔接、东周/西汉国祚、五代君数、台城陷落、错字、李时珍年数、武周段名、通说存疑标注、口径统一）、8 项 bug（IntersectionObserver 守卫、触屏 tooltip、平滑滚动、深色 FOUC、事件筛选导航、subnav 自适应、魔法数字、弹窗锁滚/aria）、以及交互改进（文学专题可点、人物卡惰性渲染、低缩放标签精简、打印样式）。
