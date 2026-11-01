import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkBookCourseAnswer, getBookCourseLesson, listBookCourses } from "../server/books/bookCourse.js";

describe("book courses", () => {
  it("keeps both books in catalog order with a complete first lesson", () => {
    const courses = listBookCourses();
    assert.deepEqual(courses.map((course) => [course.id, course.lessonCount]), [["gramatica", 126], ["nivel2", 24]]);
    const grammar = courses[0];
    assert.equal(grammar.lessons[0].title, "Род существительных: люди");
    assert.equal(grammar.lessons.at(-1).title, "Аргентинское vos");
    assert.equal(grammar.groups[0].title, "Основы и слова");
    const nivel = courses[1];
    assert.equal(nivel.lessons[0].title, "Профессии и повседневная жизнь");
    assert.equal(nivel.lessons.at(-1).group, "Дополнительная практика");
    for (const course of courses) {
      course.lessons.forEach((lesson, index) => assert.equal(lesson.order, index + 1));
    }
    const first = getBookCourseLesson("gramatica", "grammar-001");
    assert.equal(first.lesson.position, 1);
    assert.equal(first.lesson.nextId, "grammar-002");
    assert.ok(first.lesson.theory.length > 80);
    assert.ok(first.lesson.exercises.length >= 4);
    assert.equal(first.lesson.exercises[0].acceptableAnswers, undefined);
  });

  it("checks typed and choice answers without treating a wrong accent as exact when it changes the form", () => {
    const lesson = getBookCourseLesson("gramatica", "grammar-001").lesson;
    const choice = lesson.exercises.find((item) => item.type === "choice");
    assert.equal(checkBookCourseAnswer("gramatica", "grammar-001", choice.id, choice.correctAnswer).correct, true);
    assert.equal(checkBookCourseAnswer("gramatica", "grammar-001", choice.id, "нет такого").correct, false);
    const typed = lesson.exercises.find((item) => item.type !== "choice");
    assert.equal(checkBookCourseAnswer("gramatica", "grammar-001", typed.id, `  ${typed.correctAnswer.toUpperCase()} `).correct, true);
  });
});
