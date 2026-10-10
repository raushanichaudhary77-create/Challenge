(function startTouchGrassApp() {
  "use strict";

  const planner = window.TouchGrassPlanner;
  const storageKeys = {
    preferences: "touch-grass.preferences.v1",
    history: "touch-grass.history.v1",
    daily: "touch-grass.daily.v1"
  };
  const defaults = {
    duration: 30,
    energy: "medium",
    setting: "park",
    style: "any",
    weather: "mild",
    company: "either",
    accessNotes: ""
  };
  const dailyChallenges = [
    ["Find a new shade of green.", "Notice one shade of green you hadn’t seen before."],
    ["Say hello to the sky.", "Pause for one breath and notice what the sky is doing."],
    ["Take the quieter path.", "Choose a calm, familiar route for just a few minutes."],
    ["Listen for one bird.", "Listen from a comfortable spot; there’s no need to find it."],
    ["Notice the light.", "Find one place where sunlight or shade changes the view."],
    ["Bring a little water.", "Take a gentle break and have a sip if you brought some."],
    ["Look for a tiny detail.", "Notice a pattern, shape, or texture without touching it."],
    ["Take your time.", "Walk or roll at a pace that feels comfortable today."],
    ["Rest somewhere green.", "Find a safe place to sit, pause, or simply look outside."],
    ["Share a small moment.", "Tell someone about one thing you noticed outdoors."]
  ];

  const form = document.querySelector("#preferences-form");
  const missionList = document.querySelector("#mission-list");
  const planStatus = document.querySelector("#plan-status");
  const generateButton = form.querySelector('[type="submit"]');
  const generateLabel = document.querySelector("#generate-label");
  const alternateButton = document.querySelector("#alternate-button");
  const historyList = document.querySelector("#history-list");
  const historyCount = document.querySelector("#trail-count");
  const clearHistoryButton = document.querySelector("#clear-history");
  const dailyDoneButton = document.querySelector("#daily-done");
  const dailyDoneLabel = document.querySelector("#daily-done-label");
  const dailyTitle = document.querySelector("#daily-title");
  const dailyDescription = document.querySelector("#daily-description");
  const dailyDate = document.querySelector("#daily-date");
  const modeIndicator = document.querySelector("#mode-indicator");
  const timerToast = document.querySelector("#timer-toast");
  const timerDisplay = document.querySelector("#timer-display");
  const timerToggle = document.querySelector("#timer-toggle");
  const timerStop = document.querySelector("#timer-stop");
  let preferences = readStorage(storageKeys.preferences, defaults);
  let history = readStorage(storageKeys.history, []);
  let dailyRecords = readStorage(storageKeys.daily, {});
  let currentMissions = [];
  let currentRequest = 0;
  let storageWarningShown = false;
  let timerRemaining = 0;
  let timerInterval = null;
  let timerMission = null;

  function readStorage(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
      console.warn(`Could not read local preference "${key}".`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn(`Could not save local preference "${key}".`, error);
      if (!storageWarningShown) {
        storageWarningShown = true;
        planStatus.textContent = "This browser could not save local data. Your current ideas still work until you leave this page.";
      }
    }
  }

  function init() {
    if (!isValidPreferences(preferences)) preferences = { ...defaults };
    if (!Array.isArray(history)) history = [];
    if (!dailyRecords || typeof dailyRecords !== "object" || Array.isArray(dailyRecords)) dailyRecords = {};
    populateForm(preferences);
    renderHistory();
    renderDailyChallenge();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      preferences = readForm();
      writeStorage(storageKeys.preferences, preferences);
      generatePlan(false);
    });
    form.addEventListener("change", () => {
      preferences = readForm();
      writeStorage(storageKeys.preferences, preferences);
    });
    alternateButton.addEventListener("click", () => generatePlan(true));
    clearHistoryButton.addEventListener("click", clearHistory);
    dailyDoneButton.addEventListener("click", toggleDailyChallenge);
    missionList.addEventListener("click", handleMissionAction);
    timerToggle.addEventListener("click", toggleTimer);
    timerStop.addEventListener("click", stopTimer);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.warn("Offline caching could not be enabled.", error);
      });
    }
    if (!navigator.onLine) {
      planStatus.textContent = "You’re offline. Your local planner is ready whenever you are.";
    }
  }

  function isValidPreferences(value) {
    return value && typeof value === "object"
      && [15, 30, 45, 60].includes(Number(value.duration))
      && ["low", "medium", "high"].includes(value.energy)
      && ["park", "neighborhood", "yard", "indoors"].includes(value.setting)
      && ["any", "mindful", "movement", "playful", "nature"].includes(value.style)
      && ["mild", "hot", "wet", "cold"].includes(value.weather)
      && ["solo", "company", "either"].includes(value.company)
      && typeof value.accessNotes === "string";
  }

  function populateForm(value) {
    const durationInput = form.querySelector(`input[name="duration"][value="${Number(value.duration)}"]`);
    if (durationInput) durationInput.checked = true;
    for (const name of ["energy", "setting", "style", "weather", "company", "accessNotes"]) {
      const control = form.elements.namedItem(name);
      if (control) control.value = value[name] || defaults[name];
    }
  }

  function readForm() {
    const values = new FormData(form);
    return {
      duration: Number(values.get("duration")) || 30,
      energy: String(values.get("energy") || defaults.energy),
      setting: String(values.get("setting") || defaults.setting),
      style: String(values.get("style") || defaults.style),
      weather: String(values.get("weather") || defaults.weather),
      company: String(values.get("company") || defaults.company),
      accessNotes: String(values.get("accessNotes") || "").trim().slice(0, 250)
    };
  }

  async function generatePlan(isAlternate) {
    preferences = readForm();
    writeStorage(storageKeys.preferences, preferences);
    const requestId = ++currentRequest;
    const seed = Date.now() + requestId * 101;
    const avoidTitles = currentMissions.map((mission) => mission.title);
    const localMissions = planner.makeOfflineMissions(preferences, seed);
    renderMissions(localMissions);
    setMode("offline");
    planStatus.textContent = isAlternate
      ? "A fresh set of ideas, made locally while we check your private model…"
      : "Your ideas are ready in Offline Mode. Checking whether local Ollama is available…";
    alternateButton.hidden = false;
    generateButton.disabled = true;
    generateLabel.textContent = "Finding your ideas…";

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 63000);
    try {
      const response = await fetch("/api/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preferences, seed, avoidTitles }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Planner returned ${response.status}.`);
      const result = await response.json();
      const validated = planner.validateMissions({ missions: result.missions });
      if (!validated || !["ollama", "offline"].includes(result.mode)) throw new Error("Planner response was incomplete.");
      if (requestId !== currentRequest) return;
      renderMissions(validated);
      setMode(result.mode);
      planStatus.textContent = result.mode === "ollama"
        ? `A fresh plan, made privately with local Ollama. ${result.message || ""}`
        : `Offline Mode · ${result.message || "Local ideas are ready; Ollama isn’t available right now."}`;
    } catch (error) {
      if (requestId !== currentRequest) return;
      setMode("offline");
      const detail = error.name === "AbortError"
        ? "Ollama took too long to answer; your local ideas are ready."
        : "Ollama isn’t available; your local ideas are ready.";
      planStatus.textContent = `Offline Mode · ${detail}`;
    } finally {
      window.clearTimeout(timer);
      if (requestId === currentRequest) {
        generateButton.disabled = false;
        generateLabel.textContent = "Find my little adventure";
      }
    }
  }

  function renderMissions(missions) {
    currentMissions = missions;
    missionList.replaceChildren();
    for (const mission of missions) missionList.append(createMissionCard(mission));
  }

  function createMissionCard(mission) {
    const card = document.createElement("article");
    card.className = "mission-card";
    card.dataset.missionId = mission.id;
    const top = document.createElement("div");
    top.className = "mission-top";
    top.append(textElement("span", "category-tag", mission.category));
    top.append(textElement("span", "duration-tag", `${mission.duration_minutes} min · ${mission.intensity}`));
    card.append(top);
    card.append(textElement("h3", "", mission.title));
    card.append(textElement("p", "mission-benefit", mission.benefit));

    const meta = document.createElement("div");
    meta.className = "mission-meta";
    meta.append(metaRow("Place", mission.setting));
    meta.append(metaRow("Bring", mission.equipment.length ? mission.equipment.join(", ") : "Nothing special"));
    card.append(meta);

    const details = document.createElement("details");
    details.className = "mission-details";
    const summary = document.createElement("summary");
    summary.textContent = "See your steps & gentle adjustments";
    details.append(summary);
    const steps = document.createElement("ul");
    for (const step of mission.steps) steps.append(textElement("li", "", step));
    details.append(steps);
    details.append(textElement("p", "safety-detail", `Access: ${mission.accessibility}`));
    details.append(textElement("p", "safety-detail", `Take care: ${mission.safety_notes}`));
    card.append(details);

    const actions = document.createElement("div");
    actions.className = "card-actions";
    const start = textElement("button", "card-button card-button-start", "Start this mission");
    start.type = "button";
    start.dataset.action = "start";
    start.dataset.missionId = mission.id;
    const complete = textElement("button", "card-button", "I did this");
    complete.type = "button";
    complete.dataset.action = "complete";
    complete.dataset.missionId = mission.id;
    actions.append(start, complete);
    card.append(actions);
    return card;
  }

  function textElement(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value || "");
    return element;
  }

  function metaRow(label, value) {
    const row = document.createElement("div");
    row.append(textElement("span", "meta-label", label), textElement("span", "", value));
    return row;
  }

  function handleMissionAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const mission = currentMissions.find((item) => item.id === button.dataset.missionId);
    if (!mission) return;
    if (button.dataset.action === "start") startTimer(mission);
    if (button.dataset.action === "complete") completeMission(mission);
  }

  function startTimer(mission) {
    stopTimer(false);
    timerMission = mission;
    timerRemaining = mission.duration_minutes * 60;
    timerToast.hidden = false;
    timerToggle.textContent = "Pause";
    updateTimerDisplay();
    planStatus.textContent = `Timer started for “${mission.title}”. Go at a pace that feels good.`;
    timerInterval = window.setInterval(() => {
      timerRemaining -= 1;
      updateTimerDisplay();
      if (timerRemaining <= 0) {
        window.clearInterval(timerInterval);
        timerInterval = null;
        timerToggle.textContent = "Done";
        planStatus.textContent = `Your ${mission.duration_minutes}-minute timer is up. Keep going only if it feels right.`;
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(Math.max(0, timerRemaining) / 60).toString().padStart(2, "0");
    const seconds = (Math.max(0, timerRemaining) % 60).toString().padStart(2, "0");
    timerDisplay.textContent = `${minutes}:${seconds}`;
  }

  function toggleTimer() {
    if (timerRemaining <= 0) return stopTimer();
    if (timerInterval) {
      window.clearInterval(timerInterval);
      timerInterval = null;
      timerToggle.textContent = "Resume";
      planStatus.textContent = "Timer paused. Your outside time can wait.";
    } else {
      timerInterval = window.setInterval(() => {
        timerRemaining -= 1;
        updateTimerDisplay();
        if (timerRemaining <= 0) {
          window.clearInterval(timerInterval);
          timerInterval = null;
          timerToggle.textContent = "Done";
          planStatus.textContent = "Your timer is up. Keep going only if it feels right.";
        }
      }, 1000);
      timerToggle.textContent = "Pause";
      planStatus.textContent = "Timer resumed. Go at a pace that feels good.";
    }
  }

  function stopTimer(hide = true) {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
    if (hide) {
      timerToast.hidden = true;
      if (timerMission) planStatus.textContent = "Timer stopped. No pressure to finish the whole plan.";
    }
    timerMission = null;
    timerRemaining = 0;
  }

  function completeMission(mission) {
    history.unshift({
      title: mission.title,
      date: new Date().toISOString(),
      duration: mission.duration_minutes
    });
    history = history.slice(0, 50);
    writeStorage(storageKeys.history, history);
    renderHistory();
    const card = missionList.querySelector(`[data-mission-id="${CSS.escape(mission.id)}"]`);
    if (card) {
      card.classList.add("is-complete");
      card.querySelectorAll("button[data-action]").forEach((button) => {
        button.disabled = true;
        if (button.dataset.action === "complete") button.textContent = "A little moment, kept";
      });
    }
    if (timerMission && timerMission.id === mission.id) stopTimer();
    planStatus.textContent = `Lovely. “${mission.title}” is saved in your trail.`;
  }

  function renderHistory() {
    historyList.replaceChildren();
    historyCount.textContent = String(history.length);
    clearHistoryButton.hidden = history.length === 0;
    if (history.length === 0) {
      historyList.append(textElement("p", "empty-history", "Your finished moments will find a home here."));
      return;
    }
    for (const item of history.slice(0, 5)) {
      const row = document.createElement("div");
      row.className = "history-item";
      row.append(textElement("strong", "", item.title), textElement("span", "", formatDate(item.date)));
      historyList.append(row);
    }
  }

  function clearHistory() {
    history = [];
    writeStorage(storageKeys.history, history);
    renderHistory();
    planStatus.textContent = "Your trail history has been cleared from this browser.";
  }

  function renderDailyChallenge() {
    const today = new Date();
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const localCalendarDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const firstDayOfYear = Date.UTC(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((localCalendarDay - firstDayOfYear) / 86400000);
    const index = dayOfYear % dailyChallenges.length;
    dailyTitle.textContent = dailyChallenges[index][0];
    dailyDescription.textContent = dailyChallenges[index][1];
    dailyDate.textContent = today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    const completed = dailyRecords[dayKey] === true;
    dailyDoneButton.setAttribute("aria-pressed", String(completed));
    dailyDoneLabel.textContent = completed ? "A little moment, kept" : "I found one";
    dailyDoneButton.setAttribute("aria-label", `${dailyChallenges[index][1]} ${completed ? "Completed today." : ""}`);
  }

  function toggleDailyChallenge() {
    const today = new Date();
    const dayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    dailyRecords[dayKey] = dailyRecords[dayKey] !== true;
    writeStorage(storageKeys.daily, dailyRecords);
    renderDailyChallenge();
    planStatus.textContent = dailyRecords[dayKey] ? "Nice. Your tiny daily challenge is saved on this device." : "Daily challenge unchecked.";
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Recently" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function setMode(mode) {
    const local = mode === "ollama";
    modeIndicator.classList.toggle("is-ollama", local);
    modeIndicator.lastChild.textContent = local ? " Local Ollama" : " Offline Mode";
  }

  init();
})();
