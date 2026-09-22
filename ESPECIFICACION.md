# Conectómetro + SPT · especificación completa

> Documento de contexto para revisión externa. Describe qué es el sistema, cómo
> está construido, qué hace hoy, qué decisiones se tomaron y por qué, y qué
> queda pendiente. Escrito para que alguien que no ha visto el código pueda
> analizarlo y proponer mejoras con fundamento.

---

## 1. Qué es

Sistema de gestión para la **Secretaría de Participación de la FECh**
(Federación de Estudiantes de la Universidad de Chile), período 2026.

Definición operativa que usa la propia aplicación:

> El Conectómetro es el espacio de trabajo central e interactivo de la
> Secretaría de Participación. Funciona como el cerebro logístico y visual de la
> plataforma, midiendo y vinculando en tiempo real el flujo de trabajo: desde el
> nacimiento de ideas y revisión de documentos, hasta la calendarización de
> reuniones y ejecución de proyectos.

Son **dos aplicaciones que comparten una sola base de datos**:

| | Conectómetro | SPT |
|---|---|---|
| Archivo | `index.html` | `spt.html` |
| Alcance | Toda la Mesa (7 equipos) | Sólo la Secretaría de Participación |
| Mide | Cumplimiento del programa electoral | Ejecución del trabajo concreto |
| Usuarios | La Mesa Directiva | El equipo de Participación (~6 personas) |

### La bisagra entre ambas

Este es el concepto central del diseño y conviene entenderlo antes de todo lo
demás:

- Las **102 propuestas** del programa *Conectemos la Chile* parten **sin
  asignar**. El reparto lo decide la Mesa.
- Cuando una propuesta se asigna a **Participación**, aparece automáticamente
  como **proyecto** en el SPT (grupo «Del programa»).
- Los **pasos** de ese proyecto en el SPT **son** las **etapas** de esa
  propuesta en el Conectómetro. No hay sincronización ni copia: es la misma
  fila de la misma tabla (`pasos`), vista desde dos interfaces.
- Marcar un paso en el SPT sube el porcentaje de cumplimiento en el
  Conectómetro, en tiempo real.
- Si la propuesta se reasigna a otro equipo, el proyecto sale de la lista de
  Participación (y queda en una sección aparte si ya tenía trabajo hecho, para
  no perderlo).

---

## 2. Arquitectura y decisiones técnicas

### Stack

- **Frontend**: JavaScript plano (ES2020), sin framework, sin compilación, sin
  `npm` en el navegador. Scripts clásicos `<script src>`.
- **Base de datos**: Supabase (PostgreSQL) con RLS y Realtime.
- **Servidor**: Express mínimo (`server.js`), sólo para servir archivos,
  inyectar credenciales y hacer de puente con las APIs de Google.
- **Hosting**: Replit (Autoscale), desplegado desde GitHub.
- **Sin dependencias de frontend**: cero librerías de UI, de gráficos o de
  canvas. Todo es DOM y SVG escritos a mano.

### Por qué sin framework ni librerías

Tres restricciones que condicionan todo el diseño:

1. **Tiene que abrirse con doble clic.** Existe una versión de **un solo
   archivo HTML** (~9 MB) que contiene las dos aplicaciones, ambos PDF en
   base64 y las 104 miniaturas de página. Se usa para trabajar sin internet y
   para que cualquiera del equipo pruebe sin instalar nada. Un bundler o un
   CDN rompería esto.
2. **Nadie del equipo es programador.** El código tiene que poder leerse y
   modificarse sin conocer un framework. Todos los identificadores y
   comentarios están en español.
3. **Sin build step.** Editar un archivo y recargar es todo el ciclo de
   desarrollo.

Esto tiene un costo asumido: no hay tipado, no hay tests automatizados, y
`spt.js` tiene 3.114 líneas en un solo archivo. Se verifica con un guion de
Playwright que maneja el navegador de verdad.

### Tamaño del código

