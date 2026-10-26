import "dotenv/config";
import fs from "node:fs";
import { catalog, PRIVATE_BOOKS } from "./bookStore.js";
import { warmBookPack } from "./bookService.js";
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < catalog.lessons.length) {
    const lesson = catalog.lessons[cursor++];
    try {
      const r = await warmBookPack(lesson.id);
      results.push(r);
      console.log(
        JSON.stringify({
          ...r,
          done: results.length,
          total: catalog.lessons.length,
        }),
      );
    } catch (e) {
      results.push({
        id: lesson.id,
        status: "failed",
        error: e.message,
        details: e.cause,
      });
      console.log(JSON.stringify(results.at(-1)));
    }
    fs.writeFileSync(
      PRIVATE_BOOKS + "/library-preparation.json",
      JSON.stringify(
        { version: catalog.version, total: catalog.lessons.length, results },
        null,
        2,
      ),
    );
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(
  "LIBRARY_RESULT",
  JSON.stringify({
    ready: results.filter((r) => r.status !== "failed").length,
    failed: results.filter((r) => r.status === "failed"),
  }),
);
process.exitCode = results.some((r) => r.status === "failed") ? 1 : 0;
