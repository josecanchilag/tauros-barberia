/**
 * build.js — Genera js/config.js a partir de variables de entorno.
 *
 * Uso (sin dependencias, solo Node.js):
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   ADMIN_PASSWORD=secreta \
 *   node build.js
 *
 * Reglas:
 *  - Con las 3 variables completas: siempre sobrescribe js/config.js (Vercel).
 *  - Sin variables y con config.js existente: NO lo toca (desarrollo local).
 *  - Sin variables y sin config.js: crea uno con valores vacíos para que la
 *    página no falle con un 404 al cargar el archivo de configuración.
 *
 * En Vercel: Build Command = "node build.js", Output Directory = "."
 */
"use strict";

const fs = require("fs");
const path = require("path");

const RUTA_SALIDA = path.join(__dirname, "js", "config.js");

// --- 1. Leer variables de entorno -----------------------------------------
const url = (process.env.SUPABASE_URL || "").trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
const claveAdmin = (process.env.ADMIN_PASSWORD || "").trim();
const completas = Boolean(url && anonKey && claveAdmin);

// --- 2. Regla de desarrollo local -----------------------------------------
if (!completas && fs.existsSync(RUTA_SALIDA)) {
  console.log(
    "[build] Faltan variables de entorno y js/config.js ya existe: " +
      "se conserva el archivo actual (modo desarrollo local)."
  );
  process.exit(0);
}

// --- 3. Datos de ejemplo del negocio (fáciles de editar) -------------------
const BUSINESS = {
  nombre: "Tauros Barbería",
  direccion: "Carrera 17 # 92–12",
  direccionCorta: "Cra. 17 # 92–12",
  ciudad: "Bogotá, Colombia",
  telefono: "+57 310 555 0189",
  instagram: "@taurosbarberia",
  lema: "El arte de verte bien, en manos expertas.",
};

// --- 4. Contenido del archivo generado -------------------------------------
const contenido = `/**
 * ARCHIVO GENERADO POR build.js — no editar a mano.
 * Se crea con: node build.js  (las variables salen de process.env)
 * Este archivo está en .gitignore: cada entorno debe generar el suyo.
 */
window.TAUROS_CONFIG = {
  // Credenciales del proyecto Supabase (anon key = solo lectura/escritura con RLS abierto)
  SUPABASE_URL: ${JSON.stringify(url)},
  SUPABASE_ANON_KEY: ${JSON.stringify(anonKey)},
  // Contraseña del panel /admin (ver README: en producción se usaría autenticación real)
  ADMIN_PASSWORD: ${JSON.stringify(claveAdmin)},
  // Datos de la barbería mostrados en el sitio (dirección, teléfono, etc.)
  BUSINESS: ${JSON.stringify(BUSINESS, null, 2)},
};
`;

fs.mkdirSync(path.dirname(RUTA_SALIDA), { recursive: true });
fs.writeFileSync(RUTA_SALIDA, contenido, "utf8");

console.log(
  completas
    ? "[build] js/config.js generado con las variables de entorno."
    : "[build] js/config.js generado con valores vacíos (no hay variables de entorno)."
);
