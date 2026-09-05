import type { HiveConfig } from "./types.ts";

export type MachineId = string;
export type JobId = string;
export type ReceiptId = string;
export type Capability = string;

export type JobStatus =
  | "QUEUED"
  | "LEASED"
  | "DONE"
  | "FAILED"
  | "SETTLED";

export interface Machine {
  id: MachineId;
  label: string;
  alive: boolean;
  capabilities: Capability[];
}

export interface Job {
  id: JobId;
  requires: Capability[];
  status: JobStatus;
  leaseMachineId?: MachineId;
  leaseExpiresAt?: number;
  result?: unknown;
  receiptId?: ReceiptId;
  settledCredit?: number;
  workUnits?: number;
  /** Frozen at lease time — provider cannot rewrite. */
  requiresFrozen?: boolean;
}

export interface Socket0Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

export interface ComputeSocketConfig {
  leaseMs: number;
  now: () => number;
  /** Max simulated work units per lease (bounded execution). */
  boundUnits: number;
}

const DEFAULT: ComputeSocketConfig = {
  leaseMs: 60_000,
  now: () => Date.now(),
  boundUnits: 100,
};

/**
 * SOCKET-0 — five mismatched machines, one scheduler, one verifier, one queue.
 * In-process stand-in for a compute pool. Death must auto-reassign.
 */
export class ComputeSocket {
  private machines = new Map<MachineId, Machine>();
  private jobs = new Map<JobId, Job>();
  private receipts = new Set<ReceiptId>();
  private settledReceipts = new Set<ReceiptId>();
  private balances = new Map<MachineId, number>();
  private config: ComputeSocketConfig;
  private jobSeq = 0;
  private receiptSeq = 0;

  constructor(config: Partial<ComputeSocketConfig> = {}) {
    this.config = { ...DEFAULT, ...config };
  }

  /** worker discovery */
  discover(): Machine[] {
    return [...this.machines.values()].map((m) => ({
      ...m,
      capabilities: [...m.capabilities],
    }));
  }

  registerMachine(
    id: MachineId,
    label: string,
    capabilities: Capability[],
  ): Machine {
    const m: Machine = {
      id,
      label,
      alive: true,
      capabilities: [...capabilities],
    };
    this.machines.set(id, m);
    this.balances.set(id, 0);
    return this.discover().find((x) => x.id === id)!;
  }

  /** capability advertisement */
  advertise(machineId: MachineId, capabilities: Capability[]): boolean {
    const m = this.machines.get(machineId);
    if (!m?.alive) return false;
    m.capabilities = [...new Set(capabilities)];
    return true;
  }

  enqueue(requires: Capability[], id?: JobId): Job {
    const jobId = (id ?? `job-${++this.jobSeq}`) as JobId;
    const job: Job = {
      id: jobId,
      requires: [...requires],
      status: "QUEUED",
    };
    this.jobs.set(jobId, job);
    return { ...job, requires: [...job.requires] };
  }

  getJob(id: JobId): Job | undefined {
    const j = this.jobs.get(id);
    return j ? { ...j, requires: [...j.requires] } : undefined;
  }

  listQueue(): Job[] {
    return [...this.jobs.values()]
      .filter((j) => j.status === "QUEUED" || j.status === "LEASED")
      .map((j) => ({ ...j, requires: [...j.requires] }));
  }

  /** capability matching + lease creation */
  matchAndLease(jobId: JobId): { ok: boolean; machineId?: MachineId; reason: string } {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, reason: "no job" };
    if (job.status !== "QUEUED") return { ok: false, reason: "not queued" };

    const now = this.config.now();
    const match = [...this.machines.values()].find((m) => {
      if (!m.alive) return false;
      return job.requires.every((r) => m.capabilities.includes(r));
    });
    if (!match) return { ok: false, reason: "no capable machine" };

