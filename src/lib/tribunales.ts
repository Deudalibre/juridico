// Juzgados de letras competentes por comuna, según el Código Orgánico de Tribunales (arts. 28 a 40, texto de
// leychile.cl al 07-10-2026, entregado por el estudio). Sirve para deducir el tribunal de la demanda a partir de la
// comuna del domicilio del cliente: «S.J.L. Civil de X» cuando en el asiento hay juzgados civiles y «S.J.L. de X»
// cuando el juzgado es de competencia común. Sin dependencias de servidor: se usa en la ficha y en las acciones.

export type Tribunal = {
  /** Comuna donde tiene asiento el juzgado */
  asiento: string;
  /** civil: juzgados de letras en lo civil · comun: juzgado de letras de competencia común */
  tipo: "civil" | "comun";
  /** Región de la comuna del domicilio (nombre corto, como lo escribe el estudio en la ficha) */
  region: string;
  /** Encabezado de la demanda */
  encabezado: string;
};

type Grupo = [region: string, asiento: string, tipo: "civil" | "comun", comunas: string[]];

// Cuando el artículo dice «las comunas de la provincia de …», se listan las comunas de esa provincia.
const GRUPOS: Grupo[] = [
  // Art. 28 · Tarapacá
  ["Tarapacá", "Iquique", "civil", ["Iquique", "Alto Hospicio"]],
  ["Tarapacá", "Pozo Almonte", "comun", ["Pozo Almonte", "Pica", "Huara", "Colchane", "Camiña"]],
  // Art. 29 · Antofagasta
  ["Antofagasta", "Antofagasta", "civil", ["Antofagasta", "Sierra Gorda"]],
  ["Antofagasta", "Tocopilla", "comun", ["Tocopilla"]],
  ["Antofagasta", "María Elena", "comun", ["María Elena"]],
  ["Antofagasta", "Mejillones", "comun", ["Mejillones"]],
  ["Antofagasta", "Calama", "comun", ["Calama", "Ollagüe", "San Pedro de Atacama"]], // provincia de El Loa
  ["Antofagasta", "Taltal", "comun", ["Taltal"]],
  // Art. 30 · Atacama
  ["Atacama", "Copiapó", "civil", ["Copiapó", "Tierra Amarilla"]],
  ["Atacama", "Chañaral", "comun", ["Chañaral"]],
  ["Atacama", "Diego de Almagro", "comun", ["Diego de Almagro"]],
  ["Atacama", "Caldera", "comun", ["Caldera"]],
  ["Atacama", "Freirina", "comun", ["Freirina", "Huasco"]],
  ["Atacama", "Vallenar", "comun", ["Vallenar", "Alto del Carmen"]],
  // Art. 31 · Coquimbo
  ["Coquimbo", "La Serena", "civil", ["La Serena", "La Higuera"]],
  ["Coquimbo", "Coquimbo", "civil", ["Coquimbo"]],
  ["Coquimbo", "Vicuña", "comun", ["Vicuña", "Paihuano"]],
  ["Coquimbo", "Andacollo", "comun", ["Andacollo"]],
  ["Coquimbo", "Ovalle", "comun", ["Ovalle", "Río Hurtado", "Monte Patria", "Punitaqui"]],
  ["Coquimbo", "Combarbalá", "comun", ["Combarbalá"]],
  ["Coquimbo", "Illapel", "comun", ["Illapel", "Salamanca"]],
  ["Coquimbo", "Los Vilos", "comun", ["Los Vilos", "Canela"]],
  // Art. 32 · Valparaíso
  ["Valparaíso", "Valparaíso", "civil", ["Valparaíso", "Juan Fernández"]],
  ["Valparaíso", "Viña del Mar", "civil", ["Viña del Mar", "Concón"]],
  ["Valparaíso", "Quilpué", "comun", ["Quilpué"]],
  ["Valparaíso", "Villa Alemana", "comun", ["Villa Alemana"]],
  ["Valparaíso", "Casablanca", "comun", ["Casablanca", "El Quisco", "Algarrobo"]],
  ["Metropolitana", "Casablanca", "comun", ["Curacaví"]], // comuna de la RM con tribunal en la Quinta Región
  ["Valparaíso", "La Ligua", "comun", ["La Ligua", "Cabildo", "Zapallar", "Papudo"]],
  ["Valparaíso", "Petorca", "comun", ["Petorca"]],
  ["Valparaíso", "Los Andes", "comun", ["Los Andes", "Calle Larga", "Rinconada", "San Esteban"]], // provincia de Los Andes
  ["Valparaíso", "San Felipe", "comun", ["San Felipe", "Santa María", "Panquehue", "Llaillay", "Llay-Llay", "Catemu"]],
  ["Valparaíso", "Putaendo", "comun", ["Putaendo"]],
  ["Valparaíso", "Quillota", "comun", ["Quillota", "La Cruz"]],
  ["Valparaíso", "Quintero", "comun", ["Quintero", "Puchuncaví"]],
  ["Valparaíso", "La Calera", "comun", ["La Calera", "Calera", "Nogales", "Hijuelas"]],
  ["Valparaíso", "Limache", "comun", ["Limache", "Olmué"]],
  ["Valparaíso", "San Antonio", "comun", ["San Antonio", "Cartagena", "El Tabo", "Santo Domingo"]],
  ["Valparaíso", "Isla de Pascua", "comun", ["Isla de Pascua", "Rapa Nui"]],
  // Art. 33 · O'Higgins
  ["O'Higgins", "Rancagua", "civil", ["Rancagua", "Graneros", "Mostazal", "San Francisco de Mostazal", "Codegua", "Machalí", "Coltauco", "Doñihue", "Coínco", "Coinco", "Olivar"]],
  ["O'Higgins", "Rengo", "comun", ["Rengo", "Requínoa", "Malloa", "Quinta de Tilcoco"]],
  ["O'Higgins", "San Vicente", "comun", ["San Vicente", "San Vicente de Tagua Tagua", "Pichidegua"]],
  ["O'Higgins", "Peumo", "comun", ["Peumo", "Las Cabras"]],
  ["O'Higgins", "San Fernando", "comun", ["San Fernando", "Chimbarongo", "Placilla", "Nancagua"]],
  ["O'Higgins", "Santa Cruz", "comun", ["Santa Cruz", "Chépica", "Lolol"]],
  ["O'Higgins", "Pichilemu", "comun", ["Pichilemu"]],
  ["O'Higgins", "Litueche", "comun", ["Litueche", "Navidad", "La Estrella"]],
  ["O'Higgins", "Peralillo", "comun", ["Peralillo", "Marchihue", "Marchigüe", "Paredones", "Pumanque", "Palmilla"]],
  // Art. 34 · Maule
  ["Maule", "Curicó", "civil", ["Curicó", "Teno", "Romeral", "Rauco"]],
  ["Maule", "Talca", "civil", ["Talca", "Pelarco", "Río Claro", "San Clemente", "Maule", "Pencahue", "San Rafael"]],
  ["Maule", "Constitución", "comun", ["Constitución", "Empedrado"]],
  ["Maule", "Curepto", "comun", ["Curepto"]],
  ["Maule", "Licantén", "comun", ["Licantén", "Hualañé", "Vichuquén"]],
  ["Maule", "Molina", "comun", ["Molina", "Sagrada Familia"]],
  ["Maule", "Linares", "comun", ["Linares", "Yerbas Buenas", "Colbún", "Longaví"]],
  ["Maule", "San Javier", "comun", ["San Javier", "Villa Alegre"]],
  ["Maule", "Cauquenes", "comun", ["Cauquenes"]],
  ["Maule", "Chanco", "comun", ["Chanco", "Pelluhue"]],
  ["Maule", "Parral", "comun", ["Parral", "Retiro"]],
  // Art. 35 · Biobío
  ["Biobío", "Concepción", "civil", ["Concepción", "Penco", "Hualqui", "San Pedro de la Paz", "Chiguayante"]],
  ["Biobío", "Talcahuano", "civil", ["Talcahuano", "Hualpén"]],
  ["Biobío", "Los Ángeles", "comun", ["Los Ángeles", "Los Angeles", "Quilleco", "Antuco"]],
  ["Biobío", "Santa Bárbara", "comun", ["Santa Bárbara", "Quilaco", "Alto Biobío"]],
  ["Biobío", "Mulchén", "comun", ["Mulchén"]],
  ["Biobío", "Nacimiento", "comun", ["Nacimiento", "Negrete"]],
  ["Biobío", "Laja", "comun", ["Laja", "San Rosendo"]],
  ["Biobío", "Yumbel", "comun", ["Yumbel"]],
  ["Biobío", "Tomé", "comun", ["Tomé"]],
  ["Biobío", "Florida", "comun", ["Florida"]],
  ["Biobío", "Santa Juana", "comun", ["Santa Juana"]],
  ["Biobío", "Lota", "comun", ["Lota"]],
  ["Biobío", "Coronel", "comun", ["Coronel"]],
  ["Biobío", "Lebu", "comun", ["Lebu", "Los Álamos", "Los Alamos"]],
  ["Biobío", "Arauco", "comun", ["Arauco"]],
  ["Biobío", "Curanilahue", "comun", ["Curanilahue"]],
  ["Biobío", "Cañete", "comun", ["Cañete", "Contulmo", "Tirúa"]],
  ["Biobío", "Cabrero", "comun", ["Cabrero"]],
  // Art. 36 · La Araucanía
  ["La Araucanía", "Temuco", "civil", ["Temuco", "Vilcún", "Melipeuco", "Cunco", "Freire", "Padre Las Casas"]],
  ["La Araucanía", "Angol", "comun", ["Angol", "Renaico"]],
  ["La Araucanía", "Purén", "comun", ["Purén", "Los Sauces"]],
  ["La Araucanía", "Collipulli", "comun", ["Collipulli", "Ercilla"]],
  ["La Araucanía", "Traiguén", "comun", ["Traiguén", "Lumaco"]],
  ["La Araucanía", "Victoria", "comun", ["Victoria"]],
  ["La Araucanía", "Curacautín", "comun", ["Curacautín", "Lonquimay"]],
  ["La Araucanía", "Toltén", "comun", ["Toltén"]],
  ["La Araucanía", "Loncoche", "comun", ["Loncoche"]],
  ["La Araucanía", "Pitrufquén", "comun", ["Pitrufquén", "Gorbea"]],
  ["La Araucanía", "Villarrica", "comun", ["Villarrica"]],
  ["La Araucanía", "Nueva Imperial", "comun", ["Nueva Imperial", "Cholchol", "Teodoro Schmidt"]],
  ["La Araucanía", "Pucón", "comun", ["Pucón", "Curarrehue"]],
  ["La Araucanía", "Lautaro", "comun", ["Lautaro", "Perquenco", "Galvarino"]],
  ["La Araucanía", "Carahue", "comun", ["Carahue", "Saavedra", "Puerto Saavedra"]],
  // Art. 37 · Los Lagos
  ["Los Lagos", "Puerto Montt", "civil", ["Puerto Montt", "Cochamó"]],
  ["Los Lagos", "Osorno", "comun", ["Osorno", "San Pablo", "Puyehue", "Puerto Octay", "San Juan de la Costa"]],
  ["Los Lagos", "Río Negro", "comun", ["Río Negro", "Purranque"]],
  ["Los Lagos", "Puerto Varas", "comun", ["Puerto Varas", "Llanquihue", "Frutillar", "Fresia"]],
  ["Los Lagos", "Calbuco", "comun", ["Calbuco"]],
  ["Los Lagos", "Maullín", "comun", ["Maullín"]],
  ["Los Lagos", "Los Muermos", "comun", ["Los Muermos"]],
  ["Los Lagos", "Castro", "comun", ["Castro", "Chonchi", "Dalcahue", "Puqueldón", "Queilén"]],
  ["Los Lagos", "Quellón", "comun", ["Quellón"]],
  ["Los Lagos", "Ancud", "comun", ["Ancud", "Quemchi"]],
  ["Los Lagos", "Quinchao", "comun", ["Quinchao", "Curaco de Vélez"]],
  ["Los Lagos", "Chaitén", "comun", ["Chaitén", "Futaleufú", "Palena"]],
  ["Los Lagos", "Hualaihué", "comun", ["Hualaihué"]],
  // Art. 38 · Aysén
  ["Aysén", "Coyhaique", "comun", ["Coyhaique", "Coihaique", "Río Ibáñez"]],
  ["Aysén", "Aysén", "comun", ["Aysén", "Puerto Aysén"]],
  ["Aysén", "Chile Chico", "comun", ["Chile Chico"]],
  ["Aysén", "Cochrane", "comun", ["Cochrane", "O'Higgins", "Tortel"]], // provincia Capitán Prat
  ["Aysén", "Cisnes", "comun", ["Cisnes", "Guaitecas", "Lago Verde"]],
  // Art. 39 · Magallanes
  ["Magallanes", "Punta Arenas", "civil", ["Punta Arenas", "Laguna Blanca", "Río Verde", "San Gregorio"]], // provincia de Magallanes
  ["Magallanes", "Natales", "comun", ["Natales", "Puerto Natales", "Torres del Paine"]], // provincia de Última Esperanza
  ["Magallanes", "Porvenir", "comun", ["Porvenir", "Primavera", "Timaukel"]], // provincia de Tierra del Fuego
  ["Magallanes", "Cabo de Hornos", "comun", ["Cabo de Hornos", "Antártica"]], // provincia de la Antártica Chilena
  // Art. 39 bis · Los Ríos
  ["Los Ríos", "Valdivia", "civil", ["Valdivia", "Corral"]],
  ["Los Ríos", "Mariquina", "comun", ["Mariquina", "San José de la Mariquina", "Máfil", "Lanco"]],
  ["Los Ríos", "Los Lagos", "comun", ["Los Lagos", "Futrono"]],
  ["Los Ríos", "Panguipulli", "comun", ["Panguipulli"]],
  ["Los Ríos", "La Unión", "comun", ["La Unión"]],
  ["Los Ríos", "Paillaco", "comun", ["Paillaco"]],
  ["Los Ríos", "Río Bueno", "comun", ["Río Bueno", "Lago Ranco"]],
  // Art. 39 ter · Arica y Parinacota
  ["Arica y Parinacota", "Arica", "civil", ["Arica", "Camarones", "Putre", "General Lagos"]], // provincias de Arica y Parinacota
  // Art. 39 quáter · Ñuble
  ["Ñuble", "Chillán", "civil", ["Chillán", "Pinto", "Coihueco", "Chillán Viejo"]],
  ["Ñuble", "San Carlos", "comun", ["San Carlos", "Ñiquén", "San Fabián", "San Nicolás"]],
  ["Ñuble", "Yungay", "comun", ["Yungay", "Pemuco", "El Carmen", "Tucapel"]],
  ["Ñuble", "Bulnes", "comun", ["Bulnes", "Quillón", "San Ignacio"]],
  ["Ñuble", "Coelemu", "comun", ["Coelemu", "Ránquil"]],
  ["Ñuble", "Quirihue", "comun", ["Quirihue", "Ninhue", "Portezuelo", "Treguaco", "Trehuaco", "Cobquecura"]],
  // Art. 40 · Metropolitana
  // Treinta juzgados civiles de Santiago: provincia de Santiago salvo las nueve comunas del sur
  ["Metropolitana", "Santiago", "civil", ["Santiago", "Cerrillos", "Cerro Navia", "Conchalí", "Estación Central", "Huechuraba", "Independencia", "La Florida", "La Reina", "Las Condes", "Lo Barnechea", "Lo Prado", "Macul", "Maipú", "Ñuñoa", "Peñalolén", "Providencia", "Pudahuel", "Quilicura", "Quinta Normal", "Recoleta", "Renca", "Vitacura"]],
  // Cuatro juzgados civiles con competencia sobre las comunas del sur (juzgados civiles de San Miguel)
  ["Metropolitana", "San Miguel", "civil", ["San Miguel", "San Joaquín", "La Granja", "La Pintana", "San Ramón", "Pedro Aguirre Cerda", "La Cisterna", "El Bosque", "Lo Espejo"]],
  ["Metropolitana", "Puente Alto", "civil", ["Puente Alto", "Pirque", "San José de Maipo"]], // provincia de Cordillera
  ["Metropolitana", "San Bernardo", "comun", ["San Bernardo", "Calera de Tango"]],
  ["Metropolitana", "Talagante", "comun", ["Talagante", "El Monte", "Isla de Maipo"]],
  ["Metropolitana", "Peñaflor", "comun", ["Peñaflor", "Padre Hurtado"]],
  ["Metropolitana", "Melipilla", "comun", ["Melipilla", "Alhué", "María Pinto", "San Pedro"]], // provincia de Melipilla salvo Curacaví
  ["Metropolitana", "Buin", "comun", ["Buin", "Paine"]],
  ["Metropolitana", "Colina", "comun", ["Colina", "Lampa", "Tiltil", "Til Til"]], // provincia de Chacabuco
];

