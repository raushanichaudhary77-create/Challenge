"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server.js");
const { makeOfflineMissions, validateMissions } = require("../public/planner.js");

const preferences = {
  duration: 30,
  setting: "park",
  style: "any",
  weather: "mild",
  energy: "low",
  company: "either",
  accessNotes: "Flat paths, please."
};

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function validMissions() {
  return {
    missions: Array.from({ length: 3 }, (_, index) => ({
      title: `Quiet outdoor idea ${index + 1}`,
      duration_minutes: 15 + index * 5,
      intensity: "Gentle",
      setting: "A familiar public park",
      category: "Mindful",
      equipment: [],
      steps: ["Choose a safe spot.", "Notice a detail.", "Head home at your pace."],
      benefit: "A small, restful outdoor pause.",
      accessibility: "Try this seated if walking is not comfortable.",
      safety_notes: "Stay in a familiar public place."
    }))
  };
}

test("offline planner creates three safe, personalized missions", () => {
  const missions = makeOfflineMissions(preferences, 12);
  assert.equal(missions.length, 3);
  assert.ok(missions.every((mission) => mission.duration_minutes <= preferences.duration));
  assert.ok(missions.every((mission) => mission.intensity === "Gentle"));
  assert.ok(missions.every((mission) => mission.setting === "A familiar public park"));
  assert.ok(missions.every((mission) => mission.accessibility.includes("Flat paths, please.")));
});

test("mission validation rejects incomplete or out-of-range model output", () => {
  assert.equal(validateMissions({ missions: validMissions().missions.slice(0, 2) }), null);
  const invalid = validMissions();
  invalid.missions[0].duration_minutes = 120;
  assert.equal(validateMissions(invalid), null);
});

test("server serves the app and keeps browser security headers", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(baseUrl);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.match(await response.text(), /Find my little adventure/);
    assert.equal((await fetch(`${baseUrl}/icon.svg`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/health`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/server.js`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/%E0%A4%A`)).status, 404);
  });
});

test("unavailable Ollama returns honest, usable Offline Mode missions", async () => {
  await withServer({ fetchImpl: async () => { throw new Error("connection refused"); } }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, seed: 1 })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.mode, "offline");
    assert.equal(result.reason, "connection");
    assert.equal(result.missions.length, 3);
  });
});

test("Ollama timeouts return usable Offline Mode missions", async () => {
  await withServer({
    timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, seed: 2 })
    });
    const result = await response.json();
    assert.equal(result.mode, "offline");
    assert.equal(result.reason, "timeout");
    assert.equal(result.missions.length, 3);
  });
});

test("invalid Ollama output falls back and valid output uses local AI mode", async () => {
  await withServer({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ response: JSON.stringify(validMissions()) })
    })
  }, async (baseUrl) => {
    const goodResponse = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, seed: 3 })
    });
    const goodResult = await goodResponse.json();
    assert.equal(goodResult.mode, "ollama");
    assert.equal(goodResult.missions.length, 3);
  });
  await withServer({
    fetchImpl: async () => ({ ok: true, json: async () => ({ response: "not json" }) })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, seed: 4 })
    });
    const result = await response.json();
    assert.equal(result.mode, "offline");
    assert.equal(result.reason, "invalid-output");
  });
  await withServer({
    fetchImpl: async () => ({ ok: true, json: async () => null })
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences, seed: 5 })
    });
    const result = await response.json();
    assert.equal(result.mode, "offline");
    assert.equal(result.reason, "invalid-output");
  });
});

test("invalid preferences receive a clear client error", async () => {
  await withServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/missions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preferences: { ...preferences, duration: 500 } })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /valid activity preferences/i);
  });
});
