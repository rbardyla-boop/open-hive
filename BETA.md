# OPEN HIVE — beta / prototype harness

Status: **PASS_WITH_DISCLOSED_LIMITS**
OPEN HIVE is Active OSS business / public beta. Architecture is sealed. Do not reopen it.

## Prototype scope

- In-process stand-ins for sealed HIVE/SOCKET/INVERSE/FULL-SYSTEM-PROOF layers
- Test runner covers all gauntlets under tests/*.test.ts
- prove writes receipts/full-system-proof-latest.json
- GitHub Actions on push/PR to master, Node >=22.6.0 (.github/workflows/test.yml)
- No Bot wall

## How to test

Node >=22.6.0 with --experimental-strip-types. No runtime deps.
Run the package test script, then the prove script.
prove writes receipts/full-system-proof-latest.json with pass true, steps.length 18, cortexWakes 0.

## PASS_WITH_DISCLOSED_LIMITS

See spec/FULL-SYSTEM-PROOF.md for the 18-step scenario, limits, and re-entry.

## Disclosed limits

- in-process stand-ins only
- decomposition is explicit claim fan-out, not an LLM planner
- cooperative wall-clock leases; logical worker ids
- no public WAN, no tokens, no live compute marketplace

## Non-claims

Does not claim AGI, Byzantine safety, cloud replacement, or a live public hive.
Does not authorize hiring a Bot wall.

## Pointer

- spec/FULL-SYSTEM-PROOF.md
- packages/core/fullSystemProof.ts
- tests/fullSystemProof.test.ts
- receipts/full-system-proof-latest.json
Success: stranger can clone and run the test plus prove scripts.
Limits: in-process stand-ins; no AGI or Byzantine or cloud-replacement claims; no custody or WAN hive.
Clove /3am stays separate Active. OPEN HIVE is the OSS business lane.
