# Touch Grass AI

A calm, local-first outdoor activity planner. Pick the time, place, energy level, weather, and kind of activity that fits today to get three small, practical ideas. No account, subscription, API key, or external AI service is required.

## Requirements

- Node.js 18 or newer
- Optional: [Ollama](https://ollama.com/) with a model downloaded locally

The app has no npm dependencies. Its built-in planner works without Ollama or an internet connection once the page has been opened and its static files cached.

## Start the app

From this folder, run:

```powershell
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server binds to loopback by default and serves the site only on your computer. Use `Ctrl+C` in the terminal to stop it.

## Optional: enable local AI

1. Install Ollama and download a model, for example:

   ```powershell
   ollama pull llama3.2
   ```

2. Start Ollama. Its default local API is `http://127.0.0.1:11434`.
3. Copy `.env.example` to `.env` if you want to change the model, Ollama address, timeout, or web server port. The defaults work when Ollama is running locally with the `llama3.2` model.
4. Restart `npm start`, then generate a plan. The footer shows **Local Ollama** only when the model returns a valid plan.

The server sends only the selected planner preferences and optional accessibility note to the configured Ollama endpoint. By default that endpoint is on your own computer. The app has no analytics, third-party AI calls, account system, or external font/image dependencies. Do not enter sensitive personal details in the optional note.

## Offline and fallback behavior

- If Ollama is stopped, unreachable, too slow, or returns an invalid plan, the app switches to clearly labeled **Offline Mode** and supplies locally generated alternatives.
- If the browser has already loaded the app once, its service worker caches the HTML, styles, scripts, manifest, and icon for later offline use. The planner itself runs in the browser; its API request is optional.
- Preferences, completed-mission history, and the daily challenge state are stored in this browser's local storage. Use **Clear history** in “Your trail” to remove finished missions. Clearing this site's browser data removes the rest.

## Using the planner

1. Choose an available time, energy level, setting, activity style, weather, and whether you will go alone or with someone.
2. Optionally add a short accessibility preference such as a flat route or a place to sit.
3. Select **Find my little adventure**. Use **Give me different ideas** for another set.
4. Each mission includes its duration, intensity, place, equipment, steps, accessibility adjustment, and safety note. **Start this mission** starts its optional countdown; **I did this** saves it to your local trail.
5. The daily challenge can be marked complete independently.

## Safety and accessibility

These are casual suggestions, not medical or emergency advice. Choose familiar and permitted places; check local weather and access guidance; bring water or layers as useful; and stop or adapt any activity that feels uncomfortable. Keep a respectful distance from wildlife and plants. Never feed, touch, approach, or collect them. Avoid unsafe weather, restricted land, and anything that causes pain. Follow local emergency guidance when needed.

The form works with keyboard navigation and screen readers, includes a skip link and visible focus styles, respects reduced-motion preferences, and offers seated, shorter, and near-home adjustments. You never need to finish an activity or use the timer.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address for the local web server |
| `PORT` | `3000` | Local web server port |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Local or intentionally configured Ollama endpoint |
| `OLLAMA_MODEL` | `llama3.2` | Model name already available to Ollama |
| `OLLAMA_TIMEOUT_MS` | `60000` | Maximum time to wait for Ollama |

Environment variables set in the process take precedence over `.env`. Keep `.env` private; it is ignored by Git.

## Checks

```powershell
npm test
npm run check
```