    job.status = "LEASED";
    job.leaseMachineId = match.id;
    job.leaseExpiresAt = now + this.config.leaseMs;
    job.requiresFrozen = true;
    return { ok: true, machineId: match.id, reason: "leased" };
  }

  /**
   * Bounded execution: reject work over boundUnits.
   * Returns a receipt id on success.
   */
  complete(
    jobId: JobId,
    machineId: MachineId,
    result: unknown,
    workUnits: number,
  ): { ok: boolean; receiptId?: ReceiptId; reason: string } {
    const job = this.jobs.get(jobId);
    const machine = this.machines.get(machineId);
    if (!job || job.status !== "LEASED") {
      return { ok: false, reason: "job not leased" };
    }
    if (job.leaseMachineId !== machineId) {
      return { ok: false, reason: "wrong machine" };
    }
    if (!machine?.alive) return { ok: false, reason: "machine dead" };
    if (workUnits > this.config.boundUnits) {
      job.status = "FAILED";
      return { ok: false, reason: "exceeded bound" };
    }
    const now = this.config.now();
    if (job.leaseExpiresAt && job.leaseExpiresAt <= now) {
      return { ok: false, reason: "lease expired" };
    }

    const receiptId = `rcpt-${++this.receiptSeq}` as ReceiptId;
    // duplicate suppression: same receipt cannot be registered twice
    if (this.receipts.has(receiptId)) {
      return { ok: false, reason: "duplicate receipt" };
    }
    this.receipts.add(receiptId);
    job.result = result;
    job.receiptId = receiptId;
    job.workUnits = workUnits;
    job.status = "DONE";
    return { ok: true, receiptId, reason: "completed" };
  }

  /** result verification (deterministic check) */
  verify(
    jobId: JobId,
    check: (result: unknown) => boolean,
  ): { ok: boolean; reason: string } {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "DONE") {
      return { ok: false, reason: "not done" };
    }
    if (!check(job.result)) {
      job.status = "FAILED";
      return { ok: false, reason: "verify failed" };
    }
    return { ok: true, reason: "verified" };
  }

  /** settlement + duplicate settlement rejection */
  settle(jobId: JobId, credit = 1): { ok: boolean; reason: string } {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "DONE") {
      return { ok: false, reason: "not done" };
    }
    if (!job.receiptId) return { ok: false, reason: "no receipt" };
    if (this.settledReceipts.has(job.receiptId)) {
      return { ok: false, reason: "duplicate settlement" };
    }
    if (!job.leaseMachineId) return { ok: false, reason: "no machine" };
    const maxCredit = job.workUnits ?? 0;
    if (credit > maxCredit) {
      return { ok: false, reason: "excess credit" };
    }
    this.settledReceipts.add(job.receiptId);
    const bal = this.balances.get(job.leaseMachineId) ?? 0;
    this.balances.set(job.leaseMachineId, bal + credit);
    job.settledCredit = credit;
    job.status = "SETTLED";
    return { ok: true, reason: "settled" };
  }

  balance(machineId: MachineId): number {
    return this.balances.get(machineId) ?? 0;
  }

  /**
   * Reciprocal consume: debit accepted units from a machine's balance.
   * Fails on insufficient balance (no overdraft).
   */
  consume(
    machineId: MachineId,
    units: number,
  ): { ok: boolean; balance: number; reason: string } {
    if (units <= 0) {
      return {
        ok: false,
        balance: this.balances.get(machineId) ?? 0,
        reason: "units must be positive",
      };
    }
    const bal = this.balances.get(machineId) ?? 0;
    if (bal < units) {
      return { ok: false, balance: bal, reason: "insufficient balance" };
    }
    const next = bal - units;
    this.balances.set(machineId, next);
    return { ok: true, balance: next, reason: "consumed" };
  }



  /** replay resistance */
  replay(receiptId: ReceiptId): { ok: boolean; reason: string } {
    if (this.settledReceipts.has(receiptId)) {
      return { ok: false, reason: "replay rejected" };
    }
    if (!this.receipts.has(receiptId)) {
      return { ok: false, reason: "unknown receipt" };
    }
    return { ok: false, reason: "replay rejected" };
  }


  /** Hostile provider attempt: rewrite job metadata after lease. Always rejected once frozen. */
  mutateJobRequires(
    jobId: JobId,
    newRequires: Capability[],
  ): { ok: boolean; reason: string } {
    const job = this.jobs.get(jobId);
    if (!job) return { ok: false, reason: "no job" };
    if (job.requiresFrozen || job.status === "LEASED" || job.status === "DONE" || job.status === "SETTLED") {
      return { ok: false, reason: "metadata immutable" };
    }
    job.requires = [...newRequires];
    return { ok: true, reason: "updated" };
  }

  /** Ledger snapshot for consistency checks. */
  ledgerSnapshot(): { balances: Record<string, number>; settled: string[] } {
    return {
      balances: Object.fromEntries(this.balances),
      settled: [...this.settledReceipts],
    };
  }

  killMachine(machineId: MachineId): { reassigned: JobId[] } {
    const m = this.machines.get(machineId);
    if (m) m.alive = false;
    return { reassigned: this.reassignDeadLeases() };
  }

  /**
   * Automatic reassignment on death — no human recovery.
   * LEASED jobs whose machine is dead return to QUEUED.
   */
  reassignDeadLeases(): JobId[] {
    const out: JobId[] = [];
    for (const job of this.jobs.values()) {
      if (job.status !== "LEASED" || !job.leaseMachineId) continue;
      const holder = this.machines.get(job.leaseMachineId);
      if (holder?.alive) continue;
      job.status = "QUEUED";
      job.leaseMachineId = undefined;
      job.leaseExpiresAt = undefined;
      out.push(job.id);
    }
    return out;
  }
}

