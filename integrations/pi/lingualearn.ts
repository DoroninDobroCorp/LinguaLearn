import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    const text = event.text?.trim();
    if (!text || text.length < 4) return;

    // Ignore slash/bang commands
    if (text.startsWith("/") || text.startsWith("!")) return;

    const configPath = path.join(
      os.homedir(),
      "Library/Application Support/LinguaLearnCapture/config.json"
    );

    if (!fs.existsSync(configPath)) return;

    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const port = config.ingressPort || 43119;
      const token = config.ingressToken;
      if (!token) return;

      const payload = JSON.stringify({
        schemaVersion: 1,
        eventId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceApp: "com.earendil.pi",
        originalText: text,
        text: text,
        sentAt: new Date().toISOString(),
      });

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: port,
          path: "/capture",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-lingualearn-ingress-token": token,
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 1500,
        },
        (res) => {
          res.resume();
        }
      );

      req.on("error", () => {
        try {
          const inboxDir = path.join(
            os.homedir(),
            "Library/Application Support/LinguaLearnCapture/hook-inbox"
          );
          if (fs.existsSync(inboxDir)) {
            const file = path.join(inboxDir, `pi-${Date.now()}.json`);
            fs.writeFileSync(file, payload, { mode: 0o600 });
          }
        } catch {
          // Silently ignore if capture server is offline
        }
      });

      req.write(payload);
      req.end();
    } catch {
      // ignore
    }
  });
}
