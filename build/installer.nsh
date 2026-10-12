; Custom NSIS Modern Setup & Updater for WaveCraft Pro

!macro customHeader
  ; Run extraction silently and instantly without the retro 1995 Win32 SpiderBanner dialog
  SilentInstall silent
!macroend

!macro customInit
  ; 1. Force terminate all running and background instances of WaveCraft Pro
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "Stop-Process -Name 'WaveCraft Pro', 'wavecraft' -Force -ErrorAction SilentlyContinue"`

  ; 2. Clear UninstallString from registry so NSIS skips invoking the old uninstaller executable during updates
  ; This completely resolves the Windows uninstaller file-rename lock (Exit Code 2) and eliminates "WaveCraft Pro cannot be closed"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\04a4a016-097e-5d7b-898d-f2ec3bb184da" "UninstallString"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\04a4a016-097e-5d7b-898d-f2ec3bb184da" "QuietUninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\04a4a016-097e-5d7b-898d-f2ec3bb184da" "UninstallString"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\04a4a016-097e-5d7b-898d-f2ec3bb184da" "QuietUninstallString"
  !ifdef UNINSTALL_REGISTRY_KEY
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    DeleteRegValue HKLM "${UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
  !endif

  ; 3. Clean up any existing uninstaller binary from prior installations
  Delete "$INSTDIR\Uninstall WaveCraft Pro.exe"
  Delete "$LOCALAPPDATA\Programs\wavecraft\Uninstall WaveCraft Pro.exe"

  ClearErrors
!macroend

!macro customCheckAppRunning
  ; Silently ensure no processes lock destination binaries
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  Sleep 300
!macroend

!macro customInstall
  ; Launch the modern Liquid Glass Setup Studio Launcher after silent extraction
  Exec `"$INSTDIR\WaveCraft Pro.exe" --setup`
!macroend

!macro customUnInit
  ; Ensure uninstaller terminates running instances cleanly
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /T /IM "WaveCraft Pro.exe" /IM "wavecraft.exe"`
  Sleep 300
!macroend

!macro customUnInstallCheck
  ClearErrors
  StrCpy $R0 0
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
  StrCpy $R0 0
!macroend
