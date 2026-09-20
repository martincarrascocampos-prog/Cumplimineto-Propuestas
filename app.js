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

/* Los dos documentos: el programa y los estatutos. Cada uno tiene su PDF
   original y sus miniaturas de página. En la versión de un solo archivo
   llegan incrustados en window.PDF_INLINE y window.MINIS_INLINE, con una
   entrada por documento. */
const desdeBase64 = (b64, tipo) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: tipo }));
};

function documento(clave, def) {
  let url = null;
  return Object.assign({
    clave,
    pdf() {
      if (url) return url;
      const inc = window.PDF_INLINE && window.PDF_INLINE[clave];
      url = inc ? desdeBase64(inc, 'application/pdf') : def.archivo;
      return url;
    },
    miniatura(n) {
      const inc = window.MINIS_INLINE && window.MINIS_INLINE[clave];
      return inc ? 'data:image/webp;base64,' + inc[n - 1]
                 : `${def.carpeta}/p${String(n).padStart(2, '0')}.webp`;
    }
  }, def);
}

const DOCUMENTOS = {
  programa: documento('programa', {
    nombre: 'Programa Conectemos la Chile',
    bajada: 'El programa con que la Mesa se presentó a la FECh 2026',
    icono: 'programa',
    paginas: 57,
    archivo: 'programa/programa-conectemos-la-chile.pdf',
    carpeta: 'programa/paginas',
    descarga: 'Programa-Conectemos-la-Chile-FECh-2026.pdf'
  }),
  estatutos: documento('estatutos', {
    nombre: 'Estatutos FECh',
    bajada: (typeof ESTATUTOS !== 'undefined' && ESTATUTOS.bajada) || 'Estatutos de la Federación',
    icono: 'estatutos',
    paginas: (typeof ESTATUTOS !== 'undefined' && ESTATUTOS.paginas) || 47,
    archivo: 'estatutos/estatutos-fech.pdf',
    carpeta: 'estatutos/paginas',
    descarga: 'Estatutos-FECh.pdf'
  })
};

/* Compatibilidad: el resto del código pedía el programa sin nombrarlo. */
const RECURSOS = DOCUMENTOS.programa;


/* Los colores del programa impreso, en el orden que pasó la revisión de
   contraste y daltonismo. */
const PALETA = ['#e3342f', '#2a4fd0', '#f19a3d', '#009c50',
                '#8a3fa0', '#0090a8', '#c2185b', '#6b7d00'];

const estadoDe = id => ESTADOS.find(e => e.id === id) || ESTADOS[0];
const nivelDe = p => NIVELES.slice().reverse().find(n => p >= n.desde) || NIVELES[0];
const equipoDe = id => estado.equipos.find(e => e.id === id) || null;
const ejeDe = id => estado.ejes.find(e => e.id === id) || null;
const colorEquipo = eq => PALETA[(((eq && eq.color) || 1) - 1) % PALETA.length];

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
/* Quién puede editar lo decide la sesión en la base, no un selector en la
   pantalla: mientras no haya cuentas, todo el que entra puede editar. */
const perfil = { rol: 'admin' };
let redibujables = [];
let oyentesGlobales = false;

