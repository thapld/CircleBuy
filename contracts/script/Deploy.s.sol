// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ArcGroupFactory.sol";

contract DeployScript is Script {
  function run() external returns (ArcGroupFactory factory) {
    uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
    address token = vm.envAddress("PAYMENT_TOKEN_ADDRESS");

    vm.startBroadcast(deployerPrivateKey);
    factory = new ArcGroupFactory(token);
    vm.stopBroadcast();
  }
}

