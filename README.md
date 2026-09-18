# Cumplimiento de Propuestas · Conectemos la Chile

Prototipo web para hacer seguimiento al cumplimiento del **programa FECh 2026**
de Conectemos la Chile: asignar equipos responsables, registrar avance y ver el
porcentaje de cumplimiento contra los umbrales **70% mínimo · 80% ideal · 90% logro**.

## Cómo usarlo

Abre `index.html` en cualquier navegador (doble clic; no necesita servidor ni
instalar nada). Los datos quedan guardados en ese navegador.

## Qué incluye

- **102 propuestas** extraídas del programa, organizadas en los 10 ejes y sus sub-ejes.
- **8 equipos** responsables preasignados y editables.
- **Panel**: cumplimiento global, proyección al cierre, composición por estado,
  desglose por equipo y por eje (gráfico o tabla) y lista de propuestas que requieren atención.
- **Propuestas**: tabla editable con equipo, responsable, estado, avance y plazo.
- **Equipos**: ficha por equipo con su cumplimiento y quién coordina.
- **Datos**: exportar JSON y CSV (Excel), importar JSON, reiniciar al programa original.
- Filtros por equipo, eje, estado y búsqueda de texto; tema claro y oscuro.

## Cómo se calcula

| Indicador | Regla |
|---|---|
| Cumplimiento | Promedio del avance (0–100%) de las propuestas vigentes. Las cumplidas valen 100%; las descartadas quedan fuera. |
| Proyección al cierre | Avance actual + parte de lo que falta según el estado: en progreso 60%, no iniciada 30%, en riesgo 20%. |
| Nivel | <70% bajo el mínimo · 70% mínimo · 80% ideal · 90% logro. |

## Archivos

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura y estilos |
| `data.js` | Ejes, equipos, las 102 propuestas y los perfiles de acceso |
| `app.js` | Cálculos, gráficos (SVG sin librerías) y vistas |

## Siguiente etapa: múltiples accesos

El selector de perfil (Mesa Ejecutiva / Coordinación / Lectura) simula los roles
que tendría la aplicación real. Para accesos con usuario y contraseña, y datos
compartidos entre varias personas, hace falta un servidor con base de datos: la
estructura de `data.js` y el objeto que se exporta en JSON ya están preparados
para migrar a ese modelo sin rehacer la interfaz.
