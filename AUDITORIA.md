# Auditoría — lista de arreglos pendientes

Revisión del sistema completo (Conectómetro + SPT) probando los flujos reales.
Ordenado por prioridad. Cada punto dice qué pasa, por qué importa y qué haría.

## Críticos — pueden hacer perder trabajo

### 1. Los cambios de otras personas no se ven hasta recargar
La aplicación lee la base una sola vez, al abrir. Si dos personas tienen la página abierta,
cada una trabaja sobre una foto vieja y la última en guardar pisa a la otra, en silencio.
**Arreglo:** suscripción en tiempo real de Supabase (viene incluida, sin costo) más un botón
de actualizar manual.

### 2. Proyectos huérfanos al reasignar una propuesta
Si una propuesta que ya tenía pasos y designados deja de ser de Participación en el
Conectómetro, desaparece del SPT pero sus datos siguen en la base, invisibles.
**Arreglo:** mantenerla visible marcada como *reasignada a otro equipo*, con opción de archivar.

### 3. Sin control de acceso real
Cualquiera con la dirección puede editar y borrar todo. El selector de perfil
(Mesa / Coordinación / Lectura) no protege nada: es decorativo.
**Arreglo:** login por correo de Supabase, y quitar el selector mientras tanto.

### 4. Borrar no se puede deshacer y casi no pregunta
Los pasos, hitos y enlaces se borran con un clic en la ✕, sin confirmación ni vuelta atrás.
**Arreglo:** confirmación en lo que tiene contenido, o un deshacer de unos segundos.

## Importantes — el sistema se entiende a medias

### 5. Dos nombres para la misma cosa
El Conectómetro dice *etapas* y el SPT dice *pasos*: son la misma tabla.
**Arreglo:** dejar un solo nombre en los dos lados.

### 6. Dos lugares llamados "Proyecto"
El Conectómetro tiene una pestaña *Proyecto* y el SPT entero trata de proyectos.
**Arreglo:** renombrar la del Conectómetro a *Avance por etapas*, o eliminarla.

### 7. Solo Participación tiene SPT
Los otros seis equipos ven sus propuestas pero no tienen dónde planificar.
**Arreglo:** el SPT ya está escrito de forma genérica; falta un selector de secretaría.

### 8. Al borrar a una persona, su nombre queda pegado
Sigue apareciendo como designada o encargada en proyectos y pasos.
**Arreglo:** limpiar sus menciones, o avisar antes de borrar.

### 9. Un error al guardar pasa desapercibido
Si la base rechaza una escritura, solo cambia una etiqueta chica arriba.
**Arreglo:** aviso visible y reintento.

### 10. No hay por dónde empezar
Quien entra por primera vez encuentra 102 propuestas y 24 proyectos sin nada asignado.
**Arreglo:** una guía de tres pasos en el Tablero, que desaparece cuando ya hay trabajo.

## Menores — estética y pulido

11. En modo oscuro, el segmento *Sin definir* del reparto por urgencia casi no se ve.
12. Las dos secciones tienen barras superiores distintas: se sienten como dos productos.
13. No hay identidad visual propia (ícono, color de la lista).
14. El calendario no marca los días sin disponibilidad de nadie.

## Lo que está bien y conviene no tocar

- El modelo de datos: que los pasos del SPT sean las etapas del programa es lo que hace que
  todo cuadre solo.
- Los cálculos de cumplimiento y proyección, y los umbrales.
- El texto literal del programa y el PDF original adentro.
- Los avisos de horario al agendar.
- Que funcione sin conexión a la base, guardando en el navegador.
