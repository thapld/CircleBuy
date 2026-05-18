import type { DealStatus } from "@arcgroup/shared";

export type DealRecord = {
  id: string;
  dealAddress: string;
  organizerWallet: string;
  title: string;
  inviteCode?: string | null;
  inviteCodeHash?: string | null;
  unitPrice: string;
  depositPerParticipant: string;
  minParticipants: number;
  maxParticipants: number;
  currentParticipants: number;
  status: DealStatus;
  statusReason?: string | null;
  onchainTxHash?: string | null;
  onchainBlockNumber?: string | null;
  depositDeadlineAt: string;
  finalDeadlineAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type InviteTokenRecord = {
  id: string;
  dealId: string;
  tokenId: string;
  inviteCodeHash: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revoked: boolean;
  createdByWallet: string;
  createdAt: string;
  updatedAt: string;
};
