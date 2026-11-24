; =============================================================================
; Nexus Autonomous Agent - NSIS Windows Installer & Uninstaller Template
; =============================================================================

!define APP_NAME "Nexus Autonomous Agent"
!define APP_VERSION "2.2.0"
!define APP_PUBLISHER "NiranX"
!define APP_EXE "Nexus.exe"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "..\release_binaries\Nexus-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\Nexus"
RequestExecutionLevel user

; Pages
Page directory
Page instfiles

UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "..\Nexus-desktop-\dist\*.*"
  File "..\scripts\uninstall_hook.py"

  ; Create uninstaller executable
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Registry entries for Add/Remove Programs
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusAIAgent" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusAIAgent" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusAIAgent" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusAIAgent" "DisplayVersion" "${APP_VERSION}"

  ; Start Menu & Desktop Shortcuts
  CreateShortcut "$DESKTOP\Nexus AI Agent.lnk" "$INSTDIR\${APP_EXE}"
  CreateDirectory "$SMPROGRAMS\Nexus"
  CreateShortcut "$SMPROGRAMS\Nexus\Nexus AI Agent.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\Nexus\Uninstall.lnk" "$INSTDIR\uninstall.exe"
SectionEnd

; =============================================================================
; Uninstaller Callbacks & Section
; =============================================================================

Function un.onInit
  ; Native MessageBox querying user data export before commencing uninstallation
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Nexus Agent Uninstallation: Would you like to export all projects, chat traces, and local memory data first?" \
    IDNO SkipExport

  DetailPrint "Triggering local data sovereignty export..."
  ExecWait 'python "$INSTDIR\scripts\uninstall_hook.py" --auto'

SkipExport:
FunctionEnd

Section "Uninstall"
  ; Step 1: Remove Shortcuts
  Delete "$DESKTOP\Nexus AI Agent.lnk"
  RMDir /r "$SMPROGRAMS\Nexus"

  ; Step 2: Remove Installed Files
  RMDir /r "$INSTDIR"

  ; Step 3: Remove Registry Key
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\NexusAIAgent"
SectionEnd
