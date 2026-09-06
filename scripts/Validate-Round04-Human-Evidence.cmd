@echo off
setlocal
set "OBSERVER_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%OBSERVER_DIR%VALIDATE-HUMAN-EVIDENCE.ps1" -ResultPath "%OBSERVER_DIR%OBSERVATION-RESULT.json" -EvidenceRoot "%OBSERVER_DIR%evidence" -CandidatePath "%OBSERVER_DIR%..\participant\AI-Game-Studio-0.3.0-preview.1-scene-ux-fix-win-x64.zip" -ProofPath "%OBSERVER_DIR%ACCEPTANCE-PROOF.json"
exit /b %errorlevel%
