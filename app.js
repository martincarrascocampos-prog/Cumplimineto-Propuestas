/* Conectómetro — seguimiento del cumplimiento del programa FECh 2026.
   Sin dependencias: los datos viven en localStorage y se exportan a JSON/CSV. */
(function () {
'use strict';

/* ------------------------------------------------------------------ *
 * 1. Reglas de negocio
 * ------------------------------------------------------------------ */
const CLAVE = 'conectometro/v2';
const UMBRALES = { media: 50, minimo: 70, ideal: 80, logro: 90 };

const ESTADOS = [
  { id: 'no_iniciada', txt: 'No iniciada', icono: '○', proy: 0.30, color: 'var(--ink-muted)' },
  { id: 'en_progreso', txt: 'En progreso', icono: '◐', proy: 0.60, color: 'var(--ramp-3)' },
  { id: 'en_riesgo',   txt: 'En riesgo',   icono: '⚠', proy: 0.20, color: 'var(--warning)' },
  { id: 'cumplida',    txt: 'Cumplida',    icono: '●', proy: 1.00, color: 'var(--good)' },
  { id: 'descartada',  txt: 'Descartada',  icono: '⊘', proy: 0,    color: 'var(--axis)' }
];

/* Escala ordinal de logro: el color es un paso de la rampa azul y siempre
   viaja acompañado de icono + etiqueta, nunca solo. */
const NIVELES = [
  { id: 'bajo',   txt: 'Bajo el 50%',    icono: '▼', desde: 0,               ramp: 'var(--ramp-1)', tono: 'critical' },
  { id: 'media',  txt: 'A medio camino', icono: '◐', desde: UMBRALES.media,  ramp: 'var(--ramp-2)', tono: 'warning'  },
  { id: 'minimo', txt: 'Mínimo',         icono: '◆', desde: UMBRALES.minimo, ramp: 'var(--ramp-3)', tono: 'warning'  },
  { id: 'ideal',  txt: 'Ideal',          icono: '▲', desde: UMBRALES.ideal,  ramp: 'var(--ramp-4)', tono: 'good'     },
  { id: 'logro',  txt: 'Logro',          icono: '★', desde: UMBRALES.logro,  ramp: 'var(--ramp-5)', tono: 'good'     }
];

const PALETA = [
  ['#2a78d6', '#3987e5'], ['#eb6834', '#d95926'], ['#1baf7a', '#199e70'], ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'], ['#008300', '#008300'], ['#4a3aa7', '#9085e9'], ['#e34948', '#e66767']
];

const estadoDe = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
const nivelDe = p => NIVELES.slice().reverse().find(n => p >= n.desde) || NIVELES[0];
const equipoDe = id => estado.equipos.find(e => e.id === id) || null;
const ejeDe = id => estado.ejes.find(e => e.id === id) || null;
const oscuro = () => document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches;
const colorEquipo = eq => {
  const par = PALETA[((eq ? eq.color : 1) - 1) % PALETA.length];
  return oscuro() ? par[1] : par[0];
};

/* ------------------------------------------------------------------ *
 * 2. Estado y persistencia
 * ------------------------------------------------------------------ */
let estado = null;
let filtros = { equipo: '', eje: '', estado: '', texto: '' };
let vista = 'panel';
let perfil = PERFILES[0];
let redibujables = [];

function inicial() {
  return {
    version: 2,
    actualizado: new Date().toISOString(),
    ejes: EJES.map(e => ({ ...e })),
    equipos: EQUIPOS.map(e => ({ ...e })),
    propuestas: PROPUESTAS_BASE.map(p => ({
      c: p[0], eje: p[1], sub: p[2], t: p[3], eq: p[4], d: p[5],
      estado: 'no_iniciada', avance: 0, fecha: '', etapas: [], obs: []
    }))
  };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const d = JSON.parse(crudo);
      if (d && Array.isArray(d.propuestas) && d.propuestas.length) return migrar(d);
    }
  } catch (e) { /* almacenamiento bloqueado: seguimos en memoria */ }
  return inicial();
}

/* Completa lo que falte en datos guardados o importados de versiones previas. */
function migrar(d) {
  const texto = {};
  PROPUESTAS_BASE.forEach(p => { texto[p[0]] = p; });
  d.ejes = (d.ejes && d.ejes.length) ? d.ejes : EJES.map(e => ({ ...e }));
  d.equipos = (d.equipos && d.equipos.length) ? d.equipos : EQUIPOS.map(e => ({ ...e }));
  d.propuestas.forEach(p => {
    const base = texto[p.c];
    if (base && !p.d) { p.d = base[5]; p.sub = p.sub || base[2]; }
    if (base && !equipoDeLista(d.equipos, p.eq)) p.eq = base[4];
    if (!Array.isArray(p.etapas)) p.etapas = [];
    if (!Array.isArray(p.obs)) p.obs = [];
    delete p.resp;
    delete p.nota;
  });
  return d;
}
const equipoDeLista = (lista, id) => lista.some(e => e.id === id);

function guardar() {
  estado.actualizado = new Date().toISOString();
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); }
  catch (e) { /* sin persistencia: el prototipo sigue en memoria */ }
}

/* ------------------------------------------------------------------ *
 * 3. Cálculos
 * ------------------------------------------------------------------ */
const vigentes = lista => lista.filter(p => p.estado !== 'descartada');

/* Si la propuesta está subdividida en etapas, el avance lo mandan las etapas. */
function avanceReal(p) {
  if (p.estado === 'cumplida') return 100;
  if (p.etapas && p.etapas.length) {
    const ok = p.etapas.filter(e => e.ok).length;
    return Math.round((ok / p.etapas.length) * 100);
  }
  return Math.max(0, Math.min(100, Number(p.avance) || 0));
}
const avanceProyectado = p => {
  const a = avanceReal(p);
  return Math.round(a + estadoDe(p.estado).proy * (100 - a));
};

function resumen(lista) {
  const v = vigentes(lista);
  const n = v.length;
  const suma = f => v.reduce((acc, p) => acc + f(p), 0);
  const cuenta = id => v.filter(p => p.estado === id).length;
  return {
    total: lista.length,
    vigentes: n,
    descartadas: lista.length - n,
    cumplimiento: n ? Math.round(suma(avanceReal) / n * 10) / 10 : 0,
    proyeccion: n ? Math.round(suma(avanceProyectado) / n * 10) / 10 : 0,
    cumplidas: cuenta('cumplida'),
    enProgreso: cuenta('en_progreso'),
    enRiesgo: cuenta('en_riesgo'),
    noIniciadas: cuenta('no_iniciada'),
    sobreMedia: v.filter(p => avanceReal(p) >= UMBRALES.media).length,
    conEtapas: v.filter(p => p.etapas && p.etapas.length).length
  };
}

