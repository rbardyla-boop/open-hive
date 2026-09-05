import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComputeSocket, seedFiveMachines } from "../packages/core/socket0.ts";
import { runSocket1Gauntlet } from "../packages/core/socket1.ts";

describe("SOCKET-1", () => {
  it("gauntlet PASS", () => {
    const r = runSocket1Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("rejects excess credit", () => {
    const s = new ComputeSocket({ boundUnits: 20 });
    seedFiveMachines(s);
    const j = s.enqueue(["edge"]);
    s.matchAndLease(j.id);
    s.complete(j.id, "E", { ok: 1 }, 2);
    s.verify(j.id, () => true);
    assert.equal(s.settle(j.id, 99).ok, false);
    assert.ok(s.settle(j.id, 2).ok);
  });

  it("rejects metadata mutate after lease", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    const j = s.enqueue(["cpu"]);
    s.matchAndLease(j.id);
    assert.equal(s.mutateJobRequires(j.id, ["gpu"]).ok, false);
  });

  it("rejects fake completion without lease", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    const j = s.enqueue(["cpu"]);
    assert.equal(s.complete(j.id, "B", {}, 1).ok, false);
  });
});
