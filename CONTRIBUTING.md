# 协作说明 · Working together

## 第一次上手

```bash
git clone https://github.com/Hed1an/ReStart90.git
cd ReStart90
npm install
npm start
```

打开 http://localhost:3090。需要 Node.js 22.13 或更高版本。没有 API key 也能运行，会自动进入离线模式。

## 每次改动的流程

1. 先同步最新代码：`git checkout main && git pull`
2. 新开一个分支，名字写清楚改什么：`git checkout -b content/red-flag-wording`
3. 改完后本地跑一遍：`npm test`，再打开网页点一遍五步演示
4. 提交并推送：`git add -A && git commit -m "说明改了什么"`，然后 `git push -u origin 分支名`
5. 在 GitHub 上开 Pull Request，请另一个人看过再合并到 `main`

不要直接推送到 `main`。两个人同时改同一个文件时，Pull Request 会提示冲突，在 GitHub 页面上或本地解决后再合并。

## 谁改哪里

| 内容 | 文件 |
|---|---|
| 生活能力、四级文案、红旗规则、阶段、同伴故事 | `lib/content.js` |
| 示例患者林凯的出院小结和档案 | `lib/samples.js` |
| 网页上的所有界面文字（中英对照） | `public/app.js` 顶部的 `T` |
| 设计依据（"设计依据"开关里显示的内容） | `public/app.js` 里的 `WHY` 和 `PRINCIPLES` |
| 颜色、字体、版式 | `public/styles.css` |
| 规则引擎（升级、红旗、摘要） | `lib/engine.js`，改完必须跑 `npm test` |

文案都是 `['中文', 'English']` 成对出现，改一边时记得同时改另一边。

## 底线

- 只用合成数据，不提交任何真实病历或真实患者信息。
- 不提交 API key、`.env` 文件或 `data/` 里的数据库。
- 红旗规则和升级规则写在代码里，不交给 AI 决定。

## Quick version in English

Clone, `npm install`, `npm start`, open http://localhost:3090. For each change, pull `main`, create a branch, run `npm test`, push the branch and open a pull request for the other person to review. Never push straight to `main`. Synthetic data only; never commit API keys or the `data/` database. UI copy lives in `public/app.js` as `['中文', 'English']` pairs, and clinical content lives in `lib/content.js`.
