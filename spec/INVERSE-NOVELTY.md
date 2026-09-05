# INVERSE-NOVELTY — Novel External Resource

## Goal

Unknown accelerator (unknown execution semantics, unknown verifier) → NOVELTY → cortex wake. Cortex may propose policy. It cannot silently create authority. Once policy is accepted, future identical resources do not wake the cortex.

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/inverseNovelty.ts (Cortex + policy proposals).
Tests: tests/inverseNovelty.test.ts — 4/4.

### Disclosed limits

- in-process novelty/policy board (not Inverse 1.0 cortex binary)
- acceptProposal stands in for law/human acceptance
- unknown semantics recorded as proposal text only

### Re-entry

RESUME FULL-SYSTEM-PROOF to combine hive + socket + metabolism in one scenario.

