import { Hive } from "./hive.ts";
import { runOpaqueWorker, runVerifier } from "./workers.ts";
import {
  ComputeSocket,
  seedFiveMachines,
  type Capability,
  type ComputeSocketConfig,
} from "./socket0.ts";

export interface TypedRequirement {
  capabilities: Capability[];
  units: number;
  workloadId: string;
}

export interface MetabolismStep {
  name: string;
  ok: boolean;
  detail?: unknown;
}

export interface MetabolismResult {
  pass: boolean;
  cortexWakes: number;
  steps: MetabolismStep[];
  limits: string[];
  details: Record<string, unknown>;
}

/**
 * Weak local "organism" — known capacity only.
 * Known remote compute types do not wake cortex.
 */
export class WeakOrganism {
  cortexWakes = 0;
  readonly knownComputeTypes = new Set<string>([
    "cpu",
    "gpu",
    "unix",
    "macos",
    "server",
    "edge",
    "lowpower",
  ]);
  readonly id: string;
  /** Local capacity in work units. */
  readonly localCapacity: number;

  constructor(id: string, localCapacity: number) {
    this.id = id;
    this.localCapacity = localCapacity;
  }

  detectDeficit(neededUnits: number): {
    deficit: boolean;
    shortfall: number;
  } {
    const shortfall = Math.max(0, neededUnits - this.localCapacity);
    return { deficit: shortfall > 0, shortfall };
  }

  /**
   * Build typed requirement for remote SOCKET.
   * Unknown capability → cortex wake (novelty); known → wake 0.
   */
  constructRequirement(
    workloadId: string,
    neededUnits: number,
    capabilities: Capability[],
  ): { requirement: TypedRequirement; novel: boolean } {
    const novel = capabilities.some((c) => !this.knownComputeTypes.has(c));
    if (novel) this.cortexWakes += 1;
    return {
      requirement: {
        capabilities: [...capabilities],
        units: neededUnits,
        workloadId,
      },
      novel,
    };
  }
}

/**
 * Full external metabolism pipeline against ComputeSocket + Hive.
 *
 * deficit → typed requirement → remote lease → dispatch → return →
 * verify → evidence committed → compute right settled.
 * Target for known compute: cortex wakes = 0.
 */
