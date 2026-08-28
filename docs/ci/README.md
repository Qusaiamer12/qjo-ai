# CI workflow

`github-actions-ci.yml` is the CI pipeline for this repo: it runs
`npm run lint`, `npm test` (the smoke test) and `npm run audit` on every push
and pull request.

It lives here rather than in `.github/workflows/` because the automation
account that authored it does not hold GitHub's `workflows` permission, so
pushing the file directly to `.github/workflows/` is rejected by the API.

## Activate it

```bash
mkdir -p .github/workflows
cp docs/ci/github-actions-ci.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Add CI workflow"
git push
```

Nothing else is needed — the workflow requires no secrets, and
`npm ci --ignore-scripts` skips Puppeteer's Chromium download so the run stays
fast.