function filtradas() {
  const t = filtros.texto.trim().toLowerCase();
  return estado.propuestas.filter(p =>
    (!filtros.equipo || p.eq === filtros.equipo) &&
    (!filtros.eje || String(p.eje) === filtros.eje) &&
    (!filtros.estado || p.estado === filtros.estado) &&
    (!t || (p.c + ' ' + p.t + ' ' + p.sub + ' ' + (p.d || '')).toLowerCase().includes(t))
  );
}

const porEquipo = lista => estado.equipos.map(eq => ({
  clave: eq.id, nombre: eq.nombre, corto: eq.corto || eq.nombre,
  color: colorEquipo(eq), ...resumen(lista.filter(p => p.eq === eq.id))
})).filter(r => r.total > 0);

const porEje = lista => estado.ejes.map(ej => ({
  clave: String(ej.id), nombre: `${ej.id}. ${ej.nombre}`, corto: `${ej.id}. ${ej.corto || ej.nombre}`,
  ...resumen(lista.filter(p => p.eje === ej.id))
})).filter(r => r.total > 0);

/* ------------------------------------------------------------------ *
 * 4. Utilidades de render
 * ------------------------------------------------------------------ */
const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, hijos = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  }
  (Array.isArray(hijos) ? hijos : [hijos]).forEach(h => h && n.appendChild(h));
  return n;
};
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  return n;
};
const pct = v => `${Math.round(v)}%`;
const recorta = (t, max) => (t.length > max ? t.slice(0, max - 1) + '…' : t);
const hoy = () => new Date().toISOString().slice(0, 10);

/* El texto del programa trae los párrafos separados por \n. */
const parrafos = (texto, clase) => el('div', { class: clase || '' },
  String(texto || '').split('\n').filter(x => x.trim()).map(t => el('p', { text: t })));

function chipNivel(valor) {
  const n = nivelDe(valor);
  return el('span', { class: `chip ${n.tono}` }, [
    el('i', { text: n.icono, 'aria-hidden': 'true' }), document.createTextNode(n.txt)
  ]);
}
function chipEstado(id) {
  const e = estadoDe(id);
  const tono = id === 'cumplida' ? 'good' : id === 'en_riesgo' ? 'warning' : 'neutral';
  return el('span', { class: `chip ${tono}` }, [
    el('i', { text: e.icono, 'aria-hidden': 'true' }), document.createTextNode(e.txt)
  ]);
}

const tt = $('#tt');
function mostrarTT(ev, titulo, filas) {
  tt.innerHTML = '';
  tt.appendChild(el('b', { text: titulo }));
  filas.forEach(f => tt.appendChild(el('div', {}, [
    el('span', { text: f[0] + ': ' }), document.createTextNode(f[1])
  ])));
  tt.hidden = false;
  const r = tt.getBoundingClientRect();
  tt.style.left = Math.min(ev.clientX + 14, innerWidth - r.width - 8) + 'px';
  tt.style.top = Math.max(8, ev.clientY - r.height - 12) + 'px';
}
const ocultarTT = () => { tt.hidden = true; };
addEventListener('scroll', ocultarTT, true);

/* ------------------------------------------------------------------ *
 * 5. Gráficos
 * ------------------------------------------------------------------ */
const LIMITES = [UMBRALES.media, UMBRALES.minimo, UMBRALES.ideal, UMBRALES.logro];

function barraPath(x, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w));
  return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
}

function graficoCumplimiento(datos, ancho) {
  const filaH = 34, barraH = 16, topo = 26, base = 8;
  const anchoEtiq = Math.max(110, Math.min(220, Math.round(ancho * 0.34)));
  const x0 = anchoEtiq + 8;
  const escalaW = Math.max(60, ancho - x0 - 46 - 6);
  const alto = topo + datos.length * filaH + base;
  const svg = svgEl('svg', { class: 'chart', width: ancho, height: alto,
    viewBox: `0 0 ${ancho} ${alto}`, role: 'img',
    'aria-label': 'Cumplimiento por categoría con umbrales de 50, 70, 80 y 90 por ciento' });
  const X = v => x0 + (v / 100) * escalaW;
  const cabenEtiquetas = escalaW * 0.10 >= 26;

  LIMITES.forEach((u, i) => {
    svg.appendChild(svgEl('line', { x1: X(u), x2: X(u), y1: topo - 10, y2: alto - base + 2,
      stroke: 'var(--grid)', 'stroke-width': 1 }));
    if (cabenEtiquetas) svg.appendChild(Object.assign(svgEl('text', {
      x: X(u), y: topo - 14, 'text-anchor': i === LIMITES.length - 1 ? 'end' : 'middle',
      fill: 'var(--ink-muted)', 'font-size': 10.5 }), { textContent: u + '%' }));
  });
  svg.appendChild(svgEl('line', { x1: x0, x2: x0, y1: topo - 10, y2: alto - base + 2,
    stroke: 'var(--axis)', 'stroke-width': 1 }));

  datos.forEach((d, i) => {
    const y = topo + i * filaH, yb = y + (filaH - barraH) / 2;
    const nivel = nivelDe(d.cumplimiento);

    svg.appendChild(Object.assign(svgEl('text', { x: anchoEtiq, y: y + filaH / 2 + 4,
      'text-anchor': 'end', fill: 'var(--ink-2)', 'font-size': 12.5 }),
      { textContent: recorta(d.corto || d.nombre, Math.floor(anchoEtiq / 6.6)) }));

    svg.appendChild(svgEl('rect', { x: x0, y: yb, width: escalaW, height: barraH, rx: 4, fill: 'var(--track)' }));
    const w = (d.cumplimiento / 100) * escalaW;
    if (w > 0.5) svg.appendChild(svgEl('path', { d: barraPath(x0, yb, w, barraH), fill: nivel.ramp }));

    const xp = X(d.proyeccion);
    svg.appendChild(svgEl('line', { x1: xp, x2: xp, y1: yb - 4, y2: yb + barraH + 4,
      stroke: 'var(--ink-2)', 'stroke-width': 2, 'stroke-dasharray': '3 2' }));

    svg.appendChild(Object.assign(svgEl('text', { x: ancho - 4, y: y + filaH / 2 + 4,
      'text-anchor': 'end', fill: 'var(--ink)', 'font-size': 12.5, 'font-weight': 600 }),
      { textContent: pct(d.cumplimiento) }));

    const hit = svgEl('rect', { x: 0, y: y, width: ancho, height: filaH, fill: 'transparent', tabindex: 0 });
    const info = ev => mostrarTT(ev, d.nombre, [
      ['Cumplimiento', pct(d.cumplimiento) + ' · ' + nivel.txt],
      ['Proyección al cierre', pct(d.proyeccion)],
      ['Propuestas', `${d.cumplidas} cumplidas de ${d.vigentes}`],
      ['Sobre el 50%', `${d.sobreMedia} de ${d.vigentes}`],
      ['En riesgo', String(d.enRiesgo)]
    ]);
    hit.addEventListener('pointermove', info);
    hit.addEventListener('pointerleave', ocultarTT);
    hit.addEventListener('focus', () => {
      const r = hit.getBoundingClientRect();
      info({ clientX: r.x + 60, clientY: r.y + 30 });
    });
    hit.addEventListener('blur', ocultarTT);
    svg.appendChild(hit);
  });
  return svg;
}

