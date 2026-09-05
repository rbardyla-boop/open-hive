# HIVE-4 — Law Migration

## Goal

Three agents work under L0. A real failure introduces ΔC. EPOCH proposes L1. Required: affected → ABORT, revalidatable → REVALIDATE, unaffected → CONTINUE; migration closure before L1 commit; replay of stale output → LAW_STALE.

## Success (all required)

1. proposal classifies ABORT / REVALIDATE / CONTINUE
2. ABORT kills affected worker and stales its claim
3. REVALIDATE keeps worker alive, clears lease, claim remains open until commit boundary
4. CONTINUE keeps unaffected worker alive
5. commit before closure fails
6. after closure + commit, current law is L1
7. L0 evidence replay returns LAW_STALE

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/hive4.ts (LawMigrator EPOCH-lite).
Tests: tests/hive4.test.ts — 4/4.

### Disclosed limits

- in-process EPOCH-lite (not a full EPOCH runtime)
- worker classification supplied by proposal, not inferred by a solver
- advanceEpoch marks OPEN claims STALE at law commit (coarse boundary)

### Re-entry

RESUME SOCKET-0 for five-machine compute pool (leases, death reassignment).

