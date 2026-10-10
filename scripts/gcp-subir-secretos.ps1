# Sube los secretos del PJUD a Google Secret Manager (proyecto pjud-511203) para el Cloud Run Job.
# Correr en TU PC, desde la raíz del repo (donde está .env.local) — los valores nunca pasan por el chat.
#
# Uso (PowerShell):
#   .\scripts\gcp-subir-secretos.ps1 -ArchivoCuenta "C:\ruta\credenciales.txt"
#   (la misma ruta que usas con --cuenta en pjud-sync.cmd / pjud-download-docs.cmd)
#
# Requiere: Google Cloud SDK instalado (cloud.google.com/sdk/docs/install) y gcloud auth login
# ya corrido una vez con la cuenta info@deudalibre.cl.

param(
    [Parameter(Mandatory=$true)]
    [string]$ArchivoCuenta
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $ArchivoCuenta)) {
    Write-Host "No se encontró el archivo de credenciales: $ArchivoCuenta" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path ".env.local")) {
    Write-Host "No se encontró .env.local en este directorio — corre el script desde la raíz del repo." -ForegroundColor Red
    exit 1
}

$Project = "pjud-511203"
gcloud config set project $Project | Out-Null

function Valor-De($nombre, $contenido) {
    $linea = $contenido | Where-Object { $_ -match "^$nombre=" } | Select-Object -First 1
    if (-not $linea) { return "" }
    $valor = $linea -replace "^$nombre=", ""
    $valor = $valor.Trim('"').Trim("'")
    return $valor
}

$envContenido = Get-Content ".env.local"
$cuentaContenido = Get-Content $ArchivoCuenta

$SupabaseUrl = Valor-De "NEXT_PUBLIC_SUPABASE_URL" $envContenido
$SupabaseAnonKey = Valor-De "NEXT_PUBLIC_SUPABASE_ANON_KEY" $envContenido
$BlobToken = Valor-De "BLOB_READ_WRITE_TOKEN" $envContenido

$lineaEmail = $cuentaContenido | Where-Object { $_ -match "^(Correo|Usuario):" } | Select-Object -First 1
$PjudEmail = if ($lineaEmail) { ($lineaEmail -replace "^(Correo|Usuario):\s*", "").Trim() } else { "" }
$lineaClave = $cuentaContenido | Where-Object { $_ -match "^Clave:" } | Select-Object -First 1
$PjudClave = if ($lineaClave) { ($lineaClave -replace "^Clave:\s*", "").Trim() } else { "" }

$faltan = @()
if (-not $SupabaseUrl) { $faltan += "NEXT_PUBLIC_SUPABASE_URL" }
if (-not $SupabaseAnonKey) { $faltan += "NEXT_PUBLIC_SUPABASE_ANON_KEY" }
if (-not $BlobToken) { $faltan += "BLOB_READ_WRITE_TOKEN" }
if (-not $PjudEmail) { $faltan += "PJUD_EMAIL (del archivo de cuenta)" }
if (-not $PjudClave) { $faltan += "PJUD_CLAVE (del archivo de cuenta)" }
if ($faltan.Count -gt 0) {
    Write-Host "Faltan valores, revisa: $($faltan -join ', ')" -ForegroundColor Red
    exit 1
}

function Subir($nombre, $valor) {
    $existe = gcloud secrets describe $nombre 2>$null
    if ($LASTEXITCODE -eq 0) {
        $valor | gcloud secrets versions add $nombre --data-file=- | Out-Null
        Write-Host "OK $nombre (nueva version)" -ForegroundColor Green
    } else {
        $valor | gcloud secrets create $nombre --data-file=- --replication-policy=automatic | Out-Null
        Write-Host "OK $nombre (creado)" -ForegroundColor Green
    }
}

Subir "pjud-supabase-url" $SupabaseUrl
Subir "pjud-supabase-anon-key" $SupabaseAnonKey
Subir "pjud-blob-token" $BlobToken
Subir "pjud-cuenta-email" $PjudEmail
Subir "pjud-cuenta-clave" $PjudClave

Write-Host ""
Write-Host "Listo. 5 secretos en Secret Manager del proyecto $Project." -ForegroundColor Cyan
Write-Host "Los valores no quedaron en ningun log de este script ni pasaron por ningun chat." -ForegroundColor Cyan
