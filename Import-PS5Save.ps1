<#
Converts a decrypted PS5 GTA VI save into a ztrx (Xbox Series build) save slot.

  Import-PS5Save.ps1 <zip | folder | JSAV file> [-AutoLoad] [-DataDir <ztrx data dir>]

-DataDir is the folder ztrx keeps saves in (VICTORY_DATA_DIR / play.ps1 -Data).
Default: %LOCALAPPDATA%\ztrx\data (the default of ztrx's scripts\play.ps1).
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Source,
    [switch]$AutoLoad,
    [string]$DataDir = $(if ($env:VICTORY_DATA_DIR) { $env:VICTORY_DATA_DIR } else { Join-Path $env:LOCALAPPDATA 'ztrx\data' })
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$tools = Join-Path $here 'tools'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$SavesRoot = Join-Path $DataDir '7952987A\saves\0009000000000001\00000000-0000-0000-0000-00007952987a'
$Backups = Join-Path $DataDir 'save-backups'

if (-not (Test-Path $Source)) { throw "Not found: $Source" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is needed: install it from https://nodejs.org and run this again.' }
if (-not (Test-Path $SavesRoot)) {
    Write-Host "No ztrx saves folder at $SavesRoot" -ForegroundColor Yellow
    Write-Host 'Start the game once with ztrx (so it creates its profile), or pass -DataDir <your ztrx data folder>.'
    throw 'saves folder not found'
}

$item = Get-Item $Source
if ($item.PSIsContainer) { $work = $item.FullName }
elseif ($item.Extension -ieq '.zip') {
    $work = Join-Path $here ("incoming\{0}-{1}" -f $item.BaseName, $stamp)
    New-Item -ItemType Directory -Force $work | Out-Null
    Expand-Archive -LiteralPath $item.FullName -DestinationPath $work
}
else { $work = $item.DirectoryName }

function Get-Magic($path) {
    $fs = [IO.File]::OpenRead($path)
    try { $b = New-Object byte[] 4; [void]$fs.Read($b, 0, 4); [Text.Encoding]::ASCII.GetString($b) } finally { $fs.Dispose() }
}
$files = if ($item.PSIsContainer -or $item.Extension -ieq '.zip') { Get-ChildItem $work -Recurse -File } else { @($item) }
$jsav = $files | Where-Object { $_.Length -gt 1024 -and (Get-Magic $_.FullName) -eq 'JSAV' }
if (-not $jsav) {
    $enc = $files | Where-Object { $_.Length -gt 1024 -and (Get-Magic $_.FullName) -in 'ASAV', 'SLAY' }
    if ($enc) { throw "Only an encrypted save was found ($($enc[0].Name)). Decrypt it with a PS5 save tool first (the decrypted file starts with 'JSAV')." }
    throw "No decrypted story save (file starting with 'JSAV') found in $Source."
}
$chives = $files | Where-Object { $_.Name -ieq 'chives.dat' } | Select-Object -First 1

if ($AutoLoad) {
    $others = Get-ChildItem $SavesRoot -Directory | Where-Object { $_.Name -like 'SARC*' }
    if ($others) {
        $park = Join-Path $Backups "before-import-$stamp"
        New-Item -ItemType Directory -Force $park | Out-Null
        $others | ForEach-Object { Move-Item $_.FullName $park }
        Write-Host "Moved $(@($others).Count) other story save(s) to $park"
    }
}

$used = Get-ChildItem $SavesRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object { ($_.Name -split '~')[0] }
foreach ($j in $jsav) {
    $n = 1; while ($used -contains ('SARC{0:D4}' -f $n)) { $n++ }
    $name = 'SARC{0:D4}' -f $n; $used += $name
    $nodeArgs = @("$tools\convert.js", $j.FullName, "$tools\template", $SavesRoot, $name, "PS5 import $($j.Name)")
    if ($chives) { $nodeArgs += $chives.FullName }
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { throw "Conversion failed for $($j.FullName)" }
    Write-Host "Installed as $name" -ForegroundColor Green
}
Write-Host ''
Write-Host 'Done. Start the game with the save patch on (see README.md); the save is under Pause > Load Game.'
