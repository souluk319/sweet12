@echo off
setlocal

set "APP_DIR=%~dp0"
set "WEB_URL=http://127.0.0.1:5173/"
set "API_URL=http://127.0.0.1:8788/api/health"

cd /d "%APP_DIR%"

call :check_api
if errorlevel 1 (
  echo Starting SWEET12...
  start "SWEET12 Dev Server" cmd /k "cd /d ""%APP_DIR%"" && npm run dev"
) else (
  echo SWEET12 is already running.
)

echo Waiting for dashboard...
for /l %%i in (1,1,90) do (
  call :check_web
  if not errorlevel 1 (
    echo Opening %WEB_URL%
    start "" "%WEB_URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo Dashboard did not respond in time. Opening browser anyway.
start "" "%WEB_URL%"
exit /b 1

:check_api
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%API_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%

:check_web
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%WEB_URL%' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
exit /b %errorlevel%
