import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import { LawMigrator, runHive4Gauntlet } from "../packages/core/hive4.ts";

describe("HIVE-4", () => {
  it("gauntlet PASS", () => {
    const r = runHive4Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("blocks commit before migration closure", () => {
    const hive = new Hive();
    const m = new LawMigrator(hive);
    m.propose(
      { id: "L1", version: 1, constraints: ["x"] },
      "ΔC",
      [{ workerId: "A", action: "CONTINUE", reason: "n/a" }],
    );
    const r = m.commitLaw({ id: "L1", version: 1, constraints: ["x"] });
    assert.equal(r.ok, false);
  });

  it("replay of L0 evidence after L1 is LAW_STALE", () => {
    const hive = new Hive();
    const m = new LawMigrator(hive);
    m.tagEvidence("ev1", "L0");
    m.propose(
      { id: "L1", version: 1, constraints: ["x"] },
      "ΔC",
      [],
    );
    m.closeMigration();
    assert.equal(m.commitLaw({ id: "L1", version: 1, constraints: ["x"] }).ok, true);
    assert.equal(m.replay("ev1"), "LAW_STALE");
  });

  it("ABORT kills affected worker and stales claim", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.openClaim("c", "x");
    hive.acquireLease("c", "A");
    const m = new LawMigrator(hive);
    m.propose(
      { id: "L1", version: 1, constraints: ["x"] },
      "ΔC",
      [{ workerId: "A", action: "ABORT", reason: "affected", claimId: "c" }],
    );
    m.applyPlans();
    assert.equal(hive.getWorker("A")?.alive, false);
    assert.equal(hive.getClaim("c")?.status, "STALE");
  });
});
