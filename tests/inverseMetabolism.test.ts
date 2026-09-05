import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import {
  ComputeSocket,
  seedFiveMachines,
} from "../packages/core/socket0.ts";
import {
  WeakOrganism,
  runExternalMetabolism,
  runInverseMetabolismGauntlet,
} from "../packages/core/inverseMetabolism.ts";

describe("INVERSE-METABOLISM", () => {
  it("gauntlet PASS with cortex wakes = 0", () => {
    const r = runInverseMetabolismGauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
    assert.equal(r.cortexWakes, 0);
    assert.ok(r.steps.every((s) => s.ok));
  });

  it("detects deficit when workload exceeds local capacity", () => {
    const o = new WeakOrganism("w", 10);
    assert.deepEqual(o.detectDeficit(50), { deficit: true, shortfall: 40 });
    assert.deepEqual(o.detectDeficit(5), { deficit: false, shortfall: 0 });
  });

  it("known capabilities do not wake cortex", () => {
    const o = new WeakOrganism("w", 1);
    o.constructRequirement("w1", 10, ["gpu"]);
    assert.equal(o.cortexWakes, 0);
  });

  it("unknown accelerator wakes cortex", () => {
    const o = new WeakOrganism("w", 1);
    o.constructRequirement("w1", 10, ["quantum-tpu"]);
    assert.equal(o.cortexWakes, 1);
  });

  it("pipeline commits hive evidence and settles socket", () => {
    const o = new WeakOrganism("w", 5);
    const socket = new ComputeSocket({ boundUnits: 100 });
    seedFiveMachines(socket);
    const hive = new Hive();
    const r = runExternalMetabolism(o, socket, hive, {
      workloadId: "t",
      neededUnits: 20,
      capabilities: ["edge"],
      expectedResult: { ok: 1 },
    });
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
    assert.equal(hive.getClaim("claim-t")?.status, "PROVEN");
    assert.ok(socket.balance("E") >= 20);
  });
});
