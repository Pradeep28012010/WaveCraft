; Custom NSIS initialization for WaveCraft Pro Liquid Glass Setup Studio

!macro customInit
  ; Hide the retro Win32 progress dialog so the user gets an instant, modern experience
  ShowWindow $HWNDPARENT 0
!macroend

!macro customFinishPage
  ${if} ${isUpdated}
    StrCpy $1 "--updated"
  ${else}
    StrCpy $1 "--setup"
  ${endif}
  ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
!macroend
