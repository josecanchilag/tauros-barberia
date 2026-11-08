/**
 * config.example.js — Plantilla de js/config.js.
 *
 * En desarrollo local puedes copiarlo:
 *   cp js/config.example.js js/config.js
 * o simplemente ejecutar `node build.js` (genera js/config.js vacío si no
 * hay variables de entorno). En Vercel, build.js lo genera con las
 * variables del proyecto.
 *
 * Este archivo SÍ está en el repositorio; js/config.js NO (va en .gitignore).
 */
window.TAUROS_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-CLAVE-ANON",
  ADMIN_PASSWORD: "TU-CONTRASEÑA-DE-PRUEBA",
  BUSINESS: {
    nombre: "Tauros Barbería",
    direccion: "Carrera 17 # 92–12",
    direccionCorta: "Cra. 17 # 92–12",
    ciudad: "Bogotá, Colombia",
    telefono: "+57 310 555 0189",
    instagram: "@taurosbarberia",
    lema: "El arte de verte bien, en manos expertas.",
  },
};
