/* Capa compartida por el Conectómetro y el SPT.
 *
 * Un solo lugar donde viven los datos y dos modos de guardarlos:
 *   - local     : el navegador (localStorage), para trabajar sin conexión o probar
 *   - supabase  : base compartida, para que todo el equipo vea lo mismo
 *
 * La interfaz es la misma en los dos casos: el resto de la aplicación nunca
 * pregunta en qué modo está.
 */
(function (global) {
'use strict';

const CLAVE_LOCAL = 'conectometro/v3';
const CLAVE_CONEXION = 'conectometro/conexion';

/* Tablas de la base. El catálogo del programa (las 102 propuestas y su texto)
   no está acá: es fijo y viaja en data.js. */
const TABLAS = ['equipos', 'seguimiento', 'observaciones', 'proyectos', 'pasos',
                'hitos', 'agenda', 'integrantes', 'enlaces'];

const vacio = () => TABLAS.reduce((a, t) => (a[t] = [], a), {});

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));

const Datos = {
  modo: 'local',
  estado: 'desconectado',   // desconectado | conectando | listo | error
  mensaje: '',
  tablas: vacio(),
  cliente: null,
  alCambiarEstado: null,

  /* --------------------------------------------------------------- *
   * Conexión
   * --------------------------------------------------------------- */
  /* La conexión la entrega el servidor (Replit → config.js). No se pide ni se
     guarda en el navegador: así nadie tiene que pegar claves a mano. */
  conexionGuardada() {
    if (global.SUPABASE_URL && global.SUPABASE_ANON_KEY) {
      return { url: global.SUPABASE_URL, clave: global.SUPABASE_ANON_KEY };
    }
    return null;
  },

  anunciar(estado, mensaje) {
    this.estado = estado;
    this.mensaje = mensaje || '';
    if (this.alCambiarEstado) this.alCambiarEstado(estado, this.mensaje);
  },

  /* Arranca en el mejor modo disponible y deja los datos en memoria. */
  async iniciar() {
    const con = this.conexionGuardada();
    if (con && global.supabase && global.supabase.createClient) {
      try {
        this.anunciar('conectando', 'Conectando con la base compartida…');
        this.cliente = global.supabase.createClient(con.url, con.clave);
        await this.leerTodo();
        this.modo = 'supabase';
        this.anunciar('listo', 'Base compartida');
        return;
      } catch (e) {
        this.cliente = null;
        this.anunciar('error', 'No se pudo conectar: ' + (e.message || e) + '. Trabajando en este navegador.');
      }
    }
    this.modo = 'local';
    this.leerLocal();
    if (this.estado !== 'error') this.anunciar('listo', 'Solo en este navegador');
  },

  async leerTodo() {
    const nuevo = vacio();
    for (const t of TABLAS) {
      const { data, error } = await this.cliente.from(t).select('*');
      if (error) throw new Error(`tabla ${t}: ${error.message}`);
      nuevo[t] = data || [];
    }
    this.tablas = nuevo;
  },

  leerLocal() {
    try {
      const crudo = localStorage.getItem(CLAVE_LOCAL);
      if (crudo) {
        const d = JSON.parse(crudo);
        this.tablas = TABLAS.reduce((a, t) => (a[t] = Array.isArray(d[t]) ? d[t] : [], a), {});
        return;
      }
    } catch (e) { /* sin almacenamiento */ }
    this.tablas = vacio();
  },

  escribirLocal() {
    try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.tablas)); }
    catch (e) { /* sin almacenamiento: seguimos en memoria */ }
  },

  /* --------------------------------------------------------------- *
   * Lectura y escritura
   * --------------------------------------------------------------- */
  todo(tabla) { return this.tablas[tabla] || []; },
  uno(tabla, id) { return this.todo(tabla).find(f => f.id === id) || null; },

  /* Inserta o actualiza una fila. Devuelve la fila; la escritura remota
     va en segundo plano para que la pantalla no se quede esperando. */
  guardar(tabla, fila) {
    if (!fila.id) fila.id = uid();
    const lista = this.tablas[tabla];
    const i = lista.findIndex(f => f.id === fila.id);
    if (i >= 0) lista[i] = fila; else lista.push(fila);
    this.persistir(tabla, fila);
    return fila;
  },

  borrar(tabla, id) {
    this.tablas[tabla] = this.todo(tabla).filter(f => f.id !== id);
    if (this.modo === 'supabase') {
      this.cliente.from(tabla).delete().eq('id', id)
        .then(({ error }) => { if (error) this.anunciar('error', 'No se pudo borrar: ' + error.message); });
    } else this.escribirLocal();
  },

  persistir(tabla, fila) {
    if (this.modo !== 'supabase') { this.escribirLocal(); return; }
    this.cliente.from(tabla).upsert(fila)
      .then(({ error }) => {
        if (error) this.anunciar('error', 'No se pudo guardar: ' + error.message);
        else if (this.estado === 'error') this.anunciar('listo', 'Base compartida');
      });
  },

  /* Vuelve a leer la base: sirve para ver lo que cambiaron otras personas. */
  async refrescar() {
    if (this.modo !== 'supabase') return false;
    await this.leerTodo();
    return true;
  }
};

