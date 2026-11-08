/**
 * cliente.js — Capa de presentación y lógica del cliente (sin autenticación).
 *
 * Pantallas: home (sillas), modal de reserva de 3 pasos y confirmación.
 * Datos: todo viene de Supabase (sillas, barberos, horarios, citas), nada
 * está hardcodeado. Se suscribe a Realtime para actualizarse sin recargar.
 *
 * RF-01 ver sillas · RF-02 seleccionar silla · RF-03 elegir fecha ·
 * RF-04 ver slots libres/ocupados · RF-05 reservar con nombre obligatorio ·
 * RF-06 mensaje de confirmación · RF-12 barberos desactivados ocultan sus slots.
 */
import {
  DIAS_CORTO_ES,
  MESES,
  aHHMM,
  aviso,
  crearFoto,
  diaDeSemana,
  esc,
  fechaLarga,
  fechaPaso,
  fechaResumen,
  icono,
  horaBonita,
  hoy,
  negocio,
  sumarMinutos,
} from "./utils.js";
import {
  cliente as db,
  ejecutar,
  exigirConexion,
  mensajeError,
  suscribirse,
} from "./supabaseClient.js";
import {
  diasDelMes,
  evaluarSlots,
  fechaDisponible,
  fechaValida,
  generarSlots,
  horarioDelDia,
  slotOcupado,
  tieneHorario,
} from "./slots.js";

/* --- Utilidades de DOM ---------------------------------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const reducirMovimiento = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* --- Estado de la aplicación ---------------------------------------------- */
const estado = {
  sillas: [],
  barberos: [],
  horarios: [],
  cargando: true,
  errorCarga: null,
  reserva: null, // reserva en curso dentro del modal
  cita: null, // cita recién confirmada (vista de confirmación)
  barberoCita: null,
  flashSillas: new Set(), // sillas que deben destellar por Realtime
};

/* ==========================================================================
   ARRANQUE
   ========================================================================== */

function iniciar() {
  inyectarNegocio();

  $("#btn-hero").addEventListener("click", () => abrirReserva(null));
  $$(".logo").forEach((logo) =>
    logo.addEventListener("click", () => {
      mostrarVista("home");
      window.scrollTo({ top: 0 });
    })
  );
  $$("[data-volver-inicio]").forEach((btn) =>
    btn.addEventListener("click", () => {
      mostrarVista("home");
      window.scrollTo({ top: 0 });
    })
  );
  $("#conf-volver").addEventListener("click", () => {
    mostrarVista("home");
    window.scrollTo({ top: 0 });
  });
  $("#btn-reintentar").addEventListener("click", () => cargarDatos());

  cargarDatos();
  escucharTiempoReal();
}

/** Rellena el pie de página con los datos de BUSINESS (config.js). */
function inyectarNegocio() {
  const n = negocio();
  $("#pie-direccion").textContent = n.direccion;
  $("#pie-ciudad").textContent = n.ciudad;
  $("#pie-telefono").textContent = n.telefono;
  const instagram = $("#pie-instagram");
  instagram.textContent = n.instagram;
  $("#pie-anio").textContent = `© ${new Date().getFullYear()} ${n.nombre}`;
  $("#pie-lema").textContent = n.lema;
}

/* ==========================================================================
   CARGA DE DATOS DESDE SUPABASE
   ========================================================================== */

/** Trae sillas, barberos y horarios en paralelo (solo columnas necesarias). */
async function cargarDatos() {
  estado.cargando = true;
  estado.errorCarga = null;
  renderSillas();

  try {
    exigirConexion();
    const [sillas, barberos, horarios] = await Promise.all([
      ejecutar(db.from("sillas").select("id,nombre,barbero_id,activa")),
      ejecutar(
        db.from("barberos").select("id,nombre,especialidad,silla_id,activo,foto_url")
      ),
      ejecutar(
        db
          .from("horarios")
          .select(
            "id,barbero_id,dia_semana,hora_inicio,hora_fin,duracion_slot,activo"
          )
      ),
    ]);
    estado.sillas = sillas;
    estado.barberos = barberos;
    estado.horarios = horarios;
    estado.cargando = false;
  } catch (error) {
    estado.cargando = false;
    estado.errorCarga = mensajeError(error);
    console.warn("[tauros] No fue posible cargar la información:", error);
  }
  renderTodo();
}

/** Combina sillas con su barbero y calcula la disponibilidad (RF-01/RF-02). */
function sillasConBarbero() {
  const porId = new Map(estado.barberos.map((b) => [b.id, b]));
  const items = [];
  for (const silla of ordenarSillas(estado.sillas)) {
    const barbero = porId.get(silla.barbero_id);
    if (!barbero) continue; // silla sin barbero asignado: no se muestra
    const disponible = Boolean(
      barbero.activo && silla.activa && tieneHorario(estado.horarios, barbero.id)
    );
    items.push({ silla, barbero, disponible });
  }
  return items;
}

