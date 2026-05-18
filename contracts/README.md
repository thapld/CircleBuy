# Contracts

## Prerequisites

1. Install Foundry: [https://book.getfoundry.sh/getting-started/installation](https://book.getfoundry.sh/getting-started/installation)
2. Install dependencies:
   - `forge install foundry-rs/forge-std`

## Commands

- Build: `forge build`
- Test: `forge test`
- Deploy (Arc testnet):
  - `forge script script/Deploy.s.sol:DeployScript --rpc-url $ARC_RPC_URL --broadcast`

## Environment

- `PRIVATE_KEY`
- `PAYMENT_TOKEN_ADDRESS`
- `ARC_RPC_URL`

