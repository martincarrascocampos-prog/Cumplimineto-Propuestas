# Conectómetro · Cumplimiento del programa FECh 2026

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
- **Datos**: exportar JSON y CSV (Excel), importar JSON, reiniciar al programa original.

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
| `app.js` | Cálculos, gráficos (SVG sin librerías) y vistas |
| `programa/programa-conectemos-la-chile.pdf` | El PDF original del programa |
| `programa/paginas/` | Miniaturas de las 57 páginas para la galería |

## Siguiente etapa: múltiples accesos

El selector de perfil (Mesa Ejecutiva / Coordinación / Lectura) simula los roles que tendría la
aplicación real. Para accesos con usuario y contraseña, y datos compartidos entre varias
personas, hace falta un servidor con base de datos: el JSON que exporta esta versión ya tiene
la forma que necesitaría esa migración.
