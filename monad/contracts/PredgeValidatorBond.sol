// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  PredgeValidatorBond
/// @notice Capital behind a verdict. The validation agent's blunt conclusion was that a
///         signed attestation is commodity — every competitor emits the same ed25519 + JCS
///         receipt, so matching the format is worth nothing. The one axis they cannot copy
///         is **skin in the game**: a validator that stakes money it loses if it is caught
///         lying. This contract is that stake, and — because Predge's acceptance test is
///         DETERMINISTIC (`sha256(deliverable) == expected`) — the slash is **trustless**:
///         anyone can prove a dishonest verdict on-chain with the `sha256` precompile. No
///         DAO vote, no optimistic dispute, no trusted adjudicator.
///
///         The deliverable is NEVER supplied by the challenger. It is read from the job
///         contract, where the PROVIDER — a different party, a different key — committed it
///         in its own transaction. The slash is therefore a comparison of two independent
///         on-chain commitments, and there is nothing for a challenger to forge.
///
///         Flow, per validation:
///           1. `stakeAndCommit(requestHash, expected, jobId)` — the validator posts a bond
///              and commits the acceptance test (the hash the provider's deliverable must
///              equal) BEFORE the work exists. The job is bound here: its `specHash` must be
///              this `requestHash` and its evaluator must be this validator, so the bond can
///              only ever be attached to a job this validator actually judges.
///           2. `recordScore(requestHash, score)` — the validator records its verdict
///              (100 = delivered / 0 = failed). This is the claim its bond backs.
///           3. `challenge(requestHash)` — ANYONE can call, with no arguments to forge. The
///              contract reads the deliverable the provider submitted to the job and slashes
///              the bond to the challenger iff the recorded verdict contradicts it:
///                 score 100 but deliverable != expected → falsely passed → SLASH
///                 score 0   but deliverable == expected → falsely failed → SLASH
///              An honest verdict is unslashable: with both sides of the comparison fixed
///              on-chain by two different parties, a challenge against it always reverts.
///           4. `reclaim(requestHash)` — after the dispute window, measured FROM THE VERDICT
///              (`recordScore`), with no successful challenge, the validator withdraws its bond.
///
///         The stake size is the validator's choice per request, and it is an economic floor as
///         much as a moral one: below the gas a challenge costs on that chain, nobody sends one
///         and the bond secures nothing. Demo loops here stake dust deliberately; a production
///         validator sizes the stake far above challenge gas.
///
///         So the validator's attestation is not "trust our signature" — it is "we have
///         staked USDC that anyone can take if we are wrong, and the test is public and
///         deterministic." That is the credible-commitment the receipt crowd lacks.
///
/// @dev    Bond is native value (on Arc, gas — and value — is USDC-denominated). Deterministic
///         acceptance tests only: `void`/subjective scores are recorded in the ERC-8004
///         registry but are out of scope here, because only a deterministic test can be
///         re-run trustlessly on-chain. Tiny, non-upgradeable, checks-effects-interactions.
/// @notice The slice of the ERC-8183 job contract this bond reads: what the provider
///         actually submitted, and who the job belongs to.
interface IAgentJob {
    function jobs(uint256 jobId)
        external
        view
        returns (
            address client,
            address provider,
            address evaluator,
            uint96 escrow,
            bytes32 specHash,
            bytes32 deliverable,
            bytes32 reason,
            uint8 state
        );
}

