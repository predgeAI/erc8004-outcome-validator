// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  AgentJob
/// @notice A minimal ERC-8183-style agent job with escrowed USDC, whose EVALUATOR is a
///         Predge validator. ERC-8183 is Arc's job standard, and its trust hole is explicit:
///         "the client is also the evaluator" — whoever pays decides whether the work passed.
///         This contract keeps the exact ERC-8183 evaluator surface (`submit` / `complete` /
///         `reject`, each taking a `bytes32 reason`), but the evaluator is an INDEPENDENT
///         address named at job creation, and Predge fills that seat with a verdict that is
///         committed-before-outcome, ed25519-signed, and backed by a slashable bond.
///
///         `reason` is the ERC-8183 attestation commitment — here, the keccak256 of Predge's
///         signed verdict, so an on-chain job settlement points straight at an offline-verifiable
///         proof. Events emit `reason` for composition with an ERC-8004 reputation summary.
///
///         Lifecycle: createJob (client escrows USDC, names evaluator + spec) → submit
///         (provider) → complete (evaluator pays provider) / reject (evaluator refunds client).
///
/// @dev    Native value = USDC on Arc. Evaluator-gated, checks-effects-interactions, no admin
///         override of a verdict. Deliberately tiny; this is the counterparty-side contract a
///         real client deploys/uses — Predge only ever holds the evaluator seat.
contract AgentJob {
    enum State {
        None,
        Open,
        Submitted,
        Completed,
        Rejected
    }

    struct Job {
        address client; // who pays, and is refunded on reject
        address provider; // the worker, paid on complete
        address evaluator; // the independent verdict authority (a Predge validator)
        uint96 escrow; // USDC held until the evaluator decides
        bytes32 specHash; // the committed acceptance test (== Predge requestHash)
        bytes32 deliverable; // what the provider submitted
        bytes32 reason; // the evaluator's attestation commitment (Predge responseHash)
        State state;
    }

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(uint256 indexed jobId, address indexed client, address indexed evaluator, address provider, uint96 escrow, bytes32 specHash);
    event Submitted(uint256 indexed jobId, bytes32 deliverable);
    event Completed(uint256 indexed jobId, bytes32 reason, address provider, uint96 paid);
    event Rejected(uint256 indexed jobId, bytes32 reason, address client, uint96 refunded);

    error ZeroAddress();
    error ZeroEscrow();
    error NotProvider();
    error NotEvaluator();
    error BadState();
    error TransferFailed();

    /// @notice Client opens a job, escrows USDC, and names the independent evaluator + the
    ///         acceptance-test commitment. `specHash` should equal the Predge validator's
    ///         `requestHash`, so the same committed-before-outcome test governs settlement.
    function createJob(address provider, address evaluator, bytes32 specHash)
        external
        payable
        returns (uint256 jobId)
    {
        if (provider == address(0) || evaluator == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroEscrow();
        jobId = ++jobCount;
        jobs[jobId] = Job({
            client: msg.sender,
            provider: provider,
            evaluator: evaluator,
            escrow: uint96(msg.value),
            specHash: specHash,
            deliverable: bytes32(0),
            reason: bytes32(0),
            state: State.Open
        });
        emit JobCreated(jobId, msg.sender, evaluator, provider, uint96(msg.value), specHash);
    }

    /// @notice ERC-8183 `submit` — the provider hands in a deliverable commitment.
    function submit(uint256 jobId, bytes32 deliverable, bytes calldata) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.provider) revert NotProvider();
        if (j.state != State.Open) revert BadState();
        j.deliverable = deliverable;
        j.state = State.Submitted;
        emit Submitted(jobId, deliverable);
    }

    /// @notice ERC-8183 `complete` — EVALUATOR ONLY. Pays the provider and records the
    ///         attestation commitment. `reason` = keccak256 of Predge's signed verdict.
    function complete(uint256 jobId, bytes32 reason, bytes calldata) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.evaluator) revert NotEvaluator();
        if (j.state != State.Submitted) revert BadState();
        uint96 amt = j.escrow;
        j.escrow = 0;
        j.reason = reason;
        j.state = State.Completed;
        emit Completed(jobId, reason, j.provider, amt);
        (bool ok, ) = payable(j.provider).call{value: amt}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice ERC-8183 `reject` — EVALUATOR ONLY. Refunds the client; the provider is paid
    ///         nothing. `reason` = keccak256 of Predge's signed (failing) verdict.
    function reject(uint256 jobId, bytes32 reason, bytes calldata) external {
        Job storage j = jobs[jobId];
        if (msg.sender != j.evaluator) revert NotEvaluator();
        if (j.state != State.Submitted) revert BadState();
        uint96 amt = j.escrow;
        j.escrow = 0;
        j.reason = reason;
        j.state = State.Rejected;
        emit Rejected(jobId, reason, j.client, amt);
        (bool ok, ) = payable(j.client).call{value: amt}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Everything a reader needs about a job's settlement.
    function jobState(uint256 jobId)
        external
        view
        returns (State state, bytes32 specHash, bytes32 deliverable, bytes32 reason, uint96 escrow)
    {
        Job storage j = jobs[jobId];
        return (j.state, j.specHash, j.deliverable, j.reason, j.escrow);
    }
}
