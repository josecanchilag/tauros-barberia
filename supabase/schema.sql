-- =============================================================================
-- Tauros Barbería — Esquema de datos (PostgreSQL / Supabase)
-- Recrea las 4 tablas del sistema, su índice único contra doble agendamiento,
-- las políticas RLS abiertas y la publicación Realtime.
-- Ejecutar en el SQL Editor de Supabase (idempotente: se puede correr varias veces).
-- =============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- BARBEROS: profesionales del equipo (RF-08, RF-09, RF-12)
-- -----------------------------------------------------------------------------
create table if not exists barberos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  especialidad text default '',
  silla_id    text,                     -- referencia lógica a sillas.id
  activo      boolean not null default true,
  foto_url    text,
  creado_en   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- SILLAS: cada silla se relaciona con un barbero (RF-01, RF-02)
-- id es texto para poder usar claves legibles tipo 'silla_1'
-- -----------------------------------------------------------------------------
create table if not exists sillas (
  id         text primary key,
  nombre     text not null,
  barbero_id uuid references barberos(id) on delete set null,
  activa     boolean not null default true
);

-- FK circular barberos.silla_id -> sillas.id (ambas tablas ya existen aquí)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'barberos_silla_fk'
  ) then
    alter table barberos
      add constraint barberos_silla_fk
      foreign key (silla_id) references sillas(id) on delete set null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- HORARIOS: disponibilidad por día de la semana y barbero (RF-10)
-- -----------------------------------------------------------------------------
create table if not exists horarios (
  id             uuid primary key default gen_random_uuid(),
  barbero_id     uuid not null references barberos(id) on delete cascade,
  dia_semana     text not null
                 check (dia_semana in ('lunes','martes','miércoles','jueves',
                                       'viernes','sábado','domingo')),
  hora_inicio    time not null default '09:00',
  hora_fin       time not null default '18:00',
  duracion_slot  integer not null default 30
                 check (duracion_slot in (30, 45, 60)),
  activo         boolean not null default true,
  creado_en      timestamptz not null default now(),
  unique (barbero_id, dia_semana) -- una fila por día y barbero
);

-- -----------------------------------------------------------------------------
-- CITAS: reservas hechas por los clientes (RF-05, RF-06, RF-11)
-- Índice único parcial: impide el doble agendamiento mientras esté 'confirmada'.
-- Si se cancela o completa, el slot queda libre para volver a reservar.
-- -----------------------------------------------------------------------------
create table if not exists citas (
  id               uuid primary key default gen_random_uuid(),
  barbero_id       uuid not null references barberos(id) on delete cascade,
  cliente_nombre   text not null,
  cliente_contacto text,                -- teléfono o correo (opcional)
  fecha            date not null,       -- formato local YYYY-MM-DD
  hora_inicio      time not null,
  hora_fin         time not null,       -- hora_inicio + duracion_slot
  estado           text not null default 'confirmada'
                   check (estado in ('confirmada','cancelada','completada')),
  creado_en        timestamptz not null default now()
);

-- Protección contra carreras / doble agendamiento (código de error 23505)
create unique index if not exists citas_slot_unico
  on citas (barbero_id, fecha, hora_inicio)
  where estado = 'confirmada';

-- Acelera los listados por fecha (admin y disponibilidad del día)
create index if not exists citas_fecha_idx on citas (fecha);

-- -----------------------------------------------------------------------------
-- SEGURIDAD: RLS habilitado con políticas abiertas.
-- El front-end consume Supabase directamente con la anon key; no hay back-end
-- propio. En producción se recomendarían políticas más restrictivas.
-- -----------------------------------------------------------------------------
alter table barberos enable row level security;
alter table sillas   enable row level security;
alter table horarios enable row level security;
alter table citas    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['barberos','sillas','horarios','citas'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t
        and policyname = 'acceso abierto (lectura y escritura)'
    ) then
      execute format(
        'create policy "acceso abierto (lectura y escritura)" on %I
           for all to anon, authenticated using (true) with check (true)',
        t
      );
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- TIEMPO REAL: publicar citas, barberos, sillas y horarios para que el cliente
-- y el panel admin se actualicen sin recargar la página.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['citas','barberos','horarios','sillas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- (Opcional) Datos de ejemplo para probar el panel en un proyecto nuevo.
-- Descomentar si la barbería aún no tiene datos cargados.
-- -----------------------------------------------------------------------------
-- insert into barberos (nombre, especialidad, silla_id, activo) values
--   ('Mateo Reyes', 'Corte clásico y barba', 'silla_1', true),
--   ('Santiago León', 'Fade y diseño', 'silla_2', true),
--   ('Daniel Cruz', 'Barba y ritual de afeitado', 'silla_3', true);
--
-- insert into sillas (id, nombre, barbero_id, activa) values
--   ('silla_1', 'La Imperial', (select id from barberos where nombre = 'Mateo Reyes'), true),
--   ('silla_2', 'El Patrón',  (select id from barberos where nombre = 'Santiago León'), true),
--   ('silla_3', 'La Noble',   (select id from barberos where nombre = 'Daniel Cruz'), true);
