/* Conectómetro — seguimiento del cumplimiento del programa FECh 2026.
   Sin dependencias: los datos viven en localStorage y se exportan a JSON/CSV. */
(function () {
'use strict';

/* ------------------------------------------------------------------ *
 * 1. Reglas de negocio
 * ------------------------------------------------------------------ */
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

/* Estructura tipo de un proyecto FECh: sirve de punto de partida para
   subdividir cualquier propuesta en etapas medibles. */
const PLANTILLA_ETAPAS = [
  'Diagnóstico y levantamiento de información',
  'Elaboración de la propuesta',
  'Gestión institucional (mesas, oficios, reuniones)',
  'Implementación',
  'Verificación y cuenta pública'
];

/* El PDF original y las miniaturas viven en la carpeta programa/.
   En la versión de un solo archivo llegan incrustados en window.PDF_INLINE
   y window.MINIS_INLINE. */
const RECURSOS = (() => {
  let urlPdf = null;
  const desdeBase64 = (b64, tipo) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: tipo }));
  };
  return {
    paginas: 57,
    pdf() {
      if (urlPdf) return urlPdf;
      urlPdf = window.PDF_INLINE
        ? desdeBase64(window.PDF_INLINE, 'application/pdf')
        : 'programa/programa-conectemos-la-chile.pdf';
      return urlPdf;
    },
    miniatura(n) {
      return window.MINIS_INLINE
        ? 'data:image/webp;base64,' + window.MINIS_INLINE[n - 1]
        : `programa/paginas/p${String(n).padStart(2, '0')}.webp`;
    }
  };
})();

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
 * 2. Estado: vistas sobre la base compartida
 *
 * Una propuesta del programa es un título fijo (data.js) más su seguimiento
 * (base de datos). Sus etapas son los pasos del proyecto del SPT: una sola
 * tabla para las dos secciones, para que nunca queden descuadradas.
 * ------------------------------------------------------------------ */
let estado = null;
let filtros = { equipo: '', eje: '', estado: '', texto: '' };
let vista = 'panel';
let perfil = PERFILES[0];
let redibujables = [];
let oyentesGlobales = false;

/* Una etapa es un paso del SPT visto con los nombres del Conectómetro. */
function vistaEtapa(paso) {
  const v = { _paso: paso };
  Object.defineProperties(v, {
    t:  { get: () => paso.descripcion,
          set: x => { paso.descripcion = x; Datos.guardar('pasos', paso); } },
    ok: { get: () => paso.estado === 'Completado',
          set: x => { paso.estado = x ? 'Completado' : 'Pendiente'; Datos.guardar('pasos', paso); } },
    f:  { get: () => paso.plazo || '',
          set: x => { paso.plazo = x; Datos.guardar('pasos', paso); } }
  });
  return v;
}

function vistaPropuesta(base) {
  const p = { c: base[0], eje: base[1], sub: base[2], t: base[3], d: base[5], _equipoBase: base[4] };

  /* La fila de seguimiento se crea recién cuando alguien cambia algo: leer no
     debe ensuciar la base con 102 filas vacías. El id se deriva del código,
     así dos personas editando a la vez no crean filas duplicadas. */
  const fila = () => Datos.todo('seguimiento').find(f => f.codigo === p.c) || null;
  const leer = () => fila() || { codigo: p.c, equipo: p._equipoBase, estado: 'no_iniciada', avance: 0, plazo: '' };
  const escribir = (campo, valor) => {
    const s = fila() || { id: 'seg:' + p.c, codigo: p.c, equipo: p._equipoBase,
      estado: 'no_iniciada', avance: 0, plazo: '' };
    s[campo] = valor;
    s.actualizado = new Date().toISOString();
    Datos.guardar('seguimiento', s);
  };

  Object.defineProperties(p, {
    eq:     { get: () => leer().equipo || p._equipoBase, set: v => escribir('equipo', v) },
    estado: { get: () => leer().estado || 'no_iniciada', set: v => escribir('estado', v) },
    avance: { get: () => Number(leer().avance) || 0,     set: v => escribir('avance', v) },
    fecha:  { get: () => leer().plazo || '',             set: v => escribir('plazo', v) },
    etapas: { get: () => Modelo.etapasDe(p.c).map(vistaEtapa) },
    obs:    { get: () => Datos.todo('observaciones').filter(o => o.codigo === p.c)
                              .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))) }
  });
  return p;
}

