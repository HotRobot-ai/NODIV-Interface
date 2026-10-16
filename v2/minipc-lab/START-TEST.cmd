@echo off
cd /d %~dp0
if not exist .env copy config.example.env .env >nul
node --version
node server\server.mjs
pause
