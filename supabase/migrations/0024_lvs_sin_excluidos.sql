-- «Bienes legalmente excluidos» no es una pregunta de la ficha: la exclusión se marca bien por bien
-- (columna «Es bien excluido» de los Anexos 3 a 8). Quedan siete respuestas del art. 273 A.
alter table public.legal_lvs drop column if exists tiene_bienes_excluidos;
