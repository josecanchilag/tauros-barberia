/**
 * admin.js — Panel de administración (/admin).
 *
 * RF-07 acceso con contraseña real · RF-08 registro de barberos ·
 * RF-09 listado con estado y activar/desactivar · RF-10 horarios por día ·
 * RF-11 citas con filtros por fecha y barbero · RF-12 ocultar slots al cliente.
 *
 * La sesión se guarda en sessionStorage; sin ella no se renderiza el panel.
 * Todo se lee y escribe directamente en Supabase (con Realtime incluido).
 */
import {
  MESES_CORTO,
  aHHMM,
  aMinutos,
  aviso,
  configuracion,
  crearFoto,
  duracionEntre,
  esc,
  fechaCorta,
  hoy,
  icono,
} from "./utils.js";
import {
  cliente as db,
  ejecutar,
  exigirConexion,
  mensajeError,
  suscribirse,
} from "./supabaseClient.js";

/* --- Constantes ----------------------------------------------------------- */
const CLAVE_SESION = "tauros_admin_sesion";
const DIAS_SEMANA = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];
const DIAS_CAJA = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const OPCION_NUEVA_SILLA = "__nueva__";
const ESTADOS = ["confirmada", "cancelada", "completada"];

/* --- Utilidades de DOM ---------------------------------------------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/* --- Estado --------------------------------------------------------------- */
const estado = {
  tab: "barberos",
  barberos: [],
  sillas: [],
  horarios: [],
  citas: [],
  cargando: false,
  error: null,
  barberoHorarios: null, // barbero seleccionado en la pestaña Horarios
  editHorarios: [], // 7 filas en edición
  cargandoHorarios: false,
  filtro: { fecha: "", barbero: "" },
  modal: null, // { modo, barbero, sillaId, nuevaSilla }
};

/* ==========================================================================
   ARRANQUE Y SESIÓN (RF-07)
   ========================================================================== */

function iniciar() {
  // --- Login ---
  $("#form-login").addEventListener("submit", enviarLogin);
  $("#campo-clave").addEventListener("input", () => {
    $("#icono-clave").classList.remove("input-error");
    $("#error-login").classList.add("oculto");
    $(".login-card").classList.remove("error");
  });

  // --- Navegación entre pestañas ---
  $$(".sidebar nav button[data-tab]").forEach((btn) =>
    btn.addEventListener("click", () => activarTab(btn.dataset.tab))
  );
  window.addEventListener("resize", moverIndicador);

  // --- Salir ---
  $("#btn-salir").addEventListener("click", salir);

  // --- Delegación de eventos dentro del contenido del panel ---
  const cont = $("#panel-contenido");
  cont.addEventListener("click", manejarClic);
  cont.addEventListener("change", manejarCambio);
  cont.addEventListener("input", manejarEntrada);

  // ¿Hay sesión guardada?
  if (sessionStorage.getItem(CLAVE_SESION) === "1") entrar();
  else mostrarLogin();
}

function mostrarLogin() {
  document.documentElement.dataset.sesion = "no";
  $("#vista-login").classList.remove("oculto");
  $("#vista-panel").classList.add("oculto");
  $("#campo-clave").value = "";
  setTimeout(() => $("#campo-clave").focus(), 60);
}

function entrar() {
  // data-sesion en <html> es lo que muestra/oculta cada vista (ver admin.css)
  document.documentElement.dataset.sesion = "si";
  $("#vista-login").classList.add("oculto");
  $("#vista-panel").classList.remove("oculto");
  $("#hoy-fecha").textContent = fechaCorta(hoy());
  moverIndicador();
  cargarTodo();
  escucharTiempoReal();
}

function salir() {
  sessionStorage.removeItem(CLAVE_SESION);
  if (window.__taurosAdmin) window.__taurosAdmin.apagar();
  location.reload();
}

/** Valida la contraseña de verdad contra ADMIN_PASSWORD (RF-07). */
function enviarLogin(evento) {
  evento.preventDefault();
  const campo = $("#campo-clave");
  const valor = campo.value;
  const cfg = configuracion();

  if (!valor.trim()) {
    errorLogin("Ingresa tu contraseña.");
    return;
  }
  if (!cfg.ADMIN_PASSWORD) {
    errorLogin(
      "La contraseña no está configurada. Ejecuta «node build.js» con ADMIN_PASSWORD."
    );
    return;
  }
  if (valor !== cfg.ADMIN_PASSWORD) {
    errorLogin("Contraseña incorrecta.");
    return;
  }

  sessionStorage.setItem(CLAVE_SESION, "1");
  $(".login-card").classList.remove("error");
  $("#error-login").classList.add("oculto");
  $("#icono-clave").classList.remove("input-error");
  entrar();
}

