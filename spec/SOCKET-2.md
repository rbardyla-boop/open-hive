# SOCKET-2 — Reciprocal Compute

## Goal

Simple accounting lifecycle: contribute accepted units → balance up; consume → balance down. Example: A contributes 100 → 100; consumes 25 → 75. Do not solve perfect fairness.

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/socket2.ts + ComputeSocket.consume().
Tests: tests/socket2.test.ts — 4/4.

### Disclosed limits

- in-process ledger only (not a market or token)
- 1 credit = 1 accepted work unit; no pricing model
- consume is explicit debit — not automatic on remote lease yet

### Re-entry

RESUME INVERSE-METABOLISM for external metabolism bridge (deficit → remote lease → verify).