function graficoEstados(r, ancho) {
  const h = 30, alto = h + 4;
  const svg = svgEl('svg', { class: 'chart', width: ancho, height: alto,
    viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Composición de las propuestas por estado' });
  const segmentos = [
    { id: 'cumplida', n: r.cumplidas }, { id: 'en_progreso', n: r.enProgreso },
    { id: 'en_riesgo', n: r.enRiesgo }, { id: 'no_iniciada', n: r.noIniciadas }
  ].filter(s => s.n > 0);
  const total = segmentos.reduce((a, s) => a + s.n, 0) || 1;
  let x = 0;
  segmentos.forEach((s, i) => {
    const w = Math.max(0, (s.n / total) * ancho - (i < segmentos.length - 1 ? 2 : 0));
    const e = estadoDe(s.id);
    const g = svgEl('g', { tabindex: 0 });
    g.appendChild(svgEl('rect', { x, y: 2, width: w, height: h, rx: 4, fill: e.color }));
    if (w > 34) g.appendChild(Object.assign(svgEl('text', { x: x + w / 2, y: h / 2 + 7,
      'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600,
      fill: (s.id === 'no_iniciada' || s.id === 'en_riesgo') ? '#0b0b0b' : '#ffffff' }),
      { textContent: String(s.n) }));
    const info = ev => mostrarTT(ev, e.txt, [['Propuestas', String(s.n)], ['Del total vigente', pct(s.n / total * 100)]]);
    g.addEventListener('pointermove', info);
    g.addEventListener('pointerleave', ocultarTT);
    g.addEventListener('blur', ocultarTT);
    svg.appendChild(g);
    x += w + 2;
  });
  return svg;
}

const leyenda = items => el('div', { class: 'legend' }, items.map(it =>
  el('span', {}, [
    el('i', { class: it.linea ? 'key-line' : '', style: it.linea ? '' : `background:${it.color}` }),
    document.createTextNode(it.txt)
  ])));

function tarjetaGrafico(titulo, sub, dibujar, tabla, leyendaItems) {
  const card = el('div', { class: 'card' });
  const btn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Ver tabla' });
  card.appendChild(el('div', { class: 'toolbar' }, [
    el('div', {}, [el('h2', { text: titulo }), el('div', { class: 'sub', text: sub })]),
    el('span', { class: 'count' }), btn
  ]));
  const cont = el('div', {});
  card.appendChild(cont);
  let modoTabla = false;
  const pintar = () => {
    cont.innerHTML = '';
    if (modoTabla) { cont.appendChild(tabla()); return; }
    cont.appendChild(dibujar(Math.max(280, cont.clientWidth || card.clientWidth - 32)));
    if (leyendaItems) cont.appendChild(leyenda(leyendaItems));
  };
  btn.addEventListener('click', () => {
    modoTabla = !modoTabla;
    btn.textContent = modoTabla ? 'Ver gráfico' : 'Ver tabla';
    pintar();
  });
  requestAnimationFrame(pintar);
  redibujables.push(() => { if (!modoTabla) pintar(); });
  return card;
}

function tablaResumen(datos, etiquetaCol) {
  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: etiquetaCol }), el('th', { class: 'num', text: 'Cumplimiento' }),
    el('th', { class: 'num', text: 'Proyección' }), el('th', { text: 'Nivel' }),
    el('th', { class: 'num', text: 'Sobre 50%' }), el('th', { class: 'num', text: 'Cumplidas' }),
    el('th', { class: 'num', text: 'Vigentes' })
  ])));
  const tb = el('tbody');
  datos.forEach(d => tb.appendChild(el('tr', {}, [
    el('td', { text: d.nombre }),
    el('td', { class: 'num', text: pct(d.cumplimiento) }),
    el('td', { class: 'num', text: pct(d.proyeccion) }),
    el('td', {}, chipNivel(d.cumplimiento)),
    el('td', { class: 'num', text: String(d.sobreMedia) }),
    el('td', { class: 'num', text: String(d.cumplidas) }),
    el('td', { class: 'num', text: String(d.vigentes) })
  ])));
  t.appendChild(tb);
  return el('div', { class: 'tablewrap' }, t);
}

/* ------------------------------------------------------------------ *
 * 6. Ficha de la propuesta (panel lateral)
 * ------------------------------------------------------------------ */
const drawer = $('#drawer');
let propuestaAbierta = null;

function cerrarDrawer() {
  drawer.hidden = true;
  propuestaAbierta = null;
  render();
}
drawer.addEventListener('click', e => { if (e.target.dataset.cerrar !== undefined) cerrarDrawer(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) cerrarDrawer(); });

