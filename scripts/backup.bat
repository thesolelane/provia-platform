@echo off
REM ============================================================
REM  Preferred Builders — Data Backup (Windows)
REM  Run from the project root: scripts\backup.bat
REM ============================================================

SET TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
SET TIMESTAMP=%TIMESTAMP: =0%
SET BACKUP_NAME=pb-backup-%TIMESTAMP%

echo ======================================
echo   Preferred Builders -- Data Backup
echo ======================================
echo.

REM Check we are in the right folder
IF NOT EXIST "package.json" (
  echo ERROR: Run this script from the project root folder.
  echo        cd Desktop/preferred-builders-ai
  echo        then run: scripts/backup.bat
  pause
  exit /b 1
)

REM Show all connected drives
echo Connected drives:
echo.
wmic logicaldisk get DeviceID,VolumeName,Size,DriveType | findstr /v "^$"
echo.
echo  DriveType: 2 = Removable/USB, 3 = Local disk, 4 = Network
echo.

REM Ask which drive to use
SET /P DRIVE_LETTER=Enter drive letter for backup (e.g. E, F, D): 
SET DRIVE_LETTER=%DRIVE_LETTER: =%

REM Strip colon if they included it
SET DRIVE_LETTER=%DRIVE_LETTER::=%

SET BACKUP_DIR=%DRIVE_LETTER%:\PB-Backups
SET BACKUP_PATH=%BACKUP_DIR%\%BACKUP_NAME%

echo.
echo   Saving to : %BACKUP_PATH%
echo.

REM Check drive exists
IF NOT EXIST "%DRIVE_LETTER%:\" (
  echo ERROR: Drive %DRIVE_LETTER%: not found.
  echo        Check the drive letter and try again.
  pause
  exit /b 1
)

REM Create backup folder on the drive
IF NOT EXIST "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM Create the folder for this run
mkdir "%BACKUP_PATH%"

REM Copy each data folder
echo Copying database...
IF EXIST "data\"           xcopy /E /I /Y /Q "data"           "%BACKUP_PATH%\data"
echo Copying proposals and contracts...
IF EXIST "outputs\"        xcopy /E /I /Y /Q "outputs"        "%BACKUP_PATH%\outputs"
echo Copying job photos...
IF EXIST "uploads\"        xcopy /E /I /Y /Q "uploads"        "%BACKUP_PATH%\uploads"
echo Copying knowledge base...
IF EXIST "knowledge-base\" xcopy /E /I /Y /Q "knowledge-base" "%BACKUP_PATH%\knowledge-base"

echo.
echo ======================================
echo   BACKUP COMPLETE
echo   %BACKUP_PATH%
echo ======================================
echo.
echo   data\            -- SQLite database (all jobs, settings, users)
echo   outputs\         -- Generated proposal and contract PDFs
echo   uploads\         -- Job photos and uploaded estimate files
echo   knowledge-base\  -- AI pricing references and knowledge docs
echo.
echo To restore: copy folder contents back to the project root
echo             then run: pm2 restart pb-system
echo.
pause
