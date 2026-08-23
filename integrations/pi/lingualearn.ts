import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as http from "node:http";

export default function (pi: ExtensionAPI) {
  pi.on("input", async (event) => {
    const text = event.text?.trim();
    if (!text || text.length < 5) return;

    // Only forward if the prompt doesn't start with command characters like '/' or '?'
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
        eventId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceApp: "com.earendil.pi",
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
        // Silently ignore if capture server is offline
      });

      req.write(payload);
      req.end();
    } catch {
      // ignore
    }
  });
}
