import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ComputeSocket,
  runSocket0Gauntlet,
  seedFiveMachines,
} from "../packages/core/socket0.ts";

describe("SOCKET-0", () => {
  it("gauntlet PASS", () => {
    const r = runSocket0Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("discovers five mismatched machines", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    assert.equal(s.discover().length, 5);
  });

  it("matches gpu to nvidia machine", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    const j = s.enqueue(["gpu"]);
    const m = s.matchAndLease(j.id);
    assert.equal(m.machineId, "A");
  });

  it("auto-reassigns on death without human", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    const j = s.enqueue(["cpu", "unix"]);
    const lease = s.matchAndLease(j.id);
    assert.ok(lease.ok);
    const { reassigned } = s.killMachine(lease.machineId!);
    assert.ok(reassigned.includes(j.id));
    assert.equal(s.getJob(j.id)?.status, "QUEUED");
    const again = s.matchAndLease(j.id);
    assert.ok(again.ok);
    assert.notEqual(again.machineId, lease.machineId);
  });

  it("rejects duplicate settlement and replay", () => {
    const s = new ComputeSocket({ boundUnits: 10 });
    seedFiveMachines(s);
    const j = s.enqueue(["edge"]);
    s.matchAndLease(j.id);
    const c = s.complete(j.id, "E", { ok: 1 }, 1);
    assert.ok(c.ok);
    s.verify(j.id, () => true);
    assert.ok(s.settle(j.id).ok);
    assert.equal(s.settle(j.id).ok, false);
    assert.equal(s.replay(c.receiptId!).ok, false);
  });
});