| Archivo | Líneas | Rol |
|---|---:|---|
| `core.js` | 739 | Capa compartida: datos, modelo, UI, gráficos |
| `app.js` | 1.627 | Conectómetro |
| `spt.js` | 3.114 | SPT |
| `estilos.css` | 1.347 | Toda la presentación |
| `data.js` | 251 | Las 102 propuestas con su texto literal (116 KB) |
| `estatutos-data.js` | 639 | Estatutos FECh extraídos (132 KB) |
| `spt-data.js` | 43 | Listas maestras del SPT |
| `server.js` | 134 | Express |
| `google-auth.js` | 97 | Firma del token de Google (sin librerías) |
| `drive.js` | 123 | API de Google Drive |
| `meet.js` | 114 | API de Google Calendar / Meet |
| `correos.js` | 320 | Motor de correos automáticos |

---

## 3. Modelo de datos

13 tablas en PostgreSQL. **Todas las fechas se guardan como `text`**
(`AAAA-MM-DD`) a propósito: la aplicación permite dejarlas vacías y una columna
`date` rechaza la cadena vacía.

| Tabla | Qué guarda |
|---|---|
| `equipos` | Los 7 equipos de la Mesa |
| `seguimiento` | Estado de cada propuesta: equipo, estado, avance, plazo |
| `observaciones` | Notas con fecha sobre una propuesta |
| `proyectos` | Proyectos del SPT (del programa o propios) |
| `pasos` | Pasos de un proyecto = etapas de una propuesta |
| `hitos` | Fechas comprometidas de un proyecto |
| `calendarios` | Varios calendarios, cada uno con su ID de Google |
| `agenda` | Reuniones |
| `puntos` | Tabla de puntos de cada reunión |
| `integrantes` | Personas, con horarios de disponibilidad |
| `enlaces` | Documentos y carpetas, con o sin proyecto |
| `pizarras` | Tableros de la pizarra |
| `pizarra_items` | Cada elemento sobre una pizarra |

### Decisiones de modelado que conviene revisar

- **IDs idempotentes**: el seguimiento de una propuesta es `seg:<código>` y su
  proyecto es `prj:<código>`. Si dos personas crean lo mismo a la vez, queda
  una sola fila en vez de dos.
- **Creación perezosa**: leer nunca escribe. Las 102 propuestas no generan 102
  filas vacías; la fila aparece al primer cambio real.
- **Sub-pasos por auto-referencia**: `pasos.padre` apunta a otro `pasos.id`. No
  hay tabla aparte. Un paso con hijos se marca completo solo cuando todos lo
  están, y cuenta fraccionado en el avance (media hecha vale 0,5).
- **La pizarra es fila por elemento**, no un blob JSON por tablero. Así dos
  personas mueven cosas distintas a la vez sin pisarse y el Realtime de
  Supabase resuelve la concurrencia.
- **El catálogo del programa viaja con la aplicación**, no en la base: el
  título y el texto literal de cada propuesta están en `data.js`. Sólo el
  seguimiento es dato mutable.

### Acceso

RLS activo en las 13 tablas, con una política `acceso equipo` que permite todo
al rol `anon`. Es deliberado: las seis personas entran sin cuenta. Hay un
archivo `supabase/cerrar-acceso.sql` que cambia la política a `authenticated`
cuando se quiera exigir login — **ejecutarlo antes de crear las cuentas deja a
todos fuera**.

---

## 4. Funcionalidades

### 4.1 Conectómetro — 5 módulos

**Panel.** Porcentaje global de cumplimiento, medidor con cuatro umbrales
(**50 %** a medio camino, **70 %** mínimo, **80 %** ideal, **90 %** logro),
proyección al cierre, KPI por estado, composición, cumplimiento por equipo y
por eje. Contiene la ventana plegable «¿Conectómetro?» con la definición.

**Propuestas.** Las 102 en tabla filtrable (equipo, eje, estado, texto libre).
Al abrir una: texto literal del programa, equipo responsable, estado, avance,
plazo, **etapas** con plazo y responsable, y observaciones con fecha.