/** Ordena las sillas por el número de su id ('silla_2' antes que 'silla_10'). */
function ordenarSillas(sillas) {
  return [...sillas].sort((a, b) => {
    const num = (s) => {
      const m = String(s.id).match(/(\d+)$/);
      return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
    };
    return num(a) - num(b) || String(a.nombre).localeCompare(String(b.nombre), "es");
  });
}

/** ¿Hay al menos una silla reservable ahora mismo? */
function hayDisponibles() {
  return sillasConBarbero().some((i) => i.disponible);
}

/* ==========================================================================
   RENDER: HOME
   ========================================================================== */

function renderTodo() {
  renderHero();
  renderSillas();
}

/** "ABIERTO HOY / CERRADO HOY" calculado con los horarios de hoy (RF-12). */
function renderHero() {
  const dia = diaDeHoy();
  const activos = new Set(estado.barberos.filter((b) => b.activo).map((b) => b.id));
  const delDia = estado.horarios.filter(
    (h) => h.activo && h.dia_semana === dia && activos.has(h.barbero_id)
  );

  const etiqueta = $("#hero-estado");
  const horario = $("#hero-horario");
  if (delDia.length) {
    const inicio = delDia
      .map((h) => aHHMM(h.hora_inicio))
      .sort((a, b) => a.localeCompare(b))[0];
    const fin = delDia
      .map((h) => aHHMM(h.hora_fin))
      .sort((a, b) => b.localeCompare(a))[0];
    etiqueta.textContent = "ABIERTO HOY";
    horario.textContent = `${horaBonita(inicio)} — ${horaBonita(fin)}`;
  } else {
    etiqueta.textContent = "CERRADO HOY";
    horario.textContent = "Sin horarios hoy";
  }

  $("#btn-hero").disabled = estado.cargando || !hayDisponibles();
}

/** Nombre del día de la semana en español (lunes, martes, ...). */
function diaDeHoy() {
  return diaDeSemana(hoy());
}

/** Pinta la grilla de sillas, el estado vacío o los estados de carga/error. */
function renderSillas() {
  const cont = $("#chair-grid");
  const vacio = $("#estado-vacio");
  const error = $("#estado-error");
  cont.innerHTML = "";
  vacio.classList.add("oculto");
  error.classList.add("oculto");

  // Carga: 3 tarjetas esqueleto con shimmer
  if (estado.cargando) {
    cont.classList.remove("oculto");
    cont.innerHTML =
      '<div class="skeleton skeleton-card"></div>'.repeat(3);
    return;
  }

  // Error de red / Supabase: mensaje amigable con reintento
  if (estado.errorCarga) {
    cont.classList.add("oculto");
    error.classList.remove("oculto");
    $("#estado-error p").textContent = estado.errorCarga;
    return;
  }

  const items = sillasConBarbero();
  const disponibles = items.some((i) => i.disponible);

  // Ningún barbero disponible: estado vacío del mockup + botón hero deshabilitado
  if (!disponibles) {
    cont.classList.add("oculto");
    vacio.classList.remove("oculto");
    return;
  }

  cont.classList.remove("oculto");
  items.forEach((item, indice) => cont.appendChild(crearTarjeta(item, indice)));
  observarTarjetas(cont);

  // Destello dorado para las sillas que cambiaron por Realtime
  for (const id of estado.flashSillas) {
    const card = cont.querySelector(`[data-silla="${CSS.escape(id)}"]`);
    if (card) {
      card.classList.add("flash");
      setTimeout(() => card.classList.remove("flash"), 700);
    }
  }
  estado.flashSillas.clear();
}

