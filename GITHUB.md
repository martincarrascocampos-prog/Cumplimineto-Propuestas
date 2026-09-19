# Qué hacer en GitHub — paso a paso

GitHub es la **bodega del código**. Yo dejo ahí los cambios; Replit los va a
buscar y los publica. Casi nunca tendrás que escribir código en GitHub: lo que
harás es **mirar, comprobar y, si algo sale mal, volver atrás**.

- Repositorio: <https://github.com/martincarrascocampos-prog/Cumplimineto-Propuestas>
- Rama única y por defecto: `claude/quirky-pasteur-ab8jt1`

> Hay **una sola rama**, y es la principal. Eso significa que **no tienes que
> hacer ningún *merge* ni abrir ningún *pull request***. Cuando yo empujo un
> cambio, ya queda en la rama que Replit lee. Si algún día ves un botón verde
> que dice "Compare & pull request", puedes ignorarlo.

---

## 1. Comprobar que el cambio llegó (30 segundos)

1. Abre el repositorio en el navegador.
2. Arriba de la lista de archivos hay una línea gris con el **último commit**:
   su título y cuánto hace que se hizo.
3. Si el título es el del cambio que te avisé y dice *"hace unos minutos"*,
   llegó bien. Listo.

Para ver **qué** cambió exactamente:

1. Haz clic en el título del commit.
2. Verás las líneas en verde (agregadas) y en rojo (quitadas), archivo por
   archivo. No necesitas entenderlas; sirve para confirmar que se tocó lo que
   esperabas (por ejemplo, `estilos.css` si el cambio era visual).

---

## 2. Llevar el cambio a la aplicación en línea

Esto **no se hace en GitHub**, se hace en Replit. GitHub guarda; Replit publica.

1. Entra a tu proyecto en Replit.
2. Panel lateral → **Git** (el ícono de la rama).
3. Botón **Pull** → trae los cambios desde GitHub.
4. Botón **Run** → prueba que funcione en la vista previa.
5. Botón **Deploy** → **este es el que se olvida**. Sin Deploy, la dirección
   `.replit.app` que usa el equipo sigue mostrando la versión anterior.
6. Recarga el navegador con `Ctrl + Shift + R` (o `Cmd + Shift + R` en Mac)
   para saltarte la caché.

Está todo detallado en [CONECTAR.md](CONECTAR.md), sección *"Cómo actualizar
cuando hay cambios nuevos"*.

---

## 3. Si algo se ve roto después de un cambio

No hay que arreglarlo a mano. Se vuelve a la versión anterior:

1. En GitHub, pestaña **Commits** (sobre la lista de archivos, dice algo como
   "38 Commits").
2. Busca el **commit anterior** al que rompió las cosas.
3. Haz clic en él, y arriba a la derecha en **`<>` Browse files**.
4. Copia el código de siete letras y números que aparece en la dirección.
5. Avísame ese código por acá y yo devuelvo el sistema a ese punto.

También puedes simplemente escribirme *"se rompió tal cosa"* y yo lo reviso y
lo arreglo hacia adelante, que suele ser mejor que retroceder.

---

## 4. Guardar una copia de seguridad

Una vez al mes, o antes de un cambio grande:

1. Botón verde **`<> Code`**.
2. **Download ZIP**.
3. Guarda el archivo en tu Drive con la fecha en el nombre.

Eso te deja una copia completa del sistema que no depende de GitHub, Replit ni
de mí.

---

## 5. Dar acceso a alguien más del equipo

Si quieres que otra persona de la Mesa pueda ver o editar el código:

1. Pestaña **Settings** (arriba a la derecha del repositorio).
2. Menú lateral → **Collaborators**.
3. **Add people** → su usuario de GitHub o su correo.
4. Elige el permiso:
   - **Read** — sólo mirar. Es lo que corresponde para la mayoría.
   - **Write** — puede subir cambios. Dáselo sólo a quien vaya a programar.

Ojo: para **usar** el Conectómetro y el SPT nadie necesita GitHub. El equipo
entra por la dirección `.replit.app` con su correo y contraseña. GitHub es sólo
para quien toque el código.

---

## 6. Lo que NUNCA debe subirse a GitHub

El repositorio es la parte pública del sistema. Estas cosas van **sólo en los
Secrets de Replit**, nunca en un archivo del repositorio:

| Qué | Dónde va |
|---|---|
| Llave **secreta** de Supabase (`service_role` / *Secret key*) | Secrets de Replit |
| Contraseña de aplicación de Gmail | Secrets de Replit |
| JSON de la cuenta de servicio de Google | Secrets de Replit |
| Clave de Resend | Secrets de Replit |
| `CORREOS_TOKEN` | Secrets de Replit |

La llave **publicable** de Supabase (`sb_publishable_...`) sí puede estar a la
vista: está diseñada para eso y la protegen las políticas RLS de la base.

Si alguna vez pegas una llave secreta por error en un archivo, avísame de
inmediato: hay que **rotarla en Supabase o Google**, no basta con borrarla del
archivo, porque queda en el historial.

---

## 7. Si Replit y GitHub se pelean

A veces Replit dice que no puede hacer *Pull* porque hay cambios locales (pasa
cuando Replit guardó solo su archivo de configuración). En la **Shell** de
Replit:

```bash
git status          # muestra qué quedó suelto
git stash           # lo guarda aparte
git pull            # ahora sí trae los cambios
```

Si después de eso algo quedó raro, avísame con lo que salió en pantalla.

---

## Resumen

| Situación | Qué haces |
|---|---|
| Te avisé de un cambio | Replit: Pull → Run → **Deploy** |
| Quieres ver qué cambió | GitHub → clic en el último commit |
| Algo se rompió | Avísame, o mándame el código del commit anterior |
| Copia de seguridad | `<> Code` → Download ZIP → a tu Drive |
| Sumar a alguien | Settings → Collaborators → Read |
| Merge / pull request | **Nada.** Hay una sola rama y es la principal |
