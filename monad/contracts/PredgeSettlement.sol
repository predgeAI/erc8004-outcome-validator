// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  PredgeSettlement
/// @notice Minimal on-chain settlement + receipt layer for Predge's pay-per-call
///         data API, deployed on Circle Arc. On Arc, USDC is the native token, so
///         an agent pays for a Predge API route in native USDC and this contract
///         records the payment and emits a verifiable `Paid` receipt. This is the
///         Arc-native settlement leg of Predge's keyless x402 pay-per-call model
///         (Circle grant Milestone 1: settlement runs natively on Arc).
/// @dev    Deliberately tiny and audited-by-inspection. No admin beyond owner
///         withdraw; no upgradeability; receipts are events (cheap, indexable).
contract PredgeSettlement {
    address public owner;

    /// @param payer     the agent/account that paid
    /// @param route     keccak256 of the Predge route id (e.g. "v1/wallets/{address}")
    /// @param amount    native USDC paid (Arc native, 18-decimals wei of USDC)
    /// @param timestamp block time of settlement
    /// @param meta      optional request reference (e.g. the wallet being scored)
    event Paid(
        address indexed payer,
        bytes32 indexed route,
        uint256 amount,
        uint256 timestamp,
        string meta
    );

    event Withdrawn(address indexed to, uint256 amount);

    error NotOwner();
    error ZeroPayment();
    error WithdrawFailed();

    constructor() {
        owner = msg.sender;
    }

    /// @notice Pay for a Predge API route in native USDC; emits a `Paid` receipt.
    ///         The x402 path can require this settlement + verify the receipt on Arc.
    /// @param route keccak256 route id
    /// @param meta  optional request reference
    function payForRoute(bytes32 route, string calldata meta) external payable {
        if (msg.value == 0) revert ZeroPayment();
        emit Paid(msg.sender, route, msg.value, block.timestamp, meta);
    }

    /// @notice Owner withdraws accumulated settlement to `to`.
    function withdraw(address payable to) external {
        if (msg.sender != owner) revert NotOwner();
        uint256 bal = address(this).balance;
        (bool ok, ) = to.call{value: bal}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, bal);
    }

    /// @notice Bare payment (no route metadata) still produces a receipt.
    receive() external payable {
        if (msg.value == 0) revert ZeroPayment();
        emit Paid(msg.sender, bytes32("direct"), msg.value, block.timestamp, "");
    }
}
