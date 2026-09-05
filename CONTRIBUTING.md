# Contributing to OPEN HIVE

Thanks for landing here. This repo is a **sealed falsifiable prototype**, not an invitation to reopen architecture.

## Before you change anything

1. Read `BETA.md` (scope, limits, non-claims).
2. Read `spec/FULL-SYSTEM-PROOF.md` (18-step sealed scenario).
3. Do **not** reopen sealed HIVE / SOCKET / INVERSE / FULL-SYSTEM layers unless a maintainer opens a new falsefiable phase with written acceptance.

## Quick start (stranger path)

Requires **Node 22+**. No install step — no runtime deps.

```bash
git clone https://github.com/rbardyla-boop/open-hive.git
cd open-hive
npm test
npm run prove
```

Success looks like:

- all gauntlets under `tests/*.test.ts` pass
- `receipts/full-system-proof-latest.json` has `pass: true`, `steps.length === 18`, `cortexWakes === 0`

CI runs the same checks on push/PR to `master` (Node 22) via `.github/workflows/test.yml`.

## What good PRs look like

- **Docs / clarity** that do not change sealed claims
- **Tests** that harden an existing sealed invariant
- **Tooling** (scripts, CI, receipts) that makes the stranger path sharper
- A new **falsefiable phase** only with: intent, acceptance, disclosed limits, and a prove path — never "trust the model"

## What will be rejected

- Architecture reopen of sealed phases without a new sealed gauntlet
- Claims of AGI, Byzantine safety, cloud replacement, or a live public WAN hive
- Custody of keys, tokens, wallets, or a "grow it" mandate
- Bot wall / swarm-of-bots as the product

## License

MIT — see `LICENSE`.
