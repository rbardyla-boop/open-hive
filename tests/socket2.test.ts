import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ComputeSocket, seedFiveMachines } from "../packages/core/socket0.ts";
import { contribute, runSocket2Gauntlet } from "../packages/core/socket2.ts";

describe("SOCKET-2", () => {
  it("gauntlet PASS", () => {
    const r = runSocket2Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("A: contribute 100 then consume 25 → 75", () => {
    const s = new ComputeSocket({ boundUnits: 200 });
    seedFiveMachines(s);
    assert.ok(contribute(s, "A", ["gpu"], 100, "c1").ok);
    assert.equal(s.balance("A"), 100);
    assert.ok(s.consume("A", 25).ok);
    assert.equal(s.balance("A"), 75);
  });

  it("rejects overdraft", () => {
    const s = new ComputeSocket();
    seedFiveMachines(s);
    assert.equal(s.consume("A", 1).ok, false);
  });

  it("rejects zero consume", () => {
    const s = new ComputeSocket({ boundUnits: 10 });
    seedFiveMachines(s);
    contribute(s, "A", ["gpu"], 5, "c2");
    assert.equal(s.consume("A", 0).ok, false);
  });
});
