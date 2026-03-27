@echo off
REM Git post-commit hook for Windows: runs deploy in background and logs to .githooks\deploy.log
start "post-commit-deploy" /B cmd /C "npm run deploy:staging >> .githooks\\deploy.log 2>&1"
exit /b 0
