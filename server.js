/* Servidor mínimo para publicar el Conectómetro y el SPT (por ejemplo en Replit).
   Sirve los archivos tal cual y entrega la conexión a Supabase desde las
   variables de entorno, para que nadie tenga que pegarla en cada navegador. */
const express = require('express');
const path = require('path');

const app = express();
const PUERTO = process.env.PORT || 3000;

/* La configuración viaja como un archivo JavaScript chiquito.
   Si no hay variables de entorno, queda vacío y la aplicación pide los datos
   en su pantalla de Conexión. */
app.get('/config.js', (_req, res) => {
  const url = process.env.SUPABASE_URL || '';
  /* Supabase renombró sus llaves: la "publishable" de ahora es la "anon" de antes.
     Aceptamos cualquiera de los dos nombres para no depender de cuál copiaste. */
  const clave = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || '';
  res.type('application/javascript');
  res.send(url && clave
    ? `window.SUPABASE_URL=${JSON.stringify(url)};window.SUPABASE_ANON_KEY=${JSON.stringify(clave)};`
    : '/* sin conexión configurada en el servidor */');
});

/* ------------------------------------------------------------------ *
 * Correos automáticos
 *
 *   /api/correos/ver?tipo=semanal      → muestra lo que se enviaría, sin enviar
 *   /api/correos/enviar?tipo=semanal   → envía de verdad (pide la clave)
 *
 * El envío se dispara desde un horario de Replit o cualquier servicio que
 * llame a esa dirección. La clave evita que la dispare un desconocido.
 * ------------------------------------------------------------------ */
const correos = require('./correos');
const TIPOS = ['diario', 'semanal', 'urgencias', 'resumen'];

app.get('/api/correos/ver', async (req, res) => {
  const tipo = String(req.query.tipo || 'semanal');
  if (!TIPOS.includes(tipo)) return res.status(400).send('Tipo desconocido: ' + TIPOS.join(', '));
  try {
    const datos = await correos.leerBase();
    const armados = correos.construir(tipo, datos, { url: `${req.protocol}://${req.get('host')}/spt` });
    if (!armados.length) return res.send(
      `<p style="font-family:system-ui;padding:24px">Con los datos de hoy, el envío <b>${tipo}</b> ` +
      `no le manda correo a nadie. Es lo esperado cuando no hay nada pendiente.</p>`);
    res.send(`<div style="font-family:system-ui;padding:16px;background:#e9e9e6">
      <p style="max-width:560px;margin:0 auto 16px">Vista previa de <b>${tipo}</b>:
      ${armados.length} correo(s). Nadie los ha recibido.</p>
      ${armados.map(c => `<div style="max-width:560px;margin:0 auto 8px;font-size:13px">
        <b>Para:</b> ${c.para} — <b>Asunto:</b> ${c.asunto}</div>${c.html}`).join('')}</div>`);
  } catch (e) {
    res.status(500).send('No se pudo preparar: ' + e.message);
  }
});

app.post('/api/correos/enviar', async (req, res) => {
  const tipo = String(req.query.tipo || 'semanal');
  const clave = process.env.CORREOS_TOKEN;
  if (clave && req.query.clave !== clave) return res.status(403).json({ error: 'Clave incorrecta' });
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo desconocido' });
  try {
    const datos = await correos.leerBase();
    const armados = correos.construir(tipo, datos, { url: `${req.protocol}://${req.get('host')}/spt` });
    const salida = await correos.enviar(armados);
    res.json({ tipo, preparados: armados.length, ...salida });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------------------------------------------------ *
 * Google Drive
 *
 *   /api/drive/estado                 → si está conectado y a qué carpeta
 *   /api/drive/listar?carpeta=<id>    → lo que hay ahora en esa carpeta
 *   /api/drive/carpeta                → crea la carpeta de un proyecto
 *
 * La cuenta de servicio sólo ve lo que se le comparte, así que esto no
 * abre nada que no se haya compartido a propósito. El paso a paso está
 * en GOOGLE.md.
 * ------------------------------------------------------------------ */
const drive = require('./drive');

app.get('/api/drive/estado', async (_req, res) => {
  try { res.json(await drive.estado()); }
  catch (e) { res.json({ configurado: false, motivo: e.message }); }
});

app.get('/api/drive/listar', async (req, res) => {
  if (!drive.configurado()) return res.status(503).json({ error: 'Drive no está conectado.' });
  try { res.json({ archivos: await drive.listar(req.query.carpeta) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post('/api/drive/carpeta', express.json(), async (req, res) => {
  if (!drive.configurado()) return res.status(503).json({ error: 'Drive no está conectado.' });
  try { res.json(await drive.crearCarpeta(req.body && req.body.nombre, req.body && req.body.padre)); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

/* ------------------------------------------------------------------ *
 * Videollamada de las reuniones
 *
 *   /api/reuniones/estado          → si se pueden crear enlaces de Meet
 *   /api/reuniones/videollamada    → crea el evento con su Meet y devuelve
 *                                    el enlace para guardarlo en la reunión
 *
 * Mientras no estén las credenciales responde 503 y la aplicación ofrece
 * el camino corto: abrir Google Calendar con la reunión ya escrita.
 * ------------------------------------------------------------------ */
const meet = require('./meet');

app.get('/api/reuniones/estado', async (_req, res) => {
  try { res.json(await meet.estado()); }
  catch (e) { res.json({ configurado: false, motivo: e.message }); }
});

app.post('/api/reuniones/videollamada', express.json(), async (req, res) => {
  const r = req.body || {};
  if (!meet.configurado() && !r.calendario) {
    return res.status(503).json({ error: 'Google Calendar no está conectado en el servidor.' });
  }
  try { res.json(await meet.crearMeet(r, { calendario: r.calendario })); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/programa', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/spt', (_req, res) => res.sendFile(path.join(__dirname, 'spt.html')));

app.use(express.static(__dirname, { extensions: ['html'] }));

app.listen(PUERTO, '0.0.0.0', () =>
  console.log(`Conectómetro en http://localhost:${PUERTO}  ·  SPT en /spt`));
