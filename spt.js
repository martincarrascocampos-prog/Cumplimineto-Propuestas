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
    raiz.appendChild(el('div', { class: 'card compacta' },
      el('div', { class: 'empty', text: 'Ningún proyecto coincide con el filtro.' })));
    return;
  }

  const delPrograma = lista.filter(it => it.origen === 'Programa');
  const propios = lista.filter(it => it.origen === 'Propio');
  const reasignados = lista.filter(it => it.origen === 'Reasignado');
  if (delPrograma.length) {
    raiz.appendChild(seccion(`Del programa · ${delPrograma.length}`));
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
    el('label', { class: 'field' }, [el('span', { text: 'Plazo final' }), (() => {
      const f = el('input', { type: 'date', value: pr.plazo_final || '' });
      f.addEventListener('change', () => guarda('plazo_final', f.value));
      return f;
    })()])
  ]));

  /* --- equipo del proyecto: el primero es el principal --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Equipo · el primero es el encargado principal' }));
  const cajaGente = el('div', { class: 'meta' });
  const pintarGente = () => {
    cajaGente.innerHTML = '';
    if (!nombres().length) {
      cajaGente.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-muted)',
        text: 'Agrega integrantes en la pestaña Equipo.' }));
      return;
    }
    (pr.designados || []).forEach((n, i) => {
      cajaGente.appendChild(el('span', { class: 'tag ' + (i === 0 ? 'principal' : '') }, [
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
    nombres().filter(n => !(pr.designados || []).includes(n)).forEach(n =>
      cajaGente.appendChild(el('button', { class: 'tag', type: 'button', text: '+ ' + n,
        onclick: () => { guarda('designados', [...(pr.designados || []), n]); pintarGente(); } })));
  };
  pintarGente();
  card.appendChild(cajaGente);

  /* --- pasos --- */
  card.appendChild(el('div', { class: 'bloque-t', text: 'Pasos' }));
  const cajaPasos = el('div', {});
  const pintarPasos = () => {
    cajaPasos.innerHTML = '';
    const pasos = Modelo.pasosDe(pr.id);
    if (!pasos.length) cajaPasos.appendChild(el('div', { style: 'font-size:13px;color:var(--ink-muted)',
      text: 'Sin pasos.' }));
    pasos.forEach((paso, i) => {
      const listo = paso.estado === 'Completado';
      const chk = el('input', { type: 'checkbox', 'aria-label': 'Paso completado' });
      chk.checked = listo;
      chk.addEventListener('change', () => {
        paso.estado = chk.checked ? 'Completado' : 'Pendiente';
        Datos.guardar('pasos', paso);
        pintarPasos(); refrescarCabeza();
      });
      const desc = el('input', { type: 'text', value: paso.descripcion });
      desc.addEventListener('change', () => { paso.descripcion = desc.value; Datos.guardar('pasos', paso); });
      const fecha = el('input', { type: 'date', class: 'oculta-movil', value: paso.plazo || '' });
      fecha.addEventListener('change', () => { paso.plazo = fecha.value; Datos.guardar('pasos', paso); pintarPasos(); });
      if (paso.plazo && !listo && paso.plazo < hoy()) fecha.classList.add('vencido');
      const est = selector(SPT.listas.estadoPaso, paso.estado || 'Pendiente', v => {
        paso.estado = v; Datos.guardar('pasos', paso); pintarPasos(); refrescarCabeza();
      }, null);
      est.classList.add('oculta-movil');
      const enc = el('select', { multiple: 'multiple', size: 1, class: 'oculta-movil',
        title: 'Encargados del paso', 'aria-label': 'Encargados' });
      nombres().forEach(n => {
        const o = el('option', { value: n, text: n });
        if ((paso.encargados || []).includes(n)) o.selected = true;
        enc.appendChild(o);
      });
      enc.addEventListener('change', () => {
        paso.encargados = [...enc.selectedOptions].map(o => o.value).slice(0, 2);
        Datos.guardar('pasos', paso);
      });
      cajaPasos.appendChild(el('div', { class: 'paso' + (listo ? ' listo' : '') }, [
        el('span', { class: 'n', text: String(i + 1) }), chk, desc, fecha, est, enc,
        el('button', { class: 'x', type: 'button', text: '✕', title: 'Eliminar paso',
          onclick: () => UI.borrarConDeshacer('pasos', { ...paso }, 'Paso',
            () => { pintarPasos(); refrescarCabeza(); }) })
      ]));
    });
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
              estado: 'Por agendar', proyecto: pr.id });
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
    cajaEnlaces.appendChild(el('div', { style: 'display:flex; gap:6px; margin-top:8px; flex-wrap:wrap' },
      opciones.map(o => el('button', { class: 'btn btn-sm', type: 'button', text: '+ ' + o,
        onclick: () => {
          Datos.guardar('enlaces', { id: uid(), proyecto: pr.id, nombre: o, url: '' });
          pintarEnlaces();
        } }))));
  };
  pintarEnlaces();
  card.appendChild(cajaEnlaces);

  /* --- pie --- */
  const pie = el('div', { class: 'toolbar', style: 'margin:14px 0 0' });
  if (it.codigo) pie.appendChild(el('a', { class: 'btn btn-sm', href: `index.html#${it.codigo}`,
    text: `Ver ${it.codigo} en el programa` }));
  pie.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'Agendar reunión',
    onclick: () => {
      Datos.guardar('agenda', { id: uid(), tema: 'Reunión — ' + pr.nombre, inicio: '', duracion: 60,
        formato: 'Presencial', lugar: '', invitados: (pr.designados || []).join(', '),
        estado: 'Por agendar', proyecto: pr.id });
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

/* ------------------------------------------------------------------ *
 * 7. Vista: Calendario
 * ------------------------------------------------------------------ */
function eventosDelMes(inicioMes, finMes) {
  const dentro = f => f && f.slice(0, 10) >= inicioMes && f.slice(0, 10) <= finMes;
  const mios = n => !filtros.persona || (n || []).includes(filtros.persona);
  const lista = [];

  Datos.todo('agenda').forEach(ev => {
    if (!dentro(ev.inicio)) return;
    const invitados = String(ev.invitados || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!mios(invitados)) return;
    lista.push({ tipo: 'reunion', fecha: ev.inicio.slice(0, 10), hora: horaDe(ev.inicio),
      titulo: ev.tema, gente: invitados, ref: ev });
  });

  items().forEach(it => {
    hitosDe(it).forEach(h => {
      if (!dentro(h.fecha)) return;
      if (!mios(designados(it))) return;
      lista.push({ tipo: 'hito', fecha: h.fecha.slice(0, 10), hora: horaDe(h.fecha),
        titulo: h.detalle, contexto: it.nombre, gente: designados(it) });
    });
    pasosDe(it).forEach(p => {
      if (!dentro(p.plazo)) return;
      if (!mios(p.encargados || [])) return;
      lista.push({ tipo: p.estado === 'Pendiente' && p.plazo < hoy() ? 'vencido' : 'paso',
        fecha: p.plazo.slice(0, 10), hora: '', titulo: p.descripcion, contexto: it.nombre,
        gente: p.encargados || [], hecho: p.estado === 'Completado' });
    });
  });
  return lista.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
}

function vistaCalendario(raiz) {
  const y = mes.getFullYear(), m = mes.getMonth();
  const primero = new Date(y, m, 1);
  const ultimo = new Date(y, m + 1, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const eventos = eventosDelMes(iso(primero), iso(ultimo));
  const porDia = eventos.reduce((a, e) => ((a[e.fecha] = a[e.fecha] || []).push(e), a), {});

  const barra = el('div', { class: 'cal-barra' }, [
    el('button', { class: 'btn btn-sm', type: 'button', text: '‹', 'aria-label': 'Mes anterior',
      onclick: () => { mes = new Date(y, m - 1, 1); render(); } }),
    el('span', { class: 'cal-mes', text: (() => {
      const n = primero.toLocaleDateString('es-CL', { month: 'long' });
      return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + primero.getFullYear();
    })() }),
    el('button', { class: 'btn btn-sm', type: 'button', text: '›', 'aria-label': 'Mes siguiente',
      onclick: () => { mes = new Date(y, m + 1, 1); render(); } }),
    el('button', { class: 'btn btn-sm', type: 'button', text: 'Hoy',
      onclick: () => { mes = new Date(); diaElegido = hoy(); render(); } }),
    el('span', { class: 'count', text: filtros.persona ? `Calendario de ${filtros.persona}` : 'Calendario del equipo' })
  ]);

  const grilla = el('div', { class: 'cal' });
  ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].forEach(d =>
    grilla.appendChild(el('div', { class: 'dow', text: d })));

  const desplazamiento = (primero.getDay() + 6) % 7;   /* la semana parte el lunes */
  const inicio = new Date(y, m, 1 - desplazamiento);
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    const clave = iso(d);
    const delMes = d.getMonth() === m;
    const evs = porDia[clave] || [];
    const celda = el('button', {
      class: 'dia' + (delMes ? '' : ' fuera') + (clave === hoy() ? ' hoy' : '') +
             (clave === diaElegido ? ' elegido' : ''),
      type: 'button', onclick: () => { diaElegido = clave; render(); }
    }, [el('span', { class: 'n', text: String(d.getDate()) })]);
    evs.slice(0, 3).forEach(e => celda.appendChild(el('span', {
      class: 'ev ' + e.tipo, text: (e.hora ? e.hora + ' ' : '') + recorta(e.titulo, 22) })));
    if (evs.length > 3) celda.appendChild(el('span', { class: 'n', text: `+${evs.length - 3}` }));
    if (evs.length) celda.appendChild(el('span', { class: 'punto-dia' },
      evs.slice(0, 6).map(e => el('i', { style: `background:${
        e.tipo === 'vencido' ? 'var(--critical)' : e.tipo === 'hito' ? 'var(--warning)' : 'var(--ramp-3)'}` }))));
    grilla.appendChild(celda);
  }

  raiz.appendChild(el('div', { class: 'card compacta' }, [barra, grilla,
    Graficos.leyenda([
      { etiqueta: 'Reunión', color: 'var(--track)' },
      { etiqueta: 'Hito', color: 'var(--warning)' },
      { etiqueta: 'Plazo de un paso', color: 'var(--ramp-3)' },
      { etiqueta: 'Plazo vencido', color: 'var(--critical)' }
    ])]));

  /* Día elegido */
  const delDia = (porDia[diaElegido] || []);
  const card = el('div', { class: 'card compacta' }, [
    el('h2', { text: diaElegido ? fechaCorta(diaElegido) : 'Elige un día' }),
    el('div', { class: 'sub', text: diaElegido ? `${delDia.length} cosas ese día` : 'Toca un día del calendario' })
  ]);
  delDia.forEach(e => card.appendChild(el('div', { class: 'evento' }, [
    el('div', { class: 'cuando' }, [el('b', { text: e.hora || '—' }),
      el('span', { text: e.tipo === 'reunion' ? 'reunión' : e.tipo === 'hito' ? 'hito' : 'plazo' })]),
    el('div', { class: 'qué' }, [
      el('div', { text: e.titulo }),
      el('div', { style: 'font-size:12px;color:var(--ink-muted)',
        text: [e.contexto, (e.gente || []).join(', ')].filter(Boolean).join(' · ') || '—' })
    ])
  ])));
  if (diaElegido) {
    const inTema = el('input', { type: 'text', placeholder: 'Nueva reunión ese día' });
    const inHora = el('input', { type: 'time', value: '18:00', style: 'max-width:120px' });
    const inMin = el('input', { type: 'number', value: 60, min: 15, step: 15, style: 'max-width:90px' });
    let elegidos = filtros.persona ? [filtros.persona] : [];

    const cajaGente = el('div', { class: 'meta' });
    const cajaAviso = el('div', {});
    const boton = el('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'Agendar' });

    const revisar = () => {
      const avisos = avisosReunion({ id: null, tema: inTema.value,
        inicio: `${diaElegido}T${inHora.value || '18:00'}`,
        duracion: Number(inMin.value) || 60, invitados: elegidos.join(', ') });
      cajaAviso.innerHTML = '';
      const caja = cajaAvisos(avisos);
      if (caja) cajaAviso.appendChild(caja);
      boton.textContent = avisos.length ? 'Agendar de todos modos' : 'Agendar';
    };

    const pintarGente = () => {
      cajaGente.innerHTML = '';
      if (!nombres().length) {
        cajaGente.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-muted)',
          text: 'Carga al equipo en la pestaña Equipo para avisar de los choques de horario.' }));
        return;
      }
      nombres().forEach(n => {
        const dentro = elegidos.includes(n);
        const persona = personaPorNombre(n);
        cajaGente.appendChild(el('button', {
          class: 'tag' + (dentro ? ' principal' : ''), type: 'button',
          title: 'Disponible: ' + resumenHorario(persona),
          text: (dentro ? '✓ ' : '+ ') + n,
          onclick: () => {
            elegidos = dentro ? elegidos.filter(x => x !== n) : [...elegidos, n];
            pintarGente(); revisar();
          } }));
      });
    };
    pintarGente();

    inHora.addEventListener('input', revisar);
    inMin.addEventListener('input', revisar);
    revisar();

    boton.addEventListener('click', () => {
      if (!inTema.value.trim()) { inTema.focus(); return; }
      Datos.guardar('agenda', { id: uid(), tema: inTema.value.trim(),
        inicio: `${diaElegido}T${inHora.value || '18:00'}`, duracion: Number(inMin.value) || 60,
        formato: 'Presencial', lugar: '', invitados: elegidos.join(', '),
        estado: 'Por agendar', proyecto: null });
      render();
    });

    card.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap' },
      [inTema, inHora, inMin]));
    card.appendChild(el('div', { style: 'margin-top:8px' }, cajaGente));
    card.appendChild(cajaAviso);
    card.appendChild(el('div', { style: 'margin-top:8px' }, boton));
  }
  raiz.appendChild(card);

  /* Reuniones: edición y sincronización */
  const reuniones = Datos.todo('agenda').slice()
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));
  const card2 = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Reuniones agendadas' }),
    el('div', { class: 'sub', text: `${reuniones.length} en total · la invitación sirve para Google Calendar` })
  ]);
  if (!reuniones.length) card2.appendChild(el('div', { class: 'empty', text: 'Nada agendado todavía.' }));
  reuniones.forEach(ev => {
    const c = (tipo, valor, nombre, extra) => {
      const i = el('input', Object.assign({ type: tipo, value: valor || '' }, extra || {}));
      i.addEventListener('change', () => { ev[nombre] = i.value; Datos.guardar('agenda', ev); render(); });
      return i;
    };
    card2.appendChild(el('div', { class: 'evento' }, [
      el('div', { class: 'cuando' }, [el('b', { text: ev.inicio ? fechaCorta(ev.inicio) : '—' }),
        el('span', { text: horaDe(ev.inicio) || 'sin hora' })]),
      el('div', { class: 'qué' }, [
        c('text', ev.tema, 'tema'),
        el('div', { class: 'campos' }, [
          el('label', { class: 'field' }, [el('span', { text: 'Cuándo' }), c('datetime-local', ev.inicio, 'inicio')]),
          el('label', { class: 'field' }, [el('span', { text: 'Minutos' }), c('number', ev.duracion || 60, 'duracion', { min: 15, step: 15 })]),
          el('label', { class: 'field' }, [el('span', { text: 'Formato' }),
            selector(SPT.listas.formato, ev.formato, v => { ev.formato = v; Datos.guardar('agenda', ev); }, null)]),
          el('label', { class: 'field' }, [el('span', { text: 'Lugar o enlace' }), c('text', ev.lugar, 'lugar')]),
          el('label', { class: 'field' }, [el('span', { text: 'Invitados' }), c('text', ev.invitados, 'invitados')])
        ]),
        cajaAvisos(avisosReunion(ev)),
        el('div', { class: 'toolbar', style: 'margin:8px 0 0' }, [
          el('a', { class: 'btn btn-sm btn-primary', href: enlaceGoogle(ev), target: '_blank',
            rel: 'noopener', text: 'Añadir a Google Calendar' }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Descargar invitación',
            title: 'Archivo .ics para Outlook u otros calendarios',
            onclick: () => descargar((ev.tema || 'reunion').replace(/\W+/g, '-') + '.ics',
              ics(ev), 'text/calendar;charset=utf-8') }),
          el('button', { class: 'x', type: 'button', text: '✕ eliminar',
            onclick: () => UI.borrarConDeshacer('agenda', { ...ev }, 'Reunión', render) })
        ])
      ])
    ]));
  });
  raiz.appendChild(card2);

  raiz.appendChild(el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Google Calendar' }),
    el('div', { class: 'sub', text: 'Cómo pasar esto a tu calendario' }),
    el('div', { class: 'note' }, [
      el('p', { text: 'Cada reunión tiene el botón "Añadir a Google Calendar": abre Google con la ' +
        'reunión ya escrita —tema, hora, lugar e invitados— y sólo hay que guardar. Funciona con ' +
        'cualquier cuenta, incluida la de la universidad, sin configurar nada.' }),
      el('p', { text: 'Para que los invitados lleguen por correo, cada persona necesita su correo ' +
        'cargado en la pestaña Equipo.' }),
      el('p', { text: 'La sincronización automática en los dos sentidos necesita la cuenta de ' +
        'servicio de Google conectada en el servidor. Mientras tanto, este botón hace el trabajo.' })
    ])
  ]));
}

