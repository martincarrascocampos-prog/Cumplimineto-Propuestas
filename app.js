/* Prototipo de seguimiento de cumplimiento programático.
   Sin dependencias: los datos viven en localStorage y se exportan a JSON/CSV. */
(function () {
'use strict';

/* ------------------------------------------------------------------ *
 * 1. Configuración de negocio
 * ------------------------------------------------------------------ */
const CLAVE = 'conectemos-cumplimiento/v1';
const UMBRALES = { minimo: 70, ideal: 80, logro: 90 };

const ESTADOS = [
  { id: 'no_iniciada', txt: 'No iniciada', icono: '○', proy: 0.30, color: 'var(--ink-muted)' },
  { id: 'en_progreso', txt: 'En progreso', icono: '◐', proy: 0.60, color: 'var(--ramp-3)' },
  { id: 'en_riesgo',   txt: 'En riesgo',   icono: '⚠', proy: 0.20, color: 'var(--warning)' },
  { id: 'cumplida',    txt: 'Cumplida',    icono: '●', proy: 1.00, color: 'var(--good)' },
  { id: 'descartada',  txt: 'Descartada',  icono: '⊘', proy: 0,    color: 'var(--axis)' }
];

/* Escala ordinal de logro: el color es un paso de la rampa azul y siempre
   viaja con icono + etiqueta, nunca solo. */
const NIVELES = [
  { id: 'bajo',   txt: 'Bajo el mínimo', icono: '▼', desde: 0,  ramp: 'var(--ramp-1)', tono: 'critical' },
  { id: 'minimo', txt: 'Mínimo',         icono: '◆', desde: UMBRALES.minimo, ramp: 'var(--ramp-2)', tono: 'warning' },
  { id: 'ideal',  txt: 'Ideal',          icono: '▲', desde: UMBRALES.ideal,  ramp: 'var(--ramp-3)', tono: 'good' },
  { id: 'logro',  txt: 'Logro',          icono: '★', desde: UMBRALES.logro,  ramp: 'var(--ramp-4)', tono: 'good' }
];

const PALETA = [
  ['#2a78d6', '#3987e5'], ['#eb6834', '#d95926'], ['#1baf7a', '#199e70'], ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'], ['#008300', '#008300'], ['#4a3aa7', '#9085e9'], ['#e34948', '#e66767']
];

const estadoDe = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
const nivelDe = pct => NIVELES.slice().reverse().find(n => pct >= n.desde) || NIVELES[0];
const equipoDe = id => estado.equipos.find(e => e.id === id) || null;
const ejeDe = id => estado.ejes.find(e => e.id === id) || null;
const colorEquipo = eq => {
  const par = PALETA[((eq ? eq.color : 1) - 1) % PALETA.length];
  return oscuro() ? par[1] : par[0];
};
const oscuro = () => document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches;

/* ------------------------------------------------------------------ *
 * 2. Estado y persistencia
 * ------------------------------------------------------------------ */
let estado = null;
let filtros = { equipo: '', eje: '', estado: '', texto: '' };
let vista = 'panel';
let perfil = PERFILES[0];

function inicial() {
  return {
    version: 1,
    actualizado: new Date().toISOString(),
    ejes: EJES.map(e => ({ ...e })),
    equipos: EQUIPOS.map(e => ({ ...e })),
    propuestas: PROPUESTAS_BASE.map(p => ({
      c: p[0], eje: p[1], sub: p[2], t: p[3], eq: p[4],
      resp: '', estado: 'no_iniciada', avance: 0, fecha: '', nota: ''
    }))
  };
}

function cargar() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const d = JSON.parse(crudo);
      if (d && Array.isArray(d.propuestas) && d.propuestas.length) return d;
    }
  } catch (e) { /* almacenamiento bloqueado: seguimos en memoria */ }
  return inicial();
}

function guardar() {
  estado.actualizado = new Date().toISOString();
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); }
  catch (e) { /* sin persistencia: el prototipo sigue funcionando en memoria */ }
}

