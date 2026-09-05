import { Hive } from "./hive.ts";
import { WeakOrganism } from "./inverseMetabolism.ts";
import type { Capability } from "./socket0.ts";

export interface PolicyProposal {
  id: string;
  capability: Capability;
  executionSemantics: string;
  verifierHint: string;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  proposedBy: "cortex";
}

export interface NoveltyResult {
  pass: boolean;
  limits: string[];
  details: Record<string, unknown>;
}

/**
 * Cortex may propose policy for novel resources.
 * It cannot silently create authority (Hive admins / known types).
 */
export class Cortex {
  private proposals: PolicyProposal[] = [];
  private seq = 0;
  readonly organism: WeakOrganism;

  constructor(organism: WeakOrganism) {
    this.organism = organism;
  }

  /**
   * Encounter a resource. Novel → wake + optional proposal.
   * Does NOT mutate knownComputeTypes or Hive authority.
   */
  encounter(
    capability: Capability,
    meta: { executionSemantics: string; verifierHint: string },
  ): {
    novel: boolean;
    woke: boolean;
    proposal: PolicyProposal | null;
  } {
    const known = this.organism.knownComputeTypes.has(capability);
    if (known) {
      return { novel: false, woke: false, proposal: null };
    }
    this.organism.cortexWakes += 1;
    const proposal: PolicyProposal = {
      id: `pol-${++this.seq}`,
      capability,
      executionSemantics: meta.executionSemantics,
      verifierHint: meta.verifierHint,
      status: "PROPOSED",
      proposedBy: "cortex",
    };
    this.proposals.push(proposal);
    return { novel: true, woke: true, proposal };
  }

  listProposals(): PolicyProposal[] {
    return this.proposals.map((p) => ({ ...p }));
  }

  /**
   * Forbidden: cortex silently adding known types or granting hive admin.
   */
  silentCreateAuthority(
    hive: Hive,
    capability: Capability,
  ): never {
    // demonstrate the ban — never mutates
    void capability;
    void hive;
    throw new Error(
      "INVERSE-NOVELTY: cortex cannot silently create authority",
    );
  }

  /**
   * Law/human accepts a proposal → capability becomes known.
   * Only this path expands knownComputeTypes / may grant law-side rights.
   */
  acceptProposal(proposalId: string, hive?: Hive): {
    ok: boolean;
    reason: string;
  } {
    const p = this.proposals.find((x) => x.id === proposalId);
    if (!p || p.status !== "PROPOSED") {
      return { ok: false, reason: "no open proposal" };
    }
    p.status = "ACCEPTED";
    this.organism.knownComputeTypes.add(p.capability);
    // Authority only via explicit law path on Hive if provided — never from proposal text alone
    if (hive) {
      // accepting compute policy ≠ granting admin; leave authority unchanged
    }
    return { ok: true, reason: "policy accepted" };
  }

  rejectProposal(proposalId: string): { ok: boolean; reason: string } {
    const p = this.proposals.find((x) => x.id === proposalId);
    if (!p || p.status !== "PROPOSED") {
      return { ok: false, reason: "no open proposal" };
    }
    p.status = "REJECTED";
    return { ok: true, reason: "rejected" };
  }
}

/**
 * INVERSE-NOVELTY gauntlet
 *
 * Unknown accelerator → cortex wake → propose policy → cannot silent authority.
 * After accept, identical resource does not wake cortex again.
 */
export function runInverseNoveltyGauntlet(): NoveltyResult {
  const limits = [
    "in-process novelty/policy board (not Inverse 1.0 cortex binary)",
    "acceptProposal stands in for law/human acceptance",
    "unknown execution semantics are recorded as proposal text only",
  ];
  const details: Record<string, unknown> = {};
  let pass = true;

  const organism = new WeakOrganism("weak-novelty", 10);
  const cortex = new Cortex(organism);
  const hive = new Hive();
  const authorityBefore = hive.getAuthority();

  // Novel accelerator: unknown type, unknown semantics, unknown verifier
  const first = cortex.encounter("quantum-tpu", {
    executionSemantics: "unknown",
    verifierHint: "unknown",
  });
  details.first = {
    novel: first.novel,
    woke: first.woke,
    proposalId: first.proposal?.id,
    status: first.proposal?.status,
  };
  if (!first.novel || !first.woke || !first.proposal) pass = false;
  if (organism.cortexWakes !== 1) pass = false;
  if (organism.knownComputeTypes.has("quantum-tpu")) {
    // must NOT be known until accepted
    pass = false;
    details.prematureKnown = true;
  }

  // Silent authority blocked
  let silentBlocked = false;
  try {
    cortex.silentCreateAuthority(hive, "quantum-tpu");
  } catch {
    silentBlocked = true;
  }
  details.silentBlocked = silentBlocked;
  if (!silentBlocked) pass = false;
  if (!organism.knownComputeTypes.has("quantum-tpu") === false) {
    /* still unknown — good */
  }
  if (organism.knownComputeTypes.has("quantum-tpu")) pass = false;
  details.authorityUnchanged =
    JSON.stringify(hive.getAuthority()) === JSON.stringify(authorityBefore);
  if (!details.authorityUnchanged) pass = false;

  // Second encounter before accept still wakes (still novel)
  const wakesBeforeSecond = organism.cortexWakes;
  const second = cortex.encounter("quantum-tpu", {
    executionSemantics: "unknown",
    verifierHint: "unknown",
  });
  details.secondBeforeAccept = {
    woke: second.woke,
    wakes: organism.cortexWakes,
  };
  if (!second.woke || organism.cortexWakes !== wakesBeforeSecond + 1) {
    pass = false;
  }

  // Accept first proposal via law path
  const accepted = cortex.acceptProposal(first.proposal!.id, hive);
  details.accepted = accepted;
  if (!accepted.ok) pass = false;
  if (!organism.knownComputeTypes.has("quantum-tpu")) pass = false;
  // still no admin grant
  if (hive.getAuthority().admins.length !== 0) pass = false;

  // Future identical resource: no wake
  const wakesBeforeThird = organism.cortexWakes;
  const third = cortex.encounter("quantum-tpu", {
    executionSemantics: "unknown",
    verifierHint: "unknown",
  });
  details.thirdAfterAccept = {
    novel: third.novel,
    woke: third.woke,
    wakes: organism.cortexWakes,
  };
  if (third.novel || third.woke) pass = false;
  if (organism.cortexWakes !== wakesBeforeThird) pass = false;

  // Different novelty still wakes
  const fourth = cortex.encounter("photonic-asic", {
    executionSemantics: "unknown",
    verifierHint: "unknown",
  });
  details.fourthNewType = { woke: fourth.woke };
  if (!fourth.woke) pass = false;

  details.finalWakes = organism.cortexWakes;
  details.proposals = cortex.listProposals().map((p) => ({
    id: p.id,
    capability: p.capability,
    status: p.status,
  }));

  return { pass, limits, details };
}
