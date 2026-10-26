# 在 Windows 上打包出可直接上传的部署包
#
#   powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
#
# 产出 deploy\tongshi-deploy.tar.gz，里面只有运行需要的东西：
#   server/          服务端（纯 Node 内置模块，不需要 npm install）
#   src/data/        法条库，服务端要读
#   dist/            已构建的前端
#   .env.example     环境变量模板，服务器上复制成 .env 再填
#
# 用 tar.gz 而不是 zip：Windows 打的 zip 在 Linux 上解压时路径分隔符会出问题。

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '构建前端…'
npm run build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }

$stage = Join-Path $env:TEMP 'tongshi-stage'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item server (Join-Path $stage 'server') -Recurse
Copy-Item dist (Join-Path $stage 'dist') -Recurse
New-Item -ItemType Directory -Force (Join-Path $stage 'src\data') | Out-Null
Copy-Item 'src\data\statutes.json' (Join-Path $stage 'src\data') -Force
Copy-Item '.env.example' (Join-Path $stage '.env.example') -Force

$out = Join-Path $root 'deploy\tongshi-deploy.tar.gz'
if (Test-Path $out) { Remove-Item $out -Force }
tar -czf $out -C $stage .

Write-Host ''
Write-Host ('打包完成：' + $out)
Write-Host '上传：scp deploy/tongshi-deploy.tar.gz root@<服务器IP>:~/'
