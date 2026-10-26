"""Build the complete, versioned index from owner-supplied PDFs and OCR.
Raw books and OCR stay outside the public frontend and outside Git.
"""
from pathlib import Path
import json,re,hashlib
BASE=Path(__file__).resolve().parent
PRIVATE=BASE.parent/'private/books'
RU='''Род существительных: люди
Род существительных: предметы
Единственное и множественное число
Неопределённые артикли
Когда артикль не нужен
Определённые артикли
Определённый или неопределённый артикль
Артикли с именами и названиями
Артикли с датами и количеством
Другие употребления артикля
Когда существительное опускается
Указательные слова: este, ese, aquel
Прилагательные и согласование
Национальности
Сравнения: más и menos
Сравнения: tan и igual de
Превосходная степень
Притяжательные: mi, tu, su
Притяжательные: mío, tuyo, suyo
Todos, algunos, ninguno
Uno, otro, cualquiera
Mucho, poco, demasiado
Alguien, algo, nadie, nada
Сравнение количества
Числа: uno, dos, tres
Числа: cien, mil, un millón
Порядковые числительные
Относительные: que, quien
Cuyo, donde, cuando
Вопросы: quién и qué
Вопросы: cuál и qué
Вопросы: cuándo и dónde
Восклицания
Личные местоимения
Прямое дополнение: lo, la, los, las
Косвенное дополнение: me, te, le
Два местоимения: se lo
Как различать lo, la и le
Местоимения с разными формами глагола
Возвратные и взаимные действия
Местоимения после предлогов
Ser в настоящем времени
Estar в настоящем времени
Ser или estar
Tener в настоящем времени
Hay: что есть вокруг
Hay или está
Правильные глаголы в настоящем
Настоящее: изменение корня
Настоящее: voy, hago, conozco
Другие значения настоящего времени
Hace и desde: как давно
Возвратные глаголы
Глаголы с se и без se
Gustar, encantar, doler
Estar + gerundio
Hago или estoy haciendo
Indefinido: правильные глаголы
Indefinido: неправильные глаголы
Pretérito perfecto: образование
Pretérito perfecto: употребление
Perfecto или indefinido
Imperfecto: привычки и описания
Indefinido или imperfecto
Estaba haciendo или hice
Pluscuamperfecto: что было раньше
Будущее: правильные глаголы
Будущее: неправильные глаголы
Планы: ir a + infinitivo
Три способа говорить о будущем
Condicional: правильные глаголы
Condicional: неправильные глаголы
Утвердительные просьбы и команды
Отрицательные просьбы и команды
Imperativo: изменение корня
Imperativo: pon, ven, di
Повелительное наклонение с se
Повелительное наклонение с местоимениями
Subjuntivo: правильные глаголы
Subjuntivo: изменение корня
Subjuntivo: conozca, diga, vaya
Imperfecto de subjuntivo: правильные глаголы
Imperfecto de subjuntivo: неправильные глаголы
Желания: quiero que
Вероятность: quizás
Чувства и оценки: me gusta que
Creo que или no creo que
Косвенная речь: утверждения
Косвенная речь: вопросы
Косвенная речь: просьбы
Реальные условия: si
Предположения: si tuviera
Инфинитив
Перифразы: empezar, acabar, dejar
Необходимость и возможность
Привычки: soler и volver a
Quiero ir или quiero que vayas
Герундий
Причастие
Наречия места
Наречия времени
Ya, todavía, aún
Частота: siempre, a veces
Количество: muy, mucho
Степень качества и количества
Образ действия: bien, fácilmente
Сравнения: mejor и peor
Отрицания: no, nunca, jamás
Согласие: también и tampoco
Предлоги времени
Предлоги движения
Предлоги расположения
Предлоги: a, de, en
Предлоги: por и para
Глаголы с предлогами
Союзы: y, o, pero
Цель: para и para que
Время: cuando и antes de que
Причина: porque и como
Уступка: aunque
Следствие: por eso и así que
Безличные предложения
Правила ударения
Ударение и сочетания гласных
Прописные буквы
Аргентинское vos'''.splitlines()
assert len(RU)==126,len(RU)
def read(name):
 return {r['page']:r['text'] for r in map(json.loads,(PRIVATE/name).read_text().splitlines())}
