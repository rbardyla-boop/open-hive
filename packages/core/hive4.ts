import { Hive } from "./hive.ts";
import { runOpaqueWorker } from "./workers.ts";
import type { ClaimId, Evidence, HiveConfig, WorkerId } from "./types.ts";

export type LawId = string;
export type MigrationAction = "ABORT" | "REVALIDATE" | "CONTINUE";
export type ReplayVerdict = "ACCEPT" | "LAW_STALE";

export interface LawRoot {
  id: LawId;
  version: number;
  constraints: string[];
}

export interface WorkerMigrationPlan {
  workerId: WorkerId;
  action: MigrationAction;
  reason: string;
  claimId?: ClaimId;
}

export interface MigrationProposal {
  from: LawId;
  to: LawId;
  delta: string;
  plans: WorkerMigrationPlan[];
  closed: boolean;
  committed: boolean;
}

export interface Hive4Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

/**
 * EPOCH-lite law migration controller.
 * Migration closure is required before L1 commit.
 * Evidence produced under a prior law replays as LAW_STALE after commit.
 */
export class LawMigrator {
  private law: LawRoot;
  private proposal: MigrationProposal | null = null;
  /** Evidence ids (or payloads) tagged with the law version that produced them. */
  private evidenceLaw = new Map<string, LawId>();

  readonly hive: Hive;

  constructor(
    hive: Hive,
    initial: LawRoot = { id: "L0", version: 0, constraints: ["baseline"] },
  ) {
    this.hive = hive;
    this.law = { ...initial, constraints: [...initial.constraints] };
  }

  currentLaw(): LawRoot {
    return {
      id: this.law.id,
      version: this.law.version,
      constraints: [...this.law.constraints],
    };
  }

  tagEvidence(evidenceId: string, lawId: LawId = this.law.id): void {
    this.evidenceLaw.set(evidenceId, lawId);
  }

  getProposal(): MigrationProposal | null {
    return this.proposal
      ? {
          ...this.proposal,
          plans: this.proposal.plans.map((p) => ({ ...p })),
        }
      : null;
  }

  /**
   * EPOCH proposes L1 after ΔC. Does not commit.
   * Classify each active worker: ABORT | REVALIDATE | CONTINUE.
   */
  propose(
    next: LawRoot,
    delta: string,
    plans: WorkerMigrationPlan[],
  ): MigrationProposal {
    if (this.proposal && !this.proposal.committed) {
      throw new Error("migration already in flight");
    }
    this.proposal = {
      from: this.law.id,
      to: next.id,
      delta,
      plans: plans.map((p) => ({ ...p })),
      closed: false,
      committed: false,
    };
    return this.getProposal()!;
  }

  /** Apply ABORT / REVALIDATE / CONTINUE effects on the hive. */
  applyPlans(): { applied: WorkerMigrationPlan[]; errors: string[] } {
    if (!this.proposal) throw new Error("no proposal");
    const applied: WorkerMigrationPlan[] = [];
    const errors: string[] = [];
    for (const plan of this.proposal.plans) {
      const worker = this.hive.getWorker(plan.workerId);
      if (!worker?.alive && plan.action !== "ABORT") {
        errors.push(`${plan.workerId} not alive`);
        continue;
      }
      if (plan.action === "ABORT") {
        if (plan.claimId) {
          this.hive.releaseLease(plan.claimId, plan.workerId);
          this.hive.markStale(plan.claimId);
        }
        this.hive.killWorker(plan.workerId);
        applied.push(plan);
      } else if (plan.action === "REVALIDATE") {
        if (plan.claimId) {
          this.hive.releaseLease(plan.claimId, plan.workerId);
          // claim stays OPEN for re-work under new law after commit
        }
        applied.push(plan);
      } else if (plan.action === "CONTINUE") {
        // lease may remain; work is unaffected by ΔC
        applied.push(plan);
      }
    }
    return { applied, errors };
  }

  closeMigration(): void {
    if (!this.proposal) throw new Error("no proposal");
    if (this.proposal.committed) throw new Error("already committed");
    this.proposal.closed = true;
  }

  /**
   * Commit L1 only after migration closure.
   * Advances hive epoch (open claims → STALE) as law boundary.
   */
  commitLaw(next: LawRoot): { ok: boolean; reason: string } {
    if (!this.proposal) return { ok: false, reason: "no proposal" };
    if (!this.proposal.closed) {
      return { ok: false, reason: "migration closure required before L1 commit" };
    }
    if (this.proposal.to !== next.id) {
      return { ok: false, reason: "commit law id mismatch" };
    }
    this.hive.advanceEpoch();
    this.law = {
      id: next.id,
      version: next.version,
      constraints: [...next.constraints],
    };
    this.proposal.committed = true;
    return { ok: true, reason: `committed ${next.id}` };
  }

  /** Replay output produced under a prior law. */
  replay(evidenceId: string): ReplayVerdict {
    const producedUnder = this.evidenceLaw.get(evidenceId);
    if (!producedUnder) return "LAW_STALE";
    if (producedUnder !== this.law.id) return "LAW_STALE";
    return "ACCEPT";
  }

