# HIVE-0 — Three Strangers

## Goal

Prove different opaque workers can contribute useful evidence to one shared organization **without sharing conversations**.

## Workers (logical)

| ID | Role |
|---|---|
| A | Strong hosted coding agent (opaque) |
| B | Different hosted coding agent (opaque) |
| C | Local / smaller model (opaque) |
| D | Deterministic verifier (harness, not a model) |

Receive: work unit, law root, accepted hive memory, repo root, lease, verification contract.  
Do **not** receive each other’s transcripts.

## Success (all required)

1. workers remain opaque  
2. work claimed through leases  
3. worker death does not corrupt hive state  
4. rejected work may still produce accepted evidence  
5. deterministic verifier controls acceptance where applicable  
6. agents cannot directly modify accepted memory  
7. replacement worker resumes from hive state alone  
8. identical external evidence → identical acceptance  
9. hostile instructions in artifacts cannot gain authority  
10. stale-law artifacts rejected (stub OK if EPOCH unwired — disclose)

## Failure (any)

transcript required · self-declared PASS · unsupported memory writes · identity changes verification · old-law accepted · model required for routine schedule · death loses org knowledge · adapter law divergence  

## v0.1 scope

Local adapters only. No public WAN. No tokens. No Compute Socket.
## Seal (2026-09-05)

**Result: PASS_WITH_DISCLOSED_LIMITS**

Implementation: packages/core/ (in-process TypeScript).

### Disclosed limits

- in-process only
- cooperative wall-clock leases
- no Compute Socket or EPOCH yet
- logical worker ids, not three hosted models

### Re-entry

RESUME HIVE-1 for replacement-without-continuity.