/* ------------------------------------------------------------------ *
 * 3. Cálculos de cumplimiento
 * ------------------------------------------------------------------ */
const vigentes = lista => lista.filter(p => p.estado !== 'descartada');
const avanceReal = p => (p.estado === 'cumplida' ? 100 : Math.max(0, Math.min(100, Number(p.avance) || 0)));
const avanceProyectado = p => {
  const a = avanceReal(p);
  return Math.round(a + estadoDe(p.estado).proy * (100 - a));
};

function resumen(lista) {
  const v = vigentes(lista);
  const n = v.length;
  const suma = (f) => v.reduce((acc, p) => acc + f(p), 0);
  const cumplimiento = n ? suma(avanceReal) / n : 0;
  const proyeccion = n ? suma(avanceProyectado) / n : 0;
  const cuenta = id => v.filter(p => p.estado === id).length;
  return {
    total: lista.length,
    vigentes: n,
    descartadas: lista.length - n,
    cumplimiento: Math.round(cumplimiento * 10) / 10,
    proyeccion: Math.round(proyeccion * 10) / 10,
    cumplidas: cuenta('cumplida'),
    enProgreso: cuenta('en_progreso'),
    enRiesgo: cuenta('en_riesgo'),
    noIniciadas: cuenta('no_iniciada'),
    sinResponsable: v.filter(p => !p.resp.trim()).length
  };
}

function filtradas() {
  const t = filtros.texto.trim().toLowerCase();
  return estado.propuestas.filter(p =>
    (!filtros.equipo || p.eq === filtros.equipo) &&
    (!filtros.eje || String(p.eje) === filtros.eje) &&
    (!filtros.estado || p.estado === filtros.estado) &&
    (!t || (p.c + ' ' + p.t + ' ' + p.resp + ' ' + p.sub).toLowerCase().includes(t))
  );
}

function porEquipo(lista) {
  return estado.equipos.map(eq => {
    const suyas = lista.filter(p => p.eq === eq.id);
    return { clave: eq.id, nombre: eq.nombre, corto: eq.corto || eq.nombre, color: colorEquipo(eq), ...resumen(suyas) };
  }).filter(r => r.total > 0);
}

function porEje(lista) {
  return estado.ejes.map(ej => {
    const suyas = lista.filter(p => p.eje === ej.id);
    return { clave: String(ej.id), nombre: `${ej.id}. ${ej.nombre}`, corto: `${ej.id}. ${ej.corto || ej.nombre}`, ...resumen(suyas) };
  }).filter(r => r.total > 0);
}

/* ------------------------------------------------------------------ *
 * 4. Utilidades de render
 * ------------------------------------------------------------------ */
const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, hijos = []) => {
  const n = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
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
const recorta = (txt, max) => (txt.length > max ? txt.slice(0, max - 1) + '…' : txt);

function chipNivel(valor) {
  const n = nivelDe(valor);
  return el('span', { class: `chip ${n.tono}` }, [
    el('i', { text: n.icono, 'aria-hidden': 'true' }),
    document.createTextNode(n.txt)
  ]);
}

function chipEstado(id) {
  const e = estadoDe(id);
  const tono = id === 'cumplida' ? 'good' : id === 'en_riesgo' ? 'warning' : 'neutral';
  return el('span', { class: `chip ${tono}` }, [
    el('i', { text: e.icono, 'aria-hidden': 'true' }),
    document.createTextNode(e.txt)
  ]);
}

/* Tooltip compartido por todos los gráficos */
const tt = $('#tt');
function mostrarTT(ev, titulo, filas) {
  tt.innerHTML = '';
  tt.appendChild(el('b', { text: titulo }));
  filas.forEach(f => tt.appendChild(el('div', {}, [
    el('span', { text: f[0] + ': ' }), document.createTextNode(f[1])
  ])));
  tt.hidden = false;
  const r = tt.getBoundingClientRect();
  const x = Math.min(ev.clientX + 14, innerWidth - r.width - 8);
  const y = Math.max(8, ev.clientY - r.height - 12);
  tt.style.left = x + 'px';
  tt.style.top = y + 'px';
}
const ocultarTT = () => { tt.hidden = true; };
addEventListener('scroll', ocultarTT, true);

/* ------------------------------------------------------------------ *
 * 5. Gráficos (SVG, sin librerías)
 * ------------------------------------------------------------------ */

/* Barra horizontal con extremo redondeado de 4px y base recta. */
function barraPath(x, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w));
  return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
}

