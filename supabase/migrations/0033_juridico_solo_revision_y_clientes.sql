-- 0033 · El abogado tramitador (rol «juridico») solo ve Revisión y Clientes (decisión del administrador, 2026-10-05).
-- Plantillas, Documentos generados y Solicitudes LVS quedan para el administrador: se le retiran al rol los
-- permisos documents.* (la app usa documents.view para mostrar esas secciones y proteger sus páginas).
-- Idempotente.

delete from public.role_permissions where role = 'juridico' and permission like 'documents.%';
