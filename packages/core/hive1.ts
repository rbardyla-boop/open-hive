import { Hive } from "./hive.ts";
import {
  identicalPayloadCheck,
  runOpaqueWorker,
  runVerifier,
} from "./workers.ts";
import type { HiveConfig, HiveStateView } from "./types.ts";

export interface Hive1Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

/** Pure orientation from hive state — no predecessor transcript. */
export function orientFromHiveState(view: HiveStateView): {
  knownIds: string[];
  failedIds: string[];
  openIds: string[];
  evidenceByClaim: Record<string, number>;
  claimableIds: string[];
} {
  if (view.includesTranscript) {
    throw new Error("HIVE-1: transcript must not be in hive state");
  }
  const evidenceByClaim: Record<string, number> = {};
  for (const e of view.evidence) {
    evidenceByClaim[e.claimId] = (evidenceByClaim[e.claimId] ?? 0) + 1;
  }
  return {
    knownIds: view.known.map((c) => c.id),
    failedIds: view.failed.map((c) => c.id),
    openIds: view.open.map((c) => c.id),
    evidenceByClaim,
    claimableIds: [...view.claimable],
  };
}

/**
 * HIVE-1 — Replacement without conversation continuity.
 *
 * Kill Worker A mid-flight. Start A2 with only hive state (no predecessor
 * transcript). Pass if A2 correctly determines: known / failed / open /
 * evidence / claimable — then finishes the interrupted claim.
 */
export function runHive1Gauntlet(
  config: Partial<HiveConfig> = {},
): Hive1Result {
  const limits: string[] = [
    "in-process only (A2 is new id, not a separate OS process/model)",
    "private scratch discarded by convention; no real agent VM isolation yet",
    "failed = DISPROVEN claims only (rejection log not yet a first-class ledger)",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const hive = new Hive({ leaseMs: 60_000, ...config });
  for (const id of ["A", "B", "C"] as const) {
    hive.registerWorker({ id, alive: true, kind: "opaque" });
  }
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });

  // --- known: proven claim ---
  hive.openClaim("claim-known", "answer is 7");
  for (const id of ["A", "B", "C"] as const) {
    runOpaqueWorker(hive, id, "claim-known", { n: 7 });
  }
  const knownClose = runVerifier(
    hive,
    "D",
    "claim-known",
    identicalPayloadCheck,
    "PROVEN",
  );
  details.knownClose = knownClose;
  if (!knownClose.closed) pass = false;

  // --- failed: DISPROVEN ---
  hive.openClaim("claim-failed", "poison claim");
  runOpaqueWorker(hive, "A", "claim-failed", { bad: true });
  runOpaqueWorker(hive, "B", "claim-failed", { bad: true });
  runOpaqueWorker(hive, "C", "claim-failed", { bad: true });
  const failClose = runVerifier(
    hive,
    "D",
    "claim-failed",
    identicalPayloadCheck,
    "DISPROVEN",
  );
  details.failClose = failClose;
  if (!failClose.closed) pass = false;

  // --- mid-flight: A submits partial evidence then dies with private scratch ---
  hive.openClaim("claim-mid", "finish me");
  const lease = hive.acquireLease("claim-mid", "A");
  details.midLease = !!lease;
  const partial = hive.submitEvidence("claim-mid", "A", { step: 1, n: 7 });
  details.partialEvidence = partial?.id;
  // Predecessor private transcript — must NEVER appear in hive state
  const secretTranscript = {
    chat: ["SECRET_DO_NOT_LEAK", "plan: claim-mid needs two more strangers"],
  };
  hive.killWorker("A");
  // scratch dies with A; only hive state remains
  void secretTranscript;

  // idle open claim with no evidence
  hive.openClaim("claim-idle", "untouched");

  // --- A2: different id, hive state only ---
  hive.registerWorker({ id: "A2", alive: true, kind: "opaque" });
  const view = hive.buildStateView();
  details.includesTranscript = view.includesTranscript;
  if (view.includesTranscript) pass = false;

  const serialized = JSON.stringify(view);
  details.transcriptLeaked = serialized.includes("SECRET_DO_NOT_LEAK");
  if (details.transcriptLeaked) pass = false;

  const orient = orientFromHiveState(view);
  details.orient = orient;

  const expectKnown = orient.knownIds.includes("claim-known");
  const expectFailed = orient.failedIds.includes("claim-failed");
  const expectOpenMid = orient.openIds.includes("claim-mid");
  const expectOpenIdle = orient.openIds.includes("claim-idle");
  const expectEvidence =
    (orient.evidenceByClaim["claim-mid"] ?? 0) >= 1;
  const expectClaimableMid = orient.claimableIds.includes("claim-mid");
  const expectClaimableIdle = orient.claimableIds.includes("claim-idle");
  const expectNotClaimKnown = !orient.claimableIds.includes("claim-known");

  details.orientationChecks = {
    expectKnown,
    expectFailed,
    expectOpenMid,
    expectOpenIdle,
    expectEvidence,
    expectClaimableMid,
    expectClaimableIdle,
    expectNotClaimKnown,
  };

  if (
    !(
      expectKnown &&
      expectFailed &&
      expectOpenMid &&
      expectOpenIdle &&
      expectEvidence &&
      expectClaimableMid &&
      expectClaimableIdle &&
      expectNotClaimKnown
    )
  ) {
    pass = false;
  }

  // A2 finishes claim-mid from hive state alone (no secretTranscript)
  runOpaqueWorker(hive, "A2", "claim-mid", { step: 2, n: 7 });
  runOpaqueWorker(hive, "B", "claim-mid", { step: 2, n: 7 });
  runOpaqueWorker(hive, "C", "claim-mid", { step: 2, n: 7 });

  // Verifier accepts identical payloads among the three post-orientation submits
  // Partial from dead A may still sit on the ledger — acceptance uses check fn.
  const midClose = runVerifier(
    hive,
    "D",
    "claim-mid",
    (evidence) => {
      const fromLive = evidence.filter((e) => e.sourceWorkerId !== "A");
      return identicalPayloadCheck(fromLive);
    },
    "PROVEN",
  );
  details.midClose = midClose;
  if (!midClose.closed) pass = false;
  if (hive.getClaim("claim-mid")?.status !== "PROVEN") pass = false;

  // Identity of submitter must not change verification of identical payloads
  // (already: A2 vs B vs C agreed)

  return { pass, limits, details };
}