/* Gráfico de cumplimiento por categoría: magnitud en rampa ordinal,
   líneas de umbral 70/80/90 y marca de proyección al cierre. */
function graficoCumplimiento(datos, ancho) {
  const filaH = 34, barraH = 16, topo = 26, base = 8;
  const anchoEtiq = Math.max(120, Math.min(230, Math.round(ancho * 0.36)));
  const anchoVal = 46;
  const x0 = anchoEtiq + 8;
  const escalaW = Math.max(60, ancho - x0 - anchoVal - 6);
  const alto = topo + datos.length * filaH + base;
  const svg = svgEl('svg', {
    class: 'chart', width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img',
    'aria-label': 'Cumplimiento por categoría con umbrales de 70, 80 y 90 por ciento'
  });
  const X = v => x0 + (v / 100) * escalaW;

  /* Con poco ancho las etiquetas de umbral chocarían: se dejan sólo las líneas
     y la leyenda de abajo explica dónde están. */
  const cabenEtiquetas = escalaW * 0.10 >= 26;
  [UMBRALES.minimo, UMBRALES.ideal, UMBRALES.logro].forEach((u, i) => {
    svg.appendChild(svgEl('line', {
      x1: X(u), x2: X(u), y1: topo - 10, y2: alto - base + 2, stroke: 'var(--grid)', 'stroke-width': 1
    }));
    if (cabenEtiquetas) svg.appendChild(Object.assign(svgEl('text', {
      x: X(u), y: topo - 14, 'text-anchor': i === 2 ? 'end' : 'middle',
      fill: 'var(--ink-muted)', 'font-size': 10.5
    }), { textContent: u + '%' }));
  });
  svg.appendChild(svgEl('line', {
    x1: x0, x2: x0, y1: topo - 10, y2: alto - base + 2, stroke: 'var(--axis)', 'stroke-width': 1
  }));

  datos.forEach((d, i) => {
    const y = topo + i * filaH;
    const yb = y + (filaH - barraH) / 2;
    const nivel = nivelDe(d.cumplimiento);

    svg.appendChild(Object.assign(svgEl('text', {
      x: anchoEtiq, y: y + filaH / 2 + 4, 'text-anchor': 'end',
      fill: 'var(--ink-2)', 'font-size': 12.5
    }), { textContent: recorta(d.corto || d.nombre, Math.floor(anchoEtiq / 6.6)) }));

    svg.appendChild(svgEl('rect', {
      x: x0, y: yb, width: escalaW, height: barraH, rx: 4, fill: 'var(--track)'
    }));

    const w = (d.cumplimiento / 100) * escalaW;
    if (w > 0.5) svg.appendChild(svgEl('path', { d: barraPath(x0, yb, w, barraH), fill: nivel.ramp }));

    /* Proyección al cierre: marca discontinua, nunca un segundo eje. */
    const xp = X(d.proyeccion);
    svg.appendChild(svgEl('line', {
      x1: xp, x2: xp, y1: yb - 4, y2: yb + barraH + 4,
      stroke: 'var(--ink-2)', 'stroke-width': 2, 'stroke-dasharray': '3 2'
    }));

    svg.appendChild(Object.assign(svgEl('text', {
      x: ancho - 4, y: y + filaH / 2 + 4, 'text-anchor': 'end',
      fill: 'var(--ink)', 'font-size': 12.5, 'font-weight': 600
    }), { textContent: pct(d.cumplimiento) }));

    const hit = svgEl('rect', { x: 0, y: y, width: ancho, height: filaH, fill: 'transparent', tabindex: 0 });
    const info = ev => mostrarTT(ev, d.nombre, [
      ['Cumplimiento', pct(d.cumplimiento) + ' · ' + nivel.txt],
      ['Proyección al cierre', pct(d.proyeccion)],
      ['Propuestas', `${d.cumplidas} cumplidas de ${d.vigentes}`],
      ['En riesgo', String(d.enRiesgo)]
    ]);
    hit.addEventListener('pointermove', info);
    hit.addEventListener('pointerleave', ocultarTT);
    hit.addEventListener('focus', e => info({ clientX: hit.getBoundingClientRect().x + 40, clientY: hit.getBoundingClientRect().y + 30 }));
    hit.addEventListener('blur', ocultarTT);
    svg.appendChild(hit);
  });

  return svg;
}

