// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice CRE receiver interface. The Chainlink KeystoneForwarder calls onReport after it has
///         checked the DON signatures on the report.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @title NoteToken
/// @notice Plain ERC-20 leg of a dispute-hedge note (HOLD or CHANGE). Only the factory that created
///         it can mint or burn. Same decimals as the collateral, so 1 token = 1 collateral unit at par.
contract NoteToken {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    address public immutable factory;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error OnlyFactory();
    error Insufficient();

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        factory = msg.sender;
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

    function mint(address to, uint256 amount) external {
        if (msg.sender != factory) revert OnlyFactory();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != factory) revert OnlyFactory();
        uint256 b = balanceOf[from];
        if (b < amount) revert Insufficient();
        balanceOf[from] = b - amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function _move(address from, address to, uint256 amount) private {
        uint256 b = balanceOf[from];
        if (b < amount) revert Insufficient();
        balanceOf[from] = b - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

/// @title DisputeNoteFactory
/// @notice Issues fully collateralized dispute-hedge notes on disputed Polymarket markets.
///
///         One note = one disputed UMA proposal on one Polymarket condition. Depositing 1 unit of
///         collateral mints 1 HOLD + 1 CHANGE. At settlement:
///           HOLD   pays 1 if the final payout vector of the condition on Polygon's Conditional
///                  Tokens Framework equals the disputed proposal (the dispute failed),
///           CHANGE pays 1 otherwise (the outcome settled differently from the disputed proposal).
///         It is a claim on settlement risk, not on the event: CHANGE is worth the probability that
///         the dispute changes the outcome.
///
///         Settlement comes from the chain, not from Predge: the only way to settle a condition is a
///         report delivered by the Chainlink CRE forwarder, produced by a workflow whose DON nodes
///         each read CTF.payoutNumerators / payoutDenominator on Polygon at a finalized block and
///         agree on the result. Predge cannot settle a note.
///
///         Until settlement any holder of both legs can merge them back into collateral. If no
///         settlement report arrives before the note's expiry, anyone can call expire() and each leg
///         then redeems for half a unit, so collateral can never be stuck.
contract DisputeNoteFactory is IReceiver, IERC165 {
    struct Note {
        bytes32 conditionId; // Polymarket condition on Polygon CTF
        uint256 proposal0; // disputed proposal as a payout vector, e.g. [0,1] = "No"
        uint256 proposal1;
        bytes32 disputeTx; // Polygon tx of the dispute, for anyone to check the proposal
        uint64 expiry; // after this, expire() allows a 50/50 fallback
        uint8 state; // OPEN, SETTLED_HOLD, SETTLED_CHANGE, EXPIRED
        NoteToken hold;
        NoteToken change;
        uint256 collateralLocked;
        string marketId; // Polymarket market id, informational
    }

    struct Resolution {
        uint256 payout0;
        uint256 payout1;
        uint256 denominator;
        uint64 polygonBlock;
        uint64 reportedAt;
    }

    uint8 public constant OPEN = 0;
    uint8 public constant SETTLED_HOLD = 1;
    uint8 public constant SETTLED_CHANGE = 2;
    uint8 public constant EXPIRED = 3;

    IERC20Min public immutable collateral;
    uint8 public immutable collateralDecimals;
    address public owner;
    address public forwarder;
    address public expectedWorkflowOwner; // zero = not checked
    bytes10 public expectedWorkflowName; // zero = not checked

    Note[] internal _notes;
    mapping(bytes32 => Resolution) public resolutions; // by conditionId, written only by onReport
    mapping(bytes32 => uint256[]) internal _notesByCondition;

    event NoteCreated(
        uint256 indexed noteId, bytes32 indexed conditionId, string marketId, uint256 proposal0, uint256 proposal1,
        bytes32 disputeTx, uint64 expiry, address hold, address change
    );
    event Minted(uint256 indexed noteId, address indexed to, uint256 amount);
    event Merged(uint256 indexed noteId, address indexed from, uint256 amount);
    event ResolutionReported(bytes32 indexed conditionId, uint256 payout0, uint256 payout1, uint256 denominator, uint64 polygonBlock);
    event Settled(uint256 indexed noteId, uint8 state);
    event Redeemed(uint256 indexed noteId, address indexed who, uint256 holdBurned, uint256 changeBurned, uint256 paid);
    event ForwarderSet(address forwarder);
    event WorkflowPinned(address workflowOwner, bytes10 workflowName);
    event OwnerSet(address owner);

    error NotOwner();
    error NotForwarder(address sender);
    error WrongWorkflow();
    error BadProposal();
    error BadNote();
    error NotOpen();
    error NotSettled();
    error NotExpired();
    error Unresolved();
    error AlreadyReported();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address collateral_, address forwarder_) {
        collateral = IERC20Min(collateral_);
        collateralDecimals = IERC20Min(collateral_).decimals();
        owner = msg.sender;
        forwarder = forwarder_;
        emit OwnerSet(msg.sender);
        emit ForwarderSet(forwarder_);
    }

    // ─── admin (listing only; admin cannot settle, move collateral, or change a listed note) ─────

    function setOwner(address o) external onlyOwner {
        owner = o;
        emit OwnerSet(o);
    }

    function setForwarder(address f) external onlyOwner {
        forwarder = f;
        emit ForwarderSet(f);
    }

    function pinWorkflow(address workflowOwner, bytes10 workflowName) external onlyOwner {
        expectedWorkflowOwner = workflowOwner;
        expectedWorkflowName = workflowName;
        emit WorkflowPinned(workflowOwner, workflowName);
    }

    /// @notice List a new note. Curated: the issuer checks the dispute tx and the proposal before
    ///         listing; anyone can re-check them from `disputeTx` on Polygon.
    function createNote(
        bytes32 conditionId,
        uint256[2] calldata proposal,
        bytes32 disputeTx,
        uint64 expiry,
        string calldata marketId,
        string calldata symbolSuffix
    ) external onlyOwner returns (uint256 noteId) {
        if (proposal[0] + proposal[1] == 0) revert BadProposal();
        if (expiry <= block.timestamp) revert BadProposal();
        noteId = _notes.length;
        NoteToken hold = new NoteToken(
            string.concat("Predge HOLD ", marketId, " (dispute fails)"), string.concat("HOLD-", symbolSuffix), collateralDecimals
        );
        NoteToken change = new NoteToken(
            string.concat("Predge CHANGE ", marketId, " (settles differently)"), string.concat("CHG-", symbolSuffix), collateralDecimals
        );
        _notes.push(Note(conditionId, proposal[0], proposal[1], disputeTx, expiry, OPEN, hold, change, 0, marketId));
        _notesByCondition[conditionId].push(noteId);
        emit NoteCreated(noteId, conditionId, marketId, proposal[0], proposal[1], disputeTx, expiry, address(hold), address(change));
        // A condition that already resolved on chain settles new notes at once.
        if (resolutions[conditionId].denominator != 0) _settle(noteId);
    }

    // ─── issuance and redemption ───────────────────────────────────────────────────────────────

    /// @notice Deposit `amount` collateral, receive `amount` HOLD and `amount` CHANGE.
    function mint(uint256 noteId, uint256 amount, address to) external {
        Note storage n = _note(noteId);
        if (n.state != OPEN || block.timestamp >= n.expiry) revert NotOpen();
        _pull(msg.sender, amount);
        n.collateralLocked += amount;
        n.hold.mint(to, amount);
        n.change.mint(to, amount);
        emit Minted(noteId, to, amount);
    }

    /// @notice Burn `amount` HOLD and `amount` CHANGE, get `amount` collateral back. Only while open.
    function merge(uint256 noteId, uint256 amount, address to) external {
        Note storage n = _note(noteId);
        if (n.state != OPEN) revert NotOpen();
        n.hold.burn(msg.sender, amount);
        n.change.burn(msg.sender, amount);
        n.collateralLocked -= amount;
        _push(to, amount);
        emit Merged(noteId, msg.sender, amount);
    }

    /// @notice After settlement or expiry: burn any amounts of either leg, receive what they pay.
    function redeem(uint256 noteId, uint256 holdAmount, uint256 changeAmount, address to) external returns (uint256 paid) {
        Note storage n = _note(noteId);
        uint8 s = n.state;
        if (s == OPEN) revert NotSettled();
        if (holdAmount > 0) n.hold.burn(msg.sender, holdAmount);
        if (changeAmount > 0) n.change.burn(msg.sender, changeAmount);
        if (s == SETTLED_HOLD) paid = holdAmount;
        else if (s == SETTLED_CHANGE) paid = changeAmount;
        else paid = (holdAmount + changeAmount) / 2; // EXPIRED: each leg is worth half
        n.collateralLocked -= paid;
        _push(to, paid);
        emit Redeemed(noteId, msg.sender, holdAmount, changeAmount, paid);
    }

    /// @notice Fallback when no chain resolution was reported before expiry. Anyone can call.
    function expire(uint256 noteId) external {
        Note storage n = _note(noteId);
        if (n.state != OPEN) revert NotOpen();
        if (block.timestamp < n.expiry) revert NotExpired();
        n.state = EXPIRED;
        emit Settled(noteId, EXPIRED);
    }

    // ─── settlement: CRE report only ───────────────────────────────────────────────────────────

    /// @notice report = abi.encode(bytes32 conditionId, uint256 payout0, uint256 payout1,
    ///         uint256 payoutDenominator, uint64 polygonBlock), read by the DON from Polygon CTF.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder(msg.sender);
        if (expectedWorkflowOwner != address(0) || expectedWorkflowName != bytes10(0)) {
            // metadata = workflowId (32) | workflowName (10) | workflowOwner (20) | reportId (2)
            if (metadata.length < 62) revert WrongWorkflow();
            if (expectedWorkflowName != bytes10(0) && bytes10(metadata[32:42]) != expectedWorkflowName) revert WrongWorkflow();
            if (expectedWorkflowOwner != address(0) && address(bytes20(metadata[42:62])) != expectedWorkflowOwner) {
                revert WrongWorkflow();
            }
        }
        (bytes32 conditionId, uint256 p0, uint256 p1, uint256 den, uint64 polygonBlock) =
            abi.decode(report, (bytes32, uint256, uint256, uint256, uint64));
        if (den == 0 || p0 + p1 == 0) revert Unresolved();
        Resolution storage r = resolutions[conditionId];
        if (r.denominator != 0) revert AlreadyReported(); // CTF payouts are final once set
        resolutions[conditionId] = Resolution(p0, p1, den, polygonBlock, uint64(block.timestamp));
        emit ResolutionReported(conditionId, p0, p1, den, polygonBlock);
        uint256[] storage ids = _notesByCondition[conditionId];
        for (uint256 i = 0; i < ids.length; i++) {
            if (_notes[ids[i]].state == OPEN) _settle(ids[i]);
        }
    }

    function _settle(uint256 noteId) internal {
        Note storage n = _notes[noteId];
        Resolution storage r = resolutions[n.conditionId];
        // Same payout vector up to scale: p0 * q1 == p1 * q0 (both vectors are non-zero).
        bool same = r.payout0 * n.proposal1 == r.payout1 * n.proposal0;
        n.state = same ? SETTLED_HOLD : SETTLED_CHANGE;
        emit Settled(noteId, n.state);
    }

    // ─── views ─────────────────────────────────────────────────────────────────────────────────

    function noteCount() external view returns (uint256) {
        return _notes.length;
    }

    function notes(uint256 noteId) external view returns (Note memory) {
        return _note(noteId);
    }

    function notesForCondition(bytes32 conditionId) external view returns (uint256[] memory) {
        return _notesByCondition[conditionId];
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ─── internal ──────────────────────────────────────────────────────────────────────────────

    function _note(uint256 noteId) internal view returns (Note storage) {
        if (noteId >= _notes.length) revert BadNote();
        return _notes[noteId];
    }

    function _pull(address from, uint256 amount) internal {
        (bool ok, bytes memory ret) =
            address(collateral).call(abi.encodeCall(IERC20Min.transferFrom, (from, address(this), amount)));
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = address(collateral).call(abi.encodeCall(IERC20Min.transfer, (to, amount)));
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