**Equipos.** Desglose por equipo con sus propuestas y su avance.

**Proyecto.** Vista de plan de trabajo: cada equipo con sus propuestas y cada
propuesta con sus etapas, para marcar avance masivamente. Incluye una
plantilla de 5 etapas aplicable de una vez.

**Documentos.** Dos documentos completos:
- *Programa Conectemos la Chile*: 57 páginas, 102 propuestas en 10 ejes.
- *Estatutos FECh*: 47 páginas, **195 artículos**, 37 entradas de índice
  (títulos y capítulos), 627 bloques de texto.

Cada uno en dos modos: **Lectura** (texto transcrito, a dos columnas, con
índice navegable) y **PDF original** (visor con miniaturas de todas las
páginas y descarga).

### 4.2 SPT — 8 módulos

**Tablero.** Vista de trabajo con filtros por estado, urgencia, origen,
encargado y texto.

**Panel.** Ranking de actividades designadas por persona, urgencias
primordiales, reparto por urgencia, avance por proyecto, pasos por estado.

**Proyectos.** Tres grupos: del programa, propios y reasignados. Cada proyecto
tiene estado, clasificación, plazo tipo, urgencia, fecha de inicio, plazo
final, observaciones, equipo designado (el primero es el principal), **pasos**,
**hitos** y documentos.

Cada **paso** tiene: descripción, fecha de inicio, plazo, estado, **encargade
principal del paso** (que puede no ser quien lleva el proyecto), acompañantes,
**observaciones propias** y **sub-pasos** anidados.

**Calendario.** Cuatro vistas al modo de Google Calendar: **mes, semana, día y
agenda**. Línea de la hora actual, eventos superpuestos repartidos en columnas,
creación haciendo clic en una franja horaria, riel con mini-mes y lista de
calendarios que se prenden y apagan. Múltiples calendarios con color propio e
ID de Google individual. Exportación `.ics`.

**Reuniones.** Tabla de planificación (fecha, hora, tema, asistentes,
videollamada) y, por reunión, una **tabla de puntos**: qué se trata, quién lo
trae, en qué quedó, estado. Botón para llevar los puntos a la pizarra.

**Pizarra.** Lienzo colaborativo. Tipos de elemento: nota de color, idea
suelta, **tabla que se genera y crece**, **dibujo a mano alzada**, **ventana de
proyecto** y **conexión** entre elementos. Tres capacidades destacadas:

1. **Importación de puntos**: los temas de una reunión se inyectan como nodos
   colgando de un nodo raíz (línea de ideas).
2. **Autogeneración de mapa mental**: elegir un proyecto consulta la base y
   renderiza el árbol completo con colores por clase de nodo — título al
   centro, plazos y urgencia a la izquierda, pasos con sus sub-pasos a la
   derecha, responsables abajo, observaciones arriba.
3. **Ventana de proyecto viva**: no es una copia. Se marcan los pasos desde la
   pizarra y se reduce a su título con un clic.

Varias pizarras, que se crean en blanco y quedan asociadas a la reunión cuyos
puntos recibieron.

**Carpeta.** Vista previa en vivo de la carpeta real de Drive de la Secretaría,
con navegación por subcarpetas, **más** el índice de todos los documentos que
el equipo colgó de sus proyectos (leyendo la misma tabla `enlaces`, sin
duplicar). Accesos **bidireccionales**: del documento al proyecto que lo usa y
del proyecto al documento. Un archivo suelto de Drive se vincula a un proyecto
desde su propia fila.

**Equipo.** Integrantes con rol, correo, equipo de origen y **horarios de
disponibilidad** por día de la semana. Personas de **otros equipos** (el resto
de la Mesa, consejerías, centros de estudiantes) se registran como externas y
pueden tomar pasos y proyectos.

### 4.3 Avisos de horario