/* Barra 100% apilada: composición de estados. */
function graficoEstados(r, ancho) {
  const h = 30, alto = h + 4;
  const svg = svgEl('svg', {
    class: 'chart', width: ancho, height: alto, viewBox: `0 0 ${ancho} ${alto}`, role: 'img',
    'aria-label': 'Composición de las propuestas por estado'
  });
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
    if (w > 34) g.appendChild(Object.assign(svgEl('text', {
      x: x + w / 2, y: h / 2 + 7, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600,
      fill: s.id === 'no_iniciada' || s.id === 'en_riesgo' ? '#0b0b0b' : '#ffffff'
    }), { textContent: String(s.n) }));
    const info = ev => mostrarTT(ev, e.txt, [['Propuestas', String(s.n)], ['Del total vigente', pct(s.n / total * 100)]]);
    g.addEventListener('pointermove', info);
    g.addEventListener('pointerleave', ocultarTT);
    g.addEventListener('blur', ocultarTT);
    svg.appendChild(g);
    x += w + 2;
  });
  return svg;
}

function leyenda(items) {
  return el('div', { class: 'legend' }, items.map(it =>
    el('span', {}, [
      el('i', { class: it.linea ? 'key-line' : '', style: it.linea ? '' : `background:${it.color}` }),
      document.createTextNode(it.txt)
    ])
  ));
}

/* Tarjeta de gráfico con alternancia gráfico / tabla. */
function tarjetaGrafico(titulo, sub, dibujar, tabla, leyendaItems) {
  const card = el('div', { class: 'card' });
  const head = el('div', { class: 'toolbar' }, [
    el('div', {}, [el('h2', { text: titulo }), el('div', { class: 'sub', text: sub })])
  ]);
  const btn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Ver tabla' });
  head.appendChild(el('span', { class: 'count' }));
  head.appendChild(btn);
  card.appendChild(head);

  const cont = el('div', {});
  card.appendChild(cont);
  let modoTabla = false;

  const pintar = () => {
    cont.innerHTML = '';
    if (modoTabla) { cont.appendChild(tabla()); return; }
    const ancho = Math.max(280, cont.clientWidth || card.clientWidth - 32);
    cont.appendChild(dibujar(ancho));
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
let redibujables = [];

function tablaResumen(datos, etiquetaCol) {
  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: etiquetaCol }), el('th', { class: 'num', text: 'Cumplimiento' }),
    el('th', { class: 'num', text: 'Proyección' }), el('th', { text: 'Nivel' }),
    el('th', { class: 'num', text: 'Cumplidas' }), el('th', { class: 'num', text: 'Vigentes' })
  ])));
  const tb = el('tbody');
  datos.forEach(d => tb.appendChild(el('tr', {}, [
    el('td', { text: d.nombre }),
    el('td', { class: 'num', text: pct(d.cumplimiento) }),
    el('td', { class: 'num', text: pct(d.proyeccion) }),
    el('td', {}, chipNivel(d.cumplimiento)),
    el('td', { class: 'num', text: String(d.cumplidas) }),
    el('td', { class: 'num', text: String(d.vigentes) })
  ])));
  t.appendChild(tb);
  return el('div', { class: 'tablewrap' }, t);
}

