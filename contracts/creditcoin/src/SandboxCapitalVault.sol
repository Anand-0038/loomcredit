// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @notice Testnet accounting vault. It does not custody or transfer production assets.
contract SandboxCapitalVault {
    address public immutable owner;
    address public riskGuard;
    address public facilityRegistry;
    uint256 public availableLiquidity;
    uint256 public totalLiquidity;
    mapping(bytes32 => uint256) public reservedByOrder;

    event TestLiquidityDeposited(address indexed depositor, uint256 amount);
    event ReservationCreated(bytes32 indexed orderId, address indexed supplier, uint256 amount);
    event ReservationReleased(bytes32 indexed orderId, uint256 amount);

    error Unauthorized();
    error InsufficientLiquidity();
    error InvalidAmount();

    constructor(address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyRiskGuard() {
        if (msg.sender != riskGuard) revert Unauthorized();
        _;
    }

    modifier onlyFacilityRegistry() {
        if (msg.sender != facilityRegistry) revert Unauthorized();
        _;
    }

    function setRiskGuard(address guard) external onlyOwner {
        if (guard == address(0)) revert Unauthorized();
        riskGuard = guard;
    }

    function setFacilityRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert Unauthorized();
        facilityRegistry = registry;
    }

    function depositTestLiquidity(uint256 amount) external onlyOwner {
        if (amount == 0) revert InvalidAmount();
        availableLiquidity += amount;
        totalLiquidity += amount;
        emit TestLiquidityDeposited(msg.sender, amount);
    }

    function reserve(bytes32 orderId, address supplier, uint256 amount) external onlyRiskGuard {
        if (amount == 0 || amount > availableLiquidity) revert InsufficientLiquidity();
        availableLiquidity -= amount;
        reservedByOrder[orderId] += amount;
        emit ReservationCreated(orderId, supplier, amount);
    }

    function release(bytes32 orderId) external onlyFacilityRegistry {
        uint256 amount = reservedByOrder[orderId];
        reservedByOrder[orderId] = 0;
        availableLiquidity += amount;
        emit ReservationReleased(orderId, amount);
    }
}