function construir() {
  if (!Datos.todo('equipos').length) EQUIPOS.forEach(e => Datos.guardar('equipos', { ...e }));
  return {
    ejes: EJES.map(e => ({ ...e })),
    equipos: Datos.todo('equipos').slice()
      .sort((a, b) => (a.color || 0) - (b.color || 0)),
    propuestas: PROPUESTAS_BASE.map(vistaPropuesta)
  };
}

/* Las escrituras ya viajan solas en cada cambio; guardar() queda para los
   lugares que tocan filas sueltas (equipos, por ejemplo). */
function guardar(tabla, fila) {
  if (tabla && fila) Datos.guardar(tabla, fila);
}

/* --- etapas: crear, agregar y borrar pasan por el SPT --------------------- */
function agregarEtapa(p, texto) {
  const pr = Modelo.proyectoPara(p);
  return Modelo.agregarPaso(pr.id, texto);
}

function borrarEtapa(p, i) {
  const pasos = Modelo.etapasDe(p.c);
  const paso = pasos[i];
  if (!paso) return;
  Datos.borrar('pasos', paso.id);
  Modelo.pasosDe(paso.proyecto).forEach((x, k) => {
    if (x.n !== k + 1) { x.n = k + 1; Datos.guardar('pasos', x); }
  });
}

function agregarObservacion(p, texto) {
  Datos.guardar('observaciones', { id: uid(), codigo: p.c, fecha: hoy(), texto });
}

/* Trae lo que se haya cargado en la versión anterior, que vivía sólo en este
   navegador, para no perder el avance ya registrado. */
function importarVersionAnterior() {
  let viejo = null;
  try { viejo = JSON.parse(localStorage.getItem('conectometro/v2') || 'null'); } catch (e) { return 0; }
  if (!viejo || !Array.isArray(viejo.propuestas)) return 0;
  if (Datos.todo('seguimiento').length || Datos.todo('proyectos').length) return 0;

  let n = 0;
  viejo.propuestas.forEach(v => {
    const tieneAlgo = (v.estado && v.estado !== 'no_iniciada') || v.avance || v.fecha ||
      (v.etapas || []).length || (v.obs || []).length;
    if (!tieneAlgo) return;
    n++;
    Datos.guardar('seguimiento', { id: uid(), codigo: v.c, equipo: v.eq, estado: v.estado || 'no_iniciada',
      avance: Number(v.avance) || 0, plazo: v.fecha || '' });
    (v.obs || []).forEach(o => Datos.guardar('observaciones',
      { id: uid(), codigo: v.c, fecha: o.f || hoy(), texto: o.t || '' }));
    if ((v.etapas || []).length) {
      const base = PROPUESTAS_BASE.find(b => b[0] === v.c);
      const pr = Modelo.crearProyectoDesde({ c: v.c, t: base ? base[3] : v.c });
      v.etapas.forEach((e, i) => Datos.guardar('pasos', { id: uid(), proyecto: pr.id, n: i + 1,
        descripcion: e.t || '', plazo: e.f || '',
        estado: e.ok ? 'Completado' : 'Pendiente', encargados: [] }));
    }
  });
  return n;
}

/* ------------------------------------------------------------------ *
 * 3. Cálculos
 * ------------------------------------------------------------------ */
const vigentes = lista => lista.filter(p => p.estado !== 'descartada');
const conEtapas = p => !!(p.etapas && p.etapas.length);
const etapasHechas = p => (p.etapas || []).filter(e => e.ok).length;

/* Al marcar o desmarcar etapas el estado se acomoda solo. */
function sincronizarEstado(p) {
  if (p.estado === 'descartada' || !conEtapas(p)) return;
  const h = etapasHechas(p);
  if (h === p.etapas.length) p.estado = 'cumplida';
  else if (h > 0) p.estado = 'en_progreso';
  else if (p.estado === 'cumplida') p.estado = 'en_progreso';
}

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
    conEtapas: v.filter(conEtapas).length,
    etapas: v.reduce((a, p) => a + (p.etapas || []).length, 0),
    etapasListas: v.reduce((a, p) => a + etapasHechas(p), 0)
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

/* Una etapa, con su casilla, su nombre y su plazo. La usan la ficha de la
   propuesta y la vista Proyecto, para que se comporten igual en los dos lados. */
