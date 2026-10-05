param(
  [switch]$CheckOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-EnvFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($raw in Get-Content -Path $Path) {
    $line = $raw.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) { continue }
    if ($line.StartsWith('export ')) { $line = $line.Substring(7).Trim() }
    $idx = $line.IndexOf('=')
    if ($idx -le 0) { continue }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if (-not [string]::IsNullOrWhiteSpace($key)) { $map[$key] = $value }
  }
  return $map
}

function Write-EnvFile {
  param([string]$Path, [hashtable]$EnvMap)
  $order = @(
    'MARKETPLACE_URL',
    'MARKETPLACE_ADMIN_TOKEN',
    'PLUGIN_SIGNING_PRIVATE_KEY',
    'PLUGIN_SIGNING_KEY_ID',
    'PLUGIN_SOURCES',
    'PLUGIN_PACKAGES_DIR',
    'CHANNEL',
    'PAID',
    'CHANGELOG'
  )
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($key in $order) {
    if ($EnvMap.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$EnvMap[$key])) {
      $lines.Add("$key=$($EnvMap[$key])")
    }
  }
  foreach ($entry in $EnvMap.GetEnumerator() | Sort-Object Key) {
    if ($order -contains $entry.Key) { continue }
    if (-not [string]::IsNullOrWhiteSpace([string]$entry.Value)) {
      $lines.Add("$($entry.Key)=$($entry.Value)")
    }
  }
  Set-Content -Path $Path -Value $lines -Encoding UTF8
}

function Ensure-Value {
  param(
    [hashtable]$EnvMap,
    [string]$Key,
    [string]$Value
  )
  if (-not $EnvMap.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace([string]$EnvMap[$Key])) {
    $EnvMap[$Key] = $Value
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$envFile = Join-Path $repoRoot '.env.marketplace.local'
if (-not (Test-Path $envFile)) {
  $example = Join-Path $repoRoot '.env.marketplace.local.example'
  if (Test-Path $example) {
    Copy-Item -Path $example -Destination $envFile
  } else {
    Set-Content -Path $envFile -Value @(
      'MARKETPLACE_URL=https://marketplace-api-production-4843.up.railway.app',
      'MARKETPLACE_ADMIN_TOKEN=',
      'PLUGIN_SIGNING_PRIVATE_KEY=C:/secure/wattanam-publisher/plugin-signing-private.pem',
      'PLUGIN_SIGNING_KEY_ID=official-plugin-2026'
    ) -Encoding UTF8
  }
}

$envMap = Read-EnvFile -Path $envFile
Ensure-Value -EnvMap $envMap -Key 'MARKETPLACE_URL' -Value 'https://marketplace-api-production-4843.up.railway.app'
Ensure-Value -EnvMap $envMap -Key 'PLUGIN_SIGNING_KEY_ID' -Value 'official-plugin-2026'
Ensure-Value -EnvMap $envMap -Key 'CHANNEL' -Value 'STABLE'
Ensure-Value -EnvMap $envMap -Key 'PAID' -Value 'false'

$keyPath = if ($envMap.ContainsKey('PLUGIN_SIGNING_PRIVATE_KEY')) { [string]$envMap['PLUGIN_SIGNING_PRIVATE_KEY'] } else { '' }
if ([string]::IsNullOrWhiteSpace($keyPath) -or -not (Test-Path $keyPath)) {
  $keyDir = Join-Path $repoRoot 'secrets/plugin-keys/wattanam-official'
  New-Item -ItemType Directory -Path $keyDir -Force | Out-Null
  $privateKey = Join-Path $keyDir 'plugin-signing-private.pem'
  if (-not (Test-Path $privateKey)) {
    Write-Host 'Generating signing keys in secrets/plugin-keys/wattanam-official ...'
    node packages/plugin-cli/bin/cli.js keygen $keyDir
  }
  $envMap['PLUGIN_SIGNING_PRIVATE_KEY'] = ($privateKey -replace '\\', '/')
}

$token = if ($envMap.ContainsKey('MARKETPLACE_ADMIN_TOKEN')) { [string]$envMap['MARKETPLACE_ADMIN_TOKEN'] } else { '' }
if ([string]::IsNullOrWhiteSpace($token)) {
  if ($CheckOnly) {
    Write-Host 'MARKETPLACE_ADMIN_TOKEN is missing (expected in CheckOnly mode).'
  } else {
    Write-Host 'MARKETPLACE_ADMIN_TOKEN is missing.'
    $secureToken = Read-Host 'Enter MARKETPLACE_ADMIN_TOKEN' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
      $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
      throw 'MARKETPLACE_ADMIN_TOKEN is required to publish plugin releases.'
    }
    $envMap['MARKETPLACE_ADMIN_TOKEN'] = $plainToken
  }
}

Write-EnvFile -Path $envFile -EnvMap $envMap

Write-Host "Using env file: $envFile"
npm run marketplace:check-publish-env

if ($CheckOnly) {
  Write-Host 'CheckOnly complete. Environment is prepared.'
  exit 0
}

npm run marketplace:bootstrap:catalog

Write-Host 'Verifying live catalog ...'
$catalog = Invoke-RestMethod -Uri "$($envMap['MARKETPLACE_URL'])/v1/catalog" -Method Get
if ($catalog -is [System.Array]) {
  $count = $catalog.Count
} elseif ($catalog -and $catalog.items) {
  $count = $catalog.items.Count
} else {
  $count = 0
}

if ($count -le 0) {
  throw 'Catalog is still empty after bootstrap.'
}

Write-Host "Catalog contains $count item(s)."
