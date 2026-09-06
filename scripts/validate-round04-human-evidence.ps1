[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResultPath,

    [Parameter(Mandatory = $true)]
    [string]$EvidenceRoot,

    [Parameter(Mandatory = $true)]
    [string]$CandidatePath,

    [Parameter(Mandatory = $false)]
    [string]$ProofPath
)

$ErrorActionPreference = 'Stop'

$expectedKind = 'ai-game-studio/round04-human-observation-result'
$expectedCandidateName = 'AI-Game-Studio-0.3.0-preview.1-scene-ux-fix-win-x64.zip'
$expectedCandidateHash = '94b9c8b89a685e071690bef6c9783fbae4de8775714e1a04040dae9da54490e9'
$errors = New-Object 'System.Collections.Generic.List[string]'

function Add-ValidationError {
    param([string]$Message)
    [void]$script:errors.Add($Message)
}

function Get-JsonProperty {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

function Require-Text {
    param(
        [object]$Value,
        [string]$Field
    )

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        Add-ValidationError "$Field must be recorded."
        return $false
    }

    return $true
}

function Get-ArrayItems {
    param([object]$Value)

    if ($null -eq $Value) {
        return @()
    }

    return @($Value)
}

function Require-MinimumItems {
    param(
        [object]$Value,
        [int]$Minimum,
        [string]$Field
    )

    $items = @(Get-ArrayItems $Value)
    if ($items.Count -lt $Minimum) {
        Add-ValidationError "$Field must contain at least $Minimum item(s)."
    }

    return $items
}

function Require-IdentifierItems {
    param(
        [object]$Value,
        [int]$Minimum,
        [string]$Field
    )

    $items = @(Require-MinimumItems $Value $Minimum $Field)
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($item in $items) {
        $identifier = [string]$item
        if (-not (Require-Text $identifier $Field)) {
            continue
        }
        if (-not $seen.Add($identifier)) {
            Add-ValidationError "$Field contains a duplicate identifier: $identifier"
        }
    }

    return $items
}

function Get-Sha256 {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Resolve-EvidenceFile {
    param(
        [string]$RelativePath,
        [string]$Field
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        Add-ValidationError "$Field contains an empty path."
        return $null
    }

    if ([System.IO.Path]::IsPathRooted($RelativePath)) {
        Add-ValidationError "$Field must use a path relative to EvidenceRoot: $RelativePath"
        return $null
    }

    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $script:evidenceRootFull $RelativePath))
    $rootPrefix = $script:evidenceRootFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        Add-ValidationError "$Field escapes EvidenceRoot: $RelativePath"
        return $null
    }

    if (-not [System.IO.File]::Exists($fullPath)) {
        Add-ValidationError "$Field does not exist: $RelativePath"
        return $null
    }

    return $fullPath
}

