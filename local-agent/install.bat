@echo off
REM OpenAsst Local Agent Installation Script (Windows)

echo.
echo   ========================================
echo      OpenAsst Local Agent Installer
echo   ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [Error] Node.js not found, please install Node.js first
    echo   Visit: https://nodejs.org/
    pause
    exit /b 1
)

set INSTALL_DIR=%USERPROFILE%\.openasst

echo [1/3] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [2/3] Downloading agent...
curl -fsSL "https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/agent.js" -o "%INSTALL_DIR%\agent.js"

echo [3/3] Creating startup script...
echo @echo off > "%INSTALL_DIR%\start.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\start.bat"
echo node agent.js >> "%INSTALL_DIR%\start.bat"

echo.
echo   Installation complete!
echo.
echo   Start agent: %INSTALL_DIR%\start.bat
echo.

set /p START="Start agent now? [Y/n] "
if /i "%START%"=="n" goto :end
call "%INSTALL_DIR%\start.bat"

:end