/** Muestra el error con temblor en la tarjeta de login. */
function errorLogin(mensaje) {
  const error = $("#error-login");
  error.textContent = mensaje;
  error.classList.remove("oculto");
  $("#icono-clave").classList.add("input-error");
  const tarjeta = $(".login-card");
  tarjeta.classList.remove("error");
  void tarjeta.offsetWidth; // reinicia la animación
  tarjeta.classList.add("error");
}

/* ==========================================================================
   PESTAÑAS E INDICADOR DEL SIDEBAR
   ========================================================================== */

function activarTab(tab) {
  estado.tab = tab;
  $$(".sidebar nav button[data-tab]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  $("#titulo-tab").textContent =
    tab === "barberos" ? "Barberos" : tab === "hours" ? "Horarios" : "Citas";
  moverIndicador();
  renderTab();
}

/** Desliza el indicador dorado hasta la pestaña activa. */
function moverIndicador() {
  const activo = $(".sidebar nav button.active");
  const indicador = $(".sidebar-indicador");
  if (!activo || !indicador) return;
  indicador.style.setProperty("--ind-h", `${activo.offsetHeight}px`);
  indicador.style.setProperty("--ind-y", `${activo.offsetTop}px`);
  indicador.style.setProperty("--ind-w", `${activo.offsetWidth}px`);
  indicador.style.setProperty("--ind-x", `${activo.offsetLeft}px`);
}

/* ==========================================================================
   CARGA DE DATOS
   ========================================================================== */

async function cargarTodo() {
  estado.cargando = true;
  estado.error = null;
  renderTab();

  try {
    exigirConexion();
    await recargarTodo();
    estado.cargando = false;
  } catch (error) {
    estado.cargando = false;
    estado.error = mensajeError(error);
    console.warn("[tauros/admin] No se pudo cargar el panel:", error);
  }
  renderTab();
}

/** Vuelve a traer las 4 tablas (solo columnas necesarias). */
async function recargarTodo() {
  const [barberos, sillas, horarios, citas] = await Promise.all([
    ejecutar(
      db.from("barberos").select("id,nombre,especialidad,silla_id,activo,foto_url")
    ),
    ejecutar(db.from("sillas").select("id,nombre,barbero_id,activa")),
    ejecutar(
      db
        .from("horarios")
        .select(
          "id,barbero_id,dia_semana,hora_inicio,hora_fin,duracion_slot,activo"
        )
    ),
    ejecutar(
      db
        .from("citas")
        .select(
          "id,barbero_id,cliente_nombre,cliente_contacto,fecha,hora_inicio,hora_fin,estado"
        )
        .order("fecha", { ascending: false })
        .order("hora_inicio", { ascending: false })
    ),
  ]);
  estado.barberos = barberos;
  estado.sillas = sillas;
  estado.horarios = horarios;
  estado.citas = citas;
}

/* ==========================================================================
   RENDER GENERAL
   ========================================================================== */

function renderTab() {
  const cont = $("#panel-contenido");

  if (estado.cargando) {
    cont.innerHTML = `
      <section class="admin-section">
        <div class="admin-section-head">
          <div><h2>Cargando…</h2><p>Estamos trayendo la información de Supabase.</p></div>
        </div>
        <div class="table-card">
          <div style="padding:16px 0">
            ${'<div class="skeleton skeleton-fila"></div>'.repeat(5)}
          </div>
        </div>
      </section>`;
    return;
  }

  if (estado.error) {
    cont.innerHTML = `
      <section class="admin-section">
        <div class="table-card">
          <div class="mini-error">
            ${esc(estado.error)}
            <button class="btn btn-ghost" type="button" data-reintentar>Intentar de nuevo</button>
          </div>
        </div>
      </section>`;
    return;
  }

  if (estado.tab === "barberos") renderBarberos();
  else if (estado.tab === "hours") renderHorarios();
  else renderCitas();
}

/* ==========================================================================
   PESTAÑA: BARBEROS (RF-08, RF-09, RF-12)
   ========================================================================== */

function renderBarberos() {
  $("#panel-contenido").innerHTML = `
    <section class="admin-section">
      <div class="admin-section-head">
        <div>
          <h2>Equipo de barberos</h2>
          <p id="conteo-barberos"></p>
        </div>
        <button class="btn btn-gold" type="button" data-agregar-barbero>
          ${icono("plus")} Agregar barbero
        </button>
      </div>
      <div class="table-card">
        <div class="table-scroll">
          <table class="tabla-cascada">
            <thead>
              <tr>
                <th>BARBERO</th>
                <th>ESPECIALIDAD</th>
                <th>SILLA</th>
                <th>ESTADO</th>
                <th>ACTIVAR / DESACTIVAR</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="tbody-barberos"></tbody>
          </table>
        </div>
        <div class="mini-empty oculto" id="vacio-barberos">
          Aún no hay barberos registrados. Agrega el primero.
        </div>
      </div>
      <div class="admin-note">
        <span>${icono("check")}</span>
        <div>
          <b>Estado de disponibilidad</b>
          <p>Desactiva temporalmente a un barbero para ocultarlo de la página de reservas.</p>
        </div>
      </div>
    </section>`;
  pintarFilasBarberos();
}

function pintarFilasBarberos() {
  const tbody = $("#tbody-barberos");
  if (!tbody) return;

  $("#conteo-barberos").textContent = `${estado.barberos.length} ${
    estado.barberos.length === 1 ? "profesional registrado" : "profesionales registrados"
  }`;
  $("#vacio-barberos").classList.toggle("oculto", estado.barberos.length > 0);

  tbody.innerHTML = estado.barberos
    .map((b, i) => {
      const silla = estado.sillas.find((s) => s.id === b.silla_id);
      const nombreSilla = silla ? silla.nombre : b.silla_id || "—";
      const activo = Boolean(b.activo);
      return `
        <tr style="--i:${i}" data-barbero="${esc(b.id)}">
          <td>
            <div class="person-cell">
              <span class="celda-foto" data-foto="${esc(b.foto_url || "")}" data-nombre="${esc(
                b.nombre
              )}"></span>
              <b>${esc(b.nombre)}</b>
            </div>
          </td>
          <td>${esc(b.especialidad || "—")}</td>
          <td>${esc(nombreSilla)}</td>
          <td>
            <span class="status ${activo ? "available" : "off"}"><i></i>${
              activo ? "Activo" : "Inactivo"
            }</span>
          </td>
          <td>
            <button class="toggle ${activo ? "on" : ""}" type="button"
              data-toggle-barbero="${esc(b.id)}"
              aria-pressed="${activo}"
              aria-label="${activo ? "Desactivar" : "Activar"} a ${esc(b.nombre)}">
              <span></span>
            </button>
          </td>
          <td>
            <button class="edit-btn" type="button" data-editar-barbero="${esc(
              b.id
            )}">${icono("edit", 16)} Editar</button>
          </td>
        </tr>`;
    })
    .join("");

  // Fotos con respaldo de iniciales
  $$(".celda-foto", tbody).forEach((contenedor) => {
    contenedor.replaceWith(
      crearFoto(
        contenedor.dataset.foto || null,
        contenedor.dataset.nombre,
        "avatar-iniciales",
        ""
      )
    );
  });
}

/** Activa o desactiva un barbero (RF-12: oculta sus slots al cliente). */
async function alternarBarbero(id) {
  const barbero = estado.barberos.find((b) => b.id === id);
  if (!barbero) return;
  const activo = !barbero.activo;
  barbero.activo = activo; // actualización optimista
  pintarFilasBarberos();

  try {
    exigirConexion();
    await ejecutar(db.from("barberos").update({ activo }).eq("id", id).select());
    aviso(
      activo
        ? "Barbero activado: ya aparece en la agenda."
        : "Barbero desactivado: sus sillas quedan fuera de la agenda."
    );
  } catch (error) {
    barbero.activo = !activo;
    pintarFilasBarberos();
    aviso(mensajeError(error), "error");
    console.warn("[tauros/admin] No se pudo cambiar el estado:", error);
  }
}

/* ==========================================================================
   MODAL AGREGAR / EDITAR BARBERO (RF-08)
   ========================================================================== */

function abrirModalBarbero(modo, barbero = null) {
  estado.modal = {
    modo,
    barbero,
    sillaId: barbero?.silla_id || "",
    nuevaSilla: "",
  };

  const opciones = estado.sillas
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map(
      (s) =>
        `<option value="${esc(s.id)}" ${
          s.id === estado.modal.sillaId ? "selected" : ""
        }>${esc(s.nombre)}</option>`
    )
    .join("");

  // Si la silla actual no está en la tabla (dato huérfano), se incluye
  const sillaHuerfana =
    barbero && barbero.silla_id && !estado.sillas.some((s) => s.id === barbero.silla_id)
      ? `<option value="${esc(barbero.silla_id)}" selected>${esc(
          barbero.silla_id
        )}</option>`
      : "";

  const esNuevo = modo === "nuevo";
  const cont = $("#modal-admin");
  cont.innerHTML = `
    <div class="modal-backdrop abriendo" role="dialog" aria-modal="true"
      aria-label="${esNuevo ? "Agregar barbero" : "Editar barbero"}">
      <form class="small-modal" data-form-barbero novalidate>
        <div class="modal-top">
          <div>
            <span class="eyebrow">${esNuevo ? "NUEVO MIEMBRO" : "EDITAR MIEMBRO"}</span>
            <h2>${esNuevo ? "Agregar barbero" : "Editar barbero"}</h2>
          </div>
          <button class="icon-btn" type="button" data-cerrar-modal aria-label="Cerrar">${icono(
            "close"
          )}</button>
        </div>
        <label>
          Nombre completo <b style="color:#c34f43">*</b>
          <input type="text" data-nombre autofocus
            value="${esc(barbero?.nombre || "")}"
            placeholder="Nombre del barbero">
        </label>
        <label>
          Especialidad
          <input type="text" data-especialidad
            value="${esc(barbero?.especialidad || "")}"
            placeholder="Ej. Corte clásico y barba">
        </label>
        <label>
          Silla
          <select data-silla>
            ${sillaHuerfana}
            ${opciones}
            <option value="${OPCION_NUEVA_SILLA}">+ Crear nueva silla</option>
          </select>
        </label>
        <label class="campo-nueva-silla oculto" data-bloque-nueva-silla>
          Nombre de la nueva silla
          <input type="text" data-nueva-silla placeholder="Ej. La Reserva">
        </label>
        <label>
          Foto (URL) <em style="float:right;color:#aaa;font-weight:400">Opcional</em>
          <input type="text" data-foto
            value="${esc(barbero?.foto_url || "")}"
            placeholder="https://… (si no hay, se usan iniciales)">
        </label>
        <span class="field-error oculto" data-error-barbero></span>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-cerrar-modal>Cancelar</button>
          <button class="btn btn-gold" type="submit" data-guardar-barbero>
            ${esNuevo ? "Agregar barbero" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>`;

  const backdrop = $(".modal-backdrop", cont);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cerrarModalBarbero();
  });
  $$("[data-cerrar-modal]", cont).forEach((b) =>
    b.addEventListener("click", cerrarModalBarbero)
  );
  $("[data-silla]", cont).addEventListener("change", (e) => {
    const nueva = e.target.value === OPCION_NUEVA_SILLA;
    $("[data-bloque-nueva-silla]", cont).classList.toggle("oculto", !nueva);
    if (nueva) $("[data-nueva-silla]", cont).focus();
  });
  $("[data-form-barbero]", cont).addEventListener("submit", guardarBarbero);

  setTimeout(() => backdrop.classList.remove("abriendo"), 340);
  document.addEventListener("keydown", cerrarConEscapeModal);
  $("[data-nombre]", cont).focus();
}

