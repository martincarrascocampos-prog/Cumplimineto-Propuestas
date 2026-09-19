/* SPT · Secretaría de Participación — proyectos, pasos, plazos y agenda.
   Comparte la base de datos con el Conectómetro: un proyecto con origen
   "Ejes del Programa" es una propuesta del programa vista desde el trabajo. */
(function () {
'use strict';

const { $, el, pct, hoy, recorta, fechaCorta, horaDe } = UI;

let vista = 'tablero';
let filtros = { estado: 'Activo', urgencia: '', naturaleza: '', persona: '', texto: '' };
let abiertos = {};   // qué proyectos están desplegados

/* ------------------------------------------------------------------ *
 * Consultas sobre los datos
 * ------------------------------------------------------------------ */
const proyectos = () => Datos.todo('proyectos');
const pasosDe = id => Modelo.pasosDe(id);
const hitosDe = id => Datos.todo('hitos').filter(h => h.proyecto === id);
const integrantes = () => Datos.todo('integrantes');
const nombres = () => integrantes().map(i => i.nombre).filter(Boolean);

const avanceDe = id => {
  const p = pasosDe(id);
  const utiles = p.filter(x => x.estado !== 'No aplica');
  if (!utiles.length) return 0;
  return Math.round(utiles.filter(x => x.estado === 'Completado').length / utiles.length * 100);
};

const propuestaDe = pr => {
  if (!pr.propuesta) return null;
  const b = PROPUESTAS_BASE.find(x => x[0] === pr.propuesta);
  return b ? { c: b[0], eje: b[1], sub: b[2], t: b[3], d: b[5] } : null;
};

const vencidos = id => pasosDe(id).filter(p => p.plazo && p.estado === 'Pendiente' && p.plazo < hoy()).length;

function filtrados() {
  const t = filtros.texto.trim().toLowerCase();
  return proyectos().filter(pr => {
    if (filtros.estado && (pr.estado || 'Activo') !== filtros.estado) return false;
    if (filtros.urgencia && pr.urgencia !== filtros.urgencia) return false;
    if (filtros.naturaleza && pr.naturaleza !== filtros.naturaleza) return false;
    if (filtros.persona) {
      const enProyecto = (pr.designados || []).includes(filtros.persona);
      const enPasos = pasosDe(pr.id).some(p => (p.encargados || []).includes(filtros.persona));
      if (!enProyecto && !enPasos) return false;
    }
    if (t) {
      const texto = (pr.nombre + ' ' + pasosDe(pr.id).map(p => p.descripcion).join(' ')).toLowerCase();
      if (!texto.includes(t)) return false;
    }
    return true;
  }).sort((a, b) =>
    (SPT.pesoUrgencia[b.urgencia] || 0) - (SPT.pesoUrgencia[a.urgencia] || 0) ||
    String(a.nombre).localeCompare(String(b.nombre)));
}

/* ------------------------------------------------------------------ *
 * Piezas de interfaz
 * ------------------------------------------------------------------ */
const tag = (txt, clase) => txt ? el('span', { class: 'tag ' + (clase || ''), text: txt }) : null;

function selector(opciones, valor, alCambiar, vacio) {
  const s = el('select', {});
  if (vacio !== null) s.appendChild(el('option', { value: '', text: vacio || '—' }));
  opciones.forEach(o => s.appendChild(el('option', { value: o, text: o })));
  s.value = valor || '';
  s.addEventListener('change', () => alCambiar(s.value));
  return s;
}

function barra(valor) {
  const n = valor >= 90 ? 'var(--ramp-5)' : valor >= 80 ? 'var(--ramp-4)'
    : valor >= 70 ? 'var(--ramp-3)' : valor >= 50 ? 'var(--ramp-2)' : 'var(--ramp-1)';
  return el('span', { class: 'bar-mini', style: 'max-width:180px' },
    el('i', { style: `width:${valor}%; background:${n}` }));
}

/* ------------------------------------------------------------------ *
 * Vista: Tablero
 * ------------------------------------------------------------------ */
function vistaTablero(raiz) {
  const lista = filtrados();
  const activos = proyectos().filter(p => (p.estado || 'Activo') === 'Activo');
  const todosPasos = Datos.todo('pasos');
  const pendientes = todosPasos.filter(p => p.estado === 'Pendiente');
  const atrasados = pendientes.filter(p => p.plazo && p.plazo < hoy());
  const avanceMedio = activos.length
    ? Math.round(activos.reduce((a, p) => a + avanceDe(p.id), 0) / activos.length) : 0;

  const kpis = el('div', { class: 'kpis' });
  [['Proyectos activos', String(activos.length)], ['Avance promedio', pct(avanceMedio)],
   ['Pasos pendientes', String(pendientes.length)], ['Pasos atrasados', String(atrasados.length)]]
    .forEach(([t, v]) => kpis.appendChild(el('div', { class: 'kpi' }, [
      el('b', { text: v }), el('span', { text: t })])));

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Tablero de la secretaría' }),
    el('div', { class: 'sub', text: 'El trabajo de la semana, ordenado por urgencia' }),
    kpis
  ]));

  if (!proyectos().length) {
    raiz.appendChild(el('div', { class: 'card' }, [
      el('h2', { text: 'Todavía no hay proyectos' }),
      el('div', { class: 'sub', text: 'Así se parte' }),
      el('div', { class: 'note' }, [
        el('p', { text: 'Un proyecto puede nacer de dos lados: de una propuesta del programa ' +
          '(y entonces su avance sube solo en el Conectómetro), o del trabajo propio de la secretaría.' }),
        el('p', { text: 'Cada proyecto se divide en pasos, y cada paso tiene plazo, estado y encargados.' })
      ]),
      el('div', { class: 'toolbar', style: 'margin-top:12px' }, [
        el('button', { class: 'btn btn-primary', type: 'button', text: 'Crear el primer proyecto',
          onclick: () => { vista = 'proyectos'; marcarTab(); render(); } })
      ])
    ]));
    return;
  }

  /* Lo que vence pronto */
  const proximos = Datos.todo('pasos')
    .filter(p => p.estado === 'Pendiente' && p.plazo)
    .sort((a, b) => a.plazo.localeCompare(b.plazo))
    .slice(0, 12);
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Próximos vencimientos' }),
    el('div', { class: 'sub', text: 'Pasos pendientes con fecha, del más próximo al más lejano' })
  ]);
  if (!proximos.length) card.appendChild(el('div', { class: 'empty', text: 'Ningún paso tiene plazo todavía.' }));
  else {
    const t = el('table');
    t.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: 'Plazo' }), el('th', { text: 'Paso' }), el('th', { text: 'Proyecto' }),
      el('th', { text: 'Encargados' })
    ])));
    const tb = el('tbody');
    proximos.forEach(p => {
      const pr = proyectos().find(x => x.id === p.proyecto);
      tb.appendChild(el('tr', {}, [
        el('td', { class: p.plazo < hoy() ? 'vencido' : '',
          style: p.plazo < hoy() ? 'color:var(--critical)' : '', text: fechaCorta(p.plazo) }),
        el('td', { text: p.descripcion }),
        el('td', { text: pr ? recorta(pr.nombre, 40) : '—' }),
        el('td', { text: (p.encargados || []).join(', ') || '—' })
      ]));
    });
    t.appendChild(tb);
    card.appendChild(el('div', { class: 'tablewrap' }, t));
  }
  raiz.appendChild(card);

  /* Avance por proyecto */
  const card2 = el('div', { class: 'card' }, [
    el('h2', { text: 'Avance por proyecto' }),
    el('div', { class: 'sub', text: `${lista.length} proyectos con el filtro actual` })
  ]);
  lista.forEach(pr => {
    const a = avanceDe(pr.id);
    const v = vencidos(pr.id);
    card2.appendChild(el('div', { class: 'nodo' }, el('div', { class: 'nodo-head' }, [
      el('button', { class: 'linktitle tit', type: 'button', text: pr.nombre,
        onclick: () => { vista = 'proyectos'; abiertos[pr.id] = true; marcarTab(); render(); } }),
      pr.urgencia ? tag(pr.urgencia, pr.urgencia.startsWith('Urgente') ? 'urgente'
        : pr.urgencia === 'Prioritario' ? 'prioritario' : '') : null,
      barra(a),
      el('span', { style: 'font-size:12.5px;color:var(--ink-muted)', text:
        `${pct(a)} · ${pasosDe(pr.id).filter(x => x.estado === 'Completado').length}/${pasosDe(pr.id).length} pasos` +
        (v ? ` · ${v} atrasado${v > 1 ? 's' : ''}` : '') })
    ])));
  });
  raiz.appendChild(card2);
}