/** Construye una card de silla (número, foto, estado, barbero y botón). */
function crearTarjeta(item, indice) {
  const { silla, barbero, disponible } = item;

  const articulo = document.createElement("article");
  articulo.className = "chair-card" + (disponible ? "" : " unavailable");
  articulo.style.setProperty("--i", indice);
  articulo.dataset.silla = silla.id;

  const numero = document.createElement("div");
  numero.className = "chair-number";
  numero.textContent = String(indice + 1).padStart(2, "0");
  articulo.appendChild(numero);

  articulo.appendChild(
    crearFoto(
      barbero.foto_url,
      barbero.nombre,
      "chair-foto",
      `Retrato de ${barbero.nombre}`
    )
  );

  const copia = document.createElement("div");
  copia.className = "chair-copy";

  const estadoEl = document.createElement("span");
  estadoEl.className = `status ${disponible ? "available" : "off"}`;
  const punto = document.createElement("i");
  estadoEl.appendChild(punto);
  estadoEl.appendChild(
    document.createTextNode(disponible ? "Disponible" : "No disponible")
  );
  copia.appendChild(estadoEl);

  const titulo = document.createElement("h3");
  titulo.textContent = silla.nombre;
  copia.appendChild(titulo);

  const nombreBarbero = document.createElement("p");
  nombreBarbero.className = "barber-name";
  nombreBarbero.textContent = barbero.nombre;
  copia.appendChild(nombreBarbero);

  const especialidad = document.createElement("p");
  especialidad.textContent = barbero.especialidad || "Sin especialidad registrada";
  copia.appendChild(especialidad);

  const boton = document.createElement("button");
  boton.type = "button";
  boton.disabled = !disponible;
  boton.setAttribute(
    "aria-label",
    disponible
      ? `Reservar la silla ${silla.nombre} con ${barbero.nombre}`
      : `La silla ${silla.nombre} no está disponible`
  );
  boton.innerHTML = disponible ? "Reservar esta silla " : "Sin horarios hoy ";
  const flecha = document.createElement("span");
  flecha.innerHTML = icono("arrow", 17);
  boton.appendChild(flecha.firstChild);
  if (disponible) {
    boton.addEventListener("click", () => {
      articulo.classList.add("seleccionada");
      setTimeout(() => articulo.classList.remove("seleccionada"), 500);
      abrirReserva(barbero.id);
    });
  }
  copia.appendChild(boton);

  articulo.appendChild(copia);
  return articulo;
}

/** Entrada en cascada de las cards con IntersectionObserver (90 ms c/u). */
function observarTarjetas(cont) {
  const tarjetas = $$(".chair-card", cont);
  if (reducirMovimiento() || !("IntersectionObserver" in window)) {
    tarjetas.forEach((t) => t.classList.add("in-view"));
    return;
  }
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("in-view");
          observador.unobserve(entrada.target);
        }
      }
    },
    { threshold: 0.12 }
  );
  tarjetas.forEach((t) => observador.observe(t));
}

/* ==========================================================================
   MODAL DE RESERVA (3 PASOS)
   ========================================================================== */

/** Abre el modal con el barbero pedido (o el primero disponible). */
function abrirReserva(barberoId) {
  const items = sillasConBarbero();
  const item = barberoId
    ? items.find((i) => i.barbero.id === barberoId)
    : items.find((i) => i.disponible);

  if (!item || !item.disponible) {
    aviso("Este barbero ya no está disponible. Elige otro.", "error");
    return;
  }

  const ahora = new Date();
  estado.reserva = {
    silla: item.silla,
    barbero: item.barbero,
    paso: 1,
    dir: 1,
    anio: ahora.getFullYear(),
    mes: ahora.getMonth(),
    fecha: null,
    hora: null,
    nombre: "",
    contacto: "",
    citas: [],
    cargandoSlots: false,
    errorSlots: null,
    errorSlot: false,
    errorForm: false,
    errorRed: null,
    confirmando: false,
  };

  const cont = $("#modal-reserva");
  cont.innerHTML = `
    <div class="modal-backdrop abriendo" role="dialog" aria-modal="true" aria-label="Agendar una cita">
      <div class="booking-modal">
        <div class="modal-top">
          <div>
            <span class="eyebrow">RESERVA EN LÍNEA</span>
            <h2>Agenda tu cita</h2>
          </div>
          <button class="icon-btn" type="button" data-cerrar aria-label="Cerrar">${icono(
            "close"
          )}</button>
        </div>
        <div class="booking-barber"></div>
        <div class="progress" data-progress></div>
        <div class="modal-body" data-body></div>
        <div class="modal-actions" data-actions></div>
      </div>
    </div>`;

  // Cabecera del barbero (foto con respaldo de iniciales)
  const bloque = $(".booking-barber", cont);
  bloque.appendChild(
    crearFoto(item.barbero.foto_url, item.barbero.nombre, "avatar-iniciales", "")
  );
  const info = document.createElement("div");
  const small = document.createElement("small");
  small.textContent = "TU BARBERO";
  const b = document.createElement("b");
  b.textContent = item.barbero.nombre;
  const span = document.createElement("span");
  span.textContent = item.silla.nombre;
  info.append(small, b, span);
  bloque.appendChild(info);

  const backdrop = $(".modal-backdrop", cont);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cerrarReserva();
  });
  $("[data-cerrar]", cont).addEventListener("click", () => cerrarReserva());
  document.addEventListener("keydown", cerrarConEscape);

  setTimeout(() => backdrop.classList.remove("abriendo"), 340);
  pintarPaso();
  $("[data-cerrar]", cont).focus();
}

function cerrarConEscape(e) {
  if (e.key === "Escape" && estado.reserva) cerrarReserva();
}

