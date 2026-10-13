@echo off
setlocal EnableExtensions

rem Launch the two local services from the Windows desktop session.
set "STRIDE_ROOT=%~dp0"
set "STRIDE_BACKEND=%STRIDE_ROOT%backend"
set "STRIDE_FRONTEND=%STRIDE_ROOT%frontend"
set "STRIDE_PYTHON=%STRIDE_BACKEND%\.venv\Scripts\python.exe"
set "STRIDE_NEEDS_SEED=0"

if not exist "%STRIDE_BACKEND%\db.sqlite3" set "STRIDE_NEEDS_SEED=1"

if not exist "%STRIDE_PYTHON%" (
  echo Creating the backend virtual environment...
  py -3.13 -m venv "%STRIDE_BACKEND%\.venv"
  if errorlevel 1 goto :failure
)

"%STRIDE_PYTHON%" -c "import django" >nul 2>&1
if errorlevel 1 (
  echo Installing backend dependencies...
  "%STRIDE_PYTHON%" -m pip install --upgrade pip
  if errorlevel 1 goto :failure
  "%STRIDE_PYTHON%" -m pip install -r "%STRIDE_BACKEND%\requirements.txt"
  if errorlevel 1 goto :failure
)

echo Applying backend migrations...
"%STRIDE_PYTHON%" "%STRIDE_BACKEND%\manage.py" migrate
if errorlevel 1 goto :failure

if "%STRIDE_NEEDS_SEED%"=="1" (
  echo Loading the local demo catalog...
  "%STRIDE_PYTHON%" "%STRIDE_BACKEND%\manage.py" seed_data
  if errorlevel 1 goto :failure
)

if not exist "%STRIDE_FRONTEND%\node_modules" (
  echo Installing frontend dependencies...
  pushd "%STRIDE_FRONTEND%"
  call npm ci
  set "STRIDE_NPM_STATUS=%ERRORLEVEL%"
  popd
  if not "%STRIDE_NPM_STATUS%"=="0" goto :failure
)

if not exist "%STRIDE_FRONTEND%\.env" copy /Y "%STRIDE_FRONTEND%\.env.example" "%STRIDE_FRONTEND%\.env" >nul

start "STRIDE API" /d "%STRIDE_ROOT%" cmd /k ""%STRIDE_PYTHON%" "%STRIDE_BACKEND%\manage.py" runserver 127.0.0.1:8000 --noreload"
start "STRIDE Storefront" /d "%STRIDE_FRONTEND%" cmd /k "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort"

echo.
echo STRIDE is starting in two terminal windows.
echo Open http://localhost:5173 after both windows report that they are ready.
exit /b 0

:failure
echo.
echo STRIDE could not start. Review the error above, then see README.md for manual setup.
pause
exit /b 1
