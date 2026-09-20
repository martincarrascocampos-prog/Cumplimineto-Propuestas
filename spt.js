/* SPT · Secretaría de Participación.
 *
 * Dos orígenes de trabajo que no se mezclan:
 *   · Programa  — las propuestas que en el Conectómetro están designadas a
 *                 Participación. Su avance sube el cumplimiento del programa.
 *   · Propio    — todo lo demás que hace la secretaría. No toca el programa.
 */
(function () {
'use strict';

const { $, el, pct, hoy, recorta, fechaCorta, horaDe } = UI;

let vista = 'tablero';
let filtros = { estado: 'Activo', urgencia: '', origen: '', persona: '', texto: '' };
let abiertos = {};
let verFormulario = false;
let mes = new Date();
let diaElegido = null;
let personaHorario = null;
let capasOcultas = new Set();
let calVista = 'semana';        /* mes · semana · día · agenda */

/* ------------------------------------------------------------------ *
 * 1. Los datos del SPT
 * ------------------------------------------------------------------ */
const EQUIPO_PARTICIPACION = 'PART';

/* La designación manda: una propuesta es de Participación sólo si así quedó
   marcada en el Conectómetro. */
function equipoDe(codigo, porDefecto) {
  const s = Datos.todo('seguimiento').find(f => f.codigo === codigo);
  return (s && s.equipo) || porDefecto;
}
const propuestasParticipacion = () =>
  PROPUESTAS_BASE.filter(b => equipoDe(b[0], b[4]) === EQUIPO_PARTICIPACION);

/* Un "item" es una unidad de trabajo: puede venir del programa o ser propia.
   Los del programa existen aunque todavía nadie los haya tocado. */
function items() {
  const delPrograma = propuestasParticipacion().map(b => ({
    clave: 'P:' + b[0], codigo: b[0], nombre: b[3], texto: b[5],
    origen: 'Programa', pr: Modelo.proyectoDe(b[0])
  }));
  const propios = Datos.todo('proyectos')
    .filter(p => !p.propuesta)
    .map(p => ({ clave: p.id, codigo: null, nombre: p.nombre, texto: '', origen: 'Propio', pr: p }));

  /* Si una propuesta se reasigna a otro equipo, su proyecto no desaparece:
     queda a la vista, marcado, para poder cerrarlo o traspasarlo. */
  const deParticipacion = new Set(delPrograma.map(x => x.codigo));
  const reasignados = Datos.todo('proyectos')
    .filter(p => p.propuesta && !deParticipacion.has(p.propuesta))
    .map(p => {
      const base = PROPUESTAS_BASE.find(x => x[0] === p.propuesta);
      const equipo = Datos.todo('equipos').find(e => e.id === equipoDe(p.propuesta, base ? base[4] : ''));
      return { clave: p.id, codigo: p.propuesta, nombre: p.nombre, texto: base ? base[5] : '',
        origen: 'Reasignado', equipoAhora: equipo ? equipo.nombre : 'otro equipo', pr: p };
    })
    .filter(it => Modelo.pasosDe(it.pr.id).length || (it.pr.designados || []).length ||
      Datos.todo('hitos').some(h => h.proyecto === it.pr.id));

  return [...delPrograma, ...propios, ...reasignados];
}

/* El proyecto se crea recién cuando alguien lo trabaja. */
function asegurar(item) {
  if (!item.pr) item.pr = Modelo.crearProyectoDesde({ c: item.codigo, t: item.nombre });
  return item.pr;
}
const campo = (item, c, porDefecto) => (item.pr && item.pr[c]) || porDefecto || '';
const pasosDe = item => (item.pr ? Modelo.pasosDe(item.pr.id) : []);
const hitosDe = item => (item.pr ? Datos.todo('hitos').filter(h => h.proyecto === item.pr.id) : []);
const enlacesDe = item => (item.pr ? Datos.todo('enlaces').filter(e => e.proyecto === item.pr.id) : []);
const designados = item => (item.pr && item.pr.designados) || [];
const principal = item => designados(item)[0] || '';

function avanceDe(item) {
  const ps = pasosDe(item).filter(p => p.estado !== 'No aplica');
  if (!ps.length) return 0;
  return Math.round(ps.filter(p => p.estado === 'Completado').length / ps.length * 100);
}
const atrasadosDe = item =>
  pasosDe(item).filter(p => p.plazo && p.estado === 'Pendiente' && p.plazo < hoy()).length;

const integrantes = () => Datos.todo('integrantes');

/* Varios calendarios: la secretaría, el de un proyecto grande, el personal de
   alguien. Cada uno con su color y, si se quiere, su calendario de Google. */
const calendarios = () => Datos.todo('calendarios').slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
function asegurarCalendario() {
  if (calendarios().length) return calendarios()[0];
  return Datos.guardar('calendarios', { id: uid(), nombre: 'Secretaría de Participación',
    color: 1, gcal_id: '', orden: 0 });
}
const calendarioDe = id => calendarios().find(c => c.id === id) || null;
const colorCalendario = cal => ['#e3342f', '#2a4fd0', '#f19a3d', '#009c50',
  '#8a3fa0', '#0090a8', '#c2185b', '#6b7d00'][(((cal && cal.color) || 1) - 1) % 8];
const nombres = () => integrantes().map(i => i.nombre).filter(Boolean);

function filtrados() {
  const t = filtros.texto.trim().toLowerCase();
  return items().filter(it => {
    if (filtros.estado && campo(it, 'estado', 'Activo') !== filtros.estado) return false;
    if (filtros.urgencia && campo(it, 'urgencia') !== filtros.urgencia) return false;
    if (filtros.origen && it.origen !== filtros.origen) return false;
    if (filtros.persona) {
      const enProyecto = designados(it).includes(filtros.persona);
      const enPasos = pasosDe(it).some(p => (p.encargados || []).includes(filtros.persona));
      if (!enProyecto && !enPasos) return false;
    }
    if (t && !(it.nombre + ' ' + pasosDe(it).map(p => p.descripcion).join(' ')).toLowerCase().includes(t))
      return false;
    return true;
  }).sort((a, b) =>
    (SPT.pesoUrgencia[campo(b, 'urgencia')] || 0) - (SPT.pesoUrgencia[campo(a, 'urgencia')] || 0) ||
    atrasadosDe(b) - atrasadosDe(a) ||
    String(a.nombre).localeCompare(String(b.nombre)));
}

/* ------------------------------------------------------------------ *
 * 2. Piezas sueltas
 * ------------------------------------------------------------------ */
const COLOR_URGENCIA = {
  'Urgente (ver cuánto antes)': 'var(--critical)',
  'Prioritario': 'var(--warning)',
  'Estándar': 'var(--ramp-3)',
  'Diferible': 'var(--ink-muted)'
};
const claseUrgencia = u => u && u.startsWith('Urgente') ? 'urgente' : u === 'Prioritario' ? 'prioritario' : '';
const tag = (txt, clase) => txt ? el('span', { class: 'tag ' + (clase || ''), text: txt }) : null;

function selector(opciones, valor, alCambiar, vacio) {
  const s = el('select', {});
  if (vacio !== null) s.appendChild(el('option', { value: '', text: vacio || '—' }));
  opciones.forEach(o => s.appendChild(el('option', { value: o, text: o })));
  s.value = valor || '';
  s.addEventListener('change', () => alCambiar(s.value));
  return s;
}

function barraMini(valor, ancho) {
  const c = valor >= 90 ? 'var(--ramp-5)' : valor >= 80 ? 'var(--ramp-4)'
    : valor >= 70 ? 'var(--ramp-3)' : valor >= 50 ? 'var(--ramp-2)' : 'var(--ramp-1)';
  return el('span', { class: 'bar-mini', style: `max-width:${ancho || 150}px` },
    el('i', { style: `width:${valor}%; background:${c}` }));
}

const seccion = titulo => el('div', { class: 'sec-titulo' }, [
  el('h2', { text: titulo }), el('span', { class: 'linea' })
]);

function tablaDensa(cabeceras, filas) {
  const t = el('table', { class: 'densa' });
  t.appendChild(el('thead', {}, el('tr', {}, cabeceras.map(c => el('th', { text: c })))));
  const tb = el('tbody');
  filas.forEach(f => tb.appendChild(el('tr', {}, f.map(c =>
    c && c.nodeType ? el('td', {}, c) : el('td', { text: c === null || c === undefined ? '—' : String(c) })))));
  t.appendChild(tb);
  return el('div', { class: 'tablewrap' }, t);
}

/* ------------------------------------------------------------------ *
 * 3. Vista: Tablero  (el cuadro de mando)
 * ------------------------------------------------------------------ */
function cumplimientoDe(lista) {
  if (!lista.length) return 0;
  return Math.round(lista.reduce((a, it) => a + avanceDe(it), 0) / lista.length);
}

function vistaTablero(raiz) {
  const todos = items();
  const activos = todos.filter(it => campo(it, 'estado', 'Activo') === 'Activo');
  const lista = filtrados();
  const pasos = activos.flatMap(pasosDe);
  const pendientes = pasos.filter(p => p.estado === 'Pendiente');
  const atrasados = pendientes.filter(p => p.plazo && p.plazo < hoy());
  const delPrograma = activos.filter(it => it.origen === 'Programa');

  const kpis = el('div', { class: 'kpis densa' });
  [['Proyectos activos', String(activos.length)],
   ['Cumplimiento global', pct(cumplimientoDe(activos))],
   ['Del programa', `${delPrograma.length}`],
   ['Pasos pendientes', String(pendientes.length)],
   ['Pasos atrasados', String(atrasados.length)],
   ['Integrantes', String(nombres().length)]]
    .forEach(([t, v]) => kpis.appendChild(el('div', { class: 'kpi' }, [
      el('b', { text: v }), el('span', { text: t })])));

  raiz.appendChild(el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Cuadro de mando' }),
    el('div', { class: 'sub', text: 'Plan de trabajo de la Secretaría de Participación' }),
    kpis
  ]));

  /* Indicadores de cumplimiento, como en la planilla */
  const grupos = [
    ['Global', activos],
    ['Origen · Programa', activos.filter(it => it.origen === 'Programa')],
    ['Origen · Propio', activos.filter(it => it.origen === 'Propio')],
    ...SPT.listas.clasificacion.map(c => [`Clasificación · ${c}`, activos.filter(it => campo(it, 'clasificacion') === c)]),
    ...SPT.listas.plazo.map(p => [`Plazo · ${p.replace(' plazo', '')}`, activos.filter(it => campo(it, 'plazo_tipo') === p)])
  ].filter(([, l]) => l.length);
  const hayTrabajo = activos.some(it => pasosDe(it).length);

  if (hayTrabajo) raiz.appendChild(Graficos.tarjeta('Indicadores de cumplimiento',
    'Avance promedio de los proyectos activos, por corte',
    ancho => Graficos.barras(grupos.map(([etiqueta, l]) => ({
      etiqueta, valor: cumplimientoDe(l),
      detalle: [['Cumplimiento', pct(cumplimientoDe(l))], ['Proyectos', String(l.length)]]
    })), ancho, { max: 100, umbrales: [50, 70, 80, 90], titulo: 'Cumplimiento por corte' }),
    () => tablaDensa(['Corte', 'Cumplimiento', 'Proyectos'],
      grupos.map(([n, l]) => [n, pct(cumplimientoDe(l)), l.length]))));

  if (!hayTrabajo) raiz.appendChild(el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Así se parte' }),
    el('div', { class: 'note' }, [
      el('p', { text: 'Arriba están las propuestas que en el Conectómetro quedaron designadas a ' +
        'Participación: ya son proyectos, no hay que crearlas.' }),
      el('p', { text: 'Abre una en Proyectos, designa a quién la lleva —el primero es el encargado ' +
        'principal—, agrégale pasos con plazo y, si corresponde, hitos y la carpeta de Drive. ' +
        'Desde ahí se llenan solos el tablero, los rankings y el calendario.' })
    ])
  ]));

  /* Atención inmediata */
  const urgentes = lista.filter(it => (campo(it, 'urgencia') || '').startsWith('Urgente') || atrasadosDe(it))
    .slice(0, 10);
  const card = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Atención inmediata' }),
    el('div', { class: 'sub', text: 'Proyectos urgentes o con pasos atrasados' })
  ]);
  card.appendChild(urgentes.length
    ? tablaDensa(['Proyecto', 'Principal', 'Urgencia', 'Atrasos', 'Avance'],
        urgentes.map(it => [
          el('button', { class: 'linktitle', type: 'button', text: recorta(it.nombre, 44),
            onclick: () => { vista = 'proyectos'; abiertos[it.clave] = true; marcarTab(); render(); } }),
          principal(it) || '—',
          el('span', { class: 'tag ' + claseUrgencia(campo(it, 'urgencia')), text: campo(it, 'urgencia') || '—' }),
          atrasadosDe(it) || '—', pct(avanceDe(it))
        ]))
    : el('div', { class: 'empty', text: 'Nada urgente con el filtro actual.' }));
  raiz.appendChild(card);

  /* Próximos pasos por plazo */
  const proximos = activos.flatMap(it => pasosDe(it)
    .filter(p => p.estado === 'Pendiente' && p.plazo)
    .map(p => ({ it, p })))
    .sort((a, b) => a.p.plazo.localeCompare(b.p.plazo))
    .slice(0, 12);
  const card2 = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Próximos pasos por plazo' }),
    el('div', { class: 'sub', text: 'Sólo lo pendiente, del más próximo al más lejano' })
  ]);
  card2.appendChild(proximos.length
    ? tablaDensa(['Plazo', 'Paso', 'Proyecto', 'Encargados'],
        proximos.map(({ it, p }) => [
          el('span', { style: p.plazo < hoy() ? 'color:var(--critical)' : '', text: fechaCorta(p.plazo) }),
          recorta(p.descripcion, 40), recorta(it.nombre, 32),
          (p.encargados || []).join(', ') || '—'
        ]))
    : el('div', { class: 'empty', text: 'Ningún paso tiene plazo todavía.' }));
  raiz.appendChild(card2);

  const terminados = todos.filter(it => campo(it, 'estado') === 'Terminado');
  if (terminados.length) raiz.appendChild(el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Proyectos terminados' }),
    el('div', { class: 'sub', text: `${terminados.length} cerrados` }),
    tablaDensa(['Proyecto', 'Origen', 'Designados', 'Avance'],
      terminados.map(it => [it.nombre, it.origen, designados(it).join(', ') || '—', pct(avanceDe(it))]))
  ]));
}

/* ------------------------------------------------------------------ *
 * 4. Vista: Panel  (rankings y gráficos)
 * ------------------------------------------------------------------ */
function vistaPanel(raiz) {
  const lista = filtrados();
  const activos = lista.filter(it => campo(it, 'estado', 'Activo') === 'Activo');

  /* --- ranking de carga por persona --- */
  const carga = nombres().map(n => {
    const proyectos = activos.filter(it => designados(it).includes(n));
    const pasos = activos.flatMap(pasosDe).filter(p => (p.encargados || []).includes(n));
    const pendientes = pasos.filter(p => p.estado === 'Pendiente');
    const atrasados = pendientes.filter(p => p.plazo && p.plazo < hoy());
    const principales = activos.filter(it => principal(it) === n);
    return { nombre: n, proyectos: proyectos.length, principales: principales.length,
      pasos: pasos.length, pendientes: pendientes.length, atrasados: atrasados.length };
  }).sort((a, b) => b.pendientes - a.pendientes || b.proyectos - a.proyectos);

  const sinCarga = carga.every(c => !c.pendientes && !c.proyectos);
  if (!carga.length || sinCarga) {
    raiz.appendChild(el('div', { class: 'card compacta' }, [
      el('h2', { text: carga.length ? 'Todavía no hay trabajo repartido' : 'Sin integrantes todavía' }),
      el('div', { class: 'note', text: carga.length
        ? 'Designa personas en los proyectos y agrega pasos: el ranking de carga se arma solo.'
        : 'Agrega al equipo en la pestaña Equipo y los rankings se llenan solos.' })
    ]));
  } else {
    raiz.appendChild(Graficos.tarjeta('Ranking de actividades designadas',
      'Pasos pendientes por persona, en los proyectos activos',
      ancho => [
        Graficos.barras(carga.map(c => ({
          etiqueta: c.nombre, valor: c.pendientes, texto: String(c.pendientes),
          detalle: [['Pasos pendientes', String(c.pendientes)], ['Atrasados', String(c.atrasados)],
                    ['Proyectos designados', String(c.proyectos)], ['Como principal', String(c.principales)]]
        })), ancho, { sufijo: '', titulo: 'Carga por persona' }),
        listaRanking(carga.map((c, i) => ({
          pos: i + 1, titulo: c.nombre,
          sub: `${c.proyectos} proyectos · ${c.principales} como principal` +
               (c.atrasados ? ` · ${c.atrasados} atrasados` : ''),
          valor: c.pendientes + ' pend.'
        })))
      ],
      () => tablaDensa(['Persona', 'Pendientes', 'Atrasados', 'Proyectos', 'Principal en'],
        carga.map(c => [c.nombre, c.pendientes, c.atrasados, c.proyectos, c.principales]))));
  }

  /* --- urgencias primordiales --- */
  const puntaje = it => (SPT.pesoUrgencia[campo(it, 'urgencia')] || 0) * 10
    + atrasadosDe(it) * 6
    + (campo(it, 'plazo_final') && campo(it, 'plazo_final') < hoy() ? 8 : 0)
    - Math.round(avanceDe(it) / 20);
  const prioridad = activos.slice().sort((a, b) => puntaje(b) - puntaje(a)).slice(0, 6);

  raiz.appendChild(el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Urgencias primordiales' }),
    el('div', { class: 'sub', text: 'Orden por urgencia, atrasos y plazo vencido, descontando lo ya avanzado' }),
    prioridad.length
      ? listaRanking(prioridad.map((it, i) => ({
          pos: i + 1, titulo: it.nombre,
          sub: `${campo(it, 'urgencia') || 'sin urgencia'} · ${principal(it) || 'sin encargado principal'}` +
               (atrasadosDe(it) ? ` · ${atrasadosDe(it)} atrasados` : ''),
          valor: pct(avanceDe(it)),
          onclick: () => { vista = 'proyectos'; abiertos[it.clave] = true; marcarTab(); render(); }
        })))
      : el('div', { class: 'empty', text: 'Sin proyectos activos.' })
  ]));

  /* --- reparto por urgencia --- */
  const porUrgencia = SPT.listas.urgencia.map(u => ({
    etiqueta: u, valor: activos.filter(it => campo(it, 'urgencia') === u).length,
    color: COLOR_URGENCIA[u], tinta: u === 'Prioritario' ? '#0b0b0b' : '#fff'
  }));
  const sinUrgencia = activos.filter(it => !campo(it, 'urgencia')).length;
  if (sinUrgencia) porUrgencia.push({ etiqueta: 'Sin definir', valor: sinUrgencia,
    color: 'var(--track)', tinta: 'var(--ink)' });

  raiz.appendChild(Graficos.tarjeta('Reparto por urgencia',
    'Cuántos proyectos activos hay en cada nivel',
    ancho => [Graficos.apilada(porUrgencia, ancho),
      Graficos.leyenda(porUrgencia.filter(s => s.valor).map(s =>
        ({ etiqueta: `${s.etiqueta} (${s.valor})`, color: s.color })))],
    () => tablaDensa(['Urgencia', 'Proyectos'], porUrgencia.map(s => [s.etiqueta, s.valor]))));

  /* --- avance por proyecto: sólo los que ya tienen pasos, para no llenar la
     pantalla de barras en cero --- */
  const conTrabajo = activos.filter(it => pasosDe(it).length)
    .sort((a, b) => avanceDe(b) - avanceDe(a));
  if (conTrabajo.length) raiz.appendChild(Graficos.tarjeta('Avance por proyecto',
    `${Math.min(conTrabajo.length, 10)} de ${activos.length} proyectos, los que ya tienen pasos`,
    ancho => Graficos.barras(conTrabajo.slice(0, 10).map(it => ({
      etiqueta: it.nombre, valor: avanceDe(it),
      color: COLOR_URGENCIA[campo(it, 'urgencia')] || 'var(--ramp-3)',
      detalle: [['Avance', pct(avanceDe(it))], ['Origen', it.origen],
                ['Principal', principal(it) || '—'], ['Pasos', String(pasosDe(it).length)]]
    })), ancho, { max: 100, umbrales: [50, 70, 80, 90] }),
    () => tablaDensa(['Proyecto', 'Origen', 'Principal', 'Pasos', 'Avance'],
      conTrabajo.map(it => [it.nombre, it.origen, principal(it) || '—',
        pasosDe(it).length, pct(avanceDe(it))]))));

  /* --- pasos por estado --- */
  const pasos = activos.flatMap(pasosDe);
  if (pasos.length) {
    const segmentos = [
      { etiqueta: 'Completados', valor: pasos.filter(p => p.estado === 'Completado').length, color: 'var(--good)' },
      { etiqueta: 'Pendientes', valor: pasos.filter(p => p.estado === 'Pendiente' && !(p.plazo && p.plazo < hoy())).length,
        color: 'var(--ramp-3)' },
      { etiqueta: 'Atrasados', valor: pasos.filter(p => p.estado === 'Pendiente' && p.plazo && p.plazo < hoy()).length,
        color: 'var(--critical)' },
      { etiqueta: 'No aplica', valor: pasos.filter(p => p.estado === 'No aplica').length,
        color: 'var(--ink-muted)' }
    ];
    raiz.appendChild(Graficos.tarjeta('Pasos por estado', `${pasos.length} pasos en total`,
      ancho => [Graficos.apilada(segmentos, ancho),
        Graficos.leyenda(segmentos.filter(s => s.valor).map(s =>
          ({ etiqueta: `${s.etiqueta} (${s.valor})`, color: s.color })))],
      () => tablaDensa(['Estado', 'Pasos'], segmentos.map(s => [s.etiqueta, s.valor]))));
  }
}