/** Cierra el modal (con animación inversa, o de inmediato si es instantáneo). */
function cerrarReserva(instantaneo = false) {
  document.removeEventListener("keydown", cerrarConEscape);
  const cont = $("#modal-reserva");
  const backdrop = $(".modal-backdrop", cont);
  estado.reserva = null;
  if (!backdrop) return;
  if (instantaneo) {
    backdrop.remove();
    return;
  }
  backdrop.classList.remove("abriendo");
  backdrop.classList.add("cerrando");
  setTimeout(() => backdrop.remove(), 320);
}

/** Cambia de paso con deslizamiento lateral (dir: 1 adelante, -1 atrás). */
function irPaso(paso) {
  const r = estado.reserva;
  if (!r) return;
  r.dir = paso > r.paso ? 1 : -1;
  r.paso = paso;
  pintarPaso();
  if (paso === 2) cargarSlots();
}

/** Repinta barra de progreso, contenido y acciones del paso actual. */
function pintarPaso() {
  const r = estado.reserva;
  if (!r) return;
  const cont = $("#modal-reserva");
  if (!cont.querySelector(".modal-backdrop")) return;

  // --- Progreso ---
  const progreso = $("[data-progress]", cont);
  progreso.innerHTML = ["Fecha", "Hora", "Tus datos"]
    .map((etiqueta, i) => {
      const n = i + 1;
      const clases = [];
      if (r.paso >= n) clases.push("active");
      if (r.paso > n) clases.push("done");
      const marca =
        r.paso > n ? icono("check", 14) : String(n);
      return `<div class="${clases.join(" ")}"><span>${marca}</span><b>${etiqueta}</b></div>`;
    })
    .join("");

  // --- Contenido del paso ---
  const cuerpo = $("[data-body]", cont);
  if (r.paso === 1) cuerpo.innerHTML = contenidoPaso1(r);
  else if (r.paso === 2) cuerpo.innerHTML = contenidoPaso2(r);
  else cuerpo.innerHTML = contenidoPaso3(r);

  const pasoEl = $(".step-content", cuerpo);
  if (pasoEl && r.dir < 0) pasoEl.classList.add("atras");

  // --- Acciones (no aparecen en el paso 3: ahí está el formulario) ---
  const acciones = $("[data-actions]", cont);
  if (r.paso === 3) {
    acciones.classList.add("oculto");
  } else {
    acciones.classList.remove("oculto");
    const sinFecha = r.paso === 1 && !r.fecha;
    const sinHora = r.paso === 2 && !r.hora;
    acciones.innerHTML = `
      <button class="btn btn-ghost" type="button" data-atras>${
        r.paso === 1 ? "Cancelar" : "Atrás"
      }</button>
      <button class="btn btn-dark" type="button" data-continuar ${
        sinFecha || sinHora ? "disabled" : ""
      }>Continuar ${icono("arrow", 17)}</button>`;
    $("[data-atras]", acciones).addEventListener("click", () => {
      if (r.paso === 1) cerrarReserva();
      else irPaso(r.paso - 1);
    });
    $("[data-continuar]", acciones).addEventListener("click", () =>
      irPaso(r.paso + 1)
    );
  }

  if (r.paso === 1) vincularPaso1();
  else if (r.paso === 2) vincularPaso2();
  else vincularPaso3();
}

/* --- Paso 1: calendario real ---------------------------------------------- */

function contenidoPaso1(r) {
  const horariosBarbero = estado.horarios.filter(
    (h) => h.barbero_id === r.barbero.id && h.activo
  );
  const dias = diasDelMes(r.anio, r.mes);
  const mesActual = new Date().getMonth();
  const anioActual = new Date().getFullYear();
  const enPasado = r.anio < anioActual || (r.anio === anioActual && r.mes <= mesActual);

  const celdas = dias
    .map((d, i) => {
      if (d.relleno) return '<span aria-hidden="true"></span>';
      const disponible = fechaDisponible(d.fecha, horariosBarbero);
      const seleccionada = r.fecha === d.fecha;
      return (
        `<button type="button" style="--i:${i}" data-fecha="${d.fecha}" ` +
        `class="${seleccionada ? "selected" : ""}" ${disponible ? "" : "disabled"} ` +
        `aria-label="${esc(fechaPaso(d.fecha))}">${d.numero}</button>`
      );
    })
    .join("");

  const tituloMes = MESES[r.mes].charAt(0).toUpperCase() + MESES[r.mes].slice(1);

  return `
    <div class="step-content">
      <div class="step-title">
        <div>
          <h3>Elige una fecha</h3>
          <p>Selecciona un día disponible</p>
        </div>
        <div class="mes-nav">
          <button type="button" data-mes="-1" ${enPasado ? "disabled" : ""}
            aria-label="Mes anterior">${icono("arrow-left", 14)}</button>
          <b>${tituloMes} ${r.anio}</b>
          <button type="button" data-mes="1"
            aria-label="Mes siguiente">${icono("arrow", 14)}</button>
        </div>
      </div>
      <div class="calendar">
        ${DIAS_CORTO_ES.map(
          (d) => `<span class="day-name">${d}</span>`
        ).join("")}
        ${celdas}
      </div>
    </div>`;
}

