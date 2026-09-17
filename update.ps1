# automods-lite 一键更新
#
# 从 GitHub 拉最新代码覆盖过去，只动代码，不动用户数据：
#   config.json（密钥与模型）、workspace/（工程）、chats/（对话）、usage.json（用量）
# 全部原样保留。
#
# 被占用的 server.js 会落成 server.pending.js，下次用 boot.js / 启动.bat 启动时自动替换。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$repo = '43456-awa/automods-lite'
$branch = 'main'

# 国内直连 GitHub 常常不通，jsDelivr 一般能过
$urls = @(
  "https://cdn.jsdelivr.net/gh/$repo@$branch.zip",
  "https://fastly.jsdelivr.net/gh/$repo@$branch.zip",
  "https://github.com/$repo/archive/refs/heads/$branch.zip"
)

$tmp = Join-Path $env:TEMP ("amods-upd-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$zip = Join-Path $tmp 'src.zip'

Write-Host '正在下载最新代码…'
$ok = $false
foreach ($u in $urls) {
  try {
    Write-Host ("  试 " + $u)
    Invoke-WebRequest -Uri $u -OutFile $zip -TimeoutSec 180 -UseBasicParsing
    $ok = $true
    break
  } catch {
    Write-Host '    不行，换下一个源'
  }
}
if (-not $ok) {
  Write-Host ''
  Write-Host '[错误] 三个源都下不动。'
  Write-Host '       开着代理/VPN 再试一次，或者手动去 GitHub 下 ZIP 解压覆盖。'
  exit 1
}

Write-Host '正在解压…'
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
$src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName
if (-not $src) {
  Write-Host '[错误] 压缩包结构不对'
  exit 1
}

Write-Host ''
Write-Host '正在更新：'

$files = @(
  'boot.js', 'server.js', 'learn.mjs', 'updater.mjs', 'memory.mjs',
  'package.json', 'update.json', 'README.md',
  'start.bat', 'update.bat', 'update.ps1', '启动.bat'
)
foreach ($f in $files) {
  $s = Join-Path $src $f
  if (-not (Test-Path $s)) { continue }
  $d = Join-Path $root $f
  try {
    Copy-Item $s $d -Force
    Write-Host ("  " + $f)
  } catch {
    # 服务还在跑 → server.js 被占用。落成 .pending.js，下次启动时由 boot.js 替换
    if ($f -like '*.js') {
      $pending = Join-Path $root ($f -replace '\.js$', '.pending.js')
      Copy-Item $s $pending -Force
      Write-Host ("  " + $f + "（被占用 → 写成 " + (Split-Path $pending -Leaf) + "，下次启动自动替换）")
    } else {
      Write-Host ("  " + $f + " 没更新成功（文件被占用？）")
    }
  }
}

# public/ 里是全部前端（含 vendor 样式与 assets 图），content/ 是教程，tools/ 是辅助脚本
foreach ($dir in @('public', 'content', 'tools')) {
  $s = Join-Path $src $dir
  if (-not (Test-Path $s)) { continue }
  $d = Join-Path $root $dir
  if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
  Copy-Item (Join-Path $s '*') $d -Recurse -Force
  Write-Host ("  " + $dir + "/")
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '[完成] 代码已更新。config.json / workspace / chats / usage.json 都没动。'
exit 0
