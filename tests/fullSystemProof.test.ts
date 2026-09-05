import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFullSystemProof } from "../packages/core/fullSystemProof.ts";

describe("FULL-SYSTEM-PROOF", () => {
  it("gauntlet PASS — 18 steps", () => {
    const r = runFullSystemProof();
    assert.equal(r.steps.length, 18);
    assert.equal(
      r.pass,
      true,
      JSON.stringify(
        {
          failed: r.steps.filter((s) => !s.ok),
          details: r.details,
        },
        null,
        2,
      ),
    );
    assert.equal(r.details.cortexWakes, 0);
  });

  it("every step is marked ok on pass", () => {
    const r = runFullSystemProof();
    assert.ok(r.steps.every((s) => s.ok && s.n >= 1 && s.n <= 18));
  });
});