/* ------------------------------------------------------------------ *
 * Vista: Proyectos
 * ------------------------------------------------------------------ */
function vistaProyectos(raiz) {
  raiz.appendChild(formularioNuevo());
  const lista = filtrados();
  if (!lista.length) {
    raiz.appendChild(el('div', { class: 'card' },
      el('div', { class: 'empty', text: 'Ningún proyecto coincide con el filtro.' })));
    return;
  }
  const cont = el('div', {});
  lista.forEach(pr => cont.appendChild(tarjetaProyecto(pr)));
  raiz.appendChild(cont);
}

function formularioNuevo() {
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Nuevo proyecto' }),
    el('div', { class: 'sub', text: 'Desde una propuesta del programa, o del trabajo propio de la secretaría' })
  ]);

  const yaLigadas = new Set(proyectos().map(p => p.propuesta).filter(Boolean));
  const disponibles = PROPUESTAS_BASE.filter(b => !yaLigadas.has(b[0]));

  const selProp = el('select', {});
  selProp.appendChild(el('option', { value: '', text: '— trabajo propio de la secretaría —' }));
  disponibles.forEach(b => selProp.appendChild(el('option', { value: b[0], text: `${b[0]}  ${recorta(b[3], 58)}` })));

  const inNombre = el('input', { type: 'text', placeholder: 'Nombre del proyecto' });
  selProp.addEventListener('change', () => {
    const b = PROPUESTAS_BASE.find(x => x[0] === selProp.value);
    if (b) inNombre.value = b[3];
  });

  const selClas = selector(SPT.listas.clasificacion, 'Interno', () => {}, null);
  const selPlazo = selector(SPT.listas.plazo, '', () => {});
  const selUrg = selector(SPT.listas.urgencia, 'Estándar', () => {}, null);

  card.appendChild(el('div', { class: 'form-grid' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Propuesta del programa' }), selProp]),
    el('label', { class: 'field' }, [el('span', { text: 'Nombre' }), inNombre]),
    el('label', { class: 'field' }, [el('span', { text: 'Clasificación' }), selClas]),
    el('label', { class: 'field' }, [el('span', { text: 'Priorización en el tiempo' }), selPlazo]),
    el('label', { class: 'field' }, [el('span', { text: 'Urgencia' }), selUrg])
  ]));

  card.appendChild(el('div', { class: 'toolbar', style: 'margin:12px 0 0' }, [
    el('button', { class: 'btn btn-primary', type: 'button', text: 'Crear proyecto', onclick: () => {
      const nombre = inNombre.value.trim();
      if (!nombre) { inNombre.focus(); return; }
      const b = PROPUESTAS_BASE.find(x => x[0] === selProp.value);
      const pr = Datos.guardar('proyectos', {
        id: uid(), nombre,
        propuesta: b ? b[0] : null,
        estado: 'Activo',
        clasificacion: selClas.value,
        naturaleza: b ? 'Programático' : 'No Programático',
        origen: b ? Modelo.ORIGEN_PROGRAMA : 'N/A',
        plazo_tipo: selPlazo.value,
        urgencia: selUrg.value,
        designados: [],
        plazo_final: '',
        creado: new Date().toISOString()
      });
      abiertos[pr.id] = true;
      inNombre.value = ''; selProp.value = '';
      render();
    } }),
    el('span', { class: 'count', text: `${disponibles.length} propuestas del programa sin proyecto` })
  ]));
  return card;
}