function enlaceGoogle(ev) {
  const pad = n => String(n).padStart(2, '0');
  const sello = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T` +
    `${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const inicio = new Date(!ev.inicio ? Date.now()
    : (ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio));
  const fin = new Date(inicio.getTime() + (Number(ev.duracion) || 60) * 60000);

  const correos = String(ev.invitados || '').split(',').map(x => x.trim()).filter(Boolean)
    .map(nombre => {
      const persona = integrantes().find(i => i.nombre === nombre);
      return persona && persona.correo ? persona.correo : (nombre.includes('@') ? nombre : '');
    }).filter(Boolean);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.tema || 'Reunión',
    dates: `${sello(inicio)}/${sello(fin)}`,
    details: 'Creado desde el SPT · Secretaría de Participación' +
      (ev.invitados ? `\nInvitados: ${ev.invitados}` : ''),
    location: ev.lugar || ''
  });
  correos.forEach(c => params.append('add', c));
  return 'https://calendar.google.com/calendar/render?' + params.toString();
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
 * 8. Vista: Equipo
 * ------------------------------------------------------------------ */
function vistaEquipo(raiz) {
  const card = el('div', { class: 'card compacta' }, [
    el('h2', { text: 'Integrantes' }),
    el('div', { class: 'sub', text: 'Nombre, rol y correo: el correo es lo que usarán los recordatorios' })
  ]);

  const filas = integrantes().map(p => {
    const campoTxt = (valor, nombre, tipo, ph) => {
      const i = el('input', { type: tipo || 'text', value: valor || '', placeholder: ph || '' });
      i.addEventListener('change', () => { p[nombre] = i.value; Datos.guardar('integrantes', p); });
      return i;
    };
    return [campoTxt(p.nombre, 'nombre'), campoTxt(p.rol, 'rol', 'text', 'Rol en la secretaría'),
      campoTxt(p.correo, 'correo', 'email', 'nombre@ug.uchile.cl'),
      el('button', { class: 'btn btn-sm' + (personaHorario === p.id ? ' btn-primary' : ''),
        type: 'button', text: resumenHorario(p), 'data-horario': p.id,
        title: 'Editar horarios disponibles',
        onclick: () => { personaHorario = personaHorario === p.id ? null : p.id; render(); } }),
      el('button', { class: 'x', type: 'button', text: '✕', title: 'Quitar del equipo',
        onclick: () => UI.borrarConDeshacer('integrantes', { ...p }, 'Integrante', render) })];
  });
  card.appendChild(filas.length
    ? tablaDensa(['Nombre', 'Rol', 'Correo', 'Horarios', ''], filas)
    : el('div', { class: 'empty', text: 'Todavía no hay integrantes.' }));

  const nuevo = el('input', { type: 'text', placeholder: 'Nombre', style: 'max-width:220px' });
  const correo = el('input', { type: 'email', placeholder: 'Correo', style: 'max-width:240px' });
  const agregar = () => {
    if (!nuevo.value.trim()) return;
    Datos.guardar('integrantes', { id: uid(), nombre: nuevo.value.trim(), rol: '', correo: correo.value.trim() });
    nuevo.value = ''; correo.value = ''; render();
  };
  nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  correo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  card.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap' }, [
    nuevo, correo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
  ]));
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
  $('#filtros').style.display = (vista === 'equipo') ? 'none' : '';
  if (vista === 'tablero') vistaTablero(raiz);
  else if (vista === 'panel') vistaPanel(raiz);
  else if (vista === 'proyectos') vistaProyectos(raiz);
  else if (vista === 'calendario') vistaCalendario(raiz);
  else vistaEquipo(raiz);
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
  if (!window.UNARCHIVO) UI.botonTema($('#btn-tema'), render);

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
