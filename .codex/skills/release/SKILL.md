---
name: release
description: CGswitch 发版流水线（本地部分）：确定版本号、撰写发行日志、提交并推送日志、手动触发 Release 工作流构建三平台资产并自动建草稿、盯构建进度、展示资产与日志供确认后发布。当用户说"发版"、"发行"、"release"、"发个新版本"、"发布新版本"时使用。
---

# CGswitch 发版

分工：本 skill 做需要判断的部分——版本号、发行日志（撰写须由 Agent 完成并经用户确认）、提交推送、触发工作流、最终发布；`.github/workflows/release.yml` 做确定性的部分——校验、三平台构建、创建 tag 与草稿发行页、上传资产。草稿不会通知关注者；执行发布那一刻 GitHub 才给关注者发通知邮件。

工作流由手动触发（推荐，`workflow_dispatch`）或 tag 推送触发；手动触发时工作流用 `GITHUB_TOKEN` 创建 tag 和草稿，不会递归触发自身。

前置条件：当前分支必须是 main 且与远端同步（发行 tag 必须打在 main 上）。不满足时停下，提醒用户先合并/推送，不要自行切换分支。

## Instructions

### Step 1: 确定版本

1. 取最新 tag：`git tag -l 'v*' | sort -V | tail -1`
2. 读 `VERSION` 文件。
3. 若 `VERSION` 已大于最新 tag（用户或工具已提前 bump），直接使用，不要重复 bump。
4. 否则执行 `node scripts/bump-version.mjs patch`（用户明说 minor/major 时用对应级别；拿不准时默认 patch 并在汇报里说明）。
5. 刷新锁文件里的包版本：`cargo update -p cgswitch --manifest-path src-tauri/Cargo.toml`

### Step 2: 撰写 CHANGELOG

1. 查看自上一 tag 以来的提交：`git log <上一tag>..HEAD --oneline --no-merges`（首个版本用全部历史）。
2. **草案先给用户确认，再写入文件**。把新版本段落以代码块贴出来，附上"哪些 commit 进、哪些不进及理由"，等用户明确"OK/确认/就这样"后才能编辑 `CHANGELOG.md`。**禁止先把内容写进文件再让用户事后改。**
3. 在 `CHANGELOG.md` 顶部（文件头部介绍之后）插入新版本段落，标题格式为 `## [<版本>] - <当天日期 YYYY-MM-DD>`，模板：

```markdown
## [<版本>] - <YYYY-MM-DD>

### 新增
- …

### 修复
- …

### 界面与样式
- …

### 如何选择安装包

**Windows**：默认下载 `CGswitch-v<版本>-Windows-setup.exe`，双击安装即可。需要批量部署、静默安装等场景可选用 `.msi` 版本。

**macOS**：
- Apple 芯片（M 系列）→ `CGswitch-v<版本>-macOS-arm64.dmg`
- Intel 芯片 → `CGswitch-v<版本>-macOS-x64.dmg`
```

> ⚠️ `### 如何选择安装包` 是**强制固定模板**，每次发版必填，**不允许省略**，用户已确认这是下载指引必须保留。

4. 写作规则：
   - 用用户视角描述变更（"新增 xxx 功能"），不要照抄 commit 标题。
   - 标题与"如何选择安装包"之外的空分区整节省略；可用分区：新增 / 修复 / 界面与样式 / 性能优化 / 重构 / 移除 / 安全。
   - **不进入 CHANGELOG 的提交**（无用户可见影响）：
     - 纯版本号 bump（`chore(release): vX.Y.Z`）
     - 纯 CI / 工作流变更
     - 纯文档类提交
     - 纯文案 / 按钮 / 标签 / 提示语等措辞小改（不影响功能）
     - 纯图标 / 品牌资源更新（不影响功能）
   - 已有段落风格时（查看 `CHANGELOG.md` 旧版本段落），沿用旧格式。
5. 提交所有发版文件：`git add VERSION package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json CHANGELOG.md`
   提交信息：`chore(release): v<版本>`

### Step 3: 推送日志并触发工作流（不手动打 tag）

1. 推送日志提交：`git push origin main`（工作流从仓库读取 VERSION 与发行日志）。
2. 触发 Release 工作流（手动触发，不 push tag——tag 由工作流用 GITHUB_TOKEN 自动创建，避免递归触发）：
   `gh workflow run release.yml --ref main`
3. 等 10 秒后取 run：`gh run list --workflow=Release --limit 1 --json databaseId,status,headSha`
4. 推送前可选本地预检 `pnpm check`（与工作流 verify job 同一条链），失败就地修复并补充提交；⚠️ 项目 node_modules 是 Windows 平台构建的，必须在 **Windows 侧**执行（WSL 里跑会触发 corepack 重建依赖、破坏 Windows 开发环境）；跳过也可，工作流 verify 会兜底。

### Step 4: 盯 Release 工作流

1. `gh run watch <run-id> --exit-status --interval 30` 放后台执行（约 30-40 分钟），完成时会收到通知。
2. 构建失败：`gh run view <run-id> --log-failed` 提取报错摘要，报告用户并停止（草稿若已创建则留在草稿态，不影响关注者）。
3. 构建成功后工作流已自动完成：创建 tag、创建草稿发行页、上传三平台资产、附上发行日志。

### Step 5: 确认与发布

1. 展示给用户（这一步必须等用户明确确认，不得自动发布）：
   - `gh release view v<版本> --json name,isDraft,assets` 的资产清单（文件名 + 大小）
   - 发行日志全文预览
2. 用户确认后执行：`gh release edit v<版本> --draft=false --latest`
3. 变体处理：
   - 用户说"预发布"：加 `--prerelease`，去掉 `--latest`
   - 用户要改日志：改 `CHANGELOG.md` 对应版本段落，提交推送后重新触发工作流（`gh workflow run release.yml --ref main`），工作流会用新段落更新既有草稿后再发布
4. 发布后告知用户：关注者通知已发出，附 release 页面链接 `https://github.com/zeno528/CGswitch/releases/tag/v<版本>`

## 示例

**场景**：用户说"发版"

1. 最新 tag `v0.4.3`，VERSION 为 0.4.4（已提前 bump）→ 直接用 0.4.4
2. `git log v0.4.3..HEAD --oneline --no-merges` 起草 `CHANGELOG.md` 顶部的 `## [0.4.4] - <日期>` 段落，用户确认文案
3. 提交 `chore(release): v0.4.4`，`git push origin main`，`gh workflow run release.yml --ref main`
4. 后台 `gh run watch` 盯 Release 工作流至全绿（工作流自动建 tag、草稿并上传 4 个资产）
5. 展示 4 个资产（Windows setup/msi、macOS x64/arm64 dmg）+ 日志全文，等确认
6. 用户回复"发布" → `gh release edit v0.4.4 --draft=false --latest`，报告链接

## Troubleshooting

**工作流未触发**：确认 `gh workflow run release.yml --ref main` 已执行、`.github/workflows/release.yml` 已合入 main；`gh run list --workflow=Release` 查看队列。

**verify 第 0 步失败（VERSION 为空 / 缺 CHANGELOG 段落）**：说明版本号或日志没提交。补上 `CHANGELOG.md` 中的 `## [<版本>] - <日期>` 段落（或修正 VERSION），提交推送后重新触发。

**草稿已存在（重跑场景）**：工作流会检测到草稿并更新（`gh release edit`），不会重复建。

**发行已公开后工作流又跑**：工作流会拒绝修改已发布内容（"发行 vX 已经公开，拒绝修改已发布内容"），属正常保护，不是 bug；需要发新版本时递增 VERSION 重来。
