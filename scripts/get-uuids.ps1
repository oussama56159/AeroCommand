param(
  [string]$VehicleId
)

$ErrorActionPreference = 'Stop'

Write-Host 'Fetching Organization and Vehicle UUIDs from AeroCommand API...' -ForegroundColor Cyan
Write-Host ''

$apiBase = 'http://localhost:8000/api/v1'
$apiReadyUrl = 'http://localhost:8000/health/ready'

$email = 'owner@makerskills.com'
$password = 'makerskills_owner_change_me'

try {
  # Login
  $loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Depth 5
  $loginData = Invoke-RestMethod -Uri "$apiBase/auth/login" -Method Post -ContentType 'application/json' -Body $loginBody

  $token = $loginData.access_token
  if (-not $token) {
    throw 'Failed to obtain access token from login response'
  }

  Write-Host '[OK] Logged in successfully' -ForegroundColor Green

  $headers = @{ Authorization = "Bearer $token" }

  # Get org ID from auth/me
  $meData = Invoke-RestMethod -Uri "$apiBase/auth/me" -Method Get -Headers $headers
  $orgId = $meData.organization_id
  if (-not $orgId -and $meData.organizationId) {
    $orgId = $meData.organizationId
  }

  if (-not $orgId) {
    throw 'Failed to extract organization_id from auth/me response'
  }

  Write-Host '[OK] Got organization ID' -ForegroundColor Green

  # Get vehicles
  $vehiclesData = Invoke-RestMethod -Uri "$apiBase/fleet/vehicles" -Method Get -Headers $headers
  $vehicles = $null
  if ($null -ne $vehiclesData.items) {
    $vehicles = $vehiclesData.items
  }
  elseif ($vehiclesData -is [System.Array]) {
    $vehicles = $vehiclesData
  }
  else {
    $vehicles = @()
  }

  if (-not $vehicles -or $vehicles.Count -eq 0) {
    Write-Host 'Warning: No vehicles found in fleet' -ForegroundColor Yellow
    Write-Host ''
    Write-Host ("Organization ID: $orgId") -ForegroundColor Cyan
    Write-Host 'Vehicle ID: (none found)' -ForegroundColor Yellow
    exit 0
  }

  $vehicleId = $vehicles[0].id
  if (-not $vehicleId) {
    throw 'Failed to extract vehicle id from vehicles response'
  }

  Write-Host '[OK] Got vehicle ID' -ForegroundColor Green

  Write-Host ''
  Write-Host '================================' -ForegroundColor Cyan
  Write-Host ("Organization ID: $orgId") -ForegroundColor Yellow
  Write-Host ("Vehicle ID:      $vehicleId") -ForegroundColor Yellow
  if ($vehicles[0].name) {
    Write-Host ("Vehicle Name:    $($vehicles[0].name)") -ForegroundColor Gray
  }
  Write-Host '================================' -ForegroundColor Cyan
  Write-Host ''

  Write-Host 'To start the drone simulator, run:' -ForegroundColor Cyan
  $startSimScript = Join-Path $PSScriptRoot 'start-drone-sim.ps1'
  $startCmd = '  powershell -ExecutionPolicy Bypass -File "{0}" -OrgId {1} -VehicleId {2}' -f $startSimScript, $orgId, $vehicleId
  Write-Host $startCmd -ForegroundColor Green

  if ($VehicleId) {
    Write-Host ''
    $match = $vehicles | Where-Object { $_.id -eq $VehicleId } | Select-Object -First 1
    if ($match) {
      Write-Host '[OK] Vehicle ID exists in the current org fleet list' -ForegroundColor Green
      Write-Host ("Matched Vehicle ID: {0}" -f $match.id) -ForegroundColor Yellow
      if ($match.name) {
        Write-Host ("Matched Vehicle Name: {0}" -f $match.name) -ForegroundColor Gray
      }
    }
    else {
      Write-Host '[WARN] Vehicle ID was not found in the current org fleet list' -ForegroundColor Yellow
      Write-Host ("Checked Vehicle ID: {0}" -f $VehicleId) -ForegroundColor Yellow
    }
  }
  Write-Host ''
}
catch {
  $msg = $_.Exception.Message
  if (-not $msg) {
    $msg = 'Unknown error'
  }

  Write-Host ("Error: $msg") -ForegroundColor Red
  Write-Host 'Make sure:' -ForegroundColor Yellow
  Write-Host '  1. API is running: docker compose up -d' -ForegroundColor Yellow
  Write-Host ('  2. API is ready at ' + $apiReadyUrl) -ForegroundColor Yellow
  exit 1
}