function vincularPaso1() {
  const r = estado.reserva;
  const cuerpo = $("[data-body]");

  $$("[data-mes]", cuerpo).forEach((btn) =>
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.mes);
      let mes = r.mes + delta;
      let anio = r.anio;
      if (mes < 0) {
        mes = 11;
        anio -= 1;
      } else if (mes > 11) {
        mes = 0;
        anio += 1;
      }
      r.mes = mes;
      r.anio = anio;
      // Si el mes elegido ya no contiene la fecha seleccionada, se limpia
      if (r.fecha && !r.fecha.startsWith(`${anio}-${String(mes + 1).padStart(2, "0")}`)) {
        r.fecha = null;
        r.hora = null;
      }
      pintarPaso();
    })
  );

  $$("[data-fecha]", cuerpo).forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      r.fecha = btn.dataset.fecha;
      r.hora = null; // cambiar de fecha invalida la hora elegida
      r.errorSlot = false;
      pintarPaso();
    })
  );
}

/* --- Paso 2: grilla de horas ---------------------------------------------- */

function contenidoPaso2(r) {
  const horario = horarioDelDia(
    estado.horarios,
    r.barbero.id,
    diaDeSemana(r.fecha)
  );

  const titulo = `
    <div class="step-title">
      <div>
        <h3>Elige una hora</h3>
        <p>${esc(fechaPaso(r.fecha))}</p>
      </div>
      <div class="legend">
        <span><i class="free"></i> Libre</span>
        <span><i></i> Ocupado</span>
      </div>
    </div>`;

  // El horario del día desapareció (lo cambiaron mientras tanto)
  if (!horario) {
    return `
      <div class="step-content">
        ${titulo}
        <div class="mini-error">
          Este día ya no tiene horarios disponibles.
          <button class="btn btn-ghost" type="button" data-otra-fecha>Elegir otra fecha</button>
        </div>
      </div>`;
  }

  // Carga de citas del día: skeletons con shimmer
  if (r.cargandoSlots) {
    return `
      <div class="step-content">
        ${titulo}
        <div class="slots">
          ${'<div class="skeleton skeleton-slot"></div>'.repeat(8)}
        </div>
      </div>`;
  }

  // Error de red al traer las citas
  if (r.errorSlots) {
    return `
      <div class="step-content">
        ${titulo}
        <div class="mini-error">
          ${esc(r.errorSlots)}
          <button class="btn btn-ghost" type="button" data-reintentar>Intentar de nuevo</button>
        </div>
      </div>`;
  }

  const slots = generarSlots(horario);
  const evaluados = evaluarSlots(slots, horario, r.citas, r.fecha);

  const botones = evaluados
    .map((s, i) => {
      const clases = [];
      if (s.ocupado) clases.push("occupied");
      if (!s.ocupado && r.hora === s.hora) clases.push("selected");
      return (
        `<button type="button" style="--i:${i}" data-hora="${s.hora}" ` +
        `class="${clases.join(" ")}" ${s.ocupado ? 'aria-disabled="true"' : ""}>` +
        `${s.hora}</button>`
      );
    })
    .join("");

  const banner = r.errorSlot ? bannerSlot() : "";

  return `
    <div class="step-content">
      ${titulo}
      ${banner}
      <div class="slots">${botones}</div>
    </div>`;
}

function bannerSlot() {
  return `
    <div class="error-banner" role="alert">
      <b>Este horario ya fue tomado, elige otro</b>
      <button type="button" data-cerrar-banner aria-label="Cerrar aviso">${icono(
        "close",
        16
      )}</button>
    </div>`;
}

