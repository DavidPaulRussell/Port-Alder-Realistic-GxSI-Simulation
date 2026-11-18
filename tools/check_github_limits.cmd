@echo off
:: check_github_limits.cmd - the GitHub size contract, checked natively in cmd.exe.
:: SPDX-License-Identifier: GPL-3.0-only
::   tools\check_github_limits.cmd [REPO]
:: Refuses any file of 25,000,000 bytes or more (warns over 22,500,000), a payload (the tree outside .git)
:: over 1,000,000,000 bytes (warns over 985,000,000), and a .git\objects over 1,000,000,000 bytes: what GitHub
:: stores. The two are checked separately, not added: the tree is a checked-out copy of the same content.
:: Sizes are summed in kilobytes so set /a never overflows. If Python is present, the full check (shard
:: manifest, SHA-256 seals) runs too: tools\check_github_limits.py.
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~1" & if not defined ROOT set "ROOT=%~dp0.."
for %%R in ("%ROOT%") do set "ROOT=%%~fR"
set /a "fail=0, warn=0, files=0, treeK=0, gitK=0"
for /r "%ROOT%" %%F in (*) do (
  set "p=%%~fF"
  if "!p:\.git\=!"=="!p!" (
    set /a "files+=1, treeK+=(%%~zF + 1023) / 1024"
    if %%~zF geq 25000000 (echo FAIL  %%~fF: %%~zF bytes, at or over the 25,000,000-byte file limit & set /a "fail+=1") else if %%~zF gtr 22500000 (echo WARN  %%~fF: %%~zF bytes, over the 22,500,000-byte target & set /a "warn+=1")
  ) else if not "!p:\.git\objects\=!"=="!p!" set /a "gitK+=(%%~zF + 1023) / 1024"
)
if !treeK! gtr 976562 (echo FAIL  payload: !treeK! KB in the tree, over 1,000,000,000 bytes & set /a "fail+=1") else if !treeK! gtr 961914 (echo WARN  payload: !treeK! KB in the tree, over the 985,000,000-byte target)
if !gitK! gtr 976562 (echo FAIL  .git\objects: !gitK! KB, over 1,000,000,000 bytes & set /a "fail+=1") else if !gitK! gtr 961914 (echo WARN  .git\objects: !gitK! KB, over the 985,000,000-byte target)
echo !files! files, !treeK! KB in the tree, !gitK! KB in .git\objects
set "PY="
for %%P in (py.exe python.exe python3.exe) do if not defined PY for %%X in (%%P) do if not "%%~$PATH:X"=="" set "PY=%%~$PATH:X"
if defined PY ("!PY!" -B "%~dp0check_github_limits.py" "%ROOT%" || set /a "fail+=1") else echo note: Python not found, the shard manifest and SHA-256 seals were not checked
if !fail! gtr 0 (echo FAIL  the GitHub size contract & endlocal & exit /b 1)
echo PASS  the GitHub size contract
endlocal & exit /b 0