/* Una etapa es un paso del SPT visto con los nombres del Conectómetro. */
function vistaEtapa(paso) {
  const v = { _paso: paso };
  Object.defineProperties(v, {
    t:  { get: () => paso.descripcion,
          set: x => { paso.descripcion = x; Datos.guardar('pasos', paso); } },
    ok: { get: () => Modelo.pasoListo(paso),
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

function borrarEtapa(p, i, alTerminar) {
  const paso = Modelo.etapasDe(p.c)[i];
  if (!paso) return;
  const copia = { ...paso };
  UI.borrarConDeshacer('pasos', copia, 'Etapa', alTerminar);
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
  selEquipo.appendChild(el('option', { value: '', text: 'Sin asignar' }));
  estado.equipos.forEach(e => selEquipo.appendChild(el('option', { value: e.id, text: e.nombre })));
  selEquipo.value = p.eq || '';
  const avisoEnlace = el('div', {});
  const pintarEnlace = () => {
    avisoEnlace.innerHTML = '';
    avisoEnlace.appendChild(notaEnlaceSPT(p));
  };
  selEquipo.addEventListener('change', () => {
    p.eq = selEquipo.value; guardar(); pintarEnlace(); refrescar();
  });

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
    avisoEnlace,
    el('div', { style: 'margin-top:10px' }, resumenAvance)
  ]));
  pintarEnlace();

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
    el('h3', { text: 'Etapas de cumplimiento' }),
    /* La otra mitad de la bisagra: estas etapas y los pasos del SPT son la
       misma fila en la base. Conviene decirlo donde se editan. */
    p.eq === 'PART'
      ? el('div', { class: 'enlace-spt part', style: 'margin:0 0 10px',
          text: 'Son los mismos pasos del SPT: se editan desde los dos lados.' })
      : null,
    listaEtapas
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
        onclick: () => UI.borrarConDeshacer('observaciones', { ...o }, 'Observación', pintarObs) }));
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
/* Qué es esto, en cuatro frases. Vive plegado arriba del Panel. */
function explicador() {
  const punto = (t, d) => el('div', { class: 'expl' }, [
    el('b', { text: t }), el('span', { text: d })]);
  return el('div', { class: 'expl-caja' }, [
    punto('Qué mide', 'El promedio de avance de las 102 propuestas del programa ' +
      'Conectemos la Chile, repartidas entre los siete equipos de la Mesa.'),
    punto('Las cuatro marcas', '50% a medio camino · 70% mínimo · 80% ideal · 90% logro. ' +
      'Valen igual para cada equipo y cada eje.'),
    punto('La línea punteada', 'La proyección al cierre: cuánto se cumpliría si cada ' +
      'propuesta sigue como va.'),
    punto('Etapas', 'Si una propuesta se divide en etapas, el avance lo calculan ellas. ' +
      'Las de Participación son los pasos de su SPT.')
  ]);
}

const DEFINICION =
  'El Conectómetro es el espacio de trabajo central e interactivo de la Secretaría de ' +
  'Participación. Funciona como el cerebro logístico y visual de la plataforma, midiendo y ' +
  'vinculando en tiempo real el flujo de trabajo: desde el nacimiento de ideas y revisión de ' +
  'documentos, hasta la calendarización de reuniones y ejecución de proyectos.';