function cerrarModalBarbero() {
  const cont = $("#modal-admin");
  const backdrop = $(".modal-backdrop", cont);
  estado.modal = null;
  document.removeEventListener("keydown", cerrarConEscapeModal);
  if (!backdrop) return;
  backdrop.classList.add("cerrando");
  setTimeout(() => (cont.innerHTML = ""), 320);
}

function cerrarConEscapeModal(e) {
  if (e.key === "Escape" && estado.modal) cerrarModalBarbero();
}

/**
 * Crea o actualiza un barbero (RF-08).
 * Al crear: inserta el barbero, asigna su silla y genera sus 7 horarios
 * (lunes a sábado 09:00–18:00 activos, domingo inactivo, slot de 30 min).
 */
async function guardarBarbero(evento) {
  evento.preventDefault();
  const cont = $("#modal-admin");
  const r = estado.modal;
  if (!r) return;

  const nombre = $("[data-nombre]", cont).value.trim();
  const especialidad = $("[data-especialidad]", cont).value.trim();
  const foto = $("[data-foto]", cont).value.trim();
  const valorSilla = $("[data-silla]", cont).value;
  const nuevaSilla = $("[data-nueva-silla]", cont).value.trim();
  const errorEl = $("[data-error-barbero]", cont);

  const fallar = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.remove("oculto");
    const campo = nombre
      ? valorSilla === OPCION_NUEVA_SILLA
        ? $("[data-nueva-silla]", cont)
        : $("[data-silla]", cont)
      : $("[data-nombre]", cont);
    campo.classList.remove("input-error");
    void campo.offsetWidth;
    campo.classList.add("input-error");
    campo.focus();
  };

  if (!nombre) return fallar("Ingresa el nombre del barbero.");
  if (valorSilla === OPCION_NUEVA_SILLA && !nuevaSilla)
    return fallar("Ingresa el nombre de la silla.");

  const boton = $("[data-guardar-barbero]", cont);
  boton.disabled = true;
  boton.innerHTML = '<span class="pole"></span><span>Guardando…</span>';

  try {
    exigirConexion();

    let sillaId = valorSilla;
    const crearSilla = valorSilla === OPCION_NUEVA_SILLA;

    if (crearSilla) {
      // 1) Primero la silla (id de texto tipo 'silla_…')
      const { data: silla, error } = await db
        .from("sillas")
        .insert({
          id: generarIdSilla(nuevaSilla),
          nombre: nuevaSilla,
          activa: true,
        })
        .select("id,nombre,barbero_id,activa")
        .single();
      if (error) throw error;
      sillaId = silla.id;
    }

    if (r.modo === "nuevo") {
      // 2) El barbero
      const { data: nuevo, error } = await db
        .from("barberos")
        .insert({
          nombre,
          especialidad,
          silla_id: sillaId,
          activo: true,
          foto_url: foto || null,
        })
        .select("id,nombre,especialidad,silla_id,activo,foto_url")
        .single();
      if (error) throw error;

      // 3) Asignar la silla al barbero
      const { error: errSilla } = await db
        .from("sillas")
        .update({ barbero_id: nuevo.id })
        .eq("id", sillaId);
      if (errSilla) throw errSilla;

      // 4) Sus 7 filas de horarios por defecto (RF-08)
      const filasHorario = DIAS_SEMANA.map((dia) => ({
        barbero_id: nuevo.id,
        dia_semana: dia,
        hora_inicio: "09:00",
        hora_fin: "18:00",
        duracion_slot: 30,
        activo: dia !== "domingo",
      }));
      const { error: errHorarios } = await db.from("horarios").insert(filasHorario);
      if (errHorarios) throw errHorarios;

      aviso("Barbero agregado correctamente.");
    } else {
      // Edición: actualizar el barbero
      const { error } = await db
        .from("barberos")
        .update({
          nombre,
          especialidad,
          silla_id: sillaId,
          foto_url: foto || null,
        })
        .eq("id", r.barbero.id);
      if (error) throw error;

      // Cambio de silla: liberar la anterior y asignar la nueva
      const anterior = r.barbero.silla_id;
      if (anterior && anterior !== sillaId) {
        await db
          .from("sillas")
          .update({ barbero_id: null })
          .eq("id", anterior)
          .eq("barbero_id", r.barbero.id);
      }
      const { error: errAsignar } = await db
        .from("sillas")
        .update({ barbero_id: r.barbero.id })
        .eq("id", sillaId);
      if (errAsignar) throw errAsignar;

      aviso("Cambios guardados.");
    }

    await recargarTodo();
    pintarFilasBarberos();
    if (estado.barberoHorarios) cargarHorariosBarbero(estado.barberoHorarios);
    cerrarModalBarbero();
  } catch (error) {
    boton.disabled = false;
    boton.textContent = r.modo === "nuevo" ? "Agregar barbero" : "Guardar cambios";
    errorEl.textContent = mensajeError(error);
    errorEl.classList.remove("oculto");
    console.warn("[tauros/admin] No se pudo guardar el barbero:", error);
  }
}

