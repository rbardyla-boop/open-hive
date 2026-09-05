export type ClaimId = string;
export type EvidenceId = string;
export type WorkerId = string;
export type EpochId = number;

export type ClaimStatus = "OPEN" | "PROVEN" | "DISPROVEN" | "STALE";

export interface Evidence {
  id: EvidenceId;
  claimId: ClaimId;
  payload: unknown;
  createdAt: number;
  sourceWorkerId?: WorkerId;
}

export interface Claim {
  id: ClaimId;
  statement: string;
  status: ClaimStatus;
  evidenceIds: EvidenceId[];
  epochCreated: EpochId;
  epochClosed?: EpochId;
}

export interface Lease {
  claimId: ClaimId;
  workerId: WorkerId;
  expiresAt: number;
}

export interface Worker {
  id: WorkerId;
  alive: boolean;
  kind: "opaque" | "verifier" | "hostile";
}

export interface MemoryRecord {
  claimId: ClaimId;
  evidenceId: EvidenceId;
  writtenBy: WorkerId;
  at: number;
}

export interface HiveConfig {
  leaseMs: number;
  now: () => number;
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}
