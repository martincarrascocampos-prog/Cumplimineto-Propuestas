# Guía de conexiones — paso a paso

Cuatro conexiones, en este orden. Cada una funciona sola: si te atascas en la segunda,
la primera ya te sirve.

| # | Qué conectas | Para qué | Tiempo |
|---|---|---|---|
| 1 | GitHub → Replit | Que la aplicación viva en internet y reciba los cambios | 10 min |
| 2 | Replit → Supabase | Que las seis personas vean y editen lo mismo | 15 min |
| 3 | Drive → SPT | Carpetas y documentos a un clic desde cada proyecto | 5 min |
| 4 | Cronogramas de Google | Acceso directo desde el proyecto que corresponde | 5 min |

---

## 1. Conectar GitHub con Replit

1. Entra a **replit.com** con tu cuenta.
2. Arriba a la derecha: **Create** → **Import from GitHub**.
3. La primera vez te va a pedir autorizar Replit en GitHub: acepta y dale acceso al
   repositorio `Cumplimineto-Propuestas`. (Si no lo ves en la lista, en GitHub entra a
   *Settings → Applications → Replit → Configure* y agrégalo.)
4. Elige el repositorio. La rama `claude/quirky-pasteur-ab8jt1` es la principal, así que
   viene sola.
5. Replit reconoce `package.json` y `.replit`. Aprieta **Run**.
   En la consola debe decir: `Conectómetro en http://localhost:3000 · SPT en /spt`.
6. En la ventana de vista previa se abre el Conectómetro. El SPT está en `/spt`.

**Para traer los cambios que yo deje después:** panel lateral de Replit → icono de **Git**
→ **Pull**. Si tú editaste algo en Replit y lo quieres guardar en GitHub: **Commit & Push**.

**Para que tenga dirección fija y no se duerma:** botón **Deploy** → *Autoscale*.
Te queda una dirección tipo `https://conectometro.tu-usuario.replit.app`.

---

## 2. Conectar Replit con la base de datos (Supabase)

### 2.1 Crear la base

1. Entra a **supabase.com** → **Start your project** → crea la cuenta.
2. **New project**:
   - *Name*: `conectometro`
   - *Database password*: genera una y guárdala (no se usa en la aplicación, pero Supabase la pide).
   - *Region*: **South America (São Paulo)**, que es la más cerca de Chile.
3. Espera un par de minutos a que termine de crearse.

### 2.2 Crear las tablas

4. Menú lateral → **SQL Editor** → **New query**.
5. Abre el archivo `supabase/esquema.sql` de este proyecto, copia **todo** su contenido,
   pégalo en el editor y aprieta **Run**.
6. Debe decir *Success*. Si lo corres dos veces no pasa nada: está escrito para eso.
7. Para comprobar: menú lateral → **Table Editor**. Deben aparecer nueve tablas
   (`equipos`, `seguimiento`, `observaciones`, `proyectos`, `pasos`, `hitos`, `agenda`,
   `integrantes`, `enlaces`).

### 2.3 Copiar las dos llaves

8. Menú lateral → **Project Settings** (el engranaje) → **API**.
9. Copia estos dos valores:
   - **Project URL** → algo como `https://abcdefghijk.supabase.co`
   - **Project API keys → anon public** → una clave larga que empieza con `eyJ...`

   La clave `service_role` **no se usa acá**: esa nunca va en la aplicación.

### 2.4 Pegarlas en Replit

10. En Replit, panel lateral → **Tools** → **Secrets**.
11. Crea dos secretos, con estos nombres exactos:

    | Key | Value |
    |---|---|
    | `SUPABASE_URL` | la Project URL del paso 9 |
    | `SUPABASE_ANON_KEY` | la clave anon public del paso 9 |

12. Detén y vuelve a dar **Run**. Si ya estaba publicado, aprieta **Deploy** otra vez.

### 2.5 Comprobar que quedó

13. Abre la aplicación. Arriba a la derecha hay una etiqueta:
    - **Base compartida** (punto verde) → quedó conectada.
    - **Solo este navegador** (punto amarillo) → los secretos no llegaron: revisa que los
      nombres estén escritos igual y que hayas vuelto a dar Run.
14. Prueba de fuego: marca un paso desde tu computador y ábrelo desde el celular con la
    misma dirección. Debe aparecer marcado.

---

## 3. Conectar las carpetas de Drive

1. En Drive, arma la estructura de la secretaría. Una que funciona:

   ```
   Secretaría de Participación 2026/
     ├── Actas/
     ├── Documentos/
     ├── Difusión/
     └── Proyectos/
          ├── Festival de invierno/
          └── Vínculo con preuniversitarios/
   ```

2. Sobre la carpeta → **Compartir**. Agrega a las seis personas con permiso de *Editor*,
   o pon *Cualquier persona con el vínculo* si da lo mismo que se comparta.
3. **Compartir → Copiar vínculo**.
4. En el SPT:
   - Enlaces de toda la secretaría → pestaña **Equipo**, abajo, *Carpetas y documentos*.
     Aprieta *Crear los habituales* y pega cada dirección.
   - Enlaces de un proyecto → pestaña **Proyectos**, abre el proyecto, abajo en
     *Carpetas y documentos* aprieta **+ Carpeta de Drive** y pega el vínculo.
5. Cuando el enlace está pegado aparece un botón **Abrir** al lado. Eso es todo.

---

## 4. Conectar los cronogramas de Google

1. Crea el cronograma donde te acomode: un **Documento** de Google, una **Hoja de cálculo**
   o un **Calendario**. Para cronogramas conviene la hoja de cálculo.
2. **Compartir** con el equipo, permiso de *Editor*.
3. Copia el vínculo.
4. En el SPT, dentro del proyecto: **+ Cronograma** → pega la dirección.
5. Queda accesible desde la ficha del proyecto, junto a sus pasos y sus hitos.

> Si además quieres **ver** el cronograma dentro de la aplicación, sin salir a otra pestaña:
> en Google, *Archivo → Compartir → Publicar en la web* entrega una dirección que se puede
> incrustar. Avísame y dejo esa vista adentro de la ficha del proyecto.

---

## Si algo falla

| Síntoma | Qué pasó |
|---|---|
| La aplicación dice *Solo este navegador* | Faltan los secretos en Replit, están mal escritos, o no volviste a dar Run |
| Error `relation "proyectos" does not exist` | No se corrió el `esquema.sql` en Supabase, o se corrió en otro proyecto |
| En Replit no aparecen los cambios nuevos | Falta apretar **Pull** en el panel de Git |
| Se ve en tu computador pero no en el del resto | Están abriendo el archivo HTML suelto en vez de la dirección de Replit |
| Supabase dice que el proyecto está pausado | Plan gratis: se duerme tras una semana sin uso. Se despierta con un clic en su panel |

## Orden recomendado

Haz **1** y comprueba que la aplicación abre. Después **2** y comprueba con el celular.
**3** y **4** son cinco minutos cada uno y los puede hacer cualquiera del equipo, no
necesitan tocar código.