function tarjetaProyecto(pr) {
  const card = el('div', { class: 'proyecto' });
  const prop = propuestaDe(pr);
  const a = avanceDe(pr.id);
  const abierto = !!abiertos[pr.id];

  const cabeza = el('div', { class: 'proyecto-head' }, [
    el('button', { class: 'linktitle tit', type: 'button', text: pr.nombre,
      onclick: () => { abiertos[pr.id] = !abierto; render(); } }),
    barra(a),
    el('span', { style: 'font-size:12.5px;color:var(--ink-muted)', text:
      `${pct(a)} · ${pasosDe(pr.id).length} pasos` })
  ]);
  card.appendChild(cabeza);

  const meta = el('div', { class: 'meta' }, [
    prop ? tag(`Programa ${prop.c}`, 'programa') : tag('Trabajo propio'),
    tag(pr.clasificacion), tag(pr.naturaleza),
    tag(pr.plazo_tipo),
    pr.urgencia ? tag(pr.urgencia, pr.urgencia.startsWith('Urgente') ? 'urgente'
      : pr.urgencia === 'Prioritario' ? 'prioritario' : '') : null,
    (pr.designados || []).length ? tag('👥 ' + pr.designados.join(', ')) : null,
    (pr.estado === 'Terminado') ? tag('Terminado') : null
  ]);
  card.appendChild(meta);

  if (!abierto) return card;

  /* --- edición del proyecto --- */
  const guardaCampo = (campo, valor) => { pr[campo] = valor; Datos.guardar('proyectos', pr); };
  card.appendChild(el('div', { class: 'form-grid', style: 'margin-top:14px' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Estado' }),
      selector(SPT.listas.estadoProyecto, pr.estado || 'Activo', v => { guardaCampo('estado', v); render(); }, null)]),
    el('label', { class: 'field' }, [el('span', { text: 'Clasificación' }),
      selector(SPT.listas.clasificacion, pr.clasificacion, v => guardaCampo('clasificacion', v))]),
    el('label', { class: 'field' }, [el('span', { text: 'Naturaleza' }),
      selector(SPT.listas.naturaleza, pr.naturaleza, v => guardaCampo('naturaleza', v))]),
    el('label', { class: 'field' }, [el('span', { text: 'Origen' }),
      selector(SPT.listas.origen, pr.origen, v => guardaCampo('origen', v))]),
    el('label', { class: 'field' }, [el('span', { text: 'Priorización en el tiempo' }),
      selector(SPT.listas.plazo, pr.plazo_tipo, v => { guardaCampo('plazo_tipo', v); })]),
    el('label', { class: 'field' }, [el('span', { text: 'Urgencia' }),
      selector(SPT.listas.urgencia, pr.urgencia, v => { guardaCampo('urgencia', v); render(); })]),
    el('label', { class: 'field' }, [el('span', { text: 'Plazo final' }),
      (() => {
        const f = el('input', { type: 'date', value: pr.plazo_final || '' });
        f.addEventListener('change', () => guardaCampo('plazo_final', f.value));
        return f;
      })()])
  ]));

  /* designados */
  const cajaPersonas = el('div', { class: 'meta', style: 'margin-top:10px' });
  const pintarPersonas = () => {
    cajaPersonas.innerHTML = '';
    if (!nombres().length) {
      cajaPersonas.appendChild(el('span', { style: 'font-size:12.5px;color:var(--ink-muted)',
        text: 'Agrega integrantes en la pestaña Equipo para poder designar.' }));
      return;
    }
    nombres().forEach(n => {
      const activo = (pr.designados || []).includes(n);
      cajaPersonas.appendChild(el('button', {
        class: 'tag' + (activo ? ' programa' : ''), type: 'button', text: (activo ? '✓ ' : '+ ') + n,
        onclick: () => {
          const d = new Set(pr.designados || []);
          activo ? d.delete(n) : d.add(n);
          pr.designados = [...d];
          Datos.guardar('proyectos', pr);
          pintarPersonas();
        } }));
    });
  };
  pintarPersonas();
  card.appendChild(el('div', { style: 'margin-top:12px' }, [
    el('div', { style: 'font-size:12px;color:var(--ink-muted);margin-bottom:4px', text: 'Designados' }),
    cajaPersonas
  ]));

  /* --- pasos --- */
  const caja = el('div', { style: 'margin-top:14px' });
  const pintarPasos = () => {
    caja.innerHTML = '';
    caja.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-muted);margin-bottom:4px',
      text: 'Pasos' }));
    const pasos = pasosDe(pr.id);
    if (!pasos.length) caja.appendChild(el('div', { style: 'font-size:13px;color:var(--ink-muted);padding:6px 0',
      text: 'Sin pasos todavía.' }));

    pasos.forEach((paso, i) => {
      const listo = paso.estado === 'Completado';
      const atrasado = paso.plazo && paso.estado === 'Pendiente' && paso.plazo < hoy();

      const chk = el('input', { type: 'checkbox', 'aria-label': 'Paso completado' });
      chk.checked = listo;
      chk.addEventListener('change', () => {
        paso.estado = chk.checked ? 'Completado' : 'Pendiente';
        Datos.guardar('pasos', paso);
        pintarPasos(); refrescarCabeza();
      });

      const desc = el('input', { type: 'text', class: 'col2', value: paso.descripcion });
      desc.addEventListener('change', () => { paso.descripcion = desc.value; Datos.guardar('pasos', paso); });

      const fecha = el('input', { type: 'date', value: paso.plazo || '' });
      fecha.addEventListener('change', () => { paso.plazo = fecha.value; Datos.guardar('pasos', paso); pintarPasos(); });

      const est = selector(SPT.listas.estadoPaso, paso.estado || 'Pendiente', v => {
        paso.estado = v; Datos.guardar('pasos', paso); pintarPasos(); refrescarCabeza();
      }, null);

      const enc = el('select', { multiple: 'multiple', size: 1, 'aria-label': 'Encargados',
        title: 'Encargados del paso' });
      nombres().forEach(n => {
        const o = el('option', { value: n, text: n });
        if ((paso.encargados || []).includes(n)) o.selected = true;
        enc.appendChild(o);
      });
      enc.addEventListener('change', () => {
        paso.encargados = [...enc.selectedOptions].map(o => o.value).slice(0, 2);
        Datos.guardar('pasos', paso);
      });

      const fila = el('div', { class: 'paso' + (listo ? ' listo' : '') }, [
        el('span', { class: 'n', text: String(i + 1) }), chk, desc, fecha, est, enc,
        el('button', { class: 'x', type: 'button', text: '✕', title: 'Eliminar paso',
          onclick: () => { Datos.borrar('pasos', paso.id); pintarPasos(); refrescarCabeza(); } })
      ]);
      if (atrasado) fecha.classList.add('vencido');
      caja.appendChild(fila);
    });

    const nuevo = el('input', { type: 'text', placeholder: 'Nuevo paso…', style: 'max-width:340px' });
    const agregar = () => {
      const t = nuevo.value.trim();
      if (!t) return;
      Modelo.agregarPaso(pr.id, t);
      nuevo.value = '';
      pintarPasos(); refrescarCabeza();
    };
    nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
    caja.appendChild(el('div', { class: 'fila', style: 'margin-top:10px; display:flex; gap:8px' }, [
      nuevo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar paso', onclick: agregar })
    ]));
  };

  const refrescarCabeza = () => {
    const a2 = avanceDe(pr.id);
    cabeza.replaceChild(barra(a2), cabeza.children[1]);
    cabeza.children[2].textContent = `${pct(a2)} · ${pasosDe(pr.id).length} pasos`;
  };

  pintarPasos();
  card.appendChild(caja);

  /* --- hitos --- */
  const cajaHitos = el('div', { style: 'margin-top:16px' });
  const pintarHitos = () => {
    cajaHitos.innerHTML = '';
    cajaHitos.appendChild(el('div', { style: 'font-size:12px;color:var(--ink-muted);margin-bottom:4px',
      text: 'Hitos' }));
    const hitos = hitosDe(pr.id);
    if (!hitos.length) cajaHitos.appendChild(el('div', { style: 'font-size:13px;color:var(--ink-muted)',
      text: 'Sin hitos.' }));
    hitos.forEach(h => {
      const f = el('input', { type: 'date', value: h.fecha || '', style: 'max-width:150px' });
      f.addEventListener('change', () => { h.fecha = f.value; Datos.guardar('hitos', h); });
      cajaHitos.appendChild(el('div', { class: 'fila', style: 'display:flex; gap:8px; align-items:center; padding:4px 0' }, [
        el('span', { style: 'flex:1', text: h.detalle }), f,
        el('button', { class: 'x', type: 'button', text: '✕',
          onclick: () => { Datos.borrar('hitos', h.id); pintarHitos(); } })
      ]));
    });
    const nuevo = el('input', { type: 'text', placeholder: 'Nuevo hito…', style: 'max-width:340px' });
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

  /* --- pie: vínculo con el programa y eliminar --- */
  const pie = el('div', { class: 'toolbar', style: 'margin:16px 0 0' });
  if (prop) pie.appendChild(el('a', { class: 'btn btn-sm', href: `index.html#${prop.c}`,
    text: `Ver ${prop.c} en el Conectómetro` }));
  pie.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'Agendar reunión',
    onclick: () => {
      Datos.guardar('agenda', { id: uid(), tema: 'Reunión — ' + pr.nombre, inicio: '', duracion: 60,
        formato: 'Presencial', lugar: '', invitados: (pr.designados || []).join(', '),
        estado: 'Por agendar', proyecto: pr.id });
      vista = 'agenda'; marcarTab(); render();
    } }));
  pie.appendChild(el('button', { class: 'btn btn-sm', type: 'button', text: 'Eliminar proyecto',
    onclick: () => {
      if (!confirm(`¿Eliminar "${pr.nombre}" y sus ${pasosDe(pr.id).length} pasos?`)) return;
      pasosDe(pr.id).forEach(p => Datos.borrar('pasos', p.id));
      hitosDe(pr.id).forEach(h => Datos.borrar('hitos', h.id));
      Datos.borrar('proyectos', pr.id);
      render();
    } }));
  card.appendChild(pie);

  if (prop) card.appendChild(el('div', { class: 'literal', style: 'margin-top:12px' },
    el('p', { text: recorta(prop.d, 400) })));

  return card;
}

