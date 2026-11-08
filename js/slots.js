/**
 * slots.js — Lógica de disponibilidad: calendario y grilla de horas.
 * Todo se deriva de la tabla `horarios` del barbero y de las citas
 * confirmadas en Supabase; nada está hardcodeado.
 */
import {
  aHHMM,
  aMinutos,
  deMinutos,
  hoy,
  esHoy,
  esPasada,
  parseFecha,
  minutosAhora,
} from "./utils.js";

/**
 * Genera las horas de inicio de cada slot para un horario dado.
 * @param {{hora_inicio:string, hora_fin:string, duracion_slot:number}} horario
 * @returns {string[]} ['09:00','09:30',...] mientras quepa en la jornada
 */
export function generarSlots(horario) {
  if (!horario) return [];
  const inicio = aMinutos(aHHMM(horario.hora_inicio));
  const fin = aMinutos(aHHMM(horario.hora_fin));
  const duracion = Number(horario.duracion_slot) > 0 ? Number(horario.duracion_slot) : 30;
  const slots = [];
  for (let t = inicio; t + duracion <= fin; t += duracion) {
    slots.push(deMinutos(t));
  }
  return slots;
}

/**
 * ¿El slot [hora, hora+duración) choca con alguna cita confirmada?
 * Se compara por intervalos para tolerar cambios de duración.
 * @param {string} hora hora de inicio del slot ('HH:MM')
 * @param {number} duracion minutos
 * @param {Array<{hora_inicio:string, hora_fin:string}>} citasDelDia
 */
export function slotOcupado(hora, duracion, citasDelDia) {
  const ini = aMinutos(hora);
  const fin = ini + duracion;
  return (citasDelDia || []).some((cita) => {
    const cIni = aMinutos(aHHMM(cita.hora_inicio));
    const cFin = cita.hora_fin ? aMinutos(aHHMM(cita.hora_fin)) : cIni + duracion;
    return cIni < fin && cFin > ini;
  });
}

/**
 * Horario activo de un barbero para un día de la semana en español.
 * @param {Array} horarios todas las filas de `horarios`
 * @param {string} barberoId
 * @param {string} dia 'lunes' … 'domingo'
 */
export function horarioDelDia(horarios, barberoId, dia) {
  return (
    (horarios || []).find(
      (h) => h.barbero_id === barberoId && h.dia_semana === dia && h.activo
    ) || null
  );
}

/** ¿Tiene al menos un horario activo el barbero? */
export function tieneHorario(horarios, barberoId) {
  return (horarios || []).some((h) => h.barbero_id === barberoId && h.activo);
}

/**
 * Días de un mes para el calendario (semana que empieza en lunes).
 * @param {number} anio
 * @param {number} mes 0-11
 * @returns {Array<{fecha:string, numero:number, dow:number, relleno:boolean}>}
 */
export function diasDelMes(anio, mes) {
  const primerDia = new Date(anio, mes, 1);
  const totalDias = new Date(anio, mes + 1, 0).getDate();
  // Lunes = 0 … Domingo = 6
  const offset = (primerDia.getDay() + 6) % 7;
  const dias = [];
  for (let i = 0; i < offset; i++) {
    dias.push({ relleno: true });
  }
  for (let n = 1; n <= totalDias; n++) {
    const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
    dias.push({
      relleno: false,
      fecha,
      numero: n,
      dow: parseFecha(fecha).getDay(),
    });
  }
  return dias;
}

/**
 * ¿Una fecha del calendario está disponible para el barbero?
 *  - no puede ser pasada
 *  - el barbero debe tener horario activo ese día de la semana
 */
export function fechaDisponible(fechaStr, horariosBarbero) {
  if (esPasada(fechaStr)) return false;
  const nombres = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  const dia = nombres[parseFecha(fechaStr).getDay()];
  return (horariosBarbero || []).some((h) => h.dia_semana === dia && h.activo);
}

/**
 * ¿Pasa el filtro de "hora ya pasada"? Solo aplica si la fecha es hoy.
 * @param {string} fechaStr
 * @param {string} hora 'HH:MM'
 */
export function horaPasada(fechaStr, hora) {
  if (!esHoy(fechaStr)) return false;
  return aMinutos(hora) <= minutosAhora();
}

/**
 * Marca los slots que ya no se pueden ofrecer (ocupados u hora pasada).
 * @returns {{hora:string, ocupado:boolean}[]}
 */
export function evaluarSlots(slots, horario, citasDelDia, fechaStr) {
  const duracion = Number(horario?.duracion_slot) > 0 ? Number(horario.duracion_slot) : 30;
  return slots.map((hora) => ({
    hora,
    ocupado: slotOcupado(hora, duracion, citasDelDia) || horaPasada(fechaStr, hora),
  }));
}

/** ¿La fecha pedida sigue siendo válida (no pasó)? */
export function fechaValida(fechaStr) {
  return Boolean(fechaStr) && fechaStr >= hoy();
}
