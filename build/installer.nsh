; Custom NSIS initialization for WaveCraft Pro Seamless Installer & Updater

!macro customInit
  ; Force terminate all active and background child processes of WaveCraft Pro before anything else
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Stop-Process -Name 'WaveCraft Pro', 'wavecraft' -Force -ErrorAction SilentlyContinue"`
  Sleep 1200
!macroend

!macro customCheckAppRunning
  ; Ensure process tree is completely terminated so no files remain locked
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Stop-Process -Name 'WaveCraft Pro', 'wavecraft' -Force -ErrorAction SilentlyContinue"`
  Sleep 1000
!macroend

!macro customUnInit
  ; Ensure uninstaller also terminates running processes cleanly
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  Sleep 500
!macroend

!macro customUnInstallCheck
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend
