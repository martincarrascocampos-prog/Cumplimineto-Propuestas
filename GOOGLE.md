# Conectar con Google Workspace — paso a paso

Tres niveles, de menor a mayor trabajo. El primero ya está funcionando y puede que te baste.

| Nivel | Qué hace | Qué necesita |
|---|---|---|
| 1. Botón a Google Calendar | Abre Google con la reunión escrita; tú guardas | Nada. Ya funciona |
| 2. Calendario compartido | Las reuniones del SPT aparecen solas en un calendario del equipo | Cuenta de servicio |
| 3. Correos automáticos | Recordatorios semanales por correo | Lo mismo del 2, más el envío |

---

## Nivel 1 — ya está andando

En el SPT → Calendario, cada reunión tiene **Añadir a Google Calendar**. Abre Google con el tema,
la hora, el lugar y los invitados ya escritos. Funciona con cualquier cuenta, incluida la de la
universidad, sin configurar nada.

Para que los invitados salgan bien, carga el correo de cada persona en la pestaña **Equipo**.

---

## Nivel 2 — que se sincronice solo

### Antes de partir: una advertencia

Una cuenta de servicio **no puede invitar personas a un evento** salvo que el administrador del
Workspace le dé un permiso especial (*delegación de dominio*), que en la Universidad de Chile no
te van a dar.

La salida es más simple y funciona igual de bien: **un calendario compartido de la secretaría**.
Las reuniones se crean ahí, todo el equipo lo tiene suscrito, y aparece en el calendario de cada
persona sin necesidad de invitaciones.

### 2.1 Crear el calendario del equipo

1. En Google Calendar, panel izquierdo → **Otros calendarios** → **+** → **Crear calendario**.
2. Nombre: `FECh · Secretaría de Participación`. Crear.
3. Entra a su **Configuración** y déjala abierta: la vas a necesitar en el paso 2.4.

### 2.2 Crear el proyecto en Google Cloud

4. Entra a **console.cloud.google.com** con la cuenta que vaya a ser dueña de esto.
   Si tu cuenta universitaria bloquea el acceso, usa una cuenta de Gmail personal o la de la FECh:
   **no importa de quién sea el proyecto**, porque el permiso se lo das compartiendo el calendario.
5. Arriba, selector de proyectos → **Proyecto nuevo** → nombre `conectometro` → Crear.
6. Menú → **APIs y servicios** → **Biblioteca** → busca **Google Calendar API** → **Habilitar**.
   (Si más adelante quieres leer archivos de Drive, habilita también **Google Drive API**.)

### 2.3 Crear la cuenta de servicio

7. **APIs y servicios** → **Credenciales** → **Crear credenciales** → **Cuenta de servicio**.
8. Nombre: `conectometro`. Crear y continuar. Los permisos de rol déjalos vacíos: no hacen falta.
9. Abre la cuenta de servicio recién creada → pestaña **Claves** → **Agregar clave** →
   **Crear clave nueva** → **JSON**. Se descarga un archivo.
10. Abre ese archivo y copia el valor de `client_email`. Es algo como
    `conectometro@conectometro-123456.iam.gserviceaccount.com`.

**Ese archivo es una llave privada: no lo subas a GitHub ni lo mandes por chat.**

### 2.4 Darle acceso al calendario

11. Vuelve a la configuración del calendario del paso 2.1 → **Compartir con determinadas personas**
    → **Agregar personas** → pega el `client_email` del paso 10.
12. Permiso: **Hacer cambios en los eventos**. Guardar.
13. En esa misma pantalla, más abajo, copia el **ID del calendario**. Es un texto largo terminado
    en `@group.calendar.google.com`.

### 2.5 Guardar las credenciales en Replit

14. Replit → **Tools** → **Secrets** → crea dos:

    | Key | Value |
    |---|---|
    | `GOOGLE_CREDENCIALES` | todo el contenido del archivo JSON, pegado tal cual |
    | `GOOGLE_CALENDARIO_ID` | el ID del paso 13 |

15. Avísame cuando estén los dos y escribo la parte que habla con Google: crear el evento al
    agendar, actualizarlo al cambiar la hora, borrarlo al eliminar la reunión, y traer lo que
    alguien haya movido directamente en Google.

### 2.6 Que el equipo lo vea

16. Cada persona, en su Google Calendar: **Otros calendarios → Suscribirse** con el ID del
    calendario, o aceptando la invitación que les mande el dueño del calendario.

---

## Nivel 3 — correos automáticos

