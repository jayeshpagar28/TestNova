@echo off
REM ==========================================================================
REM  TestNova - one-click setup and start (Windows)
REM
REM    start.bat              install whatever is missing, then start TestNova
REM    start.bat --reinstall  reinstall all dependencies, then start
REM
REM  Requires Node.js 22.12+ (offers to install it with winget if missing).
REM  Opens the dashboard at http://localhost:5180 (API on 127.0.0.1:5181).
REM  Press Ctrl+C in this window to stop it.
REM ==========================================================================
setlocal EnableExtensions
cd /d "%~dp0"
title TestNova

set "REINSTALL="
if /i "%~1"=="--reinstall" set "REINSTALL=1"

echo.
echo  ==== TestNova setup ====
echo.

REM ---- 1. Node.js (22.12+ required by Vite 8) -------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo  [!] Node.js is not installed.
  where winget >nul 2>&1
  if errorlevel 1 (
    echo      Install Node.js 22 LTS or newer from https://nodejs.org and run start.bat again.
    goto :fail
  )
  echo      Installing Node.js LTS with winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  [i] Node.js installed. Close this window and run start.bat again so the new PATH is picked up.
  goto :fail
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)"
if errorlevel 1 (
  for /f %%v in ('node -v') do echo  [!] Node.js %%v is too old. Install Node.js 22 LTS or newer from https://nodejs.org
  goto :fail
)
for /f %%v in ('node -v') do echo  [ok] Node.js %%v

REM ---- 2. Root dependencies (Playwright, Agent SDK, Supabase, ...) ---------
if defined REINSTALL if exist node_modules rmdir /s /q node_modules
if not exist node_modules (
  echo  [..] Installing root dependencies...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo  [ok] Root dependencies already installed
)

REM ---- 3. Dashboard web dependencies (React, Vite) --------------------------
if defined REINSTALL if exist dashboard\web\node_modules rmdir /s /q dashboard\web\node_modules
if not exist dashboard\web\node_modules (
  echo  [..] Installing dashboard dependencies...
  call npm --prefix dashboard/web install
  if errorlevel 1 goto :fail
) else (
  echo  [ok] Dashboard dependencies already installed
)

REM ---- 4. Playwright browsers -----------------------------------------------
if not exist .testnova mkdir .testnova
if defined REINSTALL if exist .testnova\browsers-installed del .testnova\browsers-installed
if not exist .testnova\browsers-installed (
  echo  [..] Installing Playwright browsers ^(Chromium, Firefox, WebKit^)...
  call npx playwright install chromium firefox webkit
  if errorlevel 1 goto :fail
  echo done> .testnova\browsers-installed
) else (
  echo  [ok] Playwright browsers already installed
)

REM ---- 5. .env --------------------------------------------------------------
if not exist .env (
  copy /y .env.example .env >nul
  echo  [ok] Created .env from .env.example ^(fill in Supabase keys if you use them^)
) else (
  echo  [ok] .env present
)

REM ---- 6. Optional tools: warn only -----------------------------------------
where claude >nul 2>&1
if errorlevel 1 (
  echo  [!] Claude Code CLI not found. The dashboard works, but the AI Pipeline needs it:
  echo        npm install -g @anthropic-ai/claude-code
  echo        claude      ^(sign in once^)
) else (
  echo  [ok] Claude Code CLI found
)
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=1"
if not defined CHROME (
  echo  [!] Google Chrome not found. PDF reports need it: install Chrome, or run
  echo        npx playwright install chrome
) else (
  echo  [ok] Google Chrome found
)

REM ---- 7. Start -------------------------------------------------------------
REM TESTNOVA_WEB_PORT / TESTNOVA_PORT move the page / API; TESTNOVA_NO_OPEN=1 skips opening the browser.
if not defined TESTNOVA_WEB_PORT set "TESTNOVA_WEB_PORT=5180"
echo.
echo  ==== Starting TestNova ====
echo  Dashboard: http://localhost:%TESTNOVA_WEB_PORT%     (Ctrl+C to stop)
echo.
REM Open the browser once the page has had time to come up.
if not defined TESTNOVA_NO_OPEN start "" /b cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:%TESTNOVA_WEB_PORT%"
call npm run dashboard
goto :eof

:fail
echo.
echo  Setup stopped. Fix the problem above and run start.bat again.
pause
exit /b 1
