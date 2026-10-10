(function attachPlanner(root) {
  "use strict";

  const templates = [
    {
      title: "Notice five small wonders",
      category: "Mindful",
      intensity: "Gentle",
      equipment: ["A comfortable pair of shoes"],
      steps: [
        "Choose a familiar, comfortable outdoor spot.",
        "Walk slowly and notice five small details: a shape, a sound, a texture, a color, and a scent.",
        "Pause somewhere safe and take three unhurried breaths.",
        "Head back by a route you already know."
      ],
      benefit: "A low-pressure reset that makes an ordinary patch of nature feel new.",
      accessibility: "Try this seated near an open window, doorway, or garden if walking is not comfortable today."
    },
    {
      title: "Take the scenic short route",
      category: "Explore",
      intensity: "Steady",
      equipment: ["Comfortable shoes", "Water if needed"],
      steps: [
        "Pick a familiar, public route with an easy way to turn back.",
        "Walk at a conversational pace and look for one new detail along the way.",
        "Take a short pause at a safe resting place.",
        "Return before you feel tired or rushed."
      ],
      benefit: "A little fresh air and gentle movement without turning the outing into a workout.",
      accessibility: "Choose a flat, paved loop or roll a familiar accessible path; a shorter out-and-back counts."
    },
    {
      title: "Make a tiny nature journal",
      category: "Creative",
      intensity: "Gentle",
      equipment: ["Paper and pencil, or a notes app"],
      steps: [
        "Settle in a permitted outdoor place where you can sit comfortably.",
        "Write or sketch three things you notice, without needing to identify them.",
        "Add one sentence about how the air or light feels.",
        "Leave every natural object where you found it."
      ],
      benefit: "A creative pause that invites curiosity without collecting or disturbing anything.",
      accessibility: "Use voice notes, a phone, or simply name your observations aloud."
    },
    {
      title: "Stretch in a green space",
      category: "Move",
      intensity: "Gentle",
      equipment: ["A stable place to stand or sit"],
      steps: [
        "Find a level, comfortable spot away from paths, traffic, and other people.",
        "Take a few easy shoulder rolls and gentle arm reaches.",
        "Move only through a comfortable range; skip anything that hurts.",
        "Finish with a slow breath and a sip of water if you brought some."
      ],
      benefit: "A flexible, low-impact way to loosen up outdoors at your own pace.",
      accessibility: "Do seated movements or choose just one comfortable stretch; resting is part of the activity."
    },
    {
      title: "Care for a little patch",
      category: "Nature care",
      intensity: "Steady",
      equipment: ["Optional gloves", "A small bag for your own litter"],
      steps: [
        "Only choose a place where you have permission to help.",
        "From a safe path, pick up a few pieces of ordinary litter using gloves or a grabber.",
        "Avoid sharp, unknown, chemical, or animal-related waste; leave it for local professionals.",
        "Dispose of collected litter in the proper bin and wash your hands."
      ],
      benefit: "A small, practical act of care that respects the place and its wildlife.",
      accessibility: "Skip lifting or bending; a seated visual litter check or a kind word to a local park group is enough."
    },
    {
      title: "Share a slow stroll",
      category: "Connect",
      intensity: "Steady",
      equipment: ["Comfortable shoes"],
      steps: [
        "Invite someone you trust, or enjoy the route solo.",
        "Choose a familiar public path that suits everyone's pace.",
        "Walk and share one thing you each noticed outdoors.",
        "Turn back or take a break whenever you like."
      ],
      benefit: "Gentle movement with room for conversation, company, or quiet.",
      accessibility: "Pick a step-free route, use a mobility aid as usual, and agree on a comfortable distance."
    },
    {
      title: "Find a shady seat",
      category: "Rest",
      intensity: "Gentle",
      equipment: ["A safe place to sit"],
      steps: [
        "Choose a permitted seat or a familiar place to rest.",
        "Settle in and notice the movement of leaves, clouds, or light.",
        "Let your shoulders relax and take a few comfortable breaths.",
        "Stay as long as it feels good, then head home safely."
      ],
      benefit: "Restorative outdoor time that asks for no special fitness or gear.",
      accessibility: "Stay near home, use a sheltered porch, or enjoy the view through an open window."
    },
    {
      title: "Play a color-finding game",
      category: "Play",
      intensity: "Gentle",
      equipment: [],
      steps: [
        "From a path or other safe spot, choose a color to look for.",
        "Find three examples without touching, picking, or approaching anything.",
        "Choose another color and notice how the light changes it.",
        "Finish with your favorite discovery."
      ],
      benefit: "A playful, flexible way to bring curiosity to a short outdoor break.",
      accessibility: "Choose shapes, sounds, or textures instead of colors, and play from a seated spot."
    }
  ];

  function makeOfflineMissions(preferences, seed) {
    const prefs = preferences || {};
    const duration = Math.min(60, Math.max(10, Number(prefs.duration) || 30));
    const offset = Math.abs(Number(seed) || Date.now()) % templates.length;
    const selected = [];
    for (let index = 0; index < templates.length && selected.length < 3; index += 1) {
      const template = templates[(offset + index) % templates.length];
      if (prefs.style && prefs.style !== "any" && !matchesStyle(template.category, prefs.style)) continue;
      selected.push(template);
    }
    for (let index = 0; selected.length < 3; index += 1) {
      const template = templates[(offset + selected.length + index) % templates.length];
      if (!selected.includes(template)) selected.push(template);
    }

    return selected.map((template, index) => ({
      id: `local-${offset}-${index}-${duration}`,
      title: template.title,
      duration_minutes: Math.min(duration, Math.max(10, Math.round(duration * (index === 0 ? 0.65 : 0.8)))),
      intensity: prefs.energy === "low" ? "Gentle" : template.intensity,
      setting: settingLabel(prefs.setting),
      category: template.category,
      equipment: template.equipment.slice(),
      steps: template.steps.slice(),
      benefit: template.benefit,
      accessibility: prefs.accessNotes
        ? `${template.accessibility} Your note: ${String(prefs.accessNotes).slice(0, 250)}`
        : template.accessibility,
      safety_notes: safetyNote(prefs)
    }));
  }

  function matchesStyle(category, style) {
    const map = {
      mindful: ["Mindful", "Rest"],
      movement: ["Move", "Explore", "Connect"],
      playful: ["Play", "Creative"],
      nature: ["Nature care", "Explore"]
    };
    return (map[style] || []).includes(category);
  }

  function settingLabel(setting) {
    const labels = {
      park: "A familiar public park",
      neighborhood: "A familiar neighborhood route",
      yard: "A yard, patio, or balcony",
      indoors: "A doorstep, open window, or indoor-friendly option"
    };
    return labels[setting] || labels.park;
  }

  function safetyNote(preferences) {
    const notes = ["Stay in permitted, familiar places and follow posted local guidance."];
    if (preferences.weather === "hot") notes.push("Choose shade, bring water, and keep the outing short in hot weather.");
    if (preferences.weather === "wet") notes.push("Skip slippery or stormy conditions; a sheltered or indoor-friendly option is fine.");
    if (preferences.weather === "cold") notes.push("Dress for the temperature and head inside if you feel uncomfortable.");
    return notes.join(" ");
  }

  function validateMissions(value) {
    if (!value || !Array.isArray(value.missions) || value.missions.length !== 3) return null;
    const missions = [];
    for (const [index, mission] of value.missions.entries()) {
      if (!mission || typeof mission !== "object") return null;
      const title = cleanText(mission.title, 90);
      const setting = cleanText(mission.setting, 120);
      const benefit = cleanText(mission.benefit, 240);
      const accessibility = cleanText(mission.accessibility, 240);
      const safety = cleanText(mission.safety_notes, 240);
      const intensity = cleanText(mission.intensity, 30);
      const category = cleanText(mission.category, 35);
      const duration = Number(mission.duration_minutes);
      const steps = cleanList(mission.steps, 3, 5, 180);
      const equipment = cleanList(mission.equipment, 0, 5, 70);
      if (!title || !setting || !benefit || !accessibility || !safety || !intensity || !category) return null;
      if (!Number.isInteger(duration) || duration < 5 || duration > 90 || !steps || !equipment) return null;
      missions.push({
        id: `ollama-${index}-${Date.now()}`,
        title,
        duration_minutes: duration,
        intensity,
        setting,
        category,
        equipment,
        steps,
        benefit,
        accessibility,
        safety_notes: safety
      });
    }
    return missions;
  }

  function cleanText(value, maxLength) {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function cleanList(value, min, max, maxLength) {
    if (!Array.isArray(value) || value.length < min || value.length > max) return null;
    const list = value.map((item) => cleanText(item, maxLength));
    return list.every(Boolean) || list.length === 0 ? list : null;
  }

  const api = { makeOfflineMissions, validateMissions, safetyNote, templates };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.TouchGrassPlanner = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