g=read('gramatica-ocr.jsonl'); n=read('nivel2-ocr.jsonl')
assert len(g)==291 and len(n)==131
allkeys='\n'.join(g[p] for p in range(272,292))
allkeys=re.sub(r'Unidad\s+([0-9ogO]+)(?=\s*[:.])',lambda m:'Unidad '+m[1].replace('o','0').replace('O','0').replace('g','9'),allkeys)
keys={}
for m in re.finditer(r'Unidad\s+(\d+)\s*[:.]',allkeys):
 end=re.search(r'Unidad\s+\d+\s*[:.]',allkeys[m.end():])
 keys[int(m[1])]=allkeys[m.start():m.end()+end.start() if end else len(allkeys)]
assert set(range(1,126)).issubset(keys), 'Missing answer key units'
def spots(u):
 if u in [1,2,3,13,14]:return ['genero-concordancia']
 if 4<=u<=11:return ['articulos']
 if u in [15,16,17,24,107]:return ['comparativos']
 if 35<=u<=39:return ['pronombres-objeto']
 if u in [40,53,54]:return ['verbos-pronominales']
 if 42<=u<=44:return ['ser-estar']
 if u in [46,47]:return ['hay-estar']
 if 45<=u<=51 or u==126:return ['conjugacion-presente']
 if u==55:return ['verbos-gustar']
 if 58<=u<=59:return ['preterito-irregulares']
 if 63<=u<=65:return ['preterito-vs-imperfecto']
 if 67<=u<=70:return ['futuro-planes']
 if 71<=u<=72:return ['condicional']
 if 73<=u<=78:return ['imperativo']
 if u in [82,83,92]:return ['si-hipotetico']
 if u in [79,80,81,84,97]:return ['subjuntivo-deseo']
 if u in [85,86,87]:return ['subjuntivo-emocion-opinion']
 if 88<=u<=90:return ['estilo-indirecto']
 if 93<=u<=99 or u in [56,57]:return ['perifrasis']
 if u in [108,109]:return ['doble-negacion']
 if 110<=u<=115:return ['por-para'] if u==114 else ['preposiciones']
 if u==118:return ['subjuntivo-temporal']
 if 116<=u<=122:return ['conectores']
 return ['vocabulario-preciso']
lessons=[]; sources={}
for u,title in enumerate(RU,1):
 p=2*u+10 if u<=122 else {123:258,124:260,125:262,126:264}[u]
 pages=[p,p+1] if u!=126 else [p]
 key=f'grammar-{u:03}'
 es=' — '.join([v for v in g[p].splitlines()[:5] if v.strip()!=str(u)])[:180]
 group='Основы и слова' if u<34 else 'Местоимения' if u<42 else 'Глаголы и времена' if u<100 else 'Связная речь' if u<123 else 'Письмо и vos'
 lessons.append(dict(id=key,book_id='gramatica',unit=u,title=title,title_es=es,group=group,pages=pages,printed_pages=[v-2 for v in pages],spot_keys=spots(u),grammar_links=[],audio_missing=False))
 sources[key]={'text':'\n\n'.join(f'[PDF {v}; страница {v-2}]\n'+g[v] for v in pages),'key':keys.get(u,''),'theory':g[p]}
