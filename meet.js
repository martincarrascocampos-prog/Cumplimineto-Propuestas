/* Enlaces de videollamada para las reuniones del SPT.
 *
 * Google Meet se crea de verdad: se inserta el evento en el calendario con
 * una petición de conferencia y Google devuelve el enlace, que queda
 * guardado en la reunión. Zoom no tiene un camino equivalente sin una
 * cuenta de pago con API propia, así que ese enlace se pega a mano y el
 * sistema lo guarda igual.
 *
 * Secrets necesarios (en Replit):
 *   GOOGLE_SERVICE_ACCOUNT   el JSON de la cuenta de servicio
 *   GCAL_ID                  el calendario donde se crean los eventos
 *                            (o se manda uno por reunión desde la aplicación)
 *
 * Sin eso, todo responde "no configurado" y la aplicación ofrece el camino
 * corto: abrir Google Calendar con la reunión escrita y añadir el Meet ahí.
 */
const auth = require('./google-auth');

const API = 'https://www.googleapis.com/calendar/v3/calendars';
const ZONA = 'America/Santiago';

const configurado = () => auth.configurado() && Boolean(calendarioPorDefecto());
const calendarioPorDefecto = () => (process.env.GCAL_ID || '').trim();

/* De 'AAAA-MM-DDTHH:MM' y una duración, los dos extremos del evento. */
function extremos(inicio, minutos) {
  if (!inicio) throw new Error('La reunión no tiene fecha ni hora.');
  const arranque = inicio.length <= 10 ? inicio + 'T09:00' : inicio.slice(0, 16);
  const d = new Date(arranque);
  if (isNaN(d)) throw new Error('La fecha de la reunión no se entiende: ' + inicio);
  const fin = new Date(d.getTime() + (Number(minutos) || 60) * 60000);
  const sello = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-` +
    `${String(x.getDate()).padStart(2, '0')}T${String(x.getHours()).padStart(2, '0')}:` +
    `${String(x.getMinutes()).padStart(2, '0')}:00`;
  return { inicio: sello(d), fin: sello(fin) };
}

/* Crea el evento con su Meet y devuelve el enlace. */
async function crearMeet(reunion, opciones = {}) {
  if (!auth.configurado()) {
    throw new Error('Falta la cuenta de servicio de Google en los Secrets del servidor.');
  }
  const calendario = (opciones.calendario || calendarioPorDefecto()).trim();
  if (!calendario) {
    throw new Error('Falta el calendario de Google: cárgalo en GCAL_ID, o ponle su ID al ' +
      'calendario desde la pestaña Calendario.');
  }

  const { inicio, fin } = extremos(reunion.inicio, reunion.duracion);
  const cuerpo = {
    summary: reunion.tema || 'Reunión',
    description: (reunion.puntos && reunion.puntos.length
      ? 'Puntos a tratar:\n' + reunion.puntos.map((p, i) => `${i + 1}. ${p}`).join('\n') + '\n\n'
      : '') + 'Creado desde el Conectómetro · Secretaría de Participación',
    location: reunion.lugar || '',
    start: { dateTime: inicio, timeZone: ZONA },
    end:   { dateTime: fin,    timeZone: ZONA },
    conferenceData: {
      createRequest: {
        requestId: 'spt-' + (reunion.id || Date.now()),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  /* Las cuentas de servicio no pueden invitar gente sin delegación de
     dominio: si se mandan invitados, Google rechaza el evento entero. Por
     eso van en la descripción y no como attendees. */
  if (reunion.invitados) {
    cuerpo.description += '\n\nInvitades: ' + reunion.invitados;
  }

  const url = `${API}/${encodeURIComponent(calendario)}/events` +
    '?conferenceDataVersion=1&supportsAttachments=true';
  let j;
  try {
    j = await auth.pedir(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
  } catch (e) {
    if (e.estado === 404) {
      throw new Error('Google no encuentra ese calendario. Casi siempre es que no está ' +
        'compartido con la cuenta de servicio: ' + (e.correoCuenta || ''));
    }
    if (e.estado === 403) {
      throw new Error('Google no deja crear el evento: la cuenta de servicio necesita ' +
        'permiso para "Hacer cambios en los eventos" en ese calendario.');
    }
    throw new Error('Google Calendar respondió: ' + e.message);
  }

  const enlace = j.hangoutLink ||
    ((j.conferenceData && j.conferenceData.entryPoints || [])
      .find(p => p.entryPointType === 'video') || {}).uri || '';

  return { enlace, evento: j.id, verEn: j.htmlLink, calendario };
}

async function estado() {
  if (!auth.configurado()) {
    return { configurado: false,
      motivo: 'Falta la cuenta de servicio de Google en los Secrets del servidor.' };
  }
  if (!calendarioPorDefecto()) {
    return { configurado: false, cuenta: auth.credenciales().correo,
      motivo: 'Falta GCAL_ID: el calendario donde se crean los eventos.' };
  }
  return { configurado: true, cuenta: auth.credenciales().correo,
    calendario: calendarioPorDefecto() };
}

module.exports = { configurado, crearMeet, estado, extremos };
