# Publishing this plugin / 发布流程

这套仓库同时面向两条发布路径。**DSH 官方 Discover 没有中心索引**：任何人把自己的 format-1 索引 JSON 挂到公网，用户在 Discover 里添加索引源即可。**社区 dshmarket** 的插件目录来自 [`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 仓库，需要提一个单文件 PR。

## 0. 前置事实

- 仓库：`https://github.com/ximi-chen/dsh-supersede`
- 包名：`dsh-supersede`
- 版本：`package.json` 的 `version`，首次发布为 `0.1.0`
- 安装源：Git，提交用 40 位 SHA 固定（索引里不能写分支或 tag）
- 许可证：MIT

## 1. 发布一个版本（本地）

```sh
# 1) 改版本号
npm version patch --no-git-tag-version   # 或 minor / 手改 package.json

# 2) 提交 release commit（索引会指向这个提交）
git add -A
git commit -m "release: v0.1.0"
git tag v0.1.0

# 3) 基于这个 release commit 生成索引，再单独提交索引
node scripts/make-index.mjs
git add plugin-index.json
git commit -m "chore: update plugin index for v0.1.0"
```

索引必须指向 **release commit**，不能指向包含索引的那个提交（提交无法包含指向自己 SHA 的文件）。所以每次发布固定是「release commit → 生成索引 → 索引 commit」两步。`scripts/make-index.mjs` 默认读取 `HEAD`；如果在 release commit 之后又改了工作区，先提交或显式传 `--commit`。

## 2. 推到 GitHub

首次：

```sh
git remote add origin https://github.com/ximi-chen/dsh-supersede.git
git push -u origin main --follow-tags
```

之后：

```sh
git push origin main --follow-tags
```

在仓库 **Settings → General → Topics** 添加 `dsh-plugin`（社区列表的硬性要求之一）。在 **Releases** 里用 `v0.1.0` 标签建一个 Release（可选；没有预构建 tarball 时，源码安装仍然可用）。

## 3. 官方 Discover（自托管索引）

1. 确认 `plugin-index.json` 已在 `main` 上，且 `curl` 直接返回 200、无重定向：
   `https://raw.githubusercontent.com/ximi-chen/dsh-supersede/main/plugin-index.json`
2. DSH → **Plugins → Experimental plugins** 打开 **Custom plugin indexes**。
3. **Plugins → Discover → Index sources → Add index source**，粘贴上面的 URL。
4. 索引里的 `source.git.commit` 必须是已推送的 release commit；`path` 不写（包在仓库根）。

验证（可选，用装机自带的校验器）：

```sh
ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" -e "
const { createRequire } = require('node:module')
const req = createRequire(process.env.DSH_INSTALL_DIR + '/package.json')
const { parseMarketIndex } = req('@deepseek-ai/dsh-plugin-market-index')
const fs = require('node:fs')
parseMarketIndex(JSON.parse(fs.readFileSync('plugin-index.json','utf8')), 'https://raw.githubusercontent.com/ximi-chen/dsh-supersede/main/plugin-index.json')
console.log('index ok')
"
```

## 4. 社区市场（awesome-dsh-plugin PR）

社区市场只收录 curated 列表里的插件；列表在 `awesome-dsh-plugin/awesome-dsh-plugin` 的 `data/plugins/`，一个插件一个 YAML。已准备好的文件在 [`market/ximi-chen__dsh-supersede.yml`](market/ximi-chen__dsh-supersede.yml)。

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`。
2. 新建 `data/plugins/ximi-chen__dsh-supersede.yml`，内容复制 `market/ximi-chen__dsh-supersede.yml` 的全部内容（不要加注释、不要加别的文件）。
3. 提交、推送、开 PR。PR 标题可用 `Add dsh-supersede`，正文按仓库的 `pr-body.md` 模板勾选。
4. CI 会检查：仓库存在且未归档、`package.json` 声明 `dsh.bundle`、仓库创建满 **1 天**、YAML 文件名/URL/category/description 合法、README 生成一致。
5. 合并后列表、站点和 dshmarket 会自动收录（通常一天内）。

**首次投稿的唯一时间门槛**：GitHub 仓库创建必须满 1 天。仓库刚建好时 CI 会红叉，过期后会自动重跑，不需要推空提交。

## 5. 可选：发布到 npm

社区列表**不要求** npm；条目照常从 GitHub 安装。发布 npm 只影响下载量展示和 Discover 目录的自动收录：

```sh
npm publish --access public
```

发布后确认 `https://registry.npmjs.org/dsh-supersede` 的 `dist-tags.latest` 等于版本号，且 `dist.tarball` 能下载；镜像可能滞后，必要时 `curl -X PUT https://registry.npmmirror.com/dsh-supersede/sync` 等几分钟。`package.json` 的 `repository` 已指回本仓库，列表会自动建立 npm 映射。

## 6. 每次发版后的检查清单

- [ ] `npm test` 通过
- [ ] `package.json` 版本与 tag 一致
- [ ] `plugin-index.json` 的 `version` / `commit` / `publishTimestamp` 指向本次 release commit
- [ ] raw 索引 URL 直接 200，无重定向
- [ ] GitHub topic `dsh-plugin` 存在
- [ ] 社区条目 YAML 只改自己的文件
- [ ] DSH 里从一个**全新会话**安装并验证：开关出现、空闲发送不被打断、运行中发送接替并留标记