function filaEtapa(p, i, editable, alMarcar, alReconstruir) {
  const et = p.etapas[i];
  const fila = el('div', { class: 'etapa-linea' });
  const texto = el('span', { class: 'txt', text: et.t });

  const pintarFila = () => {
    fila.className = 'etapa-linea' + (et.ok ? ' ok' : '');
    texto.className = 'txt' + (et.f && !et.ok && et.f < hoy() ? ' plazo-vencido' : '');
  };

  const chk = el('input', { type: 'checkbox', disabled: editable ? null : 'disabled',
    'aria-label': 'Etapa completada' });
  chk.checked = !!et.ok;
  chk.addEventListener('change', () => {
    et.ok = chk.checked;
    sincronizarEstado(p);
    guardar(); pintarFila(); alMarcar();
  });

  const fecha = el('input', { type: 'date', value: et.f || '', title: 'Plazo de la etapa',
    disabled: editable ? null : 'disabled' });
  fecha.addEventListener('change', () => { et.f = fecha.value; guardar(); pintarFila(); alMarcar(); });

  fila.appendChild(chk);
  fila.appendChild(texto);
  fila.appendChild(fecha);
  if (editable) fila.appendChild(el('button', { class: 'x', type: 'button', text: '✕',
    title: 'Eliminar etapa',
    onclick: () => { borrarEtapa(p, i); sincronizarEstado(p); alReconstruir(); } }));
  pintarFila();
  return fila;
}

/* Agrega la estructura tipo a una propuesta que aún no tiene etapas. */
function aplicarPlantilla(p) {
  if (conEtapas(p)) return false;
  const pr = Modelo.proyectoPara(p);
  PLANTILLA_ETAPAS.forEach(t => Modelo.agregarPaso(pr.id, t));
  return true;
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
      listaEtapas.appendChild(el('div', { style: 'color:var(--ink-muted);font-size:13px',
        text: 'Sin etapas. Si divides la propuesta en etapas, el avance se calcula solo.' }));
      return;
    }
    p.etapas.forEach((et, i) => listaEtapas.appendChild(
      filaEtapa(p, i, editable, refrescar, () => { pintarEtapas(); refrescar(); })));
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
      agregarEtapa(p, t);
      inEtapa.value = '';
      pintarEtapas(); refrescar();
    };
    inEtapa.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    bloqueEtapas.appendChild(el('div', { class: 'fila', style: 'margin-top:10px' }, [
      inEtapa, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
    ]));
    if (!p.etapas.length) bloqueEtapas.appendChild(el('div', { style: 'margin-top:8px' },
      el('button', { class: 'btn btn-sm', type: 'button', text: 'Usar estructura tipo (5 etapas)',
        onclick: () => { aplicarPlantilla(p); pintarEtapas(); refrescar(); } })));
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
      const bloque = el('div', { class: 'obs' }, [
        el('div', { style: 'flex:1' }, [el('time', { text: o.f }), el('div', { text: o.t })])
      ]);
      if (editable) bloque.appendChild(el('button', { class: 'x', type: 'button', text: '✕',
        title: 'Eliminar observación',
        onclick: () => { Datos.borrar('observaciones', o.id); pintarObs(); } }));
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
        agregarObservacion(p, t);
        ta.value = '';
        pintarObs();
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
        'En Proyecto se ve todo como un plan de trabajo: cada equipo con sus propuestas y cada propuesta ' +
        'con sus etapas, para marcar avance etapa por etapa y ponerles plazo. Hay una estructura tipo de ' +
        'cinco etapas que se puede aplicar de una vez a muchas propuestas.' }),
      el('p', { text:
        'En Programa está el documento completo: en Lectura, el texto tal cual fue escrito; en PDF original, ' +
        'las 57 páginas como se imprimen, para verlas y descargar el archivo. En Datos se exporta todo a ' +
        'JSON o a Excel.' })
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
      inLider.addEventListener('change', () => { eq.lider = inLider.value; guardar('equipos', eq); });
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
 * 10. Vista: Proyecto (estructura y cumplimiento por etapas)
 * ------------------------------------------------------------------ */
let agrupacion = 'equipo';
let soloEstructura = false;
let verListado = false;

