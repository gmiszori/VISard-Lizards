$ErrorActionPreference = 'Stop'
$env:MEAL_CONNECTOR_TOKEN = 'test-console-token-with-at-least-32-characters'
. "$PSScriptRoot/../../scraper-console.ps1" -Install
$script:poll = 0
function Start-Sleep { param($Seconds) }
function Invoke-RestMethod {
    param($Uri, $Method, $Headers, $TimeoutSec)
    if ($Method -eq 'Post') { return [pscustomobject]@{status='started'} }
    $script:poll++
    $venue1=[pscustomobject]@{id='a';name='Test A';lastAttempt='2026-10-10T19:00:01Z';stale=$false}
    $venue2=[pscustomobject]@{id='b';name='Test B';lastAttempt=if($script:poll -gt 1){'2026-10-10T19:00:02Z'}else{'2026-10-10T16:00:00Z'};stale=$true}
    return [pscustomobject]@{lastAttempt='2026-10-10T19:00:00Z';lastCompleted=if($script:poll -gt 1){'2026-10-10T19:00:10Z'}else{$null};running=($script:poll -eq 1);cafeterias=@($venue1,$venue2)}
}
r
if ($script:poll -ne 2) { throw 'Alias did not monitor through completion' }
$script:poll=0
function Invoke-RestMethod {
    param($Uri,$Method,$Headers,$TimeoutSec)
    if($Method -eq 'Post') { return [pscustomobject]@{status='started'} }
    return [pscustomobject]@{lastAttempt='2026-10-10T19:00:00Z';lastCompleted='2026-10-10T16:00:00Z';running=$false;cafeterias=@()}
}
try { r; throw 'Aborted batch must not report completion' } catch { if ($_.Exception.Message -notlike 'Refresh stopped before completion*') { throw } }
'PASS alias invokes refresh, prints per-venue status and duration, and rejects aborted completion'