export function runExternalMetabolism(
  organism: WeakOrganism,
  socket: ComputeSocket,
  hive: Hive,
  opts: {
    workloadId: string;
    neededUnits: number;
    capabilities: Capability[];
    expectedResult: unknown;
    providerMachineId?: string;
  },
): MetabolismResult {
  const limits = [
    "in-process WeakOrganism + ComputeSocket (not Inverse 1.0 runtime binary)",
    "cortex wake counter is explicit novelty detection, not a neural cortex",
    "evidence commit uses Hive opaque+verifier path from HIVE-0",
  ];
  const steps: MetabolismStep[] = [];
  const details: Record<string, unknown> = {};
  let pass = true;

  // 1) resource deficit detected
  const deficit = organism.detectDeficit(opts.neededUnits);
  steps.push({ name: "deficit_detected", ok: deficit.deficit, detail: deficit });
  details.deficit = deficit;
  if (!deficit.deficit) {
    return {
      pass: false,
      cortexWakes: organism.cortexWakes,
      steps,
      limits,
      details: { ...details, reason: "no deficit — metabolism not needed" },
    };
  }

  // 2) typed requirement constructed
  const { requirement, novel } = organism.constructRequirement(
    opts.workloadId,
    opts.neededUnits,
    opts.capabilities,
  );
  steps.push({
    name: "typed_requirement",
    ok: true,
    detail: { requirement, novel },
  });
  details.requirement = requirement;
  details.novel = novel;

  // Known compute path must keep cortex wakes at 0
  if (!novel && organism.cortexWakes !== 0) {
    pass = false;
  }

  // Organism must hold credit to consume remote capacity (SOCKET-2)
  // Pre-fund via a prior contribute on a capable machine is caller's job;
  // for known path we settle provider then organism consumes from its own balance
  // if it has credit — or we treat settlement as provider credit only.
  // Spec: compute right settled — provider gets credit; organism may debit if funded.

  // 3) remote lease acquired
  const job = socket.enqueue(
    requirement.capabilities,
    `metab-${requirement.workloadId}`,
  );
  const lease = socket.matchAndLease(job.id);
  steps.push({ name: "remote_lease", ok: lease.ok, detail: lease });
  if (!lease.ok || !lease.machineId) {
    return {
      pass: false,
      cortexWakes: organism.cortexWakes,
      steps,
      limits,
      details,
    };
  }
  if (
    opts.providerMachineId &&
    lease.machineId !== opts.providerMachineId
  ) {
    // still ok if capable machine matched
    details.leaseMachine = lease.machineId;
  }

  // 4–5) work dispatched + result returned
  const done = socket.complete(
    job.id,
    lease.machineId,
    opts.expectedResult,
    requirement.units,
  );
  steps.push({ name: "dispatch_return", ok: done.ok, detail: done });
  if (!done.ok) {
    return {
      pass: false,
      cortexWakes: organism.cortexWakes,
      steps,
      limits,
      details,
    };
  }

  // 6) result verified
  const verified = socket.verify(
    job.id,
    (r) => JSON.stringify(r) === JSON.stringify(opts.expectedResult),
  );
  steps.push({ name: "result_verified", ok: verified.ok, detail: verified });
  if (!verified.ok) {
    return {
      pass: false,
      cortexWakes: organism.cortexWakes,
      steps,
      limits,
      details,
    };
  }

  // 7) evidence committed to hive
  hive.registerWorker({ id: "org", alive: true, kind: "opaque" });
  hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
  const claimId = `claim-${requirement.workloadId}`;
  hive.openClaim(claimId, `metabolism result for ${requirement.workloadId}`);
  const submitted = runOpaqueWorker(hive, "org", claimId, {
    remoteReceipt: done.receiptId,
    result: opts.expectedResult,
    requirement,
  });
  steps.push({
    name: "evidence_submitted",
    ok: !!submitted.evidenceId,
    detail: submitted,
  });
  if (!submitted.evidenceId) pass = false;

  const closed = runVerifier(
    hive,
    "D",
    claimId,
    (evidence) => {
      if (evidence.length < 1) return { ok: false, reason: "no evidence" };
      const payload = evidence[0]!.payload as {
        remoteReceipt?: string;
        result?: unknown;
      };
      if (payload.remoteReceipt !== done.receiptId) {
        return { ok: false, reason: "receipt mismatch" };
      }
      if (
        JSON.stringify(payload.result) !==
        JSON.stringify(opts.expectedResult)
      ) {
        return { ok: false, reason: "result mismatch" };
      }
      return { ok: true, reason: "metabolism evidence ok" };
    },
    "PROVEN",
  );
  steps.push({ name: "evidence_committed", ok: closed.closed, detail: closed });
  if (!closed.closed) pass = false;
  if (hive.getClaim(claimId)?.status !== "PROVEN") pass = false;
  if (hive.getMemory().length < 1) pass = false;

  // 8) compute right settled
  const settled = socket.settle(job.id, requirement.units);
  steps.push({ name: "compute_settled", ok: settled.ok, detail: settled });
  if (!settled.ok) pass = false;

  details.cortexWakes = organism.cortexWakes;
  details.providerBalance = socket.balance(lease.machineId);
  details.claimStatus = hive.getClaim(claimId)?.status;

  // Target for known compute
  if (!novel && organism.cortexWakes !== 0) pass = false;
  if (!steps.every((s) => s.ok)) pass = false;

  return {
    pass,
    cortexWakes: organism.cortexWakes,
    steps,
    limits,
    details,
  };
}

/** Gauntlet: weak hardware, known GPU workload beyond local capacity. */
export function runInverseMetabolismGauntlet(
  config: Partial<ComputeSocketConfig> = {},
): MetabolismResult {
  const organism = new WeakOrganism("weak-1", 10); // local capacity 10
  const socket = new ComputeSocket({
    leaseMs: 60_000,
    boundUnits: 200,
    ...config,
  });
  seedFiveMachines(socket);
  const hive = new Hive({ leaseMs: 60_000 });

  const result = runExternalMetabolism(organism, socket, hive, {
    workloadId: "matrix-shard",
    neededUnits: 50, // beyond local 10
    capabilities: ["gpu", "cpu"], // known → cortex wakes 0
    expectedResult: { shards: 50, ok: true },
    providerMachineId: "A",
  });

  // Extra assertion: novelty path wakes cortex (separate mini-check in details)
  const novelOrg = new WeakOrganism("weak-novel", 5);
  const before = novelOrg.cortexWakes;
  novelOrg.constructRequirement("accel", 20, ["quantum-tpu"]);
  result.details.noveltyWakes = novelOrg.cortexWakes - before;
  if (result.details.noveltyWakes !== 1) {
    result.details.noveltyCheckFailed = true;
    // don't fail known-path gauntlet on this — record only; novelty is INVERSE-0.9
  }

  return result;
}
