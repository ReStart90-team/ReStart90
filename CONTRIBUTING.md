# Working together · 协作说明

## Getting started

```bash
git clone https://github.com/ReStart90-team/ReStart90.git
cd ReStart90
npm install
npm start
```

Open http://localhost:3090. You need Node.js 22.13 or newer. No API key is needed; without one the app runs in offline mode.

The site opens in English. Use the 中文 button in the top bar to switch, or add `?lang=zh` to the address to open it in Chinese.

## How to make a change

1. Get the latest code: `git checkout main && git pull`
2. Create a branch named after what you are changing: `git checkout -b content/red-flag-wording`
3. Before you commit, run `npm test`, then click through the five-step demo in the browser
4. Commit and push: `git add -A && git commit -m "What changed"`, then `git push -u origin your-branch`
5. Open a pull request on GitHub and ask the other person to review it before merging into `main`

Don't push straight to `main`. If you both edit the same file, the pull request will show a conflict; resolve it on GitHub or locally before merging.

## Where things live

| What | File |
|---|---|
| Daily abilities, the four levels, red-flag rules, phases, peer stories | `lib/content.js` |
| The demo patient Lin Kai: discharge summary and profile | `lib/samples.js` |
| Body-record fields and red-flag answers | `BODY` in `lib/content.js` |
| The promo film | `public/media/` (see the README there) |
| All interface copy (English and Chinese) | the `T` object at the top of `public/app.js` |
| Design rationale shown by the "Design rationale" toggle | `WHY` and `PRINCIPLES` in `public/app.js` |
| Colours, typefaces, layout | `public/styles.css` |
| Rules engine (upgrades, red flags, doctor summary) | `lib/engine.js`; always run `npm test` after changing it |

Copy is stored as `['中文', 'English']` pairs. When you change one language, update the other in the same commit. English is the primary language for the DSH submission, so write the English first and keep the Chinese faithful to it.

## Ground rules

- Synthetic data only. Never commit real medical records or real patient details.
- Never commit API keys, `.env` files or the database in `data/`.
- Red-flag and upgrade rules live in code. They are never left to the AI.

## 中文简版

克隆仓库后运行 `npm install` 和 `npm start`，打开 http://localhost:3090。网站默认英文，点顶部的"中文"切换，或在网址后加 `?lang=zh`。

每次改动：先 `git pull` 同步 `main`，新开一个分支，跑 `npm test`，推送分支后在 GitHub 上开 Pull Request，请另一个人看过再合并。不要直接推送到 `main`。

界面文字在 `public/app.js` 里，按 `['中文', 'English']` 成对存放；医学内容在 `lib/content.js`。改一种语言时同时改另一种。提交时以英文为准，中文要和英文意思一致。只用合成数据，不提交 API key 或 `data/` 里的数据库。
