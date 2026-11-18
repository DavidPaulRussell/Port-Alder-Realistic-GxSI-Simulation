@echo off
rem Verifies .russ files in the console's own verifier, in VEC1 Design Photon's window (Python 3.10 or newer).
rem Drag .russ files onto this file, or run: "Verify R files.cmd" plume-r1.russ
rem Without Python: node tools\verify_r.mjs file.russ ..., or drop the files on the Verify R files page.
setlocal EnableExtensions
if not defined PHOTON_HOME if exist "%USERPROFILE%\Desktop\Project12k\languages\Photon-main\Photon-main\" set "PHOTON_HOME=%USERPROFILE%\Desktop\Project12k\languages\Photon-main\Photon-main"
if "%~1"=="" (
  echo Drag .russ files onto this file, or run: "Verify R files.cmd" file.russ ...
  pause
  endlocal & exit /b 2
)
call :find_python
if errorlevel 1 (
  echo Python 3.10 or newer was not found ^(checked: py -3, python, python3^). Install it from https://www.python.org/downloads/
  echo or run: node tools\verify_r.mjs file.russ ...
  pause
  endlocal & exit /b 1
)
%PY% -B "%~dp0host\plume_photon.py" --verify %*
if errorlevel 4 goto done
if errorlevel 3 %PY% -B "%~dp0host\plume_photon.py" --verify %* --no-photon
:done
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%

:find_python
set "PY="
where py >nul 2>nul && (py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3")
if defined PY exit /b 0
where python >nul 2>nul && (python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python")
if defined PY exit /b 0
where python3 >nul 2>nul && (python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python3")
if defined PY exit /b 0
exit /b 1