function listaRanking(filas) {
  return el('div', { class: 'ranking' }, filas.map(f => {
    const qué = el('div', { class: 'qué' }, [
      f.onclick
        ? el('button', { class: 'linktitle', type: 'button', text: f.titulo, onclick: f.onclick })
        : document.createTextNode(f.titulo),
      el('small', { text: f.sub })
    ]);
    return el('div', { class: 'rank' }, [
      el('span', { class: 'pos', text: String(f.pos) }), qué,
      el('span', { class: 'val', text: f.valor })
    ]);
  }));
}

/* ------------------------------------------------------------------ *
 * 5. Vista: Proyectos
 * ------------------------------------------------------------------ */
function vistaProyectos(raiz) {
  const lista = filtrados();

  const barra = el('div', { class: 'toolbar' }, [
    el('div', {}, [
      el('h2', { text: 'Proyectos' }),
      el('div', { class: 'sub', text:
        'Los del programa son las propuestas designadas a Participación; los propios los creas tú.' })
    ]),
    el('span', { class: 'count', text: `${lista.length} de ${items().length}` }),
    el('button', { class: 'btn btn-sm' + (verFormulario ? '' : ' btn-primary'), type: 'button',
      text: verFormulario ? 'Cerrar' : '+ Proyecto propio',
      onclick: () => { verFormulario = !verFormulario; render(); } })
  ]);
  const card = el('div', { class: 'card compacta' }, barra);
  if (verFormulario) card.appendChild(formularioNuevo());
  raiz.appendChild(card);

  if (!lista.length) {
    const hayFiltro = filtros.texto || filtros.urgencia || filtros.origen ||
                      filtros.persona || filtros.estado !== 'Activo';
    raiz.appendChild(el('div', { class: 'card compacta' }, hayFiltro
      ? el('div', { class: 'empty', text: 'Ningún proyecto coincide con el filtro.' })
      : el('div', { class: 'note' }, [
          el('b', { text: 'Todavía no hay nada designado a Participación.' }),
          el('p', { text: 'Las propuestas del programa llegan solas a este SPT cuando alguien ' +
            'se las asigna a la Secretaría de Participación. Eso se hace en el Conectómetro, ' +
            'en la pestaña Propuestas: se abre la propuesta y se elige "Secretaría de ' +
            'Participación" en Equipo responsable. En cuanto queda asignada aparece acá, en ' +
            'el grupo "Del programa".' }),
          el('p', { text: 'Lo que no venga del programa se crea con el botón "+ Proyecto propio".' }),
          el('a', { class: 'btn btn-sm btn-primary',
            href: window.UNARCHIVO ? '#' : 'index.html',
            onclick: window.UNARCHIVO ? (e => { e.preventDefault(); window.irASeccion('conecto'); }) : null,
            text: 'Ir al Conectómetro →' })
        ])));
    return;
  }

  const delPrograma = lista.filter(it => it.origen === 'Programa');
  const propios = lista.filter(it => it.origen === 'Propio');
  const reasignados = lista.filter(it => it.origen === 'Reasignado');
  if (delPrograma.length) {
    raiz.appendChild(seccion(`Del programa · ${delPrograma.length}`));
    raiz.appendChild(el('div', { class: 'enlace-spt part', style: 'margin-bottom:10px' }, [
      el('b', { text: 'Estos vienen del Conectómetro.' }),
      document.createTextNode(' Son las propuestas del programa asignadas a la Secretaría de ' +
        'Participación. Los pasos que pongas acá son las etapas de esa propuesta: al marcar ' +
        'uno como completado, el cumplimiento sube en el Conectómetro. Y si el equipo ' +
        'responsable cambia allá, el proyecto sale de esta lista.')
    ]));
    delPrograma.forEach(it => raiz.appendChild(tarjetaProyecto(it)));
  }
  if (propios.length) {
    raiz.appendChild(seccion(`Trabajo propio · ${propios.length}`));
    propios.forEach(it => raiz.appendChild(tarjetaProyecto(it)));
  }
  if (reasignados.length) {
    raiz.appendChild(seccion(`Reasignados a otro equipo · ${reasignados.length}`));
    raiz.appendChild(el('div', { class: 'note', style: 'margin-bottom:10px', text:
      'Estas propuestas ya no están designadas a Participación en el programa, pero acá quedó ' +
      'trabajo hecho. Su avance sigue contando para el equipo que las tenga ahora. Ciérralas o ' +
      'elimínalas cuando corresponda.' }));
    reasignados.forEach(it => raiz.appendChild(tarjetaProyecto(it)));
  }
}

function formularioNuevo() {
  const inNombre = el('input', { type: 'text', placeholder: 'Nombre del proyecto' });
  const selClas = selector(SPT.listas.clasificacion, 'Interno', () => {}, null);
  const selPlazo = selector(SPT.listas.plazo, '', () => {});
  const selUrg = selector(SPT.listas.urgencia, 'Estándar', () => {}, null);
  const caja = el('div', {});
  caja.appendChild(el('div', { class: 'campos' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Nombre' }), inNombre]),
    el('label', { class: 'field' }, [el('span', { text: 'Clasificación' }), selClas]),
    el('label', { class: 'field' }, [el('span', { text: 'Plazo' }), selPlazo]),
    el('label', { class: 'field' }, [el('span', { text: 'Urgencia' }), selUrg])
  ]));
  caja.appendChild(el('div', { class: 'toolbar', style: 'margin:10px 0 0' }, [
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Crear', onclick: () => {
      const nombre = inNombre.value.trim();
      if (!nombre) { inNombre.focus(); return; }
      const pr = Datos.guardar('proyectos', {
        id: uid(), nombre, propuesta: null, estado: 'Activo',
        clasificacion: selClas.value, naturaleza: 'No Programático', origen: 'N/A',
        plazo_tipo: selPlazo.value, urgencia: selUrg.value, designados: [],
        plazo_final: '', creado: new Date().toISOString()
      });
      abiertos[pr.id] = true;
      verFormulario = false;
      render();
    } }),
    el('span', { class: 'count', style: 'font-size:12px',
      text: 'El trabajo propio no afecta el cumplimiento del programa.' })
  ]));
  return caja;
}

function tarjetaProyecto(it) {
  const card = el('div', { class: 'proyecto' });
  const abierto = !!abiertos[it.clave];
  const a = avanceDe(it);
  const atrasos = atrasadosDe(it);

  const marca = el('span', { style: 'font-size:12px;color:var(--ink-muted)' });
  const barra = barraMini(a, 140);
  const refrescarCabeza = () => {
    const v = avanceDe(it);
    barra.firstChild.style.width = v + '%';
    marca.textContent = `${pct(v)} · ${pasosDe(it).length} pasos` +
      (atrasadosDe(it) ? ` · ${atrasadosDe(it)} atrasados` : '');
  };

  card.appendChild(el('div', { class: 'proyecto-head' }, [
    el('button', { class: 'linktitle tit', type: 'button', text: it.nombre,
      onclick: () => { abiertos[it.clave] = !abierto; render(); } }),
    barra, marca
  ]));
  marca.textContent = `${pct(a)} · ${pasosDe(it).length} pasos` + (atrasos ? ` · ${atrasos} atrasados` : '');

  card.appendChild(el('div', { class: 'meta' }, [
    it.origen === 'Reasignado' ? tag('Ahora de ' + it.equipoAhora, 'urgente')
      : it.codigo ? tag('Programa ' + it.codigo, 'programa') : tag('Propio'),
    principal(it) ? tag('★ ' + principal(it), 'principal') : null,
    tag(campo(it, 'urgencia'), claseUrgencia(campo(it, 'urgencia'))),
    tag(campo(it, 'clasificacion')),
    tag(campo(it, 'plazo_tipo')),
    campo(it, 'estado') === 'Terminado' ? tag('Terminado') : null,
    hitosDe(it).length ? tag(`${hitosDe(it).length} hitos`) : null
  ].filter(Boolean)));

  if (!abierto) return card;

  const pr = asegurar(it);
  const guarda = (c, v) => { pr[c] = v; Datos.guardar('proyectos', pr); };

  card.appendChild(el('div', { class: 'campos' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Estado' }),
      selector(SPT.listas.estadoProyecto, pr.estado || 'Activo', v => { guarda('estado', v); render(); }, null)]),
    el('label', { class: 'field' }, [el('span', { text: 'Clasificación' }),
      selector(SPT.listas.clasificacion, pr.clasificacion, v => guarda('clasificacion', v))]),
    el('label', { class: 'field' }, [el('span', { text: 'Plazo' }),
      selector(SPT.listas.plazo, pr.plazo_tipo, v => guarda('plazo_tipo', v))]),
    el('label', { class: 'field' }, [el('span', { text: 'Urgencia' }),
      selector(SPT.listas.urgencia, pr.urgencia, v => { guarda('urgencia', v); render(); })]),
    el('label', { class: 'field' }, [el('span', { text: 'Empieza' }), (() => {
      const f = el('input', { type: 'date', value: pr.inicio || '' });
      f.addEventListener('change', () => guarda('inicio', f.value));
      return f;
    })()]),
    el('label', { class: 'field' }, [el('span', { text: 'Plazo final' }), (() => {
      const f = el('input', { type: 'date', value: pr.plazo_final || '' });
      f.addEventListener('change', () => { guarda('plazo_final', f.value); render(); });
      return f;
    })()])
  ]));

  /* --- observaciones del proyecto --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Observaciones del proyecto' }));
  const obsPr = el('textarea', { rows: 2,
    placeholder: 'Contexto, acuerdos, con quién hay que hablar, qué está trabado…' });
  obsPr.value = pr.observaciones || '';
  obsPr.addEventListener('change', () => guarda('observaciones', obsPr.value));
  card.appendChild(obsPr);

  /* --- equipo del proyecto: el primero es el principal --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Equipo · el primero es el encargado principal' }));
  const cajaGente = el('div', { class: 'meta' });
  const pintarGente = () => {
    cajaGente.innerHTML = '';
    if (!personasElegibles().length) {
      cajaGente.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-muted)',
        text: 'Agrega integrantes en la pestaña Equipo.' }));
      return;
    }
    (pr.designados || []).forEach((n, i) => {
      const quien = personaPorNombre(n);
      cajaGente.appendChild(el('span', {
        class: 'tag ' + (i === 0 ? 'principal' : '') + (quien && quien.externo ? ' externo' : ''),
        title: quien && quien.externo ? 'De ' + (quien.equipo || 'otro equipo') : '' }, [
        document.createTextNode((i === 0 ? '★ ' : '') + n),
        i > 0 ? el('button', { class: 'x', type: 'button', text: '↑', title: 'Hacer principal',
          onclick: () => {
            const d = pr.designados.slice();
            d.splice(i, 1); d.unshift(n);
            guarda('designados', d); pintarGente(); render();
          } }) : null,
        el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar',
          onclick: () => { guarda('designados', pr.designados.filter(x => x !== n)); pintarGente(); } })
      ].filter(Boolean)));
    });
    personasElegibles().filter(n => !(pr.designados || []).includes(n)).forEach(n => {
      const p = personaPorNombre(n);
      cajaGente.appendChild(el('button', {
        class: 'tag' + (p && p.externo ? ' externo' : ''), type: 'button',
        title: p && p.externo ? 'De ' + (p.equipo || 'otro equipo') : 'De Participación',
        text: '+ ' + n,
        onclick: () => { guarda('designados', [...(pr.designados || []), n]); pintarGente(); } }));
    });
  };
  pintarGente();
  card.appendChild(cajaGente);

  /* --- pasos --- */
  card.appendChild(el('div', { class: 'bloque-t' }, [
    document.createTextNode('Pasos'),
    el('span', { class: 'bloque-pista',
      text: '· "Detalle" abre fechas, encargades, observaciones y sub-pasos' })
  ]));
  /* --- pasos, con sus sub-pasos ------------------------------------- *
   * Cada paso puede abrirse para ver su detalle: fechas de inicio y
   * plazo, quién lo lleva, sus observaciones y los sub-pasos en que se
   * divide. Un paso con sub-pasos se marca solo cuando todos están.    */
  const cajaPasos = el('div', {});
  const pintarPasos = () => {
    cajaPasos.innerHTML = '';
    const pasos = Modelo.pasosDe(pr.id);
    if (!pasos.length) cajaPasos.appendChild(el('div', { class: 'mini', text: 'Sin pasos.' }));
    pasos.forEach((paso, i) => cajaPasos.appendChild(
      filaPaso(paso, String(i + 1), pr, () => { pintarPasos(); refrescarCabeza(); })));

    const nuevo = el('input', { type: 'text', placeholder: 'Nuevo paso…', style: 'max-width:300px' });
    const agregar = () => {
      if (!nuevo.value.trim()) return;
      Modelo.agregarPaso(pr.id, nuevo.value.trim());
      nuevo.value = ''; pintarPasos(); refrescarCabeza();
    };
    nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    cajaPasos.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:8px' }, [
      nuevo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
    ]));
  };
  pintarPasos();
  card.appendChild(cajaPasos);

  /* --- hitos: se agendan --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Hitos · quedan en el calendario' }));
  const cajaHitos = el('div', {});
  const pintarHitos = () => {
    cajaHitos.innerHTML = '';
    const hitos = Datos.todo('hitos').filter(h => h.proyecto === pr.id);
    if (!hitos.length) cajaHitos.appendChild(el('div', { style: 'font-size:13px;color:var(--ink-muted)',
      text: 'Sin hitos.' }));
    hitos.forEach(h => {
      const f = el('input', { type: 'datetime-local', value: h.fecha || '', style: 'max-width:200px' });
      f.addEventListener('change', () => { h.fecha = f.value; Datos.guardar('hitos', h); });
      const d = el('input', { type: 'text', value: h.detalle, style: 'flex:1' });
      d.addEventListener('change', () => { h.detalle = d.value; Datos.guardar('hitos', h); });
      cajaHitos.appendChild(el('div', { style: 'display:flex; gap:8px; align-items:center; padding:3px 0' }, [
        d, f,
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Agendar', title: 'Crear una reunión con este hito',
          onclick: () => {
            Datos.guardar('agenda', { id: uid(), tema: h.detalle, inicio: h.fecha || '', duracion: 60,
              formato: 'Presencial', lugar: '', invitados: (pr.designados || []).join(', '),
              estado: 'Por agendar', proyecto: pr.id, calendario: asegurarCalendario().id });
            vista = 'calendario'; marcarTab(); render();
          } }),
        el('button', { class: 'x', type: 'button', text: '✕',
          onclick: () => UI.borrarConDeshacer('hitos', { ...h }, 'Hito', pintarHitos) })
      ]));
    });
    const nuevo = el('input', { type: 'text', placeholder: 'Nuevo hito…', style: 'max-width:300px' });
    const agregar = () => {
      if (!nuevo.value.trim()) return;
      Datos.guardar('hitos', { id: uid(), proyecto: pr.id, detalle: nuevo.value.trim(), fecha: '' });
      nuevo.value = ''; pintarHitos();
    };
    nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    cajaHitos.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:8px' }, [
      nuevo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar hito', onclick: agregar })
    ]));
  };
  pintarHitos();
  card.appendChild(cajaHitos);

  /* --- enlaces del proyecto (Drive, cronogramas, documentos) --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Carpetas y documentos' }));
  const cajaEnlaces = el('div', {});
  const pintarEnlaces = () => {
    cajaEnlaces.innerHTML = '';
    const propios = Datos.todo('enlaces').filter(e => e.proyecto === pr.id);
    propios.forEach(g => {
      const n = el('input', { type: 'text', value: g.nombre, style: 'max-width:180px' });
      n.addEventListener('change', () => { g.nombre = n.value; Datos.guardar('enlaces', g); });
      const u = el('input', { type: 'url', value: g.url || '', placeholder: 'https://drive.google.com/…' });
      u.addEventListener('change', () => { g.url = u.value; Datos.guardar('enlaces', g); pintarEnlaces(); });
      cajaEnlaces.appendChild(el('div', { style: 'display:flex; gap:8px; align-items:center; padding:3px 0' }, [
        n, u,
        g.url ? el('a', { class: 'btn btn-sm', href: g.url, target: '_blank', rel: 'noopener', text: 'Abrir' }) : null,
        el('button', { class: 'x', type: 'button', text: '✕',
          onclick: () => UI.borrarConDeshacer('enlaces', { ...g }, 'Enlace', pintarEnlaces) })
      ].filter(Boolean)));
    });
    const opciones = ['Carpeta de Drive', 'Cronograma', 'Documento de trabajo', 'Acta'];
    const botonera = el('div', { style: 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap' },
      opciones.map(o => el('button', { class: 'btn btn-sm', type: 'button', text: '+ ' + o,
        onclick: () => {
          Datos.guardar('enlaces', { id: uid(), proyecto: pr.id, nombre: o, url: '' });
          pintarEnlaces();
        } })));

    /* Si Drive está conectado, la carpeta del proyecto se crea desde acá:
       queda dentro de la carpeta madre y con el enlace ya guardado. */
    const carpeta = propios.find(g => Drive.idDe(g.url));
    if (!carpeta) {
      const crear = el('button', { class: 'btn btn-sm', type: 'button',
        text: '+ Crear carpeta en Drive', hidden: true });
      crear.addEventListener('click', async () => {
        crear.disabled = true; crear.textContent = 'Creando…';
        try {
          const c = await Drive.crearCarpeta(pr.nombre);
          Datos.guardar('enlaces', { id: uid(), proyecto: pr.id,
            nombre: 'Carpeta de Drive', url: c.url });
          UI.aviso('Carpeta creada en Drive');
          pintarEnlaces();
        } catch (e) {
          UI.aviso(e.message);
          crear.disabled = false; crear.textContent = '+ Crear carpeta en Drive';
        }
      });
      Drive.preguntar().then(es => { if (es.configurado) crear.hidden = false; });
      botonera.appendChild(crear);
    }
    cajaEnlaces.appendChild(botonera);

    /* El contenido de la carpeta, tal como está en Drive ahora mismo. */
    if (carpeta) cajaEnlaces.appendChild(cajaDrive(carpeta.url));
  };
  pintarEnlaces();
  card.appendChild(cajaEnlaces);

  /* --- pie --- */
  const pie = el('div', { class: 'toolbar', style: 'margin:14px 0 0' });
  if (it.codigo) pie.appendChild(el('a', { class: 'btn btn-sm',
    href: window.UNARCHIVO ? '#' : `index.html#${it.codigo}`,
    onclick: window.UNARCHIVO ? (e => { e.preventDefault(); window.irASeccion('conecto'); }) : null,
    text: `Ver ${it.codigo} en el Conectómetro` }));
  pie.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'Agendar reunión',
    onclick: () => {
      Datos.guardar('agenda', { id: uid(), tema: 'Reunión — ' + pr.nombre, inicio: '', duracion: 60,
        formato: 'Presencial', lugar: '', invitados: (pr.designados || []).join(', '),
        estado: 'Por agendar', proyecto: pr.id, calendario: asegurarCalendario().id });
      vista = 'calendario'; marcarTab(); render();
    } }));
  if (!it.codigo || it.origen === 'Reasignado') pie.appendChild(el('button', { class: 'btn btn-sm',
    type: 'button', text: it.origen === 'Reasignado' ? 'Eliminar de este SPT' : 'Eliminar',
    onclick: () => {
      if (!confirm(`¿Eliminar "${pr.nombre}" y todo lo que cuelga de él?`)) return;
      Modelo.pasosDe(pr.id).forEach(p => Datos.borrar('pasos', p.id));
      Datos.todo('hitos').filter(h => h.proyecto === pr.id).forEach(h => Datos.borrar('hitos', h.id));
      Datos.todo('enlaces').filter(e => e.proyecto === pr.id).forEach(e => Datos.borrar('enlaces', e.id));
      Datos.borrar('proyectos', pr.id);
      render();
    } }));
  card.appendChild(pie);

  if (it.texto) card.appendChild(el('div', { class: 'literal', style: 'margin-top:10px' },
    el('p', { text: recorta(it.texto, 320) })));
  return card;
}

