[CmdletBinding()]
param(
    [string]$CandidateArchive
)

$ErrorActionPreference = 'Stop'

function Get-Sha256 {
    param([string]$Path)
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
        }
        finally {
            $algorithm.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function Get-TextSha256 {
    param([string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function New-DeterministicProjectArchive {
    param(
        [string]$SourceDirectory,
        [string]$DestinationPath
    )

    Add-Type -AssemblyName System.IO.Compression
    $sourceFull = [System.IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\', '/')
    $excludedRoots = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($name in @('.git', '.aigame', 'out', 'dist')) {
        [void]$excludedRoots.Add($name)
    }
    $files = @(
        [System.IO.Directory]::EnumerateFiles($sourceFull, '*', [System.IO.SearchOption]::AllDirectories) |
            ForEach-Object {
                $relative = $_.Substring($sourceFull.Length + 1).Replace('\', '/')
                $rootSegment = $relative.Split('/')[0]
                if (-not $excludedRoots.Contains($rootSegment)) {
                    [pscustomobject]@{ FullPath = $_; RelativePath = $relative }
                }
            } |
            Sort-Object -Property RelativePath
    )
    if ($files.Count -eq 0) {
        throw "Input project has no packageable files: $sourceFull"
    }

    $treeLines = New-Object 'System.Collections.Generic.List[string]'
    foreach ($file in $files) {
        [void]$treeLines.Add("$(Get-Sha256 $file.FullPath)  $($file.RelativePath)")
    }
    $treeHash = Get-TextSha256 ($treeLines -join [string][char]10)

    $destinationFull = [System.IO.Path]::GetFullPath($DestinationPath)
    $stream = [System.IO.File]::Open($destinationFull, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    try {
        $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create, $true, [System.Text.Encoding]::UTF8)
        try {
            $fixedTimestamp = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
            foreach ($file in $files) {
                $entry = $archive.CreateEntry($file.RelativePath, [System.IO.Compression.CompressionLevel]::Optimal)
                $entry.LastWriteTime = $fixedTimestamp
                $sourceStream = [System.IO.File]::OpenRead($file.FullPath)
                try {
                    $entryStream = $entry.Open()
                    try {
                        $sourceStream.CopyTo($entryStream)
                    }
                    finally {
                        $entryStream.Dispose()
                    }
                }
                finally {
                    $sourceStream.Dispose()
                }
            }
        }
        finally {
            $archive.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }

    return [ordered]@{
        sha256 = Get-Sha256 $destinationFull
        sourceTreeSha256 = $treeHash
        fileCount = $files.Count
    }
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repositoryRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$package.version
$studioArtifacts = Join-Path $repositoryRoot 'artifacts\studio-windows'
if ([string]::IsNullOrWhiteSpace($CandidateArchive)) {
    $CandidateArchive = Join-Path $studioArtifacts "AI-Game-Studio-$version-win-x64.zip"
}
$candidateFull = [System.IO.Path]::GetFullPath($CandidateArchive)
if (-not [System.IO.File]::Exists($candidateFull)) {
    throw "Studio candidate is missing: $candidateFull"
}
$candidateName = Split-Path -Leaf $candidateFull
$candidateHash = Get-Sha256 $candidateFull
$bindingOutput = & node (Join-Path $repositoryRoot 'scripts\verify-release-candidate-source.mjs') $candidateFull $repositoryRoot
if ($LASTEXITCODE -ne 0) { throw 'Studio archive does not match this source checkout.' }
$binding = ($bindingOutput -join [string][char]10) | ConvertFrom-Json
$sourceCommit = [string]$binding.source.commit
$sourceDirty = [bool]$binding.source.dirty
$finalCandidateEligible = [bool]$binding.finalCandidateEligible

$kitBase = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'artifacts\round05-human-acceptance'))
$kitRoot = Join-Path $kitBase "$version-$($candidateHash.Substring(0, 12))"
$participantDirectory = Join-Path $kitRoot 'participant'
$observerDirectory = Join-Path $kitRoot 'observer'
$evidenceDirectory = Join-Path $observerDirectory 'evidence'
$machineEvidenceDirectory = Join-Path $observerDirectory 'machine-evidence'
foreach ($directory in @($participantDirectory, $observerDirectory, $evidenceDirectory, $machineEvidenceDirectory)) {
    [void][System.IO.Directory]::CreateDirectory($directory)
}

$copiedCandidate = Join-Path $participantDirectory $candidateName
Copy-Item -LiteralPath $candidateFull -Destination $copiedCandidate -Force
if ((Get-Sha256 $copiedCandidate) -ne $candidateHash) {
    throw 'Copied Studio candidate hash mismatch.'
}
Set-Content -LiteralPath "$copiedCandidate.sha256" -Value "$candidateHash  $candidateName" -Encoding ascii

$inputProjectName = 'Tank-Placeholder-Input.zip'
$inputProjectPath = Join-Path $participantDirectory $inputProjectName
$archiveResult = New-DeterministicProjectArchive (Join-Path $repositoryRoot 'examples\tank-arena') $inputProjectPath
$inputProjectHash = [string]$archiveResult.sha256
$inputProjectTreeHash = [string]$archiveResult.sourceTreeSha256
$inputProjectFileCount = [int]$archiveResult.fileCount
Set-Content -LiteralPath "$inputProjectPath.sha256" -Value "$inputProjectHash  $inputProjectName" -Encoding ascii

Copy-Item -LiteralPath (Join-Path $repositoryRoot 'docs\testing\ROUND-05-PARTICIPANT-TASKS.md') -Destination (Join-Path $participantDirectory 'PARTICIPANT-TASKS.md') -Force
$participantManifest = [ordered]@{
    kind = 'ai-game-studio/round05-participant-package'
    schemaVersion = '1.0.0'
    studio = [ordered]@{ filename = $candidateName; sha256 = $candidateHash }
    inputProject = [ordered]@{
        filename = $inputProjectName
        sha256 = $inputProjectHash
        sourceTreeSha256 = $inputProjectTreeHash
        fileCount = $inputProjectFileCount
    }
    suppliedFiles = @($candidateName, "$candidateName.sha256", $inputProjectName, "$inputProjectName.sha256", 'PARTICIPANT-TASKS.md')
    statement = 'The participant receives only this directory. It contains no observer rubric, solution, credential, or preselected candidate decision.'
}
$participantManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $participantDirectory 'PARTICIPANT-MANIFEST.json') -Encoding utf8

Copy-Item -LiteralPath (Join-Path $repositoryRoot 'docs\testing\ROUND-05-HUMAN-OBSERVATION.md') -Destination (Join-Path $observerDirectory 'OBSERVATION-PROTOCOL.md') -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'docs\testing\ROUND-05-OBSERVER-RUN-RECORD.md') -Destination (Join-Path $observerDirectory 'OBSERVER-RUN-RECORD.md') -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts\validate-round05-human-evidence.ps1') -Destination (Join-Path $observerDirectory 'VALIDATE-HUMAN-EVIDENCE.ps1') -Force
Copy-Item -LiteralPath (Join-Path $repositoryRoot 'scripts\Validate-Round05-Human-Evidence.cmd') -Destination (Join-Path $observerDirectory 'Validate-Human-Evidence.cmd') -Force

$result = Get-Content -LiteralPath (Join-Path $repositoryRoot 'docs\testing\ROUND-05-OBSERVATION-RESULT.template.json') -Raw | ConvertFrom-Json
$result.candidate.filename = $candidateName
$result.candidate.sha256 = $candidateHash
$result.inputProject.filename = $inputProjectName
$result.inputProject.sha256 = $inputProjectHash
$result | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath (Join-Path $observerDirectory 'OBSERVATION-RESULT.json') -Encoding utf8

$machineEvidence = @(
    'P28-ROUND05-CONTRACT-EVIDENCE.md',
    'P29-MEDIA-JOB-EVIDENCE.md',
    'P29-TRANSACTIONAL-IMPORT-EVIDENCE.md',
    'P30-RUNTIME-OBSERVATION-EVIDENCE.md',
    'P30-DIAGNOSTIC-REPAIR-EVIDENCE.md',
    'P30-STUDIO-PLAYER-PARITY-EVIDENCE.md',
    'P31-TANK-FOUNDATION-EVIDENCE.md',
    'P32-COMPLETION-RUN-EVIDENCE.md'
)
foreach ($name in $machineEvidence) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "docs\testing\$name") -Destination (Join-Path $machineEvidenceDirectory $name) -Force
}

$manifest = [ordered]@{
    kind = 'ai-game-studio/round05-human-acceptance-kit'
    schemaVersion = '1.0.0'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    version = $version
    target = 'windows-x64'
    sourceCommit = $sourceCommit
    sourceDirty = $sourceDirty
    buildSource = $binding.archiveSource
    sourceBindingReason = [string]$binding.reason
    finalCandidateEligible = $finalCandidateEligible
    candidate = [ordered]@{ filename = $candidateName; sha256 = $candidateHash }
    inputProject = [ordered]@{
        filename = $inputProjectName
        sha256 = $inputProjectHash
        sourceTreeSha256 = $inputProjectTreeHash
        fileCount = $inputProjectFileCount
    }
    roleSeparation = [ordered]@{
        participantReceivesOnlyParticipantDirectory = $true
        participantDoesNotReceiveObserverDirectory = $true
        observerMayScheduleInterruptionsButMayNotCoach = $true
    }
    participantFiles = @(
        "participant/$candidateName",
        "participant/$candidateName.sha256",
        "participant/$inputProjectName",
        "participant/$inputProjectName.sha256",
        'participant/PARTICIPANT-TASKS.md',
        'participant/PARTICIPANT-MANIFEST.json'
    )
    observerFiles = @(
        'observer/OBSERVATION-PROTOCOL.md',
        'observer/OBSERVER-RUN-RECORD.md',
        'observer/OBSERVATION-RESULT.json',
        'observer/VALIDATE-HUMAN-EVIDENCE.ps1',
        'observer/Validate-Human-Evidence.cmd'
    )
    machineEvidenceFiles = @($machineEvidence | ForEach-Object { "observer/machine-evidence/$_" })
    blocker = if ($finalCandidateEligible) {
        'R5-OBS-001 remains open until a qualifying signed run passes the offline validator.'
    } else {
        'Development kit only: final P33 candidate still requires version 0.4.0-preview and a clean source checkout; R5-OBS-001 remains open.'
    }
}
$manifestPath = Join-Path $kitRoot 'ACCEPTANCE-MANIFEST.json'
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8

[ordered]@{
    ok = $true
    kitRoot = $kitRoot
    participantDirectory = $participantDirectory
    observerDirectory = $observerDirectory
    candidateSha256 = $candidateHash
    inputProjectSha256 = $inputProjectHash
    inputProjectSourceTreeSha256 = $inputProjectTreeHash
    inputProjectFileCount = $inputProjectFileCount
    roleSeparated = $true
    sourceDirty = $sourceDirty
    finalCandidateEligible = $finalCandidateEligible
    blocker = $manifest.blocker
} | ConvertTo-Json -Depth 8