$resultFull = [System.IO.Path]::GetFullPath($ResultPath)
$evidenceRootFull = [System.IO.Path]::GetFullPath($EvidenceRoot).TrimEnd('\', '/')
$candidateFull = [System.IO.Path]::GetFullPath($CandidatePath)

if (-not [System.IO.File]::Exists($resultFull)) {
    throw "Observation result does not exist: $resultFull"
}
if (-not [System.IO.Directory]::Exists($evidenceRootFull)) {
    throw "Evidence directory does not exist: $evidenceRootFull"
}
if (-not [System.IO.File]::Exists($candidateFull)) {
    throw "Candidate archive does not exist: $candidateFull"
}

try {
    $result = Get-Content -LiteralPath $resultFull -Raw | ConvertFrom-Json
}
catch {
    throw "Observation result is not valid JSON: $($_.Exception.Message)"
}

$kind = Get-JsonProperty $result 'kind'
$schemaVersion = Get-JsonProperty $result 'schemaVersion'
$observationId = Get-JsonProperty $result 'observationId'
$decision = Get-JsonProperty $result 'decision'

if ($kind -ne $expectedKind) {
    Add-ValidationError "kind must be $expectedKind."
}
if ([int]$schemaVersion -ne 1) {
    Add-ValidationError 'schemaVersion must be 1.'
}
[void](Require-Text $observationId 'observationId')
if ($decision -ne 'PASS') {
    Add-ValidationError 'decision must be PASS before Round 04 can close.'
}

$candidate = Get-JsonProperty $result 'candidate'
$candidateName = Get-JsonProperty $candidate 'filename'
$candidateHashClaim = [string](Get-JsonProperty $candidate 'sha256')
$candidateHashActual = Get-Sha256 $candidateFull
if ($candidateName -ne $expectedCandidateName) {
    Add-ValidationError "candidate.filename must be $expectedCandidateName."
}
if ($candidateHashClaim.ToLowerInvariant() -ne $expectedCandidateHash) {
    Add-ValidationError 'candidate.sha256 does not match the approved release candidate.'
}
if ($candidateHashActual -ne $expectedCandidateHash) {
    Add-ValidationError 'CandidatePath does not match the approved release candidate hash.'
}

$environment = Get-JsonProperty $result 'environment'
[void](Require-Text (Get-JsonProperty $environment 'windowsVersion') 'environment.windowsVersion')
[void](Require-Text (Get-JsonProperty $environment 'cleanProfileEvidence') 'environment.cleanProfileEvidence')
[void](Require-Text (Get-JsonProperty $environment 'displayResolution') 'environment.displayResolution')
$displayScalePercent = Get-JsonProperty $environment 'displayScalePercent'
if ($null -eq $displayScalePercent -or [double]$displayScalePercent -le 0) {
    Add-ValidationError 'environment.displayScalePercent must be greater than zero.'
}

$participant = Get-JsonProperty $result 'participant'
[void](Require-Text (Get-JsonProperty $participant 'identifier') 'participant.identifier')
[void](Require-Text (Get-JsonProperty $participant 'experience') 'participant.experience')
if ((Get-JsonProperty $participant 'neverUsedBuild') -ne $true) {
    Add-ValidationError 'participant.neverUsedBuild must be true.'
}

$observer = Get-JsonProperty $result 'observer'
[void](Require-Text (Get-JsonProperty $observer 'identifier') 'observer.identifier')
$consent = Get-JsonProperty $result 'consent'
if ((Get-JsonProperty $consent 'screenAndVoiceRecording') -ne $true) {
    Add-ValidationError 'consent.screenAndVoiceRecording must be true.'
}

$timing = Get-JsonProperty $result 'timing'
$startedAt = Get-JsonProperty $timing 'startedAt'
$endedAt = Get-JsonProperty $timing 'endedAt'
[void](Require-Text $startedAt 'timing.startedAt')
[void](Require-Text $endedAt 'timing.endedAt')
$startedTime = [datetime]::MinValue
$endedTime = [datetime]::MinValue
if (-not [datetime]::TryParse([string]$startedAt, [ref]$startedTime)) {
    Add-ValidationError 'timing.startedAt must be an ISO-compatible date/time.'
}
if (-not [datetime]::TryParse([string]$endedAt, [ref]$endedTime)) {
    Add-ValidationError 'timing.endedAt must be an ISO-compatible date/time.'
}
if ($startedTime -ne [datetime]::MinValue -and $endedTime -le $startedTime) {
    Add-ValidationError 'timing.endedAt must be after timing.startedAt.'
}
if ([double](Get-JsonProperty $timing 'activeMinutes') -le 0) {
    Add-ValidationError 'timing.activeMinutes must be greater than zero.'
}

$referencedEvidence = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$journeys = Get-JsonProperty $result 'journeys'
foreach ($journeyCode in @('A', 'B', 'C', 'D')) {
    $journey = Get-JsonProperty $journeys $journeyCode
    if ($null -eq $journey) {
        Add-ValidationError "journeys.$journeyCode is missing."
        continue
    }
    if ((Get-JsonProperty $journey 'started') -ne $true) {
        Add-ValidationError "journeys.$journeyCode.started must be true."
    }
    if ((Get-JsonProperty $journey 'completedWithoutHelp') -ne $true) {
        Add-ValidationError "journeys.$journeyCode.completedWithoutHelp must be true."
    }
    if ((Get-JsonProperty $journey 'result') -ne 'PASS') {
        Add-ValidationError "journeys.$journeyCode.result must be PASS."
    }
    if ([double](Get-JsonProperty $journey 'activeMinutes') -le 0) {
        Add-ValidationError "journeys.$journeyCode.activeMinutes must be greater than zero."
    }
    [void](Require-Text (Get-JsonProperty $journey 'recordingTimeRange') "journeys.$journeyCode.recordingTimeRange")
    $journeyOutputs = @(Require-MinimumItems (Get-JsonProperty $journey 'outputArtifactPaths') 1 "journeys.$journeyCode.outputArtifactPaths")
    foreach ($journeyOutput in $journeyOutputs) {
        $resolvedOutput = Resolve-EvidenceFile ([string]$journeyOutput) "journeys.$journeyCode.outputArtifactPaths"
        if ($null -ne $resolvedOutput) {
            [void]$referencedEvidence.Add($resolvedOutput)
        }
    }
}

$checks = Get-JsonProperty $result 'checks'
foreach ($checkName in @(
        'cleanWindowsProfile',
        'noExternalTools',
        'noCoaching',
        'studioStandaloneParity',
        'noCredentialLeak',
        'allArtifactsCollected',
        'noOpenBlockersOrRetested'
    )) {
    if ((Get-JsonProperty $checks $checkName) -ne $true) {
        Add-ValidationError "checks.$checkName must be true."
    }
}

[void](Require-IdentifierItems (Get-JsonProperty $result 'codexTaskIds') 2 'codexTaskIds')
[void](Require-IdentifierItems (Get-JsonProperty $result 'planIds') 2 'planIds')
[void](Require-IdentifierItems (Get-JsonProperty $result 'changeSetIds') 2 'changeSetIds')
[void](Require-IdentifierItems (Get-JsonProperty $result 'transactionIds') 2 'transactionIds')
if (@(Get-ArrayItems (Get-JsonProperty $result 'openBlockerIds')).Count -ne 0) {
    Add-ValidationError 'openBlockerIds must be empty.'
}

$evidenceRefs = Get-JsonProperty $result 'evidenceRefs'
$evidenceRequirements = @(
    @{ Name = 'runRecordPaths'; Minimum = 1 },
    @{ Name = 'recordingPaths'; Minimum = 1 },
    @{ Name = 'projectArchivePaths'; Minimum = 2 },
    @{ Name = 'developmentPackagePaths'; Minimum = 2 },
    @{ Name = 'releasePackagePaths'; Minimum = 2 },
    @{ Name = 'testResultPaths'; Minimum = 2 },
    @{ Name = 'replayPaths'; Minimum = 2 },
    @{ Name = 'credentialScanPaths'; Minimum = 1 }
)
foreach ($requirement in $evidenceRequirements) {
    $fieldName = [string]$requirement.Name
    $items = @(Require-MinimumItems (Get-JsonProperty $evidenceRefs $fieldName) ([int]$requirement.Minimum) "evidenceRefs.$fieldName")
    foreach ($item in $items) {
        $resolved = Resolve-EvidenceFile ([string]$item) "evidenceRefs.$fieldName"
        if ($null -ne $resolved) {
            [void]$referencedEvidence.Add($resolved)
        }
    }
}

$signatures = Get-JsonProperty $result 'signatures'
[void](Require-Text (Get-JsonProperty $signatures 'observer') 'signatures.observer')
[void](Require-Text (Get-JsonProperty $signatures 'participant') 'signatures.participant')
$signedAt = Get-JsonProperty $signatures 'signedAt'
[void](Require-Text $signedAt 'signatures.signedAt')
$signedTime = [datetime]::MinValue
if (-not [datetime]::TryParse([string]$signedAt, [ref]$signedTime)) {
    Add-ValidationError 'signatures.signedAt must be an ISO-compatible date/time.'
}

$evidenceFiles = @(
    Get-ChildItem -LiteralPath $evidenceRootFull -File -Recurse |
        Sort-Object FullName |
        ForEach-Object {
            $relativePath = $_.FullName.Substring($evidenceRootFull.Length).TrimStart('\', '/').Replace('\', '/')
            [ordered]@{
                path = $relativePath
                sizeBytes = $_.Length
                sha256 = Get-Sha256 $_.FullName
            }
        }
)
if ($evidenceFiles.Count -eq 0) {
    Add-ValidationError 'EvidenceRoot contains no files.'
}

$resultHash = Get-Sha256 $resultFull
$qualified = $errors.Count -eq 0
$proof = [ordered]@{
    kind = 'ai-game-studio/round04-human-acceptance-proof'
    schemaVersion = 1
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    observationId = [string]$observationId
    decision = [string]$decision
    qualifiesForRound04Closure = $qualified
    candidate = [ordered]@{
        path = $candidateFull
        sha256 = $candidateHashActual
    }
    result = [ordered]@{
        path = $resultFull
        sha256 = $resultHash
    }
    referencedEvidenceFileCount = $referencedEvidence.Count
    evidenceFileCount = $evidenceFiles.Count
    evidenceFiles = $evidenceFiles
    humanAuthenticityRequiresOriginalSignedRecord = $true
    validationErrors = @($errors)
}

$proofJson = $proof | ConvertTo-Json -Depth 8
if (-not [string]::IsNullOrWhiteSpace($ProofPath)) {
    $proofFull = [System.IO.Path]::GetFullPath($ProofPath)
    $proofPrefix = $evidenceRootFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if ($proofFull.StartsWith($proofPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'ProofPath must be outside EvidenceRoot so the proof never hashes itself.'
    }
    $proofDirectory = [System.IO.Path]::GetDirectoryName($proofFull)
    if (-not [System.IO.Directory]::Exists($proofDirectory)) {
        [void][System.IO.Directory]::CreateDirectory($proofDirectory)
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($proofFull, $proofJson + [Environment]::NewLine, $utf8NoBom)
}

$proofJson
if (-not $qualified) {
    exit 1
}
