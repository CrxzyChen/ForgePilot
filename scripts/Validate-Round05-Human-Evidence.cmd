@echo off
setlocal
set "OBSERVER_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%OBSERVER_DIR%VALIDATE-HUMAN-EVIDENCE.ps1" -ResultPath "%OBSERVER_DIR%OBSERVATION-RESULT.json" -EvidenceRoot "%OBSERVER_DIR%evidence" -ManifestPath "%OBSERVER_DIR%..\ACCEPTANCE-MANIFEST.json" -ParticipantRoot "%OBSERVER_DIR%..\participant" -ProofPath "%OBSERVER_DIR%ACCEPTANCE-PROOF.json"
exit /b %errorlevel%
