# HIVE-1 — Replacement without conversation continuity

## Goal

During active work, kill Worker A. Start Worker A2 (different identity). Give it only hive state — no predecessor transcript. Pass if A2 correctly determines what is known, what failed, what remains open, what evidence exists, and what work it may claim — then can finish interrupted work from that state alone.

## Success (all required)

1. mid-flight kill of A frees lease without corrupting submitted evidence
2. A2 receives HiveStateView only (includesTranscript: false)
3. predecessor private scratch never appears in serialized hive state
4. A2 orientation: known / failed / open / evidence / claimable are correct
5. A2 can claim interrupted work and complete toward verification
6. identity of A vs A2 does not rewrite acceptance of identical evidence

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/hive1.ts + Hive.buildStateView().
Tests: tests/hive1.test.ts — 4/4.

### Disclosed limits

- in-process only (A2 is a new worker id, not a separate OS process or model)
- private scratch discarded by convention; no real agent VM isolation yet
- failed = DISPROVEN claims only (rejection log not yet a first-class ledger)

### Re-entry

RESUME HIVE-2 for adversarial memory (hostile instructions stay inert).

