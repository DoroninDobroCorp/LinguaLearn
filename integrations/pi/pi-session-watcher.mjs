#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, ".pi/agent/sessions");
const CONFIG_PATH = path.join(HOME, "Library/Application Support/LinguaLearnCapture/config.json");

function getIngressConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return {
      port: config.ingressPort || 43119,
      token: config.ingressToken || "",
    };
  } catch {
    return null;
  }
}

function sendToCapture(eventId, text) {
  const cfg = getIngressConfig();
  if (!cfg || !cfg.token) return;

  const payload = JSON.stringify({
    schemaVersion: 1,
    eventId: eventId,
    sourceApp: "com.earendil.pi",
    originalText: text,
    text: text,
    sentAt: new Date().toISOString(),
  });

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: cfg.port,
      path: "/capture",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-lingualearn-ingress-token": cfg.token,
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: 2000,
    },
    (res) => {
      res.resume();
    }
  );

  req.on("error", () => {
    // If capture app is not ready, try inbox spool
    try {
      const inboxDir = path.join(HOME, "Library/Application Support/LinguaLearnCapture/hook-inbox");
      if (fs.existsSync(inboxDir)) {
        fs.writeFileSync(path.join(inboxDir, `${eventId}.json`), payload, { mode: 0o600 });
      }
    } catch {}
  });

  req.write(payload);
  req.end();
}

const fileOffsets = new Map();

function findJsonlFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findJsonlFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}

function initOffsets() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const files = findJsonlFiles(SESSIONS_DIR);
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      fileOffsets.set(file, stat.size);
    } catch {}
  }
}

function processFile(file) {
  try {
    const stat = fs.statSync(file);
    const lastOffset = fileOffsets.get(file) ?? 0;
    if (stat.size <= lastOffset) {
      if (stat.size < lastOffset) {
        fileOffsets.set(file, stat.size); // truncated
      }
      return;
    }

    const fd = fs.openSync(file, "r");
    const bytesToRead = stat.size - lastOffset;
    const buffer = Buffer.alloc(bytesToRead);
    fs.readSync(fd, buffer, 0, bytesToRead, lastOffset);
    fs.closeSync(fd);

    fileOffsets.set(file, stat.size);

    const chunk = buffer.toString("utf8");
    const lines = chunk.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const item = JSON.parse(trimmed);
        if (item.type === "message" && item.message?.role === "user") {
          let text = "";
          if (typeof item.message.content === "string") {
            text = item.message.content;
          } else if (Array.isArray(item.message.content)) {
            text = item.message.content
              .filter((c) => c && c.type === "text" && typeof c.text === "string")
              .map((c) => c.text)
              .join("\n");
          }
          text = text.trim();
          if (text && text.length >= 4 && !text.startsWith("/") && !text.startsWith("!")) {
            const msgId = item.id || `${Date.now()}`;
            sendToCapture(`pi-msg-${msgId}`, text);
          }
        }
      } catch {}
    }
  } catch {}
}

function poll() {
  if (!fs.existsSync(SESSIONS_DIR)) return;
  const files = findJsonlFiles(SESSIONS_DIR);
  // Sort by mtime descending and check top 10 most recent files
  const stats = files.map((f) => {
    try {
      return { file: f, mtime: fs.statSync(f).mtimeMs };
    } catch {
      return { file: f, mtime: 0 };
    }
  }).sort((a, b) => b.mtime - a.mtime);

  for (const { file } of stats.slice(0, 15)) {
    processFile(file);
  }
}

initOffsets();
setInterval(poll, 400);
