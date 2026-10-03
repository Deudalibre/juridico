-- Situación laboral de la LVS: solo importa si trabaja y, si trabaja, nombre y RUT del empleador
-- (el contrato y las liquidaciones se piden como documentos). Fuera situación, ingreso, inicio y tipo de contrato.
alter table public.legal_lvs
  drop column if exists situacion_laboral,
  drop column if exists ingreso_liquido,
  drop column if exists fecha_inicio_contrato,
  drop column if exists tipo_contrato;