/* ------------------------------------------------------------------ *
 * Modelo común: la propuesta del programa y el proyecto del SPT
 * son la misma cosa vista desde dos lados.
 * ------------------------------------------------------------------ */
const Modelo = {
  ORIGEN_PROGRAMA: 'Ejes del Programa',

  seguimiento(codigo) {
    let s = Datos.todo('seguimiento').find(f => f.codigo === codigo);
    if (!s) s = { id: uid(), codigo, estado: 'no_iniciada', avance: 0, plazo: '' };
    return s;
  },

  proyectoDe(codigo) {
    return Datos.todo('proyectos').find(p => p.propuesta === codigo) || null;
  },

  pasosDe(proyectoId) {
    return Datos.todo('pasos')
      .filter(p => p.proyecto === proyectoId)
      .sort((a, b) => (a.n || 0) - (b.n || 0));
  },

  /* Los pasos del proyecto son las etapas de la propuesta. */
  etapasDe(codigo) {
    const pr = this.proyectoDe(codigo);
    return pr ? this.pasosDe(pr.id) : [];
  },

  /* Crea el proyecto en el SPT a partir de una propuesta del programa. */
  crearProyectoDesde(propuesta, extra) {
    /* El id se deriva del código de la propuesta: si dos personas crean el
       proyecto al mismo tiempo, queda uno solo y no dos. */
    const pr = Datos.guardar('proyectos', Object.assign({
      id: 'prj:' + propuesta.c,
      nombre: propuesta.t,
      propuesta: propuesta.c,
      estado: 'Activo',
      clasificacion: 'Interno',
      naturaleza: 'Programático',
      origen: this.ORIGEN_PROGRAMA,
      plazo_tipo: '',
      urgencia: '',
      designados: [],
      plazo_final: '',
      creado: new Date().toISOString()
    }, extra || {}));
    return pr;
  },

  proyectoPara(propuesta) {
    return this.proyectoDe(propuesta.c) || this.crearProyectoDesde(propuesta);
  },

  agregarPaso(proyectoId, descripcion, extra) {
    const n = this.pasosDe(proyectoId).length + 1;
    return Datos.guardar('pasos', Object.assign({
      id: uid(), proyecto: proyectoId, n, descripcion,
      plazo: '', estado: 'Pendiente', encargados: []
    }, extra || {}));
  },

  avancePorPasos(pasos) {
    if (!pasos.length) return null;
    return Math.round(pasos.filter(p => p.estado === 'Completado').length / pasos.length * 100);
  }
};

/* ------------------------------------------------------------------ *
 * Ayudantes de interfaz compartidos
 * ------------------------------------------------------------------ */
const UI = {
  $: sel => document.querySelector(sel),
  el(tag, attrs = {}, hijos = []) {
    const n = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    }
    (Array.isArray(hijos) ? hijos : [hijos]).forEach(h => h && n.appendChild(h));
    return n;
  },
  pct: v => `${Math.round(v)}%`,
  hoy: () => new Date().toISOString().slice(0, 10),
  recorta: (t, max) => (String(t).length > max ? String(t).slice(0, max - 1) + '…' : String(t)),
  fechaCorta(iso) {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? iso + 'T12:00' : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  },
  horaDe(iso) {
    if (!iso || iso.length <= 10) return '';
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  },
  /* Marca el estado de la conexión en la barra superior. */
  pintarConexion(nodo) {
    if (!nodo) return;
    const clases = { listo: Datos.modo === 'supabase' ? 'ok' : 'local', error: 'error' };
    nodo.className = 'conexion ' + (clases[Datos.estado] || '');
    nodo.innerHTML = '';
    nodo.appendChild(UI.el('i', {}));
    nodo.appendChild(UI.el('span', { text:
      Datos.estado === 'error' ? 'Sin conexión'
      : Datos.modo === 'supabase' ? 'Base compartida'
      : Datos.estado === 'conectando' ? 'Conectando…' : 'Solo este navegador' }));
    nodo.title = Datos.mensaje || '';
  },
  /* Tema claro / oscuro, igual en las dos secciones. */
  botonTema(boton, alCambiar) {
    if (!boton) return;
    boton.addEventListener('click', () => {
      const actual = document.documentElement.dataset.theme;
      const oscuro = actual ? actual === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = oscuro ? 'light' : 'dark';
      if (alCambiar) alCambiar();
    });
  }
};

