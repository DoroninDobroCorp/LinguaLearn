# -*- coding: utf-8 -*-
"""
Validation script for all 30 A1 Topic Packages
Checks all pedagogical constraints specified in A1_CONTENT_PRODUCTION_TZ_RU.md
"""
import json
import sys

REQUIRED_A1_TOPICS = [
    # Unit 1
    (27, 'Greetings and introductions (saludos)', 'a1-u01-first-contact'),
    (7, 'Subject pronouns (yo/tú/vos/él/ella)', 'a1-u01-first-contact'),
    (19, 'Numbers and counting', 'a1-u01-first-contact'),
    # Unit 2
    (4, 'Gender and articles (el/la/los/las)', 'a1-u02-things'),
    (5, 'Indefinite articles (un/una/unos/unas)', 'a1-u02-things'),
    (20, 'Colors (colores)', 'a1-u02-things'),
    (6, 'Plural nouns (-s/-es)', 'a1-u02-things'),
    # Unit 3
    (1, 'Ser vs Estar (basic)', 'a1-u03-identity'),
    (13, 'Basic adjective agreement (gender/number)', 'a1-u03-identity'),
    (30, 'Describing people (describir personas)', 'a1-u03-identity'),
    # Unit 4
    (21, 'Family members (la familia)', 'a1-u04-family'),
    (8, 'Possessive adjectives (mi/tu/su)', 'a1-u04-family'),
    (11, 'Tener (to have) and tener expressions', 'a1-u04-family'),
    (25, 'Parts of the body (el cuerpo)', 'a1-u04-family'),
    # Unit 5
    (2, 'Present tense regular -ar verbs', 'a1-u05-actions'),
    (17, 'Negation (no + verb)', 'a1-u05-actions'),
    (18, 'Question formation (¿...?)', 'a1-u05-actions'),
    # Unit 6
    (22, 'Days, months, seasons', 'a1-u06-calendar'),
    (28, 'Asking and telling the time (la hora)', 'a1-u06-calendar'),
    (14, 'Numbers (0-1000)', 'a1-u06-calendar'),
    # Unit 7
    (3, 'Present tense regular -er/-ir verbs', 'a1-u07-food'),
    (23, 'Basic food and drinks (comida y bebida)', 'a1-u07-food'),
    (29, 'Ordering food (pedir comida)', 'a1-u07-food'),
    # Unit 8
    (10, 'Hay (there is / there are)', 'a1-u08-home'),
    (15, 'Prepositions of place (en/sobre/debajo de)', 'a1-u08-home'),
    (26, 'House and furniture (la casa)', 'a1-u08-home'),
    (9, 'Demonstratives (este/ese/aquel)', 'a1-u08-home'),
    # Unit 9
    (16, 'Present tense irregular verbs (ir/hacer/decir)', 'a1-u09-needs'),
    (12, 'Gustar and similar verbs', 'a1-u09-needs'),
    (24, 'Clothes (la ropa)', 'a1-u09-needs'),
]

def validate_package(topic_id, name, unit_id, pkg):
    errors = []
    if not pkg:
        return [f"Topic {topic_id} ('{name}') missing entirely!"]

    # 1. Basic properties
    if pkg.get('topicName') != name:
        errors.append(f"topicName '{pkg.get('topicName')}' != '{name}'")
    if not pkg.get('russianTitle'):
        errors.append("missing russianTitle")
    if not pkg.get('summary'):
        errors.append("missing summary")

    # 2. Goals (3-5 measurable goals)
    goals = pkg.get('goalsRu') or pkg.get('learningObjectives') or []
    if len(goals) < 3 or len(goals) > 6:
        errors.append(f"goalsRu length is {len(goals)}, expected 3..5")

    # 3. Examples (8-12 with translation)
    examples = pkg.get('examples') or []
    if len(examples) < 8:
        errors.append(f"examples count is {len(examples)}, expected >= 8")
    for idx, ex in enumerate(examples):
        if not ex.get('es') or not ex.get('ru'):
            errors.append(f"example {idx} missing 'es' or 'ru'")

    # 4. Typical mistakes (>= 3)
    mistakes = pkg.get('typicalMistakes') or pkg.get('commonMistakes') or []
    if len(mistakes) < 3:
        errors.append(f"typicalMistakes count is {len(mistakes)}, expected >= 3")

    # 5. Built-in Quiz (exactly 12 questions: 4 recognition, 4 application, 4 transfer)
    quiz = pkg.get('quiz') or pkg.get('quickCheckQuiz') or []
    if len(quiz) != 12:
        errors.append(f"quiz length is {len(quiz)}, expected exactly 12")
    else:
        recog = [q for q in quiz if q.get('type') == 'recognition']
        appl = [q for q in quiz if q.get('type') == 'application']
        trans = [q for q in quiz if q.get('type') == 'transfer']
        if len(recog) < 4:
            errors.append(f"quiz recognition count is {len(recog)}, expected 4")
        if len(appl) < 4:
            errors.append(f"quiz application count is {len(appl)}, expected 4")
        if len(trans) < 4:
            errors.append(f"quiz transfer count is {len(trans)}, expected 4")
        for q_idx, q in enumerate(quiz):
            if not q.get('question'):
                errors.append(f"quiz {q_idx} missing question text")
            options = q.get('options') or []
            if len(options) < 2:
                errors.append(f"quiz {q_idx} has < 2 options")
            # Check distractor explanations
            # Option format: array of strings + explanations array OR array of objects { text, explanation, isCorrect }
            expls = q.get('explanations') or [opt.get('explanation') for opt in options if isinstance(opt, dict)]
            if len(expls) < len(options) and not q.get('explanation'):
                errors.append(f"quiz {q_idx} missing explanations for distractors")

    # 6. Additional exercises (>= 24)
    exercises = pkg.get('exercises') or []
    if len(exercises) < 24:
        errors.append(f"exercises count is {len(exercises)}, expected >= 24")
    
    # Types breakdown
    types = set(ex.get('type') for ex in exercises)
    multi_answer_count = sum(1 for ex in exercises if ex.get('acceptableAnswers') and len(ex.get('acceptableAnswers')) > 1)
    if multi_answer_count < 6:
        errors.append(f"multi-answer exercises count is {multi_answer_count}, expected >= 6")

    spiral_count = sum(1 for ex in exercises if ex.get('spiralReview'))
    if spiral_count < 2:
        errors.append(f"spiral review exercises count is {spiral_count}, expected >= 2")

    # 7. Mini scenario
    scenario = pkg.get('miniScenario')
    if not scenario or not scenario.get('situation') or not scenario.get('task'):
        errors.append("missing miniScenario (situation / task)")

    # 8. Short text with 3 questions
    short_text = pkg.get('shortText')
    if not short_text or not short_text.get('text') or len(short_text.get('questions', [])) < 3:
        errors.append("missing shortText or shortText has < 3 questions")

    # 9. Productive task with 0..100 rubric
    prod = pkg.get('productiveTask')
    if not prod or not prod.get('prompt') or not prod.get('rubric'):
        errors.append("missing productiveTask (prompt / rubric)")

    return errors

if __name__ == '__main__':
    print(f"Validation framework ready for all {len(REQUIRED_A1_TOPICS)} topics.")