/* ------------------------------------------------------------------ *
 * 6. Vista: Panel
 * ------------------------------------------------------------------ */
function vistaPanel(raiz) {
  const lista = filtradas();
  const r = resumen(lista);
  const nivel = nivelDe(r.cumplimiento);

  /* Hero + medidor */
  const medidor = el('div', {});
  const barra = el('div', { class: 'meter' }, el('div', {
    class: 'meter-fill', style: `width:${r.cumplimiento}%; background:${nivel.ramp}`
  }));
  [UMBRALES.minimo, UMBRALES.ideal, UMBRALES.logro].forEach(u =>
    barra.appendChild(el('div', { class: 'meter-line', style: `left:${u}%` })));
  barra.appendChild(el('div', {
    class: 'meter-proj', style: `left:calc(${r.proyeccion}% - 1px)`,
    title: `Proyección al cierre: ${pct(r.proyeccion)}`
  }));
  medidor.appendChild(barra);

  const marcas = el('div', { class: 'meter-marks' });
  [UMBRALES.minimo, UMBRALES.ideal, UMBRALES.logro].forEach(u =>
    marcas.appendChild(el('div', { class: 'meter-mark', style: `left:${u}%` }, [
      el('i', {}), document.createTextNode(`${u}%`)
    ])));
  medidor.appendChild(marcas);
  medidor.appendChild(leyenda([
    { txt: 'Cumplimiento actual', color: nivel.ramp },
    { txt: 'Proyección al cierre', linea: true },
    { txt: 'Umbrales: 70 mínimo · 80 ideal · 90 logro', color: 'var(--axis)' }
  ]));

  const hero = el('div', { class: 'card' }, el('div', { class: 'hero' }, [
    el('div', { class: 'hero-figure' }, [
      el('div', { class: 'hero-value', text: r.cumplimiento.toFixed(1).replace('.0', '') + '%' }),
      el('div', { class: 'hero-label', text: 'Cumplimiento del programa' }),
      el('div', { style: 'margin-top:10px' }, chipNivel(r.cumplimiento))
    ]),
    el('div', { class: 'hero-meta' }, [
      medidor,
      el('div', { class: 'note', style: 'margin-top:10px' , text:
        `Proyección al cierre ${pct(r.proyeccion)} · ${r.cumplidas} de ${r.vigentes} propuestas cumplidas` +
        (r.descartadas ? ` · ${r.descartadas} descartadas fuera del cálculo` : '') })
    ])
  ]));
  raiz.appendChild(hero);

  /* KPIs */
  const kpis = el('div', { class: 'kpis' });
  [
    ['Propuestas vigentes', r.vigentes], ['Cumplidas', r.cumplidas],
    ['En progreso', r.enProgreso], ['En riesgo', r.enRiesgo],
    ['No iniciadas', r.noIniciadas], ['Sin responsable', r.sinResponsable]
  ].forEach(([txt, v]) => kpis.appendChild(el('div', { class: 'kpi' }, [
    el('b', { text: String(v) }), el('span', { text: txt })
  ])));
  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Estado general' }),
    el('div', { class: 'sub', text: 'Sobre las propuestas que pasan el filtro activo' }),
    kpis
  ]));

  /* Composición por estado */
  const cardEstados = el('div', { class: 'card' }, [
    el('h2', { text: 'Composición por estado' }),
    el('div', { class: 'sub', text: 'Reparto de las propuestas vigentes' })
  ]);
  const contEstados = el('div', {});
  cardEstados.appendChild(contEstados);
  const pintarEstados = () => {
    contEstados.innerHTML = '';
    const w = Math.max(260, contEstados.clientWidth || 600);
    contEstados.appendChild(graficoEstados(r, w));
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

  /* Cumplimiento por equipo y por eje */
  const datosEq = porEquipo(lista).sort((a, b) => b.cumplimiento - a.cumplimiento);
  const datosEje = porEje(lista).sort((a, b) => b.cumplimiento - a.cumplimiento);
  const leyendaBarras = [
    { txt: 'Cumplimiento actual', color: 'var(--ramp-3)' },
    { txt: 'Proyección al cierre', linea: true },
    { txt: 'Umbrales 70 · 80 · 90', color: 'var(--grid)' }
  ];

  if (datosEq.length) raiz.appendChild(tarjetaGrafico(
    'Cumplimiento por equipo', 'Cada barra contra los umbrales 70 / 80 / 90',
    w => graficoCumplimiento(datosEq, w), () => tablaResumen(datosEq, 'Equipo'), leyendaBarras));

  if (datosEje.length) raiz.appendChild(tarjetaGrafico(
    'Cumplimiento por eje programático', 'Desglose de los 10 ejes del programa',
    w => graficoCumplimiento(datosEje, w), () => tablaResumen(datosEje, 'Eje'), leyendaBarras));

  /* Alertas */
  const hoy = new Date().toISOString().slice(0, 10);
  const alertas = vigentes(lista).filter(p =>
    p.estado === 'en_riesgo' || (p.fecha && p.fecha < hoy && p.estado !== 'cumplida'));
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
        el('td', { text: p.c }), el('td', { text: p.t }),
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
}

