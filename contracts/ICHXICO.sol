pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseICO.sol";
import "./flavours/SelfDestructible.sol";
import "./flavours/Withdrawal.sol";


/**
 * @title ICHX tokens ICO contract.
 */
contract ICHXICO is BaseICO, SelfDestructible, Withdrawal {
    using SafeMath for uint;

    /// @dev Total number of invested wei
    uint public collectedWei;

    // @dev investments distribution
    mapping (address => uint) public investments;

    /// @dev 1e18 WEI == 1ETH == 16700 tokens
    uint public constant ETH_TOKEN_EXCHANGE_RATIO = 16700;

    constructor(address icoToken_,
                address teamWallet_,
                uint lowCapWei_,
                uint hardCapWei_,
                uint lowCapTxWei_,
                uint hardCapTxWei_) public
        BaseICO(icoToken_, teamWallet_, lowCapWei_, hardCapWei_, lowCapTxWei_, hardCapTxWei_) {
    }

    /**
     * Accept direct payments
     */
    function() external payable {
        buyTokens();
    }

    /**
     * @dev Recalculate ICO state based on current block time.
     * Should be called periodically by ICO owner.
     */
    function touch() public {
        if (state != State.Active && state != State.Suspended) {
            return;
        }
        if (collectedWei >= hardCapWei) {
            state = State.Completed;
            endAt = block.timestamp;
            emit ICOCompleted(collectedWei);
        } else if (block.timestamp >= endAt) {
            if (collectedWei < lowCapWei) {
                state = State.NotCompleted;
                emit ICONotCompleted();
            } else {
                state = State.Completed;
                emit ICOCompleted(collectedWei);
            }
        }
    }

    function buyTokens() public payable {
        require(state == State.Active &&
                block.timestamp < endAt &&
                msg.value >= lowCapTxWei &&
                msg.value <= hardCapTxWei &&
                collectedWei + msg.value <= hardCapWei &&
                whitelisted(msg.sender));
        uint amountWei = msg.value;

        uint iTokens = token.icoInvestmentWei(msg.sender, amountWei, ETH_TOKEN_EXCHANGE_RATIO);
        collectedWei = collectedWei.add(amountWei);
        tokensSold = tokensSold.add(iTokens);
        investments[msg.sender] = investments[msg.sender].add(amountWei);

        emit ICOInvestment(msg.sender, amountWei, iTokens, 0);
        forwardFunds();
        touch();
    }

    function getInvestments(address investor) public view returns (uint) {
        return investments[investor];
    }
}
