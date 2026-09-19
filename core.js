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
                'hitos', 'agenda', 'integrantes', 'enlaces', 'calendarios'];

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
      return { url: this.limpiarUrl(global.SUPABASE_URL), clave: String(global.SUPABASE_ANON_KEY).trim() };
    }
    return null;
  },

  /* En el panel de Supabase conviven la Project URL y el endpoint REST. El
     cliente necesita la primera, así que le quitamos la cola si vino la otra. */
  limpiarUrl(url) {
    return String(url).trim()
      .replace(/\/+$/, '')
      .replace(/\/rest\/v1$/, '')
      .replace(/\/auth\/v1$/, '');
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
        await Sesion.recuperar();
        await this.leerTodo();
        this.modo = 'supabase';
        this.escuchar();
        this.anunciar('listo', 'Base compartida');
        return;
      } catch (e) {
        /* Si la base pide sesión, no es un error de conexión: es que hay que entrar. */
        if (/permission|denied|JWT|row-level|RLS/i.test(e.message || '')) {
          this.modo = 'supabase';
          Sesion.exigida = true;
          this.anunciar('sesion', 'Hay que iniciar sesión para ver los datos');
          return;
        }
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
    /* Los pasos dejan constancia de cuándo se tocaron: el resumen semanal
       necesita saber qué se cerró en los últimos siete días. */
    if (tabla === 'pasos') fila.actualizado = new Date().toISOString();
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
  },

  /* --------------------------------------------------------------- *
   * Tiempo real: lo que edita una persona aparece en la pantalla de
   * las demás sin recargar.
   * --------------------------------------------------------------- */
  canal: null,
  alCambioRemoto: null,
  cambioPendiente: false,
  _temporizador: null,

  escuchar() {
    if (this.modo !== 'supabase' || this.canal || !this.cliente.channel) return;
    this.canal = this.cliente.channel('conectometro');
    TABLAS.forEach(t => this.canal.on('postgres_changes',
      { event: '*', schema: 'public', table: t },
      carga => this.aplicarRemoto(t, carga)));
    this.canal.subscribe();
  },

  aplicarRemoto(tabla, carga) {
    const lista = this.tablas[tabla] || (this.tablas[tabla] = []);
    if (carga.eventType === 'DELETE') {
      const id = carga.old && carga.old.id;
      this.tablas[tabla] = lista.filter(f => f.id !== id);
    } else if (carga.new) {
      const i = lista.findIndex(f => f.id === carga.new.id);
      if (i >= 0) lista[i] = carga.new; else lista.push(carga.new);
    }
    this.avisarRemoto();
  },

  /* No repintamos encima de alguien que está escribiendo: se espera a que
     suelte el campo. */
  avisarRemoto() {
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => {
      const foco = document.activeElement;
      const escribiendo = foco && /^(INPUT|SELECT|TEXTAREA)$/.test(foco.tagName);
      if (escribiendo) { this.cambioPendiente = true; return; }
      this.cambioPendiente = false;
      if (this.alCambioRemoto) this.alCambioRemoto();
    }, 400);
  },

  soltarPendiente() {
    if (!this.cambioPendiente) return;
    this.cambioPendiente = false;
    if (this.alCambioRemoto) this.alCambioRemoto();
  }
};

/* ------------------------------------------------------------------ *
 * Sesión: correo y contraseña. Las cuentas las crea quien administra
 * desde el panel de Supabase; acá sólo se entra y se sale.
 * ------------------------------------------------------------------ */