  replayPayload(producedUnderLaw: LawId): ReplayVerdict {
    return producedUnderLaw === this.law.id ? "ACCEPT" : "LAW_STALE";
  }
}

/**
 * HIVE-4 — Law Migration
 *
 * Three agents under L0. Failure introduces ΔC. EPOCH proposes L1.
 * affected → ABORT, revalidatable → REVALIDATE, unaffected → CONTINUE.
 * Migration closure required before L1 commit. Stale replay → LAW_STALE.
 */
export function runHive4Gauntlet(
  config: Partial<HiveConfig> = {},
): Hive4Result {
  const limits: string[] = [
    "in-process EPOCH-lite (not a full EPOCH runtime)",
    "worker classification is supplied by the proposal, not inferred by a solver",
    "advanceEpoch marks OPEN claims STALE at law commit (coarse boundary)",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const hive = new Hive({ leaseMs: 60_000, ...config });
  hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "C", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });

  const epoch = new LawMigrator(hive, {
    id: "L0",
    version: 0,
    constraints: ["baseline"],
  });

  // Three agents working under L0
  hive.openClaim("work-affected", "uses removed API");
  hive.openClaim("work-revalidate", "needs new checks");
  hive.openClaim("work-ok", "untouched path");

  const aLease = hive.acquireLease("work-affected", "A");
  const bEv = runOpaqueWorker(hive, "B", "work-revalidate", {
    under: "L0",
    partial: true,
  });
  const cEv = runOpaqueWorker(hive, "C", "work-ok", { under: "L0", ok: true });
  details.leases = { A: !!aLease, B: !!bEv.evidenceId, C: !!cEv.evidenceId };
  if (!aLease || !bEv.evidenceId || !cEv.evidenceId) pass = false;

  epoch.tagEvidence(bEv.evidenceId!, "L0");
  epoch.tagEvidence(cEv.evidenceId!, "L0");
  // A submitted nothing yet but holds lease — still under L0
  const staleOutputId = cEv.evidenceId!;

  // Real failure introduces ΔC; EPOCH proposes L1
  const L1: LawRoot = {
    id: "L1",
    version: 1,
    constraints: ["baseline", "no-removed-API"],
  };
  const proposal = epoch.propose(L1, "ΔC: removed API banned after failure", [
    {
      workerId: "A",
      action: "ABORT",
      reason: "work uses removed API",
      claimId: "work-affected",
    },
    {
      workerId: "B",
      action: "REVALIDATE",
      reason: "partial L0 evidence must be re-checked",
      claimId: "work-revalidate",
    },
    {
      workerId: "C",
      action: "CONTINUE",
      reason: "unaffected path",
      claimId: "work-ok",
    },
  ]);
  details.proposal = {
    from: proposal.from,
    to: proposal.to,
    delta: proposal.delta,
    actions: proposal.plans.map((p) => p.action),
  };

  const applied = epoch.applyPlans();
  details.applied = applied.applied.map((p) => ({
    workerId: p.workerId,
    action: p.action,
  }));
  details.applyErrors = applied.errors;
  if (applied.errors.length) pass = false;

  // A aborted
  details.A_dead = hive.getWorker("A")?.alive === false;
  details.affectedStale = hive.getClaim("work-affected")?.status === "STALE";
  if (!details.A_dead || !details.affectedStale) pass = false;

  // B revalidate: claim still OPEN, lease cleared
  details.B_alive = hive.getWorker("B")?.alive === true;
  details.revalidateOpen = hive.getClaim("work-revalidate")?.status === "OPEN";
  details.B_noLease = !hive.getLease("work-revalidate");
  if (!details.B_alive || !details.revalidateOpen || !details.B_noLease) {
    pass = false;
  }

  // C continue: still alive (claim may still be OPEN until commit)
  details.C_alive = hive.getWorker("C")?.alive === true;
  if (!details.C_alive) pass = false;

  // Commit before closure must fail
  const early = epoch.commitLaw(L1);
  details.earlyCommitBlocked = !early.ok;
  if (early.ok) pass = false;

  epoch.closeMigration();
  const committed = epoch.commitLaw(L1);
  details.commit = committed;
  if (!committed.ok) pass = false;
  details.law = epoch.currentLaw();
  if (epoch.currentLaw().id !== "L1") pass = false;

  // After commit, open claims from L0 era are STALE via advanceEpoch
  details.revalidateAfterCommit = hive.getClaim("work-revalidate")?.status;
  details.okAfterCommit = hive.getClaim("work-ok")?.status;
  if (details.revalidateAfterCommit !== "STALE") pass = false;
  if (details.okAfterCommit !== "STALE") pass = false;

  // Replay stale L0 output
  const replay = epoch.replay(staleOutputId);
  details.replay = replay;
  if (replay !== "LAW_STALE") pass = false;

  // Fresh L1 evidence would ACCEPT
  details.freshReplay = epoch.replayPayload("L1");
  if (details.freshReplay !== "ACCEPT") pass = false;

  return { pass, limits, details };
}
