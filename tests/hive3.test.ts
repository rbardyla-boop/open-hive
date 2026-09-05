import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import { runHive3Gauntlet } from "../packages/core/hive3.ts";

describe("HIVE-3", () => {
  it("gauntlet PASS", () => {
    const r = runHive3Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("does not auto-pick when contradiction declared", () => {
    const hive = new Hive();
    hive.openClaim("a", "safe");
    hive.openClaim("b", "crashes");
    hive.declareContradiction("a", "b");
    assert.equal(hive.getClaim("a")?.status, "OPEN");
    assert.equal(hive.getClaim("b")?.status, "OPEN");
  });

  it("arbitrary pick throws", () => {
    const hive = new Hive();
    hive.openClaim("a", "safe");
    hive.openClaim("b", "crashes");
    const e = hive.declareContradiction("a", "b");
    assert.throws(() => hive.arbitraryPickContradiction(e.id, "a"));
  });

  it("narrow requires proven claim", () => {
    const hive = new Hive();
    hive.openClaim("a", "safe");
    hive.openClaim("b", "crashes");
    hive.openClaim("r", "repro");
    const e = hive.declareContradiction("a", "b");
    const r = hive.narrowContradiction(e.id, "r", "b", "a");
    assert.equal(r.ok, false);
  });
});
