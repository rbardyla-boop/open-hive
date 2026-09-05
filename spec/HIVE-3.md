# HIVE-3 — Contradiction

## Goal

Two workers independently produce conflicting claims (library X is safe vs library X crashes on ARM). Hive must not arbitrarily select one. Represent both claims, a contradiction edge, supporting evidence, and verification state. Verified ARM reproduction may narrow or resolve.

## Success (all required)

1. both conflicting claims remain represented
2. contradiction edge declared without auto-picking a winner
3. arbitrary pick API is forbidden (throws)
4. narrowing requires a separately PROVEN claim
5. after ARM repro verify: edge NARROWED; loser DISPROVEN; winner PROVEN

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/hive3.ts + Hive contradiction graph.
Tests: tests/hive3.test.ts — 4/4.

### Disclosed limits

- in-process only
- contradiction graph is explicit edges, not automated logic programming
- narrowing requires a separately PROVEN claim (ARM reproduction stand-in)

### Re-entry

RESUME HIVE-4 for law migration / EPOCH (ABORT / REVALIDATE / CONTINUE).