Al agendar, el sistema cruza la hora con la disponibilidad declarada de cada
invitado y con las otras reuniones, y advierte de choques y de horarios fuera
de rango. No bloquea: avisa.

---

## 5. Integraciones

| Integración | Estado | Qué falta |
|---|---|---|
| Supabase | **Funcionando** | — |
| Realtime | Escrito, sin probar con dos dispositivos | Verificación |
| Google Drive | Construido, inerte | `GOOGLE_SERVICE_ACCOUNT`, `DRIVE_CARPETA_RAIZ` |
| Google Meet | Construido, inerte | `GOOGLE_SERVICE_ACCOUNT`, `GCAL_ID` |
| Google Calendar (enlace) | **Funcionando** | — |
| Correos automáticos | Construido, inerte | Clave de Gmail o Resend |
| Bot de WhatsApp | No empezado | Número dedicado + Reserved VM |

### Endpoints del servidor

```
GET  /config.js                      inyecta la conexión a Supabase
GET  /api/correos/ver?tipo=          vista previa sin enviar
POST /api/correos/enviar?tipo=&clave= envío real, protegido por token
GET  /api/drive/estado               si Drive está conectado
GET  /api/drive/listar?carpeta=       contenido en vivo de una carpeta
POST /api/drive/carpeta              crea la carpeta de un proyecto
GET  /api/reuniones/estado           si se pueden crear enlaces de Meet
POST /api/reuniones/videollamada     crea el evento con su Meet
GET  /programa  ·  GET /spt          las dos aplicaciones
```

Todo lo que depende de Google **degrada limpiamente**: sin credenciales
responde «no configurado», la interfaz esconde el botón correspondiente y el
camino manual sigue disponible (pegar un enlace, abrir Google Calendar
prellenado). En la versión de un solo archivo, que no tiene servidor, tampoco
aparece.

### Autenticación con Google

`google-auth.js` firma un JWT RS256 con el módulo `crypto` de Node y lo
intercambia por un token OAuth. **Sin librerías**, para no agregar dependencias
al servidor. Alcances: `drive` y `calendar`.

### Limitaciones conocidas de las integraciones

- Una **cuenta de servicio no puede invitar asistentes** sin delegación de
  dominio; por eso los invitados van en la descripción del evento, no como
  `attendees` (si se mandan, Google rechaza el evento completo).
- Google Workspace de la universidad **puede bloquear** compartir carpetas o
  calendarios con una cuenta de servicio externa. Documentado, con dos salidas:
  una cuenta Gmail común como dueña, o autorización de la DTI.
- **Zoom no tiene camino equivalente** sin una cuenta de pago con API propia.
  Su enlace se pega a mano y el sistema lo guarda igual.

---

## 6. Diseño visual

La interfaz imita **U-Cursos y U-Campus**, las plataformas de la Universidad de
Chile, porque es lo que el estudiantado ya sabe usar:

- Barra superior roja institucional.
- Barra de módulos con un pictograma y una palabra por sección.
- Migas de pan.
- **Sin tarjetas ni recuadros**: secciones separadas por línea fina y espacio.
- Enlaces en ámbar, botón primario en verde azulado.
- Cada sección es una **ventana plegable**: el título manda, una flecha gira y
  el contenido baja. Recuerda su estado y vuelve a medir los gráficos al
  abrirse.

**Paleta**: extraída del propio PDF del programa contando colores reales del
documento. Validada con un verificador de contraste y de daltonismo: rampa
ordinal de 5 tonos y serie categórica de 8 colores, ambas aprobadas.

**Gráficos**: SVG escrito a mano, con barras de ≤24 px, extremos redondeados,
etiquetas directas, tooltips y alternancia gráfico/tabla en cada uno.

---

## 7. Cómo se verifica

No hay tests unitarios. La verificación es **funcional, con navegador real**:
un guion de Playwright que abre la aplicación, crea integrantes, proyectos y
pasos, arrastra elementos de la pizarra, cambia de vista y comprueba el
resultado en el DOM; además captura pantallas que se revisan a ojo, y mide el
desborde horizontal en 390 px de ancho.