const Sesion = {
  usuario: null,
  exigida: false,        /* se enciende si la base rechaza leer sin sesión */

  disponible() { return !!(Datos.cliente && Datos.cliente.auth); },

  async recuperar() {
    if (!this.disponible()) return null;
    try {
      const { data } = await Datos.cliente.auth.getSession();
      this.usuario = (data && data.session && data.session.user) || null;
    } catch (e) { this.usuario = null; }
    return this.usuario;
  },

  async entrar(correo, clave) {
    if (!this.disponible()) throw new Error('La base compartida no está conectada.');
    const { data, error } = await Datos.cliente.auth.signInWithPassword({
      email: String(correo).trim(), password: clave });
    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'Correo o contraseña incorrectos.' : error.message);
    this.usuario = data.user;
    return this.usuario;
  },

  async salir() {
    if (this.disponible()) await Datos.cliente.auth.signOut();
    this.usuario = null;
  },

  correo() { return this.usuario ? this.usuario.email : ''; }
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
    const clases = { listo: Datos.modo === 'supabase' ? 'ok' : 'local', error: 'error', sesion: 'error' };
    nodo.className = 'conexion ' + (clases[Datos.estado] || '');
    nodo.innerHTML = '';
    nodo.appendChild(UI.el('i', {}));
    nodo.appendChild(UI.el('span', { text:
      Datos.estado === 'error' ? 'Sin conexión'
      : Datos.estado === 'sesion' ? 'Sesión requerida'
      : Datos.modo === 'supabase' ? (Sesion.correo() || 'Base compartida')
      : Datos.estado === 'conectando' ? 'Conectando…' : 'Solo este navegador' }));
    nodo.title = Sesion.correo() ? `Sesión de ${Sesion.correo()}` : (Datos.mensaje || '');
    if (Sesion.usuario) {
      nodo.appendChild(UI.el('button', { class: 'x', type: 'button', text: 'salir',
        title: 'Cerrar sesión',
        onclick: async () => { await Sesion.salir(); location.reload(); } }));
    }
  },

  /* Pantalla de acceso. Aparece sólo cuando la base exige sesión. */
  pantallaLogin(raiz, alEntrar) {
    const correo = UI.el('input', { type: 'email', placeholder: 'tu correo', autocomplete: 'username' });
    const clave = UI.el('input', { type: 'password', placeholder: 'contraseña',
      autocomplete: 'current-password' });
    const error = UI.el('div', { class: 'error-login' });
    const boton = UI.el('button', { class: 'btn btn-primary', type: 'submit', text: 'Entrar' });

    const forma = UI.el('form', { class: 'login' }, [
      UI.el('h2', { text: 'Entrar al sistema' }),
      UI.el('p', { class: 'sub', text: 'Con el correo y la contraseña que te dieron en la Mesa.' }),
      UI.el('label', { class: 'field' }, [UI.el('span', { text: 'Correo' }), correo]),
      UI.el('label', { class: 'field' }, [UI.el('span', { text: 'Contraseña' }), clave]),
      error, boton
    ]);
    forma.addEventListener('submit', async ev => {
      ev.preventDefault();
      error.textContent = '';
      boton.disabled = true;
      boton.textContent = 'Entrando…';
      try {
        await Sesion.entrar(correo.value, clave.value);
        await Datos.iniciar();
        if (alEntrar) alEntrar();
      } catch (e) {
        error.textContent = e.message || 'No se pudo entrar.';
        boton.disabled = false;
        boton.textContent = 'Entrar';
      }
    });
    raiz.appendChild(UI.el('div', { class: 'card login-card' }, forma));
  },
  /* Aviso flotante, con la opción de deshacer lo que se acaba de borrar. */
  aviso(texto, accion) {
    let pila = document.getElementById('avisos');
    if (!pila) {
      pila = UI.el('div', { id: 'avisos', class: 'toast-stack' });
      document.body.appendChild(pila);
    }
    const caja = UI.el('div', { class: 'toast' }, [UI.el('span', { text: texto })]);
    let fuera = null;
    const cerrar = () => { clearTimeout(fuera); caja.remove(); };
    if (accion) caja.appendChild(UI.el('button', { class: 'btn btn-sm', type: 'button',
      text: accion.texto || 'Deshacer', onclick: () => { cerrar(); accion.hacer(); } }));
    caja.appendChild(UI.el('button', { class: 'x', type: 'button', text: '✕',
      'aria-label': 'Cerrar aviso', onclick: cerrar }));
    pila.appendChild(caja);
    fuera = setTimeout(cerrar, accion ? 9000 : 4000);
    return cerrar;
  },

  /* Borrar con red: se quita al tiro y queda 9 segundos para arrepentirse. */
  borrarConDeshacer(tabla, fila, etiqueta, alTerminar) {
    Datos.borrar(tabla, fila.id);
    if (alTerminar) alTerminar();
    UI.aviso(`${etiqueta} eliminado`, { hacer: () => {
      Datos.guardar(tabla, fila);
      if (alTerminar) alTerminar();
    } });
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

global.Sesion = Sesion;
global.Graficos = Graficos;
global.UI = UI;
global.Datos = Datos;
global.Modelo = Modelo;
global.uid = uid;
})(window);
