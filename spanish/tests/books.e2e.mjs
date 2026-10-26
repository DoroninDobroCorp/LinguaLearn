import { chromium } from "@playwright/test";
import { strict as assert } from "node:assert";
import Database from "better-sqlite3";
import fs from "node:fs";
import { upsertLearner } from "../server/coach/coachStore.js";
const reportDir = "/srv/LinguaLearn/backups/books-2026-10-25";
const db = new Database(reportDir + "/acceptance.sqlite");
db.pragma("foreign_keys=ON");
const pid = Number(process.env.BOOKS_TEST_PROFILE || Date.now());
db.prepare(
  "INSERT OR IGNORE INTO profiles(id,name,name_key,avatar_emoji,learning_track) VALUES(?,?,?,?,?)",
).run(pid, "Books QA " + pid, "books qa " + pid, "👩", "conversation");
db.prepare(
  "INSERT OR IGNORE INTO user_settings(profile_id,max_level) VALUES(?,?)",
).run(pid, "B1");
db.prepare("INSERT OR IGNORE INTO book_enrollments(profile_id) VALUES(?)").run(
  pid,
);
upsertLearner(
  db,
  pid,
  {
    display_name: "Books QA",
    cefr_level: "B1",
    voice_autoplay: false,
    about: "Vivo en El Bolsón.",
  },
  { markOnboarded: true },
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.BOOKS_CHROMIUM ||
    "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const checks = [];
const base = "http://localhost:5177/spanish";
const check = (name) => {
  checks.push(name);
  console.log("PASS", name);
};
const get = async (path) => {
  const r = await page.request.get(
    `http://127.0.0.1:3103/api${path}${path.includes("?") ? "&" : "?"}profileId=${pid}`,
  );
  assert.equal(r.status(), 200);
  return r.json();
};
try {
  await page.goto(`${base}/?student=${pid}`);
  await page.getByText("Мои книги", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Книги", exact: true }).click();
  await page.getByRole("heading", { name: "Мои книги", exact: true }).waitFor();
  assert.match(await page.locator("body").innerText(), /126 разделов/);
  assert.match(await page.locator("body").innerText(), /Пройдено 0 из 24/);
  assert.match(
    await page.locator("body").innerText(),
    /Наталия, ты можешь попросить любые изменения/,
  );
  check("home, both complete routes, reminder, zero invented progress");
  await page
    .getByRole("link", { name: "Оглавление", exact: true })
    .first()
    .click();
  await page.getByRole("heading", { name: "Unidad 1", exact: true }).waitFor();
  assert.equal(
    await page.locator('a[href*="/books/lesson/nivel2-"]').count(),
    24,
  );
  check("complete 24-lesson outline");
  await page.locator('a[href$="/books/lesson/nivel2-01"]').click();
  const img = page.getByAltText("Оригинальная страница PDF 7");
  await img.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('img[alt="Оригинальная страница PDF 7"]')
        ?.naturalWidth > 0,
  );
  await page.getByLabel("Страница PDF").selectOption("9");
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByLabel("Страница PDF").waitFor();
  assert.equal(await page.getByLabel("Страница PDF").inputValue(), "9");
  check("authenticated original page, saved reading position, reload");
  await page
    .getByRole("button", { name: "Прочитала, перейти к практике" })
    .click();
  await page
    .getByRole("button", { name: "Подготовить занятие", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Правило коротко" })
    .waitFor({ timeout: 180000 });
  let dash = await get("/books/");
  const l = dash.lessons.find((l) => l.id === "nivel2-01");
  let run = await get("/books/runs/" + l.progress.active_run);
  assert.equal(run.items[0].answers, undefined);
  assert.ok(run.items.some((i) => i.source_kind === "adapted"));
  check("prepared reviewed pack, labels, answer keys withheld");
  const raw = JSON.parse(
    db.prepare("SELECT pack_json FROM book_runs WHERE id=?").get(run.id)
      .pack_json,
  );
  for (let i = 0; i < run.items.length; i++) {
    const item = raw.items[i];
    await page.getByText(`Задание ${i + 1} из 8`, { exact: true }).waitFor();
    if (i === 0) {
      await page
        .getByRole("button", { name: "Подсказка", exact: true })
        .click();
      await page
        .getByText(
          "Использована подсказка — это практика без самостоятельного зачёта.",
          { exact: true },
        )
        .waitFor();
    }
    let answer = item.answers[0];
    if (i === 2) answer = item.options.find((o) => o !== item.answers[0]);
    if (i === 5) answer = "No, no miro programas de cocina en la televisión.";
    if (item.type === "choice")
      await page.getByRole("button", { name: answer, exact: true }).click();
    else {
      await page.getByLabel("Твой ответ", { exact: true }).fill(answer);
      await page
        .getByRole("button", { name: "Проверить", exact: true })
        .click();
    }
    await page
      .getByRole("button", { name: "Дальше", exact: true })
      .waitFor({ timeout: 90000 });
    await page.getByRole("button", { name: "Дальше", exact: true }).click();
  }
  await page.getByRole("heading", { name: "Практика завершена" }).waitFor();
  run = await get("/books/runs/" + run.id);
  assert.equal(run.score, 75);
  assert.equal(run.items[5].result.verdict, "correct");
  check(
    "live grading, alternative free answer, hint penalty, incorrect choice, 75%",
  );
  await page.reload();
  await page.getByRole("button", { name: "2. Практика", exact: true }).click();
  await page.getByRole("heading", { name: "Практика завершена" }).waitFor();
  check("completed practice and feedback survive reload");
  const word = page
    .getByRole("button", { name: "В словарь", exact: true })
    .first();
  await word.click();
  await page.getByRole("button", { name: "Добавлено", exact: true }).waitFor();
  const repeat = await page.request.post(
    `http://127.0.0.1:3103/api/books/runs/${run.id}/vocabulary/0?profileId=${pid}`,
    { data: {} },
  );
  assert.equal((await repeat.json()).duplicate, true);
  check("existing vocabulary integration and duplicate protection");
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({
    path: reportDir + "/books-mobile-practice.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "3. Разговор", exact: true }).click();
  await page
    .getByRole("button", { name: "Чат и голосовые", exact: true })
    .click();
  await page.waitForURL(/\/coach\/chat\//, { timeout: 90000 });
  const sid = Number(page.url().split("/").at(-1));
  let session = await get("/coach/sessions/" + sid);
  assert.equal(session.book.lesson_id, "nivel2-01");
  assert.ok(session.custom.book.goal_es.length > 10);
  check("real book conversation, persisted book context");
  await page
    .getByPlaceholder("Escribí en español…")
    .fill(
      "Me gusta cocinar y trabajar en mi jardín. Vivo en El Bolsón y todos los días camino por el bosque. Los fines de semana mi familia y yo preparamos empanadas. A mi hija le encantan las verduras frescas.",
    );
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await page.getByRole("button", { name: "Завершить", exact: true }).waitFor();
  await page.getByRole("button", { name: "Завершить", exact: true }).click();
  await page.waitForURL(/\/coach\/report\//, { timeout: 180000 });
  await page
    .getByRole("link", { name: "Вернуться к занятию по книге", exact: true })
    .waitFor({ timeout: 180000 });
  session = await get("/coach/sessions/" + sid);
  assert.equal(session.status, "analyzed");
  check("live conversation analysis and return link to book lesson");
  await page
    .getByRole("link", { name: "Вернуться к занятию по книге", exact: true })
    .click();
  await page.getByRole("button", { name: "3. Разговор", exact: true }).click();
  await page.getByRole("link", { name: /разбор готов/ }).waitFor();
  assert.equal(
    (await get("/books/lessons/nivel2-01")).progress.applied,
    true,
    "Own correct routine narrative must satisfy the actual lesson target",
  );
  check("book lesson links its real completed conversation");
  await page.goto(`${base}/books/lesson/grammar-125`);
  await page.getByRole("button", { name: "2. Практика", exact: true }).click();
  await page
    .getByRole("button", { name: "Подготовить занятие", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Правило коротко" })
    .waitFor({ timeout: 180000 });
  assert.equal(
    await page
      .getByRole("button", { name: "Ответить голосом", exact: true })
      .count(),
    0,
  );
  await page
    .getByLabel("Твой ответ", { exact: true })
    .fill("ayer fue dos de enero. fue el cumpleaños de manuel.");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByText("Разберём ответ", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page
    .getByLabel("Твой ответ", { exact: true })
    .fill("Queremos ir a China en diciembre.");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByText("Верно", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page.getByRole("button", { name: "Lunes", exact: true }).click();
  await page.getByText("Разберём ответ", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  const writing = (await get("/books/lessons/grammar-125")).progress.active_run;
  const rejectedVoice = await page.request.post(
    `http://127.0.0.1:3103/api/books/runs/${writing}/items/3/answer?profileId=${pid}`,
    { data: { audio: "fake", mimeType: "audio/webm" } },
  );
  assert.equal(rejectedVoice.status(), 400);
  await page.screenshot({
    path: reportDir + "/books-writing-check.png",
    fullPage: false,
  });
  check(
    "capitalization is case-sensitive; writing requires text in UI and API",
  );
  await page.goto(`${base}/books/gramatica`);
  await page
    .getByRole("heading", { name: "Gramática de uso del español", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('a[href*="/books/lesson/grammar-"]').count(),
    126,
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.waitForTimeout(300);
  await page.screenshot({
    path: reportDir + "/books-mobile-outline.png",
    fullPage: false,
  });
  check("all 126 grammar sections, mobile width");
  await page.goto(`${base}/books/lesson/nivel2-02`);
  await page.getByRole("button", { name: "2. Практика", exact: true }).click();
  await page.route("**/api/books/lessons/nivel2-02/prepare*", async (route) => {
    const response = await route.fetch();
    await new Promise((r) => setTimeout(r, 1800));
    await route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Подготовить занятие", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Следующее занятие", exact: true })
    .click();
  await page.waitForURL(/nivel2-03/);
  await page.waitForTimeout(2200);
  await page.getByRole("button", { name: "2. Практика", exact: true }).click();
  await page
    .getByRole("button", { name: "Подготовить занятие", exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Правило коротко" }).count(),
    0,
  );
  await page.unroute("**/api/books/lessons/nivel2-02/prepare*");
  check("late responses cannot replace the newly selected lesson");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/books`);
  await page.getByRole("heading", { name: "Мои книги", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.waitForTimeout(300);
  await page.screenshot({
    path: reportDir + "/books-desktop.png",
    fullPage: true,
  });
  check("desktop rendering");
  await page.goto(`${base}/books/lesson/nivel2-02`);
  await page
    .getByRole("button", { name: "Прочитала, перейти к практике" })
    .waitFor();
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Прочитала, перейти к практике" })
    .click();
  await page.waitForTimeout(300);
  assert.equal(
    db
      .prepare(
        "SELECT reading_done FROM book_lesson_state WHERE profile_id=? AND lesson_id=?",
      )
      .get(pid, "nivel2-02")?.reading_done || 0,
    0,
  );
  await context.setOffline(false);
  check("connection loss never awards progress");
  const denied = await page.request.get(
    "http://127.0.0.1:3103/api/books/gramatica/pages/139?profileId=1",
  );
  assert.equal(denied.status(), 403);
  await page.goto(`${base}/?student=1`);
  await page
    .getByText("Мои книги", { exact: true })
    .waitFor({ state: "hidden" });
  check("other profile sees no books and has no access to book pages");
  assert.deepEqual(errors, []);
  check("no browser JavaScript errors");
  fs.writeFileSync(
    reportDir + "/browser-acceptance.json",
    JSON.stringify({ passed: true, profile_id: pid, checks, errors }, null, 2),
  );
  console.log("ALL_BROWSER_CHECKS_PASSED", checks.length);
} catch (e) {
  await context.setOffline(false);
  await page
    .screenshot({ path: reportDir + "/books-e2e-failure.png", fullPage: true })
    .catch(() => {});
  fs.writeFileSync(
    reportDir + "/browser-acceptance.json",
    JSON.stringify(
      { passed: false, profile_id: pid, checks, errors, error: e.stack },
      null,
      2,
    ),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  db.close();
}