/* ------------------------------------------------------------------ *
 * 6. Disponibilidad del equipo
 *
 * Cada persona declara en qué tramos puede. Con eso, al agendar avisamos si
 * alguien queda fuera de su horario o si ya tiene otra cosa a esa hora.
 * ------------------------------------------------------------------ */
const DIAS = [
  { n: 1, corto: 'Lun', largo: 'lunes' }, { n: 2, corto: 'Mar', largo: 'martes' },
  { n: 3, corto: 'Mié', largo: 'miércoles' }, { n: 4, corto: 'Jue', largo: 'jueves' },
  { n: 5, corto: 'Vie', largo: 'viernes' }, { n: 6, corto: 'Sáb', largo: 'sábado' },
  { n: 7, corto: 'Dom', largo: 'domingo' }
];

/* 1 = lunes … 7 = domingo */
const diaSemana = fechaISO => (((new Date(fechaISO.slice(0, 10) + 'T12:00').getDay()) + 6) % 7) + 1;
const tramosDe = (persona, dia) => ((persona && persona.disponibilidad) || {})[dia] || [];
/* ------------------------------------------------------------------ *
 * Google Drive en vivo
 *
 * El servidor es el que habla con Drive; acá sólo se pregunta. Si no está
 * conectado —o si el archivo se abrió con doble clic, sin servidor— todo
 * sigue funcionando con los enlaces pegados a mano.
 * ------------------------------------------------------------------ */
const Drive = {
  estado: null,            /* null = todavía no se preguntó */
  cache: new Map(),        /* carpeta → { cuando, archivos } */
  VIDA: 30000,             /* medio minuto: "en vivo" sin machacar a Google */

  idDe(texto) {
    const t = String(texto || '').trim();
    const m = t.match(/\/folders\/([\w-]+)/) || t.match(/[?&]id=([\w-]+)/);
    if (m) return m[1];
    return /^[\w-]{10,}$/.test(t) ? t : '';
  },

  async preguntar() {
    if (this.estado) return this.estado;
    try {
      const r = await fetch('/api/drive/estado');
      if (!r.ok) throw new Error('sin servidor');
      this.estado = await r.json();
    } catch {
      this.estado = { configurado: false, sinServidor: true,
        motivo: 'Esta copia se abrió sin servidor, así que no puede hablar con Drive.' };
    }
    return this.estado;
  },

  async listar(carpeta, refrescar) {
    const id = this.idDe(carpeta);
    if (!id) throw new Error('Ese enlace no parece una carpeta de Drive.');
    const guardado = this.cache.get(id);
    if (!refrescar && guardado && Date.now() - guardado.cuando < this.VIDA) return guardado.archivos;
    const r = await fetch('/api/drive/listar?carpeta=' + encodeURIComponent(id));
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Drive no respondió.');
    this.cache.set(id, { cuando: Date.now(), archivos: j.archivos || [] });
    return j.archivos || [];
  },

  async crearCarpeta(nombre) {
    const r = await fetch('/api/drive/carpeta', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo crear la carpeta.');
    return j;
  }
};

const personaPorNombre = n => integrantes().find(i => i.nombre === n) || null;
const nombresDe = txt => String(txt || '').split(',').map(x => x.trim()).filter(Boolean);

function sumarMinutos(hora, minutos) {
  const [h, m] = String(hora || '00:00').split(':').map(Number);
  const total = h * 60 + m + (Number(minutos) || 0);
  const hh = Math.floor((total % 1440 + 1440) % 1440 / 60);
  const mm = ((total % 1440) + 1440) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/* Resumen corto: "L-V 09:00–18:00" o "3 días con horario" */
function resumenHorario(persona) {
  const d = (persona && persona.disponibilidad) || {};
  const conTramos = DIAS.filter(x => (d[x.n] || []).length);
  if (!conTramos.length) return 'sin definir';
  const firma = JSON.stringify(d[conTramos[0].n]);
  const todosIguales = conTramos.every(x => JSON.stringify(d[x.n]) === firma);
  if (todosIguales) {
    const tramos = d[conTramos[0].n].map(t => `${t[0]}–${t[1]}`).join(', ');
    const dias = conTramos.length === 5 && conTramos.every(x => x.n <= 5)
      ? 'L a V' : conTramos.map(x => x.corto).join(' ');
    return `${dias} ${tramos}`;
  }
  return `${conTramos.length} días con horario`;
}

/* Avisos de una reunión: horarios fuera de rango y choques con otra cosa. */
function avisosReunion(ev) {
  const avisos = [];
  if (!ev.inicio || ev.inicio.length <= 10) return avisos;
  const fecha = ev.inicio.slice(0, 10);
  const hIni = ev.inicio.slice(11, 16);
  const hFin = sumarMinutos(hIni, ev.duracion || 60);
  const dia = diaSemana(fecha);
  const invitados = nombresDe(ev.invitados);

  invitados.forEach(nombre => {
    const persona = personaPorNombre(nombre);
    if (!persona) return;
    const tramos = tramosDe(persona, dia);
    const nombreDia = (DIAS.find(d => d.n === dia) || {}).largo || '';
    if (!tramos.length) {
      avisos.push(`${nombre} no tiene horario disponible los ${nombreDia}`);
    } else if (!tramos.some(t => hIni >= t[0] && hFin <= t[1])) {
      avisos.push(`${nombre} solo puede los ${nombreDia} de ${tramos.map(t => `${t[0]} a ${t[1]}`).join(' y ')}`);
    }
  });

  /* Choques con otras reuniones que compartan gente */
  Datos.todo('agenda').forEach(otra => {
    if (otra.id === ev.id || !otra.inicio || otra.inicio.slice(0, 10) !== fecha) return;
    const oIni = otra.inicio.slice(11, 16);
    const oFin = sumarMinutos(oIni, otra.duracion || 60);
    if (!(hIni < oFin && oIni < hFin)) return;
    const compartidos = nombresDe(otra.invitados).filter(n => invitados.includes(n));
    if (compartidos.length) {
      avisos.push(`${compartidos.join(', ')} ${compartidos.length > 1 ? 'tienen' : 'tiene'} ` +
        `"${otra.tema}" a esa misma hora`);
    } else if (!invitados.length) {
      avisos.push(`Se cruza con "${otra.tema}"`);
    }
  });
  return avisos;
}

function cajaAvisos(avisos) {
  if (!avisos.length) return null;
  return el('div', { class: 'avisos' }, [
    el('b', { text: '⚠ ' + (avisos.length === 1 ? 'Un problema de horario' : `${avisos.length} problemas de horario`) }),
    el('ul', {}, avisos.map(a => el('li', { text: a })))
  ]);
}

/* Una fila de paso: arriba lo mínimo —marca, descripción, plazo, estado y
   quién lo lleva— y, al abrirla, el detalle completo con sus sub-pasos.
   La misma función sirve para los sub-pasos, que se dibujan corridos. */
function filaPaso(paso, numero, pr, alCambiar, esSub) {
  const hijos = Modelo.subDe(paso.id);
  const listo = Modelo.pasoListo(paso);
  const caja = el('div', { class: 'paso-caja' + (esSub ? ' sub' : '') });

  const chk = el('input', { type: 'checkbox', 'aria-label': 'Paso completado' });
  chk.checked = listo;
  chk.disabled = hijos.length > 0;
  chk.title = hijos.length ? 'Se marca solo cuando estén todos sus sub-pasos' : '';
  chk.addEventListener('change', () => {
    paso.estado = chk.checked ? 'Completado' : 'Pendiente';
    Datos.guardar('pasos', paso);
    alCambiar();
  });

  const desc = el('input', { type: 'text', value: paso.descripcion || '' });
  desc.addEventListener('change', () => { paso.descripcion = desc.value; Datos.guardar('pasos', paso); });

  const fecha = el('input', { type: 'date', class: 'oculta-movil', value: paso.plazo || '',
    title: 'Plazo del paso' });
  if (paso.plazo && !listo && paso.plazo < hoy()) fecha.classList.add('vencido');
  fecha.addEventListener('change', () => { paso.plazo = fecha.value; Datos.guardar('pasos', paso); alCambiar(); });

  const est = selector(SPT.listas.estadoPaso, paso.estado || 'Pendiente', v => {
    paso.estado = v; Datos.guardar('pasos', paso); alCambiar();
  }, null);
  est.classList.add('oculta-movil');

  /* Señales de que adentro hay más: sub-pasos y observaciones. */
  const señas = el('span', { class: 'senas' });
  if (hijos.length) señas.appendChild(el('i', { class: 'sena',
    title: `${hijos.filter(h => h.estado === 'Completado').length} de ${hijos.length} sub-pasos`,
    text: `${hijos.filter(h => h.estado === 'Completado').length}/${hijos.length}` }));
  if (paso.observaciones) señas.appendChild(el('i', { class: 'sena obs',
    title: 'Tiene observaciones', text: '✎' }));
  if (paso.principal) señas.appendChild(el('i', { class: 'sena ppal',
    title: 'A cargo: ' + paso.principal, text: '★ ' + paso.principal.split(' ')[0] }));

  const detalle = el('div', { class: 'paso-detalle', hidden: true });
  let abierto = false;
  const abrir = el('button', { class: 'btn btn-sm paso-mas', type: 'button',
    'aria-expanded': 'false',
    title: 'Fechas, encargades, observaciones y sub-pasos' },
    [el('i', { class: 'acc-flecha', 'aria-hidden': 'true' }),
     el('span', { text: 'Detalle' })]);
  abrir.addEventListener('click', () => {
    abierto = !abierto;
    abrir.setAttribute('aria-expanded', String(abierto));
    detalle.hidden = !abierto;
    if (abierto) pintarDetalle();
  });

  const pintarDetalle = () => {
    detalle.innerHTML = '';
    const campo = (etiqueta, nodo) => el('label', { class: 'field' },
      [el('span', { text: etiqueta }), nodo]);

    const inicio = el('input', { type: 'date', value: paso.inicio || '' });
    inicio.addEventListener('change', () => { paso.inicio = inicio.value; Datos.guardar('pasos', paso); });
    const plazo = el('input', { type: 'date', value: paso.plazo || '' });
    plazo.addEventListener('change', () => {
      paso.plazo = plazo.value; Datos.guardar('pasos', paso); pintarResumen();
    });

    /* Encargade principal del paso: puede no ser quien lleva el proyecto. */
    const ppal = selector(personasElegibles(), paso.principal || '', v => {
      paso.principal = v;
      if (v && !(paso.encargados || []).includes(v)) {
        paso.encargados = [v, ...(paso.encargados || [])].slice(0, 3);
      }
      Datos.guardar('pasos', paso); pintarResumen();
    }, 'Sin encargade principal');

    detalle.appendChild(el('div', { class: 'campos' }, [
      campo('Empieza', inicio), campo('Plazo', plazo),
      campo('A cargo (principal)', ppal)
    ]));

    /* Acompañan: el resto del equipo, con externos incluidos. */
    const acomp = el('div', { class: 'meta' });
    const pintarAcomp = () => {
      acomp.innerHTML = '';
      const todos = personasElegibles();
      if (!todos.length) {
        acomp.appendChild(el('span', { class: 'mini',
          text: 'Carga al equipo en la pestaña Equipo.' }));
        return;
      }
      todos.forEach(n => {
        const dentro = (paso.encargados || []).includes(n);
        const p = personaPorNombre(n);
        acomp.appendChild(el('button', {
          class: 'tag' + (dentro ? ' principal' : '') + (p && p.externo ? ' externo' : ''),
          type: 'button',
          title: p && p.externo ? 'De ' + (p.equipo || 'otro equipo') : 'De Participación',
          text: (dentro ? '✓ ' : '+ ') + n,
          onclick: () => {
            const ya = paso.encargados || [];
            paso.encargados = dentro ? ya.filter(x => x !== n) : [...ya, n];
            if (dentro && paso.principal === n) paso.principal = '';
            Datos.guardar('pasos', paso); pintarAcomp(); pintarResumen();
          } }));
      });
    };
    pintarAcomp();
    detalle.appendChild(el('div', {}, [
      el('span', { class: 'etiqueta', text: 'Quiénes lo hacen' }), acomp]));

    const obs = el('textarea', { placeholder: 'Qué pasó, con quién se habló, qué quedó pendiente…',
      rows: 2 });
    obs.value = paso.observaciones || '';
    obs.addEventListener('change', () => {
      paso.observaciones = obs.value; Datos.guardar('pasos', paso); pintarResumen();
    });
    detalle.appendChild(el('label', { class: 'field' },
      [el('span', { text: 'Observaciones del paso' }), obs]));

    /* Sub-pasos: el mismo componente, un nivel más adentro. */
    if (!esSub) {
      const lista = el('div', { class: 'subpasos' });
      const repintar = () => { pintarDetalle(); alCambiar(); };
      Modelo.subDe(paso.id).forEach((h, j) => lista.appendChild(
        filaPaso(h, numero + '.' + (j + 1), pr, repintar, true)));
      const nuevo = el('input', { type: 'text', placeholder: 'Dividir en un sub-paso…' });
      const agregar = () => {
        if (!nuevo.value.trim()) return;
        Modelo.agregarPaso(pr.id, nuevo.value.trim(), { padre: paso.id });
        nuevo.value = ''; repintar();
      };
      nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
      detalle.appendChild(el('div', {}, [
        el('span', { class: 'etiqueta', text: `Sub-pasos (${Modelo.subDe(paso.id).length})` }),
        lista,
        el('div', { style: 'display:flex; gap:8px; margin-top:6px' }, [
          nuevo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
        ])
      ]));
    }
  };

  /* Un renglón que muestra lo que ya está cargado, sin tener que abrir.
     Se refresca solo: si repintáramos la lista entera, el detalle abierto
     se cerraría en cada tecla. */
  const cajaResumen = el('div', { class: 'paso-resumen' });
  const pintarResumen = () => {
    const r = [];
    if (paso.inicio) r.push('empieza ' + fechaCorta(paso.inicio));
    if (paso.plazo) r.push('termina ' + fechaCorta(paso.plazo));
    if (paso.principal) r.push('★ ' + paso.principal);
    const otros = (paso.encargados || []).filter(n => n !== paso.principal);
    if (otros.length) r.push('con ' + otros.join(', '));
    const subs = Modelo.subDe(paso.id);
    if (subs.length) r.push(`${subs.filter(h => h.estado === 'Completado').length} de ${subs.length} sub-pasos`);
    if (paso.observaciones) r.push('✎ ' + recorta(paso.observaciones, 60));
    cajaResumen.innerHTML = '';
    r.forEach(t => cajaResumen.appendChild(el('span', { text: t })));
    cajaResumen.hidden = !r.length || esSub;
    /* La fecha de la fila de arriba sigue a la del detalle. */
    fecha.value = paso.plazo || '';
    fecha.classList.toggle('vencido',
      Boolean(paso.plazo) && !Modelo.pasoListo(paso) && paso.plazo < hoy());
  };

  caja.appendChild(el('div', { class: 'paso' + (listo ? ' listo' : '') }, [
    el('span', { class: 'n', text: numero }), chk, desc, señas, fecha, est, abrir,
    el('button', { class: 'x', type: 'button', text: '✕', title: 'Eliminar paso',
      onclick: () => {
        Modelo.subDe(paso.id).forEach(h => Datos.borrar('pasos', h.id));
        UI.borrarConDeshacer('pasos', { ...paso }, 'Paso', alCambiar);
      } })
  ]));
  caja.appendChild(cajaResumen);
  pintarResumen();
  caja.appendChild(detalle);
  return caja;
}

/* Todo el que puede tomar un paso: la secretaría y la gente de fuera que se
   haya cargado con su equipo. */
function personasElegibles() {
  return integrantes().map(i => i.nombre).filter(Boolean);
}

/* Lo que hay dentro de una carpeta de Drive, pedido al servidor cada vez
   que se abre el proyecto. Si Drive no está conectado no estorba: se queda
   callada y el enlace de siempre sigue ahí. */
function cajaDrive(url) {
  const caja = el('div', { class: 'drive', hidden: true });
  const lista = el('div', { class: 'drive-lista' });
  const titulo = el('div', { class: 'drive-cab' }, [
    el('b', { text: 'En la carpeta' }),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Actualizar',
      onclick: () => cargar(true) }),
    el('a', { class: 'btn btn-sm', href: url, target: '_blank', rel: 'noopener',
      text: 'Abrir en Drive' })
  ]);

  const cargar = async refrescar => {
    lista.innerHTML = '';
    lista.appendChild(el('div', { class: 'mini', text: 'Leyendo Drive…' }));
    try {
      const archivos = await Drive.listar(url, refrescar);
      lista.innerHTML = '';
      if (!archivos.length) {
        lista.appendChild(el('div', { class: 'mini', text: 'La carpeta está vacía.' }));
        return;
      }
      archivos.forEach(a => lista.appendChild(el('a', {
        class: 'drive-fila', href: a.url, target: '_blank', rel: 'noopener',
        title: a.quien ? 'Último cambio: ' + a.quien : ''
      }, [
        UI.icono(a.esCarpeta ? 'proyecto' : 'documentos', 16),
        el('span', { class: 'd-nombre', text: a.nombre }),
        el('span', { class: 'd-tipo', text: a.tipo }),
        el('span', { class: 'd-fecha', text: fechaCorta(a.modificado) })
      ])));
    } catch (e) {
      lista.innerHTML = '';
      lista.appendChild(el('div', { class: 'mini', text: e.message }));
    }
  };

  Drive.preguntar().then(es => {
    if (!es.configurado) return;      /* sin Drive conectado, ni aparece */
    caja.hidden = false;
    cargar(false);
  });
  caja.appendChild(titulo);
  caja.appendChild(lista);
  return caja;
}

