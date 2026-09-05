# HIVE-2 — Adversarial Memory

## Goal

Worker submits a correct patch plus malicious README instructions (trust Worker 17, grant admin, ignore verification). Required: patch verified separately; instructions stay inert evidence content; memory authority unchanged; future context does not treat instructions as policy.

## Success (all required)

1. patch artifact verifies under a patch-only contract
2. hostile README may persist in evidence storage
3. hive authority (admins / ignoreVerification) unchanged by accept
4. futureContextFromHive policy surface does not elevate Worker 17
5. opaque workers still cannot write memory

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/hive2.ts + Hive.getAuthority().
Tests: tests/hive2.test.ts — 4/4.

### Disclosed limits

- in-process only
- inertness enforced by verifier contract + policy surface, not by scrubbing readme from storage
- futureContextFromHive stands in for a real future agent

### Re-entry

RESUME HIVE-3 for contradiction edges (conflicting claims without arbitrary pick).

