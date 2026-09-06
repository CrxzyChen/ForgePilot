$ErrorActionPreference = "Stop"
$bundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kernelCli = Join-Path $bundleRoot "bin\kernelctl.exe"

function Get-Sha256([string]$path) {
  $stream = [System.IO.File]::OpenRead($path)
  try {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    }
    finally {
      $algorithm.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 24.11.1 or newer is required. See docs\QUICKSTART.md."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required. See docs\QUICKSTART.md."
}

Push-Location $bundleRoot
try {
  $lockPath = Join-Path $bundleRoot "package-lock.json"
  $stateDirectory = Join-Path $bundleRoot ".ai-game-kernel"
  $installMarker = Join-Path $stateDirectory "npm-lock.sha256"
  $lockHash = Get-Sha256 $lockPath
  $installedHash = if (Test-Path -LiteralPath $installMarker) {
    (Get-Content -Raw -LiteralPath $installMarker).Trim()
  } else {
    ""
  }

  if (-not (Test-Path -LiteralPath (Join-Path $bundleRoot "node_modules")) -or $installedHash -ne $lockHash) {
    npm ci
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "The first dependency install was interrupted. Retrying once..."
      Start-Sleep -Seconds 2
      npm ci
    }
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed after retry with exit code $LASTEXITCODE" }
    New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null
    Set-Content -LiteralPath $installMarker -Value $lockHash -Encoding ascii
  }

  $env:AI_GAME_KERNEL_CLI = $kernelCli
  $bridge = Start-Process -FilePath "node" `
    -ArgumentList @("studio/server/http-control-server.ts") `
    -WorkingDirectory $bundleRoot `
    -WindowStyle Hidden `
    -PassThru
  try {
    Start-Sleep -Seconds 1
    if ($env:AI_GAME_KERNEL_NO_BROWSER -ne "1") {
      Start-Process "http://127.0.0.1:8787/studio"
    }
    npm run start
    if ($LASTEXITCODE -ne 0) {
      throw "Studio web server failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    if ($null -ne $bridge -and -not $bridge.HasExited) {
      Stop-Process -Id $bridge.Id
    }
  }
}
finally {
  Pop-Location
}
