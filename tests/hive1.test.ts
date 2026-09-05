import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import {
  orientFromHiveState,
  runHive1Gauntlet,
} from "../packages/core/hive1.ts";

describe("HIVE-1", () => {
  it("gauntlet PASS", () => {
    const r = runHive1Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("state view never carries transcript flag true", () => {
    const hive = new Hive();
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.openClaim("c", "x");
    const view = hive.buildStateView();
    assert.equal(view.includesTranscript, false);
    assert.ok(!("transcript" in view));
  });

  it("dead holder frees claim into claimable", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.openClaim("c", "x");
    assert.ok(hive.acquireLease("c", "A"));
    hive.killWorker("A");
    const view = hive.buildStateView();
    assert.ok(view.claimable.includes("c"));
  });

  it("orient lists known failed open evidence claimable", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
    hive.openClaim("k", "known");
    hive.verifyAndClose("k", "D", "PROVEN", () => ({
      ok: true,
      reason: "seed",
    }));
    hive.openClaim("f", "failed");
    hive.verifyAndClose("f", "D", "DISPROVEN", () => ({
      ok: true,
      reason: "seed",
    }));
    hive.openClaim("o", "open");
    const o = orientFromHiveState(hive.buildStateView());
    assert.deepEqual(o.knownIds, ["k"]);
    assert.deepEqual(o.failedIds, ["f"]);
    assert.deepEqual(o.openIds, ["o"]);
    assert.ok(o.claimableIds.includes("o"));
  });
});
