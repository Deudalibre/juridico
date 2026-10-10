# Cron del PJUD en Google Cloud (Cloud Run Jobs, southamerica-west1)

Reemplaza el cron de la PC de oficina (`pjud-sync.cmd`, `pjud-download-docs.cmd` en el Programador de tareas de Windows)
por dos Cloud Run Jobs en Santiago (`southamerica-west1`), disparados a diario por Cloud Scheduler. Así la lectura sigue
saliendo desde una IP chilena (el cortafuegos F5 del PJUD rechaza las IP de datacenter de EE.UU./UE, como Vercel) sin
depender de que la PC de la oficina esté encendida. La app Next.js sigue en Vercel: esto es solo para los scripts.

## Piezas

| Pieza | Dónde | Detalle |
|---|---|---|
| Proyecto GCP | `pjud-511203` | cuenta `info@deudalibre.cl` |
| Imagen | `southamerica-west1-docker.pkg.dev/pjud-511203/pjud/scraper:latest` | Artifact Registry, repo `pjud`; se construye con `cloudbuild.pjud.yaml` a partir de `Dockerfile.pjud` (`ENTRYPOINT ["tsx"]`) |
| Cloud Run Job `pjud-sync` | `southamerica-west1` | corre `scripts/pjud-sync.mts` (equivale a `pjud-sync.cmd`) |
| Cloud Run Job `pjud-docs` | `southamerica-west1` | corre `scripts/pjud-download-docs.mts` (equivale a `pjud-download-docs.cmd`) |
| Cloud Scheduler `pjud-sync-diario` | `southamerica-east1` | 12:00 `America/Santiago` → ejecuta `pjud-sync` |
| Cloud Scheduler `pjud-docs-diario` | `southamerica-east1` | 08:00 `America/Santiago` → ejecuta `pjud-docs` |
| Cuenta de servicio del Scheduler | `pjud-scheduler@pjud-511203.iam.gserviceaccount.com` | rol `roles/run.invoker` para poder ejecutar los dos Jobs |

Cloud Scheduler está en `southamerica-east1` (São Paulo), pero solo dispara la ejecución: el tráfico al PJUD sale
desde el Job en Santiago.

## Secretos (Secret Manager)

Los Jobs no tienen `.env.local` ni el archivo de `--cuenta`: leen todo de variables de entorno (ver
`scripts/pjud-entorno.mts`), que Cloud Run llena desde Secret Manager.

| Secreto | Variable de entorno en el Job | De dónde sale |
|---|---|---|
| `pjud-supabase-url` | `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` |
| `pjud-supabase-anon-key` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` |
| `pjud-blob-token` | `BLOB_READ_WRITE_TOKEN` | `.env.local` (solo lo usa `pjud-docs`) |
| `pjud-cuenta-email` | `PJUD_CUENTA_EMAIL` | archivo de `--cuenta`, línea `Correo:`/`Usuario:` |
| `pjud-cuenta-clave` | `PJUD_CUENTA_CLAVE` | archivo de `--cuenta`, línea `Clave:` |

La cuenta es un usuario **del CRM** (Supabase), no del Poder Judicial: los scripts inician sesión con ella para guardar
con `pjud_guardar`, que exige `legal.edit`. Conviene que sea una cuenta dedicada solo con ese permiso, no la de
administrador.

Para subirlos (o rotarlos: si el secreto ya existe agrega una versión nueva), desde la raíz del repo en la PC con
`gcloud` instalado y `gcloud auth login` hecho:

```bash
bash scripts/gcp-subir-secretos.sh C:/ruta/credenciales.txt
```

```powershell
.\scripts\gcp-subir-secretos.ps1 -ArchivoCuenta "C:\ruta\credenciales.txt"
```

O a mano en la consola: Seguridad → Secret Manager → «Crear secreto», con los nombres exactos de la tabla.

## Actualizar el código de los Jobs

Después de cambiar `src/lib/pjud.ts` o los scripts:

```bash
gcloud builds submit --config=cloudbuild.pjud.yaml --region=southamerica-west1 .
```

Los Jobs usan la etiqueta `:latest`, así que la siguiente ejecución ya toma la imagen nueva. `.env.local` no se sube al
build (está en `.gitignore`, que `gcloud` respeta cuando no hay `.gcloudignore`).

## Tope diario (migración 0039)

Cada corrida pide permiso con `pjud_corrida_iniciar` antes de tocar la OJV y se cierra con `pjud_corrida_terminar`. Si
hoy (hora de Chile) ya hubo una corrida del mismo tipo, el script se detiene sin consultar al PJUD. Por eso un
reintento manual del Job el mismo día termina en «Detención total: Ya hubo una corrida…»: es lo esperado. Pasar
`--origen cloud-run` en los argumentos del Job deja registrado de dónde corrió cada fila de `pjud_corridas`.

## Verificar

```bash
gcloud run jobs executions list --job=pjud-sync --region=southamerica-west1
gcloud run jobs executions list --job=pjud-docs --region=southamerica-west1
```

```sql
select tipo, origen, estado, ok, fallas, peticiones, iniciado_at, terminado_at
  from pjud_corridas order by iniciado_at desc limit 10;
```

El log de cada ejecución debe verse igual que en la PC de oficina (`HH:MM · N causas por sincronizar...`). Si aparece
`Detención total: El cortafuegos interpuso un desafío...`, no reintentar en caliente: esperar al día siguiente.

## PC de oficina como respaldo

Los primeros días se dejan `pjud-sync.cmd` / `pjud-download-docs.cmd` activos en el Programador de tareas. El tope de
`pjud_corridas` impide que la PC y Cloud Run corran el mismo tipo el mismo día, así que no se duplica el volumen contra
el PJUD. Cuando las ejecuciones diarias desde GCP salgan limpias varios días seguidos, se desactivan las tareas de Windows.
