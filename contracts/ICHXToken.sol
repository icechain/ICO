pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseICOToken.sol";
import "./flavours/SelfDestructible.sol";
import "./flavours/Withdrawal.sol";


/**
 * @title ICHX token contract.
 */
contract ICHXToken is BaseICOToken, SelfDestructible, Withdrawal {
    using SafeMath for uint;

    string public constant name = "IceChain";

    string public constant symbol = "ICHX";

    uint8 public constant decimals = 18;

    uint internal constant ONE_TOKEN = 1e18;

    constructor(uint totalSupplyTokens_,
            uint companyTokens_) public
        BaseICOToken(totalSupplyTokens_.mul(ONE_TOKEN)) {
        require(availableSupply == totalSupply);

        balances[owner] = companyTokens_.mul(ONE_TOKEN);

        availableSupply = availableSupply
            .sub(balances[owner]);

        emit Transfer(0, address(this), balances[owner]);
        emit Transfer(address(this), owner, balances[owner]);
    }

    // Disable direct payments
    function() external payable {
        revert();
    }

    /**
     * @dev Assign `amountWei_` of wei converted into tokens to investor identified by `to_` address.
     * @param to_ Investor address.
     * @param amountWei_ Number of wei invested
     * @param ethTokenExchangeRatio_ Number of tokens in 1 Eth
     * @return Amount of invested tokens
     */
    function icoInvestmentWei(address to_, uint amountWei_, uint ethTokenExchangeRatio_) public onlyICO returns (uint) {
        uint amount = amountWei_.mul(ethTokenExchangeRatio_).mul(ONE_TOKEN).div(1 ether);
        require(isValidICOInvestment(to_, amount));
        availableSupply = availableSupply.sub(amount);
        balances[to_] = balances[to_].add(amount);
        emit ICOTokensInvested(to_, amount);
        return amount;
    }
}