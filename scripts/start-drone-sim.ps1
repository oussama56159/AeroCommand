param(
  [string]$OrgId,
  [string]$VehicleId,
  [string]$MqttHost = 'localhost',
  [int]$MqttPort = 1883,
  [string]$ClientId = 'drone001',
  [string]$PythonCommand = 'python'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$simulatorPath = Join-Path $repoRoot 'testMQTT/drone_simulator.py'
if (-not (Test-Path $simulatorPath)) {
  throw "Drone simulator not found: $simulatorPath"
}

$pythonCmd = Get-Command $PythonCommand -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
  throw "Python command not found: $PythonCommand"
}

$env:MQTT_HOST = $MqttHost
$env:MQTT_PORT = [string]$MqttPort
$env:DRONE_CLIENT_ID = $ClientId

if ($OrgId -and $VehicleId) {
  $env:AEROCOMMAND_ENABLED = 'true'
  $env:AEROCOMMAND_ORG_ID = $OrgId
  $env:AEROCOMMAND_VEHICLE_ID = $VehicleId
  Write-Host 'Starting drone simulator in AeroCommand mode...' -ForegroundColor Cyan
  Write-Host ("Org ID:     {0}" -f $OrgId) -ForegroundColor Cyan
  Write-Host ("Vehicle ID: {0}" -f $VehicleId) -ForegroundColor Cyan
} elseif ($OrgId -or $VehicleId) {
  throw 'Provide both -OrgId and -VehicleId, or neither.'
} else {
  $env:AEROCOMMAND_ENABLED = 'false'
  Remove-Item Env:AEROCOMMAND_ORG_ID -ErrorAction SilentlyContinue
  Remove-Item Env:AEROCOMMAND_VEHICLE_ID -ErrorAction SilentlyContinue
  Write-Host 'Starting drone simulator in standalone mode...' -ForegroundColor Cyan
}

Write-Host ("MQTT: {0}:{1}" -f $MqttHost, $MqttPort) -ForegroundColor DarkCyan
Write-Host ''

& $pythonCmd.Path $simulatorPath