function abrirPropuesta(p) {
  propuestaAbierta = p;
  const editable = perfil.rol !== 'lector';
  const eje = ejeDe(p.eje);
  $('#drawer-cod').textContent = `${p.c} · ${eje ? eje.nombre : ''} · ${p.sub}`;
  $('#drawer-t').textContent = p.t;
  const c = $('#drawer-c');
  c.innerHTML = '';

  /* Texto literal del programa */
  c.appendChild(el('div', { class: 'bloque' }, [
    el('h3', { text: 'Lo que dice el programa' }),
    parrafos(p.d || 'Sin texto asociado.', 'literal')
  ]));

  /* Seguimiento */
  const selEquipo = el('select', { disabled: editable ? null : 'disabled' });
  estado.equipos.forEach(e => selEquipo.appendChild(el('option', { value: e.id, text: e.nombre })));
  selEquipo.value = p.eq || '';
  selEquipo.addEventListener('change', () => { p.eq = selEquipo.value; guardar(); });

  const selEstado = el('select', { disabled: editable ? null : 'disabled' });
  ESTADOS.forEach(e => selEstado.appendChild(el('option', { value: e.id, text: e.txt })));
  selEstado.value = p.estado;

  const inAvance = el('input', { type: 'number', min: 0, max: 100, step: 5, value: avanceReal(p),
    disabled: (editable && !(p.etapas && p.etapas.length)) ? null : 'disabled' });

  const inFecha = el('input', { type: 'date', value: p.fecha, disabled: editable ? null : 'disabled' });
  inFecha.addEventListener('change', () => { p.fecha = inFecha.value; guardar(); });

  const resumenAvance = el('div', { class: 'note' });
  const refrescar = () => {
    const a = avanceReal(p);
    const conEtapas = !!(p.etapas && p.etapas.length);
    inAvance.value = a;
    inAvance.disabled = !editable || conEtapas;
    inAvance.title = conEtapas ? 'El avance lo calculan las etapas' : '';
    selEstado.value = p.estado;
    resumenAvance.innerHTML = '';
    resumenAvance.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' }, [
      el('strong', { text: pct(a) + ' de avance' }), chipNivel(a),
      el('span', { text: `proyección ${pct(avanceProyectado(p))}` })
    ]));
    if (p.etapas && p.etapas.length) resumenAvance.appendChild(el('div', {
      style: 'margin-top:6px', text: `El avance lo calculan las etapas: ${p.etapas.filter(e => e.ok).length} de ${p.etapas.length} completadas.` }));
  };

  selEstado.addEventListener('change', () => {
    p.estado = selEstado.value;
    if (p.estado === 'cumplida' && !(p.etapas && p.etapas.length)) p.avance = 100;
    if (p.estado === 'no_iniciada' && !(p.etapas && p.etapas.length)) p.avance = 0;
    guardar(); refrescar();
  });
  inAvance.addEventListener('change', () => {
    const v = Math.max(0, Math.min(100, Number(inAvance.value) || 0));
    p.avance = v;
    if (v === 100 && p.estado !== 'descartada') p.estado = 'cumplida';
    else if (v > 0 && p.estado === 'no_iniciada') p.estado = 'en_progreso';
    guardar(); refrescar();
  });

  c.appendChild(el('div', { class: 'bloque' }, [
    el('h3', { text: 'Seguimiento' }),
    el('div', { class: 'grid2', style: 'gap:10px' }, [
      el('label', { class: 'field' }, [el('span', { text: 'Equipo responsable' }), selEquipo]),
      el('label', { class: 'field' }, [el('span', { text: 'Estado' }), selEstado]),
      el('label', { class: 'field' }, [el('span', { text: 'Avance %' }), inAvance]),
      el('label', { class: 'field' }, [el('span', { text: 'Plazo comprometido' }), inFecha])
    ]),
    el('div', { style: 'margin-top:10px' }, resumenAvance)
  ]));

  /* Etapas */
  const listaEtapas = el('div', {});
  const pintarEtapas = () => {
    listaEtapas.innerHTML = '';
    if (!p.etapas.length) {
      listaEtapas.appendChild(el('div', { class: 'mini', style: 'color:var(--ink-muted);font-size:13px',
        text: 'Sin etapas. Si divides la propuesta en etapas, el avance se calcula solo.' }));
      return;
    }
    p.etapas.forEach((et, i) => {
      const chk = el('input', { type: 'checkbox', disabled: editable ? null : 'disabled' });
      chk.checked = !!et.ok;
      chk.addEventListener('change', () => {
        et.ok = chk.checked;
        const hechas = p.etapas.filter(x => x.ok).length;
        if (hechas === p.etapas.length && p.estado !== 'descartada') p.estado = 'cumplida';
        else if (hechas > 0 && (p.estado === 'no_iniciada' || p.estado === 'cumplida')) p.estado = 'en_progreso';
        else if (hechas === 0 && p.estado === 'cumplida') p.estado = 'en_progreso';
        guardar(); pintarEtapas(); refrescar();
      });
      const fila = el('div', { class: 'etapa' + (et.ok ? ' lista' : '') }, [
        chk, el('span', { text: et.t })
      ]);
      if (editable) fila.appendChild(el('button', { class: 'x', type: 'button', title: 'Eliminar etapa',
        text: '✕', onclick: () => { p.etapas.splice(i, 1); guardar(); pintarEtapas(); refrescar(); } }));
      listaEtapas.appendChild(fila);
    });
  };
  pintarEtapas();

  const bloqueEtapas = el('div', { class: 'bloque' }, [
    el('h3', { text: 'Etapas de cumplimiento' }), listaEtapas
  ]);
  if (editable) {
    const inEtapa = el('input', { type: 'text', placeholder: 'Nueva etapa (ej.: reunión con la VAEC)' });
    const agregar = () => {
      const t = inEtapa.value.trim();
      if (!t) return;
      p.etapas.push({ t, ok: false });
      inEtapa.value = '';
      guardar(); pintarEtapas(); refrescar();
    };
    inEtapa.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    bloqueEtapas.appendChild(el('div', { class: 'fila', style: 'margin-top:10px' }, [
      inEtapa, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
    ]));
  }
  c.appendChild(bloqueEtapas);

  /* Observaciones */
  const listaObs = el('div', {});
  const pintarObs = () => {
    listaObs.innerHTML = '';
    if (!p.obs.length) {
      listaObs.appendChild(el('div', { style: 'color:var(--ink-muted);font-size:13px',
        text: 'Sin observaciones registradas.' }));
      return;
    }
    p.obs.slice().reverse().forEach(o => {
      const i = p.obs.indexOf(o);
      const bloque = el('div', { class: 'obs' }, [
        el('div', { style: 'flex:1' }, [el('time', { text: o.f }), el('div', { text: o.t })])
      ]);
      if (editable) bloque.appendChild(el('button', { class: 'x', type: 'button', text: '✕',
        title: 'Eliminar observación',
        onclick: () => { p.obs.splice(i, 1); guardar(); pintarObs(); } }));
      listaObs.appendChild(bloque);
    });
  };
  pintarObs();

  const bloqueObs = el('div', { class: 'bloque' }, [
    el('h3', { text: 'Observaciones' }), listaObs
  ]);
  if (editable) {
    const ta = el('textarea', { placeholder: 'Qué pasó, con quién se habló, qué quedó pendiente…' });
    bloqueObs.appendChild(el('div', { style: 'margin-top:10px' }, ta));
    bloqueObs.appendChild(el('div', { class: 'fila', style: 'margin-top:8px' }, [
      el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar observación', onclick: () => {
        const t = ta.value.trim();
        if (!t) return;
        p.obs.push({ f: hoy(), t });
        ta.value = '';
        guardar(); pintarObs();
      } })
    ]));
  }
  c.appendChild(bloqueObs);

  refrescar();
  drawer.hidden = false;
  drawer.querySelector('.drawer-body').scrollTop = 0;
}

