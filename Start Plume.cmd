@echo off
rem Port Alder 1.1.0 (Plume XPU Console). Double-click to open Port Alder in VEC1 Design Photon. It needs Python 3.10 or newer.
rem   "Start Plume.cmd"                       Port Alder
rem   "Start Plume.cmd" index.html            the console (also simmy.html, show.html, verify.html)
rem   "Start Plume.cmd" check3d.html          what this GPU and browser offer the 3D view, step by step
rem   "Start Plume.cmd" city.html browser   Python only, in your default browser instead of Photon's window
rem   "Start Plume.cmd" city.html node      Node.js (serve.mjs) instead of Photon, where Node.js works
rem The Python host (host\plume_photon.py) serves the pages on 127.0.0.1 with cross-origin isolation, so Wasm
rem threads work, and opens them in Design Photon's verified window (an isolated Edge or Chrome). Photon is looked
rem for in PHOTON_HOME, else in Desktop\Project12k\languages\Photon-main\Photon-main, then C:\VEC1. If only its zip
rem is there, the host offers to extract it to C:\VEC1\DesignPhoton: Photon's own README asks for a short path,
rem and a copy extracted deep under Desktop can come out incomplete.
setlocal EnableExtensions
set "HERE=%~dp0"
set "PAGE=%~1"
if not defined PAGE set "PAGE=city.html"
set "MODE=%~2"
if not defined PHOTON_HOME if exist "%USERPROFILE%\Desktop\Project12k\languages\Photon-main\Photon-main\" set "PHOTON_HOME=%USERPROFILE%\Desktop\Project12k\languages\Photon-main\Photon-main"
if /i "%MODE%"=="node" goto node
call :find_python
if errorlevel 1 goto nopython
set "OPTS="
if /i "%MODE%"=="browser" set "OPTS=--no-photon"
%PY% -B "%HERE%host\plume_photon.py" --page "%PAGE%" %OPTS%
if errorlevel 4 goto failed
if errorlevel 3 goto browser
if errorlevel 1 goto failed
endlocal & exit /b 0

:browser
echo.
echo Design Photon was not found or not extracted here, so the pages open in your default browser instead.
%PY% -B "%HERE%host\plume_photon.py" --page "%PAGE%" --no-photon
if errorlevel 1 goto failed
endlocal & exit /b 0

:nopython
echo Plume opens in VEC1 Design Photon, which runs on Python 3.10 or newer, and no such Python was found
echo (checked: py -3, python, python3).
echo Install Python from https://www.python.org/downloads/ (tick "Add python.exe to PATH"), then double-click
echo this file again. Meanwhile dist\plume-port-alder.html opens in Edge or Chrome as it is (one thread, and
echo procedural surfaces without the shards).
pause
endlocal & exit /b 1

:failed
pause
endlocal & exit /b 1

:node
rem Node.js only when asked for. PLUME_NODE and PLUME_BLANK, when set, name another node.exe and another JA21
rem Blank Console folder.
set "BLANK=C:\Users\russe\Downloads\unzipped\BLANK"
if defined PLUME_BLANK set "BLANK=%PLUME_BLANK%"
set "NODE=C:\Users\russe\Desktop\bytefoundry-0.99.2-win64\node-v22.23.4-win-x64\node.exe"
if defined PLUME_NODE set "NODE=%PLUME_NODE%"
if not exist "%NODE%" set "NODE="
if not defined NODE for %%X in (node.exe) do if not "%%~$PATH:X"=="" set "NODE=%%~$PATH:X"
if not defined NODE goto nonode
start "Plume XPU server" /min "%NODE%" "%HERE%serve.mjs"
timeout /t 1 /nobreak >nul
if exist "%BLANK%\host\Start-Console.ps1" (
  powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%BLANK%\host\Start-Console.ps1" -StartUrl "http://127.0.0.1:8788/%PAGE%"
) else (
  start "" "http://127.0.0.1:8788/%PAGE%"
)
endlocal & exit /b 0

:nonode
echo Node.js was not found. Run "Start Plume.cmd" without "node" to use Design Photon (Python 3.10 or newer).
pause
endlocal & exit /b 1

rem the first of py -3, python and python3 that is Python 3.10 or newer (the Microsoft Store's python.exe
rem placeholder fails the test, as do older versions)
:find_python
set "PY="
where py >nul 2>nul && (py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=py -3")
if defined PY exit /b 0
where python >nul 2>nul && (python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python")
if defined PY exit /b 0
where python3 >nul 2>nul && (python3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul && set "PY=python3")
if defined PY exit /b 0
exit /b 1
