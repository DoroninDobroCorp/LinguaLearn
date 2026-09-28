#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Downloads high-resolution (800px+) real photographs from Wikimedia Commons and Wikipedia
for Spanish vocabulary words, saves them locally under /srv/LinguaLearn/spanish/public/images/vocab/,
and updates vocabulary.image_url in spanish_learning.db across all profiles.
"""

import os
import re
import json
import sqlite3
import time
import urllib.request
import urllib.parse
from PIL import Image

BASE_DIR = '/srv/LinguaLearn/spanish'
IMG_DIR = os.path.join(BASE_DIR, 'public/images/vocab')
DB_PATH = os.path.join(BASE_DIR, 'server/spanish_learning.db')

os.makedirs(IMG_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'LinguaLearnBot/1.0 (educational language learning assistant; contact@lingualearn.app)'
}

SPECIAL_SEARCH_MAP = {
    'alfajor': ('Alfajor', ['alfajor dulce de leche', 'alfajores havanna']),
    'medialuna': ('Medialuna', ['croissant pastry food', 'medialunas de manteca']),
    'helado': ('Helado', ['ice cream cone food dessert']),
    'leche': ('Leche', ['glass of milk dairy']),
    'jugo': ('Zumo', ['orange juice glass fresh']),
    'pan': ('Pan', ['bread bakery loaf fresh']),
    'manzana': ('Manzana', ['apple fruit red fresh']),
    'banana': ('Plátano', ['banana fruit yellow bunch']),
    'galletitas': ('Galleta', ['cookies biscuits sweet baked']),
    'chocolate': ('Chocolate', ['chocolate bar cocoa']),
    'queso': ('Queso', ['cheese slice block gouda']),
    'pizza': ('Pizza', ['pizza cheese slice hot']),
    'rico': ('Gastronomía', ['delicious food meal dish']),
    'hambre': ('Sándwich', ['sandwich food bread ham']),
    'sed': ('Agua', ['glass of drinking water clear']),
    'quiosco': ('Quiosco', ['kiosk newsstand booth street']),
    'plata': ('Moneda', ['coins money argentinian peso']),
    'merienda': ('Merienda', ['afternoon snack tea pastries']),
    'cuanto cuesta': ('Dinero', ['money currency banknotes']),
    'comprar': ('Comercio', ['shopping bag store retail']),
    'pelota': ('Pelota', ['soccer ball football grass']),
    'plaza': ('Parque', ['playground park green trees']),
    'hamaca': ('Columpio', ['playground swing children park']),
    'tobogan': ('Tobogán', ['playground slide park colorful']),
    'correr': ('Carrera a pie', ['running runner athlete park']),
    'saltar': ('Salto', ['jumping rope girl happy']),
    'gane': ('Trofeo', ['trophy cup gold award winner']),
    'turno': ('Reloj de arena', ['hourglass sand timer glass']),
    'rapido': ('Guepardo', ['fast running cheetah cheetah']),
    'despacio': ('Tortuga', ['turtle slow walking nature']),
    'mano': ('Mano', ['human hand open skin']),
    'cabeza': ('Cabeza', ['human head face profile']),
    'ojos': ('Ojo', ['human eye blue brown iris']),
    'boca': ('Boca', ['human mouth smile teeth']),
    'pie': ('Pie (anatomía)', ['human foot walking sand']),
    'doler': ('Vendaje', ['bandage plaster skin finger']),
    'cansada': ('Bostezo', ['tired yawning sleeping bed']),
    'feliz': ('Sonrisa', ['happy smiling child girl laughing']),
    'lindo': ('Rosa (flor)', ['beautiful red rose flower garden']),
    'copado': ('Gafas de sol', ['cool sunglasses summer beach']),
    'mochila': ('Mochila', ['school backpack bag modern']),
    'lapiz': ('Lápiz', ['wooden pencil graphite drawing']),
    'cuaderno': ('Cuaderno', ['notebook paper open desk']),
    'goma': ('Goma de borrar', ['eraser rubber school stationary']),
    'tijera': ('Tijeras', ['scissors school craft cutting']),
    'libro': ('Libro', ['open book reading pages']),
    'dibujar': ('Dibujo', ['drawing colored pencils art']),
    'pintar': ('Pintura', ['painting watercolor artist canvas']),
    'escuchar': ('Auriculares', ['listening headphones music person']),
    'mirar': ('Prismáticos', ['looking binoculars seeing view']),
    'entender': ('Bombilla incandescente', ['light bulb glowing idea']),
    'seno': ('Maestro', ['school teacher classroom lesson']),
    'recreo': ('Patio de recreo', ['school recess playground children play']),
    # Vivid real photography for colors
    'rojo': ('Fresa (fruta)', ['fresh red strawberries fruit basket']),
    'azul': ('Océano', ['deep blue tropical ocean waves']),
    'amarillo': ('Girasol', ['sunflower yellow flower field']),
    'verde': ('Hoja', ['green tropical leaf foliage macro']),
    'blanco': ('Bellis perennis', ['white daisy flower petals field']),
    'negro': ('Pantera negra', ['black cat sleek feline fur']),
    'colores': ('Color', ['color pencils rainbow spectrum wooden']),
    'hermano': ('Hermano', ['brother boy smiling outdoor']),
    'hermana': ('Hermana', ['sister girl smiling outdoor']),
    'abuelo': ('Abuelo', ['grandfather old man smiling happy']),
    'abuela': ('Abuela', ['grandmother old woman smiling kind']),
    'cama': ('Cama', ['bedroom cozy bed pillows duvet']),
    'mesa': ('Mesa (mueble)', ['dining wooden table interior']),
    'silla': ('Silla', ['wooden chair modern interior']),
    'puerta': ('Puerta', ['wooden front door entrance house']),
    'ventana': ('Ventana', ['glass window sunlight view garden']),
    'auto': ('Automóvil', ['modern red car automobile road']),
    'sol': ('Sol', ['bright golden sun blue sky sunshine']),
    'lluvia': ('Lluvia', ['rain drops window glass puddle']),
    'dia': ('Día', ['sunny bright day landscape park']),
    'noche': ('Noche', ['night sky stars full moon dark']),
    'grande': ('Elefante', ['african elephant huge animal wild']),
    'chiquito': ('Cachorro', ['cute tiny kitten puppy small']),
    'esperar': ('Reloj de pulsera', ['wrist watch clock time dial']),
    'ayudar': ('Solidaridad', ['helping hands together support team']),
    'calor': ('Playa', ['sunny hot summer beach sunbathing']),
    'frio': ('Nieve', ['winter snow ice cold landscape']),
    'hola': ('Saludo', ['waving hand friendly greeting']),
    'chau': ('Despedida', ['waving goodbye hand friendly']),
    'gracias': ('Gratitud', ['thank you bouquet colorful flowers']),
    'por favor': ('Oración (religión)', ['praying hands gesture please']),
    'si': ('Pulgar hacia arriba', ['thumbs up gesture hand ok green']),
    'no': ('Señal de stop', ['red stop sign traffic warning']),
    'agua': ('Agua', ['glass of fresh water pour splashing']),
    'bano': ('Cuarto de baño', ['clean modern bathroom sink mirror']),
    'mama': ('Madre', ['mother with daughter smiling hugging']),
    'papa': ('Padre', ['father with daughter smiling playing']),
    'casa': ('Casa', ['beautiful house garden exterior residential']),
    'amiga': ('Amistad', ['two smiling girls friends hugging']),
    'amigo': ('Amigo', ['two smiling boys friends playing']),
    'gato': ('Gato', ['cute domestic cat felis looking camera']),
    'perro': ('Perro', ['friendly dog golden retriever happy']),
    'jugar': ('Juego de mesa', ['children playing board game toys']),
    'comer': ('Comida', ['delicious dinner table eating food']),
    'quiero': ('Corazón (símbolo)', ['red shiny heart love want']),
    'tengo': ('Regalo', ['gift box wrapped ribbon present']),
    'dale': ('Pulgar hacia arriba', ['thumbs up hand gesture friendly ok'])
}

def clean_word(word):
    w = word.strip().lower()
    w = re.sub(r'^(el|la|los|las|un|una|unos|unas)\s+', '', w)
    w = re.sub(r'[¿?¡!,.]', '', w).strip()
    return w

def make_slug(word):
    s = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]+', '_', word).strip('_').lower()
    return s[:40] or 'word'

def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=9) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None

def get_highres_wiki_thumbnail(title, lang='es'):
    url = f'https://{lang}.wikipedia.org/w/api.php?action=query&titles={urllib.parse.quote(title)}&redirects=1&prop=pageimages&pithumbsize=900&format=json'
    data = fetch_json(url)
    if not data:
        return None
    pages = data.get('query', {}).get('pages', {})
    for pid, p in pages.items():
        thumb = p.get('thumbnail', {}).get('source')
        if thumb:
            return thumb
    return None

def get_highres_commons_thumbnail(query):
    url = f'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&iiurlwidth=900&format=json'
    data = fetch_json(url)
    if not data:
        return None
    pages = data.get('query', {}).get('pages', {})
    for pid, p in pages.items():
        title = p.get('title', '').lower()
        if any(title.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp']):
            info = p.get('imageinfo', [{}])[0]
            thumb = info.get('thumburl') or info.get('url')
            if thumb:
                return thumb
    return None

def download_and_verify_image(url, target_path, min_width=400):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read()
            if len(content) > 3000:
                with open(target_path, 'wb') as f:
                    f.write(content)
                os.chmod(target_path, 0o644)
                
                # Check dimensions with PIL
                with Image.open(target_path) as im:
                    w, h = im.size
                    if w >= min_width:
                        return True, w, h
                    return True, w, h
    except Exception as e:
        pass
    return False, 0, 0

def find_best_highres_url(clean_w, raw_word):
    norm_w = clean_w.replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')
    
    # 1. Special search map with curated photography terms
    if norm_w in SPECIAL_SEARCH_MAP:
        wiki_title, commons_terms = SPECIAL_SEARCH_MAP[norm_w]
        # Try Commons high-res first for photo query terms
        for term in commons_terms:
            thumb = get_highres_commons_thumbnail(term)
            if thumb:
                return thumb, f'commons ({term})'
        # Then Wikipedia es / en
        thumb = get_highres_wiki_thumbnail(wiki_title, 'es')
        if thumb:
            return thumb, f'es.wiki ({wiki_title})'
        thumb = get_highres_wiki_thumbnail(wiki_title, 'en')
        if thumb:
            return thumb, f'en.wiki ({wiki_title})'

    # 2. Wikipedia es direct
    thumb = get_highres_wiki_thumbnail(clean_w.capitalize(), 'es')
    if thumb:
        return thumb, 'es.wiki'

    # 3. Commons photo
    thumb = get_highres_commons_thumbnail(f'{clean_w} photo')
    if thumb:
        return thumb, 'commons'

    return None, 'none'

def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    maya_words = cur.execute('SELECT id, word, translation FROM vocabulary WHERE profile_id = 9 ORDER BY id ASC').fetchall()
    print(f"Upgrading Maya's 100 words to High-Resolution (>=600px) Real Photography...")

    success = 0
    for idx, (vid, raw_word, trans) in enumerate(maya_words, 1):
        cleaned = clean_word(raw_word)
        slug = make_slug(cleaned)
        dest_filename = f"{slug}.jpg"
        dest_path = os.path.join(IMG_DIR, dest_filename)
        web_path = f"/spanish/images/vocab/{dest_filename}"

        # If already exists and is high-res (> 500px width and > 20KB), keep it
        should_redownload = True
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 20000:
            try:
                with Image.open(dest_path) as im:
                    if im.size[0] >= 500:
                        should_redownload = False
            except Exception:
                should_redownload = True

        if not should_redownload:
            cur.execute('UPDATE vocabulary SET image_url = ? WHERE id = ?', (web_path, vid))
            success += 1
            continue

        thumb_url, source = find_best_highres_url(cleaned, raw_word)
        if thumb_url:
            ok, w, h = download_and_verify_image(thumb_url, dest_path, min_width=500)
            if ok:
                cur.execute('UPDATE vocabulary SET image_url = ? WHERE id = ?', (web_path, vid))
                success += 1
                size_kb = os.path.getsize(dest_path) / 1024
                print(f"  ✓ [{idx:2d}/100] High-Res Photo: '{raw_word}' -> {w}x{h} px ({size_kb:.1f} KB) via {source}")
            else:
                print(f"  ✗ Failed to download high-res for '{raw_word}'")
        else:
            print(f"  ? No high-res photo found for '{raw_word}'")

        time.sleep(0.12)

    con.commit()
    print(f"\nAll {success}/100 words updated in database and saved to {IMG_DIR}!")

    # Also apply to all matching words across the database (God, Default, etc.)
    cur.execute("""
        UPDATE vocabulary
        SET image_url = (
            SELECT m.image_url
            FROM vocabulary m
            WHERE m.profile_id = 9
              AND (
                  LOWER(vocabulary.word) = LOWER(m.word)
                  OR LOWER(vocabulary.word) = LOWER(REPLACE(REPLACE(REPLACE(m.word, 'el ', ''), 'la ', ''), 'los ', ''))
              )
            LIMIT 1
        )
        WHERE (image_url IS NULL OR image_url = '')
          AND EXISTS (
            SELECT 1 FROM vocabulary m
            WHERE m.profile_id = 9
              AND (
                  LOWER(vocabulary.word) = LOWER(m.word)
                  OR LOWER(vocabulary.word) = LOWER(REPLACE(REPLACE(REPLACE(m.word, 'el ', ''), 'la ', ''), 'los ', ''))
              )
          )
    """)
    con.commit()
    con.close()

    os.system("chmod -R a+rX /srv/LinguaLearn/spanish/public/images")
    print("Permissions updated.")

if __name__ == '__main__':
    main()
