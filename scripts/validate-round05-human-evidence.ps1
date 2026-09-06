[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResultPath,

    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,

    [Parameter(Mandatory = $true)]
    [string]$ParticipantRoot,

    [Parameter(Mandatory = $false)]
    [string]$ProofPath
)

$ErrorActionPreference = 'Stop'
$errors = New-Object 'System.Collections.Generic.List[string]'
$evidenceHashes = [ordered]@{}

function Add-ValidationError {
    param([string]$Message)
    [void]$script:errors.Add($Message)
}

function Get-JsonProperty {
    param([object]$Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) { return $null }
    return $property.Value
}

function Require-Text {
    param([object]$Value, [string]$Field)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        Add-ValidationError "$Field must be recorded."
        return $false
    }
    return $true
}

function Require-True {
    param([object]$Value, [string]$Field)
    if ($Value -ne $true) { Add-ValidationError "$Field must be true." }
}

function Get-ArrayItems {
    param([object]$Value)
    if ($null -eq $Value) { return @() }
    return @($Value)
}

function Require-Items {
    param([object]$Value, [int]$Minimum, [string]$Field)
    $items = @(Get-ArrayItems $Value)
    if ($items.Count -lt $Minimum) {
        Add-ValidationError "$Field must contain at least $Minimum item(s)."
    }
    return $items
}

function Require-UniqueIds {
    param([object]$Value, [int]$Minimum, [string]$Field)
    $items = @(Require-Items $Value $Minimum $Field)
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($item in $items) {
        $id = [string]$item
        if (-not (Require-Text $id $Field)) { continue }
        if (-not $seen.Add($id)) {
            Add-ValidationError "$Field contains duplicate ID $id."
        }
    }
}

