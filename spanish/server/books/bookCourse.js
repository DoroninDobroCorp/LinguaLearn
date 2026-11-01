import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("./bookCoursesData.json", import.meta.url), "utf8"));

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:«»"'“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function listBookCourses() {
  return data.courses.map((course) => ({
    id: course.id,
    title: course.title,
    subtitle: course.subtitle,
    outcome: course.outcome,
    lessonCount: course.lessonCount,
    groups: course.groups,
    lessons: course.lessons.map((lesson, index) => ({
      id: lesson.id,
      order: index + 1,
      bookOrder: lesson.order,
      group: lesson.group,
      title: lesson.title,
      titleEs: lesson.titleEs,
      printedPages: lesson.printedPages,
      exerciseCount: lesson.exerciseCount,
    })),
  }));
}

export function getBookCourseLesson(courseId, lessonId) {
  const course = data.courses.find((item) => item.id === courseId);
  if (!course) return null;
  const index = course.lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  const lesson = course.lessons[index];
  return {
    course: { id: course.id, title: course.title, lessonCount: course.lessonCount },
    lesson: {
      ...lesson,
      position: index + 1,
      previousId: course.lessons[index - 1]?.id || null,
      nextId: course.lessons[index + 1]?.id || null,
      exercises: lesson.exercises.map(({ acceptableAnswers, ...exercise }) => exercise),
    },
  };
}

export function checkBookCourseAnswer(courseId, lessonId, exerciseId, answer) {
  const course = data.courses.find((item) => item.id === courseId);
  const lesson = course?.lessons.find((item) => item.id === lessonId);
  const exercise = lesson?.exercises.find((item) => item.id === exerciseId);
  if (!exercise) {
    const error = new Error("Задание курса не найдено.");
    error.status = 404;
    throw error;
  }
  const accepted = [exercise.correctAnswer, ...(exercise.acceptableAnswers || [])];
  const given = normalize(answer);
  const correct = given.length > 0 && accepted.some((value) => normalize(value) === given);
  return {
    correct,
    correctAnswer: exercise.correctAnswer,
    explanation: exercise.explanation,
  };
}