function vincularPaso2() {
  const r = estado.reserva;
  const cuerpo = $("[data-body]");

  const reintento = $("[data-reintentar]", cuerpo);
  if (reintento) reintento.addEventListener("click", () => cargarSlots());

  const otraFecha = $("[data-otra-fecha]", cuerpo);
  if (otraFecha) otraFecha.addEventListener("click", () => irPaso(1));

  const cerrarBanner = $("[data-cerrar-banner]", cuerpo);
  if (cerrarBanner) {
    cerrarBanner.addEventListener("click", () => {
      r.errorSlot = false;
      $(".error-banner", cuerpo)?.remove();
    });
  }

  $$(".slots button[data-hora]", cuerpo).forEach((btn) =>
    btn.addEventListener("click", () => {
      const ocupado = btn.classList.contains("occupied");
      if (ocupado) {
        // Clic en un slot ocupado: aviso con banner + shake (como el mockup)
        r.hora = null;
        r.errorSlot = true;
        mostrarBannerSlot();
        $$(".slots button.selected", cuerpo).forEach((b) =>
          b.classList.remove("selected")
        );
        const continuar = $("[data-continuar]");
        if (continuar) continuar.disabled = true;
        return;
      }
      r.hora = btn.dataset.hora;
      r.errorSlot = false;
      mostrarBannerSlot(); // retira el banner si estaba
      $$(".slots button", cuerpo).forEach((b) =>
        b.classList.toggle("selected", b.dataset.hora === r.hora)
      );
      const continuar = $("[data-continuar]");
      if (continuar) continuar.disabled = false;
    })
  );
}

/** Inserta o quita el banner de "horario tomado" sin repintar la grilla. */
function mostrarBannerSlot() {
  const r = estado.reserva;
  const paso = $(".step-content");
  if (!paso) return;
  const previo = $(".error-banner", paso);
  if (previo) previo.remove();
  if (r.errorSlot) {
    const temp = document.createElement("div");
    temp.innerHTML = bannerSlot();
    const banner = temp.firstElementChild;
    paso.insertBefore(banner, $(".slots", paso) || null);
    $("[data-cerrar-banner]", banner).addEventListener("click", () => {
      r.errorSlot = false;
      banner.remove();
    });
  }
}

/** Trae las citas confirmadas del barbero/fecha y pinta la grilla (RF-04). */
async function cargarSlots() {
  const r = estado.reserva;
  if (!r || r.paso !== 2) return;
  r.cargandoSlots = true;
  r.errorSlots = null;
  pintarPaso();

  try {
    exigirConexion();
    const citas = await ejecutar(
      db
        .from("citas")
        .select("hora_inicio,hora_fin,estado")
        .eq("barbero_id", r.barbero.id)
        .eq("fecha", r.fecha)
        .eq("estado", "confirmada")
    );
    r.citas = citas;
    r.cargandoSlots = false;

    // Si la hora elegida dejó de estar libre, vuelve a mostrarse la grilla
    if (r.hora) {
      const horario = horarioDelDia(estado.horarios, r.barbero.id, diaDeSemana(r.fecha));
      const dur = Number(horario?.duracion_slot) || 30;
      if (slotOcupado(r.hora, dur, citas)) {
        r.hora = null;
        r.errorSlot = true;
      }
    }
  } catch (error) {
    r.cargandoSlots = false;
    r.errorSlots = mensajeError(error);
    console.warn("[tauros] No se pudieron cargar los horarios:", error);
  }
  if (estado.reserva === r && r.paso === 2) pintarPaso();
}

/* --- Paso 3: datos del cliente y confirmación ------------------------------ */

function contenidoPaso3(r) {
  return `
    <form class="step-content details-form" data-form novalidate>
      <div class="step-title">
        <div>
          <h3>Cuéntanos quién eres</h3>
          <p>Usaremos estos datos para tu reserva</p>
        </div>
      </div>
      <label>
        Nombre completo <b>*</b>
        <input type="text" data-nombre autocomplete="name"
          class="${r.errorForm ? "input-error" : ""}"
          placeholder="Ej. Carlos Ramírez">
      </label>
      <span class="field-error ${r.errorForm ? "" : "oculto"}" data-error-nombre>
        Ingresa tu nombre para continuar.
      </span>
      <label>
        Teléfono o correo <em>Opcional</em>
        <input type="text" data-contacto autocomplete="tel"
          placeholder="Para enviarte un recordatorio">
      </label>
      <div class="booking-summary">
        ${icono("calendar")}
        <span>
          <small>${esc(fechaResumen(r.fecha))}</small>
          <b>${esc(r.hora)} · ${esc(r.barbero.nombre)}</b>
        </span>
      </div>
      <div class="error-banner ${r.errorRed ? "" : "oculto"}" role="alert" data-error-red>
        <b>${esc(r.errorRed || "")}</b>
        <button type="button" data-cerrar-red aria-label="Cerrar aviso">${icono(
          "close",
          16
        )}</button>
      </div>
      <button class="btn btn-gold btn-block" type="submit" data-confirmar>
        ${icono("check")} <span>Confirmar cita</span>
      </button>
    </form>`;
}

