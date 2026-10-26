import fs from "node:fs";
import path from "node:path";
import { catalog, PRIVATE_BOOKS } from "./bookStore.js";
import { validatePack } from "./bookService.js";
const sources = JSON.parse(
  fs.readFileSync(path.join(PRIVATE_BOOKS, "sources.json"), "utf8"),
);
const findings = [];
let tasks = 0;
const stats = { book: 0, adapted: 0, additional: 0 };
for (const lesson of catalog.lessons) {
  const file = path.join(
    PRIVATE_BOOKS,
    "packs",
    `${catalog.version}-${lesson.id}.json`,
  );
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const checked = validatePack(raw, lesson, sources[lesson.id]);
    if (!raw.review?.checked_at || !raw.review?.reviewer)
      throw new Error("Missing content review provenance");
    for (const item of checked.items) {
      tasks++;
      stats[item.source_kind]++;
      if (!/[а-яё]/i.test(item.hint_ru))
        findings.push({
          id: lesson.id,
          level: "medium",
          issue: "Hint is not in Russian",
          prompt: item.prompt,
        });
    }
    if (checked.examples.some((x) => !/[а-яё]/i.test(x.ru)))
      findings.push({
        id: lesson.id,
        level: "medium",
        issue: "Example translation is not Russian",
      });
    const fixed = { ...checked, review: raw.review };
    fs.writeFileSync(file + ".audit.tmp", JSON.stringify(fixed));
    fs.renameSync(file + ".audit.tmp", file);
  } catch (e) {
    findings.push({ id: lesson.id, level: "medium", issue: e.message });
  }
}
const report = {
  version: catalog.version,
  lessons: catalog.lessons.length,
  tasks,
  source_kinds: stats,
  findings,
  checked_at: new Date().toISOString(),
};
fs.writeFileSync(
  PRIVATE_BOOKS + "/library-audit.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
process.exitCode = findings.length ? 1 : 0;