/** Five deliberately mismatched machines. */
export function seedFiveMachines(socket: ComputeSocket): void {
  socket.registerMachine("A", "gaming-pc-nvidia", ["cpu", "gpu", "unix"]);
  socket.registerMachine("B", "old-linux-desktop", ["cpu", "unix"]);
  socket.registerMachine("C", "mac", ["cpu", "macos"]);
  socket.registerMachine("D", "small-server", ["cpu", "unix", "server"]);
  socket.registerMachine("E", "low-power-edge", ["cpu", "lowpower", "edge"]);
}

/**
 * SOCKET-0 gauntlet — success conditions from the OPEN HIVE build spec.
 * Pass only if worker death does not require human recovery.
 */
export function runSocket0Gauntlet(
  config: Partial<ComputeSocketConfig> = {},
): Socket0Result {
  const limits: string[] = [
    "in-process logical machines (not five real hosts)",
    "scheduler/verifier/queue are one ComputeSocket object",
    "embarrassingly parallel stand-in jobs only (no distributed training)",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const socket = new ComputeSocket({ leaseMs: 60_000, boundUnits: 50, ...config });
  seedFiveMachines(socket);

  // discovery + advertisement
  const found = socket.discover();
  details.discovered = found.length;
  if (found.length !== 5) pass = false;
  details.advertised = socket.advertise("E", ["cpu", "lowpower", "edge", "sensor"]);
  if (!details.advertised) pass = false;
  if (!socket.discover().find((m) => m.id === "E")?.capabilities.includes("sensor")) {
    pass = false;
  }

  // capability matching: GPU job → A
  const gpuJob = socket.enqueue(["gpu", "cpu"], "job-gpu");
  const cpuJob = socket.enqueue(["cpu", "unix"], "job-cpu");
  const edgeJob = socket.enqueue(["edge"], "job-edge");

  const gpuLease = socket.matchAndLease(gpuJob.id);
  details.gpuLease = gpuLease;
  if (!gpuLease.ok || gpuLease.machineId !== "A") pass = false;

  const edgeLease = socket.matchAndLease(edgeJob.id);
  details.edgeLease = edgeLease;
  if (!edgeLease.ok || edgeLease.machineId !== "E") pass = false;

  // bounded execution
  const over = socket.complete(gpuJob.id, "A", { ok: true }, 999);
  details.boundRejected = !over.ok;
  if (over.ok) pass = false;
  // re-queue gpu after failure? status FAILED — enqueue fresh for happy path later
  const gpu2 = socket.enqueue(["gpu", "cpu"], "job-gpu-2");
  const gpu2Lease = socket.matchAndLease(gpu2.id);
  if (!gpu2Lease.ok || gpu2Lease.machineId !== "A") pass = false;
  const gpuDone = socket.complete(gpu2.id, "A", { shards: 10 }, 10);
  details.gpuDone = gpuDone;
  if (!gpuDone.ok) pass = false;
  const gpuVerify = socket.verify(gpu2.id, (r) => (r as { shards: number }).shards === 10);
  if (!gpuVerify.ok) pass = false;
  const gpuSettle = socket.settle(gpu2.id, 10);
  details.gpuSettle = gpuSettle;
  if (!gpuSettle.ok) pass = false;
  details.A_balance = socket.balance("A");
  if (details.A_balance !== 10) pass = false;

  // duplicate settlement
  const dupSettle = socket.settle(gpu2.id, 10);
  details.dupSettleRejected = !dupSettle.ok;
  if (dupSettle.ok) pass = false;

  // replay resistance
  const replay = socket.replay(gpuDone.receiptId!);
  details.replayRejected = !replay.ok && replay.reason.includes("replay");
  if (!details.replayRejected) pass = false;

  // worker death + automatic reassignment (no human)
  const cpuLease = socket.matchAndLease(cpuJob.id);
  details.cpuLease = cpuLease;
  // Prefer B (old linux) — first matching alive with cpu+unix among B,D (A busy/done)
  // match picks first in map order: A has cpu+unix but also gpu — still matches cpu+unix!
  // So cpu may lease to A. Kill whoever holds it and reassign.
  if (!cpuLease.ok || !cpuLease.machineId) {
    pass = false;
  } else {
    const holder = cpuLease.machineId;
    const { reassigned } = socket.killMachine(holder);
    details.killed = holder;
    details.reassigned = reassigned;
    if (!reassigned.includes(cpuJob.id)) pass = false;
    // human-free: match again to another capable machine
    const again = socket.matchAndLease(cpuJob.id);
    details.reLease = again;
    if (!again.ok || again.machineId === holder) pass = false;
    const fin = socket.complete(cpuJob.id, again.machineId!, { fuzz: 100 }, 5);
    details.cpuCompleteAfterDeath = fin;
    if (!fin.ok) pass = false;
    const v = socket.verify(cpuJob.id, (r) => (r as { fuzz: number }).fuzz === 100);
    if (!v.ok) pass = false;
    const s = socket.settle(cpuJob.id, 5);
    if (!s.ok) pass = false;
  }

  // edge path completes
  const edgeDone = socket.complete(edgeJob.id, "E", { samples: 3 }, 3);
  if (!edgeDone.ok) pass = false;
  else {
    socket.verify(edgeJob.id, () => true);
    socket.settle(edgeJob.id, 3);
  }

  details.queueAfter = socket.listQueue().map((j) => j.id);
  details.machineAlive = Object.fromEntries(
    socket.discover().map((m) => [m.id, m.alive]),
  );

  // Pass criterion: death did not require human recovery (auto reassign + re-lease worked)
  details.deathWithoutHuman =
    Array.isArray(details.reassigned) &&
    (details.reassigned as string[]).length > 0 &&
    !!(details.reLease as { ok?: boolean })?.ok;

  if (!details.deathWithoutHuman) pass = false;

  return { pass, limits, details };
}