function vistaPanel(raiz) {
  raiz.appendChild(el('p', { class: 'definicion', text: DEFINICION }));
  raiz.appendChild(UI.seccion('que-es', '¿Conectómetro?',
    'Qué mide y cómo se lee', [explicador()], { abierta: false }));

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
  raiz.appendChild(UI.seccion('estado-general', 'Estado general',
    'Sobre las propuestas que pasan el filtro activo', [kpis]));

  /* El reparto del trabajo: nada viene asignado de fábrica, así que lo
     primero que hay que hacer con el sistema es repartir las 102. */
  const sinEquipo = lista.filter(p => !p.eq).length;
  const enPart = lista.filter(p => p.eq === 'PART').length;
  raiz.appendChild(UI.seccion('reparto', 'Reparto por equipo',
    sinEquipo
      ? `${sinEquipo} de ${lista.length} sin equipo responsable`
      : `${enPart} en Participación`, [
    sinEquipo
      ? el('div', { class: 'toolbar' },
          el('button', { class: 'btn btn-sm btn-primary', type: 'button',
            text: 'Repartir propuestas →', onclick: () => irAVista('propuestas') }))
      : null
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

/* Dónde cae una propuesta según el equipo que la tenga. Es la bisagra
   entre las dos aplicaciones y conviene que se vea, no que se adivine:
   asignar acá crea el proyecto allá, y los pasos de allá son estas etapas. */
function notaEnlaceSPT(p) {
  const eq = equipoDe(p.eq);
  if (!eq) return el('div', { class: 'enlace-spt sin', text: 'Sin equipo: no entra a ningún SPT.' });
  if (eq.id === 'PART') {
    return el('div', { class: 'enlace-spt part' }, [
      document.createTextNode('Es proyecto en el SPT de Participación. '),
      el('a', { href: window.UNARCHIVO ? '#' : 'spt.html',
        onclick: window.UNARCHIVO ? (e => { e.preventDefault(); window.irASeccion('spt'); }) : null,
        text: 'Verlo allá →' })
    ]);
  }
  return el('div', { class: 'enlace-spt otro', text: 'Seguimiento a cargo de ' + eq.nombre + '.' });
}

/* ------------------------------------------------------------------ *
 * 11. Documentos: el programa y los estatutos
 *
 * Un riel a la izquierda elige el documento, la forma de verlo y el punto
 * del índice; a la derecha va el contenido. Los dos documentos se pueden
 * leer transcritos o mirar en su PDF original, página por página.
 * ------------------------------------------------------------------ */
let docActual = 'programa';
let subPrograma = 'lectura';     /* lectura · pdf */
let seccionEstatuto = null;      /* índice del título o capítulo elegido */

function vistaPrograma(raiz) {
  const doc = DOCUMENTOS[docActual];

  /* Sub-pestañas: qué documento. Van arriba del todo, como en U-Cursos,
     no en una tarjeta al costado. */
  const subnav = el('nav', { class: 'subnav', 'aria-label': 'Documento' });
  Object.values(DOCUMENTOS).forEach(d => subnav.appendChild(el('button', {
    class: 'sub-tab', type: 'button', 'aria-selected': String(d.clave === docActual),
    onclick: () => { docActual = d.clave; seccionEstatuto = null; render(); }
  }, [UI.icono(d.icono, 17), el('span', { text: d.nombre })])));
  raiz.appendChild(subnav);

  /* Franja de datos del documento y cómo verlo. */
  const cuenta = docActual === 'estatutos' && typeof ESTATUTOS !== 'undefined'
    ? `${ESTATUTOS.articulos} artículos` : '102 propuestas';
  raiz.appendChild(el('div', { class: 'doc-barra' }, [
    el('div', { class: 'doc-datos' }, [
      el('b', { text: doc.nombre }),
      el('span', { text: `${doc.paginas} páginas · ${cuenta} · ${doc.bajada}` })
    ]),
    el('div', { class: 'doc-acciones' }, [
      el('div', { class: 'seg' }, [
        el('button', { type: 'button', text: 'Lectura',
          'aria-pressed': String(subPrograma === 'lectura'),
          onclick: () => { subPrograma = 'lectura'; render(); } }),
        el('button', { type: 'button', text: 'PDF original',
          'aria-pressed': String(subPrograma === 'pdf'),
          onclick: () => { subPrograma = 'pdf'; render(); } })
      ]),
      el('a', { class: 'btn btn-sm', href: doc.pdf(), download: doc.descarga,
        text: '↓ Descargar' }),
      el('a', { class: 'btn btn-sm', href: doc.pdf(), target: '_blank', rel: 'noopener',
        text: 'Abrir aparte' })
    ])
  ]));

  /* El índice, también arriba: una fila de enlaces, no una columna. */
  if (subPrograma === 'lectura') {
    raiz.appendChild(docActual === 'programa' ? indicePrograma() : indiceEstatutos());
  }

  const cuerpo = el('div', { class: 'doc-cuerpo' });
  raiz.appendChild(cuerpo);

  if (subPrograma === 'pdf') visorPDF(cuerpo, doc);
  else if (docActual === 'programa') programaLectura(cuerpo);
  else estatutosLectura(cuerpo);
}

function indicePrograma() {
  const ejeFiltrado = filtros.eje ? Number(filtros.eje) : null;
  const fila = el('div', { class: 'doc-indice' }, [
    el('span', { class: 'ix-rotulo', text: 'Ejes' }),
    el('button', { class: 'ix' + (ejeFiltrado ? '' : ' activo'), type: 'button',
      text: 'Todos', onclick: () => { filtros.eje = ''; poblarFiltros(); render(); } })
  ]);
  estado.ejes.forEach(ej => fila.appendChild(el('button', {
    class: 'ix' + (ejeFiltrado === ej.id ? ' activo' : ''), type: 'button',
    title: ej.nombre, text: `${ej.id}. ${ej.corto || ej.nombre}`,
    onclick: () => { filtros.eje = String(ej.id); poblarFiltros(); render(); } })));
  return fila;
}

/* Dos niveles: los títulos siempre visibles y, al entrar en uno, sus
   capítulos en una segunda fila. Así el índice cabe arriba sin ser una
   lista interminable. */
function indiceEstatutos() {
  const limpio = t => t.replace(/\s*\(p\.\s*\d+\)\s*$/, '');
  const caja = el('div', {});

  const titulos = ESTATUTOS.indice
    .map((e, i) => ({ e, i })).filter(({ e }) => e[0] === 'titulo');

  /* En qué título estoy: el elegido, o el que contiene al capítulo elegido. */
  let tituloActivo = null;
  if (seccionEstatuto !== null) {
    const previos = titulos.filter(({ i }) => i <= seccionEstatuto);
    tituloActivo = previos.length ? previos[previos.length - 1].i : null;
  }

  const fila = el('div', { class: 'doc-indice' }, [
    el('span', { class: 'ix-rotulo', text: 'Títulos' }),
    el('button', { class: 'ix' + (seccionEstatuto === null ? ' activo' : ''), type: 'button',
      text: 'Todo el estatuto', onclick: () => { seccionEstatuto = null; render(); } })
  ]);
  titulos.forEach(({ e, i }) => {
    const nombre = limpio(e[2]);
    const corto = nombre.replace(/^T[ÍI]TULO\s+/i, '').replace(/^T[íi]tulo\s+/, '');
    fila.appendChild(el('button', {
      class: 'ix' + (tituloActivo === i ? ' activo' : ''), type: 'button',
      title: nombre + ' · página ' + e[1],
      text: UI.recorta(corto, 30),
      onclick: () => { seccionEstatuto = i; render(); } }));
  });
  caja.appendChild(fila);

  /* Capítulos del título en que estoy, si tiene. */
  if (tituloActivo !== null) {
    const siguiente = titulos.find(({ i }) => i > tituloActivo);
    const hasta = siguiente ? siguiente.i : ESTATUTOS.indice.length;
    const caps = ESTATUTOS.indice.map((e, i) => ({ e, i }))
      .filter(({ e, i }) => e[0] === 'capitulo' && i > tituloActivo && i < hasta);
    if (caps.length) {
      const fila2 = el('div', { class: 'doc-indice segunda' }, [
        el('span', { class: 'ix-rotulo', text: 'Capítulos' }),
        el('button', { class: 'ix' + (seccionEstatuto === tituloActivo ? ' activo' : ''),
          type: 'button', text: 'Todo el título',
          onclick: () => { seccionEstatuto = tituloActivo; render(); } })
      ]);
      caps.forEach(({ e, i }) => fila2.appendChild(el('button', {
        class: 'ix' + (seccionEstatuto === i ? ' activo' : ''), type: 'button',
        title: e[2] + ' · página ' + e[1],
        text: UI.recorta(limpio(e[2]).replace(/^Cap[íi]tulo\s+/i, ''), 40),
        onclick: () => { seccionEstatuto = i; render(); } })));
      caja.appendChild(fila2);
    }
  }
  return caja;
}

/* Visor del PDF: el archivo original arriba y las páginas abajo. */
function visorPDF(raiz, doc) {
  const url = doc.pdf();
  const visor = el('iframe', { class: 'visor', title: `${doc.nombre} (PDF)`,
    src: url + '#page=1&view=FitH' });
  const indicador = el('span', { class: 'mini' });

  const irA = n => {
    visor.src = `${url}#page=${n}&view=FitH`;
    indicador.textContent = `Página ${n} de ${doc.paginas}`;
    galeria.querySelectorAll('.pagina').forEach((b, i) =>
      b.setAttribute('aria-current', String(i + 1 === n)));
    visor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const galeria = el('div', { class: 'galeria' });
  for (let n = 1; n <= doc.paginas; n++) {
    galeria.appendChild(el('button', { class: 'pagina', type: 'button',
      'aria-current': String(n === 1), title: `Ir a la página ${n}`, onclick: () => irA(n) }, [
      el('img', { src: doc.miniatura(n), alt: `Página ${n} de ${doc.nombre}`, loading: 'lazy' }),
      el('span', { text: String(n) })
    ]));
  }
  indicador.textContent = `Página 1 de ${doc.paginas}`;

  raiz.appendChild(el('div', { class: 'pdfbar' }, [indicador]));
  raiz.appendChild(visor);
  raiz.appendChild(el('h3', { class: 'doc-sub', text: 'Páginas' }));
  raiz.appendChild(el('p', { class: 'doc-pista',
    text: 'Toca una página para abrirla en el visor de arriba.' }));
  raiz.appendChild(galeria);
}

/* Lectura de los estatutos: el texto transcrito, con el índice al costado. */
function estatutosLectura(raiz) {
  const busca = (filtros.texto || '').trim().toLowerCase();

  /* Desde el título elegido hasta el siguiente del mismo nivel o mayor. */
  let bloques = ESTATUTOS.bloques;
  if (seccionEstatuto !== null && ESTATUTOS.indice[seccionEstatuto]) {
    const objetivo = ESTATUTOS.indice[seccionEstatuto];
    const desde = bloques.findIndex(b => b[0] === objetivo[0] && b[2] === objetivo[2]);
    if (desde >= 0) {
      const corta = objetivo[0] === 'titulo'
        ? t => t === 'titulo'
        : t => t === 'titulo' || t === 'capitulo';
      let hasta = bloques.length;
      for (let i = desde + 1; i < bloques.length; i++) {
        if (corta(bloques[i][0])) { hasta = i; break; }
      }
      bloques = bloques.slice(desde, hasta);
    }
  }
  if (busca) bloques = bloques.filter(b => b[2].toLowerCase().includes(busca));

  const doc = el('div', { class: 'doc doc-legal' });
  if (!bloques.length) {
    doc.appendChild(el('div', { class: 'empty',
      text: busca ? `Ningún párrafo dice "${filtros.texto}".` : 'Nada que mostrar.' }));
  }

  bloques.forEach(([tipo, pagina, texto]) => {
    if (tipo === 'titulo') {
      doc.appendChild(el('h3', { class: 'legal-titulo' }, [
        el('span', { class: 'pag', text: 'Página ' + pagina + ' del PDF' }),
        el('span', { class: 'txt', text: texto.replace(/\s*\(p\.\s*\d+\)\s*$/, '') })
      ]));
    } else if (tipo === 'capitulo') {
      doc.appendChild(el('h4', { class: 'legal-capitulo', text: texto }));
    } else if (tipo === 'articulo') {
      const m = texto.match(/^((?:Art[íi]culo|Art\.)\s*\d+\s*[.ºª]?)\s*(.*)$/s);
      doc.appendChild(el('p', { class: 'legal-articulo' }, [
        el('b', { text: m ? m[1] : 'Artículo' }),
        document.createTextNode(' ' + (m ? m[2] : texto))
      ]));
    } else if (tipo === 'letra') {
      doc.appendChild(el('p', { class: 'legal-letra', text: texto }));
    } else {
      doc.appendChild(el('p', { text: texto }));
    }
  });

  if (!busca && seccionEstatuto === null && ESTATUTOS.vigencia.length) {
    raiz.appendChild(el('div', { class: 'enlace-spt otro' }, [
      el('b', { text: 'Vigencia' }),
      el('ul', {}, ESTATUTOS.vigencia.map(v => el('li', { text: v })))
    ]));
  }
  raiz.appendChild(doc);
}

function programaLectura(raiz) {
  const ejeFiltrado = filtros.eje ? Number(filtros.eje) : null;

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

    /* Las propuestas van en columnas: así el texto llena la pantalla sin que la
       línea se haga eterna en pantallas anchas. */
    let sub = null, rejilla = null;
    suyas.forEach(p => {
      if (p.sub !== sub) {
        sub = p.sub;
        doc.appendChild(el('h4', { text: sub }));
        rejilla = el('div', { class: 'props' });
        doc.appendChild(rejilla);
      }
      rejilla.appendChild(el('div', { class: 'prop' }, [
        el('b', {}, [el('span', { class: 'cod', text: p.c + '  ' }), document.createTextNode(p.t)]),
        parrafos(p.d || ''),
        el('div', { class: 'pie' }, [
          chipEstado(p.estado), chipNivel(avanceReal(p)),
          el('span', { style: 'font-size:12px;color:var(--ink-muted)',
            text: (equipoDe(p.eq) || { nombre: 'Sin equipo' }).nombre + ' · ' + pct(avanceReal(p)) }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Ficha', onclick: () => abrirPropuesta(p) })
        ])
      ]));
    });
  });

  if (!doc.querySelector('.prop')) doc.appendChild(el('div', { class: 'empty', text: 'Ninguna propuesta coincide con el filtro.' }));
  raiz.appendChild(doc);
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

function mostrarEstructura(visible) {
  const nav = document.querySelector('nav.tabs');
  const filtros = document.querySelector('#filtros');
  if (nav) nav.style.display = visible ? '' : 'none';
  if (filtros) filtros.style.display = visible ? '' : 'none';
}

/* Cambiar de módulo desde cualquier parte, no sólo desde la barra. */
function irAVista(destino) {
  vista = destino;
  marcarTab();
  render();
}
function marcarTab() {
  document.querySelectorAll('.tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
}

function render() {
  redibujables = [];
  UI.pintarConexion(document.querySelector('#conexion'));
  const raiz = $('#vista');
  raiz.innerHTML = '';

  /* La base pide sesión: nada se muestra hasta entrar. */
  if (Sesion.exigida && !Sesion.usuario) {
    mostrarEstructura(false);
    UI.pantallaLogin(raiz, () => { estado = construir(); mostrarEstructura(true); render(); });
    return;
  }
  mostrarEstructura(true);
  UI.pintarModulos(document.querySelector('#modulos'));
  UI.migas(document.querySelector('#migas'), ['FECh 2026', 'Conectómetro', {
    panel: 'Panel', propuestas: 'Propuestas', equipos: 'Equipos',
    proyecto: 'Proyecto', programa: 'Documentos' }[vista] || 'Panel']);
  if (vista === 'propuestas') vistaPropuestas(raiz);
  else if (vista === 'equipos') vistaEquipos(raiz);
  else if (vista === 'proyecto') vistaProyecto(raiz);
  else if (vista === 'programa') vistaPrograma(raiz);
  else vistaPanel(raiz);

  UI.alAbrir = () => redibujables.forEach(f => f());
  if (vista !== 'programa') UI.plegarTarjetas(raiz, vista);
}

async function iniciar() {
  Datos.alCambiarEstado = () => UI.pintarConexion(document.querySelector('#conexion'));
  await Datos.iniciar();
  const recuperadas = importarVersionAnterior();
  estado = construir();

  /* Lo que edita otra persona llega solo. */
  Datos.alCambioRemoto = () => { estado = construir(); render(); };
  addEventListener('focusout', () => setTimeout(() => Datos.soltarPendiente(), 150));
  if (recuperadas) console.info(`Se recuperaron ${recuperadas} propuestas de la versión anterior.`);

  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => irAVista(btn.dataset.vista)));

  const bind = (sel, campo) => $(sel).addEventListener('input', e => {
    filtros[campo] = e.target.value; render();
  });
  bind('#f-equipo', 'equipo'); bind('#f-eje', 'eje');
  bind('#f-estado', 'estado'); bind('#f-texto', 'texto');
  $('#f-limpiar').addEventListener('click', () => {
    filtros = { equipo: '', eje: '', estado: '', texto: '' };
    poblarFiltros(); render();
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