function Get-Sha256 {
    param([string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return Get-StreamSha256 $stream
    }
    finally {
        $stream.Dispose()
    }
}

function Get-StreamSha256 {
    param([System.IO.Stream]$Stream)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function Get-TextSha256 {
    param([string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $stream = New-Object System.IO.MemoryStream(,$bytes)
    try {
        return Get-StreamSha256 $stream
    }
    finally {
        $stream.Dispose()
    }
}

function Get-ZipTreeInfo {
    param([string]$Path)
    Add-Type -AssemblyName System.IO.Compression
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Read, $true, [System.Text.Encoding]::UTF8)
        try {
            $entries = @($archive.Entries | Where-Object { -not [string]::IsNullOrEmpty($_.Name) } | Sort-Object -Property FullName)
            $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
            $lines = New-Object 'System.Collections.Generic.List[string]'
            foreach ($entry in $entries) {
                $normalized = $entry.FullName.Replace('\', '/')
                $segments = @($normalized.Split('/'))
                if ([System.IO.Path]::IsPathRooted($normalized) -or $normalized.StartsWith('/') -or $segments -contains '..') {
                    Add-ValidationError "Input project archive has an unsafe entry: $normalized"
                    continue
                }
                if (-not $seen.Add($normalized)) {
                    Add-ValidationError "Input project archive has a duplicate entry: $normalized"
                    continue
                }
                if ($segments[0] -in @('.git', '.aigame', 'out', 'dist')) {
                    Add-ValidationError "Input project archive contains excluded local state: $normalized"
                }
                $entryStream = $entry.Open()
                try {
                    $hash = Get-StreamSha256 $entryStream
                }
                finally {
                    $entryStream.Dispose()
                }
                [void]$lines.Add("$hash  $normalized")
            }
            return [ordered]@{
                sourceTreeSha256 = Get-TextSha256 ($lines -join [string][char]10)
                fileCount = $entries.Count
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Resolve-ContainedFile {
    param([string]$Root, [string]$RelativePath, [string]$Field)
    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        Add-ValidationError "$Field contains an empty path."
        return $null
    }
    if ([System.IO.Path]::IsPathRooted($RelativePath)) {
        Add-ValidationError "$Field must use a relative path: $RelativePath"
        return $null
    }
    $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $pathFull = [System.IO.Path]::GetFullPath((Join-Path $rootFull $RelativePath))
    $prefix = $rootFull + [System.IO.Path]::DirectorySeparatorChar
    if (-not $pathFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Add-ValidationError "$Field escapes its evidence root: $RelativePath"
        return $null
    }
    if (-not [System.IO.File]::Exists($pathFull)) {
        Add-ValidationError "$Field does not exist: $RelativePath"
        return $null
    }
    return $pathFull
}

function Test-SecretText {
    param([string]$Text, [string]$Field)
    $patterns = @(
        '(?i)authorization\s*[:=]\s*bearer\s+[A-Za-z0-9._-]{12,}',
        '(?i)(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*["''][^"'']{8,}["'']',
        '(?i)\bsk-[A-Za-z0-9_-]{16,}\b'
    )
    foreach ($pattern in $patterns) {
        if ($Text -match $pattern) {
            Add-ValidationError "$Field appears to contain a credential secret."
            return
        }
    }
}

$resultFull = [System.IO.Path]::GetFullPath($ResultPath)
$manifestFull = [System.IO.Path]::GetFullPath($ManifestPath)
$evidenceRootFull = [System.IO.Path]::GetFullPath($EvidenceRoot)
$participantRootFull = [System.IO.Path]::GetFullPath($ParticipantRoot)
foreach ($requiredFile in @($resultFull, $manifestFull)) {
    if (-not [System.IO.File]::Exists($requiredFile)) { throw "Required file is missing: $requiredFile" }
}
foreach ($requiredDirectory in @($evidenceRootFull, $participantRootFull)) {
    if (-not [System.IO.Directory]::Exists($requiredDirectory)) { throw "Required directory is missing: $requiredDirectory" }
}

try {
    $resultText = Get-Content -LiteralPath $resultFull -Raw
    $result = $resultText | ConvertFrom-Json
    $manifest = Get-Content -LiteralPath $manifestFull -Raw | ConvertFrom-Json
}
catch {
    throw "Round 05 evidence JSON is invalid: $($_.Exception.Message)"
}
Test-SecretText $resultText 'OBSERVATION-RESULT.json'

if ((Get-JsonProperty $manifest 'kind') -ne 'ai-game-studio/round05-human-acceptance-kit') {
    Add-ValidationError 'Manifest kind is not the Round 05 acceptance kit.'
}
Require-True (Get-JsonProperty $manifest 'finalCandidateEligible') 'manifest.finalCandidateEligible'
if ((Get-JsonProperty $result 'kind') -ne 'ai-game-studio/round05-human-observation-result') {
    Add-ValidationError 'result.kind is not the Round 05 observation result.'
}
if ((Get-JsonProperty $result 'schemaVersion') -ne '1.0.0') {
    Add-ValidationError 'result.schemaVersion must be 1.0.0.'
}
if ((Get-JsonProperty $result 'decision') -ne 'PASS') {
    Add-ValidationError 'result.decision must be PASS.'
}
Require-Text (Get-JsonProperty $result 'observationId') 'observationId' | Out-Null

$manifestCandidate = Get-JsonProperty $manifest 'candidate'
$resultCandidate = Get-JsonProperty $result 'candidate'
$candidateName = [string](Get-JsonProperty $manifestCandidate 'filename')
$candidateClaim = ([string](Get-JsonProperty $manifestCandidate 'sha256')).ToLowerInvariant()
$candidatePath = Resolve-ContainedFile $participantRootFull $candidateName 'candidate.filename'
if ($null -ne $candidatePath) {
    $candidateActual = Get-Sha256 $candidatePath
    if ($candidateActual -ne $candidateClaim) { Add-ValidationError 'Candidate bytes do not match the kit manifest.' }
    if (([string](Get-JsonProperty $resultCandidate 'filename')) -ne $candidateName) { Add-ValidationError 'Result candidate filename does not match the kit.' }
    if (([string](Get-JsonProperty $resultCandidate 'sha256')).ToLowerInvariant() -ne $candidateClaim) { Add-ValidationError 'Result candidate hash does not match the kit.' }
}

$manifestProject = Get-JsonProperty $manifest 'inputProject'
$resultProject = Get-JsonProperty $result 'inputProject'
$projectName = [string](Get-JsonProperty $manifestProject 'filename')
$projectClaim = ([string](Get-JsonProperty $manifestProject 'sha256')).ToLowerInvariant()
$projectPath = Resolve-ContainedFile $participantRootFull $projectName 'inputProject.filename'
if ($null -ne $projectPath) {
    $projectActual = Get-Sha256 $projectPath
    if ($projectActual -ne $projectClaim) { Add-ValidationError 'Input project bytes do not match the kit manifest.' }
    if (([string](Get-JsonProperty $resultProject 'filename')) -ne $projectName) { Add-ValidationError 'Result input project filename does not match the kit.' }
    if (([string](Get-JsonProperty $resultProject 'sha256')).ToLowerInvariant() -ne $projectClaim) { Add-ValidationError 'Result input project hash does not match the kit.' }
    $projectTree = Get-ZipTreeInfo $projectPath
    $projectTreeClaim = ([string](Get-JsonProperty $manifestProject 'sourceTreeSha256')).ToLowerInvariant()
    if ($projectTree.sourceTreeSha256 -ne $projectTreeClaim) { Add-ValidationError 'Input project tree does not match the kit manifest.' }
    if ([int]$projectTree.fileCount -ne [int](Get-JsonProperty $manifestProject 'fileCount')) { Add-ValidationError 'Input project file count does not match the kit manifest.' }
}

$environment = Get-JsonProperty $result 'environment'
foreach ($field in @('windowsVersion', 'cleanProfileEvidence', 'displayResolution', 'locale')) {
    Require-Text (Get-JsonProperty $environment $field) "environment.$field" | Out-Null
}
if ([double](Get-JsonProperty $environment 'displayScalePercent') -le 0) {
    Add-ValidationError 'environment.displayScalePercent must be greater than zero.'
}

$participant = Get-JsonProperty $result 'participant'
Require-Text (Get-JsonProperty $participant 'identifier') 'participant.identifier' | Out-Null
Require-Text (Get-JsonProperty $participant 'experience') 'participant.experience' | Out-Null
Require-True (Get-JsonProperty $participant 'didNotImplementRound05') 'participant.didNotImplementRound05'
Require-True (Get-JsonProperty $participant 'neverUsedBuild') 'participant.neverUsedBuild'
Require-Text (Get-JsonProperty (Get-JsonProperty $result 'observer') 'identifier') 'observer.identifier' | Out-Null
Require-True (Get-JsonProperty (Get-JsonProperty $result 'consent') 'screenAndVoiceRecording') 'consent.screenAndVoiceRecording'

$timing = Get-JsonProperty $result 'timing'
Require-Text (Get-JsonProperty $timing 'startedAt') 'timing.startedAt' | Out-Null
Require-Text (Get-JsonProperty $timing 'endedAt') 'timing.endedAt' | Out-Null
if ([double](Get-JsonProperty $timing 'activeMinutes') -le 0) { Add-ValidationError 'timing.activeMinutes must be greater than zero.' }

$journeys = Get-JsonProperty $result 'journeys'
foreach ($journeyId in @('A', 'B', 'C', 'D', 'E')) {
    $journey = Get-JsonProperty $journeys $journeyId
    Require-True (Get-JsonProperty $journey 'started') "journeys.$journeyId.started"
    Require-True (Get-JsonProperty $journey 'completedWithoutHelp') "journeys.$journeyId.completedWithoutHelp"
    if ((Get-JsonProperty $journey 'result') -ne 'PASS') { Add-ValidationError "journeys.$journeyId.result must be PASS." }
    if ([double](Get-JsonProperty $journey 'activeMinutes') -le 0) { Add-ValidationError "journeys.$journeyId.activeMinutes must be greater than zero." }
    Require-Text (Get-JsonProperty $journey 'recordingTimeRange') "journeys.$journeyId.recordingTimeRange" | Out-Null
    Require-Items (Get-JsonProperty $journey 'outputArtifactPaths') 1 "journeys.$journeyId.outputArtifactPaths" | Out-Null
}

$checks = Get-JsonProperty $result 'checks'
foreach ($field in @(
    'cleanWindowsProfile', 'noExternalTools', 'noCoaching', 'studioPlayerParity',
    'noCredentialLeak', 'noPrivateProviderResponseLeak', 'allArtifactsCollected',
    'noDuplicateSideEffects', 'budgetIntegrity', 'noOpenBlockersOrRetested',
    'bothPackagesOffline'
)) {
    Require-True (Get-JsonProperty $checks $field) "checks.$field"
}

$counts = Get-JsonProperty $result 'counts'
foreach ($field in @('coachingEvents', 'forbiddenWorkaroundEvents', 'duplicateSideEffects')) {
    if ([int](Get-JsonProperty $counts $field) -ne 0) { Add-ValidationError "counts.$field must be zero." }
}
$cost = Get-JsonProperty $result 'cost'
Require-Text (Get-JsonProperty $cost 'currency') 'cost.currency' | Out-Null
$approvedBudget = [double](Get-JsonProperty $cost 'approvedBudget')
$actualCost = [double](Get-JsonProperty $cost 'actual')
if ($approvedBudget -le 0) { Add-ValidationError 'cost.approvedBudget must be greater than zero.' }
if ($actualCost -lt 0 -or $actualCost -gt $approvedBudget) { Add-ValidationError 'cost.actual must be within the approved budget.' }
if ([int](Get-JsonProperty $cost 'duplicateBilledCalls') -ne 0) { Add-ValidationError 'cost.duplicateBilledCalls must be zero.' }

$ids = Get-JsonProperty $result 'ids'
foreach ($entry in @(
    @('goalIds', 1), @('planStepIds', 1), @('toolCallIds', 1), @('jobIds', 1),
    @('reviewDecisionIds', 1), @('changeSetIds', 1), @('runtimeSessionIds', 1),
    @('observationIds', 5), @('testRunIds', 1), @('buildIds', 2), @('packageIds', 2)
)) {
    Require-UniqueIds (Get-JsonProperty $ids $entry[0]) ([int]$entry[1]) "ids.$($entry[0])"
}
if (@(Get-ArrayItems (Get-JsonProperty $result 'openBlockerIds')).Count -ne 0) {
    Add-ValidationError 'openBlockerIds must be empty.'
}

$evidenceRefs = Get-JsonProperty $result 'evidenceRefs'
$evidenceRequirements = @(
    @('runRecordPaths', 1), @('recordingPaths', 1), @('inputProjectArchivePaths', 1),
    @('completedProjectArchivePaths', 1), @('developmentPackagePaths', 1),
    @('releasePackagePaths', 1), @('testResultPaths', 1), @('replayPaths', 1),
    @('runtimeObservationPaths', 5), @('auditExportPaths', 1),
    @('credentialScanPaths', 1), @('packageScanPaths', 1), @('costReportPaths', 1)
)
foreach ($entry in $evidenceRequirements) {
    $field = [string]$entry[0]
    $paths = @(Require-Items (Get-JsonProperty $evidenceRefs $field) ([int]$entry[1]) "evidenceRefs.$field")
    foreach ($relativePath in $paths) {
        $fullPath = Resolve-ContainedFile $evidenceRootFull ([string]$relativePath) "evidenceRefs.$field"
        if ($null -eq $fullPath) { continue }
        $normalized = ([string]$relativePath).Replace('\', '/')
        $evidenceHashes[$normalized] = Get-Sha256 $fullPath
        if ([System.IO.Path]::GetExtension($fullPath).ToLowerInvariant() -in @('.json', '.jsonl', '.md', '.txt', '.log', '.csv')) {
            Test-SecretText (Get-Content -LiteralPath $fullPath -Raw) "evidenceRefs.$field/$normalized"
        }
    }
}

$signatures = Get-JsonProperty $result 'signatures'
foreach ($field in @('observer', 'participant', 'signedAt')) {
    Require-Text (Get-JsonProperty $signatures $field) "signatures.$field" | Out-Null
}

if ($errors.Count -gt 0) {
    [ordered]@{
        ok = $false
        gate = 'Round 05 independent human evidence'
        errors = @($errors)
    } | ConvertTo-Json -Depth 8
    exit 1
}

$proof = [ordered]@{
    ok = $true
    kind = 'ai-game-studio/round05-acceptance-proof'
    schemaVersion = '1.0.0'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    observationId = Get-JsonProperty $result 'observationId'
    candidateSha256 = $candidateClaim
    inputProjectSha256 = $projectClaim
    resultSha256 = Get-Sha256 $resultFull
    evidenceHashes = $evidenceHashes
    journeyResults = [ordered]@{ A = 'PASS'; B = 'PASS'; C = 'PASS'; D = 'PASS'; E = 'PASS' }
    signedBy = [ordered]@{
        observer = Get-JsonProperty $signatures 'observer'
        participant = Get-JsonProperty $signatures 'participant'
        signedAt = Get-JsonProperty $signatures 'signedAt'
    }
    note = 'Hashes evidence; does not authenticate the recorded signatures.'
}
if (-not [string]::IsNullOrWhiteSpace($ProofPath)) {
    $proofFull = [System.IO.Path]::GetFullPath($ProofPath)
    $proofDirectory = Split-Path -Parent $proofFull
    if (-not [System.IO.Directory]::Exists($proofDirectory)) {
        [void][System.IO.Directory]::CreateDirectory($proofDirectory)
    }
    $proof | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $proofFull -Encoding utf8
}
$proof | ConvertTo-Json -Depth 12
