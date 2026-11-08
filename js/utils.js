/**
 * utils.js — Funciones compartidas por el cliente y el panel admin.
 *  - Escape de textos (sanitización antes de tocar el DOM).
 *  - Íconos SVG inline (los mismos del prototipo Figma).
 *  - Manejo de fechas como strings locale YYYY-MM-DD (sin toISOString(),
 *    que en Colombia UTC-5 desplazaría la fecha un día).
 *  - Avisos flotantes (toast) y datos del negocio.
 */

/* --- Nombres de días y meses en español ---------------------------------- */
export const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
export const DIAS_LARGO = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
export const DIAS_CORTO_ES = [
  "Lun",
  "Mar",
  "Mié",
  "Jue",
  "Vie",
  "Sáb",
  "Dom",
]; // calendario que empieza en lunes
export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
export const MESES_CORTO = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/* --- Sanitización --------------------------------------------------------- */

/**
 * Escapa caracteres HTML para insertar texto de forma segura.
 * Todo texto que venga de Supabase o del usuario pasa por aquí.
 */
export function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/** Crea un elemento de texto seguro (alternativa a esc + innerHTML). */
export function textoSeguro(valor) {
  return document.createTextNode(String(valor ?? ""));
}

/** Iniciales de un nombre para el avatar cuando no hay foto. */
export function iniciales(nombre) {
  const partes = String(nombre || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "?";
  const primera = partes[0][0] || "";
  const segunda = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primera + segunda).toUpperCase();
}

/* --- Íconos SVG inline (mismos trazos del prototipo) ---------------------- */

const TRAZOS = {
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
  scissors:
    '<circle cx="6" cy="7" r="3"></circle><circle cx="6" cy="17" r="3"></circle><path d="m8.7 8.3 12.3 6.2M8.7 15.7 21 9.5"></path>',
  map: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
  phone:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"></path>',
  close: '<path d="M18 6 6 18M6 6l12 12"></path>',
  arrow: '<path d="m9 18 6-6-6-6"></path>',
  "arrow-left": '<path d="m15 18-6-6 6-6"></path>',
  check: '<path d="m5 12 4 4L19 6"></path>',
  logout:
    '<path d="M10 17l5-5-5-5M15 12H3"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"></path>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path>',
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><path d="M17.5 6.5h.01"></path>',
};

