#!/usr/bin/env python3
"""Arma la versión de un solo archivo del Conectómetro + SPT.

    python3 construir-un-archivo.py

Toma las dos páginas, sus estilos, su código y el PDF del programa, y escribe
Conectometro-FECh-2026.html: un archivo que se abre con doble clic, sin carpeta
ni servidor. Las dos secciones conviven en la misma página y comparten datos.
"""
import base64, glob, os, re, sys

RAIZ = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(RAIZ, 'Conectometro-FECh-2026.html')

def leer(nombre):
    with open(os.path.join(RAIZ, nombre), encoding='utf-8') as f:
        return f.read()

def entre(texto, desde, hasta, incluir_hasta=True):
    i = texto.index(desde)
    j = texto.index(hasta, i)
    return texto[i:j + (len(hasta) if incluir_hasta else 0)]

index_html = leer('index.html')
spt_html = leer('spt.html')

# Cada sección aporta sus pestañas, sus filtros y su lienzo.
ui_conecto = entre(index_html, '<nav class="tabs"', '</main>')
ui_spt = entre(spt_html, '<nav class="tabs"', '</main>')
# El panel lateral de la propuesta vive fuera de las secciones: es una capa encima.
cajon = entre(index_html, '<div id="drawer"', '<div id="tt"', incluir_hasta=False)

# El selector de acceso pertenece al Conectómetro, así que viaja con su sección.
perfil = ('<div class="barra-perfil">'
          '<select id="perfil" title="Acceso activo" aria-label="Acceso activo"></select>'
          '</div>\n')
ui_conecto = perfil + ui_conecto

css = leer('estilos.css') + """

/* ------------------------------------------------------------------ *
 * Versión de un solo archivo: el cambio entre las dos secciones
 * ------------------------------------------------------------------ */
.secciones{display:inline-flex; background:var(--plane); border:1px solid var(--border);
  border-radius:10px; padding:3px; gap:2px}
.secciones button{background:none; border:none; padding:6px 14px; border-radius:8px; cursor:pointer;
  color:var(--ink-2); font-size:13.5px; white-space:nowrap}
.secciones button:hover{color:var(--ink)}
.secciones button[aria-pressed="true"]{background:var(--surface); color:var(--ink); font-weight:600;
  box-shadow:var(--shadow)}
.barra-perfil{display:flex; justify-content:flex-end; padding:10px 16px 0; max-width:1180px; margin:0 auto}
.barra-perfil select{max-width:260px}
@media (max-width:640px){ .barra-perfil{padding:10px 12px 0} }
"""

pdf = base64.b64encode(open(os.path.join(RAIZ, 'programa/programa-conectemos-la-chile.pdf'), 'rb').read()).decode()
minis = [base64.b64encode(open(f, 'rb').read()).decode()
         for f in sorted(glob.glob(os.path.join(RAIZ, 'programa/paginas/p*.webp')))]
if len(minis) != 57:
    sys.exit(f'Esperaba 57 miniaturas y encontré {len(minis)}')

codigo = [leer(n) for n in ('core.js', 'data.js', 'spt-data.js', 'app.js', 'spt.js')]
for c in codigo:
    if '</script>' in c:
        sys.exit('Hay un </script> dentro del código: rompería el archivo')

html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conectómetro · FECh 2026</title>
<meta name="description" content="Cumplimiento del programa Conectemos la Chile y planificación de trabajo de la Secretaría de Participación, en un solo archivo.">
<style>
{css}
</style>
</head>
<body>

<header class="top">
  <div class="brand">
    <span class="brand-mark" aria-hidden="true"></span>
    <span>
      <b id="titulo-seccion">Conectómetro</b>
      <span id="bajada-seccion">Cumplimiento del programa · FECh 2026</span>
    </span>
  </div>
  <div class="top-actions">
    <div class="secciones" role="group" aria-label="Secciones del sistema">
      <button type="button" data-seccion="conecto" aria-pressed="true">Programa</button>
      <button type="button" data-seccion="spt" aria-pressed="false">SPT · Participación</button>
    </div>
    <span class="conexion" id="conexion" title="Dónde se están guardando los datos"><i></i><span>…</span></span>
    <button class="btn btn-ghost" id="btn-tema" title="Cambiar tema" aria-label="Cambiar tema">◐</button>
  </div>
</header>

<div id="seccion"></div>

{cajon}
<div id="tt" class="tt" hidden></div>

<footer id="pie">Conectómetro — umbrales: 50% media · 70% mínimo · 80% ideal · 90% logro. Los datos se guardan en este navegador.</footer>

<template id="tpl-conecto">
{ui_conecto}
</template>

<template id="tpl-spt">
{ui_spt}
</template>

<script>
window.UNARCHIVO = true;
window.SECCION = 'conecto';
window.PDF_INLINE = "{pdf}";
window.MINIS_INLINE = ["{'","'.join(minis)}"];
</script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
<script>
{codigo[0]}
</script>
<script>
{codigo[1]}
</script>
<script>
{codigo[2]}
</script>
<script>
{codigo[3]}
</script>
<script>
{codigo[4]}
</script>
<script>
/* Cambio entre las dos secciones: se vacía el lienzo, se clona la plantilla
   correspondiente y se arranca esa sección. Las dos leen y escriben en los
   mismos datos, así que lo que haces en una aparece en la otra. */
(function () {{
  'use strict';
  const caja = document.getElementById('seccion');
  const titulo = document.getElementById('titulo-seccion');
  const bajada = document.getElementById('bajada-seccion');
  const pie = document.getElementById('pie');
  const botones = [...document.querySelectorAll('.secciones button')];

  const SECCIONES = {{
    conecto: {{
      plantilla: 'tpl-conecto', arranca: () => window.iniciarConectometro(),
      titulo: 'Conectómetro', bajada: 'Cumplimiento del programa · FECh 2026',
      pie: 'Conectómetro — umbrales: 50% media · 70% mínimo · 80% ideal · 90% logro. Los datos se guardan en este navegador.'
    }},
    spt: {{
      plantilla: 'tpl-spt', arranca: () => window.iniciarSPT(),
      titulo: 'SPT · Participación', bajada: 'Sistema de Planificación de Trabajo',
      pie: 'SPT v3.1 · Secretaría de Participación — FECh 2026'
    }}
  }};

  function mostrar(id) {{
    const s = SECCIONES[id];
    if (!s) return;
    window.SECCION = id;
    document.getElementById('drawer').hidden = true;
    caja.innerHTML = '';
    caja.appendChild(document.getElementById(s.plantilla).content.cloneNode(true));
    titulo.textContent = s.titulo;
    bajada.textContent = s.bajada;
    pie.textContent = s.pie;
    botones.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.seccion === id)));
    s.arranca();
  }}

  botones.forEach(b => b.addEventListener('click', () => mostrar(b.dataset.seccion)));

  document.getElementById('btn-tema').addEventListener('click', () => {{
    const actual = document.documentElement.dataset.theme;
    const oscuro = actual ? actual === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = oscuro ? 'light' : 'dark';
    mostrar(window.SECCION);
  }});

  mostrar('conecto');
}})();
</script>
</body>
</html>
"""

with open(SALIDA, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Listo: {os.path.basename(SALIDA)} — {os.path.getsize(SALIDA) / 1024 / 1024:.1f} MB')