/* ------------------------------------------------------------------ *
 * 7. Vista: Panel
 * ------------------------------------------------------------------ */
function vistaPanel(raiz) {
  const lista = filtradas();
  const r = resumen(lista);
  const nivel = nivelDe(r.cumplimiento);

  const barra = el('div', { class: 'meter' }, el('div', { class: 'meter-fill',
    style: `width:${r.cumplimiento}%; background:${nivel.ramp}` }));
  LIMITES.forEach(u => barra.appendChild(el('div', { class: 'meter-line', style: `left:${u}%` })));
  barra.appendChild(el('div', { class: 'meter-proj', style: `left:calc(${r.proyeccion}% - 1px)`,
    title: `Proyección al cierre: ${pct(r.proyeccion)}` }));

  const marcas = el('div', { class: 'meter-marks' });
  LIMITES.forEach(u => marcas.appendChild(el('div', { class: 'meter-mark', style: `left:${u}%` },
    [el('i', {}), document.createTextNode(`${u}%`)])));

  raiz.appendChild(el('div', { class: 'card' }, el('div', { class: 'hero' }, [
    el('div', { class: 'hero-figure' }, [
      el('div', { class: 'hero-value', text: r.cumplimiento.toFixed(1).replace('.0', '') + '%' }),
      el('div', { class: 'hero-label', text: 'Cumplimiento del programa' }),
      el('div', { style: 'margin-top:10px' }, chipNivel(r.cumplimiento))
    ]),
    el('div', { class: 'hero-meta' }, [
      barra, marcas,
      leyenda([
        { txt: 'Cumplimiento actual', color: nivel.ramp },
        { txt: 'Proyección al cierre', linea: true },
        { txt: 'Umbrales: 50 media · 70 mínimo · 80 ideal · 90 logro', color: 'var(--axis)' }
      ]),
      el('div', { class: 'note', style: 'margin-top:12px', text:
        `Proyección al cierre ${pct(r.proyeccion)} · ${r.cumplidas} de ${r.vigentes} propuestas cumplidas · ` +
        `${r.sobreMedia} pasaron el 50%` + (r.descartadas ? ` · ${r.descartadas} descartadas fuera del cálculo` : '') })
    ])
  ])));

  const kpis = el('div', { class: 'kpis' });
  [['Propuestas vigentes', r.vigentes], ['Cumplidas', r.cumplidas], ['Sobre el 50%', r.sobreMedia],
   ['En progreso', r.enProgreso], ['En riesgo', r.enRiesgo], ['No iniciadas', r.noIniciadas]]
    .forEach(([txt, v]) => kpis.appendChild(el('div', { class: 'kpi' }, [
      el('b', { text: String(v) }), el('span', { text: txt })])));
  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Estado general' }),
    el('div', { class: 'sub', text: 'Sobre las propuestas que pasan el filtro activo' }), kpis
  ]));

  const cardEstados = el('div', { class: 'card' }, [
    el('h2', { text: 'Composición por estado' }),
    el('div', { class: 'sub', text: 'Reparto de las propuestas vigentes' })
  ]);
  const contEstados = el('div', {});
  cardEstados.appendChild(contEstados);
  const pintarEstados = () => {
    contEstados.innerHTML = '';
    contEstados.appendChild(graficoEstados(r, Math.max(260, contEstados.clientWidth || 600)));
    contEstados.appendChild(leyenda([
      { txt: `Cumplida (${r.cumplidas})`, color: 'var(--good)' },
      { txt: `En progreso (${r.enProgreso})`, color: 'var(--ramp-3)' },
      { txt: `En riesgo (${r.enRiesgo})`, color: 'var(--warning)' },
      { txt: `No iniciada (${r.noIniciadas})`, color: 'var(--ink-muted)' }
    ]));
  };
  requestAnimationFrame(pintarEstados);
  redibujables.push(pintarEstados);
  raiz.appendChild(cardEstados);

  const datosEq = porEquipo(lista).sort((a, b) => b.cumplimiento - a.cumplimiento);
  const datosEje = porEje(lista).sort((a, b) => b.cumplimiento - a.cumplimiento);
  const leyendaBarras = [
    { txt: 'Cumplimiento actual', color: 'var(--ramp-3)' },
    { txt: 'Proyección al cierre', linea: true },
    { txt: 'Umbrales 50 · 70 · 80 · 90', color: 'var(--grid)' }
  ];
  if (datosEq.length) raiz.appendChild(tarjetaGrafico('Cumplimiento por equipo',
    'Cada barra contra los umbrales 50 / 70 / 80 / 90',
    w => graficoCumplimiento(datosEq, w), () => tablaResumen(datosEq, 'Equipo'), leyendaBarras));
  if (datosEje.length) raiz.appendChild(tarjetaGrafico('Cumplimiento por eje programático',
    'Desglose de los 10 ejes del programa',
    w => graficoCumplimiento(datosEje, w), () => tablaResumen(datosEje, 'Eje'), leyendaBarras));

  /* Alertas */
  const alertas = vigentes(lista).filter(p =>
    p.estado === 'en_riesgo' || (p.fecha && p.fecha < hoy() && p.estado !== 'cumplida'));
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Requieren atención' }),
    el('div', { class: 'sub', text: 'Propuestas en riesgo o con plazo vencido' })
  ]);
  if (!alertas.length) card.appendChild(el('div', { class: 'empty', text: 'Sin alertas con el filtro actual.' }));
  else {
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: 'Código' }), el('th', { text: 'Propuesta' }), el('th', { text: 'Equipo' }),
      el('th', { text: 'Estado' }), el('th', { text: 'Plazo' }), el('th', { class: 'num', text: 'Avance' })
    ])));
    const tb = el('tbody');
    alertas.slice(0, 15).forEach(p => {
      const eq = equipoDe(p.eq);
      tb.appendChild(el('tr', {}, [
        el('td', { text: p.c }),
        el('td', {}, el('button', { class: 'linktitle', type: 'button', text: p.t, onclick: () => abrirPropuesta(p) })),
        el('td', { text: eq ? eq.nombre : '—' }),
        el('td', {}, chipEstado(p.estado)),
        el('td', { text: p.fecha || '—' }),
        el('td', { class: 'num', text: pct(avanceReal(p)) })
      ]));
    });
    t.appendChild(tb);
    card.appendChild(el('div', { class: 'tablewrap' }, t));
  }
  raiz.appendChild(card);

  /* Qué es esto */
  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Qué es el Conectómetro' }),
    el('div', { class: 'sub', text: 'Cómo funciona esta aplicación' }),
    el('div', { class: 'note' }, [
      el('p', { text:
        'El Conectómetro toma las 102 propuestas del programa "Conectemos la Chile" (FECh 2026), las reparte ' +
        'entre los equipos de la Mesa y mide cuánto de lo comprometido se está cumpliendo. Nadie tiene que ' +
        'acordarse de todo: el programa queda escrito, repartido y medido en un solo lugar.' }),
      el('p', { text:
        'Cada propuesta tiene un equipo responsable, un estado y un avance. Se puede dividir en etapas ' +
        '(y entonces el avance lo calculan las etapas completadas) y se le pueden ir agregando observaciones ' +
        'con fecha, para dejar registro de gestiones, reuniones y trabas.' }),
      el('p', { text:
        'El número grande es el promedio de avance de las propuestas vigentes. La línea punteada es la ' +
        'proyección al cierre: cuánto llegaría a cumplirse si cada propuesta avanza según su estado actual.' }),
      el('p', { text:
        'Las cuatro marcas del medidor son las metas: 50% a medio camino, 70% mínimo, 80% ideal y 90% logro. ' +
        'Los mismos umbrales aplican a cada equipo y a cada eje, para ver quién va quedando atrás.' }),
      el('p', { text:
        'En la pestaña Programa está el documento completo, con el texto tal cual fue escrito; en Datos se ' +
        'exporta todo a JSON o a Excel.' })
    ])
  ]));
}

