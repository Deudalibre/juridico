@echo off
rem Descarga diaria de los PDFs del Poder Judicial a Vercel Blob (Programador de tareas, 08:00). Corre desde un PC del
rem estudio porque el PJUD bloquea las IP de Vercel. Log del dia en C:\pjud-logs\download-AAAA-MM-DD.txt.
cd /d "%~dp0.."
if not exist "C:\pjud-logs" mkdir "C:\pjud-logs"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set HOY=%%i
echo ===== %DATE% %TIME% ===== >> "C:\pjud-logs\download-%HOY%.txt"
npx -y tsx scripts\pjud-download-docs.mts --cuenta "C:\Users\magne\Desktop\clave-admin-crm.txt" >> "C:\pjud-logs\download-%HOY%.txt" 2>&1
