!macro customInstall
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Publisher" "GhosterAI"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "Comments" "GhosterNet — DPI Bypass & Telegram WS Proxy"
  WriteRegStr SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayIcon" "$INSTDIR\resources\icon.ico"

  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "URLInfoAbout"
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "HelpLink"
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "URLUpdateInfo"

  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "VersionMajor"
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "VersionMinor"
  DeleteRegValue SHCTX "${UNINSTALL_REGISTRY_KEY}" "Version"
!macroend

!macro customUnInstall
  IfFileExists "$INSTDIR\.ghosternet-upgrade" ghosternet_skip_wipe 0
  IfFileExists "$INSTDIR\.slipgate-upgrade" ghosternet_skip_wipe 0

  nsExec::ExecToLog 'taskkill /F /IM GhosterNet.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM TgWsProxy_windows.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM winws.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM elevate.exe /T'
  Sleep 500

  nsExec::ExecToLog 'schtasks /delete /tn "GhosterNet Auto Start" /f'
  nsExec::ExecToLog 'schtasks /delete /tn "GhosterNetAutoStart" /f'

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "GhosterNet"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "GhosterNet"

  DeleteRegKey HKCR "ghosternet"
  DeleteRegKey HKCR "tg-ws"
  DeleteRegKey HKCU "Software\Classes\ghosternet"
  DeleteRegKey HKCU "Software\Classes\tg-ws"

  SetShellVarContext current
  RMDir /r "$APPDATA\ghosternet"
  RMDir /r "$LOCALAPPDATA\ghosternet"
  RMDir /r "$APPDATA\ghosternet-dev"
  RMDir /r "$LOCALAPPDATA\ghosternet-dev"
  SetShellVarContext all

  StrCpy $0 "$PROFILE\.."
  FindFirst $1 $2 "$0\*"
  user_loop:
    StrCmp $2 "" user_done
    StrCmp $2 "."         user_next
    StrCmp $2 ".."        user_next
    StrCmp $2 "Public"    user_next
    StrCmp $2 "Default"   user_next
    StrCmp $2 "Default User" user_next
    StrCmp $2 "All Users" user_next
    RMDir /r "$0\$2\AppData\Roaming\ghosternet"
    RMDir /r "$0\$2\AppData\Local\ghosternet"
    RMDir /r "$0\$2\AppData\Roaming\ghosternet-dev"
    RMDir /r "$0\$2\AppData\Local\ghosternet-dev"
  user_next:
    FindNext $1 $2
    Goto user_loop
  user_done:
  FindClose $1

  RMDir /r "$INSTDIR"

  ghosternet_skip_wipe:
!macroend