/* ------------------------------------------------------------------ *
 * Vista: Agenda
 * ------------------------------------------------------------------ */
function ics(ev) {
  const f = s => (s || '').replace(/[-:]/g, '').replace(/\.\d+/, '');
  const inicio = ev.inicio ? f(ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio) + '00' : '';
  const fin = (() => {
    if (!ev.inicio) return '';
    const d = new Date(ev.inicio.length <= 10 ? ev.inicio + 'T09:00' : ev.inicio);
    d.setMinutes(d.getMinutes() + (Number(ev.duracion) || 60));
    return f(d.toISOString().slice(0, 16)) + '00';
  })();
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FECh//SPT//ES', 'BEGIN:VEVENT',
    'UID:' + ev.id, 'DTSTART:' + inicio, 'DTEND:' + fin,
    'SUMMARY:' + (ev.tema || 'Reunión'),
    'LOCATION:' + (ev.lugar || ''),
    'DESCRIPTION:' + ('Invitados: ' + (ev.invitados || '—')),
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = el('a', { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function vistaAgenda(raiz) {
  const eventos = Datos.todo('agenda').slice()
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Agendamiento e hitos' }),
    el('div', { class: 'sub', text: 'Reuniones y actividades de la secretaría' })
  ]);

  const inTema = el('input', { type: 'text', placeholder: 'Tema de la reunión' });
  const inFecha = el('input', { type: 'datetime-local' });
  card.appendChild(el('div', { class: 'form-grid' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Tema' }), inTema]),
    el('label', { class: 'field' }, [el('span', { text: 'Fecha y hora' }), inFecha])
  ]));
  card.appendChild(el('div', { class: 'toolbar', style: 'margin:12px 0 0' },
    el('button', { class: 'btn btn-primary', type: 'button', text: 'Agendar', onclick: () => {
      if (!inTema.value.trim()) { inTema.focus(); return; }
      Datos.guardar('agenda', { id: uid(), tema: inTema.value.trim(), inicio: inFecha.value,
        duracion: 60, formato: 'Presencial', lugar: '', invitados: '', estado: 'Por agendar', proyecto: null });
      inTema.value = ''; inFecha.value = '';
      render();
    } })));
  raiz.appendChild(card);

  const lista = el('div', { class: 'card' }, [
    el('h2', { text: `${eventos.length} evento${eventos.length === 1 ? '' : 's'}` }),
    el('div', { class: 'sub', text: 'Toca la fecha o el lugar para editarlos' })
  ]);
  if (!eventos.length) lista.appendChild(el('div', { class: 'empty', text: 'La agenda está vacía.' }));

  eventos.forEach(ev => {
    const campo = (tipo, valor, campoNombre, extra) => {
      const i = el('input', Object.assign({ type: tipo, value: valor || '' }, extra || {}));
      i.addEventListener('change', () => { ev[campoNombre] = i.value; Datos.guardar('agenda', ev); });
      return i;
    };
    const cuando = el('div', { class: 'cuando' }, [
      el('b', { text: ev.inicio ? fechaCorta(ev.inicio) : '—' }),
      el('span', { text: horaDe(ev.inicio) || 'sin hora' })
    ]);
    const detalle = el('div', { class: 'qué' }, [
      campo('text', ev.tema, 'tema'),
      el('div', { class: 'form-grid', style: 'margin-top:8px' }, [
        el('label', { class: 'field' }, [el('span', { text: 'Cuándo' }),
          campo('datetime-local', ev.inicio, 'inicio')]),
        el('label', { class: 'field' }, [el('span', { text: 'Duración (min)' }),
          campo('number', ev.duracion || 60, 'duracion', { min: 15, step: 15 })]),
        el('label', { class: 'field' }, [el('span', { text: 'Formato' }),
          selector(SPT.listas.formato, ev.formato, v => { ev.formato = v; Datos.guardar('agenda', ev); }, null)]),
        el('label', { class: 'field' }, [el('span', { text: 'Lugar o enlace' }),
          campo('text', ev.lugar, 'lugar')]),
        el('label', { class: 'field' }, [el('span', { text: 'Invitados' }),
          campo('text', ev.invitados, 'invitados')])
      ]),
      el('div', { class: 'toolbar', style: 'margin:10px 0 0' }, [
        el('button', { class: 'btn btn-sm', type: 'button', text: 'Descargar invitación',
          title: 'Archivo .ics para Google Calendar u Outlook',
          onclick: () => descargar((ev.tema || 'reunion').replace(/\W+/g, '-') + '.ics',
            ics(ev), 'text/calendar;charset=utf-8') }),
        el('button', { class: 'x', type: 'button', text: '✕ eliminar',
          onclick: () => { Datos.borrar('agenda', ev.id); render(); } })
      ])
    ]);
    lista.appendChild(el('div', { class: 'evento' }, [cuando, detalle]));
  });
  raiz.appendChild(lista);
}

/* ------------------------------------------------------------------ *
 * Vista: Equipo
 * ------------------------------------------------------------------ */
function vistaEquipo(raiz) {
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Integrantes' }),
    el('div', { class: 'sub', text: 'Quiénes pueden quedar designados en proyectos y pasos' })
  ]);

  const t = el('table');
  t.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Nombre' }), el('th', { text: 'Rol' }), el('th', { text: 'Correo' }), el('th', { text: '' })
  ])));
  const tb = el('tbody');
  integrantes().forEach(p => {
    const campo = (valor, nombre, tipo) => {
      const i = el('input', { type: tipo || 'text', value: valor || '' });
      i.addEventListener('change', () => { p[nombre] = i.value; Datos.guardar('integrantes', p); });
      return i;
    };
    tb.appendChild(el('tr', {}, [
      el('td', {}, campo(p.nombre, 'nombre')),
      el('td', {}, campo(p.rol, 'rol')),
      el('td', {}, campo(p.correo, 'correo', 'email')),
      el('td', {}, el('button', { class: 'x', type: 'button', text: '✕',
        onclick: () => { Datos.borrar('integrantes', p.id); render(); } }))
    ]));
  });
  t.appendChild(tb);
  if (integrantes().length) card.appendChild(el('div', { class: 'tablewrap' }, t));
  else card.appendChild(el('div', { class: 'empty', text: 'Todavía no hay integrantes.' }));

  const nuevo = el('input', { type: 'text', placeholder: 'Nombre', style: 'max-width:260px' });
  const agregar = () => {
    if (!nuevo.value.trim()) return;
    Datos.guardar('integrantes', { id: uid(), nombre: nuevo.value.trim(), rol: '', correo: '' });
    nuevo.value = ''; render();
  };
  nuevo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
  card.appendChild(el('div', { style: 'display:flex; gap:8px; margin-top:12px' }, [
    nuevo, el('button', { class: 'btn btn-sm', type: 'button', text: 'Agregar integrante', onclick: agregar })
  ]));
  raiz.appendChild(card);

  /* enlaces */
  const card2 = el('div', { class: 'card' }, [
    el('h2', { text: 'Enlaces de la secretaría' }),
    el('div', { class: 'sub', text: 'Los documentos y carpetas que se usan siempre' })
  ]);
  const guardados = Datos.todo('enlaces');
  const faltantes = SPT.enlacesBase.filter(n => !guardados.some(g => g.nombre === n));
  if (faltantes.length) card2.appendChild(el('div', { class: 'toolbar' },
    el('button', { class: 'btn btn-sm', type: 'button',
      text: `Crear los ${faltantes.length} enlaces habituales`, onclick: () => {
        faltantes.forEach(n => Datos.guardar('enlaces', { id: uid(), nombre: n, url: '' }));
        render();
      } })));
  guardados.forEach(g => {
    const u = el('input', { type: 'url', value: g.url || '', placeholder: 'https://…' });
    u.addEventListener('change', () => { g.url = u.value; Datos.guardar('enlaces', g); });
    card2.appendChild(el('div', { style: 'display:flex; gap:8px; align-items:center; padding:5px 0' }, [
      el('span', { style: 'min-width:190px; font-size:13.5px', text: g.nombre }), u,
      g.url ? el('a', { class: 'btn btn-sm', href: g.url, target: '_blank', rel: 'noopener', text: 'Abrir' }) : null,
      el('button', { class: 'x', type: 'button', text: '✕',
        onclick: () => { Datos.borrar('enlaces', g.id); render(); } })
    ].filter(Boolean)));
  });
  raiz.appendChild(card2);
}

