-- Documentación de la LVS: el estudio no marca documento por documento (trabaja con la carpeta del Drive).
-- La pestaña Documentación pasa a ser una lista recordatorio calculada desde la ficha, cruzada con los archivos
-- del Drive por nombre. La tabla de seguimiento de la etapa 2 deja de usarse y se elimina.
drop table if exists public.legal_lvs_requisitos;
drop function if exists public.legal_lvs_requisitos_history();
