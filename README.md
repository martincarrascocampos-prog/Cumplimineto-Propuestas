# Conectómetro · FECh 2026

Dos secciones que comparten una base de datos:

- **Conectómetro** (`index.html`) — cumplimiento del programa: las 102 propuestas, los 7 equipos y sus umbrales.
- **SPT · Participación** (`spt.html`) — el sistema de planificación de trabajo de la Secretaría de
  Participación: proyectos, pasos con encargados y plazos, hitos y agenda.

Un proyecto del SPT con origen *Ejes del Programa* es una propuesta del programa, y sus pasos son
las etapas de esa propuesta: marcar un paso en el SPT sube el cumplimiento en el Conectómetro.

Para publicarlo en Replit con base compartida en Supabase, ver **[PUBLICAR.md](PUBLICAR.md)**.
Para el paso a paso de todas las conexiones (GitHub, Replit, Supabase, Drive y cronogramas),
ver **[CONECTAR.md](CONECTAR.md)**. Para Google Calendar, **[GOOGLE.md](GOOGLE.md)**; para los correos automáticos,
**[CORREOS.md](CORREOS.md)**. Para saber qué hay que hacer en GitHub cuando llega un cambio,
**[GITHUB.md](GITHUB.md)**.

## El programa parte sin repartir

Ninguna de las 102 propuestas viene asignada a un equipo: el reparto lo decide
la Mesa desde el Conectómetro, en la pestaña **Propuestas**. Eso es lo que
conecta las dos aplicaciones, en los dos sentidos:

- Una propuesta que se asigne a la **Secretaría de Participación** aparece sola
  como proyecto en el SPT, en el grupo *Del programa*.
- Los **pasos** de ese proyecto en el SPT son las **etapas** de esa propuesta en
  el Conectómetro: es una sola lista vista desde los dos lados. Marcar un paso
  allá sube el porcentaje de cumplimiento acá.
- Si la propuesta se reasigna a otro equipo, el proyecto sale de la lista del
  SPT de Participación (y queda aparte si ya tenía trabajo hecho).

Los otros seis equipos registran su avance en la ficha de la propuesta, dentro
del Conectómetro; el SPT que existe hoy es sólo el de Participación.
Los arreglos pendientes están en **[AUDITORIA.md](AUDITORIA.md)**.

Para una versión de **un solo archivo** que se abre con doble clic (las dos secciones y el PDF
del programa adentro, sin carpeta ni servidor):

```
python3 construir-un-archivo.py
```

Genera `Conectometro-FECh-2026.html`. Sirve para revisar, mostrar o compartir por correo; los datos
quedan en ese navegador salvo que se conecte Supabase desde la pestaña Conexión.

## Cumplimiento del programa FECh 2026

Aplicación web para hacer seguimiento al cumplimiento del **programa "Conectemos la Chile"**:
repartir las propuestas entre los equipos de la Mesa, registrar avance por etapas, dejar
observaciones y ver el porcentaje de cumplimiento contra los umbrales
**50% a medio camino · 70% mínimo · 80% ideal · 90% logro**.

## Cómo usarlo

Abre `index.html` en cualquier navegador (doble clic; no necesita servidor ni instalar nada).
Los datos quedan guardados en ese navegador.

## Qué incluye

- **102 propuestas** del programa con su **texto literal**, en los 10 ejes y sus sub-ejes.
- **7 equipos**: Presidencia, Vicepresidencia, Secretaría General, Comunicaciones, Bienestar,
  Participación y Finanzas.
- **Panel**: cumplimiento global, proyección al cierre, composición por estado, desglose por
  equipo y por eje (gráfico o tabla), propuestas que requieren atención y una explicación de
  cómo funciona la aplicación.
- **Propuestas**: tabla con equipo, estado, avance y plazo. El título abre la ficha.
- **Ficha de propuesta**: el texto del programa, el seguimiento, las **etapas de cumplimiento**
  (cuando existen, el avance lo calculan ellas) y las **observaciones** con fecha.
- **Equipos**: ficha por equipo con su cumplimiento y quién coordina.
- **Proyecto**: la estructura de trabajo completa — equipo (o eje) → propuesta → etapas, con
  plazo por etapa, cumplimiento etapa por etapa y una estructura tipo de 5 etapas que se puede
  aplicar de una vez a muchas propuestas. Incluye un listado plano de todas las etapas.
- **Programa**: en *Lectura*, el documento completo en pantalla — contexto, introducción de cada
  eje y las propuestas con su texto tal como fue escrito. En *PDF original*, el archivo real:
  visor de las 57 páginas, galería de miniaturas y descarga.

## Cómo se calcula

| Indicador | Regla |
|---|---|
| Cumplimiento | Promedio del avance (0–100%) de las propuestas vigentes. Las cumplidas valen 100%; las descartadas quedan fuera. |
| Avance | Si la propuesta tiene etapas, es el porcentaje de etapas completadas; si no, se escribe a mano. |
| Cumplimiento por etapas | Etapas completadas sobre etapas definidas, en el conjunto filtrado. |
| Proyección al cierre | Avance actual + parte de lo que falta según el estado: en progreso 60%, no iniciada 30%, en riesgo 20%. |
| Niveles | <50% bajo el 50% · 50% a medio camino · 70% mínimo · 80% ideal · 90% logro. |

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura y estilos |
| `data.js` | Ejes, equipos, las 102 propuestas con su texto literal y los perfiles |
| `app.js` | Conectómetro: cálculos, gráficos (SVG sin librerías) y vistas |
| `core.js` | Capa de datos compartida (navegador o Supabase) y modelo común |
| `spt.html`, `spt.js`, `spt-data.js` | Sección SPT de la Secretaría de Participación |
| `estilos.css` | Estilos de las dos secciones |
| `server.js`, `.replit` | Para publicar en Replit |
| `supabase/esquema.sql` | Tablas de la base compartida |
| `programa/programa-conectemos-la-chile.pdf` | El PDF original del programa |
| `programa/paginas/` | Miniaturas de las 57 páginas para la galería |

## Siguiente etapa: múltiples accesos

El selector de perfil (Mesa Ejecutiva / Coordinación / Lectura) simula los roles que tendría la
aplicación real. Para accesos con usuario y contraseña, y datos compartidos entre varias
personas, hace falta un servidor con base de datos: el JSON que exporta esta versión ya tiene
la forma que necesitaría esa migración.