/* ------------------------------------------------------------------ *
 * 8. Vista: Propuestas
 * ------------------------------------------------------------------ */
function vistaPropuestas(raiz) {
  const lista = filtradas();
  const editable = perfil.rol !== 'lector';
  const card = el('div', { class: 'card' });
  const r = resumen(lista);

  card.appendChild(el('div', { class: 'toolbar' }, [
    el('div', {}, [
      el('h2', { text: 'Propuestas del programa' }),
      el('div', { class: 'sub', text: 'Toca el título para ver el texto del programa, las etapas y las observaciones.' })
    ]),
    el('span', { class: 'count', text: `${lista.length} de ${estado.propuestas.length} · ${pct(r.cumplimiento)} de cumplimiento` })
  ]));
  if (!editable) card.appendChild(el('div', { class: 'note', text: 'Perfil de solo lectura: los campos están bloqueados.' }));

  if (!lista.length) {
    card.appendChild(el('div', { class: 'empty', text: 'Ninguna propuesta coincide con el filtro.' }));
    raiz.appendChild(card);
    return;
  }

  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Cód.' }), el('th', { text: 'Propuesta' }), el('th', { text: 'Equipo' }),
    el('th', { text: 'Estado' }), el('th', { class: 'num', text: 'Avance' }), el('th', { text: 'Plazo' })
  ])));
  const tb = el('tbody');

  lista.forEach(p => {
    const conEtapas = p.etapas && p.etapas.length;
    const punto = el('span', { class: 'dot', style: `background:${colorEquipo(equipoDe(p.eq))}` });

    const selEquipo = el('select', { disabled: editable ? null : 'disabled' });
    selEquipo.appendChild(el('option', { value: '', text: 'Sin asignar' }));
    estado.equipos.forEach(e => selEquipo.appendChild(el('option', { value: e.id, text: e.nombre })));
    selEquipo.value = p.eq || '';
    selEquipo.addEventListener('change', () => {
      p.eq = selEquipo.value; guardar();
      punto.style.background = colorEquipo(equipoDe(p.eq));
    });

    const selEstado = el('select', { class: 'w-estado', disabled: editable ? null : 'disabled' });
    ESTADOS.forEach(e => selEstado.appendChild(el('option', { value: e.id, text: e.txt })));
    selEstado.value = p.estado;

    const inAvance = el('input', { type: 'number', min: 0, max: 100, step: 5, value: avanceReal(p),
      class: 'w-avance', title: conEtapas ? 'El avance lo calculan las etapas' : '',
      disabled: (editable && !conEtapas) ? null : 'disabled' });

    selEstado.addEventListener('change', () => {
      p.estado = selEstado.value;
      if (p.estado === 'cumplida' && !conEtapas) p.avance = 100;
      if (p.estado === 'no_iniciada' && !conEtapas) p.avance = 0;
      guardar();
      inAvance.value = avanceReal(p);
    });
    inAvance.addEventListener('change', () => {
      const v = Math.max(0, Math.min(100, Number(inAvance.value) || 0));
      p.avance = v;
      if (v === 100 && p.estado !== 'descartada') p.estado = 'cumplida';
      else if (v > 0 && p.estado === 'no_iniciada') p.estado = 'en_progreso';
      guardar();
      inAvance.value = avanceReal(p);
      selEstado.value = p.estado;
    });

    const inFecha = el('input', { type: 'date', value: p.fecha, disabled: editable ? null : 'disabled' });
    inFecha.addEventListener('change', () => { p.fecha = inFecha.value; guardar(); });

    const marcas = [];
    if (conEtapas) marcas.push(`${p.etapas.filter(e => e.ok).length}/${p.etapas.length} etapas`);
    if (p.obs && p.obs.length) marcas.push(`${p.obs.length} obs.`);

    tb.appendChild(el('tr', {}, [
      el('td', { text: p.c }),
      el('td', {}, [
        el('button', { class: 'linktitle', type: 'button', text: p.t, onclick: () => abrirPropuesta(p) }),
        el('div', { class: 'mini' }, [punto,
          document.createTextNode(' ' + p.sub + (marcas.length ? ' · ' + marcas.join(' · ') : ''))])
      ]),
      el('td', {}, selEquipo),
      el('td', {}, selEstado),
      el('td', { class: 'num' }, inAvance),
      el('td', {}, inFecha)
    ]));
  });

  t.appendChild(tb);
  card.appendChild(el('div', { class: 'tablewrap' }, t));
  raiz.appendChild(card);
}

