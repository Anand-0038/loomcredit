// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

interface Vm {
    function expectRevert(bytes4 revertData) external;
}

contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool value) internal pure {
        require(value, "assertTrue failed");
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "assertEq uint failed");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "assertEq address failed");
    }
}
