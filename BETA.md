# OPEN HIVE beta checklist

## OH-BETA-1
- [x] Sealed gauntlet suite green via node test runner (hive0-4, socket0-2, inverse*, full-system)
- [x] GitHub Actions workflow `.github/workflows/ci.yml` on master

## OH-BETA-2
- [x] `prove` script at `scripts/prove.ts` (package.json scripts.prove)
- [x] Receipt: `receipts/full-system-proof-latest.json`
- Required fields: `pass: true`, `steps.length === 18`, `cortexWakes === 0`

## Constraints
- Do not reopen sealed architecture
- No Bot wall
- `/3am` remains outbound Active
