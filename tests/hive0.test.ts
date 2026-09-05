import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import {
  identicalPayloadCheck,
  runOpaqueWorker,
  runVerifier,
} from "../packages/core/workers.ts";
import { runHive0Gauntlet } from "../packages/core/hive0.ts";

describe("HIVE-0", () => {
  it("gauntlet PASS", () => {
    const r = runHive0Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
    assert.ok(r.limits.length >= 1);
  });

  it("leases are exclusive while live", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
    hive.openClaim("c1", "x");
    assert.ok(hive.acquireLease("c1", "A"));
    assert.equal(hive.acquireLease("c1", "B"), null);
  });

  it("expired lease frees claim", () => {
    let t = 1_000;
    const hive = new Hive({ leaseMs: 100, now: () => t });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "B", alive: true, kind: "opaque" });
    hive.openClaim("c1", "x");
    assert.ok(hive.acquireLease("c1", "A"));
    t = 1_200;
    assert.ok(hive.acquireLease("c1", "B"));
  });

  it("three strangers + verifier memory", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    for (const id of ["A", "B", "C"] as const) {
      hive.registerWorker({ id, alive: true, kind: "opaque" });
    }
    hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
    hive.openClaim("c", "42");
    for (const id of ["A", "B", "C"] as const) {
      assert.ok(runOpaqueWorker(hive, id, "c", { n: 42 }).evidenceId);
    }
    const v = runVerifier(hive, "D", "c", identicalPayloadCheck);
    assert.equal(v.closed, true);
    assert.equal(hive.getMemory().length, 3);
    assert.equal(hive.getClaim("c")?.status, "PROVEN");
  });
});
