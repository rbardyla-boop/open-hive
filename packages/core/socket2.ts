import {
  ComputeSocket,
  seedFiveMachines,
  type ComputeSocketConfig,
} from "./socket0.ts";

export interface Socket2Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

/** Machine contributes accepted units via complete→verify→settle. */
export function contribute(
  socket: ComputeSocket,
  machineId: string,
  requires: string[],
  units: number,
  jobId: string,
): { ok: boolean; balance: number; reason: string } {
  const job = socket.enqueue(requires, jobId);
  const lease = socket.matchAndLease(job.id);
  if (!lease.ok || lease.machineId !== machineId) {
    return {
      ok: false,
      balance: socket.balance(machineId),
      reason: `lease mismatch: ${lease.reason} got ${lease.machineId}`,
    };
  }
  const done = socket.complete(job.id, machineId, { units }, units);
  if (!done.ok) {
    return { ok: false, balance: socket.balance(machineId), reason: done.reason };
  }
  const v = socket.verify(
    job.id,
    (r) => (r as { units: number }).units === units,
  );
  if (!v.ok) {
    return { ok: false, balance: socket.balance(machineId), reason: v.reason };
  }
  const s = socket.settle(job.id, units);
  if (!s.ok) {
    return { ok: false, balance: socket.balance(machineId), reason: s.reason };
  }
  return {
    ok: true,
    balance: socket.balance(machineId),
    reason: "contributed",
  };
}

/**
 * SOCKET-2 — Reciprocal Compute
 *
 * A contributes 100 → balance 100; consumes 25 → balance 75.
 * Prove the lifecycle. Do not solve perfect economic fairness.
 */
export function runSocket2Gauntlet(
  config: Partial<ComputeSocketConfig> = {},
): Socket2Result {
  const limits: string[] = [
    "in-process ledger only (not a real market or token)",
    "1 credit = 1 accepted work unit; no fairness/pricing model",
    "consume is explicit debit — not automatic on remote lease yet",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const socket = new ComputeSocket({
    leaseMs: 60_000,
    boundUnits: 200,
    ...config,
  });
  seedFiveMachines(socket);

  // Spec example: A contributes 100 → 100; consumes 25 → 75
  const c100 = contribute(socket, "A", ["gpu"], 100, "job-contrib-100");
  details.contribute100 = c100;
  if (!c100.ok || socket.balance("A") !== 100) pass = false;

  const cons = socket.consume("A", 25);
  details.consume25 = cons;
  if (!cons.ok || socket.balance("A") !== 75) pass = false;

  const over = socket.consume("A", 1000);
  details.overdraftRejected = !over.ok;
  if (over.ok || socket.balance("A") !== 75) pass = false;

  // Second machine with unique capability so matching is deterministic
  socket.advertise("B", ["cpu", "unix", "oldlinux"]);
  const cB = contribute(socket, "B", ["oldlinux"], 40, "job-b-40");
  details.contributeB = cB;
  if (!cB.ok || socket.balance("B") !== 40) pass = false;

  const bCons = socket.consume("B", 10);
  details.consumeB10 = bCons;
  if (!bCons.ok || socket.balance("B") !== 30) pass = false;

  const zero = socket.consume("A", 0);
  details.zeroRejected = !zero.ok;
  if (zero.ok) pass = false;

  details.finalA = socket.balance("A");
  details.finalB = socket.balance("B");
  details.lifecycle = details.finalA === 75 && details.finalB === 30;
  if (!details.lifecycle) pass = false;

  return { pass, limits, details };
}
