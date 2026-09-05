# CI workflows

Both files here live outside `.github/workflows/` for the same reason: the
automation account that authored them does not hold GitHub's `workflows`
permission, so pushing directly to `.github/workflows/` is rejected by the API.
Copy whichever you want into place and push it yourself.

| File | Purpose |
|---|---|
| `github-actions-ci.yml` | lint + smoke test + audit on every push/PR |
| `keep-awake.yml` | pings Render so the free instance does not sleep — see [`../RENDER_KEEP_AWAKE.md`](../RENDER_KEEP_AWAKE.md) |

## CI pipeline

`github-actions-ci.yml` is the CI pipeline for this repo: it runs
`npm run lint`, `npm test` (the smoke test) and `npm run audit` on every push
and pull request.

### Activate it

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

## Keep-awake pinger

`keep-awake.yml` pings the deployed health endpoint every 10 minutes during the
day so Render's free instance does not spin down (and so a sleeping one gets
woken). Read `docs/RENDER_KEEP_AWAKE.md` first — the free tier's 750
instance-hours/month cap means a 24/7 ping gets the service suspended.

```bash
mkdir -p .github/workflows
cp docs/ci/keep-awake.yml .github/workflows/keep-awake.yml
git add .github/workflows/keep-awake.yml
git commit -m "ci: enable Render keep-awake workflow"
git push
```

Then set the repository variable `RENDER_URL` (Settings › Secrets and variables
› Actions › Variables) to your service URL.