/* ------------------------------------------------------------------ *
 * 7. Calendario
 *
 * Al modo de Google Calendar: cuatro vistas (mes, semana, día y agenda),
 * un riel a la izquierda con el mini-mes y la lista de calendarios que se
 * prenden y apagan, y creación de eventos haciendo clic en la franja de
 * hora que corresponde. Cada calendario puede apuntar a uno de Google.
 *
 * Tres cosas caen en el calendario y sólo una se edita:
 *   · reuniones  — filas de la tabla agenda, con hora y duración
 *   · hitos      — fechas comprometidas de un proyecto (día completo)
 *   · plazos     — vencimiento de un paso (día completo)
 * ------------------------------------------------------------------ */

const HORA_DESDE = 7;          /* primera franja visible */
const HORA_HASTA = 23;         /* última franja visible */
const ALTO_HORA = 46;          /* píxeles por hora en semana y día */

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-` +
                 `${String(d.getDate()).padStart(2, '0')}`;
const sumarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const lunesDe = d => sumarDias(d, -((d.getDay() + 6) % 7));
const desdeIso = s => new Date(s.length <= 10 ? s + 'T12:00' : s);
const minutosDe = s => {
  if (!s || s.length <= 10) return null;
  const [h, m] = s.slice(11, 16).split(':').map(Number);
  return h * 60 + (m || 0);
};
const mesLargo = d => {
  const n = d.toLocaleDateString('es-CL', { month: 'long' });
  return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + d.getFullYear();
};

/* Todo lo que cae en un rango de fechas, ya filtrado por capas y por persona. */
function eventosEntre(desde, hasta) {
  const dentro = f => f && f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
  const mios = n => !filtros.persona || (n || []).includes(filtros.persona);
  const lista = [];

  Datos.todo('agenda').forEach(ev => {
    if (!dentro(ev.inicio)) return;
    if (capasOcultas.has(ev.calendario || 'sin-calendario')) return;
    const invitados = nombresDe(ev.invitados);
    if (!mios(invitados)) return;
    const cal = calendarioDe(ev.calendario);
    lista.push({ tipo: 'reunion', fecha: ev.inicio.slice(0, 10), hora: horaDe(ev.inicio),
      minuto: minutosDe(ev.inicio), duracion: Number(ev.duracion) || 60,
      titulo: ev.tema || 'Reunión', gente: invitados, ref: ev,
      color: colorCalendario(cal), calendario: cal ? cal.nombre : 'Sin calendario' });
  });

  items().forEach(it => {
    if (!capasOcultas.has('hitos')) hitosDe(it).forEach(h => {
      if (!dentro(h.fecha)) return;
      if (!mios(designados(it))) return;
      lista.push({ tipo: 'hito', fecha: h.fecha.slice(0, 10), minuto: null,
        titulo: h.detalle || 'Hito', contexto: it.nombre, gente: designados(it),
        color: 'var(--warning)' });
    });
    if (!capasOcultas.has('plazos')) pasosDe(it).forEach(p => {
      if (!dentro(p.plazo)) return;
      if (!mios(p.encargados || [])) return;
      const vencido = p.estado === 'Pendiente' && p.plazo < hoy();
      lista.push({ tipo: vencido ? 'vencido' : 'paso', fecha: p.plazo.slice(0, 10), minuto: null,
        titulo: p.descripcion || 'Paso', contexto: it.nombre, gente: p.encargados || [],
        hecho: p.estado === 'Completado',
        color: vencido ? 'var(--critical)' : 'var(--ramp-3)' });
    });
  });

  return lista.sort((a, b) =>
    (a.fecha + String(a.minuto ?? -1).padStart(4, '0')).localeCompare(
     b.fecha + String(b.minuto ?? -1).padStart(4, '0')));
}

/* Reparte en columnas los eventos que se pisan, como hace Google. */
function repartirColumnas(evs) {
  const conHora = evs.filter(e => e.minuto !== null)
    .sort((a, b) => a.minuto - b.minuto || b.duracion - a.duracion);
  let grupo = [], finGrupo = -1;
  const cerrar = () => {
    const cols = [];
    grupo.forEach(e => {
      let c = cols.findIndex(col => col[col.length - 1].minuto + col[col.length - 1].duracion <= e.minuto);
      if (c === -1) { cols.push([e]); c = cols.length - 1; } else cols[c].push(e);
      e._col = c;
    });
    grupo.forEach(e => { e._cols = cols.length; });
    grupo = [];
  };
  conHora.forEach(e => {
    if (grupo.length && e.minuto >= finGrupo) { cerrar(); finGrupo = -1; }
    grupo.push(e);
    finGrupo = Math.max(finGrupo, e.minuto + e.duracion);
  });
  if (grupo.length) cerrar();
  return conHora;
}

/* ---------------------------- el riel ----------------------------- */
function rielCalendario(anclaMes, recargar) {
  const riel = el('aside', { class: 'riel' });

  riel.appendChild(el('button', { class: 'btn btn-primary btn-crear', type: 'button',
    text: '+ Crear evento',
    onclick: () => abrirEditorEvento(null, diaElegido || hoy(), '18:00', recargar) }));

  /* Mini-mes: mover el mes grande sin salir de la vista. */
  const mini = el('div', { class: 'card mini-caja' });
  const cab = el('div', { class: 'mini-cab' }, [
    el('b', { text: mesLargo(anclaMes) }),
    el('span', {}, [
      el('button', { class: 'ico', type: 'button', text: '‹', 'aria-label': 'Mes anterior',
        onclick: () => { mes = new Date(anclaMes.getFullYear(), anclaMes.getMonth() - 1, 1); render(); } }),
      el('button', { class: 'ico', type: 'button', text: '›', 'aria-label': 'Mes siguiente',
        onclick: () => { mes = new Date(anclaMes.getFullYear(), anclaMes.getMonth() + 1, 1); render(); } })
    ])
  ]);
  const rej = el('div', { class: 'mini-rejilla' });
  ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(d => rej.appendChild(el('span', { class: 'mini-dow', text: d })));
  const primero = new Date(anclaMes.getFullYear(), anclaMes.getMonth(), 1);
  const arranque = lunesDe(primero);
  const conAlgo = new Set(eventosEntre(iso(arranque), iso(sumarDias(arranque, 41))).map(e => e.fecha));
  for (let i = 0; i < 42; i++) {
    const d = sumarDias(arranque, i);
    const clave = iso(d);
    rej.appendChild(el('button', {
      class: 'mini-dia' + (d.getMonth() === anclaMes.getMonth() ? '' : ' fuera') +
             (clave === hoy() ? ' hoy' : '') + (clave === diaElegido ? ' elegido' : '') +
             (conAlgo.has(clave) ? ' con' : ''),
      type: 'button', text: String(d.getDate()),
      onclick: () => { diaElegido = clave; mes = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
    }));
  }
  mini.appendChild(cab); mini.appendChild(rej);
  riel.appendChild(mini);

  /* Mis calendarios: se prenden y apagan, y se editan acá mismo. */
  asegurarCalendario();
  const caja = el('div', { class: 'card' }, el('h3', { text: 'Mis calendarios' }));
  const alternar = clave => {
    capasOcultas.has(clave) ? capasOcultas.delete(clave) : capasOcultas.add(clave);
    render();
  };
  calendarios().forEach(c => {
    const fila = el('div', { class: 'cal-fila' }, [
      el('button', {
        class: 'cal-marca' + (capasOcultas.has(c.id) ? ' apagada' : ''), type: 'button',
        style: `--c:${colorCalendario(c)}`, 'aria-pressed': String(!capasOcultas.has(c.id)),
        title: capasOcultas.has(c.id) ? 'Mostrar este calendario' : 'Ocultar este calendario',
        onclick: () => alternar(c.id) }),
      el('span', { class: 'cal-nombre', text: c.nombre,
        title: c.gcal_id ? 'Sincroniza con Google: ' + c.gcal_id : 'Sin calendario de Google asociado' }),
      c.gcal_id ? el('span', { class: 'cal-g', title: 'Conectado con Google Calendar', text: 'G' }) : null,
      el('button', { class: 'ico', type: 'button', text: '⋯', 'aria-label': 'Opciones del calendario',
        onclick: () => abrirEditorCalendario(c, recargar) })
    ].filter(Boolean));
    caja.appendChild(fila);
  });
  caja.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: '+ Nuevo calendario',
    style: 'margin-top:8px', onclick: () => abrirEditorCalendario(null, recargar) }));
  riel.appendChild(caja);

  /* Las dos capas que no son calendarios sino cosas del trabajo. */
  const otras = el('div', { class: 'card' }, el('h3', { text: 'Del trabajo' }));
  [['hitos', 'Hitos comprometidos', 'var(--warning)'],
   ['plazos', 'Plazos de pasos', 'var(--ramp-3)']].forEach(([clave, texto, color]) => {
    otras.appendChild(el('div', { class: 'cal-fila' }, [
      el('button', { class: 'cal-marca' + (capasOcultas.has(clave) ? ' apagada' : ''),
        type: 'button', style: `--c:${color}`, 'aria-pressed': String(!capasOcultas.has(clave)),
        onclick: () => alternar(clave) }),
      el('span', { class: 'cal-nombre', text: texto })
    ]));
  });
  riel.appendChild(otras);
  return riel;
}

/* --------------------- editores en un globo ----------------------- */
function globo(titulo, cuerpo, pie) {
  const fondo = el('div', { class: 'globo-fondo' });
  const caja = el('div', { class: 'globo', role: 'dialog', 'aria-modal': 'true',
    'aria-label': titulo });
  const cerrar = () => { fondo.remove(); caja.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', esc);
  fondo.addEventListener('click', cerrar);
  caja.appendChild(el('div', { class: 'globo-cab' }, [
    el('b', { text: titulo }),
    el('button', { class: 'ico', type: 'button', text: '✕', 'aria-label': 'Cerrar', onclick: cerrar })
  ]));
  caja.appendChild(el('div', { class: 'globo-cuerpo' }, cuerpo));
  if (pie) caja.appendChild(el('div', { class: 'globo-pie' }, pie));
  document.body.appendChild(fondo); document.body.appendChild(caja);
  const primero = caja.querySelector('input,select,textarea,button');
  if (primero) primero.focus();
  return cerrar;
}

/* Crear o editar una reunión. Es el mismo formulario en los dos casos. */
function abrirEditorEvento(ev, fecha, hora, recargar) {
  asegurarCalendario();
  const nuevo = !ev;
  const base = ev || { id: uid(), tema: '', inicio: `${fecha}T${hora}`, duracion: 60,
    formato: 'Presencial', lugar: '', invitados: filtros.persona || '',
    estado: 'Por agendar', proyecto: null, calendario: calendarios()[0].id };

  const inTema = el('input', { type: 'text', value: base.tema || '',
    placeholder: 'Título del evento' });
  const inFecha = el('input', { type: 'date', value: (base.inicio || '').slice(0, 10) });
  const inHora = el('input', { type: 'time', value: (base.inicio || '').slice(11, 16) || '18:00' });
  const inMin = el('input', { type: 'number', value: base.duracion || 60, min: 15, step: 15 });
  const inLugar = el('input', { type: 'text', value: base.lugar || '',
    placeholder: 'Sala, campus o enlace de la videollamada' });
  const inCal = el('select', {});
  calendarios().forEach(c => inCal.appendChild(el('option', { value: c.id, text: c.nombre })));
  inCal.value = base.calendario || calendarios()[0].id;
  const inFormato = el('select', {});
  SPT.listas.formato.forEach(f => inFormato.appendChild(el('option', { value: f, text: f })));
  inFormato.value = base.formato || 'Presencial';

  let elegidos = nombresDe(base.invitados);
  const cajaGente = el('div', { class: 'meta' });
  const cajaAviso = el('div', {});
  const guardar = el('button', { class: 'btn btn-primary', type: 'button',
    text: nuevo ? 'Guardar evento' : 'Guardar cambios' });

  const leer = () => ({ id: base.id, tema: inTema.value.trim(),
    inicio: `${inFecha.value}T${inHora.value || '18:00'}`,
    duracion: Number(inMin.value) || 60, formato: inFormato.value,
    lugar: inLugar.value.trim(), invitados: elegidos.join(', '),
    estado: base.estado || 'Por agendar', proyecto: base.proyecto || null,
    calendario: inCal.value });

  const revisar = () => {
    const avisos = avisosReunion(leer());
    cajaAviso.innerHTML = '';
    const c = cajaAvisos(avisos);
    if (c) cajaAviso.appendChild(c);
    guardar.textContent = avisos.length
      ? (nuevo ? 'Guardar de todos modos' : 'Guardar igual')
      : (nuevo ? 'Guardar evento' : 'Guardar cambios');
  };
  const pintarGente = () => {
    cajaGente.innerHTML = '';
    if (!nombres().length) {
      cajaGente.appendChild(el('span', { class: 'mini',
        text: 'Carga al equipo en la pestaña Equipo para avisar de los choques de horario.' }));
      return;
    }
    nombres().forEach(n => {
      const dentro = elegidos.includes(n);
      cajaGente.appendChild(el('button', {
        class: 'tag' + (dentro ? ' principal' : ''), type: 'button',
        title: 'Disponible: ' + resumenHorario(personaPorNombre(n)),
        text: (dentro ? '✓ ' : '+ ') + n,
        onclick: () => {
          elegidos = dentro ? elegidos.filter(x => x !== n) : [...elegidos, n];
          pintarGente(); revisar();
        } }));
    });
  };
  pintarGente();
  [inFecha, inHora, inMin].forEach(i => i.addEventListener('input', revisar));
  revisar();

  const campo = (etiqueta, nodo) => el('label', { class: 'field' },
    [el('span', { text: etiqueta }), nodo]);

  const cuerpo = [
    campo('Título', inTema),
    el('div', { class: 'campos' }, [
      campo('Día', inFecha), campo('Hora', inHora), campo('Minutos', inMin)
    ]),
    el('div', { class: 'campos' }, [campo('Calendario', inCal), campo('Formato', inFormato)]),
    campo('Lugar o enlace', inLugar),
    el('div', {}, [el('span', { class: 'etiqueta', text: 'Invitados' }), cajaGente]),
    cajaAviso
  ];

  const pie = [guardar];
  if (!nuevo) {
    pie.push(el('a', { class: 'btn', href: enlaceGoogle(base), target: '_blank', rel: 'noopener',
      text: 'Abrir en Google' }));
    pie.push(el('button', { class: 'x', type: 'button', text: '✕ eliminar',
      onclick: () => { cerrar(); UI.borrarConDeshacer('agenda', { ...base }, 'Evento', recargar); } }));
  }

  const cerrar = globo(nuevo ? 'Nuevo evento' : 'Editar evento', cuerpo, pie);
  guardar.addEventListener('click', () => {
    if (!inTema.value.trim()) { inTema.focus(); return; }
    Datos.guardar('agenda', leer());
    cerrar(); recargar();
  });
}

/* Crear, renombrar, colorear y conectar un calendario con Google. */
function abrirEditorCalendario(cal, recargar) {
  const nuevo = !cal;
  const base = cal || { id: uid(), nombre: '', color: (calendarios().length % 8) + 1,
    gcal_id: '', orden: calendarios().length };

  const inNombre = el('input', { type: 'text', value: base.nombre || '',
    placeholder: 'Por ejemplo: Secretaría de Participación' });
  const inColor = el('div', { class: 'colores' });
  let color = base.color || 1;
  const NOMBRES_COLOR = ['Rojo', 'Azul', 'Naranjo', 'Verde', 'Violeta', 'Cian', 'Rosa', 'Oliva'];
  const pintarColores = () => {
    inColor.innerHTML = '';
    NOMBRES_COLOR.forEach((n, i) => inColor.appendChild(el('button', {
      class: 'muestra' + (color === i + 1 ? ' elegida' : ''), type: 'button',
      style: `--c:${colorCalendario({ color: i + 1 })}`, title: n, 'aria-label': n,
      onclick: () => { color = i + 1; pintarColores(); } })));
  };
  pintarColores();
  const inGcal = el('input', { type: 'text', value: base.gcal_id || '',
    placeholder: 'correo@u.uchile.cl o ...@group.calendar.google.com' });

  const guardar = el('button', { class: 'btn btn-primary', type: 'button', text: 'Guardar' });
  const pie = [guardar];
  if (!nuevo && calendarios().length > 1) {
    pie.push(el('button', { class: 'x', type: 'button', text: '✕ eliminar',
      onclick: () => { cerrar(); UI.borrarConDeshacer('calendarios', { ...base }, 'Calendario', recargar); } }));
  }

  const cuerpo = [
    el('label', { class: 'field' }, [el('span', { text: 'Nombre' }), inNombre]),
    el('div', {}, [el('span', { class: 'etiqueta', text: 'Color' }), inColor]),
    el('label', { class: 'field' }, [el('span', { text: 'ID del calendario en Google' }), inGcal]),
    el('div', { class: 'note', text:
      'El ID sale en Google Calendar → Configuración del calendario → "Integrar calendario". ' +
      'Sirve para que la sincronización automática deje cada evento en el calendario que ' +
      'corresponde. Si se deja vacío, el calendario vive sólo acá.' })
  ];

  const cerrar = globo(nuevo ? 'Nuevo calendario' : 'Calendario', cuerpo, pie);
  guardar.addEventListener('click', () => {
    if (!inNombre.value.trim()) { inNombre.focus(); return; }
    Datos.guardar('calendarios', { ...base, nombre: inNombre.value.trim(),
      color, gcal_id: inGcal.value.trim() });
    cerrar(); recargar();
  });
}

/* Ver una cosa del calendario. Las reuniones se editan; los hitos y los
   plazos se miran, porque su dueño es el proyecto. */
function abrirDetalle(e, recargar) {
  if (e.tipo === 'reunion') { abrirEditorEvento(e.ref, e.fecha, '18:00', recargar); return; }
  globo(e.tipo === 'hito' ? 'Hito' : 'Plazo de un paso', [
    el('h3', { text: e.titulo, style: 'margin:0 0 6px; font-size:15px' }),
    el('div', { class: 'mini', text: fechaCorta(e.fecha) + (e.contexto ? ' · ' + e.contexto : '') }),
    e.gente && e.gente.length
      ? el('div', { class: 'mini', style: 'margin-top:6px', text: 'A cargo: ' + e.gente.join(', ') })
      : null,
    el('div', { class: 'note', style: 'margin-top:10px', text: e.tipo === 'hito'
      ? 'Los hitos se editan en el proyecto, dentro de la pestaña Proyectos.'
      : 'Los plazos son la fecha de un paso: se cambian en el paso, dentro del proyecto.' })
  ].filter(Boolean), [
    el('button', { class: 'btn', type: 'button', text: 'Ir al proyecto',
      onclick: () => { vista = 'proyectos'; filtros.texto = e.contexto || ''; render(); } })
  ]);
}

/* ----------------------- las cuatro vistas ------------------------ */
function vistaCalendario(raiz) {
  const recargar = () => render();
  if (!diaElegido) diaElegido = hoy();
  const ancla = desdeIso(diaElegido);

  /* Rango que se muestra, según la vista elegida. */
  let desde, hasta, titulo;
  if (calVista === 'dia') {
    desde = hasta = diaElegido;
    titulo = ancla.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  } else if (calVista === 'semana') {
    const l = lunesDe(ancla);
    desde = iso(l); hasta = iso(sumarDias(l, 6));
    titulo = `${l.getDate()} – ${sumarDias(l, 6).getDate()} de ${mesLargo(l).toLowerCase()}`;
  } else if (calVista === 'agenda') {
    desde = hoy(); hasta = iso(sumarDias(new Date(), 60));
    titulo = 'Próximos 60 días';
  } else {
    const p = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const arranque = lunesDe(p);
    desde = iso(arranque); hasta = iso(sumarDias(arranque, 41));
    titulo = mesLargo(p);
  }

  const eventos = eventosEntre(desde, hasta);

  /* Barra de arriba: navegar, volver a hoy y cambiar de vista. */
  const mover = paso => {
    if (calVista === 'mes') { mes = new Date(mes.getFullYear(), mes.getMonth() + paso, 1); }
    else if (calVista === 'semana') { diaElegido = iso(sumarDias(ancla, paso * 7)); mes = desdeIso(diaElegido); }
    else if (calVista === 'dia') { diaElegido = iso(sumarDias(ancla, paso)); mes = desdeIso(diaElegido); }
    render();
  };
  const seg = el('div', { class: 'seg' }, [['mes', 'Mes'], ['semana', 'Semana'],
    ['dia', 'Día'], ['agenda', 'Agenda']].map(([id, txt]) =>
    el('button', { type: 'button', text: txt, 'aria-pressed': String(calVista === id),
      onclick: () => { calVista = id; render(); } })));

  const barra = el('div', { class: 'gcal-cab' }, [
    el('div', { class: 'gcal-nav' }, [
      el('button', { class: 'btn btn-sm', type: 'button', text: 'Hoy',
        onclick: () => { diaElegido = hoy(); mes = new Date(); render(); } }),
      calVista === 'agenda' ? null : el('button', { class: 'ico', type: 'button', text: '‹',
        'aria-label': 'Anterior', onclick: () => mover(-1) }),
      calVista === 'agenda' ? null : el('button', { class: 'ico', type: 'button', text: '›',
        'aria-label': 'Siguiente', onclick: () => mover(1) }),
      el('b', { class: 'gcal-titulo', text: titulo })
    ].filter(Boolean)),
    el('div', { class: 'gcal-acciones' }, [
      el('span', { class: 'mini', text: filtros.persona
        ? `Sólo lo de ${filtros.persona}` : `${eventos.length} en pantalla` }),
      seg,
      /* En pantalla angosta el riel queda debajo, así que el botón de crear
         tiene que estar también acá arriba. */
      el('button', { class: 'btn btn-sm solo-angosto', type: 'button', text: '+ Crear',
        onclick: () => abrirEditorEvento(null, diaElegido || hoy(), '18:00', recargar) })
    ])
  ]);

  const lienzo = el('div', { class: 'card con-barra gcal' }, barra);
  if (calVista === 'mes') lienzo.appendChild(rejillaMes(eventos, recargar));
  else if (calVista === 'agenda') lienzo.appendChild(listaAgenda(eventos, recargar));
  else lienzo.appendChild(rejillaHoras(desde, hasta, eventos, recargar));

  raiz.appendChild(el('div', { class: 'columnas' },
    [rielCalendario(mes, recargar), el('div', {}, [lienzo, notaGoogle()])]));
}

function rejillaMes(eventos, recargar) {
  const porDia = eventos.reduce((a, e) => ((a[e.fecha] = a[e.fecha] || []).push(e), a), {});
  const grilla = el('div', { class: 'cal' });
  ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].forEach(d =>
    grilla.appendChild(el('div', { class: 'dow', text: d })));
  const arranque = lunesDe(new Date(mes.getFullYear(), mes.getMonth(), 1));
  for (let i = 0; i < 42; i++) {
    const d = sumarDias(arranque, i);
    const clave = iso(d);
    const evs = porDia[clave] || [];
    const celda = el('div', {
      class: 'dia' + (d.getMonth() === mes.getMonth() ? '' : ' fuera') +
             (i % 7 >= 5 ? ' finde' : '') + (clave === hoy() ? ' hoy' : '') +
             (clave === diaElegido ? ' elegido' : '')
    });
    celda.appendChild(el('button', { class: 'n', type: 'button', text: String(d.getDate()),
      title: 'Ver este día', onclick: () => { diaElegido = clave; calVista = 'dia'; render(); } }));
    evs.slice(0, 3).forEach(e => celda.appendChild(botonEvento(e, recargar, 'chip')));
    if (evs.length > 3) celda.appendChild(el('button', { class: 'mas', type: 'button',
      text: `+${evs.length - 3} más`,
      onclick: () => { diaElegido = clave; calVista = 'dia'; render(); } }));
    celda.appendChild(el('button', { class: 'hueco', type: 'button',
      'aria-label': 'Crear un evento el ' + clave,
      onclick: () => abrirEditorEvento(null, clave, '18:00', recargar) }));
    grilla.appendChild(celda);
  }
  return grilla;
}

function botonEvento(e, recargar, forma) {
  const punto = el('i', { style: `background:${e.color}` });
  const b = el('button', {
    class: 'ev ' + e.tipo + (forma ? ' ' + forma : '') + (e.hecho ? ' hecho' : ''),
    type: 'button',
    title: `${e.hora ? e.hora + ' · ' : ''}${e.titulo}` +
           (e.contexto ? `\n${e.contexto}` : '') +
           (e.gente && e.gente.length ? `\n${e.gente.join(', ')}` : ''),
    onclick: ev => { ev.stopPropagation(); abrirDetalle(e, recargar); }
  }, [punto, el('span', { text: (e.hora ? e.hora + ' ' : '') + e.titulo })]);
  return b;
}

/* Semana y día comparten rejilla: cambia cuántas columnas tiene. */
function rejillaHoras(desde, hasta, eventos, recargar) {
  const dias = [];
  for (let d = desdeIso(desde); iso(d) <= hasta; d = sumarDias(d, 1)) dias.push(iso(d));

  const caja = el('div', { class: 'horas-caja' });

  /* Encabezado con el día de la semana y el número. */
  const cab = el('div', { class: 'horas-cab', style: `--dias:${dias.length}` },
    [el('span', { class: 'gutter' })]);
  dias.forEach(clave => {
    const d = desdeIso(clave);
    cab.appendChild(el('button', {
      class: 'cab-dia' + (clave === hoy() ? ' hoy' : ''), type: 'button',
      onclick: () => { diaElegido = clave; calVista = 'dia'; render(); }
    }, [
      el('span', { class: 'dow', text: d.toLocaleDateString('es-CL', { weekday: 'short' }) }),
      el('b', { text: String(d.getDate()) })
    ]));
  });
  caja.appendChild(cab);

  /* Fila de día completo: hitos y plazos, que no tienen hora. */
  const sinHora = eventos.filter(e => e.minuto === null);
  if (sinHora.length) {
    const fila = el('div', { class: 'todo-dia', style: `--dias:${dias.length}` },
      [el('span', { class: 'gutter', text: 'todo el día' })]);
    dias.forEach(clave => {
      const celda = el('div', { class: 'td-celda' });
      sinHora.filter(e => e.fecha === clave).forEach(e => celda.appendChild(botonEvento(e, recargar, 'chip')));
      fila.appendChild(celda);
    });
    caja.appendChild(fila);
  }

  /* La rejilla con las horas. */
  const cuerpo = el('div', { class: 'horas-cuerpo', style: `--dias:${dias.length}` });
  const gutter = el('div', { class: 'gutter-horas' });
  for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
    gutter.appendChild(el('span', { class: 'h', style: `height:${ALTO_HORA}px`,
      text: String(h).padStart(2, '0') + ':00' }));
  }
  cuerpo.appendChild(gutter);

  dias.forEach(clave => {
    const col = el('div', { class: 'col-dia' + (clave === hoy() ? ' hoy' : '') });
    for (let h = HORA_DESDE; h <= HORA_HASTA; h++) {
      col.appendChild(el('button', { class: 'franja', type: 'button',
        style: `height:${ALTO_HORA}px`,
        'aria-label': `Crear un evento el ${clave} a las ${h}:00`,
        onclick: () => abrirEditorEvento(null, clave, String(h).padStart(2, '0') + ':00', recargar) }));
    }
    /* Los eventos van encima, ubicados por su hora. */
    const delDia = repartirColumnas(eventos.filter(e => e.fecha === clave));
    delDia.forEach(e => {
      const top = (e.minuto - HORA_DESDE * 60) / 60 * ALTO_HORA;
      const alto = Math.max(20, e.duracion / 60 * ALTO_HORA - 2);
      const ancho = 100 / (e._cols || 1);
      col.appendChild(el('button', {
        class: 'ev-t', type: 'button',
        style: `top:${Math.max(0, top)}px; height:${alto}px; ` +
               `left:${(e._col || 0) * ancho}%; width:calc(${ancho}% - 3px); ` +
               `--c:${e.color}`,
        title: `${e.hora} · ${e.titulo}` + (e.gente.length ? `\n${e.gente.join(', ')}` : ''),
        onclick: () => abrirDetalle(e, recargar)
      }, [
        el('b', { text: e.titulo }),
        el('span', { text: e.hora + (e.calendario ? ' · ' + e.calendario : '') })
      ]));
    });
    /* La línea de la hora actual, como en Google. */
    if (clave === hoy()) {
      const ahora = new Date();
      const m = ahora.getHours() * 60 + ahora.getMinutes();
      if (m >= HORA_DESDE * 60 && m <= (HORA_HASTA + 1) * 60) {
        col.appendChild(el('div', { class: 'ahora',
          style: `top:${(m - HORA_DESDE * 60) / 60 * ALTO_HORA}px` }));
      }
    }
    cuerpo.appendChild(col);
  });
  caja.appendChild(cuerpo);
  return caja;
}

function listaAgenda(eventos, recargar) {
  const caja = el('div', { class: 'agenda' });
  if (!eventos.length) {
    caja.appendChild(el('div', { class: 'empty',
      text: 'Nada agendado en los próximos 60 días.' }));
    return caja;
  }
  let dia = null;
  eventos.forEach(e => {
    if (e.fecha !== dia) {
      dia = e.fecha;
      const d = desdeIso(dia);
      caja.appendChild(el('div', { class: 'agenda-dia' + (dia === hoy() ? ' hoy' : '') }, [
        el('b', { text: String(d.getDate()) }),
        el('span', { text: d.toLocaleDateString('es-CL', { weekday: 'long', month: 'short' }) })
      ]));
    }
    caja.appendChild(el('button', { class: 'agenda-fila', type: 'button',
      onclick: () => abrirDetalle(e, recargar) }, [
      el('i', { style: `background:${e.color}` }),
      el('span', { class: 'ag-hora', text: e.hora || 'todo el día' }),
      el('span', { class: 'ag-tit', text: e.titulo }),
      el('span', { class: 'ag-pie', text: [e.contexto, (e.gente || []).join(', ')]
        .filter(Boolean).join(' · ') })
    ]));
  });
  return caja;
}

function notaGoogle() {
  const conG = calendarios().filter(c => c.gcal_id).length;
  return el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Google Calendar' }),
    el('div', { class: 'sub', text: conG
      ? `${conG} de ${calendarios().length} calendarios tienen su ID de Google cargado.`
      : 'Ningún calendario tiene todavía su ID de Google.' }),
    el('div', { class: 'note' }, [
      el('p', { text: 'Cada evento tiene el botón "Abrir en Google": lleva a Google Calendar con ' +
        'el evento ya escrito —título, hora, lugar e invitados— y sólo hay que guardar. ' +
        'Funciona con cualquier cuenta, incluida la de la universidad, sin configurar nada.' }),
      el('p', { text: 'Para que los invitados lleguen por correo, cada persona necesita su ' +
        'correo cargado en la pestaña Equipo.' }),
      el('p', { text: 'La sincronización automática en los dos sentidos necesita la cuenta de ' +
        'servicio conectada en el servidor y el ID de Google en cada calendario (el botón ⋯ ' +
        'de la lista de la izquierda). El paso a paso está en GOOGLE.md.' })
    ]),
    el('div', { class: 'toolbar' }, [
      el('a', { class: 'btn btn-sm', href: 'https://calendar.google.com', target: '_blank',
        rel: 'noopener', text: 'Abrir Google Calendar' }),
      el('button', { class: 'btn btn-sm', type: 'button', text: 'Descargar todo en .ics',
        title: 'Un archivo con todas las reuniones, para importar en Google, Outlook o Apple',
        onclick: () => descargar('calendario-spt-participacion.ics', icsTodo(),
          'text/calendar;charset=utf-8') })
    ])
  ]);
}

/* Enlace que abre Google Calendar con el evento ya escrito. Funciona con
   cualquier cuenta y sin configurar nada: es el camino corto mientras la
   sincronización automática no esté conectada. */
function enlaceGoogle(ev) {
  const pad = n => String(n).padStart(2, '0');
  const sello = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T` +
    `${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const inicio = new Date(!ev.inicio ? Date.now()
    : (ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio));
  const fin = new Date(inicio.getTime() + (Number(ev.duracion) || 60) * 60000);

  const correos = nombresDe(ev.invitados).map(nombre => {
    const persona = integrantes().find(i => i.nombre === nombre);
    return persona && persona.correo ? persona.correo : (nombre.includes('@') ? nombre : '');
  }).filter(Boolean);

  const cal = calendarioDe(ev.calendario);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.tema || 'Reunión',
    dates: `${sello(inicio)}/${sello(fin)}`,
    details: 'Creado desde el SPT · Secretaría de Participación' +
      (cal ? `\nCalendario: ${cal.nombre}` : '') +
      (ev.invitados ? `\nInvitados: ${ev.invitados}` : ''),
    location: ev.lugar || ''
  });
  if (cal && cal.gcal_id) params.set('src', cal.gcal_id);
  correos.forEach(c => params.append('add', c));
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

/* Todas las reuniones en un solo archivo, para importarlas de una vez. */
function icsTodo() {
  const cuerpo = Datos.todo('agenda').map(ev => ics(ev)
    .replace(/^BEGIN:VCALENDAR[\s\S]*?BEGIN:VEVENT/, 'BEGIN:VEVENT')
    .replace(/END:VCALENDAR$/, '').trim());
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FECh//SPT//ES',
    'X-WR-CALNAME:SPT · Secretaría de Participación',
    ...cuerpo, 'END:VCALENDAR'].join('\r\n');
}

function ics(ev) {
  const f = s => (s || '').replace(/[-:]/g, '').replace(/\.\d+/, '');
  const inicio = ev.inicio ? f(ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio) + '00' : '';
  const fin = (() => {
    if (!ev.inicio) return '';
    const d = new Date(ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio);
    d.setMinutes(d.getMinutes() + (Number(ev.duracion) || 60));
    return f(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` +
      `T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`) + '00';
  })();
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FECh//SPT//ES', 'BEGIN:VEVENT',
    'UID:' + ev.id, 'DTSTART:' + inicio, 'DTEND:' + fin,
    'SUMMARY:' + (ev.tema || 'Reunión'), 'LOCATION:' + (ev.lugar || ''),
    'DESCRIPTION:Invitados: ' + (ev.invitados || '—'), 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el('a', { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


/* ------------------------------------------------------------------ *
 * Reuniones: la tabla de planificación
 *
 * Una fila por reunión —fecha, hora, tema, asistentes, videollamada— y,
 * al abrirla, su tabla de puntos: qué se trata, quién lo trae y en qué
 * quedó. Esos puntos son los que después la pizarra convierte en nodos.
 * ------------------------------------------------------------------ */

const Videollamada = {
  estado: null,
  async preguntar() {
    if (this.estado) return this.estado;
    try {
      const r = await fetch('/api/reuniones/estado');
      if (!r.ok) throw new Error('sin servidor');
      this.estado = await r.json();
    } catch {
      this.estado = { configurado: false, sinServidor: true };
    }
    return this.estado;
  },
  async crear(ev, puntos, calendario) {
    const r = await fetch('/api/reuniones/videollamada', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: ev.id, tema: ev.tema, inicio: ev.inicio,
        duracion: ev.duracion, lugar: ev.lugar, invitados: ev.invitados,
        puntos, calendario })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo crear la videollamada.');
    return j;
  }
};

const puntosDe = reunionId => Datos.todo('puntos')
  .filter(p => p.reunion === reunionId)
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));