function vincularPaso3() {
  const r = estado.reserva;
  const cuerpo = $("[data-body]");
  const nombre = $("[data-nombre]", cuerpo);
  const contacto = $("[data-contacto]", cuerpo);

  // Los valores se asignan por propiedad (nunca por interpolación de HTML)
  nombre.value = r.nombre;
  contacto.value = r.contacto;

  nombre.addEventListener("input", () => {
    r.nombre = nombre.value;
    if (r.nombre.trim()) {
      r.errorForm = false;
      nombre.classList.remove("input-error");
      $("[data-error-nombre]", cuerpo).classList.add("oculto");
    }
  });
  contacto.addEventListener("input", () => {
    r.contacto = contacto.value;
  });

  const cerrarRed = $("[data-cerrar-red]", cuerpo);
  if (cerrarRed) {
    cerrarRed.addEventListener("click", () => {
      r.errorRed = null;
      $("[data-error-red]", cuerpo).classList.add("oculto");
    });
  }

  $("[data-form]", cuerpo).addEventListener("submit", confirmarCita);
}

/**
 * Confirmar la cita (RF-05):
 *  1. valida el nombre obligatorio
 *  2. vuelve a consultar Supabase para comprobar que el slot sigue libre
 *     (condición de carrera) e inserta la cita
 *  3. si el índice único (23505) o la verificación fallan, regresa al paso
 *     de hora con el banner "Este horario ya fue tomado, elige otro"
 */
async function confirmarCita(evento) {
  evento.preventDefault();
  const r = estado.reserva;
  if (!r || r.confirmando) return;

  // --- Validación local del nombre (RF-05) ---
  if (!r.nombre.trim()) {
    r.errorForm = true;
    const nombre = $("[data-nombre]");
    const error = $("[data-error-nombre]");
    if (nombre && error) {
      nombre.classList.remove("input-error");
      void nombre.offsetWidth; // reinicia la animación de temblor
      nombre.classList.add("input-error");
      error.classList.remove("oculto");
      nombre.focus();
    }
    return;
  }

  r.confirmando = true;
  r.errorRed = null;
  pintarBotonConfirmacion(true);

  try {
    exigirConexion();

    // --- Condición de carrera: re-verificar que el slot siga libre ---
    const [previas, barberoAhora] = await Promise.all([
      ejecutar(
        db
          .from("citas")
          .select("id")
          .eq("barbero_id", r.barbero.id)
          .eq("fecha", r.fecha)
          .eq("hora_inicio", r.hora)
          .eq("estado", "confirmada")
      ),
      ejecutar(
        db.from("barberos").select("id,activo").eq("id", r.barbero.id).maybeSingle()
      ),
    ]);

    if (!barberoAhora || !barberoAhora.activo) {
      cerrarReserva(true);
      aviso("Este barbero ya no está disponible. Elige otro.", "error");
      await cargarDatos();
      return;
    }
    if (!fechaValida(r.fecha)) {
      throw Object.assign(new Error("fecha pasada"), { tipo: "fecha" });
    }
    if (previas.length) {
      return conflictoDeSlot();
    }

    // --- Duración de la cita = duracion_slot del horario de ese día ---
    const horario = horarioDelDia(estado.horarios, r.barbero.id, diaDeSemana(r.fecha));
    const duracion = Number(horario?.duracion_slot) || 30;

    // --- Insertar la cita ---
    const { data, error } = await db
      .from("citas")
      .insert([
        {
          barbero_id: r.barbero.id,
          cliente_nombre: r.nombre.trim(),
          cliente_contacto: r.contacto.trim() || null,
          fecha: r.fecha,
          hora_inicio: r.hora,
          hora_fin: sumarMinutos(r.hora, duracion),
          estado: "confirmada",
        },
      ])
      .select("id,fecha,hora_inicio,hora_fin,cliente_nombre,barbero_id")
      .single();

    if (error) {
      // Índice único violado (23505): otra persona tomó el slot entre medias
      if (error.code === "23505" || String(error.message || "").includes("23505")) {
        return conflictoDeSlot();
      }
      throw error;
    }

    mostrarConfirmacion(data);
  } catch (error) {
    r.confirmando = false;
    if (error.tipo === "fecha") {
      conflictoDeSlot();
      aviso("La fecha seleccionada ya pasó. Elige otra.", "error");
      return;
    }
    r.errorRed = mensajeError(error);
    console.warn("[tauros] No se pudo confirmar la cita:", error);
    pintarPaso();
  }
}

/** Vuelve al paso 2 con el banner de error y refresca la grilla. */
function conflictoDeSlot() {
  const r = estado.reserva;
  if (!r) return;
  r.confirmando = false;
  r.hora = null;
  r.errorSlot = true;
  r.paso = 2;
  r.dir = -1;
  pintarPaso();
  cargarSlots();
}

/** Cambia el botón de confirmación a estado de carga (poste de barbero). */
function pintarBotonConfirmacion(cargando) {
  const btn = $("[data-confirmar]");
  if (!btn) return;
  btn.disabled = cargando;
  btn.innerHTML = cargando
    ? '<span class="pole"></span><span>Confirmando…</span>'
    : `${icono("check")}<span>Confirmar cita</span>`;
}