/** Devuelve un SVG inline (string) con el trazo pedido. */
export function icono(nombre, size = 20) {
  const trazos = TRAZOS[nombre] || TRAZOS.arrow;
  return (
    `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
    `stroke-linejoin="round">${trazos}</svg>`
  );
}

/* --- Fechas y horas (strings locale) -------------------------------------- */

/** Devuelve 'YYYY-MM-DD' usando la zona horaria local (no toISOString). */
export function fechaLocal(d = new Date()) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Fecha de hoy en la zona local. */
export function hoy() {
  return fechaLocal(new Date());
}

/** Convierte 'YYYY-MM-DD' a un Date a medianoche local. */
export function parseFecha(fechaStr) {
  const [anio, mes, dia] = String(fechaStr).split("-").map(Number);
  return new Date(anio, (mes || 1) - 1, dia || 1);
}

/** Índice de día de la semana (0 = domingo). */
export function indiceDia(fechaStr) {
  return parseFecha(fechaStr).getDay();
}

/** Nombre completo del día: 'miércoles'. */
export function diaDeSemana(fechaStr) {
  return DIAS[indiceDia(fechaStr)];
}

/** ¿La fecha ya pasó? (comparación lexicográfica de YYYY-MM-DD) */
export function esPasada(fechaStr) {
  return fechaStr < hoy();
}

/** ¿Es hoy? */
export function esHoy(fechaStr) {
  return fechaStr === hoy();
}

/** Normaliza valores de tipo time de PostgreSQL ('09:00:00' → '09:00'). */
export function aHHMM(valor) {
  return String(valor || "").slice(0, 5);
}

/** 'HH:MM' → minutos desde medianoche. */
export function aMinutos(hhmm) {
  const [h, m] = aHHMM(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutos → 'HH:MM'. */
export function deMinutos(minutos) {
  const total = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutos)));
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Suma minutos a una hora 'HH:MM'. */
export function sumarMinutos(hhmm, minutos) {
  return deMinutos(aMinutos(hhmm) + minutos);
}

/** Duración en minutos entre dos horas. */
export function duracionEntre(inicio, fin) {
  return Math.max(0, aMinutos(fin) - aMinutos(inicio));
}

/** '09:00' → '9:00' (como en el prototipo). */
export function horaBonita(hhmm) {
  const [h, m] = aHHMM(hhmm).split(":");
  return `${Number(h)}:${m}`;
}

/** Hora actual en minutos (para ocultar slots pasados). */
export function minutosAhora() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** 'YYYY-MM-DD' → '7 de noviembre de 2026'. */
export function fechaLarga(fechaStr) {
  const d = parseFecha(fechaStr);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** 'YYYY-MM-DD' → 'Miércoles, 18 de junio'. */
export function fechaPaso(fechaStr) {
  const d = parseFecha(fechaStr);
  return `${DIAS_LARGO[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** 'YYYY-MM-DD' → 'MIÉRCOLES, 18 DE JUNIO'. */
export function fechaResumen(fechaStr) {
  return fechaPaso(fechaStr).toUpperCase();
}

/** 'YYYY-MM-DD' → 'Mié, 18 Jun' (cabecera del panel admin). */
export function fechaCorta(fechaStr) {
  const d = parseFecha(fechaStr);
  return `${DIAS_CORTO[d.getDay()]}, ${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

/* --- Configuración y negocio ---------------------------------------------- */

/** Configuración generada por build.js (window.TAUROS_CONFIG). */
export function configuracion() {
  return window.TAUROS_CONFIG || {};
}

/** Datos de la barbería (dirección, teléfono, Instagram...). */
export function negocio() {
  const cfg = configuracion();
  return (
    cfg.BUSINESS || {
      nombre: "Tauros Barbería",
      direccion: "Carrera 17 # 92–12",
      direccionCorta: "Cra. 17 # 92–12",
      ciudad: "Bogotá, Colombia",
      telefono: "+57 310 555 0189",
      instagram: "@taurosbarberia",
      lema: "El arte de verte bien, en manos expertas.",
    }
  );
}

/* --- Avisos flotantes ----------------------------------------------------- */

let temporizadorAviso = null;

/**
 * Muestra un aviso flotante (toast) en la parte inferior.
 * @param {string} mensaje texto a mostrar (se inserta con textContent)
 * @param {'info'|'error'} tipo
 */
export function aviso(mensaje, tipo = "info") {
  const previo = document.querySelector(".aviso");
  if (previo) previo.remove();

  const el = document.createElement("div");
  el.className = "aviso" + (tipo === "error" ? " error" : "");
  el.setAttribute("role", "status");
  el.textContent = String(mensaje); // textContent: sin riesgo de XSS
  document.body.appendChild(el);

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => {
    el.classList.add("saliendo");
    setTimeout(() => el.remove(), 320);
  }, 3200);
}

/** Espera (para estados de carga). */
export function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* --- Fotos con respaldo de iniciales -------------------------------------- */

/**
 * Crea la imagen de un barbero; si no hay URL o la carga falla, muestra un
 * avatar con sus iniciales (evita imágenes rotas en toda la app).
 * @param {string|null} url
 * @param {string} nombre
 * @param {string} clase clase del elemento ('chair-foto' o 'avatar-iniciales')
 * @param {string} alt
 */
export function crearFoto(url, nombre, clase, alt) {
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt || "";
    img.loading = "lazy";
    img.addEventListener(
      "error",
      () => img.replaceWith(crearAvatar(nombre, clase)),
      { once: true }
    );
    return img;
  }
  return crearAvatar(nombre, clase);
}

/** Avatar circular (o cuadrado en las cards) con las iniciales del nombre. */
export function crearAvatar(nombre, clase) {
  const div = document.createElement("div");
  div.className = clase;
  div.setAttribute("role", "img");
  div.setAttribute("aria-label", nombre || "Barbero");
  const partes = String(nombre || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const primera = partes[0] ? partes[0][0] : "?";
  const segunda = partes.length > 1 ? partes[partes.length - 1][0] : "";
  div.textContent = (primera + segunda).toUpperCase();
  return div;
}
