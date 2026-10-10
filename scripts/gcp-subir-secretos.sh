#!/bin/bash
# Sube los secretos del PJUD a Google Secret Manager (proyecto pjud-511203) para el Cloud Run Job.
# Correr en TU PC, desde la raíz del repo (donde está .env.local) — los valores nunca pasan por el chat.
#
# Uso:
#   bash scripts/gcp-subir-secretos.sh C:/ruta/credenciales.txt
#   (o la ruta que uses con --cuenta en pjud-sync.cmd / pjud-download-docs.cmd)
#
# Requiere: gcloud CLI instalado y autenticado (gcloud auth login) con la cuenta info@deudalibre.cl.
set -e

ARCHIVO_CUENTA="$1"
if [ -z "$ARCHIVO_CUENTA" ] || [ ! -f "$ARCHIVO_CUENTA" ]; then
  echo "Uso: bash scripts/gcp-subir-secretos.sh <ruta al archivo de credenciales del PJUD>"
  echo "  (el mismo que usas con --cuenta en pjud-sync.cmd)"
  exit 1
fi
if [ ! -f ".env.local" ]; then
  echo "No se encontró .env.local en este directorio — corre el script desde la raíz del repo."
  exit 1
fi

PROJECT="pjud-511203"
gcloud config set project "$PROJECT" >/dev/null

# Lee .env.local sin exportar nada a la shell (no queda en el historial ni en env vars del proceso padre)
valor_de() { grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

SUPABASE_URL=$(valor_de NEXT_PUBLIC_SUPABASE_URL)
SUPABASE_ANON_KEY=$(valor_de NEXT_PUBLIC_SUPABASE_ANON_KEY)
BLOB_TOKEN=$(valor_de BLOB_READ_WRITE_TOKEN)
PJUD_EMAIL=$(grep -E "^(Correo|Usuario):" "$ARCHIVO_CUENTA" | head -1 | sed -E 's/^(Correo|Usuario):\s*//')
PJUD_CLAVE=$(grep -E "^Clave:" "$ARCHIVO_CUENTA" | head -1 | sed -E 's/^Clave:\s*//')

faltan=""
[ -z "$SUPABASE_URL" ] && faltan="$faltan NEXT_PUBLIC_SUPABASE_URL"
[ -z "$SUPABASE_ANON_KEY" ] && faltan="$faltan NEXT_PUBLIC_SUPABASE_ANON_KEY"
[ -z "$BLOB_TOKEN" ] && faltan="$faltan BLOB_READ_WRITE_TOKEN"
[ -z "$PJUD_EMAIL" ] && faltan="$faltan PJUD_EMAIL(del archivo --cuenta)"
[ -z "$PJUD_CLAVE" ] && faltan="$faltan PJUD_CLAVE(del archivo --cuenta)"
if [ -n "$faltan" ]; then
  echo "Faltan valores, revisa:$faltan"
  exit 1
fi

# Crea el secreto si no existe, o agrega una versión nueva si ya existe (así sirve también para rotar claves después)
subir() {
  local nombre="$1" valor="$2"
  if gcloud secrets describe "$nombre" >/dev/null 2>&1; then
    printf '%s' "$valor" | gcloud secrets versions add "$nombre" --data-file=- >/dev/null
    echo "✓ $nombre (nueva versión)"
  else
    printf '%s' "$valor" | gcloud secrets create "$nombre" --data-file=- --replication-policy=automatic >/dev/null
    echo "✓ $nombre (creado)"
  fi
}

subir pjud-supabase-url "$SUPABASE_URL"
subir pjud-supabase-anon-key "$SUPABASE_ANON_KEY"
subir pjud-blob-token "$BLOB_TOKEN"
subir pjud-cuenta-email "$PJUD_EMAIL"
subir pjud-cuenta-clave "$PJUD_CLAVE"

echo ""
echo "Listo. 5 secretos en Secret Manager del proyecto $PROJECT."
echo "Los valores no quedaron en ningún log de este script ni pasaron por ningún chat."
