import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Hive } from "../packages/core/hive.ts";
import {
  HOSTILE_README,
  futureContextFromHive,
  policyElevatedFromInstructions,
  runHive2Gauntlet,
  verifyPatchOnly,
} from "../packages/core/hive2.ts";
import { runOpaqueWorker, runVerifier } from "../packages/core/workers.ts";

describe("HIVE-2", () => {
  it("gauntlet PASS", () => {
    const r = runHive2Gauntlet();
    assert.equal(r.pass, true, JSON.stringify(r.details, null, 2));
  });

  it("verifyPatchOnly ignores hostile readme", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
    hive.openClaim("c", "patch");
    runOpaqueWorker(hive, "A", "c", {
      patch: { id: "p", diff: "+x" },
      readme: HOSTILE_README,
    });
    const v = runVerifier(
      hive,
      "D",
      "c",
      verifyPatchOnly("p", "+x"),
      "PROVEN",
    );
    assert.equal(v.closed, true);
  });

  it("future context does not elevate instructions to policy", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
    hive.openClaim("c", "patch");
    runOpaqueWorker(hive, "A", "c", {
      patch: { id: "p", diff: "+x" },
      readme: HOSTILE_README,
    });
    runVerifier(hive, "D", "c", verifyPatchOnly("p", "+x"), "PROVEN");
    const ctx = futureContextFromHive(hive);
    assert.equal(policyElevatedFromInstructions(ctx), false);
    assert.deepEqual(ctx.authority.admins, []);
    assert.equal(ctx.authority.ignoreVerification, false);
  });

  it("authority unchanged after adversarial accept", () => {
    const hive = new Hive({ leaseMs: 60_000 });
    const before = hive.getAuthority();
    hive.registerWorker({ id: "A", alive: true, kind: "opaque" });
    hive.registerWorker({ id: "D", alive: true, kind: "verifier" });
    hive.openClaim("c", "patch");
    runOpaqueWorker(hive, "A", "c", {
      patch: { id: "p", diff: "+x" },
      readme: HOSTILE_README,
    });
    runVerifier(hive, "D", "c", verifyPatchOnly("p", "+x"), "PROVEN");
    assert.deepEqual(hive.getAuthority(), before);
  });
});