/** Id de silla legible y único: 'silla_…'. */
function generarIdSilla(nombre) {
  const base = String(nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  return `silla_${base || "nueva"}_${Date.now().toString(36)}`;
}

/* ==========================================================================
   PESTAÑA: HORARIOS (RF-10)
   ========================================================================== */

function renderHorarios() {
  if (!estado.barberos.length) {
    $("#panel-contenido").innerHTML = `
      <section class="admin-section">
        <div class="table-card">
          <div class="mini-error">
            Primero agrega un barbero en la pestaña «Barberos».
            <button class="btn btn-ghost" type="button" data-ir-barberos>Ir a Barberos</button>
          </div>
        </div>
      </section>`;
    return;
  }

  // Si no hay barbero elegido (o desapareció), se elige el primero
  if (
    !estado.barberoHorarios ||
    !estado.barberos.some((b) => b.id === estado.barberoHorarios)
  ) {
    estado.barberoHorarios = estado.barberos[0].id;
    cargarHorariosBarbero(estado.barberoHorarios);
  }

  const opciones = estado.barberos
    .map(
      (b) =>
        `<option value="${esc(b.id)}" ${
          b.id === estado.barberoHorarios ? "selected" : ""
        }>${esc(b.nombre)}</option>`
    )
    .join("");

  $("#panel-contenido").innerHTML = `
    <section class="admin-section">
      <div class="admin-section-head">
        <div>
          <h2>Configura la jornada</h2>
          <p>Define la disponibilidad y duración de cada cita.</p>
        </div>
        <label class="select-wrap">
          Barbero
          <select data-barbero-horarios>${opciones}</select>
        </label>
      </div>
      <div class="table-card schedule-card">
        <div class="table-scroll">
          <table class="tabla-cascada">
            <thead>
              <tr>
                <th>DÍA</th>
                <th>DISPONIBLE</th>
                <th>HORA INICIO</th>
                <th>HORA FIN</th>
                <th>DURACIÓN DEL SLOT</th>
              </tr>
            </thead>
            <tbody id="tbody-horarios"></tbody>
          </table>
        </div>
        <div class="save-row">
          <span>Los cambios afectarán las citas futuras.</span>
          <span class="aviso-error oculto" data-error-horarios></span>
          <button class="btn btn-dark" type="button" data-guardar-horarios>Guardar cambios</button>
        </div>
      </div>
    </section>`;

  pintarFilasHorarios();
}

/** Trae los 7 días del barbero elegido (o propone los valores por defecto). */
async function cargarHorariosBarbero(barberoId) {
  estado.cargandoHorarios = true;
  pintarFilasHorarios();
  try {
    exigirConexion();
    const filas = await ejecutar(
      db
        .from("horarios")
        .select(
          "id,barbero_id,dia_semana,hora_inicio,hora_fin,duracion_slot,activo"
        )
        .eq("barbero_id", barberoId)
    );
    const porDia = new Map(filas.map((f) => [f.dia_semana, f]));
    estado.editHorarios = DIAS_SEMANA.map((dia) => {
      const existente = porDia.get(dia);
      if (existente) {
        return {
          id: existente.id,
          dia_semana: dia,
          activo: Boolean(existente.activo),
          hora_inicio: aHHMM(existente.hora_inicio),
          hora_fin: aHHMM(existente.hora_fin),
          duracion_slot: Number(existente.duracion_slot) || 30,
        };
      }
      return {
        id: null,
        dia_semana: dia,
        activo: dia !== "domingo",
        hora_inicio: "09:00",
        hora_fin: "18:00",
        duracion_slot: 30,
      };
    });
    estado.cargandoHorarios = false;
  } catch (error) {
    estado.cargandoHorarios = false;
    estado.editHorarios = [];
    aviso(mensajeError(error), "error");
    console.warn("[tauros/admin] No se pudieron cargar los horarios:", error);
  }
  pintarFilasHorarios();
}

function pintarFilasHorarios() {
  const tbody = $("#tbody-horarios");
  if (!tbody) return;

  if (estado.cargandoHorarios) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="pole-contenedor"><span class="pole pole-grande"></span>Cargando horarios…</div>
    </td></tr>`;
    return;
  }

  if (!estado.editHorarios.length) {
    tbody.innerHTML = `<tr><td colspan="5">
      <div class="mini-error">No se pudieron cargar los horarios.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = estado.editHorarios
    .map((f, i) => {
      const inactivo = !f.activo;
      return `
        <tr class="${inactivo ? "disabled-row" : ""}" style="--i:${i}" data-dia="${esc(
          f.dia_semana
        )}">
          <td><b>${DIAS_CAJA[i]}</b></td>
          <td>
            <button class="toggle ${f.activo ? "on" : ""}" type="button"
              data-toggle-horario="${esc(f.dia_semana)}"
              aria-pressed="${f.activo}"
              aria-label="${f.activo ? "Desactivar" : "Activar"} ${DIAS_CAJA[i]}">
              <span></span>
            </button>
          </td>
          <td>
            <input type="time" value="${esc(f.hora_inicio)}"
              data-hora-inicio="${esc(f.dia_semana)}" ${inactivo ? "disabled" : ""}>
          </td>
          <td>
            <input type="time" value="${esc(f.hora_fin)}"
              data-hora-fin="${esc(f.dia_semana)}" ${inactivo ? "disabled" : ""}>
          </td>
          <td>
            <select data-duracion="${esc(f.dia_semana)}" ${inactivo ? "disabled" : ""}>
              ${[30, 45, 60]
                .map(
                  (n) =>
                    `<option value="${n}" ${
                      Number(f.duracion_slot) === n ? "selected" : ""
                    }>${n} minutos</option>`
                )
                .join("")}
            </select>
          </td>
        </tr>`;
    })
    .join("");
}

/** Guarda los 7 días en Supabase y confirma con «Cambios guardados» (RF-10). */
async function guardarHorarios() {
  const barberoId = estado.barberoHorarios;
  if (!barberoId || !estado.editHorarios.length) return;

  const errorEl = $("[data-error-horarios]");
  const boton = $("[data-guardar-horarios]");

  // Validación: la hora fin debe ser mayor que la hora inicio
  for (const f of estado.editHorarios) {
    if (f.activo && aMinutos(f.hora_fin) <= aMinutos(f.hora_inicio)) {
      mostrarErrorHorarios(
        `En ${f.dia_semana} la hora fin debe ser mayor que la hora inicio.`
      );
      return;
    }
  }
  errorEl.classList.add("oculto");

  boton.disabled = true;
  boton.innerHTML = '<span class="pole"></span><span>Guardando…</span>';

  try {
    exigirConexion();
    for (const f of estado.editHorarios) {
      const datos = {
        activo: f.activo,
        hora_inicio: f.hora_inicio,
        hora_fin: f.hora_fin,
        duracion_slot: Number(f.duracion_slot),
      };
      if (f.id) {
        const { error } = await db.from("horarios").update(datos).eq("id", f.id);
        if (error) throw error;
      } else {
        const { error } = await db
          .from("horarios")
          .insert({ ...datos, barbero_id: barberoId, dia_semana: f.dia_semana });
        if (error) throw error;
      }
    }
    await cargarHorariosBarbero(barberoId);
    await recargarTodo();
    aviso("Cambios guardados.");
  } catch (error) {
    mostrarErrorHorarios(mensajeError(error));
    console.warn("[tauros/admin] No se pudieron guardar los horarios:", error);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar cambios";
  }
}

function mostrarErrorHorarios(mensaje) {
  const errorEl = $("[data-error-horarios]");
  if (!errorEl) return;
  errorEl.textContent = mensaje;
  errorEl.classList.remove("oculto");
  errorEl.classList.remove("input-error");
  void errorEl.offsetWidth;
  errorEl.classList.add("input-error");
}

/* ==========================================================================
   PESTAÑA: CITAS (RF-11)
   ========================================================================== */

function renderCitas() {
  const opciones = [
    '<option value="">Todos</option>',
    ...estado.barberos.map(
      (b) =>
        `<option value="${esc(b.id)}" ${
          b.id === estado.filtro.barbero ? "selected" : ""
        }>${esc(b.nombre)}</option>`
    ),
  ].join("");

  $("#panel-contenido").innerHTML = `
    <section class="admin-section">
      <div class="admin-section-head">
        <div>
          <h2>Agenda de citas</h2>
          <p>Revisa y gestiona las reservas de tu equipo.</p>
        </div>
      </div>
      <div class="filters">
        <label>
          Fecha
          <input type="date" data-filtro-fecha value="${esc(estado.filtro.fecha)}">
        </label>
        <label>
          Barbero
          <select data-filtro-barbero>${opciones}</select>
        </label>
        <button class="btn btn-ghost" type="button" data-limpiar>Limpiar filtros</button>
      </div>
      <div class="table-card">
        <div class="table-scroll">
          <table class="tabla-cascada">
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>BARBERO</th>
                <th>FECHA</th>
                <th>HORA</th>
                <th>ESTADO</th>
              </tr>
            </thead>
            <tbody id="tbody-citas"></tbody>
          </table>
        </div>
        <div class="mini-empty oculto" id="vacio-citas">No hay citas para estos filtros.</div>
        <div class="table-footer" id="pie-citas"></div>
      </div>
    </section>`;

  pintarFilasCitas();
}

/** Aplica los filtros de fecha y barbero (RF-11). */
function citasFiltradas() {
  const { fecha, barbero } = estado.filtro;
  return estado.citas.filter((c) => {
    if (fecha && c.fecha !== fecha) return false;
    if (barbero && c.barbero_id !== barbero) return false;
    return true;
  });
}

function pintarFilasCitas() {
  const tbody = $("#tbody-citas");
  if (!tbody) return;

  const filtradas = citasFiltradas();
  const vacio = $("#vacio-citas");
  const pie = $("#pie-citas");

  vacio.classList.toggle("oculto", filtradas.length > 0);
  pie.textContent = `Mostrando ${filtradas.length} de ${estado.citas.length} citas`;

  tbody.innerHTML = filtradas
    .map((c, i) => {
      const barbero = estado.barberos.find((b) => b.id === c.barbero_id);
      const inicio = aHHMM(c.hora_inicio);
      const fin = aHHMM(c.hora_fin);
      const minutos = duracionEntre(inicio, fin);
      const [anio, mes, dia] = c.fecha.split("-");
      const fechaTexto = `${Number(dia)} ${MESES_CORTO[Number(mes) - 1]} ${anio}`;
      const estadoCita = ESTADOS.includes(c.estado) ? c.estado : "confirmada";

      return `
        <tr style="--i:${i}" data-cita="${esc(c.id)}">
          <td>
            <b>${esc(c.cliente_nombre)}</b>
            ${
              c.cliente_contacto
                ? `<div style="color:#999;font-size:9px;margin-top:2px">${esc(
                    c.cliente_contacto
                  )}</div>`
                : ""
            }
          </td>
          <td>${esc(barbero ? barbero.nombre : "—")}</td>
          <td>${esc(fechaTexto)}</td>
          <td class="hora-celda">
            <b>${esc(inicio)}</b>
            <small>${minutos > 0 ? `${minutos} min estimados` : "—"}</small>
          </td>
          <td>
            <select class="pill estado-select ${estadoCita}"
              data-estado-cita="${esc(c.id)}"
              aria-label="Estado de la cita de ${esc(c.cliente_nombre)}">
              ${ESTADOS.map(
                (e) =>
                  `<option value="${e}" ${e === estadoCita ? "selected" : ""}>${
                    e.charAt(0).toUpperCase() + e.slice(1)
                  }</option>`
              ).join("")}
            </select>
          </td>
        </tr>`;
    })
    .join("");
}

/** Cambia el estado de una cita desde un select en línea (RF-11). */
async function cambiarEstadoCita(id, nuevoEstado) {
  const cita = estado.citas.find((c) => c.id === id);
  if (!cita) return;
  const anterior = cita.estado;
  cita.estado = nuevoEstado;

  const select = document.querySelector(`[data-estado-cita="${id}"]`);
  if (select) {
    select.className = `pill estado-select ${nuevoEstado}`;
  }

  try {
    exigirConexion();
    await ejecutar(db.from("citas").update({ estado: nuevoEstado }).eq("id", id).select());
    aviso("Estado de la cita actualizado.");
  } catch (error) {
    cita.estado = anterior;
    pintarFilasCitas();
    aviso(mensajeError(error), "error");
    console.warn("[tauros/admin] No se pudo cambiar el estado:", error);
  }
}

/* ==========================================================================
   EVENTOS DELEGADOS DEL PANEL
   ========================================================================== */

function manejarClic(evento) {
  const destino = evento.target;

  const reintentar = destino.closest("[data-reintentar]");
  if (reintentar) return cargarTodo();

  const irBarberos = destino.closest("[data-ir-barberos]");
  if (irBarberos) return activarTab("barberos");

  const agregar = destino.closest("[data-agregar-barbero]");
  if (agregar) return abrirModalBarbero("nuevo");

  const editar = destino.closest("[data-editar-barbero]");
  if (editar) {
    const barbero = estado.barberos.find((b) => b.id === editar.dataset.editarBarbero);
    if (barbero) abrirModalBarbero("editar", barbero);
    return;
  }

  const toggleBarbero = destino.closest("[data-toggle-barbero]");
  if (toggleBarbero) return alternarBarbero(toggleBarbero.dataset.toggleBarbero);

  const toggleHorario = destino.closest("[data-toggle-horario]");
  if (toggleHorario) {
    const dia = toggleHorario.dataset.toggleHorario;
    const fila = estado.editHorarios.find((f) => f.dia_semana === dia);
    if (!fila) return;
    fila.activo = !fila.activo;
    const tr = toggleHorario.closest("tr");
    tr.classList.toggle("disabled-row", !fila.activo);
    toggleHorario.classList.toggle("on", fila.activo);
    toggleHorario.setAttribute("aria-pressed", String(fila.activo));
    $$("input, select", tr).forEach((campo) => (campo.disabled = !fila.activo));
    return;
  }

  const guardar = destino.closest("[data-guardar-horarios]");
  if (guardar) return guardarHorarios();

  const limpiar = destino.closest("[data-limpiar]");
  if (limpiar) {
    estado.filtro = { fecha: "", barbero: "" };
    renderCitas();
    return;
  }
}

function manejarCambio(evento) {
  const destino = evento.target;

  if (destino.matches("[data-barbero-horarios]")) {
    estado.barberoHorarios = destino.value;
    cargarHorariosBarbero(destino.value);
    return;
  }

  if (destino.matches("[data-hora-inicio]")) {
    const f = estado.editHorarios.find((x) => x.dia_semana === destino.dataset.horaInicio);
    if (f) f.hora_inicio = destino.value;
    return;
  }

  if (destino.matches("[data-hora-fin]")) {
    const f = estado.editHorarios.find((x) => x.dia_semana === destino.dataset.horaFin);
    if (f) f.hora_fin = destino.value;
    return;
  }

  if (destino.matches("[data-duracion]")) {
    const f = estado.editHorarios.find((x) => x.dia_semana === destino.dataset.duracion);
    if (f) f.duracion_slot = Number(destino.value);
    return;
  }

  if (destino.matches("[data-filtro-barbero]")) {
    estado.filtro.barbero = destino.value;
    pintarFilasCitas();
    return;
  }

  if (destino.matches("[data-estado-cita]")) {
    cambiarEstadoCita(destino.dataset.estadoCita, destino.value);
  }
}

function manejarEntrada(evento) {
  const destino = evento.target;
  if (destino.matches("[data-filtro-fecha]")) {
    estado.filtro.fecha = destino.value;
    pintarFilasCitas();
  }
}

/* ==========================================================================
   TIEMPO REAL: el panel se actualiza sin recargar
   ========================================================================== */

let temporizadorRealtime = null;

function escucharTiempoReal() {
  if (window.__taurosAdmin) return;
  window.__taurosAdmin = suscribirse(
    ["citas", "barberos", "sillas", "horarios"],
    (tabla, payload) => {
      clearTimeout(temporizadorRealtime);
      temporizadorRealtime = setTimeout(
        () => actualizarPorRealtime(tabla, payload),
        250
      );
    }
  );
}

async function actualizarPorRealtime(tabla, payload) {
  try {
    await recargarTodo();

    // Refrescar solo lo que cambió (sin perder el filtro ni la pestaña)
    if (estado.tab === "barberos") pintarFilasBarberos();
    else if (estado.tab === "citas") pintarFilasCitas();

    const id = payload?.new?.id || payload?.old?.id;
    if (!id) return;
    const selector =
      tabla === "citas"
        ? `[data-cita="${id}"]`
        : tabla === "barberos"
        ? `[data-barbero="${id}"]`
        : null;
    const fila = selector ? document.querySelector(selector) : null;
    if (fila) {
      fila.classList.add("flash");
      setTimeout(() => fila.classList.remove("flash"), 700);
    }
  } catch (error) {
    console.warn("[tauros/admin] Actualización Realtime fallida:", error);
  }
}

/* --- Arranque ------------------------------------------------------------- */
iniciar();
