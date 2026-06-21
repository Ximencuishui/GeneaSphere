@echo off
set PATH=%APPDATA%\npm;%PATH%
cd /d %~dp0
pnpm %*
