-- Conectómetro + SPT · esquema de la base compartida
-- Pegar completo en Supabase → SQL Editor → Run. Se puede volver a ejecutar sin romper nada.
--
-- Las fechas se guardan como texto (AAAA-MM-DD) a propósito: la aplicación
-- permite dejarlas vacías, y una columna date rechaza el texto vacío.

create table if not exists equipos (
  id        text primary key,
  nombre    text,
  corto     text,
  color     int,
  lider     text
);

-- Seguimiento de las 102 propuestas del programa.
-- El catálogo (título y texto) no se guarda acá: viaja con la aplicación.
create table if not exists seguimiento (
  id          text primary key,
  codigo      text unique not null,
  equipo      text,
  estado      text default 'no_iniciada',
  avance      int  default 0,
  plazo       text default '',
  actualizado timestamptz default now()
);

create table if not exists observaciones (
  id     text primary key,
  codigo text not null,
  fecha  text,
  texto  text
);

-- SPT: un proyecto con origen "Ejes del Programa" es una propuesta del programa.
create table if not exists proyectos (
  id            text primary key,
  nombre        text not null,
  propuesta     text,               -- código de la propuesta, si viene del programa
  estado        text default 'Activo',
  clasificacion text,
  naturaleza    text,
  origen        text,
  plazo_tipo    text,
  urgencia      text,
  designados    jsonb default '[]'::jsonb,
  plazo_final   text default '',
  creado        timestamptz default now()
);

-- Los pasos del proyecto son las etapas de la propuesta: una sola tabla
-- para las dos secciones.
create table if not exists pasos (
  id          text primary key,
  proyecto    text not null,
  n           int  default 1,
  descripcion text,
  plazo       text default '',
  estado      text default 'Pendiente',
  encargados  jsonb default '[]'::jsonb
);

create table if not exists hitos (
  id       text primary key,
  proyecto text not null,
  detalle  text,
  fecha    text default ''
);

create table if not exists agenda (
  id        text primary key,
  tema      text,
  inicio    text default '',
  duracion  int default 60,
  formato   text,
  lugar     text,
  invitados text,
  estado    text default 'Por agendar',
  proyecto  text,
  gcal_id   text
);

-- 'disponibilidad' guarda los tramos horarios de cada persona, por día de la
-- semana: {"1": [["09:00","13:00"],["15:00","18:30"]], "2": [...]}
-- donde 1 es lunes y 7 domingo. Sirve para avisar cuando una reunión choca.
create table if not exists integrantes (
  id             text primary key,
  nombre         text,
  rol            text,
  correo         text,
  notas          text,
  disponibilidad jsonb default '{}'::jsonb
);

alter table integrantes add column if not exists disponibilidad jsonb default '{}'::jsonb;

-- Enlaces a carpetas de Drive, cronogramas y documentos. Si 'proyecto' viene
-- vacío, el enlace es general de la secretaría.
create table if not exists enlaces (
  id       text primary key,
  nombre   text,
  url      text,
  proyecto text
);

alter table enlaces add column if not exists proyecto text;

create index if not exists pasos_por_proyecto on pasos (proyecto);
create index if not exists hitos_por_proyecto on hitos (proyecto);
create index if not exists obs_por_codigo     on observaciones (codigo);
create index if not exists proy_por_propuesta on proyectos (propuesta);
create index if not exists enlaces_por_proyecto on enlaces (proyecto);

-- Acceso (RLS). Se activa en todas las tablas y se crea una política que permite
-- leer y escribir con la clave pública del proyecto. Es a propósito: así las seis
-- personas del equipo entran sin cuentas. Cuando quieran usuario y contraseña, se
-- cambia 'anon' por 'authenticated' y se activa el login de Supabase.
alter table equipos       enable row level security;
alter table seguimiento   enable row level security;
alter table observaciones enable row level security;
alter table proyectos     enable row level security;
alter table pasos         enable row level security;
alter table hitos         enable row level security;
alter table agenda        enable row level security;
alter table integrantes   enable row level security;
alter table enlaces       enable row level security;

-- La política se crea sólo si falta, para poder volver a ejecutar este archivo
-- sin borrar nada.
do $$
declare t text;
begin
  foreach t in array array['equipos','seguimiento','observaciones','proyectos','pasos',
                           'hitos','agenda','integrantes','enlaces']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'acceso equipo'
    ) then
      execute format(
        'create policy "acceso equipo" on %I for all to anon using (true) with check (true)', t);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------------
-- Tiempo real: para que lo que edita una persona aparezca en la pantalla de
-- las demás sin recargar. Sin esto, la aplicación igual funciona, pero cada
-- quien ve su propia foto hasta que recarga.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['equipos','seguimiento','observaciones','proyectos','pasos',
                           'hitos','agenda','integrantes','enlaces']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
