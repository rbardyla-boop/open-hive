# INVERSE-METABOLISM — External Metabolism Bridge

## Goal

Weak organism + workload beyond local capacity. Pipeline: deficit detected → typed requirement → remote lease → dispatch → return → verify → evidence committed → compute right settled. Known compute: cortex wakes = 0.

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/inverseMetabolism.ts (WeakOrganism + ComputeSocket + Hive).
Tests: tests/inverseMetabolism.test.ts — 5/5.

### Disclosed limits

- in-process stand-in (not the Inverse 1.0 runtime binary)
- cortex wake counter is explicit novelty detection
- evidence commit uses HIVE-0 opaque+verifier path

### Re-entry

RESUME INVERSE-NOVELTY for unknown accelerator → cortex wake (policy propose, no silent authority).

