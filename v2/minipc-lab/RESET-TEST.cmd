@echo off
cd /d %~dp0
node scripts\reset-test.mjs
node scripts\seed-test.mjs
pause
