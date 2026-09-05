import type {
  Claim,
  ClaimId,
  Evidence,
  EvidenceId,
  EpochId,
  HiveConfig,
  Lease,
  HiveStateView,
  MemoryRecord,
  VerifyResult,
  Worker,
  WorkerId,
} from "./types.ts";

const DEFAULT: HiveConfig = {
  leaseMs: 5_000,
  now: () => Date.now(),
};

export class Hive {
  readonly config: HiveConfig;
  private claims = new Map<ClaimId, Claim>();
  private evidence = new Map<EvidenceId, Evidence>();
  private leases = new Map<ClaimId, Lease>();
  private workers = new Map<WorkerId, Worker>();
  private memory: MemoryRecord[] = [];
  private epoch: EpochId = 0;
  private evidenceSeq = 0;

  constructor(config: Partial<HiveConfig> = {}) {
    this.config = { ...DEFAULT, ...config };
  }

  getEpoch(): EpochId {
    return this.epoch;
  }

  registerWorker(worker: Worker): void {
    this.workers.set(worker.id, worker);
  }

  getWorker(id: WorkerId): Worker | undefined {
    return this.workers.get(id);
  }

  openClaim(id: ClaimId, statement: string): Claim {
    if (this.claims.has(id)) throw new Error(`claim exists: ${id}`);
    const claim: Claim = {
      id,
      statement,
      status: "OPEN",
      evidenceIds: [],
      epochCreated: this.epoch,
    };
    this.claims.set(id, claim);
    return claim;
  }

  getClaim(id: ClaimId): Claim | undefined {
    return this.claims.get(id);
  }

  listOpenClaims(): Claim[] {
    return [...this.claims.values()].filter((c) => c.status === "OPEN");
  }

  /** Acquire exclusive lease. Expired or dead holder frees the claim. */
  acquireLease(claimId: ClaimId, workerId: WorkerId): Lease | null {
    const claim = this.claims.get(claimId);
    if (!claim || claim.status !== "OPEN") return null;
    const worker = this.workers.get(workerId);
    if (!worker?.alive) return null;

    const now = this.config.now();
    const existing = this.leases.get(claimId);
    if (existing) {
      const holder = this.workers.get(existing.workerId);
      const expired = existing.expiresAt <= now;
      const dead = !holder?.alive;
      if (!expired && !dead && existing.workerId !== workerId) return null;
    }

    const lease: Lease = {
      claimId,
      workerId,
      expiresAt: now + this.config.leaseMs,
    };
    this.leases.set(claimId, lease);
    return lease;
  }

  releaseLease(claimId: ClaimId, workerId: WorkerId): boolean {
    const lease = this.leases.get(claimId);
    if (!lease || lease.workerId !== workerId) return false;
    this.leases.delete(claimId);
    return true;
  }

  getLease(claimId: ClaimId): Lease | undefined {
    return this.leases.get(claimId);
  }

  /** Opaque workers submit evidence; does not prove the claim. */
  submitEvidence(
    claimId: ClaimId,
    workerId: WorkerId,
    payload: unknown,
  ): Evidence | null {
    const claim = this.claims.get(claimId);
    const worker = this.workers.get(workerId);
    if (!claim || claim.status !== "OPEN" || !worker?.alive) return null;
    if (worker.kind === "verifier") return null;

    const lease = this.leases.get(claimId);
    if (!lease || lease.workerId !== workerId) return null;
    if (lease.expiresAt <= this.config.now()) return null;

    const id = `ev-${++this.evidenceSeq}` as EvidenceId;
    const ev: Evidence = {
      id,
      claimId,
      payload,
      createdAt: this.config.now(),
      sourceWorkerId: workerId,
    };
    this.evidence.set(id, ev);
    claim.evidenceIds.push(id);
    return ev;
  }

  getEvidence(id: EvidenceId): Evidence | undefined {
    return this.evidence.get(id);
  }

  listEvidence(claimId: ClaimId): Evidence[] {
    const claim = this.claims.get(claimId);
    if (!claim) return [];
    return claim.evidenceIds
      .map((id) => this.evidence.get(id)!)
      .filter(Boolean);
  }

  /**
   * Only the designated verifier may write memory / close claims.
   * Opaque workers calling this always fail.
   */
  verifyAndClose(
    claimId: ClaimId,
    verifierId: WorkerId,
    decision: "PROVEN" | "DISPROVEN",
    check: (evidence: Evidence[]) => VerifyResult,
  ): { closed: boolean; reason: string } {
    const claim = this.claims.get(claimId);
    const verifier = this.workers.get(verifierId);
    if (!claim || claim.status !== "OPEN") {
      return { closed: false, reason: "claim not open" };
    }
    if (!verifier?.alive || verifier.kind !== "verifier") {
      return { closed: false, reason: "not a live verifier" };
    }

    const evidence = this.listEvidence(claimId);
    const result = check(evidence);
    if (!result.ok) {
      return { closed: false, reason: result.reason };
    }

    for (const ev of evidence) {
      this.memory.push({
        claimId,
        evidenceId: ev.id,
        writtenBy: verifierId,
        at: this.config.now(),
      });
    }

    claim.status = decision;
    claim.epochClosed = this.epoch;
    this.leases.delete(claimId);
    return { closed: true, reason: result.reason };
  }

  /** Opaque worker memory write — always rejected. */
  opaqueMemoryWrite(_workerId: WorkerId, _claimId: ClaimId): never {
    throw new Error("HIVE-0: opaque workers cannot write memory");
  }

  getMemory(): readonly MemoryRecord[] {
    return this.memory;
  }

  killWorker(workerId: WorkerId): void {
    const w = this.workers.get(workerId);
    if (w) w.alive = false;
    for (const [cid, lease] of this.leases) {
      if (lease.workerId === workerId) this.leases.delete(cid);
    }
  }

  /** Advance epoch; open claims become STALE (law changed). */
  advanceEpoch(): EpochId {
    this.epoch += 1;
    for (const claim of this.claims.values()) {
      if (claim.status === "OPEN") {
        claim.status = "STALE";
        this.leases.delete(claim.id);
      }
    }
    return this.epoch;
  }

  markStale(claimId: ClaimId): void {
    const claim = this.claims.get(claimId);
    if (claim && claim.status === "OPEN") {
      claim.status = "STALE";
      this.leases.delete(claimId);
    }
  }
  /**
   * Hive-only orientation for a replacement worker.
   * Never includes predecessor transcripts or private scratch.
   */
  buildStateView(): HiveStateView {
    const known: Claim[] = [];
    const failed: Claim[] = [];
    const open: Claim[] = [];
    for (const c of this.claims.values()) {
      if (c.status === "PROVEN") known.push({ ...c, evidenceIds: [...c.evidenceIds] });
      else if (c.status === "DISPROVEN") failed.push({ ...c, evidenceIds: [...c.evidenceIds] });
      else if (c.status === "OPEN") open.push({ ...c, evidenceIds: [...c.evidenceIds] });
    }
    const evidence = [...this.evidence.values()].map((e) => ({ ...e }));
    const now = this.config.now();
    const claimable: ClaimId[] = [];
    for (const c of open) {
      const lease = this.leases.get(c.id);
      if (!lease) {
        claimable.push(c.id);
        continue;
      }
      const holder = this.workers.get(lease.workerId);
      if (lease.expiresAt <= now || !holder?.alive) claimable.push(c.id);
    }
    return {
      epoch: this.epoch,
      known,
      failed,
      open,
      evidence,
      claimable,
      memory: this.memory.map((m) => ({ ...m })),
      includesTranscript: false,
    };
  }

}
