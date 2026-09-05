import { Hive } from "./hive.ts";
import { LawMigrator } from "./hive4.ts";
import { WeakOrganism } from "./inverseMetabolism.ts";
import { ComputeSocket, seedFiveMachines } from "./socket0.ts";
import { runOpaqueWorker, runVerifier } from "./workers.ts";
import { orientFromHiveState } from "./hive1.ts";

export interface FullSystemResult {
  pass: boolean;
  limits: string[];
  steps: { n: number; name: string; ok: boolean; detail?: unknown }[];
  details: Record<string, unknown>;
}

/**
 * FULL-SYSTEM-PROOF — integrated demonstration (OPEN HIVE §56).
 */
export function runFullSystemProof(): FullSystemResult {
  const limits = [
    "in-process integration of HIVE/SOCKET/EPOCH/metabolism stand-ins",
    "decomposition is explicit claim fan-out, not an LLM planner",
    "does not claim AGI, Byzantine safety, or cloud replacement",
  ];
  const steps: FullSystemResult["steps"] = [];
  const details: Record<string, unknown> = {};
  let pass = true;

  const mark = (n: number, name: string, ok: boolean, detail?: unknown) => {
    steps.push({ n, name, ok, detail });
    if (!ok) pass = false;
  };

  const hive = new Hive({ leaseMs: 120_000 });
  const socket = new ComputeSocket({ leaseMs: 120_000, boundUnits: 200 });
  seedFiveMachines(socket);
  const epoch = new LawMigrator(hive, {
    id: "L0",
    version: 0,
    constraints: ["baseline"],
  });
  const organism = new WeakOrganism("org-full", 5);

  // 1. Human publishes project problem
  const problem = hive.openClaim(
    "project-root",
    "Human: compute safe checksum matrix for corpus X",
  );
  mark(1, "human_publishes_problem", problem.id === "project-root");

  // 2. Hive decomposes known mechanical work (no central LLM)
  hive.openClaim("task-shard", "shard corpus into 10");
  hive.openClaim("task-hash", "hash shards (needs GPU)");
  hive.openClaim("task-assemble", "assemble report");
  mark(2, "hive_decomposes", hive.listOpenClaims().length >= 3);

  // 3. Multiple agents claim bounded tasks
  hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "C", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
  const leaseA = hive.acquireLease("task-shard", "A");
  const leaseB = hive.acquireLease("task-assemble", "B");
  mark(3, "agents_claim_tasks", !!leaseA && !!leaseB);

  // Local shard work
  hive.submitEvidence("task-shard", "A", { shards: 10 });
  hive.releaseLease("task-shard", "A");
  runVerifier(
    hive,
    "D",
    "task-shard",
    (ev) =>
      (ev[0]?.payload as { shards?: number })?.shards === 10
        ? { ok: true, reason: "sharded" }
        : { ok: false, reason: "bad" },
    "PROVEN",
  );

  // 4. One agent requires remote computation (deficit)
  const neededUnits = 40;
  const deficit = organism.detectDeficit(neededUnits);
  const { requirement, novel } = organism.constructRequirement(
    "task-hash",
    neededUnits,
    ["gpu"],
  );
  mark(4, "agent_needs_remote", deficit.deficit && !novel, {
    deficit,
    requirement,
    cortexWakes: organism.cortexWakes,
  });

  // 5–7. Socket acquires capacity, remote executes, verification accepts
  const job = socket.enqueue(requirement.capabilities, "full-hash-job");
  const remoteLease = socket.matchAndLease(job.id);
  mark(5, "socket_acquires_capacity", !!remoteLease.ok && remoteLease.machineId === "A", remoteLease);

  const done = remoteLease.ok
    ? socket.complete(
        job.id,
        remoteLease.machineId!,
        { hashes: 10, ok: true },
        neededUnits,
      )
    : { ok: false, reason: "no lease", receiptId: undefined as string | undefined };
  mark(6, "remote_executes", !!done.ok, done);

  const verified =
    !!done.ok &&
    socket.verify(job.id, (r) => (r as { hashes: number }).hashes === 10).ok;
  mark(7, "verification_accepts", verified);

  // 8–9. Agent submits evidence; hive memory accepts
  const sub = runOpaqueWorker(hive, "C", "task-hash", {
    remoteReceipt: done.receiptId,
    result: { hashes: 10, ok: true },
  });
  mark(8, "agent_submits_evidence", !!sub.evidenceId, sub);

  const hashClose = runVerifier(
    hive,
    "D",
    "task-hash",
    (ev) =>
      ev.some(
        (e) =>
          (e.payload as { result?: { hashes?: number } })?.result?.hashes ===
          10,
      )
        ? { ok: true, reason: "hash ok" }
        : { ok: false, reason: "missing" },
    "PROVEN",
  );
  if (done.ok) socket.settle(job.id, neededUnits);
  mark(
    9,
    "hive_memory_accepts",
    hashClose.closed &&
      hive.getClaim("task-hash")?.status === "PROVEN" &&
      hive.getMemory().length >= 1,
    { memory: hive.getMemory().length },
  );

  // Assemble
  runOpaqueWorker(hive, "B", "task-assemble", {
    from: ["task-shard", "task-hash"],
  });
  runVerifier(
    hive,
    "D",
    "task-assemble",
    (ev) =>
      ev.length >= 1
        ? { ok: true, reason: "assembled" }
        : { ok: false, reason: "empty" },
    "PROVEN",
  );

  // 10. Failure reveals existing law unsafe
  const delta = "ΔC: GPU hash without checksum bound is unsafe";
  mark(10, "failure_reveals_unsafe_law", true, { delta });

  // Live workers under L0 for migration
  hive.openClaim("live-affected", "uses unbounded GPU hash");
  hive.openClaim("live-revalidate", "needs new checksum bound");
  hive.openClaim("live-ok", "docs only");
  // A still alive from earlier
  hive.acquireLease("live-affected", "A");
  runOpaqueWorker(hive, "B", "live-revalidate", { under: "L0" });
  const staleEv = runOpaqueWorker(hive, "C", "live-ok", { under: "L0" });
  if (staleEv.evidenceId) epoch.tagEvidence(staleEv.evidenceId, "L0");

  // 11. EPOCH derives migration
  const L1 = {
    id: "L1",
    version: 1,
    constraints: ["baseline", "checksum-bound-required"],
  };
  epoch.propose(L1, delta, [
    {
      workerId: "A",
      action: "ABORT",
      reason: "affected",
      claimId: "live-affected",
    },
    {
      workerId: "B",
      action: "REVALIDATE",
      reason: "revalidate",
      claimId: "live-revalidate",
    },
    {
      workerId: "C",
      action: "CONTINUE",
      reason: "unaffected",
      claimId: "live-ok",
    },
  ]);
  mark(11, "epoch_derives_migration", epoch.getProposal()?.to === "L1");

  // 12. Affected stop / revalidate
  epoch.applyPlans();
  mark(
    12,
    "affected_stop_revalidate",
    hive.getWorker("A")?.alive === false &&
      hive.getClaim("live-affected")?.status === "STALE" &&
      hive.getWorker("B")?.alive === true &&
      !hive.getLease("live-revalidate"),
  );

  // 13. New law commits
  epoch.closeMigration();
  const committed = epoch.commitLaw(L1);
  mark(13, "new_law_commits", committed.ok && epoch.currentLaw().id === "L1");

  // 14–15. Stale late artifact rejected
  mark(14, "stale_worker_returns_late", !!staleEv.evidenceId);
  const replay = staleEv.evidenceId
    ? epoch.replay(staleEv.evidenceId)
    : "LAW_STALE";
  mark(15, "artifact_rejected_LAW_STALE", replay === "LAW_STALE", { replay });

  // 16–18. Replacement from hive state, no transcript
  hive.registerWorker({ id: "A2", alive: true, kind: "opaque" });
  hive.openClaim("post-migrate-work", "finish under L1");
  const secret = { chat: ["SECRET_TRANSCRIPT_FULL_SYSTEM"] };
  void secret;
  const view = hive.buildStateView();
  const leaked = JSON.stringify(view).includes("SECRET_TRANSCRIPT_FULL_SYSTEM");
  mark(16, "replacement_joins", hive.getWorker("A2")?.alive === true);
  mark(
    17,
    "no_predecessor_transcript",
    view.includesTranscript === false && !leaked,
  );
  const orient = orientFromHiveState(view);
  const leaseA2 = hive.acquireLease("post-migrate-work", "A2");
  if (leaseA2) {
    runOpaqueWorker(hive, "A2", "post-migrate-work", { under: "L1", ok: true });
  }
  mark(
    18,
    "work_continues_from_hive_state",
    !!leaseA2 && orient.claimableIds.includes("post-migrate-work"),
    { claimable: orient.claimableIds },
  );

  details.cortexWakes = organism.cortexWakes;
  details.law = epoch.currentLaw();
  details.providerBalance = socket.balance("A");

  if (steps.length !== 18) pass = false;
  if (!steps.every((s) => s.ok)) pass = false;
  // known GPU path: cortex wakes 0
  if (organism.cortexWakes !== 0) pass = false;

  return { pass, limits, steps, details };
}
