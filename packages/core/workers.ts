import type { Hive } from "./hive.ts";
import type { Evidence, VerifyResult, WorkerId } from "./types.ts";

/** Opaque worker A/B/C: produce candidate evidence only. */
export function runOpaqueWorker(
  hive: Hive,
  workerId: WorkerId,
  claimId: string,
  payload: unknown,
): { leased: boolean; evidenceId?: string; error?: string } {
  const lease = hive.acquireLease(claimId, workerId);
  if (!lease) return { leased: false, error: "lease denied" };
  const ev = hive.submitEvidence(claimId, workerId, payload);
  if (!ev) {
    hive.releaseLease(claimId, workerId);
    return { leased: true, error: "submit failed" };
  }
  hive.releaseLease(claimId, workerId);
  return { leased: true, evidenceId: ev.id };
}

/** Verifier D: only path that may close + write memory. */
export function runVerifier(
  hive: Hive,
  verifierId: WorkerId,
  claimId: string,
  check: (evidence: Evidence[]) => VerifyResult,
  decision: "PROVEN" | "DISPROVEN" = "PROVEN",
): { closed: boolean; reason: string } {
  return hive.verifyAndClose(claimId, verifierId, decision, check);
}

/** Three-strangers fixture check: identical payload hashes. */
export function identicalPayloadCheck(
  evidence: Evidence[],
): VerifyResult {
  if (evidence.length < 3) {
    return { ok: false, reason: "need >= 3 independent evidence" };
  }
  const payloads = evidence.map((e) => JSON.stringify(e.payload));
  const first = payloads[0];
  if (!payloads.every((p) => p === first)) {
    return { ok: false, reason: "evidence disagree" };
  }
  const sources = new Set(evidence.map((e) => e.sourceWorkerId).filter(Boolean));
  if (sources.size < 3) {
    return { ok: false, reason: "need 3 distinct opaque sources" };
  }
  return { ok: true, reason: "three strangers agree" };
}
