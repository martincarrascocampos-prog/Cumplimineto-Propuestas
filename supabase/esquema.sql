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

create table if not exists integrantes (
  id     text primary key,
  nombre text,
  rol    text,
  correo text,
  notas  text
);

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

-- Acceso: por ahora, quien tenga la URL y la clave pública puede leer y escribir.
-- Sirve para partir con el equipo. Cuando quieran cuentas con contraseña, se
-- cambia 'anon' por 'authenticated' y se activa el login de Supabase.
do $$
declare t text;
begin
  foreach t in array array['equipos','seguimiento','observaciones','proyectos','pasos',
                           'hitos','agenda','integrantes','enlaces']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "acceso equipo" on %I', t);
    execute format('create policy "acceso equipo" on %I for all to anon using (true) with check (true)', t);
  end loop;
end $$;
