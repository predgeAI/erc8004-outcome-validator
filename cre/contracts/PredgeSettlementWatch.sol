// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice CRE receiver interface (KeystoneForwarder calls onReport after checking DON signatures).
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @title PredgeSettlementWatch
/// @notice Stores the latest result of the Predge settlement watch CRE workflow for each market.
///         Agents read `watches(requestHash)` (or listen for `Watched`) before acting on a
///         prediction-market outcome: is a dispute open, and does the Predge verdict on Monad agree
///         with the newest signed Predge record?
/// @dev Only the configured CRE forwarder can deliver reports. On Monad testnet that is the
///      MockKeystoneForwarder 0xB9F79d863261869B234c481D1f9A7af84AeAd192 for `cre workflow simulate
///      --broadcast`, and the KeystoneForwarder 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 for a
///      deployed workflow. Optionally pin the workflow owner too.
contract PredgeSettlementWatch is IReceiver, IERC165 {
    uint8 public constant NONE = 255;

    // status codes, same order as STATUS_CODE in settlement-watch/logic.ts
    uint8 public constant CONSISTENT = 0;
    uint8 public constant CONFLICT = 1;
    uint8 public constant NO_ONCHAIN_VERDICT = 2;
    uint8 public constant UNSETTLED = 3;
    uint8 public constant OPEN_DISPUTE = 4;

    struct Watch {
        string marketId;
        string riskLevel;
        bool openDispute;
        uint8 onchainVerdict; // 100, 0, or NONE
        uint8 expectedVerdict; // 100, 0, or NONE
        uint8 status;
        bytes32 contentHash; // sha256 of the signed Predge record the DON verified
        uint64 updatedAt;
    }

    address public owner;
    address public forwarder;
    address public expectedWorkflowOwner; // zero = not checked

    mapping(bytes32 => Watch) public watches; // keyed by the PredgeAgentValidator requestHash
    uint256 public reports;

    event Watched(
        bytes32 indexed requestHash,
        string marketId,
        string riskLevel,
        bool openDispute,
        uint8 onchainVerdict,
        uint8 expectedVerdict,
        uint8 status,
        bytes32 contentHash
    );
    event Conflict(bytes32 indexed requestHash, string marketId, uint8 onchainVerdict, uint8 expectedVerdict);
    event ForwarderSet(address forwarder);
    event WorkflowOwnerSet(address workflowOwner);

    error NotOwner();
    error NotForwarder(address sender);
    error WrongWorkflowOwner(address got);

    constructor(address forwarder_) {
        owner = msg.sender;
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    function setForwarder(address f) external {
        if (msg.sender != owner) revert NotOwner();
        forwarder = f;
        emit ForwarderSet(f);
    }

    function setExpectedWorkflowOwner(address a) external {
        if (msg.sender != owner) revert NotOwner();
        expectedWorkflowOwner = a;
        emit WorkflowOwnerSet(a);
    }

    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        if (expectedWorkflowOwner != address(0)) {
            // metadata = workflowId (32) | workflowName (10) | workflowOwner (20) | ...
            address wfOwner = address(bytes20(metadata[42:62]));
            if (wfOwner != expectedWorkflowOwner) revert WrongWorkflowOwner(wfOwner);
        }
        (
            string memory marketId,
            bytes32 requestHash,
            string memory riskLevel,
            bool openDispute,
            uint8 onchainVerdict,
            uint8 expectedVerdict,
            uint8 status,
            bytes32 contentHash
        ) = abi.decode(report, (string, bytes32, string, bool, uint8, uint8, uint8, bytes32));

        watches[requestHash] = Watch(
            marketId, riskLevel, openDispute, onchainVerdict, expectedVerdict, status, contentHash, uint64(block.timestamp)
        );
        reports += 1;
        emit Watched(requestHash, marketId, riskLevel, openDispute, onchainVerdict, expectedVerdict, status, contentHash);
        if (status == CONFLICT) emit Conflict(requestHash, marketId, onchainVerdict, expectedVerdict);
    }

    /// @notice True when an agent may act on the stored result: no open dispute and the verdict on
    ///         chain agrees with the signed record.
    function safeToAct(bytes32 requestHash) external view returns (bool) {
        Watch storage w = watches[requestHash];
        return w.updatedAt != 0 && !w.openDispute && w.status == CONSISTENT;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