function tablaReuniones(raiz) {
  const card = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Planificación de reuniones' }),
    el('div', { class: 'sub', text: 'Fecha, hora, temas y asistentes. Abre una para su tabla de puntos.' })
  ]);

  const reuniones = Datos.todo('agenda').slice()
    .sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')));

  const tabla = el('table', { class: 'tabla-reuniones' });
  tabla.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: '' }), el('th', { text: 'Fecha' }), el('th', { text: 'Hora' }),
    el('th', { text: 'Tema' }), el('th', { text: 'Asistentes' }),
    el('th', { text: 'Puntos' }), el('th', { text: 'Videollamada' }), el('th', { text: '' })
  ])));
  const tb = el('tbody');

  if (!reuniones.length) {
    tb.appendChild(el('tr', {}, el('td', { colspan: 8 },
      el('div', { class: 'empty', text: 'Todavía no hay reuniones agendadas.' }))));
  }

  reuniones.forEach(ev => {
    const abierta = !!abiertos['r:' + ev.id];
    const guarda = (campo, valor) => { ev[campo] = valor; Datos.guardar('agenda', ev); };

    const fecha = el('input', { type: 'date', value: (ev.inicio || '').slice(0, 10) });
    fecha.addEventListener('change', () => {
      guarda('inicio', fecha.value + 'T' + ((ev.inicio || '').slice(11, 16) || '18:00'));
      render();
    });
    const hora = el('input', { type: 'time', value: (ev.inicio || '').slice(11, 16) || '18:00' });
    hora.addEventListener('change', () => {
      guarda('inicio', ((ev.inicio || '').slice(0, 10) || hoy()) + 'T' + hora.value);
      render();
    });
    const tema = el('input', { type: 'text', value: ev.tema || '', placeholder: 'Tema de la reunión' });
    tema.addEventListener('change', () => guarda('tema', tema.value));
    const gente = el('input', { type: 'text', value: ev.invitados || '',
      placeholder: 'Nombres separados por coma' });
    gente.addEventListener('change', () => guarda('invitados', gente.value));

    const nPuntos = puntosDe(ev.id).length;
    const abrir = el('button', { class: 'ico', type: 'button', text: abierta ? '▾' : '▸',
      'aria-label': 'Ver los puntos', onclick: () => {
        abiertos['r:' + ev.id] = !abierta; render();
      } });

    tb.appendChild(el('tr', { class: abierta ? 'abierta' : '' }, [
      el('td', {}, abrir),
      el('td', {}, fecha), el('td', {}, hora), el('td', {}, tema), el('td', {}, gente),
      el('td', { class: 'num' }, el('button', { class: 'btn btn-sm', type: 'button',
        text: String(nPuntos), title: 'Puntos a tratar',
        onclick: () => { abiertos['r:' + ev.id] = !abierta; render(); } })),
      el('td', {}, celdaVideollamada(ev)),
      el('td', {}, el('button', { class: 'x', type: 'button', text: '✕',
        onclick: () => {
          puntosDe(ev.id).forEach(p => Datos.borrar('puntos', p.id));
          UI.borrarConDeshacer('agenda', { ...ev }, 'Reunión', render);
        } }))
    ]));

    if (abierta) {
      tb.appendChild(el('tr', { class: 'fila-puntos' },
        el('td', { colspan: 8 }, tablaPuntos(ev))));
    }
  });
  tabla.appendChild(tb);
  card.appendChild(el('div', { class: 'tablewrap' }, tabla));

  /* Agendar una nueva desde acá mismo. */
  const nTema = el('input', { type: 'text', placeholder: 'Tema de la reunión', style: 'max-width:260px' });
  const nFecha = el('input', { type: 'date', value: hoy(), style: 'max-width:160px' });
  const nHora = el('input', { type: 'time', value: '18:00', style: 'max-width:120px' });
  const agendar = () => {
    if (!nTema.value.trim()) { nTema.focus(); return; }
    asegurarCalendario();
    Datos.guardar('agenda', { id: uid(), tema: nTema.value.trim(),
      inicio: nFecha.value + 'T' + (nHora.value || '18:00'), duracion: 60,
      formato: 'Presencial', lugar: '', invitados: filtros.persona || '',
      estado: 'Por agendar', proyecto: null, calendario: asegurarCalendario().id,
      videollamada: '' });
    nTema.value = ''; render();
  };
  nTema.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agendar(); } });
  card.appendChild(el('div', { class: 'toolbar' }, [
    nTema, nFecha, nHora,
    el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Agendar', onclick: agendar })
  ]));
  raiz.appendChild(card);
}

