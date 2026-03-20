@echo off
REM ============================================================
REM  Preferred Builders — Data Backup (Windows)
REM  Run from the project root: scripts\backup.bat
REM  With a specific path:      scripts\backup.bat C:\MyBackups
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
  pause
  exit /b 1
)

REM If a path was passed as argument, use it directly — skip the prompt
IF NOT "%~1"=="" (
  SET BACKUP_DIR=%~1
  GOTO :DO_BACKUP
)

REM No argument — show drives and ask
echo Connected drives:
echo.
wmic logicaldisk get DeviceID,VolumeName,Size,DriveType | findstr /v "^$"
echo.
echo  DriveType: 2 = Removable/USB, 3 = Local disk, 4 = Network
echo.
SET /P DRIVE_LETTER=Enter drive letter for backup (e.g. E, F, D, C): 
SET DRIVE_LETTER=%DRIVE_LETTER: =%
SET DRIVE_LETTER=%DRIVE_LETTER::=%
SET BACKUP_DIR=%DRIVE_LETTER%:\PB-Backups

:DO_BACKUP
SET BACKUP_PATH=%BACKUP_DIR%\%BACKUP_NAME%

echo   Saving to : %BACKUP_PATH%
echo.

REM Check destination drive/path is reachable
IF NOT EXIST "%BACKUP_DIR:~0,2%\" (
  echo ERROR: Drive not found. Check the path and try again.
  pause
  exit /b 1
)

IF NOT EXIST "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
mkdir "%BACKUP_PATH%"

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
pause
