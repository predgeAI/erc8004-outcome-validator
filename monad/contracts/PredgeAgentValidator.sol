// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  PredgeAgentValidator
/// @notice An ERC-8004 **Validation Registry** for agent work on Circle Arc — with the
///         one guarantee the field is missing: **commit-before-outcome**.
///
///         ERC-8004 standardises *that* an agent's work gets validated; it says nothing
///         about *when* the validator fixed its judgement. Every shipped validator today
///         (ScoutScore, the ~8 x402 receipt formats, TEE re-execution) can decide the
///         verdict after seeing the result. Predge cannot: the validation REQUEST — which
///         carries `requestHash`, the keccak256 of the signed acceptance test — is recorded
///         and chain-timestamped BEFORE the worker delivers. The RESPONSE then:
///           • reverts unless that request exists (no verdict on un-requested work),
///           • is written exactly once and can never be rewritten (no flipping after the
///             money moves),
///           • carries `responseHash` = keccak256 of Predge's ed25519 attestation, which
///             stays independently verifiable offline against the published key registry.
///
///         So this is a drop-in ERC-8004 validator — `validationRequest` / `validationResponse`
///         / `getValidationStatus` / `getSummary` are the standard surface any 8004 consumer
///         calls — that additionally proves the test predates the delivery. That property is
///         the only axis the commodity receipt/validator crowd cannot copy by matching JSON.
///
/// @dev    TRUST BOUNDARY (disclosed): ed25519 verification is too expensive on-chain, so the
///         named validator verifies its own attestation OFF-chain and commits `responseHash`
///         (keccak256 of the exact signed bytes). The chain enforces what matters and no one
///         has to trust: request-precedes-response, and response-written-once. Tiny,
///         non-upgradeable, audited-by-inspection — no proxy, no admin verdict, no delete.
contract PredgeAgentValidator {
    /// @dev ERC-8004 `response` is a uint8 score 0–100. Predge projects its verdict onto it:
    ///      DELIVERED = 100, VOID = 50, FAILED = 0. `hasResponse` disambiguates a real 0
    ///      (FAILED) from "no response yet".
    struct Validation {
        address validator; // the named validator for this request
        uint256 agentId; // ERC-8004 agent being validated (0 if not used)
        bytes32 responseHash; // keccak256 of the signed attestation bytes
        uint64 requestedAt; // chain time the acceptance test was committed
        uint64 respondedAt; // chain time the verdict was recorded (0 = pending)
        uint8 response; // 0–100 score; 100 delivered / 0 failed / 50 void
        bool hasResponse; // true once a verdict is written (permanent)
        string tag; // free-form label, e.g. "predge/commit-before-outcome"
    }

    address public owner;
    /// @notice The address allowed to answer requests (Predge's off-chain publisher key,
    ///         which verifies its own ed25519 attestations before writing). Rotatable;
    ///         rotation can never rewrite a past verdict.
    address public validator;

    uint64 public requestCount;
    uint64 public responseCount;

    mapping(bytes32 => Validation) private _v;
    /// @dev requestHash → the URI where the signed acceptance test / evidence lives.
    mapping(bytes32 => string) public requestURIOf;
    mapping(bytes32 => string) public responseURIOf;

    // ── ERC-8004 events (canonical shapes) ────────────────────────────────
    event ValidationRequest(
        address indexed validatorAddress,
        uint256 indexed agentId,
        string requestURI,
        bytes32 indexed requestHash
    );
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );
    event ValidatorUpdated(address indexed previousValidator, address indexed newValidator);

    error NotOwner();
    error NotValidator();
    error ZeroAddress();
    error ZeroHash();
    error AlreadyRequested();
    error NotRequested();
    error AlreadyResponded();
    error BadScore();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address validator_) {
        if (validator_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        validator = validator_;
    }

    // ─────────────────────────── ERC-8004 write path ───────────────────────────

    /// @notice Record a validation request BEFORE the work's outcome is knowable. This is
    ///         the commit-before-outcome half: `requestHash` is the keccak256 of the signed
    ///         acceptance test, and the chain timestamps it so the later response provably
    ///         could not have been reverse-engineered from the delivered result.
    /// @param validatorAddress the validator expected to answer (must equal this registry's
    ///        `validator`; the parameter is kept for ERC-8004 signature compatibility)
    /// @param agentId          the ERC-8004 agent id under validation (0 if unused)
    /// @param requestURI       pointer to the signed acceptance test / job spec
    /// @param requestHash      keccak256 of the exact signed acceptance-test bytes
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata requestURI,
        bytes32 requestHash
    ) external {
        if (requestHash == bytes32(0)) revert ZeroHash();
        if (validatorAddress != validator) revert NotValidator();
        Validation storage v = _v[requestHash];
        if (v.requestedAt != 0) revert AlreadyRequested();

        v.validator = validatorAddress;
        v.agentId = agentId;
        v.requestedAt = uint64(block.timestamp);
        requestURIOf[requestHash] = requestURI;
        requestCount += 1;

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    /// @notice Record the verdict. Reverts unless the request was committed first
    ///         (`NotRequested`) and reverts if a verdict already exists (`AlreadyResponded`),
    ///         so it is written exactly once and is permanent — the validator cannot flip it
    ///         after settlement. `responseHash` is keccak256 of the signed ed25519 attestation.
    /// @param requestHash  the committed request
    /// @param response     0–100 score (Predge: 100 delivered / 0 failed / 50 void)
    /// @param responseURI  pointer to the signed attestation / Evidence Pack
    /// @param responseHash keccak256 of the exact signed attestation bytes
    /// @param tag          free-form label
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata responseURI,
        bytes32 responseHash,
        string calldata tag
    ) external {
        if (msg.sender != validator) revert NotValidator();
        if (response > 100) revert BadScore();
        if (responseHash == bytes32(0)) revert ZeroHash();

        Validation storage v = _v[requestHash];
        if (v.requestedAt == 0) revert NotRequested();
        if (v.hasResponse) revert AlreadyResponded();

        v.response = response;
        v.responseHash = responseHash;
        v.respondedAt = uint64(block.timestamp);
        v.hasResponse = true;
        v.tag = tag;
        responseURIOf[requestHash] = responseURI;
        responseCount += 1;

        emit ValidationResponse(v.validator, v.agentId, requestHash, response, responseURI, responseHash, tag);
    }

    /// @notice Rotate the validator (operational key rotation). Cannot alter past verdicts.
    function setValidator(address newValidator) external onlyOwner {
        if (newValidator == address(0)) revert ZeroAddress();
        emit ValidatorUpdated(validator, newValidator);
        validator = newValidator;
    }

    // ─────────────────────────── ERC-8004 read path ────────────────────────────
    // Free views — any Arc contract / agent settles against these with no fee.

    /// @notice ERC-8004 `getValidationStatus`.
    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (
            address validatorAddress,
            uint256 agentId,
            uint8 response,
            bytes32 responseHash,
            string memory tag,
            uint256 lastUpdate
        )
    {
        Validation storage v = _v[requestHash];
        return (
            v.validator,
            v.agentId,
            v.response,
            v.responseHash,
            v.tag,
            v.respondedAt != 0 ? v.respondedAt : v.requestedAt
        );
    }

    /// @notice True once a verdict is permanently recorded.
    function isValidated(bytes32 requestHash) external view returns (bool) {
        return _v[requestHash].hasResponse;
    }

    /// @notice The commit-before-outcome proof: seconds the acceptance test stayed
    ///         committed before the verdict was written. Non-zero on every answered
    ///         request; 0 while pending. This is what the commodity crowd cannot show.
    function commitLeadTime(bytes32 requestHash) external view returns (uint64) {
        Validation storage v = _v[requestHash];
        if (!v.hasResponse) return 0;
        return v.respondedAt - v.requestedAt;
    }

    /// @notice ERC-8004 `getSummary` (single-validator registry): count + average score
    ///         across the supplied requests for one agent.
    function getSummary(uint256 agentId, bytes32[] calldata requestHashes)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        uint256 sum;
        uint64 n;
        for (uint256 i = 0; i < requestHashes.length; i++) {
            Validation storage v = _v[requestHashes[i]];
            if (v.hasResponse && v.agentId == agentId) {
                sum += v.response;
                n += 1;
            }
        }
        return (n, n == 0 ? 0 : uint8(sum / n));
    }
}
