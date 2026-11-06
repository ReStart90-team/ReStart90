# ReStart90 — Take your life back

[中文说明](README.zh.md) · [Design rationale (Chinese)](DESIGN.md)

ReStart90 helps people who have just come home after a lower-limb amputation, and their families, hand daily life back to the patient over 90 days. Every daily ability moves through four levels:

**Someone does it for me → Someone does it with me → Someone stands by → I can do it myself**

Most rehab products assume the patient already has family, a therapist and a hospital close by. ReStart90 starts from one person who goes home alone with a discharge sheet (V0.3). The patient and **Riri**, the assistant, are always there. Family and a rehab worker are two optional layers the patient can invite later, and they see only what the patient lets them see.

> **Take your life back.** From day one at home, turn recovery into three clear steps for today. You can start on your own.

> All records and data are synthetic. ReStart90 does not diagnose, does not change medical orders, and does not decide weight-bearing.

## What the demo shows

The demo patient is **Lin Kai** (fictional), 52, a Miao silversmith from a village near Kaili who comes home after a below-knee amputation with no one to stay by his side. His 90-day goal: get back to the lookout outside the village and see the terraced fields again. He is on day 9.

1. **Upload discharge papers.** AI extracts five key fields and highlights the exact source sentence for each; a person confirms every one.
2. **Choose who is with you.** I have family / I have a rehab worker / both / I'm on my own now. Starting alone is a full mode, not a fallback.
3. **Today's three things**, plus a **body and wound record**: pain, phantom pain, numbness, swelling, a wound photo with fixed questions, mood and daily life. The photo is only checked for brightness and sharpness, never judged.
4. **Four-step upgrade.** The system suggests a step up → the patient says "I'll try it" → family checks the home (or, on their own, the patient checks it) → a professional gives the final confirmation. With no rehab worker yet, the step waits.
5. **Safety stop.** A red flag (a fixed wound answer, fever, a fall, chest pain, thoughts of self-harm) pauses the related tasks, stops all upgrades and writes a doctor summary from recorded data only.
6. **Life back and the 90-day map.** Day 1 vs today for every ability, each handback in order, and "today you took back N parts of daily life".
7. **The film and the story.** A slot for the promo film *The Next Step* (drop the file into `public/media/`, see the README there) and Lin Kai's story page. Character and medical data are synthetic.

Plus: a one-click **Chinese / English** switch on every page, and **Riri**, with a fixed way in from every patient page. Riri has fixed doors: what to do today, "I can't do this", "is this normal?", and "I just want to talk". It never says "that's normal", never changes orders or training load, and never promises a prosthesis or walking. Red flags go straight to a professional; anything else is answered with "I can't judge that".

Every visitor gets a private copy of the demo, so your clicks never change what another visitor sees. The **Reset** button in the demo bar returns your copy to day 9.

## Run locally

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`).

```bash
npm install
npm start
```

Open http://localhost:3090.

- **With AI:** set `ANTHROPIC_API_KEY`. Discharge extraction, plain-language red-flag parsing and the listening reply call Claude (`claude-opus-5-5` by default; change it with `RESTART90_MODEL`).
- **Without AI:** the app runs in offline mode automatically. The sample discharge summary uses a pregenerated extraction; other text uses rule-based extraction. The red-flag keyword rules always run, with or without AI. To force offline mode, run `RESTART90_OFFLINE=1 npm start`.
- **Public rate limit:** each visitor IP gets `RESTART90_AI_LIMIT` model calls per hour (default 40). Past that, requests fall back to offline mode instead of failing.
- **Tests:** `npm test`
- **Clear the database:** `npm run reset`

## Deploy

`render.yaml` deploys the app as a single Render web service. Push the repo to GitHub, create a Render Blueprint from it, and optionally add `ANTHROPIC_API_KEY` in the dashboard. Any host that runs a long-lived Node 22.13+ process works. The SQLite file lives in `data/`, or wherever `RESTART90_DB` points. Demo sandboxes are recreated on demand, so a host with ephemeral disk is fine.

## Safety rules (in code, never left to the AI)

- An upgrade from level 1 needs 2 completions in a row; higher levels need 3, with no red flag.
- Every upgrade follows the four steps above. The rehab team cannot confirm until the patient has said yes, and nobody can confirm without a rehab layer.
- A new profile must be confirmed by a rehab worker; until then every ability stays at the most protective level.
- Family and rehab see a patient only after the patient invites them. Family never sees private notes, mood answers or the wound photo.
- Rising pain or low mood puts upgrades on hold for the day.
- A red flag pauses the related tasks, stops all upgrades and writes a doctor summary. Every number in it comes from the database.
- Chest pain, breathlessness or thoughts of self-harm pause everything and show emergency and crisis lines.

## Structure

```
server.js          HTTP server, REST API, per-visitor demo sandboxes, AI rate limit (no framework)
lib/content.js     Bilingual content: 4 phases with pass/pause conditions, 6 abilities × 4 levels,
                   red-flag rules, training, peer stories (template v0.1, pending clinical review)
lib/engine.js      Rules engine: daily lists, four-step upgrades, step-downs, red-flag stop, doctor summary,
                   stalled abilities and disagreements, support layers, the Riri assistant, reviews, life back, 90-day map
lib/ai.js          AI layer: discharge extraction, plain-language signal parsing, listening reply,
                   all with offline fallbacks
lib/samples.js     Synthetic discharge summary (zh/en) and pregenerated extraction
lib/db.js          SQLite schema and migrations
public/            Single-page front end (vanilla JS, zh/en)
test/              Rules-engine tests
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meta` | Content library, sample record, AI status |
| POST | `/api/extract` | `{text \| pdfBase64, lang}`: extract a discharge summary |
| GET/POST | `/api/patients` | List profiles (rehab team) / create one |
| GET | `/api/patients/:id?role=` | Full state for one role on the current day |
| POST | `/api/patients/:id/logs` · `/plan` · `/help` | Patient logs a task, picks when to do it; family logs help given |
| POST | `/api/patients/:id/checkin` | Daily body and mood check-in (`body` for the full V0.3 record, `photo` as a small JPEG); runs the red-flag rules |
| POST | `/api/patients/:id/pending/:pid` | `{decision, role, note}`: patient, family, rehab confirm or decline an upgrade |
| POST | `/api/patients/:id/abilities/:ability` | Rehab team adjusts a level, swaps in a smaller step, pauses |
| POST | `/api/patients/:id/alerts/:aid/resolve` | Resolve a red-flag alert |
| POST | `/api/patients/:id/agent` | Riri: `{intent: welcome \| today \| cant \| normal \| talk, text?, taskId?}` |
| POST | `/api/patients/:id/support` | `{layer: family \| rehab, action: invite \| remove, name?}`: the patient lets a layer in or out |
| GET | `/api/patients/:id/life` | Life handed back: day 1 vs today, handbacks, tasks done per day |
| POST | `/api/patients/:id/confirm-plan` | Rehab team confirms a new 90-day plan |
| POST | `/api/patients/:id/notes` · `/todos/:tid` · `/review` | Notes (optionally rehab-only), home checklist, reviews |
| GET | `/api/patients/:id/map` · `/review` | 90-day map and weekly / monthly reviews |
| POST | `/api/patients/:id/advance` · `/api/demo/reset` | Demo only: next day, reset this visitor's copy |

`demo` always refers to the caller's own copy of the demo patient (`demo-lin` from older links still works).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and pull-request workflow and for where each kind of content lives.

## License

[MIT](LICENSE)
