/* Conexión con Google Drive mediante la cuenta de servicio.
 *
 * Es el mismo camino que el calendario: se comparte una carpeta de Drive con
 * el correo de la cuenta de servicio y el servidor lee esa carpeta en vivo.
 * Nadie del equipo tiene que iniciar sesión: todos ven lo mismo que hay en
 * Drive en ese momento.
 *
 * Variables de entorno (en los Secrets de Replit, nunca en el repositorio):
 *
 *   GOOGLE_SERVICE_ACCOUNT   el JSON completo de la cuenta de servicio
 *     — o bien, por separado —
 *   GOOGLE_CLIENT_EMAIL      ...@...iam.gserviceaccount.com
 *   GOOGLE_PRIVATE_KEY       la clave privada (con \n escapados o reales)
 *
 *   DRIVE_CARPETA_RAIZ       id de la carpeta madre de la Secretaría
 *
 * No usa librerías: el token se firma con el crypto que trae Node.
 */
const auth = require('./google-auth');

const API = 'https://www.googleapis.com/drive/v3/files';

const configurado = auth.configurado;
const carpetaRaiz = () => idDeCarpeta(process.env.DRIVE_CARPETA_RAIZ || '');

/* Acepta el id pelado o la dirección completa que se copia del navegador. */
function idDeCarpeta(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const m = t.match(/\/folders\/([\w-]+)/) || t.match(/[?&]id=([\w-]+)/);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(t) ? t : '';
}

/* Los errores de Drive se traducen a algo accionable. */
async function pedir(url, opciones) {
  try {
    return await auth.pedir(url, opciones);
  } catch (e) {
    if (e.estado === 404) {
      throw new Error('Drive no encuentra esa carpeta. Lo más probable es que no esté ' +
        'compartida con la cuenta de servicio: ' + (e.correoCuenta || ''));
    }
    throw new Error('Drive respondió: ' + e.message);
  }
}

/* ------------------------------ acciones ------------------------------ */
const TIPOS = {
  'application/vnd.google-apps.folder':       'carpeta',
  'application/vnd.google-apps.document':     'documento',
  'application/vnd.google-apps.spreadsheet':  'planilla',
  'application/vnd.google-apps.presentation': 'presentación',
  'application/vnd.google-apps.form':         'formulario',
  'application/pdf':                          'PDF'
};

/* El contenido de una carpeta, ahora mismo. Las carpetas van primero y
   después lo más recién tocado, que es lo que uno anda buscando. */
async function listar(carpeta) {
  const id = idDeCarpeta(carpeta) || carpetaRaiz();
  if (!id) throw new Error('No se indicó ninguna carpeta de Drive.');

  const params = new URLSearchParams({
    q: `'${id}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size,lastModifyingUser(displayName))',
    orderBy: 'folder,modifiedTime desc',
    pageSize: '100',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  const j = await pedir(`${API}?${params}`);
  return (j.files || []).map(f => ({
    id: f.id,
    nombre: f.name,
    tipo: TIPOS[f.mimeType] || 'archivo',
    esCarpeta: f.mimeType === 'application/vnd.google-apps.folder',
    modificado: f.modifiedTime,
    quien: (f.lastModifyingUser || {}).displayName || '',
    url: f.webViewLink || `https://drive.google.com/open?id=${f.id}`
  }));
}

/* Crea la carpeta de un proyecto dentro de la carpeta madre, para no tener
   que salir a Drive, crearla a mano y volver a pegar el enlace. */
async function crearCarpeta(nombre, padre) {
  const parent = idDeCarpeta(padre) || carpetaRaiz();
  if (!parent) throw new Error('Falta DRIVE_CARPETA_RAIZ: no sé dónde crearla.');
  if (!String(nombre || '').trim()) throw new Error('La carpeta necesita un nombre.');

  const j = await pedir(`${API}?supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: String(nombre).trim(),
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parent]
    })
  });
  return { id: j.id, nombre: j.name, url: j.webViewLink };
}

/* Para la pantalla: qué está conectado y qué falta. */
async function estado() {
  const cred = auth.credenciales();
  if (!cred) {
    return { configurado: false,
      motivo: 'Falta la cuenta de servicio de Google en los Secrets del servidor.' };
  }
  const raiz = carpetaRaiz();
  if (!raiz) {
    return { configurado: false, cuenta: cred.correo,
      motivo: 'Falta DRIVE_CARPETA_RAIZ: el id de la carpeta madre de la Secretaría.' };
  }
  try {
    const items = await listar(raiz);
    return { configurado: true, cuenta: cred.correo, carpeta: raiz, elementos: items.length };
  } catch (e) {
    return { configurado: false, cuenta: cred.correo, carpeta: raiz, motivo: e.message };
  }
}

module.exports = { configurado, carpetaRaiz, idDeCarpeta, listar, crearCarpeta, estado };
