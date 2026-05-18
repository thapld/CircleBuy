// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
  function transfer(address to, uint256 value) external returns (bool);
  function transferFrom(address from, address to, uint256 value) external returns (bool);
}

contract ArcGroupDeal {
  enum DealState {
    DepositOpen,
    FinalPaymentOpen,
    ReadyToOrder,
    Completed,
    Refunding,
    Cancelled
  }

  address public immutable token;
  address public immutable organizer;
  bytes32 public immutable inviteCodeHash;
  uint32 public immutable minParticipants;
  uint32 public immutable maxParticipants;
  uint256 public immutable unitPrice;
  uint256 public immutable depositPerParticipant;
  uint64 public immutable depositDeadline;
  uint64 public immutable finalDeadline;

  DealState public state;
  uint32 public participantCount;
  uint32 public finalPaymentCount;
  uint256 public lockedBalance;

  mapping(address => bool) public hasJoined;
  mapping(address => uint256) public contributedAmount;
  mapping(address => bool) public hasClaimedRefund;

  event DepositPaid(address indexed participant, uint256 amount, uint32 participantCount);
  event FinalPaid(address indexed participant, uint256 amount, uint32 finalPaymentCount);
  event StateChanged(DealState indexed newState);
  event Refunded(address indexed participant, uint256 amount);
  event Released(address indexed organizer, uint256 amount);

  error InvalidState();
  error InvalidInviteCode();
  error MaxParticipantsReached();
  error AlreadyFinalPaid();
  error InsufficientDeposit();
  error TransferFailed();
  error Unauthorized();
  error DealNotRefunding();
  error DeadlineNotReached();

  modifier onlyOrganizer() {
    if (msg.sender != organizer) revert Unauthorized();
    _;
  }

  constructor(
    address token_,
    address organizer_,
    bytes32 inviteCodeHash_,
    uint32 minParticipants_,
    uint32 maxParticipants_,
    uint256 unitPrice_,
    uint256 depositPerParticipant_,
    uint64 depositDeadline_,
    uint64 finalDeadline_
  ) {
    require(token_ != address(0), "token=0");
    require(organizer_ != address(0), "organizer=0");
    require(minParticipants_ > 0 && maxParticipants_ >= minParticipants_, "bad participants");
    require(unitPrice_ > 0 && depositPerParticipant_ > 0, "bad pricing");
    require(depositPerParticipant_ < unitPrice_, "deposit>=price");
    require(depositDeadline_ < finalDeadline_, "bad deadlines");

    token = token_;
    organizer = organizer_;
    inviteCodeHash = inviteCodeHash_;
    minParticipants = minParticipants_;
    maxParticipants = maxParticipants_;
    unitPrice = unitPrice_;
    depositPerParticipant = depositPerParticipant_;
    depositDeadline = depositDeadline_;
    finalDeadline = finalDeadline_;
    state = DealState.DepositOpen;
  }

  function payDeposit(bytes32 providedInviteCodeHash) external {
    if (state != DealState.DepositOpen) revert InvalidState();
    if (block.timestamp > depositDeadline) revert DeadlineNotReached();
    if (providedInviteCodeHash != inviteCodeHash) revert InvalidInviteCode();
    if (participantCount >= maxParticipants) revert MaxParticipantsReached();

    if (!hasJoined[msg.sender]) {
      hasJoined[msg.sender] = true;
      participantCount += 1;
    }

    if (contributedAmount[msg.sender] >= depositPerParticipant) {
      revert InsufficientDeposit();
    }

    uint256 amount = depositPerParticipant - contributedAmount[msg.sender];
    contributedAmount[msg.sender] += amount;
    lockedBalance += amount;

    if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
      revert TransferFailed();
    }

    emit DepositPaid(msg.sender, amount, participantCount);

    if (participantCount >= minParticipants) {
      state = DealState.FinalPaymentOpen;
      emit StateChanged(DealState.FinalPaymentOpen);
    }
  }

  function payFinal() external {
    if (state != DealState.FinalPaymentOpen) revert InvalidState();
    if (block.timestamp > finalDeadline) revert DeadlineNotReached();
    if (!hasJoined[msg.sender]) revert InvalidState();

    uint256 requiredTotal = unitPrice;
    uint256 currentlyPaid = contributedAmount[msg.sender];
    if (currentlyPaid >= requiredTotal) revert AlreadyFinalPaid();

    uint256 amount = requiredTotal - currentlyPaid;
    contributedAmount[msg.sender] = requiredTotal;
    lockedBalance += amount;
    finalPaymentCount += 1;

    if (!IERC20(token).transferFrom(msg.sender, address(this), amount)) {
      revert TransferFailed();
    }

    emit FinalPaid(msg.sender, amount, finalPaymentCount);

    if (finalPaymentCount >= minParticipants) {
      state = DealState.ReadyToOrder;
      emit StateChanged(DealState.ReadyToOrder);
    }
  }

  function settleByDeadline() external {
    if (state == DealState.DepositOpen) {
      if (block.timestamp <= depositDeadline) revert DeadlineNotReached();
      state = DealState.Refunding;
      emit StateChanged(DealState.Refunding);
      return;
    }

    if (state == DealState.FinalPaymentOpen) {
      if (block.timestamp <= finalDeadline) revert DeadlineNotReached();
      state = DealState.Refunding;
      emit StateChanged(DealState.Refunding);
      return;
    }

    revert InvalidState();
  }

  function completeAndRelease() external onlyOrganizer {
    if (state != DealState.ReadyToOrder) revert InvalidState();
    state = DealState.Completed;
    emit StateChanged(DealState.Completed);

    uint256 amount = lockedBalance;
    lockedBalance = 0;
    if (!IERC20(token).transfer(organizer, amount)) revert TransferFailed();
    emit Released(organizer, amount);
  }

  function claimRefund() external {
    if (state != DealState.Refunding && state != DealState.Cancelled) revert DealNotRefunding();
    if (hasClaimedRefund[msg.sender]) revert InvalidState();

    uint256 amount = contributedAmount[msg.sender];
    if (amount == 0) revert InvalidState();

    hasClaimedRefund[msg.sender] = true;
    contributedAmount[msg.sender] = 0;
    lockedBalance -= amount;

    if (!IERC20(token).transfer(msg.sender, amount)) revert TransferFailed();
    emit Refunded(msg.sender, amount);
  }

  function cancelByOrganizer() external onlyOrganizer {
    if (state == DealState.Completed) revert InvalidState();
    state = DealState.Cancelled;
    emit StateChanged(DealState.Cancelled);
  }
}

