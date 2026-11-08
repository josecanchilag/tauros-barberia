/**
 * supabaseClient.js — Inicializa el cliente de Supabase (capa de datos).
 * El navegador habla directamente con Supabase (sin back-end propio):
 *  - lecturas/escrituras con la anon key y RLS abierto
 *  - suscripciones Realtime (postgres_changes) para actualizar sin recargar
 */
import { configuracion } from "./utils.js";

const cfg = configuracion();

/** Instancia de supabase-js o null si no está configurado/cargado. */
export let cliente = null;

/** Motivo por el que no hay conexión (para mostrar un mensaje amigable). */
export let motivoSinConexion = null;

if (typeof window.supabase === "undefined" || !window.supabase) {
  motivoSinConexion =
    "No se pudo cargar la librería de Supabase (revisa tu conexión a internet).";
} else if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
  motivoSinConexion =
    "Falta configurar Supabase. Ejecuta «node build.js» con SUPABASE_URL y SUPABASE_ANON_KEY.";
} else {
  try {
    cliente = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    motivoSinConexion = "No se pudo iniciar la conexión con Supabase.";
    console.warn("[tauros] Error al crear el cliente Supabase:", error.message);
  }
}

/** Lanza un error controlado si no hay conexión. */
export function exigirConexion() {
  if (!cliente) {
    const error = new Error(motivoSinConexion || "Sin conexión con Supabase.");
    error.sinConexion = true;
    throw error;
  }
  return cliente;
}

/**
 * Traduce un error de Supabase/red a un mensaje amigable en español.
 * Nunca muestra detalles técnicos crudos al usuario.
 */
export function mensajeError(error) {
  if (!error) return "Ocurrió un problema inesperado.";
  if (error.sinConexion) return error.message;
  if (error.message === "Failed to fetch" || error.message === "NetworkError") {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }
  if (error.code === "PGRST301" || error.code === "401") {
    return "No autorizado para realizar esta operación.";
  }
  if (error.code === "23505") {
    return "Este horario ya fue tomado, elige otro";
  }
  return "No pudimos completar la operación. Intenta de nuevo.";
}

/**
 * Ejecuta una consulta y lanza un error controlado si falla.
 * Uso: const filas = await ejecutar(db.from('barberos').select('id,nombre'));
 */
export async function ejecutar(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

/**
 * Se suscribe a cambios Realtime de varias tablas públicas.
 * @param {string[]} tablas ['citas','barberos','sillas','horarios']
 * @param {(tabla:string, payload:object) => void} alCambiar
 * @returns {{apagar:()=>void}|null}
 */
export function suscribirse(tablas, alCambiar) {
  if (!cliente) return null;
  try {
    const nombre = "tauros-" + Math.random().toString(36).slice(2, 9);
    const canal = cliente.channel(nombre);

    for (const tabla of tablas) {
      canal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla },
        (payload) => {
          try {
            alCambiar(tabla, payload);
          } catch (error) {
            console.warn("[tauros] Error al procesar cambio Realtime:", error);
          }
        }
      );
    }

    canal.subscribe((estado) => {
      // Sin Realtime la app sigue funcionando: solo no se actualizará sola.
      if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
        console.info("[tauros] Realtime no disponible; la app se actualizará al recargar.");
      }
    });

    return {
      apagar() {
        try {
          cliente.removeChannel(canal);
        } catch (error) {
          /* canal ya cerrado */
        }
      },
    };
  } catch (error) {
    console.warn("[tauros] No fue posible suscribirse a Realtime:", error.message);
    return null;
  }
}
