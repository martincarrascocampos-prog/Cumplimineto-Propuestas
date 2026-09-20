# -*- coding: utf-8 -*-
"""Saca de los Estatutos FECh el texto estructurado y las miniaturas de página.

El PDF viene exportado desde Word: cada línea visual es un \n y los párrafos se
separan con una línea en blanco. Eso deja el texto limpio sin heurísticas raras.
Produce estatutos-data.js y estatutos/paginas/p01.webp…
"""
import io, json, os, re, sys
import pymupdf
from PIL import Image

ORIGEN = sys.argv[1] if len(sys.argv) > 1 else 'estatutos/estatutos-fech.pdf'
RAIZ = os.path.dirname(os.path.abspath(__file__))
SALIDA_IMG = os.path.join(RAIZ, 'estatutos', 'paginas')
os.makedirs(SALIDA_IMG, exist_ok=True)

doc = pymupdf.open(ORIGEN)

def limpiar(s):
    s = s.replace('​', ' ').replace('\xa0', ' ')
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()

# --- párrafos, con la página en que empieza cada uno -----------------------
# Los encabezados vienen siempre al principio de una línea, así que se corta ahí
# aunque el párrafo anterior no haya terminado. Eso evita que un TÍTULO quede
# pegado a su primer Capítulo, o un Capítulo a su primer artículo.
RE_CORTE = re.compile(
    r'^(?:T[ÍI]TULO\s+(?:PRELIMINAR|[IVXL]+)\b'
    r'|T[íi]tulo\s+[IVXL]+\b'
    r'|CAP[ÍI]TULO\s|Cap[íi]tulo\s'
    r'|ANEXOS?\b'
    r'|(?:Art[íi]culo|Art\.)\s*\d+'
    r'|[a-záéíóúñ][.)](?:\s|$)'
    r'|[ivx]+\.\s+[A-ZÁÉÍÓÚÑ])')

parrafos = []            # (pagina, texto)
for n, pag in enumerate(doc, start=1):
    buffer = []
    def cerrar():
        global buffer
        if buffer:
            parrafos.append((n, limpiar(' '.join(buffer))))
            buffer = []
    for linea in pag.get_text().split('\n'):
        cruda = linea.replace('\u200b', ' ').strip()
        if not cruda:
            cerrar()
            continue
        if RE_CORTE.match(cruda):
            cerrar()
        buffer.append(cruda)
    cerrar()

# Un párrafo cortado por el salto de página se pega al anterior: la página
# nueva empieza en minúscula y la anterior no terminaba en punto.
unidos = []
for pagina, texto in parrafos:
    if (unidos and texto and texto[0].islower()
            and not unidos[-1][1].endswith(('.', ':', ';'))):
        unidos[-1] = (unidos[-1][0], unidos[-1][1] + ' ' + texto)
    else:
        unidos.append((pagina, texto))
parrafos = [(p, t) for p, t in unidos if t]

# --- clasificación ---------------------------------------------------------
RE_TITULO   = re.compile(r'^T[ÍI]TULO\b', re.I)
RE_CAPITULO = re.compile(r'^CAP[ÍI]TULO\b', re.I)
RE_ARTICULO = re.compile(r'^(?:Art[íi]culo|Art\.)\s*(\d+)\s*[.ºª]?\s*(?:bis)?', re.I)
RE_LETRA    = re.compile(r'^[a-zñ]\s*[.)]\s')
RE_ANEXO    = re.compile(r'^ANEXO', re.I)

bloques = []
for pagina, texto in parrafos:
    if texto.upper().startswith('ÍNDICE'):
        tipo = 'indice'
    elif RE_TITULO.match(texto) or RE_ANEXO.match(texto):
        tipo = 'titulo'
    elif RE_CAPITULO.match(texto):
        tipo = 'capitulo'
    elif RE_ARTICULO.match(texto):
        tipo = 'articulo'
    elif RE_LETRA.match(texto):
        tipo = 'letra'
    else:
        tipo = 'parrafo'
    bloques.append([tipo, pagina, texto])

# El índice del PDF (páginas 2-3) lo reconstruimos nosotros: se descarta.
PAG_INICIO = next((b[1] for b in bloques
                   if b[0] == 'titulo' and b[1] > 3), 4)
portada = [b for b in bloques if b[1] < PAG_INICIO]
bloques = [b for b in bloques if b[1] >= PAG_INICIO]

# Un TÍTULO viene seguido de su nombre en un párrafo aparte; se fusionan.
fusionados = []
for b in bloques:
    prev = fusionados[-1] if fusionados else None
    if (prev and prev[0] == 'titulo' and b[0] == 'parrafo'
            and prev[2].rstrip('. ').upper().endswith(('PRELIMINAR', 'I', 'V', 'X'))
            and b[2].isupper() and len(b[2]) < 160):
        prev[2] = prev[2].rstrip('. ') + '. ' + b[2]
    else:
        fusionados.append(b)
bloques = fusionados

indice = [[b[0], b[1], b[2]] for b in bloques if b[0] in ('titulo', 'capitulo')]
arts = [b for b in bloques if b[0] == 'articulo']

# --- miniaturas ------------------------------------------------------------
if '--sin-imagenes' not in sys.argv:
    for n, pag in enumerate(doc, start=1):
        pix = pag.get_pixmap(dpi=72)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        img.thumbnail((270, 350), Image.LANCZOS)
        img.save(os.path.join(SALIDA_IMG, 'p%02d.webp' % n), 'WEBP', quality=72, method=5)

# --- archivo de datos ------------------------------------------------------
crudo = ' '.join(b[2] for b in portada if b[1] <= 2)
crudo = re.sub(r'\s*(?:T[ÍI]TULO|[ÍI]NDICE).*$', '', crudo)
vigencia = [t.strip(' .') for t in re.split(r'(?=Incorpora|Plebiscitad)', crudo)
            if re.match(r'^(Incorpora|Plebiscitad)', t.strip()) and '(p.' not in t]

js = []
js.append('/* Estatutos de la Federación de Estudiantes de la Universidad de Chile.')
js.append('   Generado por extraer-estatutos.py — no editar a mano. */')
js.append('const ESTATUTOS = {')
js.append('  titulo: %s,' % json.dumps('Estatutos FECh'))
js.append('  bajada: %s,' % json.dumps(
    'Congreso Refundacional 2022-2023 · plebiscitados en mayo de 2023, con sus reformas'))
js.append('  paginas: %d,' % doc.page_count)
js.append('  vigencia: %s,' % json.dumps(vigencia, ensure_ascii=False))
js.append('  articulos: %d,' % len(arts))
js.append('  indice: %s,' % json.dumps(indice, ensure_ascii=False))
js.append('  bloques: [')
for tipo, pagina, texto in bloques:
    js.append('    [%s,%d,%s],' % (json.dumps(tipo), pagina, json.dumps(texto, ensure_ascii=False)))
js.append('  ]')
js.append('};')
open(os.path.join(RAIZ, 'estatutos-data.js'), 'w', encoding='utf-8').write('\n'.join(js) + '\n')

print('páginas:', doc.page_count, '· bloques:', len(bloques),
      '· artículos:', len(arts), '· índice:', len(indice))
for t in indice[:14]:
    print('   ', t[0][:4], 'p%-3d' % t[1], t[2][:80])
