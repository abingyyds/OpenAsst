@echo off
REM OpenAsst Local Agent 安装脚本 (Windows)

echo.
echo   ========================================
echo      OpenAsst Local Agent 安装程序
echo   ========================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    echo   访问: https://nodejs.org/
    pause
    exit /b 1
)

set INSTALL_DIR=%USERPROFILE%\.openasst

echo [1/3] 创建安装目录...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [2/3] 下载代理程序...
curl -fsSL "https://raw.githubusercontent.com/abingyyds/OpenAsst/main/local-agent/agent.js" -o "%INSTALL_DIR%\agent.js"

echo [3/3] 创建启动脚本...
echo @echo off > "%INSTALL_DIR%\start.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\start.bat"
echo node agent.js >> "%INSTALL_DIR%\start.bat"

echo.
echo   安装完成！
echo.
echo   启动代理: %INSTALL_DIR%\start.bat
echo.

set /p START="是否立即启动代理? [Y/n] "
if /i "%START%"=="n" goto :end
call "%INSTALL_DIR%\start.bat"

:end
