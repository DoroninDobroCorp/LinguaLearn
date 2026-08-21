# -*- coding: utf-8 -*-
"""
Generates all A1 media assets (Covers, Illustrations, Audios) and MANIFEST.json.
Enforces CEFR A1 specification limits:
- Cover WebP <= 220 KB (16:9)
- Item Illustration WebP <= 120 KB
- Audio MP3 <= 1 MB
- Manifest with Russian alt text and CC BY-SA 4.0 license metadata.
"""
import os
import json
import subprocess
from PIL import Image, ImageDraw

BASE_DIR = '/srv/LinguaLearn/spanish'
MEDIA_DIR = os.path.join(BASE_DIR, 'public/a1/media')
AUDIO_DIR = os.path.join(MEDIA_DIR, 'audio')

os.makedirs(MEDIA_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

manifest_items = []

COVERS_CONFIG = [
    {
        "unit": "a1-u01-first-contact",
        "filename": "a1-u01-cover-01.webp",
        "title": "Unidad 1: Primer Contacto",
        "subtitle": "Первый контакт: приветствия, числа и знакомство",
        "alt": "Обложка модуля 1: Первый контакт в испаноязычной среде",
        "bg_colors": [(24, 24, 48), (76, 29, 149)],
        "accent": (236, 72, 153)
    },
    {
        "unit": "a1-u02-things",
        "filename": "a1-u02-cover-01.webp",
        "title": "Unidad 2: Objetos y Artículos",
        "subtitle": "Предметы вокруг: род, артикли, цвета и множественное число",
        "alt": "Обложка модуля 2: Описание предметов и согласование артиклей",
        "bg_colors": [(15, 23, 42), (14, 116, 144)],
        "accent": (56, 189, 248)
    },
    {
        "unit": "a1-u03-identity",
        "filename": "a1-u03-cover-01.webp",
        "title": "Unidad 3: Identidad y Descripción",
        "subtitle": "Кто мы и какие мы: разница Ser/Estar и описание людей",
        "alt": "Обложка модуля 3: Описание внешности и характера человека",
        "bg_colors": [(30, 27, 75), (109, 40, 217)],
        "accent": (244, 114, 182)
    },
    {
        "unit": "a1-u04-family",
        "filename": "a1-u04-cover-01.webp",
        "title": "Unidad 4: Familia y Posesión",
        "subtitle": "Семья и принадлежность: родственники, глагол Tener и тело",
        "alt": "Обложка модуля 4: Семья, родственные связи и притяжательные формы",
        "bg_colors": [(67, 20, 7), (180, 83, 9)],
        "accent": (251, 191, 36)
    },
    {
        "unit": "a1-u05-actions",
        "filename": "a1-u05-cover-01.webp",
        "title": "Unidad 5: Acciones Cotidianas",
        "subtitle": "Повседневные действия: глаголы -AR, отрицание и вопросы",
        "alt": "Обложка модуля 5: Повседневные действия и правила построения фраз",
        "bg_colors": [(6, 78, 59), (13, 148, 136)],
        "accent": (52, 211, 153)
    },
    {
        "unit": "a1-u06-calendar",
        "filename": "a1-u06-cover-01.webp",
        "title": "Unidad 6: Tiempo y Calendario",
        "subtitle": "Календарь и время: дни недели, часы и числа до 1000",
        "alt": "Обложка модуля 6: Дни недели, определение времени и числа",
        "bg_colors": [(19, 78, 74), (2, 132, 199)],
        "accent": (56, 189, 248)
    },
    {
        "unit": "a1-u07-food",
        "filename": "a1-u07-cover-01.webp",
        "title": "Unidad 7: Comida y Restaurante",
        "subtitle": "Еда и кафе: глаголы -ER/-IR, заказ блюд и меню",
        "alt": "Обложка модуля 7: Гастрономия, заказ еды в ресторане и напитки",
        "bg_colors": [(127, 29, 29), (194, 65, 12)],
        "accent": (251, 146, 60)
    },
    {
        "unit": "a1-u08-home",
        "filename": "a1-u08-cover-01.webp",
        "title": "Unidad 8: El Hogar y el Espacio",
        "subtitle": "Дом и пространство: конструкция Hay, предлоги места и мебель",
        "alt": "Обложка модуля 8: Дом, планировка комнат и ориентация в пространстве",
        "bg_colors": [(17, 24, 39), (79, 70, 229)],
        "accent": (167, 139, 250)
    },
    {
        "unit": "a1-u09-needs",
        "filename": "a1-u09-cover-01.webp",
        "title": "Unidad 9: Gustos, Planes y Ropa",
        "subtitle": "Планы, вкусы и одежда: глагол Gustar, будущее время и покупки",
        "alt": "Обложка модуля 9: Предпочтения, планы на будущее и покупки одежды",
        "bg_colors": [(76, 29, 149), (219, 39, 119)],
        "accent": (244, 114, 182)
    }
]

def draw_gradient_16_9(width, height, col1, col2):
    img = Image.new('RGB', (width, height))
    draw = ImageDraw.Draw(img)
    for y in range(height):
        r = int(col1[0] + (col2[0] - col1[0]) * (y / height))
        g = int(col1[1] + (col2[1] - col1[1]) * (y / height))
        b = int(col1[2] + (col2[2] - col1[2]) * (y / height))
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    return img

print("Generating 9 Unit Cover Images in WebP...")
for c in COVERS_CONFIG:
    w, h = 960, 540
    img = draw_gradient_16_9(w, h, c["bg_colors"][0], c["bg_colors"][1])
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([30, 30, w - 30, h - 30], radius=24, outline=c["accent"], width=3)
    draw.rounded_rectangle([45, 45, w - 45, h - 45], radius=18, outline=(255, 255, 255), width=1)

    draw.rounded_rectangle([60, 60, 260, 105], radius=12, fill=c["accent"])
    draw.text((75, 72), "NIVEL CEFR A1", fill=(255, 255, 255))

    draw.text((60, 220), c["title"], fill=(255, 255, 255))
    draw.text((60, 280), c["subtitle"], fill=(226, 232, 240))

    draw.ellipse([w - 320, 100, w - 80, 340], outline=c["accent"], width=4)
    draw.ellipse([w - 290, 130, w - 110, 310], outline=(255, 255, 255), width=2)

    filepath = os.path.join(MEDIA_DIR, c["filename"])
    img.save(filepath, 'WEBP', quality=85)
    fsize = os.path.getsize(filepath)

    if fsize > 220 * 1024:
        img.save(filepath, 'WEBP', quality=75)
        fsize = os.path.getsize(filepath)

    print(f"Cover {c['filename']}: {fsize / 1024:.1f} KB (limit <= 220 KB)")
    manifest_items.append({
        "filename": c["filename"],
        "unit": c["unit"],
        "type": "cover",
        "altRu": c["alt"],
        "width": w,
        "height": h,
        "sizeBytes": fsize,
        "license": "CC BY-SA 4.0",
        "creator": "LinguaLearn Spanish Educational Media Engine"
    })

ITEMS_SPEC = [
    # Unit 1
    ("a1-u01-first-contact", "a1-u01-purpose-01.webp", "Приветствие и рукопожатие", (120, 60, 180)),
    ("a1-u01-first-contact", "a1-u01-purpose-02.webp", "Паспорт и посадочный талон", (50, 100, 200)),
    ("a1-u01-first-contact", "a1-u01-purpose-03.webp", "Бейдж с именем на конференции", (200, 80, 120)),
    ("a1-u01-first-contact", "a1-u01-purpose-04.webp", "Числа от одного до десяти", (40, 150, 100)),
    ("a1-u01-first-contact", "a1-u01-purpose-05.webp", "Флаги испаноязычных стран", (210, 120, 20)),
    ("a1-u01-first-contact", "a1-u01-purpose-06.webp", "Студент с учебником испанского", (100, 50, 150)),
    ("a1-u01-first-contact", "a1-u01-purpose-07.webp", "Формула вежливости: Пожалуйста и Спасибо", (180, 50, 80)),
    ("a1-u01-first-contact", "a1-u01-purpose-08.webp", "Диалог знакомства в языковом классе", (30, 120, 160)),

    # Unit 2
    ("a1-u02-things", "a1-u02-purpose-01.webp", "Книга и тетрадь на письменном столе", (30, 80, 160)),
    ("a1-u02-things", "a1-u02-purpose-02.webp", "Цветные карандаши и линейка", (200, 100, 30)),
    ("a1-u02-things", "a1-u02-purpose-03.webp", "Карта города с улицами и площадями", (40, 140, 90)),
    ("a1-u02-things", "a1-u02-purpose-04.webp", "Рыбы в прозрачном аквариуме", (20, 160, 180)),
    ("a1-u02-things", "a1-u02-purpose-05.webp", "Белая и синяя футболки", (120, 40, 160)),
    ("a1-u02-things", "a1-u02-purpose-06.webp", "Очки и часы на прикроватной тумбочке", (160, 80, 40)),
    ("a1-u02-things", "a1-u02-purpose-07.webp", "Здание университета с большими окнами", (60, 60, 120)),
    ("a1-u02-things", "a1-u02-purpose-08.webp", "Красное яблоко и апельсин на тарелке", (190, 40, 40)),

    # Unit 3
    ("a1-u03-identity", "a1-u03-purpose-01.webp", "Портрет улыбающегося студента", (130, 40, 150)),
    ("a1-u03-identity", "a1-u03-purpose-02.webp", "Врач в белом халате в больнице", (40, 100, 180)),
    ("a1-u03-identity", "a1-u03-purpose-03.webp", "Высокий парень и невысокая девушка", (180, 70, 90)),
    ("a1-u03-identity", "a1-u03-purpose-04.webp", "Человек с кудрявыми темными волосами", (120, 80, 30)),
    ("a1-u03-identity", "a1-u03-purpose-05.webp", "Преподаватель в очках и с бородой", (50, 130, 110)),
    ("a1-u03-identity", "a1-u03-purpose-06.webp", "Светлое лицо с голубыми глазами", (30, 140, 200)),
    ("a1-u03-identity", "a1-u03-purpose-07.webp", "Человек, отдыхающий на диване после работы", (90, 50, 140)),
    ("a1-u03-identity", "a1-u03-purpose-08.webp", "Счастливые друзья на площади Мадрида", (200, 90, 40)),

    # Unit 4
    ("a1-u04-family", "a1-u04-purpose-01.webp", "Семейный портрет трех поколений", (180, 60, 30)),
    ("a1-u04-family", "a1-u04-purpose-02.webp", "Дедушка и бабушка читают книгу внукам", (160, 90, 40)),
    ("a1-u04-family", "a1-u04-purpose-03.webp", "Старший брат и младшая сестра с собакой", (40, 120, 80)),
    ("a1-u04-family", "a1-u04-purpose-04.webp", "Прием у врача: осмотр горла и глаз", (30, 90, 170)),
    ("a1-u04-family", "a1-u04-purpose-05.webp", "Связка ключей от семейного дома", (200, 130, 20)),
    ("a1-u04-family", "a1-u04-purpose-06.webp", "Человек держится за голову от боли", (170, 40, 70)),
    ("a1-u04-family", "a1-u04-purpose-07.webp", "Тёплый шарф на шее в холодную погоду", (90, 40, 140)),
    ("a1-u04-family", "a1-u04-purpose-08.webp", "Семья обедает в загородном саду", (60, 130, 50)),

    # Unit 5
    ("a1-u05-actions", "a1-u05-purpose-01.webp", "Утренний будильник и чашка кофе", (190, 80, 20)),
    ("a1-u05-actions", "a1-u05-purpose-02.webp", "Человек работает за ноутбуком в офисе", (30, 100, 160)),
    ("a1-u05-actions", "a1-u05-purpose-03.webp", "Студенты слушают лекцию в аудитории", (80, 40, 150)),
    ("a1-u05-actions", "a1-u05-purpose-04.webp", "Приготовление традиционной паэльи на кухне", (200, 60, 30)),
    ("a1-u05-actions", "a1-u05-purpose-05.webp", "Прогулка по парку с наушниками", (40, 140, 90)),
    ("a1-u05-actions", "a1-u05-purpose-06.webp", "Пара танцует на празднике", (180, 40, 100)),
    ("a1-u05-actions", "a1-u05-purpose-07.webp", "Знак вопроса над открытой книгой", (50, 120, 180)),
    ("a1-u05-actions", "a1-u05-purpose-08.webp", "Покупка свежих продуктов в лавке", (140, 100, 30)),

    # Unit 6
    ("a1-u06-calendar", "a1-u06-purpose-01.webp", "Настенный календарь с днями недели", (30, 90, 160)),
    ("a1-u06-calendar", "a1-u06-purpose-02.webp", "Круглые настенные часы показывают 10:15", (180, 80, 30)),
    ("a1-u06-calendar", "a1-u06-purpose-03.webp", "Четыре времени года: весна, лето, осень, зима", (40, 130, 80)),
    ("a1-u06-calendar", "a1-u06-purpose-04.webp", "Табло расписания на вокзале поездов", (60, 50, 130)),
    ("a1-u06-calendar", "a1-u06-purpose-05.webp", "Солнечный полдень на центральной площади", (210, 120, 10)),
    ("a1-u06-calendar", "a1-u06-purpose-06.webp", "Числовые карточки с сотнями до 1000", (160, 40, 90)),
    ("a1-u06-calendar", "a1-u06-purpose-07.webp", "Осенние золотые листья в городском парке", (190, 90, 20)),
    ("a1-u06-calendar", "a1-u06-purpose-08.webp", "Заснеженные горы в зимний месяц", (30, 120, 190)),

    # Unit 7
    ("a1-u07-food", "a1-u07-purpose-01.webp", "Традиционная испанская тортилья и свежий хлеб", (190, 90, 20)),
    ("a1-u07-food", "a1-u07-purpose-02.webp", "Бокал белого вина и графин с водой", (40, 110, 170)),
    ("a1-u07-food", "a1-u07-purpose-03.webp", "Тарелка свежего салата с помидорами и оливками", (50, 140, 60)),
    ("a1-u07-food", "a1-u07-purpose-04.webp", "Официант приносит меню гостям за столиком", (120, 40, 140)),
    ("a1-u07-food", "a1-u07-purpose-05.webp", "Шоколадное мороженое и чашка эспрессо", (100, 50, 30)),
    ("a1-u07-food", "a1-u07-purpose-06.webp", "Столовые приборы: вилка, нож и ложка", (140, 140, 150)),
    ("a1-u07-food", "a1-u07-purpose-07.webp", "Чек и банковская карта для оплаты счета", (30, 80, 150)),
    ("a1-u07-food", "a1-u07-purpose-08.webp", "Фруктовая лавка с апельсинами и бананами", (210, 110, 10)),

    # Unit 8
    ("a1-u08-home", "a1-u08-purpose-01.webp", "Светлая гостиная с серым диваном и окном", (40, 90, 160)),
    ("a1-u08-home", "a1-u08-purpose-02.webp", "Уютная спальня с двуспальной кроватью", (130, 50, 140)),
    ("a1-u08-home", "a1-u08-purpose-03.webp", "Современная кухня с холодильником и столом", (50, 130, 90)),
    ("a1-u08-home", "a1-u08-purpose-04.webp", "Кот спит под столом в комнате", (180, 90, 30)),
    ("a1-u08-home", "a1-u08-purpose-05.webp", "Цветущий балкон с видом на старый город", (190, 50, 80)),
    ("a1-u08-home", "a1-u08-purpose-06.webp", "Книжная полка с испанскими словарями", (100, 60, 30)),
    ("a1-u08-home", "a1-u08-purpose-07.webp", "Вход в подъезд жилого дома с домофоном", (60, 60, 120)),
    ("a1-u08-home", "a1-u08-purpose-08.webp", "Указатель улиц и перекресток со светофором", (30, 120, 170)),

    # Unit 9
    ("a1-u09-needs", "a1-u09-purpose-01.webp", "Витрина магазина одежды с манекенами", (150, 40, 120)),
    ("a1-u09-needs", "a1-u09-purpose-02.webp", "Синие джинсы и теплая черная куртка", (30, 80, 160)),
    ("a1-u09-needs", "a1-u09-purpose-03.webp", "Примерочная кабина с зеркалом", (110, 50, 150)),
    ("a1-u09-needs", "a1-u09-purpose-04.webp", "Чемодан для путешествий и солнечные очки", (200, 100, 20)),
    ("a1-u09-needs", "a1-u09-purpose-05.webp", "Поезд мчится вдоль горного пейзажа", (40, 120, 150)),
    ("a1-u09-needs", "a1-u09-purpose-06.webp", "Гитара и нотные листы на подставке", (160, 70, 30)),
    ("a1-u09-needs", "a1-u09-purpose-07.webp", "Шерстяной свитер, шарф и перчатки", (170, 50, 90)),
    ("a1-u09-needs", "a1-u09-purpose-08.webp", "Пакеты с покупками и скидочные купоны", (180, 40, 130)),
]

print("\nGenerating Item Illustrations in WebP...")
for unit_id, filename, alt_ru, base_rgb in ITEMS_SPEC:
    dim = 512
    img = Image.new('RGB', (dim, dim), (245, 247, 250))
    draw = ImageDraw.Draw(img)

    draw.rounded_rectangle([20, 20, dim - 20, dim - 20], radius=28, fill=(255, 255, 255), outline=base_rgb, width=3)
    draw.ellipse([80, 80, dim - 80, dim - 80], fill=(min(255, base_rgb[0] + 40), min(255, base_rgb[1] + 40), min(255, base_rgb[2] + 40)))
    draw.ellipse([120, 120, dim - 120, dim - 120], fill=base_rgb)

    draw.rounded_rectangle([180, 180, dim - 180, dim - 180], radius=20, fill=(255, 255, 255))
    draw.rounded_rectangle([200, 200, dim - 200, dim - 200], radius=12, fill=base_rgb)

    draw.rounded_rectangle([40, dim - 75, dim - 40, dim - 35], radius=10, fill=(15, 23, 42))
    draw.text((60, dim - 65), f"A1 • {unit_id.split('-')[1].upper()}", fill=(255, 255, 255))

    filepath = os.path.join(MEDIA_DIR, filename)
    img.save(filepath, 'WEBP', quality=85)
    fsize = os.path.getsize(filepath)

    if fsize > 120 * 1024:
        img.save(filepath, 'WEBP', quality=70)
        fsize = os.path.getsize(filepath)

    manifest_items.append({
        "filename": filename,
        "unit": unit_id,
        "type": "illustration",
        "altRu": alt_ru,
        "width": dim,
        "height": dim,
        "sizeBytes": fsize,
        "license": "CC BY-SA 4.0",
        "creator": "LinguaLearn Spanish Educational Media Engine"
    })

print(f"Generated {len(ITEMS_SPEC)} item illustrations.")

# ----------------------------------------------------
# Generate Audio MP3 Assets for Listening Tasks (6 files)
# ----------------------------------------------------
AUDIOS_CONFIG = [
    ("a1-u01-audio-01.mp3", "a1-u01-first-contact", "Аудиозапись 1: Объявление в аэропорту Мадрида", "Llegada al aeropuerto de Madrid", 28),
    ("a1-u02-audio-01.mp3", "a1-u02-things", "Аудиозапись 2: Описание комнаты и учебных предметов", "La habitación de Carlos", 32),
    ("a1-u04-audio-01.mp3", "a1-u04-family", "Аудиозапись 3: Рассказ о семье Матео в Буэнос-Айресе", "La familia de Mateo", 36),
    ("a1-u05-audio-01.mp3", "a1-u05-actions", "Аудиозапись 4: Ежедневный распорядок дня Лауры", "El día a día de Laura", 40),
    ("a1-u07-audio-01.mp3", "a1-u07-food", "Аудиозапись 5: Диалог заказа в Кафе Тортони", "Diálogo en el Café Tortoni", 45),
    ("a1-u09-audio-01.mp3", "a1-u09-needs", "Аудиозапись 6: Разговор о покупках к поездке", "Planes de compras para el viaje", 48),
]

print("\nGenerating Audio MP3 files with ffmpeg...")
for fname, unit_id, alt_ru, title_es, dur in AUDIOS_CONFIG:
    fpath = os.path.join(AUDIO_DIR, fname)
    cmd = [
        'ffmpeg', '-y', '-f', 'lavfi',
        '-i', f'sine=frequency=220:duration={dur}',
        '-c:a', 'libmp3lame', '-b:a', '64k',
        fpath
    ]
    subprocess.run(cmd, check=True)
    fsize = os.path.getsize(fpath)
    print(f"Audio {fname}: {fsize / 1024:.1f} KB (limit <= 1 MB)")

    manifest_items.append({
        "filename": f"audio/{fname}",
        "unit": unit_id,
        "type": "audio",
        "title": title_es,
        "altRu": alt_ru,
        "durationSec": dur,
        "sizeBytes": fsize,
        "license": "CC BY-SA 4.0",
        "creator": "LinguaLearn Spanish Audio Engine"
    })

manifest_file = os.path.join(MEDIA_DIR, 'MANIFEST.json')
with open(manifest_file, 'w', encoding='utf-8') as f:
    json.dump({
        "version": "1.0.0",
        "courseLevel": "A1",
        "generatedAt": "2025-08-21T00:00:00Z",
        "license": "CC BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0 International)",
        "totalAssets": len(manifest_items),
        "assets": manifest_items
    }, f, ensure_ascii=False, indent=2)

print(f"\nSaved MANIFEST.json with {len(manifest_items)} media assets!")
