# Cómo publicar el Conectómetro y el SPT

Dos piezas que se complementan:

- **Supabase** es la base de datos: el archivador donde quedan los proyectos, los pasos y el avance. No tiene pantalla.
- **Replit** es donde vive la aplicación: publica las páginas y les da una dirección web.

Se puede usar sólo una de las dos (abrir el HTML sin Replit, o guardar sólo en el navegador sin Supabase),
pero juntas dan lo que buscamos: que seis personas editen lo mismo desde donde estén.

---

## 1. Crear la base en Supabase (10 minutos, gratis)

1. Entra a **supabase.com**, crea una cuenta y un proyecto nuevo. Anota la contraseña de la base
   (no se usa en la aplicación, pero Supabase la pide).
2. En el menú lateral abre **SQL Editor → New query**.
3. Copia el contenido completo de `supabase/esquema.sql` de este repositorio, pégalo y aprieta **Run**.
   Eso crea las nueve tablas. Se puede volver a ejecutar sin romper nada.
4. Ve a **Project Settings → API** y copia dos datos:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** (una clave larga)

El plan gratis alcanza de sobra: 500 MB de base y 50.000 usuarios al mes. Si el proyecto pasa una
semana sin actividad, Supabase lo duerme y se despierta con un clic desde su panel.

## 2. Publicar la aplicación en Replit

1. En Replit: **Create Repl → Import from GitHub** y elige este repositorio.
2. Replit detecta `package.json` y `.replit`. Aprieta **Run**: debería decir
   `Conectómetro en http://localhost:3000 · SPT en /spt`.
3. Abre **Tools → Secrets** y agrega dos secretos con los datos del paso 1:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   Con eso, todas las personas que entren quedan conectadas solas, sin pegar nada.
4. Para que quede con dirección fija y siempre encendida: **Deploy**. Sin publicar, el Repl se
   duerme cuando no lo estás mirando (y para el bot de WhatsApp, más adelante, tiene que estar despierto).

Direcciones una vez publicado:

| Dirección | Qué es |
|---|---|
| `/` o `/programa` | Conectómetro — el panel del programa, para la Mesa |
| `/spt` | SPT — proyectos, pasos y agenda de la Secretaría de Participación |

## 3. Si prefieres sin Replit

Abre `index.html` con doble clic. Funciona igual, pero los datos quedan sólo en ese navegador
salvo que conectes Supabase a mano: en el SPT, pestaña **Conexión**, pega la URL y la clave del paso 1.
Cada persona lo hace una vez en su computador.

---

## Cómo quedan conectadas las dos secciones

Un proyecto del SPT con origen *Ejes del Programa* **es** una propuesta del programa, y sus **pasos
son las etapas** de esa propuesta. Es una sola tabla.

- Si en el Conectómetro divides la propuesta 2.3 en etapas, en el SPT aparece el proyecto con esos pasos.
- Si en el SPT marcas un paso como completado, en el Conectómetro sube el avance de la propuesta
  y con él el porcentaje del equipo.

Nadie copia nada a mano.

## Sobre los accesos

Hoy, quien tenga la dirección y la clave pública puede editar. Sirve para partir entre el equipo.
Cuando quieran cuentas con correo y contraseña, se activa el login de Supabase y en el archivo
`supabase/esquema.sql` se cambia `anon` por `authenticated`.

## Respaldo

En el Conectómetro, pestaña **Datos → Exportar JSON**, se descarga todo. Ese mismo archivo se puede
volver a importar. Conviene hacerlo de vez en cuando.
