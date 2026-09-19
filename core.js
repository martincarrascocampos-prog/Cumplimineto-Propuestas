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
  conexionGuardada() {
    if (global.SUPABASE_URL && global.SUPABASE_ANON_KEY) {
      return { url: global.SUPABASE_URL, clave: global.SUPABASE_ANON_KEY, origen: 'servidor' };
    }
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CONEXION) || 'null');
      if (c && c.url && c.clave) return { ...c, origen: 'navegador' };
    } catch (e) { /* sin almacenamiento */ }
    return null;
  },

  guardarConexion(url, clave) {
    try { localStorage.setItem(CLAVE_CONEXION, JSON.stringify({ url: url.trim(), clave: clave.trim() })); }
    catch (e) { /* sin almacenamiento */ }
  },

  olvidarConexion() {
    try { localStorage.removeItem(CLAVE_CONEXION); } catch (e) { /* nada */ }
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

global.UI = UI;
global.Datos = Datos;
global.Modelo = Modelo;
global.uid = uid;
})(window);