function vistaProyecto(raiz) {
  const lista = filtradas();
  const editable = perfil.rol !== 'lector';
  const r = resumen(lista);
  const pctEtapas = r.etapas ? Math.round(r.etapasListas / r.etapas * 1000) / 10 : 0;

  /* Encabezado: cuánto del proyecto está desglosado y cuánto de eso está hecho */
  const kpis = el('div', { class: 'kpis' });
  const valores = [];
  ['Propuestas con estructura', 'Etapas definidas', 'Etapas completadas', 'Cumplimiento por etapas']
    .forEach(txt => {
      const v = el('b', { text: '—' });
      valores.push(v);
      kpis.appendChild(el('div', { class: 'kpi' }, [v, el('span', { text: txt })]));
    });

  /* Marcar una etapa actualiza los totales de arriba y la barra de su grupo,
     sin rehacer toda la página. */
  const grupoRefrescos = [];
  const refrescarAgregados = () => {
    const a = resumen(filtradas());
    valores[0].textContent = `${a.conEtapas} de ${a.vigentes}`;
    valores[1].textContent = String(a.etapas);
    valores[2].textContent = String(a.etapasListas);
    valores[3].textContent = pct(a.etapas ? a.etapasListas / a.etapas * 100 : 0);
    grupoRefrescos.forEach(f => f());
  };

  const seg = el('div', { class: 'seg' }, [
    el('button', { type: 'button', text: 'Por equipo', 'aria-pressed': String(agrupacion === 'equipo'),
      onclick: () => { agrupacion = 'equipo'; render(); } }),
    el('button', { type: 'button', text: 'Por eje', 'aria-pressed': String(agrupacion === 'eje'),
      onclick: () => { agrupacion = 'eje'; render(); } })
  ]);

  const controles = el('div', { class: 'toolbar' }, [seg]);
  controles.appendChild(el('button', { class: 'btn btn-sm', type: 'button',
    text: soloEstructura ? 'Ver todas las propuestas' : 'Ver solo las que tienen etapas',
    onclick: () => { soloEstructura = !soloEstructura; render(); } }));
  controles.appendChild(el('button', { class: 'btn btn-sm', type: 'button',
    text: verListado ? 'Ver estructura' : 'Ver listado de etapas',
    onclick: () => { verListado = !verListado; render(); } }));

  const sinEstructura = vigentes(lista).filter(p => !conEtapas(p));
  if (editable && sinEstructura.length) controles.appendChild(el('button', {
    class: 'btn btn-sm', type: 'button',
    text: `Aplicar estructura tipo a ${sinEstructura.length} propuesta${sinEstructura.length > 1 ? 's' : ''}`,
    onclick: () => {
      if (!confirm(`Se agregarán las 5 etapas tipo a ${sinEstructura.length} propuestas sin estructura ` +
        `(las que están filtradas ahora). ¿Continuar?`)) return;
      sinEstructura.forEach(aplicarPlantilla);
      render();
    } }));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Estructura de proyecto' }),
    el('div', { class: 'sub', text:
      'Cada propuesta se subdivide en etapas con su plazo; el cumplimiento se mide etapa por etapa.' }),
    kpis, el('div', { style: 'margin-top:14px' }, controles)
  ]));

  if (verListado) { listadoEtapas(raiz, lista, editable); return; }

  /* Árbol: grupo → propuesta → etapas */
  const grupos = agrupacion === 'equipo'
    ? estado.equipos.map(e => ({ id: e.id, nombre: e.nombre, color: colorEquipo(e),
        items: lista.filter(p => p.eq === e.id) }))
    : estado.ejes.map(e => ({ id: e.id, nombre: `${e.id}. ${e.nombre}`, color: 'var(--ramp-3)',
        items: lista.filter(p => p.eje === e.id) }));

  const cont = el('div', { class: 'card' });
  let algo = false;

  grupos.forEach(g => {
    const items = g.items.filter(p => !soloEstructura || conEtapas(p));
    if (!items.length) return;
    algo = true;
    const bloque = el('div', { class: 'grupo' });
    const barraG = el('span', { class: 'bar-mini' });
    const textoG = el('span', { style: 'font-size:12.5px;color:var(--ink-muted)' });
    const refrescarGrupo = () => {
      const rg = resumen(items);
      barraG.innerHTML = '';
      barraG.appendChild(el('i', { style: `width:${rg.cumplimiento}%; background:${nivelDe(rg.cumplimiento).ramp}` }));
      textoG.textContent = `${pct(rg.cumplimiento)} · ${rg.etapasListas}/${rg.etapas} etapas · ` +
        `${items.length} propuesta${items.length === 1 ? '' : 's'}`;
    };
    grupoRefrescos.push(refrescarGrupo);
    refrescarGrupo();

    bloque.appendChild(el('div', { class: 'grupo-head' }, [
      el('span', { class: 'dot', style: `background:${g.color}` }),
      el('b', { text: g.nombre }), barraG, textoG
    ]));

    items.forEach(p => bloque.appendChild(nodoPropuesta(p, editable, refrescarAgregados)));
    cont.appendChild(bloque);
  });

  if (!algo) cont.appendChild(el('div', { class: 'empty', text: 'Ninguna propuesta coincide con el filtro.' }));
  raiz.appendChild(cont);
  refrescarAgregados();
}