Esto detecta los fallos que importan (una fila que se parte, un diálogo que se
descentra, un gráfico que mide cero) pero **no cubre** la lógica de cálculo de
forma aislada. Es una debilidad reconocida.

---

## 8. Pendientes y debilidades conocidas

### Funcionalidad pendiente

1. **Listado de pasos por plazo en el Panel**, ordenado por urgencia sin
   importar el proyecto. Pedido, no construido.
2. **Bot de WhatsApp** en el grupo del equipo. Se optó por la vía no oficial
   (Baileys) porque la API oficial de Meta **no soporta grupos**. Implica
   riesgo de términos de servicio y requiere un número dedicado y un servidor
   siempre encendido.
3. **SPT para los otros seis equipos**: hoy sólo existe el de Participación.

### Debilidades técnicas

- `spt.js` con 3.114 líneas en un archivo. Difícil de navegar.
- Sin tipado ni tests unitarios.
- **Realtime sin verificar** contra un proyecto vivo con dos dispositivos.
- Nomenclatura doble: «etapas» en el Conectómetro y «pasos» en el SPT para la
  misma entidad. Deliberado (cada equipo usa su palabra) pero confunde al leer
  el código.
- El archivo único pesa ~9 MB; cada PDF nuevo lo engorda.
- La pizarra no tiene zoom ni desplazamiento con el ratón: el lienzo es de
  2400 × 1600 px con barras de desplazamiento.
- Sin historial de cambios ni auditoría de quién modificó qué.

### Seguridad

- La llave **publicable** de Supabase es pública por diseño; la protege el RLS.
- La llave **secreta**, el JSON de la cuenta de servicio de Google y la clave
  de aplicación de Gmail van **sólo** en los Secrets del servidor, nunca en el
  repositorio.
- Los correos reales del equipo **no están** en el repositorio.
- El RLS actual permite todo al rol anónimo. Es una decisión consciente para
  que seis personas entren sin cuenta, pero significa que **cualquiera con la
  URL y la llave publicable puede leer y escribir**. Si el sistema se abre más
  allá del equipo, hay que ejecutar `cerrar-acceso.sql` y crear cuentas.

---

## 9. Qué se agradecería revisar

Preguntas concretas para quien analice esto:

1. ¿La decisión de no usar framework se sostiene a este tamaño (≈6.800 líneas
   de JS), o el costo de mantenimiento ya supera el beneficio de abrir con
   doble clic?
2. ¿Cómo partir `spt.js` sin introducir un build step?
3. ¿El modelo de «una sola tabla `pasos` vista desde dos aplicaciones» es
   robusto, o conviene separar etapa y paso con una relación explícita?
4. ¿Qué estrategia de pruebas cabe aquí sin agregar infraestructura?
5. ¿Hay un camino mejor que Baileys para el bot de grupo de WhatsApp, dado que
   la API oficial no soporta grupos?
6. ¿El RLS abierto al rol anónimo es aceptable para una organización estudiantil
   de este tamaño, o es un riesgo que hay que cerrar ya?
7. ¿La pizarra escala a 200 elementos con el Realtime fila por fila, o hay que
   agrupar los cambios?

---

## 10. Contexto organizacional

- La Mesa Directiva de la FECh tiene **7 equipos**: Presidencia,
  Vicepresidencia, Secretaría General, Comunicaciones, Bienestar, Participación
  y Finanzas.
- El equipo de Participación son ~6 personas, estudiantes, sin formación
  técnica.
- El programa tiene **10 ejes** y **102 propuestas**.
- El sistema empezó como un prototipo HTML de una sola pantalla y creció a lo
  largo de 31 commits hasta lo descrito acá.
- El uso real todavía no empieza: la base está creada y conectada, pero las
  propuestas aún no se reparten entre los equipos.
