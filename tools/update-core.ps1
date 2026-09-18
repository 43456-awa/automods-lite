# automods-lite 一键更新
#
# 只动代码，不动用户数据：
#   config.json（密钥与模型）、workspace/（工程）、chats/（对话）、usage.json（用量）
# 全部原样保留（更新清单 tools/manifest.json 里根本不包含它们）。
#
# 被占用的 .js 会落成 xxx.pending.js，下次用 boot.js / 启动.bat 启动时自动替换。
#
# 两条路：
#   1) 整包 zip —— 快，但 jsDelivr 已下线整包接口（@main.zip 实测 400），
#      只剩 GitHub 自己的两个地址，国内常常不通。
#   2) 逐文件 —— 照 tools/manifest.json 从 jsDelivr 一个个拉，国内基本能过。
# 所以先试整包，拿不到就自动退到逐文件。

$ErrorActionPreference = 'Stop'
# 本脚本在 tools/ 下，项目根是它的上一级目录（只取一层会算成 tools/，把代码全解进 tools）
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

$repo = '43456-awa/automods-lite'
$branch = 'main'
$manifestRel = 'tools/manifest.json'

# 逐文件用的源。jsDelivr 国内一般能过，raw 最新但国内常不通。
# 注意：jsDelivr 对 .bat 一律 403（返回 Forbidden），所以 .bat 只能靠 raw；
# 拉不到就保留本地已有的那份，不会把文件弄坏。
$fileBases = @(
  "https://cdn.jsdelivr.net/gh/$repo@$branch/",
  "https://fastly.jsdelivr.net/gh/$repo@$branch/",
  "https://raw.githubusercontent.com/$repo/$branch/"
)
# .bat 的源顺序要反过来：jsDelivr 一定 403，先试它纯属浪费
$batBases = @(
  "https://raw.githubusercontent.com/$repo/$branch/",
  "https://cdn.jsdelivr.net/gh/$repo@$branch/",
  "https://fastly.jsdelivr.net/gh/$repo@$branch/"
)

$zipUrls = @(
  "https://codeload.github.com/$repo/zip/refs/heads/$branch",
  "https://github.com/$repo/archive/refs/heads/$branch.zip"
)

$tmp = Join-Path $env:TEMP ("amods-upd-" + [guid]::NewGuid().ToString('N'))
$dl = Join-Path $tmp 'dl'
$ex = Join-Path $tmp 'ex'
New-Item -ItemType Directory -Path $dl -Force | Out-Null
New-Item -ItemType Directory -Path $ex -Force | Out-Null

