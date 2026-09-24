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