/* La celda de la videollamada: el enlace si ya está, y si no, las dos
   maneras de conseguirlo. */
function celdaVideollamada(ev) {
  const caja = el('div', { class: 'vc' });

  if (ev.videollamada) {
    caja.appendChild(el('a', { class: 'vc-enlace', href: ev.videollamada, target: '_blank',
      rel: 'noopener', title: ev.videollamada,
      text: /zoom\./i.test(ev.videollamada) ? 'Zoom' : 'Meet' }));
    caja.appendChild(el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar el enlace',
      onclick: () => { ev.videollamada = ''; Datos.guardar('agenda', ev); render(); } }));
    return caja;
  }

  const crear = el('button', { class: 'btn btn-sm', type: 'button', text: 'Crear Meet',
    hidden: true, title: 'Crea el evento en Google con su enlace de Meet' });
  crear.addEventListener('click', async () => {
    crear.disabled = true; crear.textContent = 'Creando…';
    try {
      const cal = calendarioDe(ev.calendario);
      const r = await Videollamada.crear(ev, puntosDe(ev.id).map(p => p.texto),
        cal && cal.gcal_id ? cal.gcal_id : '');
      ev.videollamada = r.enlace;
      ev.gcal_id = r.evento;
      Datos.guardar('agenda', ev);
      UI.aviso('Meet creado');
      render();
    } catch (e) {
      UI.aviso(e.message);
      crear.disabled = false; crear.textContent = 'Crear Meet';
    }
  });
  Videollamada.preguntar().then(es => {
    const cal = calendarioDe(ev.calendario);
    if (es.configurado || (cal && cal.gcal_id && !es.sinServidor)) crear.hidden = false;
  });
  caja.appendChild(crear);

  /* Camino corto, siempre disponible: Google con la reunión ya escrita. */
  caja.appendChild(el('a', { class: 'btn btn-sm', href: enlaceGoogle(ev), target: '_blank',
    rel: 'noopener', text: 'En Google', title: 'Abre Google Calendar con la reunión escrita; ' +
      'ahí se añade el Meet con un clic' }));

  const pegar = el('button', { class: 'btn btn-sm', type: 'button', text: 'Pegar enlace',
    title: 'Para Zoom, o un Meet creado a mano' });
  pegar.addEventListener('click', () => {
    const url = prompt('Pega el enlace de la videollamada (Zoom o Meet):', '');
    if (url === null) return;
    ev.videollamada = url.trim(); Datos.guardar('agenda', ev); render();
  });
  caja.appendChild(pegar);
  return caja;
}

/* La tabla de puntos de una reunión. */
function tablaPuntos(ev) {
  const caja = el('div', { class: 'puntos' });
  caja.appendChild(el('div', { class: 'puntos-tit', text: 'Puntos a tratar' }));

  const tabla = el('table');
  tabla.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: '#' }), el('th', { text: 'Tema' }), el('th', { text: 'Quién lo trae' }),
    el('th', { text: 'En qué quedó' }), el('th', { text: 'Estado' }), el('th', { text: '' })
  ])));
  const tb = el('tbody');
  const lista = puntosDe(ev.id);

  if (!lista.length) tb.appendChild(el('tr', {}, el('td', { colspan: 6 },
    el('div', { class: 'mini', text: 'Sin puntos todavía.' }))));

  lista.forEach((p, i) => {
    const campo = (valor, nombre, ph) => {
      const inp = el('input', { type: 'text', value: valor || '', placeholder: ph || '' });
      inp.addEventListener('change', () => { p[nombre] = inp.value; Datos.guardar('puntos', p); });
      return inp;
    };
    tb.appendChild(el('tr', {}, [
      el('td', { class: 'num', text: String(i + 1) }),
      el('td', {}, campo(p.texto, 'texto', 'Qué se trata')),
      el('td', {}, selector(personasElegibles(), p.responsable || '',
        v => { p.responsable = v; Datos.guardar('puntos', p); }, 'Sin asignar')),
      el('td', {}, campo(p.acuerdo, 'acuerdo', 'Acuerdo o pendiente')),
      el('td', {}, selector(['Pendiente', 'Tratado', 'Se arrastra'], p.estado || 'Pendiente',
        v => { p.estado = v; Datos.guardar('puntos', p); render(); }, null)),
      el('td', {}, el('button', { class: 'x', type: 'button', text: '✕',
        onclick: () => UI.borrarConDeshacer('puntos', { ...p }, 'Punto', render) }))
    ]));
  });
  tabla.appendChild(tb);
  caja.appendChild(el('div', { class: 'tablewrap' }, tabla));

  const nuevo = el('input', { type: 'text', placeholder: 'Nuevo punto…', style: 'max-width:280px' });
  const agregar = () => {
    if (!nuevo.value.trim()) return;
    Datos.guardar('puntos', { id: uid(), reunion: ev.id, texto: nuevo.value.trim(),
      responsable: '', acuerdo: '', estado: 'Pendiente', orden: puntosDe(ev.id).length });
    nuevo.value = ''; render();
  };
  nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  caja.appendChild(el('div', { class: 'toolbar' }, [
    nuevo,
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar punto', onclick: agregar }),
    el('button', { class: 'btn btn-sm', type: 'button', text: '→ Llevar a la pizarra',
      title: 'Convierte estos puntos en nodos de una pizarra',
      onclick: () => {
        vista = 'pizarra'; marcarTab(); render();
        requestAnimationFrame(() => traerPuntos(ev.id));
      } })
  ]));
  return caja;
}


/* ------------------------------------------------------------------ *
 * 10. Carpeta
 *
 * La vista previa de la carpeta real de la Secretaría, y el índice de
 * todo lo que el equipo ha ido colgando de sus proyectos. Los dos lados
 * son el mismo lugar visto distinto:
 *
 *   · lo que está en Drive se lista en vivo desde el servidor
 *   · lo que se pegó en un proyecto aparece acá sin copiar nada, porque
 *     se lee la misma tabla 'enlaces'
 *
 * Y los accesos son de ida y vuelta: del documento se salta al proyecto
 * que lo usa, y del proyecto al documento.
 * ------------------------------------------------------------------ */

let carpetaAbierta = null;      /* subcarpeta de Drive que se está mirando */

/* Todo documento del sistema, venga de donde venga. */
function documentos() {
  return Datos.todo('enlaces').map(e => {
    const pr = e.proyecto ? Datos.uno('proyectos', e.proyecto) : null;
    return {
      id: e.id, nombre: e.nombre || 'Sin nombre', url: e.url || '',
      proyecto: pr, fila: e,
      ambito: pr ? pr.nombre : 'General de la secretaría'
    };
  });
}

function vistaCarpeta(raiz) {
  const docs = documentos();
  const conUrl = docs.filter(d => d.url);
  const sinUrl = docs.filter(d => !d.url);

  raiz.appendChild(el('p', { class: 'intro',
    text: 'Todo lo que la Secretaría guarda: la carpeta de Drive tal como está ahora y ' +
          'los documentos que cada proyecto tiene colgados. Es la misma información, no una copia.' }));

  /* --- 1. La carpeta real, en vivo --- */
  const vivo = el('div', {});
  Drive.preguntar().then(es => {
    vivo.innerHTML = '';
    if (!es.configurado) {
      vivo.appendChild(el('div', { class: 'note' }, [
        el('b', { text: 'La carpeta de Drive todavía no está conectada. ' }),
        document.createTextNode(es.sinServidor
          ? 'Esta copia se abrió sin servidor, así que no puede hablar con Drive.'
          : (es.motivo || '')),
        el('p', { text: 'Mientras tanto, el índice de abajo funciona igual: recoge todos los ' +
          'enlaces que el equipo ya pegó en sus proyectos.' })
      ]));
      return;
    }
    vivo.appendChild(migasDrive());
    vivo.appendChild(listadoDrive(carpetaAbierta || es.carpeta, docs));
  });
  raiz.appendChild(UI.seccion('carpeta-drive', 'Carpeta de la Secretaría',
    'Vista previa de lo que hay en Drive ahora mismo', [vivo]));

  /* --- 2. El índice por proyecto --- */
  const porProyecto = new Map();
  conUrl.forEach(d => {
    const clave = d.proyecto ? d.proyecto.id : '';
    if (!porProyecto.has(clave)) porProyecto.set(clave, []);
    porProyecto.get(clave).push(d);
  });

  const indice = el('div', { class: 'carp-indice' });
  const generales = porProyecto.get('') || [];
  if (generales.length) indice.appendChild(grupoDocs('General de la secretaría', null, generales));
  [...porProyecto.entries()].filter(([k]) => k).forEach(([id, lista]) => {
    const pr = Datos.uno('proyectos', id);
    indice.appendChild(grupoDocs(pr ? pr.nombre : 'Proyecto eliminado', pr, lista));
  });
  if (!conUrl.length) indice.appendChild(el('div', { class: 'empty',
    text: 'Todavía no hay documentos con dirección. Se agregan desde cada proyecto, en ' +
          '"Carpetas y documentos".' }));

  raiz.appendChild(UI.seccion('carpeta-indice', 'Documentos del equipo',
    `${conUrl.length} con dirección` + (sinUrl.length ? ` · ${sinUrl.length} sin pegar` : ''),
    [indice]));

  /* --- 3. Lo que falta por completar --- */
  if (sinUrl.length) {
    const pend = el('div', { class: 'carp-pend' });
    sinUrl.forEach(d => {
      const inp = el('input', { type: 'url', value: '', placeholder: 'https://drive.google.com/…' });
      inp.addEventListener('change', () => {
        d.fila.url = inp.value.trim(); Datos.guardar('enlaces', d.fila); render();
      });
      pend.appendChild(el('div', { class: 'carp-fila' }, [
        UI.icono('documentos', 16),
        el('span', { class: 'carp-nombre', text: d.nombre }),
        el('span', { class: 'carp-ambito', text: d.ambito }),
        inp
      ]));
    });
    raiz.appendChild(UI.seccion('carpeta-pendientes', 'Sin dirección todavía',
      `${sinUrl.length} documentos creados pero sin enlace`, [pend], { abierta: false }));
  }
}

function migasDrive() {
  const caja = el('div', { class: 'carp-migas' });
  caja.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: '↑ Carpeta principal',
    onclick: () => { carpetaAbierta = null; render(); } }));
  if (carpetaAbierta) caja.appendChild(el('span', { class: 'mini', text: 'dentro de una subcarpeta' }));
  return caja;
}

/* El contenido de Drive, cruzado con lo que ya está enlazado a un proyecto. */
function listadoDrive(carpeta, docs) {
  const caja = el('div', { class: 'carp-lista' });
  caja.appendChild(el('div', { class: 'mini', text: 'Leyendo Drive…' }));

  Drive.listar(carpeta, false).then(archivos => {
    caja.innerHTML = '';
    if (!archivos.length) {
      caja.appendChild(el('div', { class: 'empty', text: 'La carpeta está vacía.' }));
      return;
    }
    archivos.forEach(a => {
      /* ¿Este archivo ya está colgado de algún proyecto? */
      const usado = docs.find(d => d.url && (d.url.includes(a.id) || d.url === a.url));

      const fila = el('div', { class: 'carp-fila' + (a.esCarpeta ? ' es-carpeta' : '') }, [
        UI.icono(a.esCarpeta ? 'proyecto' : 'documentos', 16),
        a.esCarpeta
          ? el('button', { class: 'carp-nombre linktitle', type: 'button', text: a.nombre,
              title: 'Abrir esta subcarpeta',
              onclick: () => { carpetaAbierta = a.id; render(); } })
          : el('a', { class: 'carp-nombre', href: a.url, target: '_blank', rel: 'noopener',
              text: a.nombre }),
        el('span', { class: 'carp-tipo', text: a.tipo }),
        el('span', { class: 'carp-fecha', text: fechaCorta(a.modificado) })
      ]);

      /* Acceso de ida y vuelta: del documento al proyecto que lo usa. */
      if (usado && usado.proyecto) {
        fila.appendChild(el('button', { class: 'carp-proy', type: 'button',
          title: 'Ir al proyecto que usa este documento',
          text: '→ ' + recorta(usado.proyecto.nombre, 26),
          onclick: () => {
            vista = 'proyectos';
            filtros.texto = usado.proyecto.nombre;
            abiertos['O:' + usado.proyecto.id] = true;
            marcarTab(); render();
          } }));
      } else if (!a.esCarpeta) {
        fila.appendChild(vincularA(a));
      }
      caja.appendChild(fila);
    });
  }).catch(e => {
    caja.innerHTML = '';
    caja.appendChild(el('div', { class: 'note', text: e.message }));
  });
  return caja;
}

/* Colgar un archivo de Drive de un proyecto, sin salir de acá. */
function vincularA(archivo) {
  const sel = el('select', { class: 'carp-vincular', title: 'Colgar este documento de un proyecto' });
  sel.appendChild(el('option', { value: '', text: 'Vincular a…' }));
  items().forEach(it => sel.appendChild(el('option', { value: it.clave,
    text: recorta(it.nombre, 30) })));
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    const it = items().find(x => x.clave === sel.value);
    if (!it) return;
    const pr = asegurar(it);
    Datos.guardar('enlaces', { id: uid(), proyecto: pr.id,
      nombre: archivo.nombre, url: archivo.url });
    UI.aviso(`"${recorta(archivo.nombre, 24)}" quedó en ${recorta(pr.nombre, 24)}`);
    render();
  });
  return sel;
}

function grupoDocs(titulo, pr, lista) {
  const caja = el('div', { class: 'carp-grupo' });
  const cab = el('div', { class: 'carp-grupo-cab' }, [
    el('b', { text: titulo }),
    el('span', { class: 'mini', text: `${lista.length} documento${lista.length === 1 ? '' : 's'}` })
  ]);
  /* Del documento al proyecto, y del grupo al proyecto. */
  if (pr) cab.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'Ver el proyecto →',
    onclick: () => {
      vista = 'proyectos'; filtros.texto = pr.nombre;
      abiertos['O:' + pr.id] = true; marcarTab(); render();
    } }));
  caja.appendChild(cab);

  lista.forEach(d => caja.appendChild(el('div', { class: 'carp-fila' }, [
    UI.icono('documentos', 16),
    el('a', { class: 'carp-nombre', href: d.url, target: '_blank', rel: 'noopener', text: d.nombre }),
    el('span', { class: 'carp-url', text: d.url.replace(/^https?:\/\//, '').slice(0, 44) }),
    el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar el documento',
      onclick: () => UI.borrarConDeshacer('enlaces', { ...d.fila }, 'Documento', render) })
  ])));
  return caja;
}

