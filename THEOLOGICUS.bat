@echo off
chcp 65001 >nul
setlocal EnableExtensions
title THEOLOGICUS - Auto-install + Proxy
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo [THEOLOGICUS] Verification de l'environnement Python...
echo.

set "PYTHON_RUN="
set "PY_INSTALLED=0"

:: ============================================================
:: 1) DETECTION : Python 3.12+ deja installe ?
:: ============================================================

py -3.12 --version >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_RUN=py -3.12"
  goto :PY_FOUND
)

py -3 -c "import sys;sys.exit(0 if sys.version_info^>=(3,12) else 1)" >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_RUN=py -3"
  goto :PY_FOUND
)

python -c "import sys;sys.exit(0 if sys.version_info^>=(3,12) else 1)" >nul 2>&1
if not errorlevel 1 (
  set "PYTHON_RUN=python"
  goto :PY_FOUND
)

:: ============================================================
:: 2) INSTALLATION AUTOMATIQUE
:: ============================================================
:PY_INSTALL
echo.
echo [!] Python 3.12 introuvable. Installation automatique...
echo.

where winget >nul 2>&1
if not errorlevel 1 (
  echo [*] winget disponible - installation de Python 3.12...
  winget install Python.Python.3.12 --silent --scope user --accept-package-agreements --accept-source-agreements --no-interaction >nul 2>&1
  if not errorlevel 1 (
    set "PY_INSTALLED=1"
    echo [OK] Python installe via winget.
  )
)

if "%PY_INSTALLED%"=="0" (
  set "PYEXE=%TEMP%\python-3.12.10-amd64.exe"
  echo [*] Telechargement de Python 3.12.10...
  curl.exe -L -o "%PYEXE%" "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe" >nul 2>&1
  if exist "%PYEXE%" (
    echo [*] Installation silencieuse...
    "%PYEXE%" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0
    set "PY_INSTALLED=1"
  ) else (
    echo [X] Echec du telechargement.
    goto :FATAL
  )
)

echo [*] Actualisation du PATH...
call :REFRESH_PATH
py -3.12 --version >nul 2>&1
if not errorlevel 1 ( set "PYTHON_RUN=py -3.12" & goto :PY_FOUND )
python -c "import sys;sys.exit(0)" >nul 2>&1
if not errorlevel 1 ( set "PYTHON_RUN=python" & goto :PY_FOUND )
echo [X] Python introuvable. Redemarrez le PC.
goto :FATAL

:: ============================================================
:: 3) Python pret
:: ============================================================
:PY_FOUND
echo.
echo [OK] Python pret : %PYTHON_RUN%
echo.

:: ============================================================
:: 4) Demarrage du proxy
:: ============================================================
:PROXY_START
echo.
echo [THEOLOGICUS] Demarrage du proxy...
echo.
:: Liberer le port 8765 s'il est deja occupe par un relais perime : sinon le
:: nouveau proxy echoue a s'attacher et l'ancien (sans ai-video.html) continue
:: de servir -> iframe AI VIDEO vide. On tue le processus en ecoute, jamais
:: le notre.
powershell -NoProfile -Command "try { (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction Stop).OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}"
start "TheologicusProxy" /min %PYTHON_RUN% "%SCRIPT_DIR%proxy_server.py"
ping -n 3 127.0.0.1 >nul 2>&1

if not defined THEOLOGICUS_NO_BROWSER start http://localhost:8765/THEOLOGICUS.html

echo.
echo ============================================
echo   THEOLOGICUS - Services demarres
echo ============================================
echo [OK] Proxy          : http://localhost:8765
echo.
echo La fenetre se minimise dans 5 secondes...
echo (clique sur l'icone dans la barre des taches pour la re-afficher)
echo.
timeout /t 5 >nul
powershell -NoProfile -Command "Add-Type -Name Win -Namespace Native -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);'; [Native.Win]::ShowWindow([System.Diagnostics.Process]::GetCurrentProcess().MainWindowHandle, 6)"
if not defined THEOLOGICUS_NO_PAUSE pause
goto :eof

:: ============================================================
:: Fatal
:: ============================================================
:FATAL
echo.
echo Impossible de demarrer THEOLOGICUS automatiquement.
echo Installez Python 3.12 : https://www.python.org/downloads/
echo.
pause
goto :eof

:: ============================================================
:: Sous-routine : recharger le PATH
:: ============================================================
:REFRESH_PATH
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "UPATH=%%b"
for /f "tokens=2*" %%b in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SPATH=%%b"
set "PATH=%UPATH%;%SPATH%"
goto :eof
