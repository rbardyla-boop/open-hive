# SOCKET-1 — Hostile Compute Provider

## Goal

Provider attempts fake result, fake completion, duplicate settlement, replay, excess credit, metadata mutation, instruction injection. Required: reject invalids; reject replay/duplicate settlement; ignore authority claims; preserve ledger consistency.

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/socket1.ts + ComputeSocket hardening (frozen metadata, credit cap).
Tests: tests/socket1.test.ts — 4/4.

### Disclosed limits

- in-process logical provider
- injection ignored by verify contract, not scrubbed from storage

### Re-entry

RESUME SOCKET-2 for reciprocal compute accounting lifecycle.