/* ------------------------------------------------------------------ *
 * Gráficos propios: SVG a mano, sin librerías.
 * Barras finas, extremo redondeado de 4px, separación de 2px entre marcas,
 * etiqueta de valor en la punta y lectura al pasar el cursor.
 * ------------------------------------------------------------------ */
const Graficos = {
  ns: 'http://www.w3.org/2000/svg',

  nodo(tag, attrs = {}) {
    const n = document.createElementNS(this.ns, tag);
    for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  },

  texto(attrs, contenido) {
    const t = this.nodo('text', attrs);
    t.textContent = contenido;
    return t;
  },

  /* Barra con la punta redondeada y la base recta. */
  camino(x, y, w, h, r = 4) {
    const rr = Math.max(0, Math.min(r, w));
    return `M${x},${y} H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${y + rr} ` +
           `V${y + h - rr} A${rr},${rr} 0 0 1 ${x + w - rr},${y + h} H${x} Z`;
  },

  tooltip(nodo, titulo, filas) {
    const caja = document.getElementById('tt');
    if (!caja) return;
    const mostrar = ev => {
      caja.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = titulo;
      caja.appendChild(b);
      filas.forEach(f => {
        const d = document.createElement('div');
        const s = document.createElement('span');
        s.textContent = f[0] + ': ';
        d.appendChild(s);
        d.appendChild(document.createTextNode(f[1]));
        caja.appendChild(d);
      });
      caja.hidden = false;
      const r = caja.getBoundingClientRect();
      caja.style.left = Math.min(ev.clientX + 14, innerWidth - r.width - 8) + 'px';
      caja.style.top = Math.max(8, ev.clientY - r.height - 12) + 'px';
    };
    nodo.addEventListener('pointermove', mostrar);
    nodo.addEventListener('pointerleave', () => { caja.hidden = true; });
    nodo.addEventListener('focus', () => {
      const r = nodo.getBoundingClientRect();
      mostrar({ clientX: r.x + 60, clientY: r.y + 26 });
    });
    nodo.addEventListener('blur', () => { caja.hidden = true; });
  },

  /* Barras horizontales. datos: [{etiqueta, valor, color, detalle:[[k,v]], sufijo}] */
  barras(datos, ancho, opciones = {}) {
    const o = Object.assign({ max: null, sufijo: '%', filaH: 26, etiquetaW: null,
      umbrales: [], color: 'var(--ramp-3)' }, opciones);
    const filaH = o.filaH, barraH = Math.min(16, filaH - 10), topo = o.umbrales.length ? 20 : 4, base = 4;
    const etiquetaW = o.etiquetaW || Math.max(96, Math.min(200, Math.round(ancho * 0.32)));
    const valorW = 44;
    const x0 = etiquetaW + 8;
    const escalaW = Math.max(40, ancho - x0 - valorW - 4);
    const alto = topo + datos.length * filaH + base;
    const max = o.max || Math.max(1, ...datos.map(d => d.valor));

    const svg = this.nodo('svg', { class: 'chart', width: ancho, height: alto,
      viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': o.titulo || 'Gráfico de barras' });
    const X = v => x0 + (v / max) * escalaW;

    o.umbrales.forEach((u, i) => {
      svg.appendChild(this.nodo('line', { x1: X(u), x2: X(u), y1: topo - 8, y2: alto - base,
        stroke: 'var(--grid)', 'stroke-width': 1 }));
      if (escalaW / max * (o.umbrales[1] ? o.umbrales[1] - o.umbrales[0] : max) >= 24)
        svg.appendChild(this.texto({ x: X(u), y: topo - 11, 'text-anchor': i === o.umbrales.length - 1 ? 'end' : 'middle',
          fill: 'var(--ink-muted)', 'font-size': 10 }, u + o.sufijo));
    });

    datos.forEach((d, i) => {
      const y = topo + i * filaH;
      const yb = y + (filaH - barraH) / 2;
      svg.appendChild(this.texto({ x: etiquetaW, y: y + filaH / 2 + 4, 'text-anchor': 'end',
        fill: 'var(--ink-2)', 'font-size': 12 },
        UI.recorta(d.etiqueta, Math.floor(etiquetaW / 6.4))));
      svg.appendChild(this.nodo('rect', { x: x0, y: yb, width: escalaW, height: barraH, rx: 4,
        fill: 'var(--track)' }));
      const w = Math.max(0, (d.valor / max) * escalaW);
      if (w > 0.5) svg.appendChild(this.nodo('path', { d: this.camino(x0, yb, w, barraH),
        fill: d.color || o.color }));
      svg.appendChild(this.texto({ x: ancho - 2, y: y + filaH / 2 + 4, 'text-anchor': 'end',
        fill: 'var(--ink)', 'font-size': 12, 'font-weight': 600 },
        (d.texto !== undefined ? d.texto : d.valor + o.sufijo)));

      const hit = this.nodo('rect', { x: 0, y, width: ancho, height: filaH, fill: 'transparent', tabindex: 0 });
      this.tooltip(hit, d.etiqueta, d.detalle || [['Valor', d.valor + o.sufijo]]);
      svg.appendChild(hit);
    });
    return svg;
  },

  /* Barra 100% apilada. segmentos: [{etiqueta, valor, color}] */
  apilada(segmentos, ancho, alto = 26) {
    const svg = this.nodo('svg', { class: 'chart', width: ancho, height: alto + 4,
      viewBox: `0 0 ${ancho} ${alto + 4}`, role: 'img', 'aria-label': 'Reparto' });
    const utiles = segmentos.filter(s => s.valor > 0);
    const total = utiles.reduce((a, s) => a + s.valor, 0) || 1;
    let x = 0;
    utiles.forEach((s, i) => {
      const hueco = i < utiles.length - 1 ? 2 : 0;
      const w = Math.max(0, (s.valor / total) * ancho - hueco);
      const g = this.nodo('g', { tabindex: 0 });
      g.appendChild(this.nodo('rect', { x, y: 2, width: w, height: alto, rx: 4, fill: s.color }));
      if (w > 28) g.appendChild(this.texto({ x: x + w / 2, y: alto / 2 + 7, 'text-anchor': 'middle',
        'font-size': 11.5, 'font-weight': 600, fill: s.tinta || '#fff' }, String(s.valor)));
      this.tooltip(g, s.etiqueta, [['Cantidad', String(s.valor)],
        ['Del total', Math.round(s.valor / total * 100) + '%']]);
      svg.appendChild(g);
      x += w + hueco;
    });
    return svg;
  },

  leyenda(items) {
    const cont = UI.el('div', { class: 'legend' });
    items.forEach(it => cont.appendChild(UI.el('span', {}, [
      UI.el('i', { style: `background:${it.color}` }),
      document.createTextNode(it.etiqueta)
    ])));
    return cont;
  },

  /* Tarjeta con gráfico y su tabla equivalente, para que ningún dato quede
     sólo en el color. */
  tarjeta(titulo, sub, dibujar, tabla) {
    const card = UI.el('div', { class: 'card compacta' });
    const btn = UI.el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Tabla' });
    card.appendChild(UI.el('div', { class: 'toolbar' }, [
      UI.el('div', {}, [UI.el('h2', { text: titulo }), UI.el('div', { class: 'sub', text: sub })]),
      UI.el('span', { class: 'count' }), btn
    ]));
    const caja = UI.el('div', {});
    card.appendChild(caja);
    let modo = false;
    const pintar = () => {
      caja.innerHTML = '';
      if (modo && tabla) { caja.appendChild(tabla()); return; }
      const ancho = Math.max(260, caja.clientWidth || card.clientWidth - 30);
      const r = dibujar(ancho);
      (Array.isArray(r) ? r : [r]).forEach(n => n && caja.appendChild(n));
    };
    btn.addEventListener('click', () => { modo = !modo; btn.textContent = modo ? 'Gráfico' : 'Tabla'; pintar(); });
    if (!tabla) btn.remove();
    requestAnimationFrame(pintar);
    (global.REDIBUJAR = global.REDIBUJAR || []).push(pintar);
    return card;
  }
};

global.Graficos = Graficos;
global.UI = UI;
global.Datos = Datos;
global.Modelo = Modelo;
global.uid = uid;
})(window);
