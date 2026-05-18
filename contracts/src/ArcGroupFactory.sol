// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./ArcGroupDeal.sol";

contract ArcGroupFactory {
  address public immutable token;

  event DealCreated(
    address indexed dealAddress,
    address indexed organizer,
    bytes32 inviteCodeHash,
    uint32 minParticipants,
    uint32 maxParticipants,
    uint256 unitPrice,
    uint256 depositPerParticipant,
    uint64 depositDeadline,
    uint64 finalDeadline
  );

  struct CreateDealParams {
    bytes32 inviteCodeHash;
    uint32 minParticipants;
    uint32 maxParticipants;
    uint256 unitPrice;
    uint256 depositPerParticipant;
    uint64 depositDeadline;
    uint64 finalDeadline;
  }

  constructor(address token_) {
    require(token_ != address(0), "token=0");
    token = token_;
  }

  function createDeal(CreateDealParams calldata p) external returns (address dealAddress) {
    ArcGroupDeal deal = new ArcGroupDeal(
      token,
      msg.sender,
      p.inviteCodeHash,
      p.minParticipants,
      p.maxParticipants,
      p.unitPrice,
      p.depositPerParticipant,
      p.depositDeadline,
      p.finalDeadline
    );

    dealAddress = address(deal);

    emit DealCreated(
      dealAddress,
      msg.sender,
      p.inviteCodeHash,
      p.minParticipants,
      p.maxParticipants,
      p.unitPrice,
      p.depositPerParticipant,
      p.depositDeadline,
      p.finalDeadline
    );
  }
}