/* ------------------------------------------------------------------ *
 * 7. Vista: Propuestas
 * ------------------------------------------------------------------ */
function vistaPropuestas(raiz) {
  const lista = filtradas();
  const editable = perfil.rol !== 'lector';

  const card = el('div', { class: 'card' });
  const textoContador = () => {
    const r = resumen(lista);
    return `${lista.length} de ${estado.propuestas.length} propuestas · ${pct(r.cumplimiento)} de cumplimiento`;
  };
  const contador = el('span', { class: 'count', text: textoContador() });
  const barra = el('div', { class: 'toolbar' }, [
    el('div', {}, [
      el('h2', { text: 'Propuestas del programa' }),
      el('div', { class: 'sub', text: 'Asigna equipo, responsable, estado y avance. Se guarda solo.' })
    ]),
    contador
  ]);
  card.appendChild(barra);
  if (!editable) card.appendChild(el('div', { class: 'note', text: 'Perfil de solo lectura: los campos están bloqueados.' }));

  if (!lista.length) {
    card.appendChild(el('div', { class: 'empty', text: 'Ninguna propuesta coincide con el filtro.' }));
    raiz.appendChild(card);
    return;
  }

  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Cód.' }), el('th', { text: 'Propuesta' }), el('th', { text: 'Equipo' }),
    el('th', { text: 'Responsable' }), el('th', { text: 'Estado' }),
    el('th', { class: 'num', text: 'Avance' }), el('th', { text: 'Plazo' })
  ])));
  const tb = el('tbody');

  lista.forEach(p => {
    const punto = el('span', { class: 'dot', style: `background:${colorEquipo(equipoDe(p.eq))}` });

    const selEquipo = el('select', { disabled: editable ? null : 'disabled' });
    selEquipo.appendChild(el('option', { value: '', text: 'Sin asignar' }));
    estado.equipos.forEach(e => selEquipo.appendChild(el('option', { value: e.id, text: e.nombre })));
    selEquipo.value = p.eq || '';
    selEquipo.addEventListener('change', () => {
      actualizar(p, { eq: selEquipo.value }, false);
      punto.style.background = colorEquipo(equipoDe(p.eq));
    });

    const inResp = el('input', { type: 'text', value: p.resp, placeholder: 'Nombre', disabled: editable ? null : 'disabled' });
    inResp.addEventListener('change', () => actualizar(p, { resp: inResp.value }, false));

    const selEstado = el('select', { class: 'w-estado', disabled: editable ? null : 'disabled' });
    ESTADOS.forEach(e => selEstado.appendChild(el('option', { value: e.id, text: e.txt })));
    selEstado.value = p.estado;
    selEstado.addEventListener('change', () => {
      const cambios = { estado: selEstado.value };
      if (selEstado.value === 'cumplida') cambios.avance = 100;
      if (selEstado.value === 'no_iniciada') cambios.avance = 0;
      actualizar(p, cambios, false);
      inAvance.value = avanceReal(p);
      contador.textContent = textoContador();
    });

    const inAvance = el('input', {
      type: 'number', min: 0, max: 100, step: 5, value: avanceReal(p),
      class: 'w-avance', disabled: editable ? null : 'disabled'
    });
    inAvance.addEventListener('change', () => {
      const v = Math.max(0, Math.min(100, Number(inAvance.value) || 0));
      const cambios = { avance: v };
      if (v === 100 && p.estado !== 'descartada') cambios.estado = 'cumplida';
      else if (v > 0 && p.estado === 'no_iniciada') cambios.estado = 'en_progreso';
      actualizar(p, cambios, false);
      inAvance.value = avanceReal(p);
      selEstado.value = p.estado;
      contador.textContent = textoContador();
    });

    const inFecha = el('input', { type: 'date', value: p.fecha, disabled: editable ? null : 'disabled' });
    inFecha.addEventListener('change', () => actualizar(p, { fecha: inFecha.value }, false));

    tb.appendChild(el('tr', {}, [
      el('td', { text: p.c }),
      el('td', {}, [
        el('div', { text: p.t }),
        el('div', { class: 'mini' }, [punto, document.createTextNode(' ' + p.sub)])
      ]),
      el('td', {}, selEquipo),
      el('td', {}, inResp),
      el('td', {}, selEstado),
      el('td', { class: 'num' }, inAvance),
      el('td', {}, inFecha)
    ]));
  });

  t.appendChild(tb);
  card.appendChild(el('div', { class: 'tablewrap' }, t));
  raiz.appendChild(card);
}

