; Custom NSIS initialization for WaveCraft Pro Seamless Installer & Updater

!macro customInit
  ; Terminate any running or background tray instance of WaveCraft Pro before anything else
  nsExec::Exec 'taskkill /F /IM "WaveCraft Pro.exe"'
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1000
!macroend

!macro customCheckAppRunning
  ; Ensure no file-locking processes remain alive
  nsExec::Exec 'taskkill /F /IM "WaveCraft Pro.exe"'
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"'
  Sleep 1000
!macroend

!macro customUnInstallCheck
  ; Seamlessly allow update to proceed even if prior version uninstaller reported a non-critical exit code
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend
