#Requires -Version 7.5
[CmdletBinding()]
param(
    [string] $Date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId(
        [DateTime]::UtcNow, 'Europe/Zurich').ToString('yyyy-MM-dd')
)

# Research/diagnostic output only: does not modify the application's snapshot DB.
$ErrorActionPreference = 'Stop'
$day = [DateTime]::ParseExact($Date, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
$monday = $day.AddDays(-(([int] $day.DayOfWeek + 6) % 7)).ToString('yyyy-MM-dd')
$week = [Globalization.ISOWeek]::GetWeekOfYear($day)
$year = [Globalization.ISOWeek]::GetYear($day)
$outputDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) "target/menu-sources/$Date"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

function Get-Source([string] $Url, [string] $FileName) {
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec 30
    $body = if ($response.Content -is [byte[]]) {
        [Text.Encoding]::UTF8.GetString($response.Content)
    } else { [string] $response.Content }
    Set-Content -LiteralPath (Join-Path $outputDirectory $FileName) -Value $body -Encoding utf8
    return $body
}

function Read-PublicOutlet([string] $Html) {
    # Read JSON from public Next.js hydration records. Never execute page scripts.
    $flight = [Text.StringBuilder]::new()
    $pattern = 'self\.__next_f\.push\((\[.*?\])\)</script>'
    foreach ($match in [regex]::Matches($Html, $pattern, 'Singleline')) {
        $chunk = ConvertFrom-Json -InputObject $match.Groups[1].Value -AsHashtable -Depth 100 -DateKind String
        if ($chunk.Count -eq 2 -and $chunk[0] -eq 1 -and $chunk[1] -is [string]) {
            [void] $flight.Append($chunk[1])
        }
    }
    foreach ($line in $flight.ToString().Split("`n")) {
        if ($line -notmatch '^[a-f0-9]+:(\[.*)$') { continue }
        $record = ConvertFrom-Json -InputObject $Matches[1] -AsHashtable -Depth 100 -DateKind String
        if ($record.Count -eq 4 -and $record[3] -is [System.Collections.IDictionary] -and
                $record[3].Contains('outlet')) {
            return $record[3].outlet
        }
    }
    throw 'Public FOOD2050 page format changed or no outlet was returned; cannot infer an empty menu.'
}

$rotas = [Collections.Generic.List[object]]::new()
$seen = [Collections.Generic.HashSet[string]]::new()
$finished = $false
for ($page = 0; $page -lt 100; $page++) {
    $offset = $page * 50
    $url = "https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas?client-id=ethz-wcms&lang=en&rs-first=$offset&rs-size=50&valid-after=$monday"
    $raw = Get-Source $url "eth-page-$page.json"
    $data = ConvertFrom-Json -InputObject $raw -AsHashtable -Depth 100
    if (-not $data.Contains('weekly-rota-array') -or $data['weekly-rota-array'] -isnot [array]) {
        throw 'ETH response has no weekly-rota-array'
    }
    $entries = $data['weekly-rota-array']
    if ($entries.Count -gt 50 -or -not $seen.Add($raw)) { throw 'ETH pagination failed' }
    foreach ($rota in $entries) {
        if ($rota['facility-id'] -eq 10 -and $rota['valid-from'] -eq $monday) { $rotas.Add($rota) }
    }
    if ($entries.Count -lt 50) { $finished = $true; break }
}
if (-not $finished) { throw 'ETH exceeded 100 pages' }
$polysnack = @{ 'weekly-rota-array' = @($rotas.ToArray()) }
ConvertTo-Json -InputObject $polysnack -Depth 100 |
    Set-Content -LiteralPath (Join-Path $outputDirectory 'polysnack-weekly.json') -Encoding utf8
$ethMeals = @($rotas | ForEach-Object { $_['day-of-week-array'] } |
    ForEach-Object { if ($_) { $_['opening-hour-array'] } } |
    ForEach-Object { if ($_) { $_['meal-time-array'] } } |
    ForEach-Object { if ($_) { $_['line-array'] } } | Where-Object { $_ -and $_['meal'] }).Count

$lichthofPage = 'https://www.zfv.ch/de/essen-gehen/lichthof'
$lichthofHtml = Get-Source $lichthofPage 'lichthof-operator.html'
$lichthofMenu = "https://app.food2050.ch/de/zfv/universitat-zurich%2Ccampus-zentrum/lichthof/mittagsverpflegung/menu/weekly?week=$week&year=$year"
$outlet = Read-PublicOutlet (Get-Source $lichthofMenu 'lichthof-weekly.html')
$calendar = $outlet.menuCategory.calendar.week
if ($calendar.daily -isnot [array] -or $calendar.daily.Count -eq 0) {
    throw 'Lichthof calendar was not returned; cannot infer an empty menu.'
}
$lichthofItems = 0
foreach ($entry in $calendar.daily) {
    $menuDate = [DateTimeOffset]::Parse($entry.from.dateLocal, [Globalization.CultureInfo]::InvariantCulture).Date
    if ($menuDate -lt [DateTime]::Parse($monday) -or $menuDate -ge [DateTime]::Parse($monday).AddDays(7)) {
        throw 'Lichthof returned a different week; cannot infer the requested menu.'
    }
    if ($entry.menuItems -isnot [array]) { throw 'Lichthof menu item format changed' }
    $lichthofItems += $entry.menuItems.Count
}

$irchelPage = 'https://www.zfv.ch/de/essen-gehen/irchel-bar'
$irchelHtml = Get-Source $irchelPage 'irchel-bar-operator.html'
$report = [ordered]@{
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    requestedDate = $Date
    weekStarting = $monday
    polysnack = @{
        facilityId = 10; matchingRotas = $rotas.Count; mealLines = $ethMeals
        source = 'https://idapps.ethz.ch/cookpit-pub-services/v1/weeklyrotas'
        rawFile = 'polysnack-weekly.json'
    }
    lichthof = @{
        outletId = $outlet.id; menuItems = $lichthofItems; menuSource = $lichthofMenu
        operatorSource = $lichthofPage
        operatorReportsTemporaryClosure = $lichthofHtml.Contains('Aufgrund von Umbauarbeiten vorübergehend geschlossen.')
        rawFile = 'lichthof-weekly.html'
    }
    irchelBar = @{
        operatorSource = $irchelPage
        publicFood2050LinkFound = [regex]::IsMatch($irchelHtml, '(?:href|src)="https://app\.food2050\.ch/')
        rawFile = 'irchel-bar-operator.html'
        note = 'Absence of a link does not prove absence of food. Catering PDFs are not a daily menu.'
    }
}
$json = ConvertTo-Json -InputObject $report -Depth 10
Set-Content -LiteralPath (Join-Path $outputDirectory 'report.json') -Value $json -Encoding utf8
Write-Output $json
Write-Host "Raw responses saved under $outputDirectory"