/* ------------------------------------------------------------------ *
 * 9. Vista: Equipos
 * ------------------------------------------------------------------ */
function vistaEquipos(raiz) {
  const lista = filtradas();
  const datos = porEquipo(lista);
  const editable = perfil.rol === 'admin';

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Equipos responsables' }),
    el('div', { class: 'sub', text: 'Cada equipo con su cumplimiento, proyección y carga de propuestas' }),
    el('div', { class: 'grid2' }, datos.map(d => {
      const eq = equipoDe(d.clave);
      const nivel = nivelDe(d.cumplimiento);
      const inLider = el('input', { type: 'text', value: eq.lider || '',
        placeholder: 'Nombre de quien coordina', disabled: editable ? null : 'disabled' });
      inLider.addEventListener('change', () => { eq.lider = inLider.value; guardar(); });
      return el('div', { class: 'kpi', style: 'padding:14px' }, [
        el('div', { style: 'display:flex; align-items:center; gap:8px; margin-bottom:6px' }, [
          el('span', { class: 'dot', style: `background:${d.color}` }),
          el('strong', { text: d.nombre, style: 'font-size:14px' })
        ]),
        el('div', { style: 'display:flex; align-items:baseline; gap:8px; flex-wrap:wrap' }, [
          el('b', { text: pct(d.cumplimiento), style: 'font-size:28px' }), chipNivel(d.cumplimiento)
        ]),
        el('div', { class: 'bar-mini', style: 'margin:8px 0' },
          el('i', { style: `width:${d.cumplimiento}%; background:${nivel.ramp}` })),
        el('div', { style: 'font-size:12px; color:var(--ink-muted)', text:
          `Proyección ${pct(d.proyeccion)} · ${d.cumplidas}/${d.vigentes} cumplidas · ` +
          `${d.sobreMedia} sobre el 50% · ${d.enRiesgo} en riesgo` }),
        el('label', { class: 'field', style: 'margin-top:10px' }, [
          el('span', { text: 'Coordina' }), inLider])
      ]);
    }))
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Tabla comparativa' }),
    el('div', { class: 'sub', text: 'Los mismos números en formato tabla' }),
    tablaResumen(datos.slice().sort((a, b) => b.cumplimiento - a.cumplimiento), 'Equipo')
  ]));
}

/* ------------------------------------------------------------------ *
 * 10. Vista: Programa (lectura del documento)
 * ------------------------------------------------------------------ */
function vistaPrograma(raiz) {
  const ejeFiltrado = filtros.eje ? Number(filtros.eje) : null;

  const indice = el('div', { class: 'indice' }, estado.ejes.map(ej =>
    el('button', { class: 'btn btn-sm' + (ejeFiltrado === ej.id ? ' btn-primary' : ''), type: 'button',
      text: `${ej.id}. ${ej.corto || ej.nombre}`,
      onclick: () => { filtros.eje = ejeFiltrado === ej.id ? '' : String(ej.id); poblarFiltros(); render(); } })));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Programa Conectemos la Chile · FECh 2026' }),
    el('div', { class: 'sub', text: 'El documento tal como fue escrito. Usa el índice o el buscador de arriba.' }),
    indice,
    ejeFiltrado ? el('div', { class: 'note', text: 'Mostrando un eje. Vuelve a tocar el botón para ver el programa completo.' }) : null
  ]));

  const doc = el('div', { class: 'doc' });
  if (!ejeFiltrado && !filtros.texto) {
    doc.appendChild(el('h3', { text: 'Contexto' }));
    doc.appendChild(parrafos(CONTEXTO));
  }

  estado.ejes.forEach(ej => {
    if (ejeFiltrado && ej.id !== ejeFiltrado) return;
    const suyas = filtradas().filter(p => p.eje === ej.id);
    if (!suyas.length) return;
    doc.appendChild(el('h3', { text: `${ej.id}. ${ej.nombre}` }));
    if (ej.intro && !filtros.texto) doc.appendChild(parrafos(ej.intro));
    let sub = null;
    suyas.forEach(p => {
      if (p.sub !== sub) { sub = p.sub; doc.appendChild(el('h4', { text: sub })); }
      doc.appendChild(el('div', { class: 'prop' }, [
        el('b', {}, [el('span', { class: 'cod', text: p.c + '  ' }), document.createTextNode(p.t)]),
        parrafos(p.d || ''),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, [
          chipEstado(p.estado), chipNivel(avanceReal(p)),
          el('span', { style: 'font-size:12px;color:var(--ink-muted)',
            text: (equipoDe(p.eq) || { nombre: 'Sin equipo' }).nombre + ' · ' + pct(avanceReal(p)) }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Ficha', onclick: () => abrirPropuesta(p) })
        ])
      ]));
    });
  });

  if (!doc.querySelector('.prop')) doc.appendChild(el('div', { class: 'empty', text: 'Ninguna propuesta coincide con el filtro.' }));
  raiz.appendChild(el('div', { class: 'card' }, doc));
}

