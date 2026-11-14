# ReStart90 — Take your life back.

[中文说明](README.zh.md) · [Design rationale (Chinese)](DESIGN.md)

> **Judges — start here.** The entry points that matter are not this README.
>
> - **Live site:** https://restart90-gruup9wi.manus.space/
> - **Verified live source + integrity manifest:** `ReStart90_Verified_Source_20261115.zip`, `VERIFIED_VERSION_20261115.md`
> - **Submission package** (one-page brief, launch film, readable source PDF): `SUBMISSION_README.md`
> - **Repository root** is the historical V0.2 prototype (Express + SQLite + Anthropic adapter). The deployed site runs the dated archive above, so read `VERIFIED_VERSION_20261115.md` before judging the root.
>
> The quickest local run: `npm ci && npm start` — no key needed, it falls back to offline rules and synthetic data.

ReStart90 helps people who have just come home after a lower-limb amputation, and their families, hand daily life back to the patient over 90 days. Every daily ability moves through four levels:

**Family does it for me → Family does it with me → Family stands by → I can do it myself**

The hospital gives a plan for the wound, follow-ups and exercises. At home, nobody says who helps with what, or when the family should step back. ReStart90 turns the discharge orders into three lists for the same day: what the patient does, how far the family helps and where they stop, and what the rehab team needs to confirm.

> All records and data are synthetic. ReStart90 does not diagnose, does not change medical orders, and does not decide weight-bearing.

## What the demo shows

1. **Upload discharge orders.** AI extracts five key fields and highlights the exact source sentence for each; a person confirms every one.
2. **Three roles, one day.** Patient, family and rehab team each see their own list for Kai Lin's day 9 at home.
3. **Four-step upgrade.** The system suggests a step up → the patient says "I'll try it" → family confirms the home is ready → the rehab team gives the final confirmation.
4. **Safety stop.** A red-flag report (e.g. a leaking wound) pauses the related tasks, stops all upgrades and writes a doctor summary from recorded data only.
5. **90-day map.** Grey (family does it) shrinks, yellow (I do it myself) grows, red marks days paused for a red flag.

Plus: a one-click **Chinese / English** switch on every page, and **Pin (路标)**, the patient's assistant. It has four fixed doors: what to do today, "I can't do this", "is this normal?", and "I just want to talk". It never says "that's normal". Red flags go straight to a professional; anything else is answered with "I can't judge that" and an option to send it to the rehab team.

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
- Every upgrade follows the four steps above. The rehab team cannot confirm until the patient has said yes.
- A new profile must be confirmed by the rehab team; until then every ability stays at the most protective level.
- Rising pain or low mood puts upgrades on hold for the day.
- A red flag pauses the related tasks, stops all upgrades and writes a doctor summary. Every number in it comes from the database.
- Chest pain, breathlessness or thoughts of self-harm pause everything and show emergency and crisis lines.

## Structure

```
server.js          HTTP server, REST API, per-visitor demo sandboxes, AI rate limit (no framework)
lib/content.js     Bilingual content: 4 phases with pass/pause conditions, 6 abilities × 4 levels,
                   red-flag rules, training, peer stories (template v0.1, pending clinical review)
lib/engine.js      Rules engine: daily lists, four-step upgrades, step-downs, red-flag stop, doctor summary,
                   stalled abilities and disagreements, the Pin assistant, reviews, 90-day map
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
| POST | `/api/patients/:id/checkin` | Daily body and mood check-in; runs the red-flag rules |
| POST | `/api/patients/:id/pending/:pid` | `{decision, role, note}`: patient, family, rehab confirm or decline an upgrade |
| POST | `/api/patients/:id/abilities/:ability` | Rehab team adjusts a level, swaps in a smaller step, pauses |
| POST | `/api/patients/:id/alerts/:aid/resolve` | Resolve a red-flag alert |
| POST | `/api/patients/:id/agent` | Pin assistant: `{intent: today \| cant \| normal \| talk, text?, taskId?}` |
| POST | `/api/patients/:id/confirm-plan` | Rehab team confirms a new 90-day plan |
| POST | `/api/patients/:id/notes` · `/todos/:tid` · `/review` | Notes (optionally rehab-only), home checklist, reviews |
| GET | `/api/patients/:id/map` · `/review` | 90-day map and weekly / monthly reviews |
| POST | `/api/patients/:id/advance` · `/api/demo/reset` | Demo only: next day, reset this visitor's copy |

`demo-lin` always refers to the caller's own copy of the demo patient.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch and pull-request workflow and for where each kind of content lives.

## License

[MIT](LICENSE)
