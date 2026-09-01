---
name: local-windows-build
description: 快速本地编译 CGSwitch 的 Windows 安装包（NSIS exe / MSI），构建完成后打开产物目录并列出安装包路径，供用户直接安装测试，不用等 GitHub Actions 发行工作流。当用户说"本地编译"、"本地构建"、"打个本地包"、"本地出个安装包"、"构建本地测试版"时使用。
---

# 本地快速编译 Windows 版

在用户本机直接编译当前代码的 Windows 安装包，跳过 GitHub Actions 发行工作流（冷编译约 20 分钟，本地增量通常 1 分钟内）。构建的是**当前工作区状态**——包括未提交的改动，适合快速验证。

## 执行步骤

### Step 1: 快速预检

运行 `pnpm typecheck`（约 10 秒）。失败就直接停下报告错误，不要进入几分钟的编译；用户修完类型错误再重来。

Rust 侧不用预检——`pnpm tauri build` 本身会编译，有错会当场报。

如果 `src-tauri/icons/installer-header.bmp` 或 `installer-sidebar.bmp` 存在，先确认它们是 NSIS 可读的经典 BMP：`BITMAPINFOHEADER`（DIB 大小 40）、24-bit、`BI_RGB` 无压缩。不要把 ImageMagick 默认生成的 BMP V4/V5 直接交给 NSIS：

```powershell
foreach ($bmp in @('src-tauri/icons/installer-header.bmp', 'src-tauri/icons/installer-sidebar.bmp')) {
  if (-not (Test-Path -LiteralPath $bmp)) { continue }
  $bytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $bmp))
  $dib = [BitConverter]::ToUInt32($bytes, 14)
  $bpp = [BitConverter]::ToUInt16($bytes, 28)
  $compression = [BitConverter]::ToUInt32($bytes, 30)
  if ($bytes.Length -lt 54 -or $bytes[0] -ne 0x42 -or $bytes[1] -ne 0x4d -or $dib -ne 40 -or $bpp -ne 24 -or $compression -ne 0) {
    throw "NSIS installer image is not classic 24-bit BI_RGB BMP: $bmp"
  }
}
```

NSIS 3.11 Modern UI 的官方推荐尺寸是 header `150×57`、welcome/finish sidebar `164×314`。这些是 96-DPI 下的逻辑控件尺寸，不是高 DPI 的 2x 资源规格；CGswitch 为 163-DPI/高 DPI 场景交付 `300×114`、`328×628` 的矢量重采样 BMP，保持相同宽高比。默认 `MUI_*_BITMAP_STRETCH` 为 `FitControl`，高 DPI 或 CJK 字体会让控件变大并触发运行时放大。用户反馈发糊时，先区分“源图低分辨率”和“安装器运行时缩放”，不要仅靠换 BMP 编码判断画质。

### Step 2: 构建

在项目根目录运行：

```powershell
$buildLog = Join-Path $env:TEMP "cgswitch-tauri-build-$PID.log"
pnpm tauri build 2>&1 | Tee-Object -FilePath $buildLog
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (Select-String -LiteralPath $buildLog -Pattern 'Unsupported format|warning 5040' -Quiet) {
  throw "NSIS rejected an installer image; inspect $buildLog and fix the BMP format before distributing the package."
}
```

- 用 PowerShell 工具执行，timeout 设 600000（10 分钟）
- 成功标志：输出 `Finished 2 bundles at:` 并列出两个路径
- 该命令自动完成：sync-version（VERSION → 三处版本号同步）→ vite build → cargo release 编译 → NSIS + MSI 打包

### Step 3: 确认产物并打开目录

```powershell
Get-ChildItem "src-tauri/target/release/bundle/nsis/*.exe", "src-tauri/target/release/bundle/msi/*.msi" | Select-Object Name, @{n='SizeMB';e={[math]::Round($_.Length/1MB,1)}}, LastWriteTime
Invoke-Item "src-tauri/target/release/bundle/nsis"
```

图标回归检查：`256x256.png` 的白色容器应接近 `254×254`（约 `+1+1`），且 32/48 层 `icon.ico[0]`、`icon.ico[3]` 应分别为完整 `32×32`、`48×48`；不能只检查透明边界而漏掉桌面/资源管理器使用的实际容器尺寸。

如果本次改动包含 `src-tauri/icons`，默认直接增量构建，不得自动运行 `cargo clean` 或删除旧产物；如实际 EXE 仍嵌入旧图标，先保留/备份现有安装包，再向用户说明并获得确认后做定向清理。

### Step 4: 按此格式报告

| 产物 | 路径 | 说明 |
|:---|:---|:---|
| NSIS 安装包（推荐） | `src-tauri\target\release\bundle\nsis\CGSwitch_<版本>_x64-setup.exe` | 标准安装体验 |
| MSI 安装包 | `src-tauri\target\release\bundle\msi\CGSwitch_<版本>_x64_en-US.msi` | 备选 |
| 绿色版 | `src-tauri\target\release\cgswitch.exe` | 免安装直接运行 |

版本号取自根目录 `VERSION` 文件。提醒用户：要测新版本号就先改 `VERSION` 再跑本 skill。

## 注意事项

- 构建产物未签名，Windows SmartScreen 可能提示——点"仍要运行"
- 本地只出 Windows 包；macOS 包仍走 GitHub Actions 的 Release 工作流
- 产物文件名固定带版本号，重复构建会覆盖同名旧文件
- 安装新版本会直接覆盖安装旧版本，无需先卸载
- `Finished 2 bundles at:` 不是唯一成功标准；NSIS `Unsupported format`/`warning 5040` 即使不阻断构建，也必须视为失败
- 画质排查依据：[NSIS Modern UI 2 文档](https://nsis.sourceforge.io/Docs/Modern%20UI%202/Readme.html)；如需改变高 DPI 缩放行为，必须使用 Tauri 的自定义 NSIS 模板，不要把未验证的 `NoStretch` 选项直接写进生成脚本

## 常见问题

**构建失败，报 Rust 编译错误**
看错误第一行的文件和行号，多为当前代码问题；修完重新执行 Step 2 即可，增量编译很快。

**`pnpm` / `cargo` 命令找不到**
确认在项目根目录、Node/Rust 工具链已装；必要时先 `pnpm install`。

**第一次构建很慢（10-20 分钟）**
正常——冷编译约 600 个 crate。之后 `src-tauri/target` 是热的，增量构建通常 1 分钟内。

**typecheck 过了但 tauri build 在 vite 阶段失败**
看 vite 报错的具体文件；`pnpm build` 可以单独复现该阶段。
