param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$BridgeRoot = Join-Path $PSScriptRoot "mt5_bridge"
$OutDir = Join-Path $BridgeRoot "dist"
$PackageJsonPath = Join-Path $Root "package.json"

Write-Host "[build_mt5_sidecar] root=$Root"
Write-Host "[build_mt5_sidecar] bridge=$BridgeRoot"

& $Python -m pip install --upgrade pip
& $Python -m pip install pyinstaller
& $Python -m pip install -r (Join-Path $PSScriptRoot "requirements.txt")

if (Test-Path $OutDir) {
  Remove-Item $OutDir -Recurse -Force
}

Push-Location $BridgeRoot
try {
  & $Python -m PyInstaller --noconfirm --onedir --name mt5_bridge app.py
} finally {
  Pop-Location
}

$SidecarDir = Join-Path $OutDir "mt5_bridge"
$ExePath = Join-Path $SidecarDir "mt5_bridge.exe"
$ManifestPath = Join-Path $SidecarDir "sidecar-manifest.json"
if (-not (Test-Path $ExePath)) {
  throw "[build_mt5_sidecar] missing sidecar executable at $ExePath"
}

$PackageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
$FileHash = (Get-FileHash -Path $ExePath -Algorithm SHA256).Hash.ToLowerInvariant()
$Now = [DateTimeOffset]::UtcNow
$Manifest = @{
  schemaVersion = 1
  name = "mt5_bridge"
  version = [string]$PackageJson.version
  fileName = "mt5_bridge.exe"
  sha256 = $FileHash
  builtAtIso = $Now.ToString("o")
  builtAtMs = [int64]$Now.ToUnixTimeMilliseconds()
}

$Manifest | ConvertTo-Json -Depth 4 | Out-File -FilePath $ManifestPath -Encoding utf8

Write-Host "[build_mt5_sidecar] built: $SidecarDir"
Write-Host "[build_mt5_sidecar] manifest: $ManifestPath"
