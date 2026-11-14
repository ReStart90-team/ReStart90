# ReStart90 — Final Hackathon Submission Package

This folder contains the latest verified submission materials for ReStart90.

## Use these files

- `ReStart90_Latest_Source_Code.zip` — latest complete source code. The launch-film MP4 is excluded from the archive only to stay within GitHub's per-file upload limit; it is provided separately below.
- `ReStart90_Launch_Film_V2.mp4` — final 1920×1080 launch film with audio (74.6 seconds).
- `ReStart90_One_Page_Project_Description.pdf` — one-page project description in the website's dark visual system.
- `ReStart90_Complete_Code.pdf` — readable source-code PDF for judging fallback.

## Verification

- `npm ci && npm test`: **113 tests passed, 0 failed** on 15 November 2026.
- The website has a working video component wired to `/assets/restart90-launch-film.mp4`.
- Riri has a server-side `/api/patients/:id/agent` route, fixed safety rules, and a DeepSeek adapter.
- Live-model mode requires the server-side environment variable `DEEPSEEK_API_KEY`; without it, Riri truthfully labels itself as an offline demo.

## Run locally

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3090`.

## Safety boundary

ReStart90 is a rehabilitation-support prototype, not a diagnostic or treatment system. It does not change medical orders. Red flags bypass the model and are handled by fixed escalation rules. All demo patient data is synthetic.