contract PredgeValidatorBond {
    struct Stake {
        bytes32 expected; // sha256 the deliverable must match (committed before work)
        uint96 bond; // native value staked behind the verdict
        uint64 stakedAt; // chain time of the commitment
        uint8 score; // recorded verdict: 100 delivered / 0 failed
        bool scored; // true once a verdict is recorded
        bool closed; // true once slashed or reclaimed (permanent)
        uint256 jobId; // the job whose provider-submitted deliverable settles a challenge
        uint64 scoredAt; // chain time the verdict was recorded; the dispute window runs from here
    }

    address public owner;
    address public validator;
    IAgentJob public immutable job; // the counterparty contract a challenge reads the deliverable from
    uint64 public disputeWindow; // seconds a verdict stays challengeable after scoring
    uint96 public totalBonded;
    uint64 public slashCount;

    mapping(bytes32 => Stake) public stakes;

    event Committed(bytes32 indexed requestHash, bytes32 expected, uint96 bond, uint64 stakedAt);
    event Scored(bytes32 indexed requestHash, uint8 score, uint64 scoredAt);
    event Slashed(bytes32 indexed requestHash, address indexed challenger, uint96 bond, uint8 recordedScore, bytes32 deliveredHash);
    event Reclaimed(bytes32 indexed requestHash, uint96 bond);
    event ValidatorUpdated(address indexed previousValidator, address indexed newValidator);

    error NotOwner();
    error NotValidator();
    error ZeroAddress();
    error ZeroHash();
    error ZeroBond();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyScored();
    error NotScored();
    error Closed();
    error BadScore();
    error VerdictHonest();
    error WindowOpen();
    error TransferFailed();
    error JobNotBound();
    error NotSubmitted();
    error ProviderIsValidator();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    modifier onlyValidator() {
        if (msg.sender != validator) revert NotValidator();
        _;
    }

    constructor(address validator_, address job_, uint64 disputeWindow_) {
        if (validator_ == address(0) || job_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        validator = validator_;
        job = IAgentJob(job_);
        disputeWindow = disputeWindow_;
    }

    /// @notice Stake a bond and commit the acceptance test, BEFORE the work, against a job.
    /// @dev The job binding is what makes a later challenge unforgeable: the deliverable a
    ///      challenge compares against comes from the provider's own transaction on `job`,
    ///      never from the challenger. Binding is checked here, while the bond is being
    ///      posted, so a validator cannot point its bond at an unrelated job afterwards.
    function stakeAndCommit(bytes32 requestHash, bytes32 expected, uint256 jobId)
        external
        payable
        onlyValidator
    {
        if (expected == bytes32(0)) revert ZeroHash();
        if (msg.value == 0) revert ZeroBond();
        Stake storage s = stakes[requestHash];
        if (s.stakedAt != 0) revert AlreadyCommitted();

        (, address provider, address evaluator, , bytes32 specHash, , , ) = job.jobs(jobId);
        // The job must be the one this verdict is about, and this validator must hold its
        // evaluator seat — otherwise the bond backs a claim about someone else's work.
        if (specHash != requestHash || evaluator != validator) revert JobNotBound();
        // A validator that is also the provider writes both sides of the comparison and can
        // never be caught, which would make the bond theatre.
        if (provider == validator) revert ProviderIsValidator();

        s.expected = expected;
        s.bond = uint96(msg.value);
        s.stakedAt = uint64(block.timestamp);
        s.jobId = jobId;
        totalBonded += uint96(msg.value);

        emit Committed(requestHash, expected, uint96(msg.value), s.stakedAt);
    }

    /// @notice Record the verdict the bond backs. 100 = delivered, 0 = failed.
    function recordScore(bytes32 requestHash, uint8 score) external onlyValidator {
        if (score != 0 && score != 100) revert BadScore();
        Stake storage s = stakes[requestHash];
        if (s.stakedAt == 0) revert NotCommitted();
        if (s.scored) revert AlreadyScored();
        s.score = score;
        s.scored = true;
        s.scoredAt = uint64(block.timestamp);
        emit Scored(requestHash, score, uint64(block.timestamp));
    }

    /// @notice Prove the recorded verdict contradicts what the provider actually delivered,
    ///         and take the bond. Takes no evidence from the caller: both sides of the
    ///         comparison are already on-chain, written by two different parties — `expected`
    ///         by the validator when it staked, `deliverable` by the provider when it
    ///         submitted to the job. So there is nothing here to forge, and an honest verdict
    ///         reverts no matter who calls or what they hold.
    function challenge(bytes32 requestHash) external {
        Stake storage s = stakes[requestHash];
        if (s.stakedAt == 0) revert NotCommitted();
        if (!s.scored) revert NotScored();
        if (s.closed) revert Closed();

        bytes32 delivered = _delivered(s.jobId);
        bool matches = delivered == s.expected;
        // A lie is a recorded verdict the provider's own submission contradicts.
        bool lied = (s.score == 100 && !matches) || (s.score == 0 && matches);
        if (!lied) revert VerdictHonest();

        uint96 bond = s.bond;
        s.closed = true; // effects before interaction
        s.bond = 0;
        totalBonded -= bond;
        slashCount += 1;
        emit Slashed(requestHash, msg.sender, bond, s.score, delivered);

        (bool ok, ) = payable(msg.sender).call{value: bond}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev The provider's committed deliverable, or a revert while there is still nothing to
    ///      compare against. State 2 is Submitted, 3 Completed, 4 Rejected — from Submitted on,
    ///      `deliverable` is final, so a verdict can be judged against it.
    function _delivered(uint256 jobId) internal view returns (bytes32) {
        (, , , , , bytes32 deliverable, , uint8 state) = job.jobs(jobId);
        if (state < 2) revert NotSubmitted();
        return deliverable;
    }

    /// @notice After the dispute window with no successful challenge, the validator
    ///         withdraws its bond — the verdict stood.
    function reclaim(bytes32 requestHash) external onlyValidator {
        Stake storage s = stakes[requestHash];
        if (s.stakedAt == 0) revert NotCommitted();
        if (!s.scored) revert NotScored();
        if (s.closed) revert Closed();
        // The dispute window runs from the VERDICT, not the stake. If it ran from `stakedAt`,
        // a validator could stake, let the window elapse, and only then record a score the
        // provider's on-chain deliverable contradicts — reclaiming in the same breath, with
        // no time left for anyone to challenge. `recordScore` has no deadline, so the window
        // has to start when the verdict (the thing a challenge checks) actually exists.
        if (block.timestamp < s.scoredAt + disputeWindow) revert WindowOpen();

        uint96 bond = s.bond;
        s.closed = true;
        s.bond = 0;
        totalBonded -= bond;
        emit Reclaimed(requestHash, bond);

        (bool ok, ) = payable(validator).call{value: bond}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Is this verdict slashable right now? A free check before spending gas.
    function wouldSlash(bytes32 requestHash) external view returns (bool) {
        Stake storage s = stakes[requestHash];
        if (!s.scored || s.closed) return false;
        (, , , , , bytes32 delivered, , uint8 state) = job.jobs(s.jobId);
        if (state < 2) return false;
        bool matches = delivered == s.expected;
        return (s.score == 100 && !matches) || (s.score == 0 && matches);
    }

    function setValidator(address newValidator) external onlyOwner {
        if (newValidator == address(0)) revert ZeroAddress();
        emit ValidatorUpdated(validator, newValidator);
        validator = newValidator;
    }
}
