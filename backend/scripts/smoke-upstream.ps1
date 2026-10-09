#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)] [int] $Port = 18081,
    [switch] $Live,
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$jarPath = Join-Path $backendRoot 'target/backend-0.0.1-SNAPSHOT.jar'
$baseUri = "http://127.0.0.1:$Port"
$backendProcess = $null

function Read-JsonBody($Response) {
    # application/problem+json can be returned as bytes by PowerShell.
    $content = if ($Response.Content -is [byte[]]) {
        [System.Text.Encoding]::UTF8.GetString($Response.Content)
    } else { $Response.Content }
    return ConvertFrom-Json -InputObject $content
}

function Get-CheckedResponse([string] $Path, [int] $ExpectedStatus = 200) {
    $response = Invoke-WebRequest -Uri "$baseUri$Path" -SkipHttpErrorCheck -TimeoutSec 45
    if ([int] $response.StatusCode -ne $ExpectedStatus) {
        throw "Unexpected HTTP status for ${Path}: $($response.StatusCode), expected $ExpectedStatus"
    }
    return $response
}

Push-Location $backendRoot
try {
    if (-not $SkipBuild) {
        & (Join-Path $backendRoot 'mvnw.cmd') -B -ntp verify
        if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed' }
    }
    if (-not (Test-Path -LiteralPath $jarPath)) {
        throw 'Packaged backend JAR missing. Run without -SkipBuild first.'
    }
    # Never reuse or terminate another developer's server.
    $portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try { $portProbe.Start() } finally { $portProbe.Stop() }

    $runId = [guid]::NewGuid().ToString('N')
    $stdoutPath = Join-Path $backendRoot "target/smoke-$runId.out.log"
    $stderrPath = Join-Path $backendRoot "target/smoke-$runId.err.log"
    $backendProcess = Start-Process -FilePath 'java' -ArgumentList @(
        '-jar', "`"$jarPath`"", "--server.port=$Port", '--server.address=127.0.0.1',
        '--mensa.upstream.enabled=true',
        "--spring.datasource.url=jdbc:h2:mem:smoke_$runId", '--spring.jpa.hibernate.ddl-auto=create-drop'
    ) -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($backendProcess.HasExited) { throw "Backend exited early. Inspect $stdoutPath and $stderrPath" }
        try {
            $null = Invoke-WebRequest -Uri "$baseUri/api/upstream/eth/locations" -TimeoutSec 1
            $ready = $true
            break
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (-not $ready) { throw "Backend did not start. Inspect $stdoutPath and $stderrPath" }

    foreach ($institution in @('eth', 'uzh')) {
        $catalog = Read-JsonBody (Get-CheckedResponse "/api/upstream/$institution/locations")
        if (@($catalog).Count -eq 0) { throw "$institution identifier catalog is empty" }
        Write-Host "$institution catalog: $(@($catalog).Count) groups"
    }
    $problem = Read-JsonBody (Get-CheckedResponse '/api/upstream/eth/weekly-rotas?date=invalid' 400)
    if ($problem.status -ne 400) { throw 'Invalid dates must return a JSON problem response' }

    if ($Live) {
        $date = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Europe/Zurich').ToString('yyyy-MM-dd')
        $total = 0
        $complete = $false
        for ($page = 0; $page -lt 100; $page++) {
            $offset = $page * 50
            $json = Read-JsonBody (Get-CheckedResponse "/api/upstream/eth/weekly-rotas?date=$date&offset=$offset")
            if (-not ($json.PSObject.Properties.Name -contains 'weekly-rota-array')) {
                throw 'ETH response has no weekly-rota-array'
            }
            $count = @($json.'weekly-rota-array').Count
            $total += $count
            if ($count -lt 50) { $complete = $true; break }
        }
        if (-not $complete) { throw 'ETH pagination did not finish within 100 pages' }
        Write-Host "ETH live endpoint: $total rota entries"

        if (-not [string]::IsNullOrWhiteSpace($env:MENSA_ZFV_API_KEY)) {
            $zfv = Read-JsonBody (Get-CheckedResponse '/api/upstream/uzh/week')
            if ($zfv.errors) { throw 'ZFV returned GraphQL errors; check API-key permissions' }
            if ($null -eq $zfv.data.organisation.outlets) { throw 'ZFV returned no outlet data' }
            Write-Host "ZFV live endpoint: $(@($zfv.data.organisation.outlets).Count) outlets"
        } else { Write-Host 'ZFV live check skipped: MENSA_ZFV_API_KEY is not configured' }
    }
    Write-Host 'Backend upstream smoke checks passed'
} finally {
    if ($null -ne $backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id
        $backendProcess.WaitForExit()
    }
    Pop-Location
}
