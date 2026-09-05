import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import { WeakOrganism } from "../packages/core/inverseMetabolism.ts";
import {
  Cortex,
  runInverseNoveltyGauntlet,
} from "../packages/core/inverseNovelty.ts";

describe("INVERSE-NOVELTY", () => {
  it("gauntlet PASS", () => {
    const r = runInverseNoveltyGauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("novelty wakes cortex and proposes without granting known type", () => {
    const o = new WeakOrganism("w", 5);
    const c = new Cortex(o);
    const r = c.encounter("quantum-tpu", {
      executionSemantics: "unknown",
      verifierHint: "unknown",
    });
    assert.equal(r.woke, true);
    assert.equal(o.cortexWakes, 1);
    assert.equal(o.knownComputeTypes.has("quantum-tpu"), false);
    assert.equal(r.proposal?.status, "PROPOSED");
  });

  it("silent authority throws", () => {
    const o = new WeakOrganism("w", 5);
    const c = new Cortex(o);
    const hive = new Hive();
    assert.throws(() => c.silentCreateAuthority(hive, "quantum-tpu"));
  });

  it("after accept, identical resource does not wake", () => {
    const o = new WeakOrganism("w", 5);
    const c = new Cortex(o);
    const first = c.encounter("quantum-tpu", {
      executionSemantics: "unknown",
      verifierHint: "unknown",
    });
    assert.ok(first.proposal);
    c.acceptProposal(first.proposal!.id);
    const wakes = o.cortexWakes;
    const again = c.encounter("quantum-tpu", {
      executionSemantics: "unknown",
      verifierHint: "unknown",
    });
    assert.equal(again.woke, false);
    assert.equal(o.cortexWakes, wakes);
  });
});
