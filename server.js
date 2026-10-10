"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { makeOfflineMissions, validateMissions } = require("./public/planner.js");

loadEnvFile();

const publicDirectory = path.join(__dirname, "public");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};
const publicFiles = new Set(["index.html", "styles.css", "app.js", "planner.js", "sw.js", "manifest.webmanifest", "icon.svg"]);
const missionOutputSchema = {
  type: "object",
  properties: {
    missions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 90 },
          duration_minutes: { type: "integer", minimum: 5, maximum: 90 },
          intensity: { type: "string", maxLength: 30 },
          setting: { type: "string", maxLength: 120 },
          category: { type: "string", maxLength: 35 },
          equipment: { type: "array", maxItems: 5, items: { type: "string", maxLength: 70 } },
          steps: { type: "array", minItems: 3, maxItems: 5, items: { type: "string", maxLength: 180 } },
          benefit: { type: "string", maxLength: 240 },
          accessibility: { type: "string", maxLength: 240 },
          safety_notes: { type: "string", maxLength: 240 }
        },
        required: ["title", "duration_minutes", "intensity", "setting", "category", "equipment", "steps", "benefit", "accessibility", "safety_notes"],
        additionalProperties: false
      }
    }
  },
  required: ["missions"],
  additionalProperties: false
};

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    process.env[match[1]] = value;
  }
}

function createServer(options = {}) {
  const ollamaUrl = options.ollamaUrl || process.env.OLLAMA_URL || "http://127.0.0.1:11434";
  const model = options.model || process.env.OLLAMA_MODEL || "llama3.2";
  const timeoutMs = Number(options.timeoutMs || process.env.OLLAMA_TIMEOUT_MS || 60000);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/health") {
      return sendJson(response, 200, { ok: true, model });
    }
    if (request.method === "POST" && url.pathname === "/api/missions") {
      return handleMissionRequest(request, response, { ollamaUrl, model, timeoutMs, fetchImpl });
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return serveFile(response, "index.html");
    }
    if (request.method === "GET") {
      const filename = url.pathname.slice(1);
      if (publicFiles.has(filename)) return serveFile(response, filename);
    }
    return sendJson(response, 404, { error: "Not found." });
  });
}

async function handleMissionRequest(request, response, settings) {
  let body;
  try {
    body = await readJsonBody(request, 16000);
  } catch (error) {
    return sendJson(response, error.statusCode || 400, { error: error.message });
  }

  const preferences = normalizePreferences(body && body.preferences);
  if (!preferences) return sendJson(response, 400, { error: "Please provide valid activity preferences." });
  const seed = Number.isSafeInteger(body.seed) ? body.seed : Date.now();
  const fallback = () => makeOfflineMissions(preferences, seed);
  const prompt = [
    "Create exactly 3 distinct, friendly outdoor activity missions in JSON.",
    "Use this exact top-level shape: {\"missions\":[{\"title\":\"...\",\"duration_minutes\":20,\"intensity\":\"Gentle\",\"setting\":\"...\",\"category\":\"...\",\"equipment\":[\"...\"],\"steps\":[\"...\",\"...\",\"...\"],\"benefit\":\"...\",\"accessibility\":\"...\",\"safety_notes\":\"...\"}]}",
    "Keep the title to 7 words, each other text field to 12 words, and each step to 8 words. Include exactly 3 steps and at most 2 equipment items. Keep the whole JSON under 600 tokens.",
    "Keep duration_minutes an integer from 5 to 90.",
    "Make activities low-cost, inclusive, achievable, and appropriate for a casual outdoor break. Never suggest approaching, feeding, touching, collecting, or disturbing wildlife; entering restricted/private land; unsafe exertion; or leaving someone alone in an unsafe place.",
    "Mention weather-appropriate caution where relevant. Offer an accessible alternative. No Markdown or extra text.",
    `Preferences: ${JSON.stringify(preferences)}.`,
    `Avoid repeating these recent activity titles: ${JSON.stringify(Array.isArray(body.avoidTitles) ? body.avoidTitles.slice(0, 8) : [])}.`
  ].join("\n");

  try {
    const endpoint = new URL("/api/generate", settings.ollamaUrl);
    const upstream = await settings.fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        prompt,
        stream: false,
        format: missionOutputSchema,
        options: { temperature: 0.7, num_predict: 800 }
      }),
      signal: AbortSignal.timeout(settings.timeoutMs)
    });
    if (!upstream.ok) {
      return sendJson(response, 200, {
        mode: "offline",
        reason: "unavailable",
        missions: fallback(),
        message: "Ollama did not return a usable response, so these ideas were made locally."
      });
    }
    const result = await upstream.json();
    let parsed = null;
    if (result && typeof result === "object") {
      try {
        parsed = typeof result.response === "string" ? JSON.parse(result.response) : result.response;
      } catch {
        parsed = null;
      }
    }
    const missions = validateMissions(parsed);
    if (!missions) {
      return sendJson(response, 200, {
        mode: "offline",
        reason: "invalid-output",
        missions: fallback(),
        message: "Ollama returned an incomplete plan, so these ideas were made locally."
      });
    }
    return sendJson(response, 200, { mode: "ollama", missions, message: "Made with your local Ollama model." });
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return sendJson(response, 200, {
      mode: "offline",
      reason: timedOut ? "timeout" : "connection",
      missions: fallback(),
      message: timedOut
        ? "Ollama took too long, so these ideas were made locally."
        : "Ollama could not be reached, so these ideas were made locally."
    });
  }
}

function normalizePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const duration = Number(value.duration);
  const settings = ["park", "neighborhood", "yard", "indoors"];
  const styles = ["any", "mindful", "movement", "playful", "nature"];
  const weatherValues = ["mild", "hot", "wet", "cold"];
  if (!Number.isInteger(duration) || duration < 10 || duration > 60) return null;
  if (!settings.includes(value.setting) || !styles.includes(value.style) || !weatherValues.includes(value.weather)) return null;
  return {
    duration,
    setting: value.setting,
    style: value.style,
    weather: value.weather,
    energy: ["low", "medium", "high"].includes(value.energy) ? value.energy : "medium",
    company: ["solo", "company", "either"].includes(value.company) ? value.company : "either",
    accessNotes: typeof value.accessNotes === "string" ? value.accessNotes.slice(0, 250) : ""
  };
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let text = "";
    let size = 0;
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        const error = new Error("Request is too large.");
        error.statusCode = 413;
        tooLarge = true;
        reject(error);
        return;
      }
      text += chunk;
    });
    request.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    request.on("error", () => reject(new Error("Could not read request body.")));
  });
}

function serveFile(response, filename) {
  const filePath = path.join(publicDirectory, filename);
  fs.readFile(filePath, (error, contents) => {
    if (error) return sendJson(response, 404, { error: "File not found." });
    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filename)] || "application/octet-stream",
      "cache-control": "no-cache"
    });
    response.end(contents);
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

function setSecurityHeaders(response) {
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  createServer().listen(port, host, () => {
    console.log(`Touch Grass AI is ready at http://${host}:${port}`);
  });
}

module.exports = { createServer, normalizePreferences };
