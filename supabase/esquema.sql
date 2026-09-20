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

-- Varios calendarios: la secretaría, el personal de cada quien, el de un
-- proyecto grande. Cada uno puede apuntar a un calendario distinto de Google.
create table if not exists calendarios (
  id      text primary key,
  nombre  text,
  color   int default 1,
  gcal_id text,
  orden   int default 0
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
  proyecto   text,
  gcal_id    text,
  calendario text
);

alter table agenda add column if not exists calendario text;

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
-- Qué avisos por correo quiere recibir cada persona.
alter table integrantes add column if not exists avisos jsonb default '{}'::jsonb;

-- Enlaces a carpetas de Drive, cronogramas y documentos. Si 'proyecto' viene
-- vacío, el enlace es general de la secretaría.
create table if not exists enlaces (
  id       text primary key,
  nombre   text,
  url      text,
  proyecto text
);

alter table enlaces add column if not exists proyecto text;

alter table pasos add column if not exists actualizado text;

-- Un paso puede colgar de otro: así se subdivide el trabajo sin inventar otra
-- tabla. 'padre' vacío = paso de primer nivel.
alter table pasos add column if not exists padre         text;
alter table pasos add column if not exists principal     text;   -- encargade principal del paso
alter table pasos add column if not exists inicio        text default '';
alter table pasos add column if not exists observaciones text default '';

alter table proyectos add column if not exists observaciones text default '';
alter table proyectos add column if not exists inicio        text default '';

-- Gente de fuera de la secretaría que igual toma pasos o proyectos: se guarda
-- con su equipo para saber a quién se le está pidiendo algo.
alter table integrantes add column if not exists externo bool default false;
alter table integrantes add column if not exists equipo  text;

-- La reunión trae su enlace de videollamada y su acta.
alter table agenda add column if not exists videollamada text default '';
alter table agenda add column if not exists acta         text default '';

-- La tabla de puntos de una reunión: qué se trata, quién lo trae y en qué quedó.
create table if not exists puntos (
  id          text primary key,
  reunion     text not null,
  texto       text,
  responsable text,
  acuerdo     text default '',
  estado      text default 'Pendiente',
  orden       int  default 0
);

-- ---------------------------------------------------------------------------
-- Pizarra: un lienzo compartido por reunión. Cada cosa que se pone encima es
-- una fila, para que dos personas puedan mover cosas distintas a la vez sin
-- pisarse.
-- ---------------------------------------------------------------------------
create table if not exists pizarras (
  id     text primary key,
  nombre text,
  creada timestamptz default now(),
  orden  int default 0
);

-- tipo: nota · texto · tabla · dibujo · proyecto · conexion
-- datos: lo propio de cada tipo (celdas de la tabla, trazo del dibujo,
--        extremos de una conexión, si la ventana está reducida)
create table if not exists pizarra_items (
  id          text primary key,
  pizarra     text not null,
  tipo        text default 'nota',
  x           int  default 40,
  y           int  default 40,
  ancho       int  default 220,
  alto        int  default 150,
  texto       text default '',
  color       int  default 1,
  datos       jsonb default '{}'::jsonb,
  orden       int  default 0,
  actualizado timestamptz default now()
);

create index if not exists puntos_por_reunion on puntos (reunion);
create index if not exists items_por_pizarra  on pizarra_items (pizarra);
create index if not exists pasos_por_padre    on pasos (padre);

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
alter table calendarios   enable row level security;
alter table puntos        enable row level security;
alter table pizarras      enable row level security;
alter table pizarra_items enable row level security;

-- La política se crea sólo si falta, para poder volver a ejecutar este archivo
-- sin borrar nada.
do $$
declare t text;
begin
  foreach t in array array['equipos','seguimiento','observaciones','proyectos','pasos',
                           'hitos','agenda','integrantes','enlaces','calendarios',
                           'puntos','pizarras','pizarra_items']
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
                           'hitos','agenda','integrantes','enlaces','calendarios',
                           'puntos','pizarras','pizarra_items']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
