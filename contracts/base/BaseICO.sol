pragma solidity 0.4.24;

import "../flavours/Ownable.sol";
import "../flavours/Whitelisted.sol";
import "./BaseICOToken.sol";


/**
 * @dev Base abstract smart contract for any ICO
 */
contract BaseICO is Ownable, Whitelisted {

    /// @dev ICO state
    enum State {

        // ICO is not active and not started
        Inactive,

        // ICO is active, tokens can be distributed among investors.
        // ICO parameters (end date, hard/low caps) cannot be changed.
        Active,

        // ICO is suspended, tokens cannot be distributed among investors.
        // ICO can be resumed to `Active state`.
        // ICO parameters (end date, hard/low caps) may changed.
        Suspended,

        // ICO is terminated by owner, ICO cannot be resumed.
        Terminated,

        // ICO goals are not reached,
        // ICO terminated and cannot be resumed.
        NotCompleted,

        // ICO completed, ICO goals reached successfully,
        // ICO terminated and cannot be resumed.
        Completed
    }

    /// @dev Token which controlled by this ICO
    BaseICOToken public token;

    /// @dev Current ICO state.
    State public state;

    /// @dev ICO start date seconds since epoch.
    uint public startAt;

    /// @dev ICO end date seconds since epoch.
    uint public endAt;

    /// @dev Minimal amount of investments in wei needed for successful ICO
    uint public lowCapWei;

    /// @dev Maximal amount of investments in wei for this ICO.
    /// If reached ICO will be in `Completed` state.
    uint public hardCapWei;

    /// @dev Minimal amount of investments in wei per investor.
    uint public lowCapTxWei;

    /// @dev Maximal amount of investments in wei per investor.
    uint public hardCapTxWei;

    /// @dev Number of investments collected by this ICO
    uint public collectedWei;

    /// @dev Number of sold tokens by this ICO
    uint public tokensSold;

    /// @dev Team wallet used to collect funds
    address public teamWallet;

    // ICO state transition events
    event ICOStarted(uint indexed endAt, uint lowCapWei, uint hardCapWei, uint lowCapTxWei, uint hardCapTxWei);
    event ICOResumed(uint indexed endAt, uint lowCapWei, uint hardCapWei, uint lowCapTxWei, uint hardCapTxWei);
    event ICOSuspended();
    event ICOTerminated();
    event ICONotCompleted();
    event ICOCompleted(uint collectedWei);
    event ICOInvestment(address indexed from, uint investedWei, uint tokens, uint8 bonusPct);

    modifier isSuspended() {
        require(state == State.Suspended);
        _;
    }

    modifier isActive() {
        require(state == State.Active);
        _;
    }

    constructor(address icoToken_,
        address teamWallet_,
        uint lowCapWei_,
        uint hardCapWei_,
        uint lowCapTxWei_,
        uint hardCapTxWei_) public {
        require(icoToken_ != address(0) && teamWallet_ != address(0));
        token = BaseICOToken(icoToken_);
        teamWallet = teamWallet_;
        lowCapWei = lowCapWei_;
        hardCapWei = hardCapWei_;
        lowCapTxWei = lowCapTxWei_;
        hardCapTxWei = hardCapTxWei_;
    }

    /**
     * @dev Trigger start of ICO.
     * @param endAt_ ICO end date, seconds since epoch.
     */
    function start(uint endAt_) public onlyOwner {
        require(endAt_ > block.timestamp && state == State.Inactive);
        endAt = endAt_;
        startAt = block.timestamp;
        state = State.Active;
        emit ICOStarted(endAt, lowCapWei, hardCapWei, lowCapTxWei, hardCapTxWei);
    }

    /**
     * @dev Suspend this ICO.
     * ICO can be activated later by calling `resume()` function.
     * In suspend state, ICO owner can change basic ICO parameter using `tune()` function,
     * tokens cannot be distributed among investors.
     */
    function suspend() public onlyOwner isActive {
        state = State.Suspended;
        emit ICOSuspended();
    }

    /**
     * @dev Terminate the ICO.
     * ICO goals are not reached, ICO terminated and cannot be resumed.
     */
    function terminate() public onlyOwner {
        require(state != State.Terminated &&
        state != State.NotCompleted &&
        state != State.Completed);
        state = State.Terminated;
        emit ICOTerminated();
    }

    /**
     * @dev Change basic ICO parameters. Can be done only during `Suspended` state.
     * Any provided parameter is used only if it is not zero.
     * @param endAt_ ICO end date seconds since epoch. Used if it is not zero.
     * @param lowCapWei_ ICO low capacity. Used if it is not zero.
     * @param hardCapWei_ ICO hard capacity. Used if it is not zero.
     * @param lowCapTxWei_ Min limit for ICO per transaction
     * @param hardCapTxWei_ Hard limit for ICO per transaction
     */
    function tune(uint endAt_,
        uint lowCapWei_,
        uint hardCapWei_,
        uint lowCapTxWei_,
        uint hardCapTxWei_) public onlyOwner isSuspended {
        if (endAt_ > block.timestamp) {
            endAt = endAt_;
        }
        if (lowCapWei_ > 0) {
            lowCapWei = lowCapWei_;
        }
        if (hardCapWei_ > 0) {
            hardCapWei = hardCapWei_;
        }
        if (lowCapTxWei_ > 0) {
            lowCapTxWei = lowCapTxWei_;
        }
        if (hardCapTxWei_ > 0) {
            hardCapTxWei = hardCapTxWei_;
        }
        require(lowCapWei <= hardCapWei && lowCapTxWei <= hardCapTxWei);
        touch();
    }

    /**
     * @dev Resume a previously suspended ICO.
     */
    function resume() public onlyOwner isSuspended {
        state = State.Active;
        emit ICOResumed(endAt, lowCapWei, hardCapWei, lowCapTxWei, hardCapTxWei);
        touch();
    }

    /**
     * @dev Recalculate ICO state based on current block time.
     * Should be called periodically by ICO owner.
     */
    function touch() public;

    /**
     * @dev Buy tokens
     */
    function buyTokens() public payable;

    /**
     * @dev Send ether to the fund collection wallet
     */
    function forwardFunds() internal {
        teamWallet.transfer(msg.value);
    }
}