/* ------------------------------------------------------------------ *
 * Vista: Conexión
 * ------------------------------------------------------------------ */
function vistaConexion(raiz) {
  const con = Datos.conexionGuardada();
  const card = el('div', { class: 'card' }, [
    el('h2', { text: 'Base de datos compartida' }),
    el('div', { class: 'sub', text: 'Para que todo el equipo vea y edite lo mismo' })
  ]);

  card.appendChild(el('div', { class: 'note' }, [
    el('p', { text: Datos.modo === 'supabase'
      ? '✓ Conectado a la base compartida. Lo que edites lo ven las demás personas.'
      : 'Ahora mismo los datos se guardan sólo en este navegador. Nadie más los ve.' }),
    Datos.mensaje ? el('p', { text: Datos.mensaje }) : null
  ].filter(Boolean)));

  const inUrl = el('input', { type: 'url', placeholder: 'https://xxxxx.supabase.co',
    value: con ? con.url : '' });
  const inClave = el('input', { type: 'text', placeholder: 'clave anon pública',
    value: con ? con.clave : '' });
  card.appendChild(el('div', { class: 'form-grid', style: 'margin-top:12px' }, [
    el('label', { class: 'field' }, [el('span', { text: 'URL del proyecto' }), inUrl]),
    el('label', { class: 'field' }, [el('span', { text: 'Clave pública (anon)' }), inClave])
  ]));
  card.appendChild(el('div', { class: 'toolbar', style: 'margin:12px 0 0' }, [
    el('button', { class: 'btn btn-primary', type: 'button', text: 'Conectar', onclick: async () => {
      if (!inUrl.value.trim() || !inClave.value.trim()) return;
      Datos.guardarConexion(inUrl.value, inClave.value);
      await Datos.iniciar();
      render();
    } }),
    con ? el('button', { class: 'btn', type: 'button', text: 'Olvidar conexión', onclick: () => {
      Datos.olvidarConexion(); location.reload();
    } }) : null,
    Datos.modo === 'supabase' ? el('button', { class: 'btn', type: 'button',
      text: 'Traer cambios de otras personas', onclick: async () => { await Datos.refrescar(); render(); } }) : null
  ].filter(Boolean)));
  raiz.appendChild(card);

  raiz.appendChild(el('div', { class: 'card' }, [
    el('h2', { text: 'Cómo se conecta' }),
    el('div', { class: 'sub', text: 'Una vez, y queda andando' }),
    el('div', { class: 'note' }, [
      el('p', { text: '1. Crea una cuenta gratis en supabase.com y un proyecto nuevo.' }),
      el('p', { text: '2. En el panel de Supabase, abre el editor SQL y pega el contenido del archivo ' +
        'supabase/esquema.sql que viene con esta aplicación. Eso crea las tablas.' }),
      el('p', { text: '3. En Ajustes → API copia la URL del proyecto y la clave anon pública, y pégalas acá arriba.' }),
      el('p', { text: '4. Cada persona del equipo hace sólo el paso 3, con los mismos dos datos. ' +
        'Seis personas editando a la vez no son problema.' }),
      el('p', { text: 'Con la clave anon cualquiera que tenga esos dos datos puede editar. Sirve para partir ' +
        'entre el equipo; cuando quieras cuentas con contraseña, se activa el login de Supabase.' })
    ])
  ]));
}

