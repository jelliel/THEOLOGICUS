@echo off
chcp 65001 >nul
setlocal EnableExtensions
title THEOLOGICUS - Build complet (exe + installeur + signature)
cd /d "%~dp0"

set "SIGNTOOL=C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
set "PFX=THEOLOGICUS_signing.pfx"
set "PFP=theologicus2026"
set "PY=py -3.12"
rem Version = nombre de commits, comme l APK (le fichier VERSION racine
rem est perime a 1.0.10 : sans ça l exe s annonce 1.0.10).
set "VER=2.0.0"
for /f %%i in ('git rev-list --count HEAD 2^>nul') do set "VER=2.0.%%i"

echo [1/5] Compilation de l'exe (PyInstaller)...
%PY% -m PyInstaller --noconfirm --clean --windowed --name THEOLOGICUS --icon THEOLOGICUS.ico --hidden-import webview.platforms.winforms --hidden-import webview.platforms.edgechromium --hidden-import clr_loader --hidden-import pythonnet --collect-all webview --collect-all pythonnet --collect-all clr_loader app.py || goto :err

echo [2/5] Copie des fichiers de donnees...
copy /y THEOLOGICUS.html dist\THEOLOGICUS\ >nul || goto :err
rem v33 : corpus decoupes — bible par livre (bible\b*.js), quran par sourate
rem (quran\q*.js), tafsir par sourate (tafsir\s*.js) + index.js ; les monolithes
rem ne sont plus expudies.
rem TOUS les corpus locaux (les memes que dans l APK) : sans eux les cinq
rem onglets de bibliotheque et la Somme renvoient 404 dans l exe.
for %%d in (bible quran tafsir summa summafr fathers reformed orthodox islamic denzinger quranwbw quranroots biblehb biblegr) do (
  if not exist "dist\THEOLOGICUS\%%d" mkdir "dist\THEOLOGICUS\%%d"
  copy /y %%d\*.js dist\THEOLOGICUS\%%d\ >nul || goto :err
  copy /y %%d\*.json dist\THEOLOGICUS\%%d\ >nul 2>&1
)
copy /y tafsir\index.json dist\THEOLOGICUS\tafsir\ >nul || goto :err
del /q dist\THEOLOGICUS\bible_data.js 2>nul
del /q dist\THEOLOGICUS\quran_data.js 2>nul
copy /y THEOLOGICUS.ico dist\THEOLOGICUS\ >nul
rem Libs locales (pdf.js, mammoth, jszip, jspdf, html2canvas + polices) : demarrage 100%% hors-ligne
if not exist "dist\THEOLOGICUS\libs" mkdir "dist\THEOLOGICUS\libs"
copy /y libs\*.js dist\THEOLOGICUS\libs\ >nul
if not exist "dist\THEOLOGICUS\libs\fonts" mkdir "dist\THEOLOGICUS\libs\fonts"
copy /y libs\fonts\*.css dist\THEOLOGICUS\libs\fonts\ >nul
copy /y libs\fonts\*.woff2 dist\THEOLOGICUS\libs\fonts\ >nul

rem Cle API : l'installeur est toujours distribue SANS cle.
rem Le fichier dist\THEOLOGICUS\theologicus_keys.json est remis a vide
rem a chaque build — les destinataires collent leur propre cle dans l'app.
rem (Votre cle de developpement reste dans .\theologicus_keys.json.)
py -3.12 -c "import json; json.dump({'mistral': ''}, open('dist/THEOLOGICUS/theologicus_keys.json', 'w', encoding='utf-8'), indent=2)" || goto :err

rem v40 : tampon de version (VERSION -> HTML + version.txt dans dist)
py -3.12 tools\stamp_version.py dist\THEOLOGICUS %VER% || goto :err

echo [3/5] Signature de l'exe...
if exist "%SIGNTOOL%" (
  "%SIGNTOOL%" sign /f %PFX% /p %PFP% /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com "dist\THEOLOGICUS\THEOLOGICUS.exe" || goto :err
) else (
  echo [!] signtool introuvable - exe NON SIGNE
)

echo [4/5] Compilation de l'installeur (Inno Setup)...
if exist "%ISCC%" (
  "%ISCC%" installer.iss /DMyAppVersion=%VER% || goto :err
) else (
  echo [!] ISCC introuvable - installeur non compile
  goto :err
)

echo [5/5] Signature de l'installeur...
if exist "%SIGNTOOL%" (
  "%SIGNTOOL%" sign /f %PFX% /p %PFP% /fd SHA256 /td SHA256 /tr http://timestamp.digicert.com "dist\THEOLOGICUS-Setup-x64.exe" || goto :err
) else (
  echo [!] signtool introuvable - installeur NON SIGNE
)

rem [6/6] Copie des livrables dans output\
if not exist "output" mkdir "output"
copy /y "dist\THEOLOGICUS\THEOLOGICUS.exe" "output\" >nul || goto :err
copy /y "dist\THEOLOGICUS-Setup-x64.exe" "output\" >nul || goto :err

echo.
echo ============================================
echo  [OK] Build termine :
echo    dist\THEOLOGICUS-Setup-x64.exe
echo    output\THEOLOGICUS.exe + output\THEOLOGICUS-Setup-x64.exe

echo ============================================
pause
goto :eof

:err
echo.
echo [X] Echec du build.
pause
