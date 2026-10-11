[CmdletBinding()]
param(
    [string]$BackendUrl,
    [switch]$Refresh,
    [switch]$Install,
    [switch]$Wait
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
    param([switch]$WaitForCompletion)
    if (!$token -or $token.Length -lt 32) { throw 'Set MEAL_CONNECTOR_TOKEN to at least 32 characters in the root .env and recreate the backend.' }
    try {
        $reply = Invoke-RestMethod "$BackendUrl/api/scraped-menus/refresh" -Method Post -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
        Write-Host "Refresh $($reply.status). This forces new AI/MCP calls for all cafeterias, even with fresh cached data."
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) {
            Write-Host 'A refresh is already running; no duplicate batch was started.'
        } else { throw }
    }
    if ($WaitForCompletion) { Watch-ScraperRefresh } else { Show-ScraperStatus }
}

function Watch-ScraperRefresh {
    $seen = @{}
    $started = $null
    while ($true) {
        $state = Invoke-RestMethod "$BackendUrl/api/scraped-menus" -TimeoutSec 15
        if (!$started) {
            if (!$state.lastAttempt) { throw 'Backend did not report a refresh start time.' }
            $started = [datetimeoffset]$state.lastAttempt
            Write-Host "Started: $($started.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')). Processing $($state.cafeterias.Count) cafeterias."
        }
        if ([datetimeoffset]$state.lastAttempt -ne $started) {
            throw 'A different refresh batch started; run s to check its status.'
        }
        $attempted = @($state.cafeterias | Where-Object { $_.lastAttempt -and [datetimeoffset]$_.lastAttempt -ge $started })
        foreach ($venue in $attempted) {
            if (!$seen.ContainsKey($venue.id)) {
                $seen[$venue.id] = $true
                $result = if ($venue.stale) { 'FAILED (previous data kept)' } elseif ($venue.status -eq 'source_unavailable') { 'NO SOURCE' } else { 'SAVED' }
                $elapsed = [datetimeoffset]::UtcNow - $started
                Write-Host "[$($seen.Count)/$($state.cafeterias.Count)] $($venue.name): $result (elapsed $($elapsed.ToString('hh\:mm\:ss')))"
            }
        }
        if (!$state.running) {
            if (!$state.lastCompleted -or [datetimeoffset]$state.lastCompleted -lt $started) {
                throw 'Refresh stopped before completion. Check backend logs; previous results are preserved.'
            }
            $finished = [datetimeoffset]$state.lastCompleted
            $duration = $finished - $started
            $failed = @($attempted | Where-Object { $_.stale }).Count
            Write-Host "Finished: $($finished.ToLocalTime().ToString('yyyy-MM-dd HH:mm:ss zzz')). Duration: $($duration.ToString('hh\:mm\:ss')). Processed $($attempted.Count)/$($state.cafeterias.Count); failed: $failed."
            return
        }
        Write-Host "Refreshing: $($attempted.Count)/$($state.cafeterias.Count) processed; elapsed $(([datetimeoffset]::UtcNow - $started).ToString('hh\:mm\:ss')) ..."
        Start-Sleep -Seconds 5
    }
}

if ($Install) {
    if ($MyInvocation.InvocationName -ne '.') { throw 'Load into your current terminal with: . .\scraper-console.ps1 -Install' }
    function Invoke-MensaScraperRefresh { Request-ScraperRefresh -WaitForCompletion }
    Set-Alias -Name r -Value Invoke-MensaScraperRefresh -Scope Global -Option AllScope -Force
    Set-Alias -Name s -Value Show-ScraperStatus -Scope Global -Force
    Write-Host 'Scraper commands loaded in this terminal. Type r + Enter to refresh and watch progress until completion; s shows status. Ctrl+C stops watching, while the backend continues.'
    return
}
if ($Refresh) { Request-ScraperRefresh -WaitForCompletion:$Wait; return }
Write-Host "Scraper console connected to $BackendUrl. Type r + Enter to refresh, s for status, q to exit."
Show-ScraperStatus
while ($true) {
    $command = Read-Host 'scraper'
    try {
        switch ($command.Trim().ToLowerInvariant()) {
            'r' { Request-ScraperRefresh -WaitForCompletion }
            's' { Show-ScraperStatus }
            'q' { return }
            default { Write-Host 'Use r (refresh), s (status), or q (quit).' }
        }
    } catch { Write-Error $_ -ErrorAction Continue }
}