/* ==========================================================================
   VISTA DE CONFIRMACIÓN (RF-06)
   ========================================================================== */

function mostrarConfirmacion(cita) {
  estado.cita = cita;
  estado.barberoCita = estado.reserva?.barbero || null;
  cerrarReserva(true);
  pintarConfirmacion();
  mostrarVista("confirmacion");
  window.scrollTo({ top: 0 });
}

function pintarConfirmacion() {
  const cita = estado.cita;
  const barbero = estado.barberoCita;
  if (!cita || !barbero) return;
  const n = negocio();

  // "Todo listo, Carlos." (solo el primer nombre)
  const primero = String(cita.cliente_nombre || "").trim().split(/\s+/)[0] || "cliente";
  $("#conf-titulo").textContent = `Todo listo, ${primero}.`;

  // Código del recibo: #TB- + primeros 4 caracteres del id en mayúsculas
  $("#conf-codigo").textContent =
    "#TB-" + String(cita.id).slice(0, 4).toUpperCase();

  const foto = $("#conf-foto");
  foto.replaceWith(
    (() => {
      const el = crearFoto(
        barbero.foto_url,
        barbero.nombre,
        "avatar-iniciales",
        ""
      );
      el.id = "conf-foto";
      return el;
    })()
  );

  $("#conf-barbero").textContent = barbero.nombre;
  $("#conf-especialidad").textContent = barbero.especialidad || "";
  $("#conf-fecha").textContent = fechaLarga(cita.fecha);
  $("#conf-hora").textContent = horaBonita(aHHMM(cita.hora_inicio));
  $("#conf-cliente").textContent = cita.cliente_nombre;
  $("#conf-lugar").textContent = n.direccionCorta;
}

/** Alterna entre home y confirmación. */
function mostrarVista(nombre) {
  $("#vista-home").classList.toggle("oculto", nombre !== "home");
  $("#vista-confirmacion").classList.toggle("oculto", nombre !== "confirmacion");
}

/* ==========================================================================
   TIEMPO REAL (postgres_changes en citas, barberos, sillas y horarios)
   ========================================================================== */

let temporizadorRealtime = null;

function escucharTiempoReal() {
  suscribirse(["citas", "barberos", "sillas", "horarios"], (tabla, payload) => {
    if (tabla === "citas") {
      alCambiarCitas(payload);
      return;
    }
    // barberos / sillas / horarios: refrescar disponibilidad de las cards
    programarRecarga(payload);
  });
}

/** Debounce: muchas filas seguidas (p. ej. crear 7 horarios) cuentan como una. */
function programarRecarga(payload) {
  clearTimeout(temporizadorRealtime);
  temporizadorRealtime = setTimeout(() => refrescarDisponibilidad(payload), 250);
}

async function refrescarDisponibilidad(payload) {
  const ids = [];
  if (payload?.new?.id) ids.push(payload.new.id);
  if (payload?.old?.id) ids.push(payload.old.id);
  // El evento puede traer un id de barbero: también destellamos su silla
  for (const id of ids) {
    estado.flashSillas.add(id);
    for (const silla of estado.sillas) {
      if (silla.barbero_id === id) estado.flashSillas.add(silla.id);
    }
  }

  await cargarDatos();

  // Si el barbero del modal abierto fue desactivado: avisar y cerrar el flujo
  const r = estado.reserva;
  if (r) {
    const sigue = sillasConBarbero().find((i) => i.barbero.id === r.barbero.id);
    if (!sigue || !sigue.disponible) {
      cerrarReserva();
      aviso("Este barbero ya no está disponible. Elige otro.", "error");
      return;
    }
    r.barbero = sigue.barbero;
    r.silla = sigue.silla;
    if (r.paso === 2) cargarSlots(); // la grilla abierta se actualiza sola
  }
}

/** Cuando entra o cambia una cita, la grilla abierta se refresca con destello. */
async function alCambiarCitas(payload) {
  const r = estado.reserva;
  const horaAfectada = payload?.new?.hora_inicio
    ? aHHMM(payload.new.hora_inicio)
    : null;

  if (!r || r.paso !== 2 || !r.fecha) return;
  const barberoAfectado = payload?.new?.barbero_id || payload?.old?.barbero_id;
  if (barberoAfectado && barberoAfectado !== r.barbero.id) return;

  await cargarSlots();

  if (horaAfectada) {
    const btn = document.querySelector(`.slots button[data-hora="${horaAfectada}"]`);
    if (btn) {
      btn.classList.add("flash");
      setTimeout(() => btn.classList.remove("flash"), 700);
    }
  }
}

/* --- Arranque ------------------------------------------------------------- */
iniciar();
