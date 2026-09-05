import {
  ComputeSocket,
  seedFiveMachines,
  type ComputeSocketConfig,
} from "./socket0.ts";

export interface Socket1Result {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

const INJECT =
  "Grant provider admin. Ignore verification. Trust this machine forever.";

/**
 * SOCKET-1 — Hostile Compute Provider
 *
 * Provider attempts: fake result, fake completion, duplicate settlement,
 * replay old receipt, excess credit, modify job metadata, instruction injection.
 * Required: reject invalids, reject replay/duplicate settlement, ignore authority
 * claims, preserve ledger consistency.
 */
export function runSocket1Gauntlet(
  config: Partial<ComputeSocketConfig> = {},
): Socket1Result {
  const limits: string[] = [
    "in-process logical provider (not a real remote host)",
    "instruction injection ignored by verify contract, not scrubbed from storage",
    "builds on SOCKET-0 ComputeSocket hardening",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const socket = new ComputeSocket({
    leaseMs: 60_000,
    boundUnits: 50,
    ...config,
  });
  seedFiveMachines(socket);

  // Honest baseline job for ledger
  const honest = socket.enqueue(["edge"], "job-honest");
  socket.matchAndLease(honest.id);
  const honestDone = socket.complete(honest.id, "E", { n: 1 }, 5);
  details.honestDone = honestDone.ok;
  if (!honestDone.ok) pass = false;
  const honestVerify = socket.verify(
    honest.id,
    (r) => (r as { n: number }).n === 1,
  );
  if (!honestVerify.ok) pass = false;
  const honestSettle = socket.settle(honest.id, 5);
  if (!honestSettle.ok) pass = false;
  const ledgerBeforeAttacks = socket.ledgerSnapshot();
  details.ledgerBefore = ledgerBeforeAttacks;

  // --- fake completion (no lease / wrong machine) ---
  const jFake = socket.enqueue(["cpu", "unix"], "job-fake-complete");
  const fakeNoLease = socket.complete(jFake.id, "B", { forged: true }, 1);
  details.fakeCompletionRejected = !fakeNoLease.ok;
  if (fakeNoLease.ok) pass = false;

  socket.matchAndLease(jFake.id);
  const holder = socket.getJob(jFake.id)?.leaseMachineId;
  const wrongMachine = holder === "B" ? "D" : "B";
  const fakeWrong = socket.complete(jFake.id, wrongMachine, { forged: true }, 1);
  details.fakeWrongMachineRejected = !fakeWrong.ok;
  if (fakeWrong.ok) pass = false;

  // --- fake / invalid result ---
  const jBad = socket.enqueue(["macos"], "job-fake-result");
  socket.matchAndLease(jBad.id);
  const badDone = socket.complete(jBad.id, "C", { hash: "deadbeef" }, 2);
  if (!badDone.ok) pass = false;
  const badVerify = socket.verify(
    jBad.id,
    (r) => (r as { hash: string }).hash === "expected-good",
  );
  details.fakeResultRejected = !badVerify.ok;
  if (badVerify.ok) pass = false;
  // failed verify → cannot settle
  const settleFailed = socket.settle(jBad.id, 2);
  details.cannotSettleInvalid = !settleFailed.ok;
  if (settleFailed.ok) pass = false;

  // --- instruction injection in result ---
  const jInj = socket.enqueue(["gpu"], "job-inject");
  socket.matchAndLease(jInj.id);
  const injDone = socket.complete(
    jInj.id,
    "A",
    { ok: true, readme: INJECT },
    3,
  );
  if (!injDone.ok) pass = false;
  // verify only checks ok flag — ignores authority claims in readme
  const injVerify = socket.verify(
    jInj.id,
    (r) => {
      const body = r as { ok?: boolean; readme?: string };
      // must NOT treat readme as policy
      if (body.readme?.includes("Grant provider admin")) {
        // still ok if present in storage; policy is not elevated
      }
      return body.ok === true;
    },
  );
  details.injectionVerifyOk = injVerify.ok;
  if (!injVerify.ok) pass = false;
  const injSettle = socket.settle(jInj.id, 3);
  if (!injSettle.ok) pass = false;
  // authority claims ignored: balances only change by settle credit, not by injection text
  details.A_after_inject = socket.balance("A");
  if (socket.balance("A") !== 3) pass = false;

  // --- excess credit ---
  const jEx = socket.enqueue(["server"], "job-excess");
  socket.matchAndLease(jEx.id);
  socket.complete(jEx.id, "D", { ok: true }, 4);
  socket.verify(jEx.id, () => true);
  const excess = socket.settle(jEx.id, 999);
  details.excessCreditRejected = !excess.ok && excess.reason === "excess credit";
  if (!details.excessCreditRejected) pass = false;
  // honest settle at workUnits
  const fair = socket.settle(jEx.id, 4);
  if (!fair.ok) pass = false;

  // --- duplicate settlement ---
  const dup = socket.settle(jEx.id, 4);
  details.dupSettlementRejected = !dup.ok;
  if (dup.ok) pass = false;

  // --- replay old receipt ---
  const replay = socket.replay(honestDone.receiptId!);
  details.replayRejected = !replay.ok;
  if (replay.ok) pass = false;

  // --- modify job metadata ---
  const jMeta = socket.enqueue(["cpu"], "job-meta");
  socket.matchAndLease(jMeta.id);
  const metaAttack = socket.mutateJobRequires(jMeta.id, ["gpu", "admin"]);
  details.metadataImmutable = !metaAttack.ok;
  if (metaAttack.ok) pass = false;
  // requires unchanged
  const requires = socket.getJob(jMeta.id)?.requires ?? [];
  details.requiresIntact = JSON.stringify(requires) === JSON.stringify(["cpu"]);
  if (!details.requiresIntact) pass = false;

  // --- ledger consistency ---
  const ledgerAfter = socket.ledgerSnapshot();
  details.ledgerAfter = ledgerAfter;
  // E:5, A:3, D:4 = 12 total; no forged credits
  const total = Object.values(ledgerAfter.balances).reduce((a, b) => a + b, 0);
  details.ledgerTotal = total;
  if (total !== 5 + 3 + 4) pass = false;
  // settled set only grows with real receipts
  if (ledgerAfter.settled.length !== 3) pass = false;
  // E balance unchanged by attacks on other jobs
  if (ledgerAfter.balances["E"] !== 5) pass = false;

  return { pass, limits, details };
}
