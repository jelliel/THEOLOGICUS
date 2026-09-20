; ============================================================================
;  THEOLOGICUS — Installeur Windows (Inno Setup 6)
;  Compile avec : ISCC.exe installer.iss
;  Sortie       : dist/THEOLOGICUS-Setup-x64.exe
; ============================================================================

#define MyAppName "THEOLOGICUS"
; Version : peut etre injectee a la compilation (ISCC /DMyAppVersion=2.0.NN).
; Sans injection, la valeur par defaut ci-dessous s'applique.
#ifndef MyAppVersion
  #define MyAppVersion "2.0.69"
#endif
#define MyAppPublisher "THEOLOGICUS"
#define MyAppExeName "THEOLOGICUS.exe"

[Setup]
; GUID fixe : identifie l'application pour mise a jour / desinstallation
AppId={{7C1E2A44-3A5B-4C8D-9E2F-1B6D0A8F5E31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayName={#MyAppName} — Assistant theologique IA
; Installation par utilisateur : pas de droits admin, pas de prompt UAC
PrivilegesRequired=lowest
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=THEOLOGICUS-Setup-x64
SetupIconFile=THEOLOGICUS.ico
; Ne supprime PAS les donnees utilisateur (historique de chat, WebView2)
UninstallFilesDir={app}\unins

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
; Contenu complet du dossier distribuable (exe + runtime + donnees)
Source: "dist\THEOLOGICUS\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; Menu Demarrer
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\THEOLOGICUS.ico"
Name: "{group}\Désinstaller {#MyAppName}"; Filename: "{uninstallexe}"
; Bureau (case decochee par defaut)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\THEOLOGICUS.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
; Lancement optionnel a la fin de l'installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Nettoie le dossier d'installation residuel (logs), sans toucher aux donnees utilisateur
Type: files; Name: "{app}\THEOLOGICUS.log"