/** Clave de comparación: sin tildes, sin signos, en minúsculas y con espacios simples. */
export const claveComuna = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const INDICE = new Map<string, Tribunal>();
for (const [region, asiento, tipo, comunas] of GRUPOS) {
  const encabezado = tipo === "civil" ? `S.J.L. Civil de ${asiento}` : `S.J.L. de ${asiento}`;
  for (const comuna of comunas) INDICE.set(claveComuna(comuna), { asiento, tipo, region, encabezado });
}

/** Tribunal competente para la comuna del domicilio (acepta mayúsculas, sin tildes y variantes de nombre), o null si no está en la tabla. */
export function tribunalPara(comuna: string | null | undefined): Tribunal | null {
  if (!comuna) return null;
  return INDICE.get(claveComuna(comuna)) ?? null;
}

/** Comunas conocidas, ordenadas, para el autocompletado del domicilio (una por nombre oficial). */
export const COMUNAS: string[] = [...new Set(GRUPOS.flatMap(([, , , comunas]) => comunas))]
  .filter((c) => !["Llay-Llay", "Calera", "Rapa Nui", "San Francisco de Mostazal", "Coinco", "San Vicente de Tagua Tagua", "Marchigüe", "Los Angeles", "Los Alamos", "Puerto Saavedra", "Coihaique", "Puerto Aysén", "Puerto Natales", "San José de la Mariquina", "Trehuaco", "Til Til"].includes(c))
  .sort((a, b) => a.localeCompare(b, "es"));
