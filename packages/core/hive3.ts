import { Hive } from "./hive.ts";
import { runOpaqueWorker, runVerifier } from "./workers.ts";
import type { Evidence, HiveConfig, VerifyResult } from "./types.ts";

export interface Hive3Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

function payloadCheck(expected: unknown): (evidence: Evidence[]) => VerifyResult {
  return (evidence) => {
    if (evidence.length < 1) return { ok: false, reason: "no evidence" };
    const ok = evidence.every(
      (e) => JSON.stringify(e.payload) === JSON.stringify(expected),
    );
    return ok
      ? { ok: true, reason: "payload match" }
      : { ok: false, reason: "payload mismatch" };
  };
}

/**
 * HIVE-3 — Contradiction
 *
 * A: library X is safe. B: library X crashes on ARM.
 * Hive must not arbitrarily select one. Represent both claims, a contradiction
 * edge, supporting evidence, and verification state. Verified ARM reproduction
 * may narrow/resolve.
 */
export function runHive3Gauntlet(
  config: Partial<HiveConfig> = {},
): Hive3Result {
  const limits: string[] = [
    "in-process only",
    "contradiction graph is explicit edges, not automated logic programming",
    "narrowing requires a separately PROVEN claim (ARM reproduction stand-in)",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const hive = new Hive({ leaseMs: 60_000, ...config });
  hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "C", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });

  // Conflicting claims — both OPEN with evidence; neither auto-won
  hive.openClaim("claim-safe", "library X is safe");
  hive.openClaim("claim-arm-crash", "library X crashes on ARM");

  runOpaqueWorker(hive, "A", "claim-safe", {
    subject: "library X",
    assertion: "safe",
    platform: "generic",
  });
  runOpaqueWorker(hive, "B", "claim-arm-crash", {
    subject: "library X",
    assertion: "crashes",
    platform: "ARM",
  });

  const evSafe = hive.listEvidence("claim-safe").map((e) => e.id);
  const evArm = hive.listEvidence("claim-arm-crash").map((e) => e.id);
  const edge = hive.declareContradiction(
    "claim-safe",
    "claim-arm-crash",
    [...evSafe, ...evArm],
    "safe vs ARM crash",
  );
  details.edge = edge;

  // Both still open — no arbitrary selection
  details.bothOpen =
    hive.getClaim("claim-safe")?.status === "OPEN" &&
    hive.getClaim("claim-arm-crash")?.status === "OPEN";
  if (!details.bothOpen) pass = false;

  details.edgeOpen = edge.status === "OPEN";
  if (!details.edgeOpen) pass = false;

  const graph = hive.listContradictions();
  details.graphSize = graph.length;
  if (graph.length !== 1) pass = false;

  // Arbitrary pick must throw
  let arbitraryBlocked = false;
  try {
    hive.arbitraryPickContradiction(edge.id, "claim-safe");
  } catch {
    arbitraryBlocked = true;
  }
  details.arbitraryBlocked = arbitraryBlocked;
  if (!arbitraryBlocked) pass = false;

  // Narrowing without PROVEN claim must fail
  const early = hive.narrowContradiction(
    edge.id,
    "claim-arm-repro",
    "claim-arm-crash",
    "claim-safe",
  );
  details.earlyNarrowBlocked = !early.ok;
  if (early.ok) pass = false;

  // Eventually: verified ARM reproduction
  hive.openClaim("claim-arm-repro", "verified ARM reproduction of crash");
  runOpaqueWorker(hive, "C", "claim-arm-repro", {
    subject: "library X",
    assertion: "crashes",
    platform: "ARM",
    reproduction: true,
  });
  const reproClose = runVerifier(
    hive,
    "D",
    "claim-arm-repro",
    payloadCheck({
      subject: "library X",
      assertion: "crashes",
      platform: "ARM",
      reproduction: true,
    }),
    "PROVEN",
  );
  details.reproClose = reproClose;
  if (!reproClose.closed) pass = false;

  const narrowed = hive.narrowContradiction(
    edge.id,
    "claim-arm-repro",
    "claim-arm-crash",
    "claim-safe",
  );
  details.narrowed = narrowed;
  if (!narrowed.ok) pass = false;

  const after = hive.getContradiction(edge.id);
  details.afterEdge = after;
  details.safeStatus = hive.getClaim("claim-safe")?.status;
  details.crashStatus = hive.getClaim("claim-arm-crash")?.status;
  details.reproStatus = hive.getClaim("claim-arm-repro")?.status;

  if (after?.status !== "NARROWED") pass = false;
  if (details.safeStatus !== "DISPROVEN") pass = false;
  if (details.crashStatus !== "PROVEN") pass = false;
  if (details.reproStatus !== "PROVEN") pass = false;

  // Representation check: both claims still exist with verification state
  details.bothStillRepresented =
    !!hive.getClaim("claim-safe") && !!hive.getClaim("claim-arm-crash");
  if (!details.bothStillRepresented) pass = false;

  return { pass, limits, details };
}
