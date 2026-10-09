# Deuda Libre · Jurídico

Aplicación separada del CRM comercial para preparar documentos jurídicos (Ley 20.720) a partir de las plantillas Word
del estudio: ficha única por cliente → revisión de antecedentes → generación desde plantillas → revisión jurídica →
descarga. El sistema automatiza la preparación documental; la procedencia jurídica la decide el equipo.

## Relación con el CRM

- **Mismo proyecto Supabase** que el CRM: mismas cuentas, misma matriz de roles y permisos (`role_permissions`,
  `has_permission()`, `my_permissions()`) y misma auditoría (`audit_log`).
- Solo entran el rol **jurídico** y el **administrador** (`legal.*`, `documents.*`). Ejecutivos y coordinadores del CRM
  no ven nada, ni desde la pantalla ni desde la base (RLS).
- Esta app es la dueña de las tablas `legal_*` (migración `0009` del CRM). El CRM solo las lee para mostrar, en la ficha
  de un lead contratado, que ya es cliente en tramitación, y enlaza aquí (`legal_clients.lead_id`).

## Puesta en marcha

1. `npm install`
2. `.env.local` con las mismas claves de Supabase del CRM (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`;
   `SUPABASE_ACCESS_TOKEN` solo para migraciones) y `NEXT_PUBLIC_CRM_URL` (dirección del CRM, por defecto
   `http://localhost:3000`).
3. `npm run dev` → `http://localhost:3001` (el CRM usa el 3000).

## Estado

- Hecho: acceso con la cuenta del CRM, permisos, estructura (Clientes · Plantillas · Documentos · Configuración) y lista
  de clientes en tramitación.
- Pendiente, en este orden: mapa de plantillas (necesita los `.docx` en `plantillas/`), ficha única (antecedentes,
  insolvencia, acreedores, bienes, ingresos y gastos), gestor de plantillas y motor Word (`docxtemplater`), paquete de
  documentos con numeración de anexos, revisión y versiones, IA para el relato de insolvencia.

## PDFs del Poder Judicial (Vercel Blob)

Los documentos de cada causa (el PDF de cada actuación, el certificado de envío de cada escrito, los anexos de cada
escrito y de la causa, el texto de la demanda, el certificado de envío y el ebook)
se bajan de la Oficina Judicial Virtual y se guardan en **Vercel Blob** (store privado); Supabase guarda solo la ruta
(`pjud_documentos`, migración `0036`). El PJUD bloquea las IP de Vercel, así que la descarga corre desde **un PC del
estudio siempre encendido** con `scripts/pjud-download-docs.mts`; los demás PCs solo abren las URLs desde el programa.

- Script: `npx -y tsx scripts/pjud-download-docs.mts --cuenta "C:\ruta\clave-admin-crm.txt"` (o `npm run pjud:docs -- --cuenta …`).
  Opciones: `--causa-id <uuid>` (una sola causa), `--limite N`, `--contacto correo`.
- Por cada causa abre el detalle fresco en la OJV (los enlaces de descarga llevan un JWT que vence a la hora), reserva
  cada documento en `pjud_documentos` (`pjud_documento_reservar`: si ya existe o lo está bajando otro PC, lo salta),
  baja el PDF por GET sin cookies (30 s de espera máxima), lo sube con `put()` a `pjud/{causa}/{cuaderno}/{folio}-{tipo}[-n].pdf`
  (un folio puede tener varios documentos del mismo tipo: `orden`). Las carpetas de anexos cuestan una consulta más
  cada una y solo se abren mientras no tengan nada bajado
  y cierra la reserva (`pjud_documento_terminar`). Un error se reintenta pasada 1 hora. El programa sirve cada PDF con
  sesión en `/api/pjud/doc/[id]` (lee el Blob con el token de la app), así el store queda privado.
- Ritmo: 5 s entre consultas a la OJV (lo impone el cliente) y 2 s entre documentos de la misma causa. La primera pasada
  completa tarda varias horas; las siguientes solo bajan lo nuevo.
- Variables: `BLOB_READ_WRITE_TOKEN` (Vercel → Storage → Blob → token) en `.env.local` del PC que descarga y en el
  proyecto de Vercel (lo pone solo al conectar el store), porque la app lo usa para servir los PDFs. En los otros PCs
  no hace falta nada: abren los PDFs desde el programa.

### Orden de la cola y límite de sincronizaciones a mano

- La cola la arma la función de base `pjud_cola_sync` (migración `0038`) y la usan el script de sincronización, la ruta
  `/api/pjud/sync` y la descarga de PDFs: primero las causas con alguna actuación reciente (desde el primer día de hace
  dos meses; `--desde AAAA-MM-DD` o `?desde=` para otra fecha), luego las que llevan más tiempo sin sincronizar. Las causas
  cuyo rol/tribunal el PJUD no encontró quedan fuera hasta que se corrija el dato en la ficha. Ver la cola sin sincronizar:
  `npm run pjud:sync -- --cuenta … --listar`.
- «Sincronizar ahora» admite una vez cada 6 horas por causa: el botón queda deshabilitado con «Sincronizada hace X —
  próxima en Y» y el servidor responde `cooldown` (429 en `POST /api/pjud/sync?causa_id=<uuid>`, con `next_available`).
  El cron, con su `Authorization: Bearer CRON_SECRET`, no tiene ese límite.

### Tarea programada de Windows (PC del estudio)

1. Clonar el repo, `npm install` y dejar `.env.local` con `BLOB_READ_WRITE_TOKEN`; dejar el archivo de credenciales
   (`Usuario:` y `Clave:` de una cuenta con `legal.edit`) en la ruta que usa `scripts\pjud-download-docs.cmd`.
2. En PowerShell **como administrador**, pegar (ajustar la ruta del repo):

   ```powershell
   schtasks /Create /TN "Deuda Libre - PDFs PJUD" /SC DAILY /ST 08:00 /RL HIGHEST /F /TR "cmd.exe /c \"C:\Users\magne\Desktop\juridico\scripts\pjud-download-docs.cmd\""
   ```

   El `.cmd` crea `C:\pjud-logs` y escribe el log del día en `C:\pjud-logs\download-AAAA-MM-DD.txt`.
3. Probar sin esperar a mañana: `schtasks /Run /TN "Deuda Libre - PDFs PJUD"`.
4. Comprobar que corrió: `schtasks /Query /TN "Deuda Libre - PDFs PJUD" /V /FO LIST` (campos «Última ejecución» y
   «Último resultado», que debe ser `0`) y el final del log del día, que termina con el resumen
   `✓ N PDFs nuevos subidos · → M ya existían · ✗ K errores`. En el programa, la actuación pasa de «PDF pendiente» a
   «Ver PDF» en la Ficha jurídica.

## Alertas diarias por correo

`GET /api/cron/alertas` (cron de Vercel, 08:00 de Chile de lunes a viernes; `Authorization: Bearer CRON_SECRET`) reúne
causas sin revisión hace más de 30 días, causas con movimiento nuevo en el PJUD (última actuación de ayer u hoy), tareas
vencidas y causas en semáforo crítico (apercibimiento o demanda rechazada), y manda el resumen con Resend a
`ALERT_EMAIL_TO` desde `ALERT_EMAIL_FROM`. Si todo está en cero no envía. Responde `{ sent, indicators, reason? }`.
Necesita `SUPABASE_SERVICE_ROLE_KEY`. La insignia de «Revisión» en la barra muestra el mismo conteo de causas sin revisión.
