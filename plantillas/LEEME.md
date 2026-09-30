# Plantillas Word del estudio

Las plantillas se gestionan **dentro de la app**, en Jurídico → Plantillas: subes el `.docx`, y en el editor
seleccionas cada dato que cambia por cliente y lo conviertes en variable. No hace falta dejar archivos en esta
carpeta; queda como referencia de la convención.

## Cómo funcionan las variables

En el Word, cada variable es un marcador entre llaves: `{nombre_completo}`, `{rut}`, `{tribunal}`…
El editor los escribe por ti al marcar un texto, pero también puedes escribirlos a mano en Word antes de subir
el archivo: al subirlo se detectan y aparecen en el panel de variables.

- Nombre en minúsculas, con guion bajo, sin tildes ni espacios. Una variable = un dato; si el mismo dato
  aparece diez veces, se usa el mismo nombre diez veces.
- Si escribes el marcador a mano en Word, hazlo de corrido, sin cambiar de formato a mitad de la llave.
- El formato del texto (negrita, tamaño, alineación, tablas) se conserva: solo cambia el texto marcado.

## De dónde sale el valor

Cada variable tiene una **fuente**: un dato de la ficha del cliente (nombre completo, RUT, teléfono, email,
tribunal, rol, carátula, procedimiento, fecha de ingreso, liquidador, fecha de la resolución de liquidación,
abogado, fecha de hoy) o «se pide al generar» para lo que aún no está en la ficha (domicilio, comuna,
estado civil, ingresos, bienes…). Si el nombre de la variable coincide con un campo de la ficha, la fuente
se propone sola.

## Pendiente

- Listas y tablas que se repiten por acreedor (`{#acreedores}…{/acreedores}`) y párrafos condicionales
  (`{#tiene_bienes}…{/tiene_bienes}`): el motor los admite, el editor todavía no los marca.
- Generar el documento final para un cliente desde la app (hoy solo se previsualiza con sus datos).
