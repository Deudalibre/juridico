const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Texto de un campo de formulario, o null si está vacío. */
export const clean = (v: FormDataEntryValue | null | undefined): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

export const parseAmount = (v: FormDataEntryValue | string | null | undefined) =>
  Number(String(v ?? "").replace(/[^\d]/g, ""));

export const initials = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const currencySymbol = (currency: string) => (currency === "EUR" ? "€" : "$");

export const money = (v: number, currency = "CLP") =>
  currencySymbol(currency) + Math.round(Number(v)).toLocaleString(currency === "EUR" ? "es-ES" : "es-CL");

// ---- Fechas en la zona horaria del perfil (el servidor corre en UTC) ----

type Parts = { y: number; m: number; d: number; h: number; min: number };

function partsIn(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

const dayNumber = (p: Parts) => Date.UTC(p.y, p.m - 1, p.d) / 86_400_000;

/** Días naturales entre la fecha y hoy (positivo = pasado). */
export const daysAgo = (iso: string, tz: string, now = new Date()) =>
  dayNumber(partsIn(now, tz)) - dayNumber(partsIn(new Date(iso), tz));

export function relativeDays(iso: string | null, tz: string): string {
  if (!iso) return "—";
  const n = daysAgo(iso, tz);
  if (n <= 0) return "Hoy";
  if (n === 1) return "Ayer";
  if (n < 7) return `Hace ${n} días`;
  if (n < 14) return "Hace 1 semana";
  if (n < 30) return `Hace ${Math.floor(n / 7)} semanas`;
  const m = Math.floor(n / 30);
  return m === 1 ? "Hace 1 mes" : `Hace ${m} meses`;
}

export function shortDate(iso: string, tz: string): string {
  const p = partsIn(new Date(iso), tz);
  const base = `${p.d} ${MONTHS[p.m - 1]}`;
  return p.y === partsIn(new Date(), tz).y ? base : `${base} ${p.y}`;
}

export const timeOf = (iso: string, tz: string) => {
  const p = partsIn(new Date(iso), tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
};

/** Etiqueta de la agenda: hora si es hoy, «Mañana», o la fecha. */
export function agendaLabel(iso: string, tz: string): string {
  const n = -daysAgo(iso, tz);
  if (n <= 0) return timeOf(iso, tz);
  if (n === 1) return "Mañana";
  return shortDate(iso, tz);
}

export const hourIn = (tz: string) => partsIn(new Date(), tz).h;

export function longToday(tz: string) {
  const s = new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const quarterIndex = (iso: string, tz: string) => {
  const p = partsIn(new Date(iso), tz);
  return p.y * 4 + Math.floor((p.m - 1) / 3);
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Valor para <input type="datetime-local"> en la zona del perfil. */
export function localInput(date: Date, tz: string) {
  const p = partsIn(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}`;
}

/** «2026-09-24T10:00» interpretado en la zona del perfil → ISO UTC. */
export function zonedToIso(local: string, tz: string): string | null {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = partsIn(new Date(guess), tz);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - guess;
  return new Date(guess - offset).toISOString();
}

/** Inicio y fin del día (hoy + addDays) en la zona del perfil, en ISO UTC. */
export function dayBounds(tz: string, addDays = 0) {
  const p = partsIn(new Date(), tz);
  const day = (n: number) => {
    const d = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return zonedToIso(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`, tz)!;
  };
  return { start: day(addDays), end: day(addDays + 1) };
}

/** Fecha y hora local sugerida: hoy/mañana/+n días a una hora dada. */
export function localAt(tz: string, addDays: number, hour: number, minute = 0) {
  const p = partsIn(new Date(), tz);
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + addDays));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
}

/** «YYYY-MM-DD» del instante en la zona del perfil. */
export function dayKey(date: Date | string, tz: string) {
  const p = partsIn(typeof date === "string" ? new Date(date) : date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Suma días a una fecha «YYYY-MM-DD». */
export function addDaysKey(key: string, n: number) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Lunes de la semana de una fecha «YYYY-MM-DD». */
export function mondayOf(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDaysKey(key, dow === 0 ? -6 : 1 - dow);
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Vencimiento legible: «Vencida · 22 sep», «Hoy 15:30», «Mañana 10:00», «vie 26/09 10:00». */
export function dueLabel(iso: string, tz: string): { text: string; overdue: boolean; today: boolean } {
  const overdue = Date.parse(iso) < Date.now();
  const n = -daysAgo(iso, tz);
  const time = timeOf(iso, tz);
  if (n < 0) return { text: `Vencida · ${shortDate(iso, tz)}`, overdue: true, today: false };
  if (n === 0) return { text: `Hoy ${time}`, overdue, today: true };
  if (n === 1) return { text: `Mañana ${time}`, overdue: false, today: false };
  const p = partsIn(new Date(iso), tz);
  const wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return { text: `${wd} ${pad(p.d)}/${pad(p.m)} ${time}`, overdue: false, today: false };
}

export function dateTime(iso: string, tz: string) {
  return `${shortDate(iso, tz)} · ${timeOf(iso, tz)}`;
}

/** Fecha YYYY-MM-DD según la preferencia de formato del perfil. */
export function formatDay(date: string | null, fmt: string): string {
  if (!date) return "—";
  const [y, m, d] = date.slice(0, 10).split("-");
  if (fmt === "mdy") return `${m}/${d}/${y}`;
  if (fmt === "iso") return `${y}-${m}-${d}`;
  return `${d}/${m}/${y}`;
}