blocks=[
(1,7,13,'Профессии и повседневная жизнь',[48,49,50,53,55]),(1,14,19,'Природа, работа и жизнь в Антарктиде',[48,52,103]),(1,20,25,'Что случилось вчера',[58,59]),(1,26,31,'Путешествие по Патагонии',[58,59]),(1,32,34,'Рассказываем по картинкам',[58,59]),
(2,37,42,'Выбираем путешествие и сравниваем',[15,16,24]),(2,43,47,'Снимаем жильё и выбираем район',[15,17,47]),(2,48,50,'Плюсы и минусы большого города',[15,16,107]),(2,51,58,'Как было раньше: imperfecto',[63]),(2,59,64,'Школа, детство и праздники',[63]),(2,65,68,'Город раньше и сейчас',[63,15,24]),(2,69,76,'Биографии и важные события',[58,59,63]),
(3,79,81,'Неожиданная встреча',[64,65]),(3,82,86,'История медведя и разговор о животных',[64,65]),(3,87,90,'Придумываем и рассказываем истории',[64,65]),(3,91,95,'История семьи: действия и обстоятельства',[64,65]),
(4,99,103,'Кому что сказали: косвенное дополнение',[36]),(4,104,107,'Местоимения вместе: se lo, me la',[35,36,37,39]),
(1,111,114,'Практика: прошедшие события',[58,59]),(4,115,121,'Практика: прямое дополнение',[35,38,113]),(2,122,123,'Практика: сравнения',[15,16,17,24]),(2,124,125,'Практика: привычки в прошлом',[63]),(3,126,128,'Практика: собственная история',[64,65]),(4,129,131,'Практика: кому, что и как передали',[35,36,37,40])]
for i,(u,a,b,title,links) in enumerate(blocks,1):
 key=f'nivel2-{i:02}'; pages=[p for p in range(a,b+1) if len(n[p].strip())>15]
 text='\n\n'.join(f'[PDF {p}; страница {p-4}]\n'+n[p] for p in pages)
 lesson=dict(id=key,book_id='nivel2',unit=u,title=title,title_es='',group=f'Unidad {u}' if a<109 else 'Дополнительная практика',pages=pages,printed_pages=[p-4 for p in pages],spot_keys=sorted(set(k for x in links for k in spots(x))),grammar_links=[f'grammar-{x:03}' for x in links],audio_missing=bool(re.search(r'escuchar|escuchá|escuchen',text,re.I)))
 lessons.append(lesson);sources[key]={'text':text,'key':'','theory':text}
books=[dict(id='nivel2',title='Español para extranjeros · Nivel 2',subtitle='Университет Буэнос-Айреса · 4 раздела и дополнительная практика',pages=131,sha256=hashlib.sha256((PRIVATE/'nivel2.pdf').read_bytes()).hexdigest()),dict(id='gramatica',title='Gramática de uso del español',subtitle='A1–B2 · 126 разделов · теория и практика',pages=291,sha256=hashlib.sha256((PRIVATE/'gramatica.pdf').read_bytes()).hexdigest())]
for l in lessons:
 if l['book_id']=='nivel2':
  if l['unit']==1 and l['id'] in ['nivel2-01','nivel2-02']: focus='Содержательный рассказ о профессии, повседневной жизни или привычках в настоящем времени. Рассказ о себе через yo подходит; не требовать обращения vos в каждой фразе.'
  elif l['unit']==1: focus='Рассказ о конкретных событиях в прошлом с корректными формами indefinido.'
  elif l['unit']==2 and l['id'] in ['nivel2-06','nivel2-07','nivel2-08','nivel2-21']:focus='Собственные сравнения людей, мест, предметов или условий: más/menos/tan/tanto, mejor/peor или превосходная степень.'
  elif l['unit']==2:focus='Собственные описания или привычки в прошлом с imperfecto; в биографии возможны законченные события в indefinido.'
  elif l['unit']==3:focus='Собственная история, где корректно сочетаются события в indefinido и фон или процессы в imperfecto.'
  else:focus='Корректное самостоятельное употребление прямого или косвенного дополнения (lo/la/le/me/te/nos/les) по теме текущего занятия; для se lo нужен пример сочетания местоимений.'
 else:focus='Корректное самостоятельное употребление именно темы «'+l['title']+'». Не подменять её общим уровнем грамматики или словаря.'
 l['application_focus_ru']=focus
catalog={'version':'books-v1-2026-10-25','books':books,'lessons':lessons}
(BASE/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
(PRIVATE/'sources.json').write_text(json.dumps(sources,ensure_ascii=False))
print(json.dumps({'books':len(books),'lessons':len(lessons),'grammar_answer_units':len(keys),'missing_keys':[u for u in range(1,126) if u not in keys]},ensure_ascii=False))