function vistaReuniones(raiz) {
  raiz.appendChild(el('p', { class: 'intro',
    text: 'Cada reunión con su fecha, su hora, quiénes van y su tabla de puntos. ' +
          'Los puntos se llevan a la pizarra con un botón, y el enlace de la ' +
          'videollamada queda guardado en la misma fila.' }));
  tablaReuniones(raiz);
}

/* ------------------------------------------------------------------ *
 * 9. Pizarra
 *
 * Un lienzo compartido por reunión. Cada cosa que se pone encima es una
 * fila de pizarra_items, así dos personas pueden mover cosas distintas a
 * la vez sin pisarse, y el tiempo real de la base hace el resto.
 *
 * Sin librerías: SVG para las líneas y el trazo, y divs sueltos para los
 * nodos. Es lo mismo con que están hechos los gráficos del sistema, y
 * permite que el archivo de un solo clic siga funcionando sin internet.
 *
 * Tipos de elemento:
 *   nota      · un papel de color con texto
 *   texto     · una idea suelta, sin fondo
 *   tabla     · una rejilla editable que se genera y crece
 *   dibujo    · un trazo a mano alzada (puntos en datos.trazo)
 *   proyecto  · una ventana con el proyecto vivo, reducible
 *   conexion  · una línea entre dos elementos (el mapa mental)
 * ------------------------------------------------------------------ */

const COLORES_PIZARRA = ['#f7d774', '#f3a9a2', '#a8d8c8', '#a9c4ea',
                         '#d9b8e4', '#f2c69a', '#c9d79a', '#e3e0d4'];
const colorItem = n => COLORES_PIZARRA[((n || 1) - 1) % COLORES_PIZARRA.length];

/* Colores del mapa mental, uno por clase de nodo, para que se lea de lejos. */
const COLOR_NODO = { raiz: 1, plazo: 6, paso: 3, persona: 4, obs: 5 };

let pizarraActual = null;
let herramienta = 'mano';        /* mano · dibujo · conexion */
let conexionDesde = null;
let arrastrando = false;

const pizarras = () => Datos.todo('pizarras').slice()
  .sort((a, b) => (a.orden || 0) - (b.orden || 0));
const itemsDe = id => Datos.todo('pizarra_items').filter(i => i.pizarra === id);

function asegurarPizarra() {
  if (pizarras().length) return pizarraActual && Datos.uno('pizarras', pizarraActual)
    ? Datos.uno('pizarras', pizarraActual) : pizarras()[0];
  return Datos.guardar('pizarras', { id: uid(), nombre: 'Pizarra de trabajo', orden: 0 });
}

function nuevoItem(tipo, extra) {
  /* Lo nuevo cae en escalera, no encima de lo anterior: si todo aterriza en
     el mismo punto la pizarra queda con una pila y no se ve nada. */
  const n = itemsDe(pizarraActual).filter(i => i.tipo !== 'conexion').length;
  return Datos.guardar('pizarra_items', Object.assign({
    id: uid(), pizarra: pizarraActual, tipo,
    x: 40 + (n % 6) * 42, y: 40 + (n % 6) * 34 + Math.floor(n / 6) * 30,
    ancho: 210, alto: 130, texto: '', color: 1,
    datos: {}, orden: n
  }, extra || {}));
}

/* ------------------------- la vista ------------------------------- */
function vistaPizarra(raiz) {
  const pz = asegurarPizarra();
  pizarraActual = pz.id;
  const items = itemsDe(pz.id);

  raiz.appendChild(barraPizarra(pz, items));

  const lienzo = el('div', { class: 'pz-lienzo' + (herramienta !== 'mano' ? ' modo-' + herramienta : '') });
  const capa = el('div', { class: 'pz-capa' });
  const svg = document.createElementNS(Graficos.ns, 'svg');
  svg.setAttribute('class', 'pz-lineas');
  capa.appendChild(svg);

  /* Primero los nodos, para poder medirlos y después tirar las líneas. */
  const cajas = new Map();
  items.filter(i => i.tipo !== 'conexion').forEach(it => {
    const nodo = nodoItem(it);
    cajas.set(it.id, it);
    capa.appendChild(nodo);
  });
  items.filter(i => i.tipo === 'conexion').forEach(it => dibujarConexion(svg, it, cajas));

  lienzo.appendChild(capa);
  conectarLienzo(lienzo, capa, svg);
  raiz.appendChild(lienzo);

  if (!items.length) raiz.appendChild(el('p', { class: 'pz-vacia', text:
    'Pizarra en blanco. Agrega una nota, trae los puntos de una reunión o ' +
    'suelta un proyecto para que se arme su mapa mental.' }));
}

/* ------------------------- barra de arriba ------------------------ */
function barraPizarra(pz, items) {
  const caja = el('div', { class: 'pz-barra' });

  /* Qué pizarra: se crean en blanco y se guardan solas. */
  const sel = el('select', { class: 'pz-sel', title: 'Pizarra abierta' });
  pizarras().forEach(p => sel.appendChild(el('option', { value: p.id, text: p.nombre })));
  sel.value = pz.id;
  sel.addEventListener('change', () => { pizarraActual = sel.value; render(); });

  const nombre = el('input', { type: 'text', value: pz.nombre, class: 'pz-nombre',
    title: 'Nombre de la pizarra' });
  nombre.addEventListener('change', () => {
    pz.nombre = nombre.value; Datos.guardar('pizarras', pz); render();
  });

  const herr = (id, txt, titulo) => el('button', {
    class: 'btn btn-sm' + (herramienta === id ? ' btn-primary' : ''), type: 'button',
    text: txt, title: titulo,
    onclick: () => { herramienta = herramienta === id ? 'mano' : id; conexionDesde = null; render(); } });

  caja.appendChild(el('div', { class: 'pz-grupo' }, [
    sel, nombre,
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ Pizarra en blanco',
      onclick: () => {
        const n = Datos.guardar('pizarras', { id: uid(),
          nombre: 'Pizarra ' + (pizarras().length + 1), orden: pizarras().length });
        pizarraActual = n.id; render();
      } }),
    pizarras().length > 1 ? el('button', { class: 'x', type: 'button', text: '✕',
      title: 'Eliminar esta pizarra',
      onclick: () => {
        if (!confirm(`¿Eliminar "${pz.nombre}" y todo lo que tiene encima?`)) return;
        itemsDe(pz.id).forEach(i => Datos.borrar('pizarra_items', i.id));
        Datos.borrar('pizarras', pz.id);
        pizarraActual = null; render();
      } }) : null
  ].filter(Boolean)));

  caja.appendChild(el('div', { class: 'pz-grupo' }, [
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ Nota',
      onclick: () => { nuevoItem('nota', { texto: '', color: 1 + itemsDe(pizarraActual).length % 8 }); render(); } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ Idea',
      onclick: () => { nuevoItem('texto', { ancho: 200, alto: 44 }); render(); } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ Tabla',
      onclick: () => {
        nuevoItem('tabla', { ancho: 360, alto: 170,
          datos: { filas: [['Tema', 'Quién', 'Acuerdo'], ['', '', '']] } });
        render();
      } }),
    herr('dibujo', '✎ Dibujar', 'Trazar a mano alzada'),
    herr('conexion', '⤳ Conectar', 'Unir dos elementos para armar el mapa mental')
  ]));

  caja.appendChild(el('div', { class: 'pz-grupo' }, [
    selectorReunion(), selectorProyecto(),
    el('span', { class: 'mini', text: `${items.length} elementos` })
  ]));

  if (herramienta === 'conexion') caja.appendChild(el('div', { class: 'pz-pista',
    text: conexionDesde ? 'Ahora toca el segundo elemento.' : 'Toca el primer elemento a unir.' }));
  if (herramienta === 'dibujo') caja.appendChild(el('div', { class: 'pz-pista',
    text: 'Arrastra sobre la pizarra para trazar. Vuelve a tocar Dibujar para salir.' }));
  return caja;
}

/* Traer a la pizarra los puntos de una reunión, como líneas de ideas. */
function selectorReunion() {
  const sel = el('select', { class: 'pz-sel', title: 'Traer los puntos de una reunión' });
  sel.appendChild(el('option', { value: '', text: 'Traer puntos de…' }));
  Datos.todo('agenda').slice()
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
    .forEach(ev => sel.appendChild(el('option', { value: ev.id,
      text: (fechaCorta(ev.inicio) || 'sin fecha') + ' · ' + recorta(ev.tema || 'Reunión', 28) })));
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    traerPuntos(sel.value);
    sel.value = '';
  });
  return sel;
}

function traerPuntos(reunionId) {
  const ev = Datos.uno('agenda', reunionId);
  const puntos = Datos.todo('puntos').filter(p => p.reunion === reunionId)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  if (!puntos.length) {
    UI.aviso('Esa reunión todavía no tiene puntos en su tabla.');
    return;
  }
  /* La reunión queda como raíz y los puntos colgando: una línea de ideas. */
  const raizItem = nuevoItem('nota', {
    texto: ev.tema || 'Reunión', x: 60, y: 60, ancho: 230, alto: 90, color: 2
  });
  puntos.forEach((p, i) => {
    const nodo = nuevoItem('texto', {
      texto: p.texto + (p.responsable ? `\n— ${p.responsable}` : ''),
      x: 360, y: 60 + i * 76, ancho: 250, alto: 62, color: 8
    });
    nuevoItem('conexion', { datos: { de: raizItem.id, a: nodo.id } });
  });
  /* La pizarra queda asociada a esa reunión, para volver a abrirla después. */
  const pz = Datos.uno('pizarras', pizarraActual);
  if (pz) { pz.reunion = reunionId; Datos.guardar('pizarras', pz); }
  UI.aviso(`${puntos.length} puntos traídos a la pizarra`);
  render();
}

/* Soltar un proyecto: se arma su mapa mental completo. */
function selectorProyecto() {
  const sel = el('select', { class: 'pz-sel', title: 'Armar el mapa mental de un proyecto' });
  sel.appendChild(el('option', { value: '', text: 'Mapa mental de…' }));
  items().forEach(it => sel.appendChild(el('option', { value: it.clave,
    text: recorta(it.nombre, 34) })));
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    const it = items().find(x => x.clave === sel.value);
    if (it) mapaMental(it);
    sel.value = '';
  });
  return sel;
}

/* El mapa mental de un proyecto: título al centro, y alrededor los plazos,
   los pasos con sus sub-pasos, los responsables y las observaciones. Cada
   clase de nodo con su color. */
function mapaMental(it) {
  const pr = asegurar(it);
  const pasos = Modelo.pasosDe(pr.id);
  const gente = pr.designados || [];

  /* El mapa se arma en un claro: debajo de lo que ya hay, y con margen a la
     izquierda para que los nodos de plazos no queden fuera del lienzo. */
  const previos = itemsDe(pizarraActual).filter(i => i.tipo !== 'conexion');
  const cx = 600;
  const cy = previos.length
    ? Math.max(...previos.map(i => (i.y || 0) + (i.alto || 120))) + 260
    : 300;
  const raizItem = nuevoItem('proyecto', {
    texto: pr.nombre, x: cx - 130, y: cy - 60, ancho: 260, alto: 120,
    color: COLOR_NODO.raiz, datos: { proyecto: pr.id, reducida: false }
  });

  const unir = (a, b) => nuevoItem('conexion', { datos: { de: a, a: b } });

  /* Plazos a la izquierda */
  const plazos = [];
  if (pr.inicio) plazos.push('Empieza: ' + fechaCorta(pr.inicio));
  if (pr.plazo_final) plazos.push('Plazo final: ' + fechaCorta(pr.plazo_final));
  if (pr.urgencia) plazos.push('Urgencia: ' + pr.urgencia);
  plazos.forEach((t, i) => {
    const n = nuevoItem('texto', { texto: t, x: cx - 460, y: cy - 90 + i * 70,
      ancho: 210, alto: 56, color: COLOR_NODO.plazo });
    unir(raizItem.id, n.id);
  });

  /* Responsables abajo */
  gente.forEach((n, i) => {
    const p = personaPorNombre(n);
    const nodo = nuevoItem('texto', {
      texto: (i === 0 ? '★ ' : '') + n + (p && p.externo ? `\n(${p.equipo})` : ''),
      x: cx - 240 + i * 190, y: cy + 150, ancho: 170, alto: 56, color: COLOR_NODO.persona });
    unir(raizItem.id, nodo.id);
  });

  /* Pasos a la derecha, con sus sub-pasos colgando */
  pasos.forEach((paso, i) => {
    const y = cy - 180 + i * 130;
    const marca = Modelo.pasoListo(paso) ? '✓ ' : '';
    const nodo = nuevoItem('texto', {
      texto: `${marca}${i + 1}. ${paso.descripcion || 'Paso'}` +
             (paso.plazo ? `\n${fechaCorta(paso.plazo)}` : '') +
             (paso.principal ? `\n★ ${paso.principal}` : ''),
      x: cx + 230, y, ancho: 230, alto: 76, color: COLOR_NODO.paso });
    unir(raizItem.id, nodo.id);

    Modelo.subDe(paso.id).forEach((h, j) => {
      const sub = nuevoItem('texto', {
        texto: (h.estado === 'Completado' ? '✓ ' : '') + h.descripcion,
        x: cx + 500, y: y + j * 58, ancho: 210, alto: 48, color: COLOR_NODO.paso });
      unir(nodo.id, sub.id);
    });
  });

  /* Observaciones arriba */
  if (pr.observaciones) {
    const n = nuevoItem('nota', { texto: pr.observaciones, x: cx - 110, y: cy - 260,
      ancho: 240, alto: 110, color: COLOR_NODO.obs });
    unir(raizItem.id, n.id);
  }

  UI.aviso('Mapa mental armado con ' + pasos.length + ' pasos');
  render();
}

/* ------------------------- cada elemento -------------------------- */
function nodoItem(it) {
  const caja = el('div', {
    class: 'pz-item tipo-' + it.tipo + (it.datos && it.datos.reducida ? ' reducida' : ''),
    style: `left:${it.x}px; top:${it.y}px; width:${it.ancho}px;` +
           (it.tipo === 'dibujo' ? '' : ` min-height:${it.alto}px;`) +
           ` --c:${colorItem(it.color)}`,
    'data-item': it.id
  });

  /* Asa: se arrastra de acá, y desde acá se conecta con otro. */
  const asa = el('div', { class: 'pz-asa' }, [
    el('span', { class: 'pz-punto' }),
    el('button', { class: 'pz-x', type: 'button', text: '✕', title: 'Quitar de la pizarra',
      onclick: e => {
        e.stopPropagation();
        /* Las líneas que llegaban a este elemento se van con él. */
        Datos.todo('pizarra_items')
          .filter(x => x.tipo === 'conexion' && x.datos &&
                       (x.datos.de === it.id || x.datos.a === it.id))
          .forEach(x => Datos.borrar('pizarra_items', x.id));
        UI.borrarConDeshacer('pizarra_items', { ...it }, 'Elemento', render);
      } })
  ]);
  if (it.tipo !== 'dibujo') caja.appendChild(asa);

  if (it.tipo === 'nota' || it.tipo === 'texto') caja.appendChild(cuerpoTexto(it));
  else if (it.tipo === 'tabla') caja.appendChild(cuerpoTabla(it));
  else if (it.tipo === 'proyecto') caja.appendChild(cuerpoProyecto(it, caja));
  else if (it.tipo === 'dibujo') caja.appendChild(cuerpoDibujo(it));

  if (it.tipo !== 'dibujo') arrastrable(caja, it);
  return caja;
}

function cuerpoTexto(it) {
  const t = el('textarea', { class: 'pz-texto', placeholder: 'Escribe…' });
  t.value = it.texto || '';
  t.addEventListener('change', () => { it.texto = t.value; Datos.guardar('pizarra_items', it); });
  /* Crece con lo que se escribe, sin tener que arrastrar el borde. */
  const ajustar = () => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
  t.addEventListener('input', ajustar);
  requestAnimationFrame(ajustar);
  return t;
}

/* Una tabla que se genera y crece: filas y columnas se agregan con un botón. */
function cuerpoTabla(it) {
  const datos = it.datos && it.datos.filas ? it.datos : { filas: [['', '']] };
  const caja = el('div', { class: 'pz-tabla' });
  const guardar = () => { it.datos = datos; Datos.guardar('pizarra_items', it); };

  const tabla = el('table');
  datos.filas.forEach((fila, f) => {
    const tr = el('tr', {});
    fila.forEach((celda, c) => {
      const inp = el('input', { type: 'text', value: celda,
        placeholder: f === 0 ? 'Columna' : '' });
      if (f === 0) inp.classList.add('cabecera');
      inp.addEventListener('change', () => { datos.filas[f][c] = inp.value; guardar(); });
      tr.appendChild(el('td', {}, inp));
    });
    tabla.appendChild(tr);
  });
  caja.appendChild(tabla);
  caja.appendChild(el('div', { class: 'pz-tabla-pie' }, [
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ fila',
      onclick: () => { datos.filas.push(datos.filas[0].map(() => '')); guardar(); render(); } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: '+ columna',
      onclick: () => { datos.filas.forEach(f => f.push('')); guardar(); render(); } })
  ]));
  return caja;
}

/* La ventana de un proyecto: vive del proyecto real, no de una copia, y se
   reduce a su título para que no ocupe media pizarra. */
function cuerpoProyecto(it, caja) {
  const pr = Datos.uno('proyectos', it.datos && it.datos.proyecto);
  const cuerpo = el('div', { class: 'pz-proy' });
  if (!pr) {
    cuerpo.appendChild(el('div', { class: 'mini', text: 'Ese proyecto ya no existe.' }));
    return cuerpo;
  }
  const pasos = Modelo.pasosDe(pr.id);
  const hechos = pasos.filter(p => Modelo.pasoListo(p)).length;

  const titulo = el('button', { class: 'pz-proy-tit', type: 'button',
    title: 'Reducir o desplegar', text: pr.nombre,
    onclick: e => {
      e.stopPropagation();
      it.datos = Object.assign({}, it.datos, { reducida: !(it.datos || {}).reducida });
      Datos.guardar('pizarra_items', it);
      caja.classList.toggle('reducida', it.datos.reducida);
    } });
  cuerpo.appendChild(titulo);

  const detalle = el('div', { class: 'pz-proy-cuerpo' });
  detalle.appendChild(el('div', { class: 'pz-proy-meta', text:
    `${hechos} de ${pasos.length} pasos` +
    (pr.plazo_final ? ` · vence ${fechaCorta(pr.plazo_final)}` : '') +
    (pr.urgencia ? ` · ${pr.urgencia}` : '') }));
  if ((pr.designados || []).length) detalle.appendChild(el('div', { class: 'pz-proy-meta',
    text: '★ ' + pr.designados.join(', ') }));

  pasos.forEach((p, i) => {
    const fila = el('label', { class: 'pz-proy-paso' + (Modelo.pasoListo(p) ? ' listo' : '') });
    const chk = el('input', { type: 'checkbox' });
    chk.checked = Modelo.pasoListo(p);
    chk.disabled = Modelo.subDe(p.id).length > 0;
    chk.addEventListener('change', () => {
      p.estado = chk.checked ? 'Completado' : 'Pendiente';
      Datos.guardar('pasos', p); render();
    });
    fila.appendChild(chk);
    fila.appendChild(el('span', { text: `${i + 1}. ${p.descripcion || ''}` +
      (p.plazo ? ` · ${fechaCorta(p.plazo)}` : '') }));
    detalle.appendChild(fila);
  });
  if (pr.observaciones) detalle.appendChild(el('div', { class: 'pz-proy-obs', text: pr.observaciones }));
  cuerpo.appendChild(detalle);
  return cuerpo;
}

