/* Correos automáticos del SPT.
 *
 * La idea: que nadie tenga que entrar a la aplicación para enterarse de lo suyo.
 * Cuatro envíos, y ninguno manda correos vacíos:
 *
 *   diario     — a cada persona, sólo si hoy tiene reunión o se le vence algo
 *   semanal    — a cada persona, los lunes: su semana completa y lo que quedó atrasado
 *   resumen    — a la coordinación, los viernes: cómo va el programa y quién está cargado
 *   urgencias  — a quien lleva un proyecto urgente que está atrasado
 *
 * Lee de Supabase con la llave secreta (sólo servidor) y envía por Gmail o por
 * Resend, según lo que esté configurado. Sin nada configurado igual arma los
 * correos: sirven para la vista previa.
 */
'use strict';

const TABLAS = ['equipos', 'seguimiento', 'proyectos', 'pasos', 'hitos', 'agenda',
                'integrantes', 'calendarios'];

const hoy = () => new Date().toISOString().slice(0, 10);
const sumarDias = (iso, n) => {
  const d = new Date(iso + 'T12:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fechaLarga = iso => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? iso + 'T12:00' : iso);
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
};
const hora = iso => (iso && iso.length > 10 ? iso.slice(11, 16) : '');
const lista = txt => String(txt || '').split(',').map(x => x.trim()).filter(Boolean);
const escapar = t => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ *
 * Leer la base
 * ------------------------------------------------------------------ */
async function leerBase() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const llave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !llave) throw new Error('Falta SUPABASE_URL o la llave para leer la base.');

  const datos = {};
  for (const t of TABLAS) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*`, {
      headers: { apikey: llave, Authorization: `Bearer ${llave}` }
    });
    if (!r.ok) throw new Error(`No se pudo leer ${t}: ${r.status} ${await r.text()}`);
    datos[t] = await r.json();
  }
  return datos;
}

/* ------------------------------------------------------------------ *
 * Qué le toca a cada persona
 * ------------------------------------------------------------------ */
function agenda(d, persona, desde, hasta) {
  return d.agenda
    .filter(ev => ev.inicio && ev.inicio.slice(0, 10) >= desde && ev.inicio.slice(0, 10) <= hasta)
    .filter(ev => !persona || lista(ev.invitados).includes(persona.nombre))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

function pasosDe(d, persona, desde, hasta) {
  const activos = new Set(d.proyectos.filter(p => (p.estado || 'Activo') === 'Activo').map(p => p.id));
  return d.pasos
    .filter(p => activos.has(p.proyecto) && p.estado === 'Pendiente' && p.plazo)
    .filter(p => p.plazo >= desde && p.plazo <= hasta)
    .filter(p => !persona || (p.encargados || []).includes(persona.nombre))
    .sort((a, b) => a.plazo.localeCompare(b.plazo));
}

function atrasados(d, persona) {
  const activos = new Set(d.proyectos.filter(p => (p.estado || 'Activo') === 'Activo').map(p => p.id));
  return d.pasos
    .filter(p => activos.has(p.proyecto) && p.estado === 'Pendiente' && p.plazo && p.plazo < hoy())
    .filter(p => !persona || (p.encargados || []).includes(persona.nombre))
    .sort((a, b) => a.plazo.localeCompare(b.plazo));
}

function hitosDe(d, persona, desde, hasta) {
  const mios = new Set(d.proyectos
    .filter(p => !persona || (p.designados || []).includes(persona.nombre)).map(p => p.id));
  return d.hitos
    .filter(h => h.fecha && h.fecha.slice(0, 10) >= desde && h.fecha.slice(0, 10) <= hasta)
    .filter(h => mios.has(h.proyecto))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
}

const nombreProyecto = (d, id) => (d.proyectos.find(p => p.id === id) || {}).nombre || '';

/* ------------------------------------------------------------------ *
 * El correo, en HTML sobrio que se lee bien en cualquier cliente
 * ------------------------------------------------------------------ */
function plantilla(titulo, bajada, bloques, enlace) {
  const cuerpo = bloques.filter(Boolean).join('');
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f4f2;
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0b0b0b">
    <div style="max-width:560px;margin:0 auto;padding:24px 16px">
      <div style="background:#fff;border:1px solid rgba(11,11,11,.1);border-radius:14px;padding:22px">
        <div style="font-size:12px;color:#898781;letter-spacing:.06em;text-transform:uppercase">
          SPT · Secretaría de Participación</div>
        <h1 style="font-size:20px;margin:6px 0 4px;letter-spacing:-.02em">${escapar(titulo)}</h1>
        <p style="margin:0 0 18px;color:#52514e;font-size:14px">${escapar(bajada)}</p>
        ${cuerpo}
        ${enlace ? `<a href="${escapar(enlace)}" style="display:inline-block;margin-top:18px;
          background:#2a78d6;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;
          font-size:14px;font-weight:500">Abrir el SPT</a>` : ''}
      </div>
      <p style="text-align:center;color:#898781;font-size:11.5px;margin:14px 0 0">
        Enviado automáticamente por el Conectómetro · FECh 2026</p>
    </div></body></html>`;
}

function bloque(titulo, filas) {
  if (!filas.length) return '';
  return `<div style="margin-bottom:18px">
    <div style="font-size:12px;color:#898781;text-transform:uppercase;letter-spacing:.05em;
      font-weight:600;margin-bottom:6px">${escapar(titulo)}</div>
    ${filas.map(f => `<div style="border-bottom:1px solid #e1e0d9;padding:7px 0">
      <div style="font-size:14px">${escapar(f.texto)}</div>
      ${f.detalle ? `<div style="font-size:12.5px;color:#898781">${escapar(f.detalle)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

const alerta = texto => `<div style="background:#fdf0ea;border:1px solid #ec835a;border-radius:9px;
  padding:10px 12px;margin-bottom:16px;font-size:13.5px;color:#0b0b0b">${escapar(texto)}</div>`;

/* ------------------------------------------------------------------ *
 * Los cuatro envíos
 * ------------------------------------------------------------------ */
function construir(tipo, d, opciones = {}) {
  const app = opciones.url || process.env.APP_URL || '';
  const gente = d.integrantes.filter(p => p.correo && p.correo.includes('@'));
  const correos = [];
  const quiere = (p, clave) => !p.avisos || p.avisos[clave] !== false;

  if (tipo === 'diario') {
    const dia = hoy();
    gente.filter(p => quiere(p, 'diario')).forEach(p => {
      const reuniones = agenda(d, p, dia, dia);
      const vencen = pasosDe(d, p, dia, dia);
      const hitos = hitosDe(d, p, dia, dia);
      const tarde = atrasados(d, p);
      if (!reuniones.length && !vencen.length && !hitos.length && !tarde.length) return;
      correos.push({
        para: p.correo, nombre: p.nombre,
        asunto: `Hoy: ${[reuniones.length && `${reuniones.length} reunión${reuniones.length > 1 ? 'es' : ''}`,
          vencen.length && `${vencen.length} vence${vencen.length > 1 ? 'n' : ''}`].filter(Boolean).join(' · ') || 'pendientes atrasados'}`,
        html: plantilla(`Hola ${p.nombre.split(' ')[0]}`, fechaLarga(dia), [
          tarde.length ? alerta(`Tienes ${tarde.length} paso${tarde.length > 1 ? 's' : ''} atrasado${tarde.length > 1 ? 's' : ''}.`) : '',
          bloque('Reuniones de hoy', reuniones.map(ev => ({
            texto: `${hora(ev.inicio)} · ${ev.tema}`,
            detalle: [ev.lugar, ev.invitados].filter(Boolean).join(' · ') }))),
          bloque('Vence hoy', vencen.map(p2 => ({
            texto: p2.descripcion, detalle: nombreProyecto(d, p2.proyecto) }))),
          bloque('Hitos de hoy', hitos.map(h => ({
            texto: h.detalle, detalle: nombreProyecto(d, h.proyecto) }))),
          bloque('Atrasado', tarde.slice(0, 6).map(p2 => ({
            texto: p2.descripcion,
            detalle: `${nombreProyecto(d, p2.proyecto)} · vencía el ${fechaLarga(p2.plazo)}` })))
        ], app)
      });
    });
  }

  if (tipo === 'semanal') {
    const desde = hoy(), hasta = sumarDias(desde, 6);
    gente.filter(p => quiere(p, 'semanal')).forEach(p => {
      const reuniones = agenda(d, p, desde, hasta);
      const vencen = pasosDe(d, p, desde, hasta);
      const hitos = hitosDe(d, p, desde, hasta);
      const tarde = atrasados(d, p);
      const proyectos = d.proyectos.filter(pr => (pr.estado || 'Activo') === 'Activo' &&
        (pr.designados || [])[0] === p.nombre);
      if (!reuniones.length && !vencen.length && !hitos.length && !tarde.length) return;
      correos.push({
        para: p.correo, nombre: p.nombre,
        asunto: `Tu semana en Participación · ${vencen.length + reuniones.length} cosas`,
        html: plantilla(`Tu semana, ${p.nombre.split(' ')[0]}`,
          `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`, [
          tarde.length ? alerta(`Arrastras ${tarde.length} paso${tarde.length > 1 ? 's' : ''} atrasado${tarde.length > 1 ? 's' : ''}. Vale la pena partir por ahí.`) : '',
          bloque('Reuniones', reuniones.map(ev => ({
            texto: `${fechaLarga(ev.inicio)} ${hora(ev.inicio)} · ${ev.tema}`,
            detalle: [ev.lugar, ev.invitados].filter(Boolean).join(' · ') }))),
          bloque('Pasos que vencen', vencen.map(p2 => ({
            texto: p2.descripcion,
            detalle: `${nombreProyecto(d, p2.proyecto)} · ${fechaLarga(p2.plazo)}` }))),
          bloque('Hitos', hitos.map(h => ({
            texto: h.detalle, detalle: `${nombreProyecto(d, h.proyecto)} · ${fechaLarga(h.fecha)}` }))),
          bloque('Atrasado', tarde.map(p2 => ({
            texto: p2.descripcion,
            detalle: `${nombreProyecto(d, p2.proyecto)} · vencía el ${fechaLarga(p2.plazo)}` }))),
          proyectos.length ? bloque('Llevas como principal', proyectos.map(pr => ({
            texto: pr.nombre, detalle: pr.urgencia || 'sin urgencia definida' }))) : ''
        ], app)
      });
    });
  }

  if (tipo === 'urgencias') {
    const urgentes = d.proyectos.filter(pr => (pr.estado || 'Activo') === 'Activo' &&
      String(pr.urgencia || '').startsWith('Urgente'));
    urgentes.forEach(pr => {
      const suyos = d.pasos.filter(p => p.proyecto === pr.id);
      const tarde = suyos.filter(p => p.estado === 'Pendiente' && p.plazo && p.plazo < hoy());
      const sinPasos = !suyos.length;
      if (!tarde.length && !sinPasos) return;
      const jefe = d.integrantes.find(i => i.nombre === (pr.designados || [])[0] && i.correo);
      if (!jefe) return;
      correos.push({
        para: jefe.correo, nombre: jefe.nombre,
        asunto: `Urgente sin avanzar: ${pr.nombre}`,
        html: plantilla(pr.nombre, 'Este proyecto está marcado como urgente', [
          alerta(sinPasos
            ? 'Está marcado urgente y todavía no tiene ningún paso definido.'
            : `Tiene ${tarde.length} paso${tarde.length > 1 ? 's' : ''} con el plazo vencido.`),
          bloque('Pasos atrasados', tarde.map(p2 => ({
            texto: p2.descripcion, detalle: `vencía el ${fechaLarga(p2.plazo)}` })))
        ], app)
      });
    });
  }

  if (tipo === 'resumen') {
    const activos = d.proyectos.filter(pr => (pr.estado || 'Activo') === 'Activo');
    const pasos = d.pasos.filter(p => activos.some(pr => pr.id === p.proyecto));
    const listos = pasos.filter(p => p.estado === 'Completado');
    const tarde = pasos.filter(p => p.estado === 'Pendiente' && p.plazo && p.plazo < hoy());
    const semana = sumarDias(hoy(), -7);
    const cerradosSemana = listos.filter(p => p.actualizado && p.actualizado.slice(0, 10) >= semana);
    const avance = pasos.length ? Math.round(listos.length / pasos.length * 100) : 0;
    const carga = d.integrantes.map(p => ({
      nombre: p.nombre,
      pendientes: pasos.filter(x => x.estado === 'Pendiente' && (x.encargados || []).includes(p.nombre)).length
    })).filter(x => x.pendientes).sort((a, b) => b.pendientes - a.pendientes);
    const sinEncargado = activos.filter(pr => !(pr.designados || []).length);

    const destinatarios = d.integrantes.filter(p => p.correo && (!p.avisos || p.avisos.resumen !== false));
    destinatarios.forEach(p => correos.push({
      para: p.correo, nombre: p.nombre,
      asunto: `Resumen semanal · ${avance}% de los pasos completados`,
      html: plantilla('Cómo va la secretaría', `Semana al ${fechaLarga(hoy())}`, [
        bloque('En números', [
          { texto: `${avance}% de los pasos completados`, detalle: `${listos.length} de ${pasos.length}` },
          { texto: `${cerradosSemana.length} pasos cerrados esta semana` },
          { texto: `${activos.length} proyectos activos` },
          tarde.length ? { texto: `${tarde.length} pasos atrasados` } : null
        ].filter(Boolean)),
        bloque('Carga por persona', carga.map(c => ({
          texto: c.nombre, detalle: `${c.pendientes} pasos pendientes` }))),
        sinEncargado.length ? bloque('Sin encargado', sinEncargado.map(pr => ({
          texto: pr.nombre, detalle: pr.urgencia || 'sin urgencia definida' }))) : '',
        bloque('Lo más atrasado', tarde.slice(0, 5).map(p2 => ({
          texto: p2.descripcion,
          detalle: `${nombreProyecto(d, p2.proyecto)} · vencía el ${fechaLarga(p2.plazo)}` })))
      ], app)
    }));
  }

  return correos;
}

/* ------------------------------------------------------------------ *
 * Envío
 * ------------------------------------------------------------------ */
async function enviar(correos) {
  if (!correos.length) return { enviados: 0, resultados: [] };
  if (process.env.GMAIL_USUARIO && process.env.GMAIL_APP_PASSWORD) return enviarPorGmail(correos);
  if (process.env.RESEND_API_KEY) return enviarPorResend(correos);
  return { enviados: 0, error: 'No hay forma de enviar configurada: falta GMAIL_USUARIO + ' +
    'GMAIL_APP_PASSWORD, o RESEND_API_KEY.' };
}

/* Gmail: sale desde la cuenta de la FECh, sin dominio propio ni verificaciones.
   Necesita una "contraseña de aplicación" de Google, no la contraseña normal. */
async function enviarPorGmail(correos) {
  let nodemailer;
  try { nodemailer = require('nodemailer'); }
  catch (e) { return { enviados: 0, error: 'Falta instalar nodemailer (npm install nodemailer).' }; }

  const usuario = process.env.GMAIL_USUARIO;
  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: usuario, pass: process.env.GMAIL_APP_PASSWORD }
  });
  const remitente = process.env.CORREO_REMITENTE || `SPT · Participación <${usuario}>`;

  const resultados = [];
  for (const c of correos) {
    try {
      await transporte.sendMail({ from: remitente, to: c.para, subject: c.asunto, html: c.html });
      resultados.push({ para: c.para, ok: true });
    } catch (e) {
      resultados.push({ para: c.para, ok: false, detalle: e.message });
    }
  }
  return { via: 'gmail', enviados: resultados.filter(r => r.ok).length, resultados };
}

/* Resend: conviene cuando la FECh tiene dominio propio verificado. */
async function enviarPorResend(correos) {
  const llave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE || 'SPT FECh <onboarding@resend.dev>';
  const resultados = [];
  for (const c of correos) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${llave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [c.para], subject: c.asunto, html: c.html })
    });
    resultados.push({ para: c.para, ok: r.ok, detalle: r.ok ? '' : await r.text() });
  }
  return { via: 'resend', enviados: resultados.filter(r => r.ok).length, resultados };
}

module.exports = { leerBase, construir, enviar };