/* ------------------------------------------------------------------ *
 * Filtros, router y arranque
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
  set('#f-naturaleza', SPT.listas.naturaleza, filtros.naturaleza, 'Toda naturaleza');
  set('#f-persona', nombres(), filtros.persona, 'Todo el equipo');
  $('#f-texto').value = filtros.texto;
}

function marcarTab() {
  document.querySelectorAll('.tab').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.vista === vista)));
}

function render() {
  const raiz = $('#vista');
  raiz.innerHTML = '';
  $('#filtros').style.display = (vista === 'tablero' || vista === 'proyectos') ? '' : 'none';
  UI.pintarConexion($('#conexion'));
  if (vista === 'tablero') vistaTablero(raiz);
  else if (vista === 'proyectos') vistaProyectos(raiz);
  else if (vista === 'agenda') vistaAgenda(raiz);
  else if (vista === 'equipo') vistaEquipo(raiz);
  else vistaConexion(raiz);
}

async function iniciar() {
  Datos.alCambiarEstado = () => UI.pintarConexion($('#conexion'));
  await Datos.iniciar();

  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
    vista = btn.dataset.vista;
    marcarTab(); render();
  }));
  const bind = (sel, campo) => $(sel).addEventListener('input', e => {
    filtros[campo] = e.target.value; render();
  });
  bind('#f-estado', 'estado'); bind('#f-urgencia', 'urgencia');
  bind('#f-naturaleza', 'naturaleza'); bind('#f-persona', 'persona'); bind('#f-texto', 'texto');
  $('#f-limpiar').addEventListener('click', () => {
    filtros = { estado: '', urgencia: '', naturaleza: '', persona: '', texto: '' };
    poblarFiltros(); render();
  });
  UI.botonTema($('#btn-tema'), render);

  poblarFiltros();
  render();
}

document.addEventListener('DOMContentLoaded', iniciar);
})();
