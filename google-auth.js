/* Autenticación con Google mediante la cuenta de servicio.
 *
 * La usan drive.js (carpetas y documentos) y meet.js (enlaces de
 * videollamada). El token se firma con el crypto que trae Node, sin
 * librerías, y se guarda hasta que vence.
 *
 * Secrets (en Replit, nunca en el repositorio):
 *   GOOGLE_SERVICE_ACCOUNT   el JSON completo de la cuenta de servicio
 *     — o por separado —
 *   GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY
 *
 * Mientras no estén, todo esto responde "no configurado" y la aplicación
 * sigue funcionando con lo que se pega a mano.
 */
const crypto = require('crypto');

const ALCANCES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar'
].join(' ');

function credenciales() {
  const crudo = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (crudo) {
    try {
      const j = JSON.parse(crudo);
      if (j.client_email && j.private_key) return { correo: j.client_email, clave: j.private_key };
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT no es un JSON válido. ' +
        'Pega el archivo completo de la cuenta de servicio, tal cual.');
    }
  }
  const correo = process.env.GOOGLE_CLIENT_EMAIL;
  const clave = process.env.GOOGLE_PRIVATE_KEY;
  if (correo && clave) return { correo, clave };
  return null;
}

const configurado = () => Boolean(credenciales());

let cache = { token: null, vence: 0 };

async function token() {
  if (cache.token && Date.now() < cache.vence - 60000) return cache.token;

  const cred = credenciales();
  if (!cred) throw new Error('Falta la cuenta de servicio de Google en los Secrets.');

  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const cabeza = b64({ alg: 'RS256', typ: 'JWT' });
  const cuerpo = b64({
    iss: cred.correo, scope: ALCANCES,
    aud: 'https://oauth2.googleapis.com/token',
    iat: ahora, exp: ahora + 3600
  });
  /* En los Secrets los saltos de línea suelen quedar escapados. */
  const pem = cred.clave.replace(/\\n/g, '\n');
  const firma = crypto.createSign('RSA-SHA256')
    .update(`${cabeza}.${cuerpo}`).sign(pem, 'base64url');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabeza}.${cuerpo}.${firma}`
    })
  });
  const j = await r.json();
  if (!r.ok) {
    throw new Error('Google rechazó la cuenta de servicio: ' +
      (j.error_description || j.error || r.status));
  }
  cache = { token: j.access_token, vence: Date.now() + j.expires_in * 1000 };
  return cache.token;
}

/* Una llamada a cualquier API de Google, ya firmada. */
async function pedir(url, opciones = {}) {
  const t = await token();
  const r = await fetch(url, {
    ...opciones,
    headers: { authorization: 'Bearer ' + t, ...(opciones.headers || {}) }
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (j.error && j.error.message) || r.status;
    const err = new Error(msg);
    err.estado = r.status;
    err.correoCuenta = (credenciales() || {}).correo;
    throw err;
  }
  return j;
}

module.exports = { configurado, credenciales, token, pedir };
