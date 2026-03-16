@echo off
echo =============================================
echo  Preferred Builders - Update from GitHub
echo =============================================
echo.

cd /d C:\Users\theso\Desktop\preferred-builders-ai

echo [1/4] Pulling latest code from GitHub...
git pull
if %errorlevel% neq 0 (
  echo ERROR: git pull failed. Check your internet connection.
  pause
  exit /b 1
)

echo.
echo [2/4] Installing any new dependencies...
call npm install --quiet
cd client
call npm install --quiet
cd ..

echo.
echo [3/4] Building frontend...
cd client
call npm run build
if %errorlevel% neq 0 (
  echo ERROR: Frontend build failed.
  cd ..
  pause
  exit /b 1
)
cd ..

echo.
echo [4/4] Restarting app...
pm2 restart preferred-builders

echo.
echo =============================================
echo  Update complete!
echo =============================================
pause
