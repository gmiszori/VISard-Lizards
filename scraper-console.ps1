[CmdletBinding()]
param(
    [string]$BackendUrl,
    [switch]$Refresh
)
$ErrorActionPreference = 'Stop'

# Read only the connector token and website port; never display credentials.
$settings = @{}
$envPath = Join-Path $PSScriptRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in [IO.File]::ReadAllLines($envPath)) {
        if ($line -match '^\s*(MEAL_CONNECTOR_TOKEN|WEB_PORT)\s*=\s*(.*?)\s*$') {
            $settings[$matches[1]] = $matches[2].Trim('"').Trim("'")
        }
    }
}
$token = $env:MEAL_CONNECTOR_TOKEN
if (!$token) { $token = $settings['MEAL_CONNECTOR_TOKEN'] }
if (!$BackendUrl) {
    $port = $env:WEB_PORT
    if (!$port) { $port = $settings['WEB_PORT'] }
    if (!$port) { $port = '8080' }
    $BackendUrl = "http://localhost:$port"
}
$BackendUrl = $BackendUrl.TrimEnd('/')

function Show-ScraperStatus {
    $state = Invoke-RestMethod "$BackendUrl/api/scraped-menus" -TimeoutSec 15
    $attempted = @($state.cafeterias | Where-Object {
        $_.lastAttempt -and $state.lastAttempt -and ([datetimeoffset]$_.lastAttempt -ge [datetimeoffset]$state.lastAttempt)
    }).Count
    Write-Host "Running: $($state.running). Cafeterias attempted this batch: $attempted/$($state.cafeterias.Count)."
    Write-Host "Last batch started: $($state.lastAttempt). Last batch completed: $($state.lastCompleted)."
}

function Request-ScraperRefresh {
    if (!$token -or $token.Length -lt 32) { throw 'Set MEAL_CONNECTOR_TOKEN to at least 32 characters in the root .env and recreate the backend.' }
    try {
        $reply = Invoke-RestMethod "$BackendUrl/api/scraped-menus/refresh" -Method Post -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
        Write-Host "Refresh $($reply.status). This forces new AI/MCP calls for all cafeterias, even with fresh cached data."
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
            Write-Host 'A refresh is already running; no duplicate batch was started.'
        } else { throw }
    }
    Show-ScraperStatus
}

if ($Refresh) { Request-ScraperRefresh; return }
Write-Host "Scraper console connected to $BackendUrl. Type r + Enter to refresh, s for status, q to exit."
Show-ScraperStatus
while ($true) {
    $command = Read-Host 'scraper'
    try {
        switch ($command.Trim().ToLowerInvariant()) {
            'r' { Request-ScraperRefresh }
            's' { Show-ScraperStatus }
            'q' { return }
            default { Write-Host 'Use r (refresh), s (status), or q (quit).' }
        }
    } catch { Write-Error $_ -ErrorAction Continue }
}
