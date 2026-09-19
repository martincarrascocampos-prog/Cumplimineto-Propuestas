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

app.get('/programa', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/spt', (_req, res) => res.sendFile(path.join(__dirname, 'spt.html')));

app.use(express.static(__dirname, { extensions: ['html'] }));

app.listen(PUERTO, '0.0.0.0', () =>
  console.log(`Conectómetro en http://localhost:${PUERTO}  ·  SPT en /spt`));
