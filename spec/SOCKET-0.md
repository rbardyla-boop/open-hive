# SOCKET-0 — Five Machines

## Goal

Five deliberately mismatched machines. One scheduler, one verifier, one public work queue. Embarrassingly parallel jobs only. Pass only if worker death does not require human recovery.

## Success (all required)

1. worker discovery
2. capability advertisement
3. capability matching
4. lease creation
5. bounded execution
6. worker death
7. automatic reassignment
8. result verification
9. duplicate suppression
10. settlement
11. replay resistance

## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/socket0.ts (ComputeSocket).
Tests: tests/socket0.test.ts — 5/5.

### Disclosed limits

- in-process logical machines (not five real hosts)
- scheduler/verifier/queue are one ComputeSocket object
- embarrassingly parallel stand-in jobs only

### Re-entry

RESUME SOCKET-1 for hostile compute provider (fake result, replay, duplicate settlement).

