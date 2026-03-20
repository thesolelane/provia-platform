@echo off
REM ============================================================
REM  Preferred Builders — Data Backup (Windows)
REM  Run from the project root: scripts\backup.bat
REM  To send to external drive: scripts\backup.bat E:\PB-Backups
REM ============================================================

SET TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
SET TIMESTAMP=%TIMESTAMP: =0%
SET BACKUP_NAME=pb-backup-%TIMESTAMP%

REM Default backup destination — change E: to your external drive letter
IF "%~1"=="" (
  SET BACKUP_DIR=E:\PB-Backups
) ELSE (
  SET BACKUP_DIR=%~1
)

SET BACKUP_PATH=%BACKUP_DIR%\%BACKUP_NAME%

echo ======================================
echo   Preferred Builders -- Data Backup
echo ======================================
echo   Timestamp : %TIMESTAMP%
echo   Saving to : %BACKUP_PATH%
echo.

REM Check we are in the right folder
IF NOT EXIST "package.json" (
  echo ERROR: Run this script from the project root folder.
  echo        e.g.  C:\Users\theso\Desktop\preferred-builders-ai
  pause
  exit /b 1
)

REM Check external drive is connected
IF NOT EXIST "%BACKUP_DIR:~0,2%\" (
  echo ERROR: Drive %BACKUP_DIR:~0,2% not found.
  echo        Make sure the external hard drive is connected.
  pause
  exit /b 1
)

REM Create backup folder on the drive
IF NOT EXIST "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Create the backup folder for this run
mkdir "%BACKUP_PATH%"

REM Copy each data folder
echo Copying database...
IF EXIST "data\"        xcopy /E /I /Y /Q "data"          "%BACKUP_PATH%\data"
echo Copying proposals and contracts...
IF EXIST "outputs\"     xcopy /E /I /Y /Q "outputs"       "%BACKUP_PATH%\outputs"
echo Copying job photos...
IF EXIST "uploads\"     xcopy /E /I /Y /Q "uploads"       "%BACKUP_PATH%\uploads"
echo Copying knowledge base...
IF EXIST "knowledge-base\" xcopy /E /I /Y /Q "knowledge-base" "%BACKUP_PATH%\knowledge-base"

echo.
echo ======================================
echo   BACKUP COMPLETE
echo   Folder: %BACKUP_PATH%
echo ======================================
echo.
echo Contents saved:
echo   data\           -- SQLite database (all jobs, settings, users)
echo   outputs\        -- Generated proposal and contract PDFs
echo   uploads\        -- Job photos and uploaded estimate files
echo   knowledge-base\ -- AI pricing references and knowledge docs
echo.
echo To restore: copy the folder contents back to the project root
echo             and restart the server with: pm2 restart pb-system
echo.
pause