/* ------------------------------------------------------------------ *
 * 11. Vista: Datos
 * ------------------------------------------------------------------ */
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el('a', { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function aCSV() {
  const cab = ['codigo', 'eje', 'subeje', 'propuesta', 'equipo', 'estado', 'avance', 'proyeccion',
    'plazo', 'etapas_completadas', 'etapas_totales', 'observaciones', 'texto_programa'];
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const filas = estado.propuestas.map(p => [
    p.c, (ejeDe(p.eje) || {}).nombre || p.eje, p.sub, p.t,
    (equipoDe(p.eq) || {}).nombre || '', estadoDe(p.estado).txt,
    avanceReal(p), avanceProyectado(p), p.fecha,
    (p.etapas || []).filter(e => e.ok).length, (p.etapas || []).length,
    (p.obs || []).map(o => `${o.f}: ${o.t}`).join(' | '), p.d || ''
  ].map(esc).join(','));
  return '﻿' + [cab.join(','), ...filas].join('\n');
}

function vistaDatos(raiz) {
  const r = resumen(estado.propuestas);
  const admin = perfil.rol === 'admin';

  const acciones = el('div', { class: 'toolbar' }, [
    el('button', { class: 'btn btn-primary', type: 'button', text: 'Exportar JSON', onclick: () =>
      descargar('conectometro.json', JSON.stringify(estado, null, 2), 'application/json') }),
    el('button', { class: 'btn', type: 'button', text: 'Exportar CSV (Excel)', onclick: () =>
      descargar('conectometro.csv', aCSV(), 'text/csv;charset=utf-8') })
  ]);

  const entrada = el('input', { type: 'file', accept: '.json', style: 'display:none' });
  entrada.addEventListener('change', () => {
    const f = entrada.files[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const d = JSON.parse(lector.result);
        if (!d || !Array.isArray(d.propuestas)) throw new Error('formato');
        estado = migrar(d);
        guardar(); render();
        alert('Datos importados: ' + d.propuestas.length + ' propuestas.');
      } catch (e) { alert('El archivo no tiene el formato esperado.'); }
    };
    lector.readAsText(f);
  });
  if (admin) {
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Importar JSON',
      onclick: () => entrada.click() }));
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Reiniciar al programa original',
      onclick: () => {
        if (confirm('Se borrará todo el avance, las etapas y las observaciones, y se volverá a las 102 propuestas del programa. ¿Continuar?')) {
          estado = inicial(); guardar(); render();
        }
      } }));
  }
  acciones.appendChild(entrada);

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Datos del sistema' }),
    el('div', { class: 'sub', text:
      `${estado.propuestas.length} propuestas · ${estado.ejes.length} ejes · ${estado.equipos.length} equipos · ${r.conEtapas} con etapas` }),
    acciones,
    el('div', { class: 'note', text:
      'Todo se guarda en el almacenamiento local de este navegador. Exporta el JSON para respaldar ' +
      'o para mover los datos a otro computador; el CSV sirve para abrirlo en Excel.' })
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Cómo se calcula' }),
    el('div', { class: 'sub', text: 'Reglas del indicador' }),
    el('div', { class: 'note' }, [
      el('p', { text: 'Cumplimiento = promedio del avance (0–100%) de las propuestas vigentes. Las cumplidas valen 100% y las descartadas quedan fuera.' }),
      el('p', { text: 'Si una propuesta tiene etapas, su avance es el porcentaje de etapas completadas; si no, se escribe a mano.' }),
      el('p', { text: 'Proyección al cierre = avance actual + una parte de lo que falta según el estado: en progreso 60%, no iniciada 30%, en riesgo 20%.' }),
      el('p', { text: 'Umbrales: bajo la media <50% · media 50% · mínimo 70% · ideal 80% · logro 90%.' })
    ]),
    el('div', { style: 'margin-top:12px' }, tablaResumen([{ nombre: 'Programa completo', ...r }], 'Alcance'))
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Accesos (próxima etapa)' }),
    el('div', { class: 'sub', text: 'Lo que hoy es un selector, mañana es un login' }),
    el('div', { class: 'note', text:
      'El selector de arriba simula tres perfiles: Mesa Ejecutiva (edita todo), Coordinación de equipo ' +
      '(edita avances, etapas y observaciones) y Lectura (solo consulta). Para accesos reales con usuario ' +
      'y contraseña, y datos compartidos entre varias personas, hace falta un servidor con base de datos: ' +
      'el JSON que exporta esta versión ya tiene la forma que necesitaría esa migración.' })
  ]));
}

/* ------------------------------------------------------------------ *
 * 12. Router, filtros y arranque
 * ------------------------------------------------------------------ */
function poblarFiltros() {
  const fEq = $('#f-equipo'), fEje = $('#f-eje'), fEst = $('#f-estado');
  fEq.innerHTML = ''; fEje.innerHTML = ''; fEst.innerHTML = '';
  fEq.appendChild(el('option', { value: '', text: 'Todos los equipos' }));
  estado.equipos.forEach(e => fEq.appendChild(el('option', { value: e.id, text: e.nombre })));
  fEje.appendChild(el('option', { value: '', text: 'Todos los ejes' }));
  estado.ejes.forEach(e => fEje.appendChild(el('option', { value: String(e.id), text: `${e.id}. ${e.nombre}` })));
  fEst.appendChild(el('option', { value: '', text: 'Todos los estados' }));
  ESTADOS.forEach(e => fEst.appendChild(el('option', { value: e.id, text: e.txt })));
  fEq.value = filtros.equipo; fEje.value = filtros.eje; fEst.value = filtros.estado;
  $('#f-texto').value = filtros.texto;
}

function render() {
  redibujables = [];
  const raiz = $('#vista');
  raiz.innerHTML = '';
  $('#filtros').style.display = (vista === 'datos') ? 'none' : '';
  if (vista === 'panel') vistaPanel(raiz);
  else if (vista === 'propuestas') vistaPropuestas(raiz);
  else if (vista === 'equipos') vistaEquipos(raiz);
  else if (vista === 'programa') vistaPrograma(raiz);
  else vistaDatos(raiz);
}

function iniciar() {
  estado = cargar();

  const selPerfil = $('#perfil');
  PERFILES.forEach(p => selPerfil.appendChild(el('option', { value: p.id, text: p.nombre })));
  selPerfil.addEventListener('change', () => {
    perfil = PERFILES.find(p => p.id === selPerfil.value) || PERFILES[0];
    if (!drawer.hidden && propuestaAbierta) abrirPropuesta(propuestaAbierta);
    render();
  });

  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    vista = btn.dataset.vista;
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
    render();
  }));

  const bind = (sel, campo) => $(sel).addEventListener('input', e => {
    filtros[campo] = e.target.value; render();
  });
  bind('#f-equipo', 'equipo'); bind('#f-eje', 'eje');
  bind('#f-estado', 'estado'); bind('#f-texto', 'texto');
  $('#f-limpiar').addEventListener('click', () => {
    filtros = { equipo: '', eje: '', estado: '', texto: '' };
    poblarFiltros(); render();
  });

  $('#btn-tema').addEventListener('click', () => {
    const actual = document.documentElement.dataset.theme;
    const siguiente = actual === 'dark' ? 'light' : actual === 'light' ? '' : (oscuro() ? 'light' : 'dark');
    if (siguiente) document.documentElement.dataset.theme = siguiente;
    else delete document.documentElement.dataset.theme;
    render();
  });

  let t;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => redibujables.forEach(f => f()), 150); });

  poblarFiltros();
  render();
}

document.addEventListener('DOMContentLoaded', iniciar);
})();