/* Una propuesta dentro del árbol, con sus etapas y su barra de avance. */
function nodoPropuesta(p, editable, alMarcar) {
  const nodo = el('div', { class: 'nodo' });
  const barra = el('span', { class: 'bar-mini', style: 'max-width:160px' });
  const marca = el('span', { style: 'font-size:12.5px;color:var(--ink-muted)' });
  const etapas = el('div', { class: 'nodo-etapas' });
  const caja = el('span', {});

  const pintarTotales = () => {
    const a = avanceReal(p);
    caja.innerHTML = '';
    caja.appendChild(chipEstado(p.estado));
    barra.innerHTML = '';
    barra.appendChild(el('i', { style: `width:${a}%; background:${nivelDe(a).ramp}` }));
    marca.textContent = conEtapas(p)
      ? `${etapasHechas(p)}/${p.etapas.length} etapas · ${pct(a)}`
      : `${pct(a)} · sin etapas`;
  };

  const pintar = () => {
    pintarTotales();
    etapas.innerHTML = '';
    p.etapas.forEach((et, i) => etapas.appendChild(filaEtapa(p, i, editable,
      () => { pintarTotales(); if (alMarcar) alMarcar(); }, pintar)));

    if (editable) {
      const inEtapa = el('input', { type: 'text', placeholder: 'Agregar etapa…', style: 'max-width:320px' });
      const agregar = () => {
        const t = inEtapa.value.trim();
        if (!t) return;
        agregarEtapa(p, t);
        pintar(); if (alMarcar) alMarcar();
      };
      inEtapa.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
      const acciones = el('div', { class: 'fila', style: 'margin-top:8px' }, [
        inEtapa, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar', onclick: agregar })
      ]);
      if (!conEtapas(p)) acciones.appendChild(el('button', { class: 'btn btn-sm', type: 'button',
        text: 'Estructura tipo', title: 'Agrega las 5 etapas tipo',
        onclick: () => { aplicarPlantilla(p); pintar(); if (alMarcar) alMarcar(); } }));
      etapas.appendChild(acciones);
    }
  };

  nodo.appendChild(el('div', { class: 'nodo-head' }, [
    el('span', { class: 'cod', text: p.c }),
    el('button', { class: 'linktitle tit', type: 'button', text: p.t, onclick: () => abrirPropuesta(p) }),
    caja, barra, marca
  ]));
  nodo.appendChild(etapas);
  pintar();
  return nodo;
}

/* El mismo contenido como lista plana: una fila por etapa. */
function listadoEtapas(raiz, lista, editable) {
  const filas = [];
  vigentes(lista).forEach(p => (p.etapas || []).forEach((et, i) => filas.push({ p, et, i })));

  const sub = el('div', { class: 'sub',
    text: `${filas.filter(f => f.et.ok).length} de ${filas.length} etapas completadas` });
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Cumplimiento etapa por etapa' }), sub
  ]);
  if (!filas.length) {
    card.appendChild(el('div', { class: 'empty', text: 'Todavía no hay etapas definidas con este filtro.' }));
    raiz.appendChild(card);
    return;
  }

  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: '' }), el('th', { text: 'Cód.' }), el('th', { text: 'Etapa' }),
    el('th', { text: 'Propuesta' }), el('th', { text: 'Equipo' }), el('th', { text: 'Plazo' })
  ])));
  const tb = el('tbody');
  filas.forEach(({ p, et, i }) => {
    const chk = el('input', { type: 'checkbox', disabled: editable ? null : 'disabled',
      'aria-label': 'Etapa completada' });
    chk.checked = !!et.ok;
    const fila = el('tr', {}, [
      el('td', {}, chk),
      el('td', { text: `${p.c}.${i + 1}` }),
      el('td', { text: et.t }),
      el('td', {}, el('button', { class: 'linktitle', type: 'button', text: recorta(p.t, 46),
        onclick: () => abrirPropuesta(p) })),
      el('td', { text: (equipoDe(p.eq) || { nombre: '—' }).nombre }),
      el('td', { text: et.f || '—' })
    ]);
    chk.addEventListener('change', () => {
      et.ok = chk.checked;
      sincronizarEstado(p);
      guardar();
      fila.style.color = et.ok ? 'var(--ink-muted)' : '';
      sub.textContent = `${filas.filter(f => f.et.ok).length} de ${filas.length} etapas completadas`;
    });
    tb.appendChild(fila);
  });
  t.appendChild(tb);
  card.appendChild(el('div', { class: 'tablewrap' }, t));
  raiz.appendChild(card);
}

