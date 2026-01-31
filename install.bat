@echo off
REM OpenAsst CLI Installer for Windows CMD
REM Usage: curl -fsSL https://raw.githubusercontent.com/abingyyds/OpenAsst/main/install.bat -o install.bat && install.bat

setlocal enabledelayedexpansion

echo.
echo   ___                    _            _
echo  / _ \ _ __   ___ _ __  / \   ___ ___^| ^|_
echo ^| ^| ^| ^| '_ \ / _ \ '_ \/ _ \ / __/ __^| __^|
echo ^| ^|_^| ^| ^|_) ^|  __/ ^| ^| ^|_^| ^\^| __ \__ \ ^|_
echo  \___/^| .__/ \___^|_^| ^|_\___/ ^|___/___/\__^|
echo       ^|_^|
echo.
echo AI-powered terminal assistant
echo.

echo [INFO] Starting OpenAsst installation...
echo.

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Node.js not found!
    echo Please install Node.js from: https://nodejs.org
    echo Then run this script again.
    pause
    exit /b 1
)
echo [OK] Node.js found

REM Check for Git
where git >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] Git not found!
    echo Please install Git from: https://git-scm.com
    echo Then run this script again.
    pause
    exit /b 1
)
echo [OK] Git found
echo.

REM Set install directory
set INSTALL_DIR=%USERPROFILE%\.openasst

REM Remove old installation
if exist "%INSTALL_DIR%" (
    echo [WARN] Existing installation found, updating...
    rmdir /s /q "%INSTALL_DIR%"
)

REM Clone repository
echo [INFO] Downloading OpenAsst...
git clone --depth 1 https://github.com/abingyyds/OpenAsst.git "%INSTALL_DIR%"
echo [OK] Downloaded
echo.

REM Install dependencies
echo [INFO] Installing dependencies...
cd /d "%INSTALL_DIR%\cli"
call npm install --silent
echo [OK] Dependencies installed
echo.

REM Build
echo [INFO] Building...
call npm run build --silent
echo [OK] Build complete
echo.

REM Create global command
echo [INFO] Creating command...
call npm link --silent
echo [OK] Command 'openasst' created
echo.

echo ========================================
echo   OpenAsst installed successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Configure API key:
echo      openasst config
echo.
echo   2. Start using:
echo      openasst do "your task here"
echo.
echo   3. Get help:
echo      openasst --help
echo.

pause
