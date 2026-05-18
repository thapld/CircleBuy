// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ArcGroupFactory.sol";

contract MockToken is IERC20 {
  mapping(address => uint256) public balanceOf;
  mapping(address => mapping(address => uint256)) public allowance;

  function mint(address to, uint256 amount) external {
    balanceOf[to] += amount;
  }

  function approve(address spender, uint256 amount) external returns (bool) {
    allowance[msg.sender][spender] = amount;
    return true;
  }

  function transfer(address to, uint256 value) external returns (bool) {
    balanceOf[msg.sender] -= value;
    balanceOf[to] += value;
    return true;
  }

  function transferFrom(address from, address to, uint256 value) external returns (bool) {
    uint256 allowed = allowance[from][msg.sender];
    if (allowed != type(uint256).max) {
      allowance[from][msg.sender] = allowed - value;
    }
    balanceOf[from] -= value;
    balanceOf[to] += value;
    return true;
  }
}

contract ArcGroupFactoryTest is Test {
  MockToken internal token;
  ArcGroupFactory internal factory;

  address internal organizer = address(0xA1);
  address internal p1 = address(0xB1);
  address internal p2 = address(0xB2);

  function setUp() external {
    token = new MockToken();
    factory = new ArcGroupFactory(address(token));

    token.mint(p1, 10_000e6);
    token.mint(p2, 10_000e6);

    vm.prank(p1);
    token.approve(address(factory), type(uint256).max);
    vm.prank(p2);
    token.approve(address(factory), type(uint256).max);
  }

  function testCreateDealAndDepositFlow() external {
    uint64 nowTs = uint64(block.timestamp);
    ArcGroupFactory.CreateDealParams memory params = ArcGroupFactory.CreateDealParams({
      inviteCodeHash: keccak256("invite"),
      minParticipants: 2,
      maxParticipants: 5,
      unitPrice: 1_000e6,
      depositPerParticipant: 200e6,
      depositDeadline: nowTs + 1 days,
      finalDeadline: nowTs + 3 days
    });

    vm.prank(organizer);
    address dealAddress = factory.createDeal(params);
    ArcGroupDeal deal = ArcGroupDeal(dealAddress);

    vm.prank(p1);
    token.approve(dealAddress, type(uint256).max);
    vm.prank(p2);
    token.approve(dealAddress, type(uint256).max);

    vm.prank(p1);
    deal.payDeposit(keccak256("invite"));
    vm.prank(p2);
    deal.payDeposit(keccak256("invite"));

    assertEq(uint256(deal.state()), uint256(ArcGroupDeal.DealState.FinalPaymentOpen));
  }
}