/* ------------------------------------------------------------------ *
 * 11. Vista: Programa (lectura del documento y PDF original)
 * ------------------------------------------------------------------ */
let subPrograma = 'lectura';

function vistaPrograma(raiz) {
  const seg = el('div', { class: 'seg' }, [
    el('button', { type: 'button', text: 'Lectura', 'aria-pressed': String(subPrograma === 'lectura'),
      onclick: () => { subPrograma = 'lectura'; render(); } }),
    el('button', { type: 'button', text: 'PDF original', 'aria-pressed': String(subPrograma === 'pdf'),
      onclick: () => { subPrograma = 'pdf'; render(); } })
  ]);
  raiz.appendChild(el('div', { class: 'card', style: 'padding:12px 16px' }, el('div', { class: 'toolbar',
    style: 'margin:0' }, [
    el('div', {}, [
      el('h2', { text: 'Programa Conectemos la Chile · FECh 2026' }),
      el('div', { class: 'sub', style: 'margin:0', text: subPrograma === 'lectura'
        ? 'El texto del documento, propuesta por propuesta.'
        : 'El documento original, tal como se imprime.' })
    ]),
    el('span', { class: 'count' }), seg
  ])));
  if (subPrograma === 'pdf') programaPDF(raiz);
  else programaLectura(raiz);
}

/* Vista previa del PDF: galería de páginas y visor del archivo original. */
function programaPDF(raiz) {
  const url = RECURSOS.pdf();
  let pagina = 1;

  const visor = el('iframe', { class: 'visor', title: 'Programa Conectemos la Chile (PDF)',
    src: url + '#page=1&view=FitH' });

  const indicador = el('span', { style: 'font-size:12.5px;color:var(--ink-muted)' });
  const irA = n => {
    pagina = n;
    visor.src = `${url}#page=${n}&view=FitH`;
    indicador.textContent = `Página ${n} de ${RECURSOS.paginas}`;
    galeria.querySelectorAll('.pagina').forEach((b, i) =>
      b.setAttribute('aria-current', String(i + 1 === n)));
    visor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const galeria = el('div', { class: 'galeria' });
  for (let n = 1; n <= RECURSOS.paginas; n++) {
    galeria.appendChild(el('button', { class: 'pagina', type: 'button',
      'aria-current': String(n === 1), title: `Ir a la página ${n}`, onclick: () => irA(n) }, [
      el('img', { src: RECURSOS.miniatura(n), alt: `Página ${n} del programa`, loading: 'lazy' }),
      el('span', { text: String(n) })
    ]));
  }
  indicador.textContent = `Página 1 de ${RECURSOS.paginas}`;

  const barra = el('div', { class: 'pdfbar' }, [
    el('a', { class: 'btn btn-primary', href: url, download: 'Programa-Conectemos-la-Chile-FECh-2026.pdf',
      text: 'Descargar el PDF' }),
    el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener', text: 'Abrir en otra pestaña' }),
    indicador
  ]);

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Documento original' }),
    el('div', { class: 'sub', text: 'Las 57 páginas tal cual, sin intervención.' }),
    barra, visor
  ]));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Páginas' }),
    el('div', { class: 'sub', text: 'Toca una página para abrirla en el visor de arriba.' }),
    galeria
  ]));
}

