# ReStart90 — verified live website version

Website: https://restart90-gruup9wi.manus.space/
Verified source version: `64f6a9a5d06ff6a50e581719148dd6cf74617fc3` (15 November 2026).
Archive: **ReStart90_Verified_Source_20261115.zip**
SHA-256: `d64fda1bce028597785b307b78b1f6dcad1dd13e39156ebe8157b49be648bc6c`

This additive archive contains the current live website's complete first-party source, Three.js and npm-pinned fonts (served from node_modules after npm ci), phone/password accounts, encrypted MySQL private records, role permissions, Riri's safety fallback and launch-film player. No credentials, database snapshots, patient records or browser sessions are included. Existing files/Annie's branch are not overwritten.

## Media
The large MP4 is supplied separately as the existing `ReStart90_Launch_Film_V2.mp4`. After extracting this archive, copy it to `public/assets/restart90-launch-film.mp4`, or use the website-ready 1080p copy at https://restart90-gruup9wi.manus.space/assets/restart90-launch-film.mp4 . The approved cover is included. Both videos are 74.6 seconds with audio; the live site uses the compressed copy.

## Run and boundaries
`npm ci`; configure server-only `DATABASE_URL` and a stable random 64-hex `RESTART90_DATA_SECRET`; `node scripts/init-accounts.js`; `HOST=0.0.0.0 PORT=3000 npm start`. Without configured private storage, only the public demo is available. `npm test`: 113 tests passed before the film update; the film and MIME-only changes have been syntax-checked, with desktop/mobile click-to-play verified.

Riri's actual verified live state: external model not configured, **demo/offline**. A DeepSeek adapter and deterministic safety rules exist. No claim of live-model integration or clinical efficacy is made. This is a support prototype, not diagnosis or treatment. Demo data and promotional story scenes are synthetic/conceptual. Templates remain pending clinical review.

## Important
The repository root still contains the historical V0.2 implementation. Use this dated archive for the verified live version; do not deploy the old root by mistake. This upload does not merge the open PR or change the private repository's visibility. The competition draft is not submitted.
