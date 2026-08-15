// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {FacilityRegistry} from "./FacilityRegistry.sol";
import {SandboxCapitalVault} from "./SandboxCapitalVault.sol";

/// @notice Deterministic policy boundary for the structured underwriting agent.
/// @dev The agent may propose a quote; it cannot bypass these checks or withdraw capital.
contract RiskGuard {
    uint16 public constant MAX_ADVANCE_BPS = 4_000;
    uint16 public constant MAX_FEE_BPS = 10_000;
    uint16 public constant MIN_GUARANTEE_BPS = 1_000;
    uint16 public constant MAX_BUYER_CONCENTRATION_BPS = 2_500;
    uint64 public constant MAX_TENOR_DAYS = 90;
    uint64 public constant QUOTE_TTL_SECONDS = 600;
    bytes32 public constant POLICY_VERSION = keccak256("2026-08-demo-v1");
    bytes32 public constant MODEL_VERSION = keccak256("structured-agent-v1");
    bytes32 public constant APPROVE_DECISION = keccak256("APPROVE");

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant QUOTE_TYPEHASH = keccak256(
        "FacilityQuote(bytes32 orderId,bytes32 decision,uint16 advanceBps,uint16 feeBps,uint64 expiresAt,bytes32 evidenceId,bytes32 reasonCodesHash,bytes32 policyVersion,bytes32 modelVersion,uint64 nonce)"
    );

    struct FacilityQuote {
        bytes32 orderId;
        bytes32 decision;
        uint16 advanceBps;
        uint16 feeBps;
        uint64 expiresAt;
        bytes32 evidenceId;
        bytes32 reasonCodesHash;
        bytes32 policyVersion;
        bytes32 modelVersion;
        uint64 nonce;
    }

    FacilityRegistry public immutable registry;
    SandboxCapitalVault public immutable vault;
    address public immutable owner;
    bytes32 public immutable domainSeparator;
    mapping(address => bool) public approvedSigners;
    mapping(bytes32 => mapping(uint64 => bool)) public usedQuoteNonces;

    event AgentSignerUpdated(address indexed signer, bool approved);
    event QuoteApproved(bytes32 indexed orderId, bytes32 indexed evidenceId, uint256 amount, bytes32 quoteHash);
    /// @notice Full decision receipt for indexers and reviewers that need to audit the signed terms.
    /// @dev QuoteApproved is retained for backwards compatibility with the current testnet deployment.
    event QuoteDecisionAudited(
        bytes32 indexed orderId,
        bytes32 indexed evidenceId,
        bytes32 decision,
        uint256 amount,
        uint16 advanceBps,
        uint16 feeBps,
        uint64 expiresAt,
        bytes32 reasonCodesHash,
        bytes32 policyVersion,
        bytes32 modelVersion,
        uint64 nonce,
        bytes32 quoteHash
    );

    error Unauthorized();
    error AdvanceLimit();
    error FeeLimit();
    error GuaranteeTooLow();
    error TenorLimit();
    error BuyerConcentration();
    error QuoteExpired();
    error UnknownSigner();
    error PolicyVersionMismatch();
    error ModelVersionMismatch();
    error InvalidState();
    error EvidenceMismatch();
    error InvalidNonce();
    error InvalidSignature();
    error InvalidDecision();
    error InvalidReservationAmount();
    error InsufficientLiquidity();

    constructor(address initialOwner, FacilityRegistry facilityRegistry, SandboxCapitalVault capitalVault) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
        registry = facilityRegistry;
        vault = capitalVault;
        domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("LoomCredit RiskGuard"), keccak256("1"), block.chainid, address(this)
            )
        );
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setAgentSigner(address signer, bool approved) external onlyOwner {
        if (signer == address(0)) revert Unauthorized();
        approvedSigners[signer] = approved;
        emit AgentSignerUpdated(signer, approved);
    }

    function quoteDigest(FacilityQuote calldata quote) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                quote.orderId,
                quote.decision,
                quote.advanceBps,
                quote.feeBps,
                quote.expiresAt,
                quote.evidenceId,
                quote.reasonCodesHash,
                quote.policyVersion,
                quote.modelVersion,
                quote.nonce
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function submitQuote(FacilityQuote calldata quote, bytes calldata signature) external returns (uint256 amount) {
        if (quote.decision != APPROVE_DECISION) revert InvalidDecision();
        if (quote.policyVersion != POLICY_VERSION) revert PolicyVersionMismatch();
        if (quote.modelVersion != MODEL_VERSION) revert ModelVersionMismatch();
        if (quote.expiresAt < block.timestamp || quote.expiresAt > block.timestamp + QUOTE_TTL_SECONDS) {
            revert QuoteExpired();
        }
        if (usedQuoteNonces[quote.orderId][quote.nonce]) revert InvalidNonce();

        address signer = _recover(quoteDigest(quote), signature);
        if (!approvedSigners[signer]) revert UnknownSigner();

        FacilityRegistry.TradeEvidence memory evidence = registry.getEvidence(quote.orderId);
        if (evidence.evidenceId != quote.evidenceId) revert EvidenceMismatch();
        if (evidence.state != FacilityRegistry.FacilityState.EvidenceVerified) revert InvalidState();

        if (quote.advanceBps > MAX_ADVANCE_BPS) revert AdvanceLimit();
        if (quote.feeBps > MAX_FEE_BPS) revert FeeLimit();
        if (uint256(evidence.guaranteeAmount) * 10_000 < uint256(evidence.orderValue) * MIN_GUARANTEE_BPS) {
            revert GuaranteeTooLow();
        }
        if (
            evidence.deliveryDeadline < block.timestamp
                || evidence.deliveryDeadline > block.timestamp + MAX_TENOR_DAYS * 1 days
        ) {
            revert TenorLimit();
        }

        amount = (uint256(evidence.orderValue) * quote.advanceBps) / 10_000;
        if (amount == 0) revert InvalidReservationAmount();
        if (amount > vault.availableLiquidity()) revert InsufficientLiquidity();
        uint256 buyerLimit = (vault.totalLiquidity() * MAX_BUYER_CONCENTRATION_BPS) / 10_000;
        if (registry.buyerReservedExposure(evidence.buyer) + amount > buyerLimit) {
            revert BuyerConcentration();
        }

        usedQuoteNonces[quote.orderId][quote.nonce] = true;
        registry.markQuoted(quote.orderId);
        vault.reserve(quote.orderId, evidence.supplier, amount);
        registry.markReserved(quote.orderId, amount);
        bytes32 quoteHash = quoteDigest(quote);
        emit QuoteApproved(quote.orderId, quote.evidenceId, amount, quoteHash);
        emit QuoteDecisionAudited(
            quote.orderId,
            quote.evidenceId,
            quote.decision,
            amount,
            quote.advanceBps,
            quote.feeBps,
            quote.expiresAt,
            quote.reasonCodesHash,
            quote.policyVersion,
            quote.modelVersion,
            quote.nonce,
            quoteHash
        );
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address signer) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