function programaLectura(raiz) {
  const ejeFiltrado = filtros.eje ? Number(filtros.eje) : null;

  const indice = el('div', { class: 'indice' }, estado.ejes.map(ej =>
    el('button', { class: 'btn btn-sm' + (ejeFiltrado === ej.id ? ' btn-primary' : ''), type: 'button',
      text: `${ej.id}. ${ej.corto || ej.nombre}`,
      onclick: () => { filtros.eje = ejeFiltrado === ej.id ? '' : String(ej.id); poblarFiltros(); render(); } })));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Índice' }),
    el('div', { class: 'sub', text: 'Toca un eje para leerlo solo, o usa el buscador de arriba.' }),
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
 * 12. Vista: Datos
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
      descargar('conectometro.json', JSON.stringify(
        { version: 3, exportado: new Date().toISOString(), tablas: Datos.tablas }, null, 2),
        'application/json') }),
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
        const tablas = d.tablas || d;
        let n = 0;
        ['equipos', 'seguimiento', 'observaciones', 'proyectos', 'pasos', 'hitos',
         'agenda', 'integrantes', 'enlaces'].forEach(t => {
          (tablas[t] || []).forEach(fila => { Datos.guardar(t, fila); n++; });
        });
        estado = construir();
        render();
        alert('Datos importados: ' + n + ' registros.');
      } catch (e) { alert('El archivo no tiene el formato esperado.'); }
    };
    lector.readAsText(f);
  });
  if (admin) {
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Importar JSON',
      onclick: () => entrada.click() }));
    acciones.appendChild(el('button', { class: 'btn', type: 'button', text: 'Borrar todo el avance',
      onclick: () => {
        if (!confirm('Se borrará el avance, las etapas, los proyectos y las observaciones, y se volverá ' +
          'a las 102 propuestas del programa sin tocar. ¿Continuar?')) return;
        ['seguimiento', 'observaciones', 'pasos', 'hitos', 'proyectos'].forEach(t =>
          Datos.todo(t).slice().forEach(f => Datos.borrar(t, f.id)));
        estado = construir();
        render();
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
    el('h2', { text: 'Dónde se están guardando los datos' }),
    el('div', { class: 'sub', text: Datos.modo === 'supabase' ? 'Base compartida' : 'Sólo este navegador' }),
    el('div', { class: 'note' }, [
      el('p', { text: Datos.modo === 'supabase'
        ? 'Conectado a la base compartida: lo que edites lo ve todo el equipo.'
        : 'Los datos viven en este navegador. Para que el equipo vea lo mismo, conecta la base ' +
          'compartida desde el SPT, en su pestaña Conexión.' }),
      Datos.mensaje ? el('p', { text: Datos.mensaje }) : null
    ].filter(Boolean)),
    el('div', { class: 'toolbar', style: 'margin-top:12px' },
      el('a', { class: 'btn', href: 'spt.html', text: 'Ir al SPT · Participación' }))
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
 * 13. Router, filtros y arranque
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
  UI.pintarConexion(document.querySelector('#conexion'));
  const raiz = $('#vista');
  raiz.innerHTML = '';
  $('#filtros').style.display = (vista === 'datos') ? 'none' : '';
  if (vista === 'panel') vistaPanel(raiz);
  else if (vista === 'propuestas') vistaPropuestas(raiz);
  else if (vista === 'equipos') vistaEquipos(raiz);
  else if (vista === 'proyecto') vistaProyecto(raiz);
  else if (vista === 'programa') vistaPrograma(raiz);
  else vistaDatos(raiz);
}

async function iniciar() {
  Datos.alCambiarEstado = () => UI.pintarConexion(document.querySelector('#conexion'));
  await Datos.iniciar();
  const recuperadas = importarVersionAnterior();
  estado = construir();
  if (recuperadas) console.info(`Se recuperaron ${recuperadas} propuestas de la versión anterior.`);

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

  if (!window.UNARCHIVO) $('#btn-tema').addEventListener('click', () => {
    const actual = document.documentElement.dataset.theme;
    const siguiente = actual === 'dark' ? 'light' : actual === 'light' ? '' : (oscuro() ? 'light' : 'dark');
    if (siguiente) document.documentElement.dataset.theme = siguiente;
    else delete document.documentElement.dataset.theme;
    render();
  });

  if (!oyentesGlobales) {
    oyentesGlobales = true;
    let t;
    addEventListener('resize', () => {
      if (window.UNARCHIVO && window.SECCION !== 'conecto') return;
      clearTimeout(t);
      t = setTimeout(() => redibujables.forEach(f => f()), 150);
    });
  }

  poblarFiltros();
  render();
}

/* En la versión de un solo archivo la página decide cuándo arrancar cada sección. */
if (window.UNARCHIVO) window.iniciarConectometro = iniciar;
else document.addEventListener('DOMContentLoaded', iniciar);
})();
