export const ARC_TESTNET = {
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network"
} as const;

export const DEAL_STATUSES = [
  "deposit_open",
  "final_payment_open",
  "ready_to_order",
  "completed",
  "refunding",
  "cancelled"
] as const;

export const factoryAbi = [
  {
    type: "event",
    name: "DealCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "dealAddress", type: "address" },
      { indexed: true, name: "organizer", type: "address" },
      { indexed: false, name: "inviteCodeHash", type: "bytes32" },
      { indexed: false, name: "minParticipants", type: "uint32" },
      { indexed: false, name: "maxParticipants", type: "uint32" },
      { indexed: false, name: "unitPrice", type: "uint256" },
      { indexed: false, name: "depositPerParticipant", type: "uint256" },
      { indexed: false, name: "depositDeadline", type: "uint64" },
      { indexed: false, name: "finalDeadline", type: "uint64" }
    ]
  }
] as const;

export type DealStatus = (typeof DEAL_STATUSES)[number];

export type InviteTokenPayload = {
  tokenId: string;
  dealAddress: string;
  inviteCodeHash: string;
  exp: number;
  nonce: string;
  maxUses: number;
};

export type ApiErrorCode =
  | "invalid_payload"
  | "invalid_invite_token"
  | "invite_expired"
  | "invite_not_found"
  | "invite_exhausted"
  | "invite_revoked"
  | "deal_not_found";