# 把一份文件放到它在工程里的位置；被占用时 .js 落成 .pending.js
function Place-File($srcPath, $rel) {
  $dst = Join-Path $root ($rel -replace '/', '\')
  $dir = Split-Path $dst -Parent
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  try {
    Copy-Item $srcPath $dst -Force
    return 'ok'
  } catch {
    if ($rel -like '*.js') {
      $pending = Join-Path $root ($rel -replace '\.js$', '.pending.js')
      try {
        Copy-Item $srcPath $pending -Force
        return 'pending'
      } catch { return 'fail' }
    }
    return 'fail'
  }
}

# 从各个源逐文件拉一个文件到 $dst，成功返回 $true
function Fetch-File($rel, $dst) {
  $bases = $fileBases
  if ($rel -like '*.bat') { $bases = $batBases }
  # 路径里万一带非 ASCII（比如中文名文件），URL 段要转义
  $enc = (($rel -split '/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
  foreach ($base in $bases) {
    $t = Join-Path $dl ([guid]::NewGuid().ToString('N'))
    try {
      Invoke-WebRequest -Uri ($base + $enc) -OutFile $t -TimeoutSec 60 -UseBasicParsing
      if ((Get-Item $t).Length -eq 0) { continue }
      Copy-Item $t $dst -Force
      return $true
    } catch { }
  }
  return $false
}

Write-Host '正在获取最新代码…'

$src = $null
foreach ($u in $zipUrls) {
  try {
    Write-Host ("  整包 " + $u)
    $zip = Join-Path $dl 'src.zip'
    Invoke-WebRequest -Uri $u -OutFile $zip -TimeoutSec 180 -UseBasicParsing
    Expand-Archive -LiteralPath $zip -DestinationPath $ex -Force
    $cand = Get-ChildItem $ex -Directory | Select-Object -First 1
    if ($cand) { $src = $cand.FullName; break }
  } catch {
    Write-Host '    不行，换下一个源'
  }
}

$manifest = $null
$okCount = 0
$pendingCount = 0
$skipped = @()

if ($src) {
  # 整包拿到了：照清单逐条复制（清单外的文件一律不碰）
  $mf = Join-Path $src ($manifestRel -replace '/', '\')
  if (Test-Path $mf) {
    $manifest = Get-Content $mf -Raw -Encoding UTF8 | ConvertFrom-Json
  }
  if (-not $manifest) {
    Write-Host '[错误] 整包里没有更新清单 tools/manifest.json'
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
  }
  Write-Host ''
  Write-Host '正在更新（整包）：'
  foreach ($rel in $manifest.files) {
    $s = Join-Path $src ($rel -replace '/', '\')
    if (-not (Test-Path $s)) { continue }
    $r = Place-File $s $rel
    if ($r -eq 'ok') { $okCount++ ; Write-Host ("  " + $rel) }
    elseif ($r -eq 'pending') { $pendingCount++ ; Write-Host ("  " + $rel + "（被占用 → 落成 .pending.js，下次启动自动替换）") }
    else { $skipped += $rel ; Write-Host ("  " + $rel + " 没更新成功（文件被占用？）") }
  }
} else {
  # 整包源都不通（国内很常见）→ 退到逐文件
  Write-Host '  整包源都不通，改用逐文件方式（从 jsDelivr 拉）…'
  $manifest = $null
  foreach ($base in $fileBases) {
    try {
      # 必须自己按 UTF-8 解：PS 5.1 的 Invoke-RestMethod 遇到没写 charset 的
      # JSON 会按 ISO-8859-1 解，中文全变乱码（实测把中文文件名解成非法路径，
      # Test-Path 直接报「路径中具有非法字符」）
      $resp = Invoke-WebRequest -Uri ($base + $manifestRel) -TimeoutSec 60 -UseBasicParsing
      $json = [System.Text.Encoding]::UTF8.GetString($resp.RawContentStream.ToArray())
      $manifest = $json | ConvertFrom-Json
      break
    } catch { }
  }
  if (-not $manifest) {
    Write-Host ''
    Write-Host '[错误] 连更新清单都拉不到。'
    Write-Host '       开着代理/VPN 再试一次，或者让群主直接发你一份整包解压覆盖。'
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
  }
  Write-Host ''
  Write-Host '正在更新（逐文件）：'
  foreach ($rel in $manifest.files) {
    $dst = Join-Path $root ($rel -replace '/', '\')
    $dir = Split-Path $dst -Parent
    if ($dir -and -not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $t = Join-Path $dl ([guid]::NewGuid().ToString('N'))
    if (Fetch-File $rel $t) {
      $r = Place-File $t $rel
      if ($r -eq 'ok') { $okCount++ ; Write-Host ("  " + $rel) }
      elseif ($r -eq 'pending') { $pendingCount++ ; Write-Host ("  " + $rel + "（被占用 → 落成 .pending.js）") }
      else { $skipped += $rel ; Write-Host ("  " + $rel + " 没更新成功（文件被占用？）") }
    } else {
      $skipped += $rel
      if ($rel -like '*.bat') {
        Write-Host ("  " + $rel + " 跳过（jsDelivr 不给 .bat，保留你本地那份）")
      } else {
        Write-Host ("  " + $rel + " 拉不到")
      }
    }
  }
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

# 收尾：把实际版本读出来，跟清单对一下，别让「看起来成功」蒙混过去
$nowVer = '?'
try {
  $nowVer = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
} catch { }

Write-Host ''
Write-Host ("[完成] 更新了 " + $okCount + " 个文件" + $(if ($pendingCount -gt 0) { "，" + $pendingCount + " 个落成 .pending.js" } else { "" }) + "。")
Write-Host ("       现在的版本：" + $nowVer + "（清单版本：" + $manifest.version + "）")
Write-Host '       config.json / workspace / chats / usage.json 都没动。'
if ($skipped.Count -gt 0) {
  Write-Host ("       跳过 " + $skipped.Count + " 个：" + ($skipped -join ', '))
}
if ($nowVer -ne $manifest.version) {
  Write-Host ''
  Write-Host '[注意] 实际版本和清单对不上，可能没更新全。'
  Write-Host '       如果是 .bat 被跳过，那是 jsDelivr 不给 .bat，不影响运行。'
}
Write-Host ''
Write-Host '重启后生效：关掉服务窗口，双击 启动.bat。'
exit 0
