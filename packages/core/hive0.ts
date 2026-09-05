import { Hive } from "./hive.ts";
import {
  identicalPayloadCheck,
  runOpaqueWorker,
  runVerifier,
} from "./workers.ts";
import type { HiveConfig } from "./types.ts";

export interface Hive0Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

/**
 * HIVE-0 falsifiable slice:
 * - A,B,C opaque submit identical evidence under leases
 * - D verifier alone closes + writes memory
 * - opaque memory write throws
 * - kill+replace worker recovers lease
 * - hostile disagree fails verify
 * - epoch advance stales open claims
 */
export function runHive0Gauntlet(
  config: Partial<HiveConfig> = {},
): Hive0Result {
  const limits: string[] = [
    "in-process only (no real process boundaries)",
    "leases are cooperative wall-clock, not OS locks",
    "no Compute Socket / EPOCH runtime yet",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const hive = new Hive({ leaseMs: 60_000, ...config });
  hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "C", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
  hive.registerWorker({ id: "H", alive: true, kind: "hostile" });

  const claimId = "claim-three-strangers";
  hive.openClaim(claimId, "answer is 42");

  // 1) three opaque agree
  const payload = { answer: 42 };
  for (const id of ["A", "B", "C"] as const) {
    const r = runOpaqueWorker(hive, id, claimId, payload);
    if (!r.leased || !r.evidenceId) {
      pass = false;
      details[`opaque_${id}`] = r;
    }
  }
  details.evidenceCount = hive.listEvidence(claimId).length;

  // 2) opaque cannot write memory
  let opaqueBan = false;
  try {
    hive.opaqueMemoryWrite("A", claimId);
  } catch {
    opaqueBan = true;
  }
  details.opaqueMemoryBan = opaqueBan;
  if (!opaqueBan) pass = false;

  // 3) verifier alone closes
  const v = runVerifier(hive, "D", claimId, identicalPayloadCheck, "PROVEN");
  details.verify = v;
  if (!v.closed) pass = false;
  if (hive.getMemory().length < 3) {
    pass = false;
    details.memoryShort = true;
  }
  if (hive.getClaim(claimId)?.status !== "PROVEN") pass = false;

  // 4) death + replacement
  const claim2 = "claim-death";
  hive.openClaim(claim2, "survive kill");
  hive.acquireLease(claim2, "A");
  hive.killWorker("A");
  hive.registerWorker({ id: "A2", alive: true, kind: "opaque" });
  const leaseAfter = hive.acquireLease(claim2, "A2");
  details.deathReplace = !!leaseAfter;
  if (!leaseAfter) pass = false;

  // 5) hostile disagree
  const claim3 = "claim-hostile";
  hive.openClaim(claim3, "poison");
  hive.registerWorker({ id: "A", alive: true, kind: "opaque" }); // re-register killed
  for (const [id, p] of [
    ["A", { x: 1 }],
    ["B", { x: 1 }],
    ["H", { x: 999 }],
  ] as const) {
    runOpaqueWorker(hive, id, claim3, p);
  }
  // need third opaque for check structure — C with agree then hostile already poisoned set
  runOpaqueWorker(hive, "C", claim3, { x: 1 });
  const hostile = runVerifier(hive, "D", claim3, identicalPayloadCheck, "PROVEN");
  details.hostileBlocked = !hostile.closed;
  if (hostile.closed) pass = false;

  // 6) stale law / epoch
  const claim4 = "claim-epoch";
  hive.openClaim(claim4, "will stale");
  runOpaqueWorker(hive, "B", claim4, { ok: true });
  hive.advanceEpoch();
  details.staleAfterEpoch = hive.getClaim(claim4)?.status === "STALE";
  if (hive.getClaim(claim4)?.status !== "STALE") pass = false;

  // verifier cannot submit evidence as opaque path
  const claim5 = "claim-verifier-submit";
  hive.openClaim(claim5, "verifier cannot opaque-submit");
  const badLease = hive.acquireLease(claim5, "D");
  const badEv = badLease
    ? hive.submitEvidence(claim5, "D", { sneak: true })
    : null;
  details.verifierCannotSubmit = badEv === null;
  if (badEv !== null) pass = false;

  return { pass, limits, details };
}