Con la cuenta de servicio ya creada, falta decidir desde qué dirección salen los correos.
Dos caminos:

- **Gmail de la FECh**: 100 correos al día gratis, 1.500 con Workspace. Necesita autorizar el
  envío desde la aplicación.
- **Un servicio de envío** como Resend: 3.000 correos al mes gratis, se configura en diez minutos
  y no depende del Workspace.

Para el volumen de la secretaría —un resumen semanal y los avisos de plazo— cualquiera sirve.
Recomiendo el segundo: menos trabas y no depende de los permisos de la universidad.

---

## Si Google te bloquea

Si en el paso 2.2 o 2.3 la cuenta universitaria no te deja:

1. Crea el proyecto de Google Cloud con una cuenta personal de Gmail.
2. Sigue igual desde ahí: la cuenta de servicio no necesita pertenecer a la universidad.
3. El calendario del paso 2.1 sí puede vivir en la cuenta de la FECh o en la tuya; solo hay que
   compartirlo con el `client_email`.

---

## Google Drive: la carpeta de la Secretaría, en vivo

La idea es que cada proyecto del SPT muestre **lo que hay ahora mismo** en su
carpeta de Drive, sin que nadie tenga que pegar enlaces uno por uno.

Funciona igual que el calendario: se comparte una carpeta con la **cuenta de
servicio** y el servidor la lee. Nadie del equipo inicia sesión; todos ven lo
mismo. La cuenta de servicio **sólo ve lo que se le comparta**, así que esto no
abre nada por accidente.

### 1. Crear la carpeta madre

En Drive, crea una carpeta —por ejemplo **Secretaría de Participación 2026**—
donde vivirá todo. Dentro irán las carpetas de cada proyecto.

### 2. Compartirla con la cuenta de servicio

1. Clic derecho sobre la carpeta → **Compartir**.
2. Pega el correo de la cuenta de servicio, que termina en
   `...iam.gserviceaccount.com` (es el `client_email` del JSON).
3. Dale permiso de **Editor** — hace falta para que el sistema pueda crear las
   carpetas de los proyectos. Si sólo quieres que lea, **Lector** basta, pero
   entonces las carpetas las creas tú a mano.
4. **Desmarca "Notificar a las personas"**: no es una persona, y el correo rebota.

> Si tu cuenta es la de la universidad y Google no te deja compartir hacia
> afuera, es la política de Workspace de la U. La salida es la misma que para el
> calendario: usar una cuenta Gmail común como dueña de la carpeta, o pedirle a
> la DTI que autorice el dominio de la cuenta de servicio.

### 3. Copiar el id de la carpeta

Abre la carpeta y mira la dirección:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       └──────── esto es el id ────────┘
```

### 4. Pegarlo en los Secrets de Replit

| Secret | Valor |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT` | el JSON completo de la cuenta de servicio, tal cual |
| `DRIVE_CARPETA_RAIZ` | el id de la carpeta madre |

`GOOGLE_SERVICE_ACCOUNT` es el mismo Secret que usa el calendario: se carga una
sola vez y sirve para los dos.

**Nunca** subas ese JSON al repositorio ni lo mandes por chat: es una llave
privada. Si alguna vez se filtra, se borra la clave desde Google Cloud →
*IAM y administración* → *Cuentas de servicio* → *Claves*, y se crea otra.

### 5. Comprobar

Con la aplicación publicada, abre en el navegador:

```
https://tu-app.replit.app/api/drive/estado
```

- `{"configurado":true, ...}` con el número de elementos → quedó.
- `{"configurado":false,"motivo":"..."}` → el motivo dice exactamente qué falta.

### Qué gana el equipo

En **Proyectos**, al abrir un proyecto:

- Si no tiene carpeta, aparece **"+ Crear carpeta en Drive"**: la crea dentro de
  la carpeta madre, con el nombre del proyecto, y guarda el enlace solo.
- Si ya tiene, aparece **"En la carpeta"** con sus archivos: nombre, tipo y
  cuándo se tocó por última vez. Cada uno abre en Drive con un clic, y el botón
  **Actualizar** vuelve a preguntar.

El listado se guarda medio minuto para no llamar a Google en cada clic; con
*Actualizar* se pide de nuevo al tiro.

### Si no se configura

No pasa nada: los enlaces pegados a mano (*Carpeta de Drive*, *Cronograma*,
*Documento de trabajo*, *Acta*) siguen funcionando igual, y el bloque de Drive
sencillamente no aparece. En la versión de un solo archivo, que se abre con
doble clic y no tiene servidor, tampoco aparece.