function actualizar(p, cambios, repintar = true) {
  Object.assign(p, cambios);
  guardar();
  if (repintar) render();
}

/* ------------------------------------------------------------------ *
 * 8. Vista: Equipos
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
      const inLider = el('input', {
        type: 'text', value: eq.lider || '', placeholder: 'Nombre de quien coordina',
        disabled: editable ? null : 'disabled'
      });
      inLider.addEventListener('change', () => { eq.lider = inLider.value; guardar(); });

      return el('div', { class: 'kpi', style: 'padding:14px' }, [
        el('div', { style: 'display:flex; align-items:center; gap:8px; margin-bottom:6px' }, [
          el('span', { class: 'dot', style: `background:${d.color}` }),
          el('strong', { text: d.nombre, style: 'font-size:14px' })
        ]),
        el('div', { style: 'display:flex; align-items:baseline; gap:8px' }, [
          el('b', { text: pct(d.cumplimiento), style: 'font-size:28px' }),
          chipNivel(d.cumplimiento)
        ]),
        el('div', { class: 'bar-mini', style: 'margin:8px 0' },
          el('i', { style: `width:${d.cumplimiento}%; background:${nivel.ramp}` })),
        el('div', { class: 'mini', text:
          `Proyección ${pct(d.proyeccion)} · ${d.cumplidas}/${d.vigentes} cumplidas · ${d.enRiesgo} en riesgo` }),
        el('label', { class: 'field', style: 'margin-top:10px' }, [
          el('span', { text: 'Coordina' }), inLider
        ])
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
 * 9. Vista: Datos
 * ------------------------------------------------------------------ */
