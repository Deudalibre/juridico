@echo off
rem Sincronizacion diaria con el Poder Judicial (Programador de tareas, 12:00). El PJUD bloquea las IP de Vercel, asi que corre desde este equipo.
cd /d "%~dp0.."
npx -y tsx scripts\pjud-sync.mts --cuenta "C:\Users\magne\Desktop\clave-admin-crm.txt" >> "Importar\pjud-sync.log" 2>&1
