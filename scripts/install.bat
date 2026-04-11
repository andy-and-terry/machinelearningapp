@echo off
REM ============================================================
REM  Local ML Platform – Windows Installer
REM  Double-click this file to run the PowerShell installer.
REM ============================================================

echo.
echo  Local ML Platform Installer
echo  ============================
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [ERROR] PowerShell is not available on this system.
    echo          Please install PowerShell and try again.
    echo          https://docs.microsoft.com/en-us/powershell/
    pause
    exit /b 1
)

REM Get the directory of this batch file
set "SCRIPT_DIR=%~dp0"

echo  Starting PowerShell installer…
echo  (If prompted by User Account Control, click Yes)
echo.

REM Run the PowerShell installer, bypassing execution policy for this session only
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install.ps1" %*

set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
    echo  [OK] Installation completed successfully.
) else (
    echo  [!!] Installation finished with warnings or errors (exit code: %EXIT_CODE%).
    echo       Check the output above for details.
)

echo.
pause
exit /b %EXIT_CODE%