function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el('a', { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function aCSV() {
  const cab = ['codigo', 'eje', 'subeje', 'propuesta', 'equipo', 'responsable', 'estado', 'avance', 'proyeccion', 'plazo', 'nota'];
  const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const filas = estado.propuestas.map(p => [
    p.c, (ejeDe(p.eje) || {}).nombre || p.eje, p.sub, p.t,
    (equipoDe(p.eq) || {}).nombre || '', p.resp, estadoDe(p.estado).txt,
    avanceReal(p), avanceProyectado(p), p.fecha, p.nota
  ].map(esc).join(','));
  return '﻿' + [cab.join(','), ...filas].join('\n');
}

function vistaDatos(raiz) {
  const r = resumen(estado.propuestas);
  const admin = perfil.rol === 'admin';

  const acciones = el('div', { class: 'toolbar' }, [
    el('button', { class: 'btn btn-primary', type: 'button', text: 'Exportar JSON', onclick: () =>
      descargar('cumplimiento-fech.json', JSON.stringify(estado, null, 2), 'application/json') }),
    el('button', { class: 'btn', type: 'button', text: 'Exportar CSV (Excel)', onclick: () =>
      descargar('cumplimiento-fech.csv', aCSV(), 'text/csv;charset=utf-8') })
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
        estado = d;
        guardar(); render();
        alert('Datos importados: ' + d.propuestas.length + ' propuestas.');
      } catch (e) { alert('El archivo no tiene el formato esperado.'); }
    };
    lector.readAsText(f);
  });
  if (admin) {
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Importar JSON', onclick: () => entrada.click() }));
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Reiniciar al programa original', onclick: () => {
      if (confirm('Se borrará todo el avance registrado y se volverá a las 102 propuestas del programa. ¿Continuar?')) {
        estado = inicial(); guardar(); render();
      }
    } }));
  }
  acciones.appendChild(entrada);

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Datos del sistema' }),
    el('div', { class: 'sub', text: `${estado.propuestas.length} propuestas · ${estado.ejes.length} ejes · ${estado.equipos.length} equipos` }),
    acciones,
    el('div', { class: 'note', text:
      'Prototipo: todo se guarda en el almacenamiento local de este navegador. ' +
      'Exporta el JSON para respaldar o para mover los datos a otro computador.' })
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Cómo se calcula' }),
    el('div', { class: 'sub', text: 'Reglas del indicador' }),
    el('div', { class: 'note', html:
      '<p style="margin:0 0 8px"><strong>Cumplimiento</strong> = promedio del avance (0–100%) de las propuestas vigentes. ' +
      'Las cumplidas valen 100% y las descartadas quedan fuera del cálculo.</p>' +
      '<p style="margin:0 0 8px"><strong>Proyección al cierre</strong> = avance actual + una parte de lo que falta, según el estado: ' +
      'en progreso 60%, no iniciada 30%, en riesgo 20%.</p>' +
      '<p style="margin:0"><strong>Umbrales</strong>: bajo el mínimo &lt;70% · mínimo 70% · ideal 80% · logro 90%.</p>' }),
    el('div', { style: 'margin-top:12px' }, tablaResumen(
      [{ nombre: 'Programa completo', ...r }], 'Alcance'))
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Accesos (próxima etapa)' }),
    el('div', { class: 'sub', text: 'Lo que hoy es un selector, mañana es un login' }),
    el('div', { class: 'note', text:
      'El selector de arriba simula tres perfiles: Mesa Ejecutiva (edita todo), Coordinación de equipo ' +
      '(edita avances) y Lectura (solo consulta). Para múltiples accesos reales hace falta un servidor con ' +
      'usuarios y contraseñas; la estructura de datos de este prototipo ya está preparada para ese paso.' })
  ]));
}

/* ------------------------------------------------------------------ *
 * 10. Router, filtros y arranque
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
  else vistaDatos(raiz);
}

function iniciar() {
  estado = cargar();

  const selPerfil = $('#perfil');
  PERFILES.forEach(p => selPerfil.appendChild(el('option', { value: p.id, text: p.nombre })));
  selPerfil.addEventListener('change', () => {
    perfil = PERFILES.find(p => p.id === selPerfil.value) || PERFILES[0];
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
