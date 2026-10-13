// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TestUSD
/// @notice TESTNET ONLY. A 6-decimal stand-in for USDC with an open faucet, used because the
///         official Kuru testnet USDC (0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570) has no public
///         mint. It has no value and no backing. The note factory takes any ERC-20 as collateral,
///         so on mainnet it would be USDC or AUSD.
contract TestUSD {
    string public constant name = "Predge Test USD (Monad testnet, no value)";
    string public constant symbol = "tUSD";
    uint8 public constant decimals = 6;
    uint256 public constant FAUCET_MAX = 1_000_000 * 1e6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error Insufficient();
    error OverFaucetMax();

    /// @notice Anyone can mint up to 1,000,000 tUSD per call. Testnet only.
    function faucet(address to, uint256 amount) external {
        if (amount > FAUCET_MAX) revert OverFaucetMax();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < amount) revert Insufficient();
            allowance[from][msg.sender] = a - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 b = balanceOf[from];
        if (b < amount) revert Insufficient();
        balanceOf[from] = b - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
