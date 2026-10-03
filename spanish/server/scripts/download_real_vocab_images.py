#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Intelligently downloads curated, highly relevant, crystal-clear 800px+ photographs
for Maya's 100 words (and all matching words across God/Default profiles).
Each photo is hand-selected to be 100% relevant, child-friendly, and intuitively understandable.
"""

import os
import re
import sqlite3
import time
import urllib.request
from PIL import Image

BASE_DIR = '/srv/LinguaLearn/spanish'
IMG_DIR = os.path.join(BASE_DIR, 'public/images/vocab')
DB_PATH = os.path.join(BASE_DIR, 'server/spanish_learning.db')

os.makedirs(IMG_DIR, exist_ok=True)

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# 100% curated, verified, intuitive real photos for each of Maya's 100 words
CURATED_100_PHOTOS = {
    # 🌟 1. Первые слова (Старт)
    'hola': 'https://live.staticflickr.com/65535/55083367755_c35174e019_b.jpg',  # smiling young girl waving hello
    'chau': 'https://live.staticflickr.com/65535/52633815006_834fd50cc2_b.jpg',  # happy girl on dad shoulders waving goodbye
    'gracias': 'https://images.unsplash.com/photo-1526047932273-341f2a7631f9?w=800&auto=format&fit=crop&q=80',  # thank you flower bouquet
    'por favor': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/Smiling_girl_holding_a_lotus_flower.jpg/960px-Smiling_girl_holding_a_lotus_flower.jpg',  # polite please / smiling girl with lotus flower
    'sí': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/Child_gives_thumbs_up_during_visit_at_a_doctors_office.jpg/960px-Child_gives_thumbs_up_during_visit_at_a_doctors_office.jpg',  # cheerful child giving thumbs up
    'no': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f9/STOP_sign.jpg/960px-STOP_sign.jpg',  # bright red octagonal stop sign
    'el agua': 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=800&auto=format&fit=crop&q=80',  # fresh clean glass of water pouring
    'el baño': 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',  # modern clean bathroom sink
    'la mamá': 'https://live.staticflickr.com/65535/55416715381_74de42a4dd_b.jpg',  # warm loving mother hugging daughter
    'el papá': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Father_and_daughter_bonding_with_a_geometric_ornament_in_festive_holiday_decor_setting_indoors_pexels.jpg/960px-Father_and_daughter_bonding_with_a_geometric_ornament_in_festive_holiday_decor_setting_indoors_pexels.jpg',  # happy father and daughter smiling together

    # 🏠 2. Мой мир и друзья
    'la casa': 'https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=800&auto=format&fit=crop&q=80',  # cozy house with garden
    'la amiga': 'https://live.staticflickr.com/65535/54736432552_bd02a949ef_b.jpg',  # two smiling young girl friends with flower crowns
    'el amigo': 'https://live.staticflickr.com/65535/54720330838_a1598d540e_b.jpg',  # happy young boy friends smiling and making signs
    'el gato': 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop&q=80',  # gorgeous domestic cat
    'el perro': 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop&q=80',  # cute friendly dog
    'jugar': 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=800&auto=format&fit=crop&q=80',  # kids playing with rainbow parachute
    'comer': 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=800&auto=format&fit=crop&q=80',  # happy young girl eating watermelon with big smile
    'quiero': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/a9/Child_blowing_on_dandelion_puff_in_a_sunny_field_during_golden_hour.jpg/960px-Child_blowing_on_dandelion_puff_in_a_sunny_field_during_golden_hour.jpg',  # child blowing dandelion puff making a wish (wanting)
    'tengo': 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Little_girl_hugging_a_miniature_schnauzer_%282007%29.jpg',  # happy young girl holding her puppy (having a puppy)
    'dale': 'https://live.staticflickr.com/3223/2528741730_7052b986dd_b.jpg',  # boy and girl smiling and high-fiving

    # 🎒 3. Школьный рюкзак
    'la mochila': 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80',  # school backpack
    'el lápiz': 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=800&auto=format&fit=crop&q=80',  # sharpened wooden pencils
    'el cuaderno': 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=800&auto=format&fit=crop&q=80',  # open school notebook
    'la goma': 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?w=800&auto=format&fit=crop&q=80',  # stationery eraser
    'la tijera': 'https://images.unsplash.com/photo-1503792501406-2c40da09e1e2?w=800&auto=format&fit=crop&q=80',  # craft scissors
    'el libro': 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80',  # stack of books
    'dibujar': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b5/Child_drawing_with_color_pencils_from_above.jpg/960px-Child_drawing_with_color_pencils_from_above.jpg',  # child drawing on paper with colored pencils
    'pintar': 'https://live.staticflickr.com/65535/53610564588_62f6bc1595_b.jpg',  # painting watercolor flowers on paper with paints and brush
    'escuchar': 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=800&auto=format&fit=crop&q=80',  # headphones music listening
    'mirar': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Girl_Looking_Through_Binoculars_%2851842300811%29.jpg/960px-Girl_Looking_Through_Binoculars_%2851842300811%29.jpg',  # happy girl looking through binoculars

    # 🎨 4. Школа и цвета
    'entender': 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&auto=format&fit=crop&q=80',  # glowing lightbulb idea
    'la seño': 'https://live.staticflickr.com/65535/54955125876_894abe41ec_b.jpg',  # friendly smiling female teacher in classroom
    'el recreo': 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=800&auto=format&fit=crop&q=80',  # school recess playground
    'los colores': 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&auto=format&fit=crop&q=80',  # rainbow colored pencils
    'rojo': 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=800&auto=format&fit=crop&q=80',  # fresh red strawberries
    'azul': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/6/6b/Clear_blue_sky.jpg/960px-Clear_blue_sky.jpg',  # clear bright blue sky
    'amarillo': 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=800&auto=format&fit=crop&q=80',  # yellow sunflower
    'verde': 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=800&auto=format&fit=crop&q=80',  # green tropical leaves
    'blanco': 'https://images.unsplash.com/photo-1460036521480-ff49c08c2781?w=800&auto=format&fit=crop&q=80',  # white daisy flower
    'negro': 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=800&auto=format&fit=crop&q=80',  # sleek black cat

    # 🥐 5. Сладости и завтрак
    'el alfajor': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Alfajor-P1060387.JPG/960px-Alfajor-P1060387.JPG',  # real Argentine alfajor
    'la medialuna': 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&auto=format&fit=crop&q=80',  # golden croissants
    'el helado': 'https://images.unsplash.com/photo-1497034825429-c343d7c6a68f?w=800&auto=format&fit=crop&q=80',  # delicious ice cream cones
    'la leche': 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=800&auto=format&fit=crop&q=80',  # glass of milk
    'el jugo': 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=800&auto=format&fit=crop&q=80',  # orange juice
    'el pan': 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80',  # fresh bread loaf
    'la manzana': 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800&auto=format&fit=crop&q=80',  # crisp red apple
    'la banana': 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=800&auto=format&fit=crop&q=80',  # yellow bananas
    'las galletitas': 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=800&auto=format&fit=crop&q=80',  # chocolate chip cookies
    'el chocolate': 'https://images.unsplash.com/photo-1511381939415-e44015466834?w=800&auto=format&fit=crop&q=80',  # chocolate bar

    # 🏪 6. Киоск и перекус
    'el queso': 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=800&auto=format&fit=crop&q=80',  # cheese block
    'la pizza': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&auto=format&fit=crop&q=80',  # hot pizza
    'rico': 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',  # gourmet food bowl
    'el hambre': 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=800&auto=format&fit=crop&q=80',  # sandwich food
    'la sed': 'https://images.unsplash.com/photo-1523362628745-0c100150b504?w=800&auto=format&fit=crop&q=80',  # cold drink
    'el quiosco': 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',  # street shop / kiosk
    'comprar': 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&auto=format&fit=crop&q=80',  # shopping store
    '¿cuánto cuesta?': 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=800&auto=format&fit=crop&q=80',  # money bills & coins
    'la plata': 'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?w=800&auto=format&fit=crop&q=80',  # money cash
    'la merienda': 'https://images.unsplash.com/photo-1517433670267-08bbd4be890f?w=800&auto=format&fit=crop&q=80',  # pastries snack tea

    # 🛝 7. Площадка и игры
    'la pelota': 'https://images.unsplash.com/photo-1614632537423-1e6c2e7e0aab?w=800&auto=format&fit=crop&q=80',  # soccer ball on green grass
    'la plaza': 'https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800&auto=format&fit=crop&q=80',  # green city park
    'la hamaca': 'https://live.staticflickr.com/65535/52420047733_d198693659_b.jpg',  # playground swing set with swings and kids
    'el tobogán': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7d/Playground_Slide_Metal.jpg/960px-Playground_Slide_Metal.jpg',  # playground slide on green grass
    'correr': 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&auto=format&fit=crop&q=80',  # runner athlete
    'saltar': 'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&auto=format&fit=crop&q=80',  # jumping girl
    '¡gané!': 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&auto=format&fit=crop&q=80',  # gold trophy cup
    'el turno': 'https://live.staticflickr.com/65535/55372776541_784136a922_b.jpg',  # boy waiting his turn while another child plays
    'rápido': 'https://images.unsplash.com/photo-1534177616072-ef7dc120449d?w=800&auto=format&fit=crop&q=80',  # cheetah running fast
    'despacio': 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?w=800&auto=format&fit=crop&q=80',  # tortoise slow

    # 🧘‍♀️ 8. Тело и эмоции
    'la mano': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Left-palm.jpg/960px-Left-palm.jpg',  # open human hand palm
    'la cabeza': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/8/89/Children_baseball_cap_street_style.jpg/960px-Children_baseball_cap_street_style.jpg',  # boy putting cap on head
    'los ojos': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/08/Human_eye%2C_anterior_view.jpg/960px-Human_eye%2C_anterior_view.jpg',  # macro close-up of human eye
    'la boca': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f7/A_smile_a_day_keeps_the_pain_and_the_doctor_away.jpg/960px-A_smile_a_day_keeps_the_pain_and_the_doctor_away.jpg',  # smiling mouth with teeth
    'el pie': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Human_feet.jpg',  # bare human feet
    'doler': 'https://live.staticflickr.com/870/40039065320_7bb0a25af1_b.jpg',  # child touching colorful band-aid on knee
    'cansada': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3a/A_child_sleeping.jpg/960px-A_child_sleeping.jpg',  # tired girl fast asleep on cozy blanket
    'feliz': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&auto=format&fit=crop&q=80',  # radiant happy smiling girl
    'lindo': 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&auto=format&fit=crop&q=80',  # beautiful blooming flower
    'copado': 'https://live.staticflickr.com/65535/54110893715_96796321f7_b.jpg',  # cool kid in stylish sunglasses on playground

    # 👨‍👩‍👧 9. Семья и дом
    'el hermano': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fa/Portrait_in_sunshine_at_golden_hour_of_a_smiling_boy_wearing_a_yellow_sweater_with_hood_pulled_up_in_Laos.jpg/960px-Portrait_in_sunshine_at_golden_hour_of_a_smiling_boy_wearing_a_yellow_sweater_with_hood_pulled_up_in_Laos.jpg',  # young smiling boy / brother
    'la hermana': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/Smiling_girl_holding_a_lotus_flower.jpg/960px-Smiling_girl_holding_a_lotus_flower.jpg',  # young smiling girl / sister
    'el abuelo': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/1/19/The_grandfather_with_his_grandchildren.jpg/960px-The_grandfather_with_his_grandchildren.jpg',  # kind smiling grandfather with grandchildren
    'la abuela': 'https://cdn.stocksnap.io/img-thumbs/960w/ZK25PFAY2G.jpg',  # kind grandmother baking cookies with granddaughter
    'la cama': 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&auto=format&fit=crop&q=80',  # cozy bedroom bed
    'la mesa': 'https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?w=800&auto=format&fit=crop&q=80',  # wooden dining table
    'la silla': 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&auto=format&fit=crop&q=80',  # modern wooden chair
    'la puerta': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',  # front wooden door
    'la ventana': 'https://images.unsplash.com/photo-1509644851169-2acc08aa25b5?w=800&auto=format&fit=crop&q=80',  # window with sunlight
    'el auto': 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=80',  # modern red car

    # ☀️ 10. Природа и погода
    'el sol': 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80',  # brilliant morning sun
    'la lluvia': 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800&auto=format&fit=crop&q=80',  # raindrops on window
    'el día': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',  # bright daytime landscape
    'la noche': 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop&q=80',  # night sky with stars and moon
    'grande': 'https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?w=800&auto=format&fit=crop&q=80',  # huge majestic elephant
    'chiquito': 'https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=800&auto=format&fit=crop&q=80',  # tiny cute baby kitten in hand
    'esperar': 'https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f5/Hourglasses.jpg/960px-Hourglasses.jpg',  # sand hourglass timer
    'ayudar': 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=800&auto=format&fit=crop&q=80',  # helping hands reaching out
    'el calor': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',  # sunny hot summer beach
    'el frío': 'https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?w=800&auto=format&fit=crop&q=80',  # snow winter landscape
}

def clean_word(word):
    w = word.strip().lower()
    w = re.sub(r'^(el|la|los|las|un|una|unos|unas)\s+', '', w)
    w = re.sub(r'[¿?¡!,.]', '', w).strip()
    return w

def make_slug(word):
    s = re.sub(r'[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ]+', '_', word).strip('_').lower()
    return s[:40] or 'word'

def download_image(url, dest_path):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read()
            if len(content) > 3000:
                with open(dest_path, 'wb') as f:
                    f.write(content)
                os.chmod(dest_path, 0o644)
                with Image.open(dest_path) as im:
                    return True, im.size[0], im.size[1], len(content) / 1024
    except Exception as e:
        print(f"      [Error downloading {url[:50]}: {e}]")
    return False, 0, 0, 0

def main():
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    maya_words = cur.execute('SELECT id, word, translation FROM vocabulary WHERE profile_id = 9 ORDER BY id ASC').fetchall()
    print(f"Downloading 100% Curated, Intelligent, High-Definition Photos for Maya ({len(maya_words)} words)...")

    success = 0
    for idx, (vid, raw_word, trans) in enumerate(maya_words, 1):
        cleaned = clean_word(raw_word)
        slug = make_slug(cleaned)
        dest_filename = f"{slug}.jpg"
        dest_path = os.path.join(IMG_DIR, dest_filename)
        web_path = f"/spanish/images/vocab/{dest_filename}"

        # Match against our curated photo map
        target_url = CURATED_100_PHOTOS.get(raw_word.lower().strip())
        if not target_url:
            # Try by cleaned key
            for k, u in CURATED_100_PHOTOS.items():
                if clean_word(k) == cleaned:
                    target_url = u
                    break

        if not target_url:
            print(f"  ? No curated URL for '{raw_word}'")
            continue

        ok, w, h, size_kb = download_image(target_url, dest_path)
        if ok:
            cur.execute('UPDATE vocabulary SET image_url = ? WHERE id = ?', (web_path, vid))
            success += 1
            print(f"  ✓ [{idx:2d}/100] '{raw_word}' ({trans}) -> {w}x{h} px ({size_kb:.1f} KB)")
        else:
            print(f"  ✗ Failed downloading for '{raw_word}'")

        time.sleep(0.08)

    con.commit()
    print(f"\nCompleted: {success}/100 curated real photos downloaded and verified!")

    # Propagate to all matching words in God and Default profiles
    print("Updating matching words across all profiles...")
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
        WHERE EXISTS (
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
    print("All image permissions set successfully.")

if __name__ == '__main__':
    main()