function cuerpoDibujo(it) {
  const puntos = (it.datos && it.datos.trazo) || [];
  const svg = document.createElementNS(Graficos.ns, 'svg');
  const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 8;
  const h = Math.max(...ys) - Math.min(...ys) + 8;
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('class', 'pz-trazo');
  const path = document.createElementNS(Graficos.ns, 'path');
  const x0 = Math.min(...xs) - 4, y0 = Math.min(...ys) - 4;
  path.setAttribute('d', puntos.map((p, i) =>
    `${i ? 'L' : 'M'}${p[0] - x0},${p[1] - y0}`).join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', colorItem(it.color));
  path.setAttribute('stroke-width', '2.5');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

/* ------------------------- arrastrar ------------------------------ */
function arrastrable(caja, it) {
  const asa = caja.querySelector('.pz-asa');
  const empezar = e => {
    /* Con la herramienta de conectar, tocar un elemento lo elige. */
    if (herramienta === 'conexion') {
      e.preventDefault(); e.stopPropagation();
      if (!conexionDesde) { conexionDesde = it.id; caja.classList.add('elegido'); render(); }
      else if (conexionDesde !== it.id) {
        nuevoItem('conexion', { datos: { de: conexionDesde, a: it.id } });
        conexionDesde = null; render();
      }
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    arrastrando = true;
    caja.classList.add('moviendo');
    const x0 = e.clientX, y0 = e.clientY;
    const ix = it.x, iy = it.y;

    const mover = ev => {
      it.x = Math.max(0, ix + (ev.clientX - x0));
      it.y = Math.max(0, iy + (ev.clientY - y0));
      caja.style.left = it.x + 'px';
      caja.style.top = it.y + 'px';
      redibujarLineas();
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      caja.classList.remove('moviendo');
      arrastrando = false;
      Datos.guardar('pizarra_items', it);
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };
  if (asa) asa.addEventListener('mousedown', empezar);
  caja.addEventListener('mousedown', e => {
    if (herramienta === 'conexion') empezar(e);
  });
}

/* ------------------------- líneas del mapa ------------------------ */
function centroDe(id) {
  const n = document.querySelector(`.pz-item[data-item="${id}"]`);
  if (!n) return null;
  return { x: n.offsetLeft + n.offsetWidth / 2, y: n.offsetTop + n.offsetHeight / 2,
           w: n.offsetWidth, h: n.offsetHeight };
}

function dibujarConexion(svg, it, cajas) {
  const d = it.datos || {};
  const linea = document.createElementNS(Graficos.ns, 'path');
  linea.setAttribute('class', 'pz-linea');
  linea.setAttribute('data-de', d.de);
  linea.setAttribute('data-a', d.a);
  linea.setAttribute('data-id', it.id);
  linea.setAttribute('fill', 'none');
  linea.setAttribute('stroke', '#b9b5a6');
  linea.setAttribute('stroke-width', '2');
  svg.appendChild(linea);
}

/* Una curva suave entre los dos centros. Se recalcula al arrastrar. */
function redibujarLineas() {
  document.querySelectorAll('.pz-linea').forEach(l => {
    const a = centroDe(l.dataset.de), b = centroDe(l.dataset.a);
    if (!a || !b) { l.setAttribute('d', ''); return; }
    const dx = Math.abs(b.x - a.x) * 0.45;
    l.setAttribute('d', `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`);
  });
}

/* ------------------------- el lienzo ------------------------------ */
function conectarLienzo(lienzo, capa, svg) {
  /* El SVG cubre todo el lienzo para que las líneas puedan cruzarlo. */
  const medir = () => {
    const w = Math.max(capa.scrollWidth, lienzo.clientWidth);
    const h = Math.max(capa.scrollHeight, lienzo.clientHeight);
    svg.setAttribute('width', w); svg.setAttribute('height', h);
    redibujarLineas();
  };
  requestAnimationFrame(medir);
  (window.REDIBUJAR = window.REDIBUJAR || []).push(medir);

  if (herramienta !== 'dibujo') return;

  /* Trazo a mano alzada: se junta la línea y al soltar se guarda entera. */
  lienzo.addEventListener('mousedown', e => {
    if (e.target.closest('.pz-item')) return;
    e.preventDefault();
    const caja = capa.getBoundingClientRect();
    const puntos = [[e.clientX - caja.left, e.clientY - caja.top]];
    const previo = document.createElementNS(Graficos.ns, 'path');
    previo.setAttribute('fill', 'none');
    previo.setAttribute('stroke', 'var(--uc-rojo)');
    previo.setAttribute('stroke-width', '2.5');
    previo.setAttribute('stroke-linecap', 'round');
    svg.appendChild(previo);

    const mover = ev => {
      puntos.push([ev.clientX - caja.left, ev.clientY - caja.top]);
      previo.setAttribute('d', puntos.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' '));
    };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      previo.remove();
      if (puntos.length < 3) return;
      const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1]);
      nuevoItem('dibujo', {
        x: Math.min(...xs) - 4, y: Math.min(...ys) - 4,
        ancho: Math.max(...xs) - Math.min(...xs) + 8,
        alto: Math.max(...ys) - Math.min(...ys) + 8,
        color: 1, datos: { trazo: puntos }
      });
      render();
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  });
}

/* ------------------------------------------------------------------ *
 * 8. Vista: Equipo
 * ------------------------------------------------------------------ */
function vistaEquipo(raiz) {
  const card = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Integrantes' }),
    el('div', { class: 'sub', text: 'La secretaría y la gente de otros equipos que toma trabajo con ' +
      'nosotres. El correo es lo que usan los recordatorios.' })
  ]);

  const filas = integrantes().map(p => {
    const campoTxt = (valor, nombre, tipo, ph) => {
      const i = el('input', { type: tipo || 'text', value: valor || '', placeholder: ph || '' });
      i.addEventListener('change', () => { p[nombre] = i.value; Datos.guardar('integrantes', p); });
      return i;
    };
    /* De dónde es: la propia secretaría, u otro equipo. Lo segundo marca a la
       persona como externa y deja ver a quién se le está pidiendo algo. */
    const donde = el('select', {});
    donde.appendChild(el('option', { value: '', text: 'Participación' }));
    SPT.equiposFECh.forEach(e => donde.appendChild(el('option', { value: e, text: e })));
    donde.value = p.externo ? (p.equipo || SPT.equiposFECh[0]) : '';
    donde.addEventListener('change', () => {
      p.externo = Boolean(donde.value);
      p.equipo = donde.value || '';
      Datos.guardar('integrantes', p); render();
    });

    return [campoTxt(p.nombre, 'nombre'), campoTxt(p.rol, 'rol', 'text', 'Rol'),
      donde, campoTxt(p.correo, 'correo', 'email', 'nombre@ug.uchile.cl'),
      el('button', { class: 'btn btn-sm' + (personaHorario === p.id ? ' btn-primary' : ''),
        type: 'button', text: resumenHorario(p), 'data-horario': p.id,
        title: 'Editar horarios disponibles',
        onclick: () => { personaHorario = personaHorario === p.id ? null : p.id; render(); } }),
      el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar del equipo',
        onclick: () => UI.borrarConDeshacer('integrantes', { ...p }, 'Integrante', render) })];
  });
  card.appendChild(filas.length
    ? tablaDensa(['Nombre', 'Rol', 'Equipo', 'Correo', 'Horarios', ''], filas)
    : el('div', { class: 'empty', text: 'Todavía no hay integrantes.' }));

  const nuevo = el('input', { type: 'text', placeholder: 'Nombre', style: 'max-width:200px' });
  const correo = el('input', { type: 'email', placeholder: 'Correo', style: 'max-width:220px' });
  const equipo = el('select', { style: 'max-width:210px' });
  equipo.appendChild(el('option', { value: '', text: 'De Participación' }));
  SPT.equiposFECh.forEach(e => equipo.appendChild(el('option', { value: e, text: e })));
  const agregar = () => {
    if (!nuevo.value.trim()) return;
    Datos.guardar('integrantes', { id: uid(), nombre: nuevo.value.trim(), rol: '',
      correo: correo.value.trim(), externo: Boolean(equipo.value), equipo: equipo.value || '' });
    nuevo.value = ''; correo.value = ''; equipo.value = ''; render();
  };
  [nuevo, correo].forEach(i =>
    i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }));
  card.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap' }, [
    nuevo, correo, equipo,
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
  ]));
  card.appendChild(el('div', { class: 'mini', style: 'margin-top:7px', text:
    'Quien sea de otro equipo queda marcado como externe: se le puede designar pasos y ' +
    'proyectos igual, y en las etiquetas se ve de dónde viene.' }));
  raiz.appendChild(card);

  if (personaHorario) raiz.appendChild(editorHorarios(personaHorario));

  /* Enlaces generales de la secretaría */
  const card2 = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Carpetas y documentos de la secretaría' }),
    el('div', { class: 'sub', text: 'Drive, cronogramas, actas: lo que se usa siempre' })
  ]);
  const generales = Datos.todo('enlaces').filter(e => !e.proyecto);
  const faltantes = SPT.enlacesBase.filter(n => !generales.some(g => g.nombre === n));
  if (faltantes.length) card2.appendChild(el('div', { class: 'toolbar' },
    el('button', { class: 'btn btn-sm', type: 'button', text: `Crear los ${faltantes.length} habituales`,
      onclick: () => {
        faltantes.forEach(n => Datos.guardar('enlaces', { id: uid(), nombre: n, url: '', proyecto: null }));
        render();
      } })));
  generales.forEach(g => {
    const n = el('input', { type: 'text', value: g.nombre, style: 'max-width:190px' });
    n.addEventListener('change', () => { g.nombre = n.value; Datos.guardar('enlaces', g); });
    const u = el('input', { type: 'url', value: g.url || '', placeholder: 'https://drive.google.com/…' });
    u.addEventListener('change', () => { g.url = u.value; Datos.guardar('enlaces', g); render(); });
    card2.appendChild(el('div', { style: 'display:flex; gap:8px; align-items:center; padding:3px 0' }, [
      n, u,
      g.url ? el('a', { class: 'btn btn-sm', href: g.url, target: '_blank', rel: 'noopener', text: 'Abrir' }) : null,
      el('button', { class: 'x', type: 'button', text: '✕',
        onclick: () => UI.borrarConDeshacer('enlaces', { ...g }, 'Enlace', render) })
    ].filter(Boolean)));
  });
  const nombreEnlace = el('input', { type: 'text', placeholder: 'Nombre del enlace', style: 'max-width:220px' });
  const agregarEnlace = () => {
    if (!nombreEnlace.value.trim()) return;
    Datos.guardar('enlaces', { id: uid(), nombre: nombreEnlace.value.trim(), url: '', proyecto: null });
    nombreEnlace.value = ''; render();
  };
  card2.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:10px' }, [
    nombreEnlace, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregarEnlace })
  ]));
  raiz.appendChild(card2);
}

/* Editor de horarios: en qué tramos puede cada persona, día por día.
   De aquí salen los avisos al agendar. */
function editorHorarios(id) {
  const p = Datos.todo('integrantes').find(i => i.id === id);
  if (!p) return el('div', {});
  if (!p.disponibilidad) p.disponibilidad = {};

  const card = el('div', { class: 'card compacta' });
  const cuerpo = el('div', {});

  /* Guardar refresca el editor y, de paso, el resumen que se ve en la tabla,
     sin rehacer la página para no perder el foco mientras se escribe una hora. */
  const guardar = () => {
    Datos.guardar('integrantes', p);
    pintar();
    const resumen = document.querySelector(`[data-horario="${p.id}"]`);
    if (resumen) resumen.textContent = resumenHorario(p);
  };

  const pintar = () => {
    cuerpo.innerHTML = '';
    DIAS.forEach(d => {
      const tramos = p.disponibilidad[d.n] || [];
      const fila = el('div', { class: 'horario' }, [
        el('span', { class: 'dia-nombre', text: d.corto })
      ]);
      const caja = el('div', { class: 'tramos' });
      tramos.forEach((t, i) => {
        const desde = el('input', { type: 'time', value: t[0] });
        const hasta = el('input', { type: 'time', value: t[1] });
        desde.addEventListener('change', () => { t[0] = desde.value; guardar(); });
        hasta.addEventListener('change', () => { t[1] = hasta.value; guardar(); });
        caja.appendChild(el('span', { class: 'tramo' }, [
          desde, el('span', { text: '–' }), hasta,
          el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar tramo',
            onclick: () => { tramos.splice(i, 1); p.disponibilidad[d.n] = tramos; guardar(); } })
        ]));
      });
      if (!tramos.length) caja.appendChild(el('span', { class: 'sin-tramo', text: 'no disponible' }));
      caja.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: '+',
        title: 'Agregar tramo',
        onclick: () => {
          p.disponibilidad[d.n] = [...tramos, ['09:00', '18:00']];
          guardar();
        } }));
      fila.appendChild(caja);
      cuerpo.appendChild(fila);
    });
  };
  pintar();

  card.appendChild(el('div', { class: 'toolbar' }, [
    el('div', {}, [
      el('h2', { text: 'Horarios de ' + (p.nombre || 'la persona') }),
      el('div', { class: 'sub', text: 'En qué tramos puede. Al agendar, la aplicación avisa si algo se sale de acá.' })
    ]),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'L a V · 9 a 18', onclick: () => {
      p.disponibilidad = { 1: [['09:00', '18:00']], 2: [['09:00', '18:00']], 3: [['09:00', '18:00']],
        4: [['09:00', '18:00']], 5: [['09:00', '18:00']] };
      guardar();
    } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Tardes L a V', onclick: () => {
      p.disponibilidad = { 1: [['15:00', '20:00']], 2: [['15:00', '20:00']], 3: [['15:00', '20:00']],
        4: [['15:00', '20:00']], 5: [['15:00', '20:00']] };
      guardar();
    } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Limpiar',
      onclick: () => { p.disponibilidad = {}; guardar(); } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Cerrar',
      onclick: () => { personaHorario = null; render(); } })
  ]));
  card.appendChild(cuerpo);
  card.appendChild(el('div', { class: 'note', style: 'margin-top:10px', text:
    'Quien no tenga horarios cargados aparece como "sin definir": la aplicación igual deja agendar, ' +
    'pero avisa que no sabe si puede.' }));
  return card;
}

/* ------------------------------------------------------------------ *
 * 9. Filtros, router y arranque
 * ------------------------------------------------------------------ */
function poblarFiltros() {
  const set = (sel, opciones, valor, vacio) => {
    const s = $(sel);
    s.innerHTML = '';
    s.appendChild(el('option', { value: '', text: vacio }));
    opciones.forEach(o => s.appendChild(el('option', { value: o, text: o })));
    s.value = valor || '';
  };
  set('#f-estado', SPT.listas.estadoProyecto, filtros.estado, 'Todos los estados');
  set('#f-urgencia', SPT.listas.urgencia, filtros.urgencia, 'Toda urgencia');
  set('#f-origen', ['Programa', 'Propio', 'Reasignado'], filtros.origen, 'Todo origen');
  set('#f-persona', nombres(), filtros.persona, 'Todo el equipo');
  $('#f-texto').value = filtros.texto;
}

function marcarTab() {
  document.querySelectorAll('.tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
}

function render() {
  window.REDIBUJAR = [];
  const raiz = $('#vista');
  raiz.innerHTML = '';
  UI.pintarConexion($('#conexion'));

  const nav = document.querySelector('nav.tabs');
  if (Sesion.exigida && !Sesion.usuario) {
    if (nav) nav.style.display = 'none';
    $('#filtros').style.display = 'none';
    UI.pantallaLogin(raiz, () => { if (nav) nav.style.display = ''; render(); });
    return;
  }
  if (nav) nav.style.display = '';
  UI.pintarModulos(nav);
  UI.migas($('#migas'), ['FECh 2026', 'SPT · Participación', {
    tablero: 'Tablero', panel: 'Panel', proyectos: 'Proyectos',
    calendario: 'Calendario', reuniones: 'Reuniones', pizarra: 'Pizarra',
    carpeta: 'Carpeta', equipo: 'Equipo' }[vista] || 'Tablero']);
  $('#filtros').style.display =
    ['equipo', 'calendario', 'pizarra', 'carpeta', 'reuniones'].includes(vista) ? 'none' : '';
  if (vista === 'tablero') vistaTablero(raiz);
  else if (vista === 'panel') vistaPanel(raiz);
  else if (vista === 'proyectos') vistaProyectos(raiz);
  else if (vista === 'calendario') vistaCalendario(raiz);
  else if (vista === 'pizarra') vistaPizarra(raiz);
  else if (vista === 'carpeta') vistaCarpeta(raiz);
  else if (vista === 'reuniones') vistaReuniones(raiz);
  else vistaEquipo(raiz);

  UI.alAbrir = () => (window.REDIBUJAR || []).forEach(f => f());
  if (!['calendario', 'pizarra', 'carpeta'].includes(vista)) UI.plegarTarjetas(raiz, 'spt-' + vista);
}

let oyentesGlobales = false;

async function iniciar() {
  Datos.alCambiarEstado = () => UI.pintarConexion($('#conexion'));
  Datos.alCambioRemoto = () => render();
  await Datos.iniciar();

  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    vista = btn.dataset.vista;
    marcarTab(); render();
  }));
  const bind = (sel, campoF) => $(sel).addEventListener('input', e => {
    filtros[campoF] = e.target.value; render();
  });
  bind('#f-estado', 'estado'); bind('#f-urgencia', 'urgencia');
  bind('#f-origen', 'origen'); bind('#f-persona', 'persona'); bind('#f-texto', 'texto');
  $('#f-limpiar').addEventListener('click', () => {
    filtros = { estado: '', urgencia: '', origen: '', persona: '', texto: '' };
    poblarFiltros(); render();
  });

  if (!oyentesGlobales) {
    oyentesGlobales = true;
    addEventListener('focusout', () => setTimeout(() => Datos.soltarPendiente(), 150));
    let t;
    addEventListener('resize', () => {
      if (window.UNARCHIVO && window.SECCION !== 'spt') return;
      clearTimeout(t);
      t = setTimeout(() => (window.REDIBUJAR || []).forEach(f => f()), 150);
    });
  }

  poblarFiltros();
  render();
}

/* En la versión de un solo archivo la página decide cuándo arrancar cada sección. */
if (window.UNARCHIVO) window.iniciarSPT = iniciar;
else document.addEventListener('DOMContentLoaded', iniciar);
})();
