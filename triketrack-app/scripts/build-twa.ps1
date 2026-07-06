param(
  [string]$TwaHost = $env:TWA_HOST,
  [string]$Task = "assembleDebug"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TwaHost)) {
  $TwaHost = $env:VERCEL_PROJECT_PRODUCTION_URL
}

if ([string]::IsNullOrWhiteSpace($TwaHost)) {
  $TwaHost = $env:VERCEL_URL
}

if ([string]::IsNullOrWhiteSpace($TwaHost)) {
  throw "Set TWA_HOST to your Vercel HTTPS origin, for example: `$env:TWA_HOST='https://triketrack-app.vercel.app'; npm run build:twa"
}

if ($TwaHost -notmatch '^https?://') {
  $TwaHost = "https://$TwaHost"
}

$hostUri = [System.Uri]$TwaHost
if ($hostUri.Scheme -ne "https") {
  throw "TWA host must be an HTTPS origin."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$twaDir = Join-Path $repoRoot "twa"
$expoAndroidDir = Join-Path $repoRoot "android"

npm run build:web

if (!(Test-Path (Join-Path $twaDir "gradlew.bat"))) {
  if (!(Test-Path (Join-Path $expoAndroidDir "gradlew.bat"))) {
    throw "No Gradle wrapper found. Open the project in Android Studio or run an Expo Android prebuild first, then retry."
  }

  Copy-Item -LiteralPath (Join-Path $expoAndroidDir "gradlew") -Destination (Join-Path $twaDir "gradlew") -Force
  Copy-Item -LiteralPath (Join-Path $expoAndroidDir "gradlew.bat") -Destination (Join-Path $twaDir "gradlew.bat") -Force
  Copy-Item -LiteralPath (Join-Path $expoAndroidDir "gradle") -Destination (Join-Path $twaDir "gradle") -Recurse -Force
}

Push-Location $twaDir
try {
  .\gradlew.bat $Task "-PtwaHost=$($hostUri.GetLeftPart([System.UriPartial]::Authority))"
}
finally {
  Pop-Location
}
