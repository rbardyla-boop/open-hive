import { mkdirSync, writeFileSync } from "node:fs";
import { runFullSystemProof } from "../packages/core/fullSystemProof.ts";

const result = runFullSystemProof();
const cortexWakes = Number(result.details.cortexWakes ?? -1);
const receipt = {
  pass: result.pass,
  steps: result.steps,
  cortexWakes,
  details: result.details,
  limits: result.limits,
  generatedAt: new Date().toISOString(),
};

mkdirSync("receipts", { recursive: true });
const outPath = "receipts/full-system-proof-latest.json";
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

const ok =
  result.pass === true &&
  result.steps.length === 18 &&
  cortexWakes === 0;

if (!ok) {
  console.error("PROVE FAIL", {
    pass: result.pass,
    steps: result.steps.length,
    cortexWakes,
    path: outPath,
  });
  process.exit(1);
}

console.log("PROVE PASS", {
  pass: true,
  steps: 18,
  cortexWakes: 0,
  path: outPath,
});
