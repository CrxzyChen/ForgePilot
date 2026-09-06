[CmdletBinding()]
param(
    [string]$PackageVariant = 'midnight-workshop'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$version = '0.3.0-preview.1'
if ($PackageVariant -and $PackageVariant -notmatch '^[a-z0-9][a-z0-9.-]*$') {
    throw "Invalid Studio package variant: $PackageVariant"
}
$variantSuffix = if ($PackageVariant) { "-$PackageVariant" } else { '' }
$archiveName = "AI-Game-Studio-$version$variantSuffix-win-x64.zip"
$sourceDirectory = Join-Path $repositoryRoot 'artifacts\studio-windows'
$sourceArchive = Join-Path $sourceDirectory $archiveName
$sourceSidecar = "$sourceArchive.sha256"

if (-not (Test-Path -LiteralPath $sourceArchive -PathType Leaf)) {
    throw "Studio candidate is missing: $sourceArchive"
}
if (-not (Test-Path -LiteralPath $sourceSidecar -PathType Leaf)) {
    throw "Studio hash sidecar is missing: $sourceSidecar"
}

$expectedHash = ((Get-Content -LiteralPath $sourceSidecar -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $sourceArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
    throw "Studio candidate hash mismatch. Expected $expectedHash, received $actualHash."
}

$kitRoot = Join-Path $repositoryRoot "artifacts\round04-human-acceptance\$version-$($actualHash.Substring(0, 12))"
$participantDirectory = Join-Path $kitRoot 'participant'
$observerDirectory = Join-Path $kitRoot 'observer'
New-Item -ItemType Directory -Path $participantDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $observerDirectory -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $observerDirectory 'evidence') -Force | Out-Null

$participantTasks = Join-Path $repositoryRoot 'docs\testing\ROUND-04-PARTICIPANT-TASKS.md'
$observationProtocol = Join-Path $repositoryRoot 'docs\testing\ROUND-04-HUMAN-OBSERVATION.md'
$observerRecord = Join-Path $repositoryRoot 'docs\testing\ROUND-04-OBSERVER-RUN-RECORD.md'
$observerResult = Join-Path $repositoryRoot 'docs\testing\ROUND-04-OBSERVATION-RESULT.template.json'
$releaseEvidence = Join-Path $repositoryRoot 'docs\testing\P27-PREVIEW-RELEASE-EVIDENCE.md'
$releaseLimitations = Join-Path $repositoryRoot 'docs\RELEASE_LIMITATIONS-0.3.0-preview.1.md'
$evidenceValidator = Join-Path $repositoryRoot 'scripts\validate-round04-human-evidence.ps1'
$evidenceValidatorLauncher = Join-Path $repositoryRoot 'scripts\Validate-Round04-Human-Evidence.cmd'

Copy-Item -LiteralPath $sourceArchive -Destination (Join-Path $participantDirectory $archiveName) -Force
Copy-Item -LiteralPath $sourceSidecar -Destination (Join-Path $participantDirectory "$archiveName.sha256") -Force
Copy-Item -LiteralPath $participantTasks -Destination (Join-Path $participantDirectory 'PARTICIPANT-TASKS.md') -Force

Copy-Item -LiteralPath $observationProtocol -Destination (Join-Path $observerDirectory 'OBSERVATION-PROTOCOL.md') -Force
Copy-Item -LiteralPath $observerRecord -Destination (Join-Path $observerDirectory 'OBSERVER-RUN-RECORD.md') -Force
Copy-Item -LiteralPath $observerResult -Destination (Join-Path $observerDirectory 'OBSERVATION-RESULT.json') -Force
Copy-Item -LiteralPath $releaseEvidence -Destination (Join-Path $observerDirectory 'MACHINE-EVIDENCE.md') -Force
Copy-Item -LiteralPath $releaseLimitations -Destination (Join-Path $observerDirectory 'RELEASE-LIMITATIONS.md') -Force
Copy-Item -LiteralPath $evidenceValidator -Destination (Join-Path $observerDirectory 'VALIDATE-HUMAN-EVIDENCE.ps1') -Force
Copy-Item -LiteralPath $evidenceValidatorLauncher -Destination (Join-Path $observerDirectory 'Validate-Human-Evidence.cmd') -Force

$copiedArchive = Join-Path $participantDirectory $archiveName
$copiedHash = (Get-FileHash -LiteralPath $copiedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($copiedHash -ne $actualHash) {
    throw "Copied participant candidate hash mismatch: $copiedHash"
}

$manifest = [ordered]@{
    kind = 'ai-game-studio/round04-human-acceptance-kit'
    version = $version
    target = 'windows-x64'
    releaseArchive = $archiveName
    releaseSha256 = $actualHash
    participantFiles = @(
        "participant/$archiveName"
        "participant/$archiveName.sha256"
        'participant/PARTICIPANT-TASKS.md'
    )
    observerFiles = @(
        'observer/OBSERVATION-PROTOCOL.md'
        'observer/OBSERVER-RUN-RECORD.md'
        'observer/OBSERVATION-RESULT.json'
        'observer/MACHINE-EVIDENCE.md'
        'observer/RELEASE-LIMITATIONS.md'
        'observer/VALIDATE-HUMAN-EVIDENCE.ps1'
        'observer/Validate-Human-Evidence.cmd'
    )
    roleSeparation = @{
        participantReceivesOnlyParticipantFiles = $true
        participantDoesNotReceiveObserverProtocol = $true
        statement = 'The participant receives only participantFiles.'
    }
    blocker = 'R4-OBS-001 remains open until a qualifying signed run is attached.'
}
$manifestPath = Join-Path $kitRoot 'ACCEPTANCE-MANIFEST.json'
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8

[ordered]@{
    ok = $true
    kitRoot = $kitRoot
    participantDirectory = $participantDirectory
    observerDirectory = $observerDirectory
    releaseSha256 = $actualHash
    copiedArchiveSha256 = $copiedHash
    roleSeparated = $true
} | ConvertTo-Json -Depth 4
