import {ItTestFn} from '../globals';
import * as BigNumber from 'bignumber.js';
import {assertEvmThrows, assertEvmIsNotAContractAddress} from './lib/assert';
import {Seconds, web3IncreaseTimeTo, web3LatestTime} from './lib/time';
import {IICHXICO} from "../contracts";

const EthUtil = require('ethereumjs-util');

const it = (<any>global).it as ItTestFn;
const assert = (<any>global).assert as Chai.AssertStatic;

const ICHXToken = artifacts.require('./ICHXToken.sol');
const ICHXICO = artifacts.require('./ICHXICO.sol');

const ONE_TOKEN = new BigNumber('1e18');
const ONE_ETHER = new BigNumber('1e18');
const ETH_TOKEN_EXCHANGE_RATIO = 16700;

// this value only for currently specified in run-tests-mnemonic.txt seeds!
const OWNER_PKEY: string = "6ef3cb77af5e14f030905f3bac78ae7fd890944436cf0b5744f698635c11ad6e";

function tokens(val: BigNumber.NumberLike): string {
  return new BigNumber(val).times(ONE_TOKEN).toString();
}

function tokens2wei(val: BigNumber.NumberLike): string {
  return new BigNumber(val)
      .mul(ONE_ETHER)
      .divToInt(ETH_TOKEN_EXCHANGE_RATIO)
      .toString();
}

function wei2rawtokens(val: BigNumber.NumberLike): string {
  return new BigNumber(val)
      .mul(ETH_TOKEN_EXCHANGE_RATIO)
      .mul(ONE_TOKEN)
      .divToInt(ONE_ETHER)
      .toString();
}

function signSelfdestruct(privateKey: string, contractAddress: string, address: string): any {
  const buffer = Buffer.concat([
                                 Buffer.from('Signed for Selfdestruct'),
                                 Buffer.from(contractAddress.replace(/^0x/, ''), 'hex'),
                                 Buffer.from(address.replace(/^0x/, ''), 'hex'),
                               ]);
  const hash = EthUtil.hashPersonalMessage(EthUtil.keccak(buffer));
  const signature = EthUtil.ecsign(hash, Buffer.from(privateKey, 'hex'));
  if (!!signature) {
    return {
      v: signature.v,
      r: '0x' + signature.r.toString('hex'),
      s: '0x' + signature.s.toString('hex')
    };
  } else {
    console.error('\x1b[41m%s\x1b[37m', 'Could not sign message for address:', '\x1b[0m', contractAddress);
  }
  return null;
}

// ICO Instance
let Ico: IICHXICO | null;

const state = {
  ownerTokenBalance: new BigNumber(0),
  someone1TokenBalance: new BigNumber(0),
  someone2TokenBalance: new BigNumber(0),
  teamWalletInitialBalance: new BigNumber('100e18'),
  teamWalletBalance: new BigNumber(0),
  sentWei: new BigNumber(0),
  investor1Wei: new BigNumber(0),
  investor2Wei: new BigNumber(0)
};

contract('ICHXContracts', function (accounts: string[]) {
  let cnt = 0;
  const actors = {
    owner: accounts[cnt++], // token owner
    teamWallet: accounts[cnt++],
    someone1: accounts[cnt++],
    someone2: accounts[cnt++],
    team1: accounts[cnt++],
    investor1: accounts[cnt++],
    investor2: accounts[cnt++]
  } as { [k: string]: string };
  console.log('Actors: ', actors);
  assert.equal('0x' + EthUtil.pubToAddress(EthUtil.privateToPublic(Buffer.from(OWNER_PKEY, 'hex'))).toString('hex'),
               actors.owner, "Please set correct OWNER_PKEY");

  it('should be correct initial token state', async () => {
    const token = await ICHXToken.deployed();
    // Total supply
    assert.equal(await token.totalSupply.call(), tokens(1e9));
    // Token locked
    assert.equal(await token.locked.call(), true);
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // Token name
    assert.equal(await token.name.call(), 'IceChain');
    // Token symbol
    assert.equal(await token.symbol.call(), 'ICHX');
    // Token decimals
    assert.equal(await token.decimals.call(), 18);
    // All tokens transferred to owner
    state.ownerTokenBalance = new BigNumber(await token.balanceOf.call(actors.owner));
    assert.equal(state.ownerTokenBalance.toString(), tokens(8e8));
  });

  it('should be lockable', async () => {
    const token = await ICHXToken.deployed();
    // Token locked
    assert.equal(await token.locked.call(), true);
    // All actions locked
    await assertEvmThrows(token.transfer(actors.someone1, 1, { from: actors.owner }));
    await assertEvmThrows(token.transferFrom(actors.someone1, actors.someone1, 1, { from: actors.owner }));
    await assertEvmThrows(token.approve(actors.someone1, 1, { from: actors.owner }));
    // unlock allowed only for owner
    await assertEvmThrows(token.unlock({ from: actors.someone1 }));
    let txres = await token.unlock({ from: actors.owner });
    assert.equal(txres.logs[0].event, 'Unlock');
    // Token not locked
    assert.equal(await token.locked.call(), false);
    // lock allowed only for owner
    await assertEvmThrows(token.lock({ from: actors.someone1 }));
    txres = await token.lock({ from: actors.owner });
    assert.equal(txres.logs[0].event, 'Lock');
    assert.equal(await token.locked.call(), true);
  });

  it('should be ownable token', async () => {
    const token = await ICHXToken.deployed();
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // transferOwnership allowed only for owner
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.someone1}));
    await token.transferOwnership(actors.someone1, {from: actors.owner});
    assert.equal(await token.pendingOwner.call(), actors.someone1);
    // claimOwnership allowed only for pending owner
    await assertEvmThrows(token.claimOwnership({from: actors.someone2}));
    let txres = await token.claimOwnership({from: actors.someone1});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.owner);
    assert.equal(txres.logs[0].args.newOwner, actors.someone1);

    // Change token owner
    assert.equal(await token.pendingOwner.call(), '0x0000000000000000000000000000000000000000');
    assert.equal(await token.owner.call(), actors.someone1);
    await assertEvmThrows(token.unlock({from: actors.owner}));

    // Check access
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.owner}));

    // Return ownership
    await token.transferOwnership(actors.owner, {from: actors.someone1});
    assert.equal(await token.pendingOwner.call(), actors.owner);
    txres = await token.claimOwnership({from: actors.owner});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.someone1);
    assert.equal(txres.logs[0].args.newOwner, actors.owner);
    assert.equal(await token.pendingOwner.call(), '0x0000000000000000000000000000000000000000');
  });

  it('should not be payable token', async () => {
    const token = await ICHXToken.deployed();
    await assertEvmThrows(token.sendTransaction({value: tokens(1), from: actors.owner}));
    await assertEvmThrows(token.sendTransaction({value: tokens(1), from: actors.someone1}));
  });

  it('token transfers', async () => {
    const token = await ICHXToken.deployed();

    // check lock
    assert.isTrue(await token.locked.call());
    await token.unlock();
    assert.isFalse(await token.locked.call());

    // initial state for someone1
    const txres = await token.transfer(actors.someone1, tokens(20e6), {from: actors.owner});
    state.ownerTokenBalance = state.ownerTokenBalance.sub(tokens(20e6));
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.owner);
    assert.equal(txres.logs[0].args.to, actors.someone1);
    assert.equal(txres.logs[0].args.value, tokens(20e6));
    // initial state for someone2
    await token.transfer(actors.someone2, tokens(20e6), {from: actors.owner});
    state.ownerTokenBalance = state.ownerTokenBalance.sub(tokens(20e6));

    // check transfer from 1 to 2
    // check balances
    state.someone1TokenBalance = new BigNumber(await token.balanceOf.call(actors.someone1));
    state.someone2TokenBalance = new BigNumber(await token.balanceOf.call(actors.someone2));

    // check more than allowed transfer
    await assertEvmThrows(token.transfer(actors.someone2, state.someone1TokenBalance.add(1),
                                         {from: actors.someone1}));

    // check allowed transfer
    const balanceTransfer = state.someone1TokenBalance.div(new BigNumber(2));
    await token.transfer(actors.someone2, balanceTransfer, {from: actors.someone1});
    state.someone1TokenBalance = state.someone1TokenBalance.sub(balanceTransfer);
    state.someone2TokenBalance = state.someone2TokenBalance.add(balanceTransfer);

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.someone1)).toString(), state.someone1TokenBalance.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.someone2)).toString(), state.someone2TokenBalance.toString());

    // check not approved transferFrom
    await assertEvmThrows(token.transferFrom(actors.someone1, actors.someone2, balanceTransfer,
                                             {from: actors.team1}));
    await token.approve(actors.team1, balanceTransfer, {from: actors.someone1});
    // check approved, but over limit transferFrom
    await assertEvmThrows(token.transferFrom(actors.someone1, actors.someone2,
                                             balanceTransfer.add(1), {from: actors.team1}));

    // check allowed and approved transferFrom
    await token.transferFrom(actors.someone1, actors.someone2, balanceTransfer, {from: actors.team1});
    state.someone1TokenBalance = state.someone1TokenBalance.sub(balanceTransfer);
    state.someone2TokenBalance = state.someone2TokenBalance.add(balanceTransfer);

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.someone1)).toString(), state.someone1TokenBalance.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.someone2)).toString(), state.someone2TokenBalance.toString());

  });

  it('withdraw stuck tokens', async () => {
    const token = await ICHXToken.deployed();

    assert.isFalse(await token.locked.call());

    assert.equal(await token.balanceOf.call(token.address), 0);
    await token.transfer(token.address, tokens(20e6), {from: actors.owner});
    assert.equal((await token.balanceOf.call(token.address)).toString(), tokens(20e6));

    // withdraw only for owner
    await assertEvmThrows(token.withdraw({from: actors.someone1}));
    await token.withdraw({from: actors.owner});

    // withdrawTokens only for owner
    await assertEvmThrows(token.withdrawTokens(token.address, {from: actors.someone1}));
    const txres = await token.withdrawTokens(token.address, {from: actors.owner});

    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, token.address);
    assert.equal(txres.logs[0].args.to, actors.owner);
    assert.equal(txres.logs[0].args.value, tokens(20e6));
    assert.equal(await token.balanceOf.call(token.address), 0);
    assert.equal((await token.balanceOf.call(actors.owner)).toString(), state.ownerTokenBalance.toString());
  });

  it('should ico contract deployed', async () => {
    const token = await ICHXToken.deployed();
    Ico = await ICHXICO.new(token.address, actors.teamWallet, new BigNumber('0'), // low cap
                            new BigNumber('11976e18'), // hard cap
                            new BigNumber('1e17'), // min tx cap 0.1 eth
                            new BigNumber('11976e18'), // hard tx cap
                            {
                              from: actors.owner
                            });
    state.teamWalletInitialBalance =
        state.teamWalletBalance = await web3.eth.getBalance(actors.teamWallet);
    assert.equal(await Ico.token.call(), token.address);
    assert.equal(await Ico.teamWallet.call(), actors.teamWallet);
    assert.equal((await Ico.lowCapWei.call()).toString(), new BigNumber('0').toString());
    assert.equal((await Ico.hardCapWei.call()).toString(), new BigNumber('11976e18').toString());
    assert.equal((await Ico.lowCapTxWei.call()).toString(), new BigNumber('1e17').toString());
    assert.equal((await Ico.hardCapTxWei.call()).toString(), new BigNumber('11976e18').toString());
    // Token is not controlled by any ICO
    assert.equal(await token.ico.call(), '0x0000000000000000000000000000000000000000');
    // Assign ICO controller contract
    const txres = await token.changeICO(Ico.address, { from: actors.owner });
    assert.equal(txres.logs[0].event, 'ICOChanged');
    assert.equal(await token.ico.call(), Ico.address);
    // Ensure no others can check ICO contract fot token
    await assertEvmThrows(token.changeICO(Ico.address, { from: actors.someone1 }));
    // Check ico state
    assert.equal(await Ico.state.call(), 0 /* Inactive */);
  });

  it('check whitelist access', async () => {
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    await assertEvmThrows(ico.disableWhitelist({ from: actors.someone1 }));
    await assertEvmThrows(ico.whitelist(actors.someone1, { from: actors.someone1 }));
    await ico.disableWhitelist({ from: actors.owner });
    await ico.enableWhitelist({ from: actors.owner });
  });

  it('ICO lifecycle: start', async () => {
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    assert.equal(await ico.state.call(), 0 /* Inactive */);
    // ICO will end in 1 week
    const endAt = web3LatestTime() + Seconds.weeks(1);
    await ico.start(endAt, { from: actors.owner });
    assert.equal(await ico.state.call(), 1 /* Active */);
    assert.equal(await ico.endAt.call(), endAt);
  });

  it('ICO lifecycle: invest', async () => {
    const token = await ICHXToken.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    assert.equal(await ico.state.call(), 1 /* Active */);
    // Check link
    assert.equal(await ico.token.call(), token.address);
    // Perform investments (investor1)
    const invest1 = tokens2wei(16700);
    // Check deny not white-listed addresses
    await assertEvmThrows(ico.sendTransaction({
                                                         value: invest1,
                                                         from: actors.investor1
                                                       }));
    // Add investor1 to white-list
    await ico.whitelist(actors.investor1);
    // Now it can buy tokens
    let txres = await ico.sendTransaction({
                                            value: invest1,
                                            from: actors.investor1
                                          });
    state.sentWei = state.sentWei.add(invest1);
    state.investor1Wei = state.investor1Wei.add(invest1);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest1);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(new BigNumber(txres.logs[0].args.tokens).toString(), wei2rawtokens(txres.logs[0].args.investedWei));
    assert.equal(await token.balanceOf.call(actors.investor1), txres.logs[0].args.tokens.toString());
    state.teamWalletBalance = state.teamWalletBalance.add(invest1);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

    // Add investor2 to white-list
    await ico.whitelist(actors.investor2);
    const invest2 = tokens2wei(35400);
    txres = await ico.buyTokens({
                                  value: invest2,
                                  from: actors.investor2
                                });
    state.sentWei = state.sentWei.add(invest2);
    state.investor2Wei = state.investor2Wei.add(invest2);
    assert.equal(txres.logs[0].event, 'ICOInvestment');
    assert.equal(txres.logs[0].args.investedWei, invest2);
    assert.equal(txres.logs[0].args.bonusPct, 0);
    assert.equal(new BigNumber(txres.logs[0].args.tokens).toString(), wei2rawtokens(txres.logs[0].args.investedWei));
    assert.equal(await token.balanceOf.call(actors.investor2), txres.logs[0].args.tokens.toString());
    state.teamWalletBalance = state.teamWalletBalance.add(invest2);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
  });

  it('ICO lifecycle: complete', async () => {
    const token = await ICHXToken.deployed();
    assert.isTrue(Ico != null);
    const ico = Ico!!;
    assert.equal(await ico.state.call(), 1 /* Active */);
    // tuning ICO: check access
    await ico.suspend({ from: actors.owner });
    assert.equal(await ico.state.call(), 2 /* Suspended */);
    // only owner can tune
    await assertEvmThrows(ico.tune(0, 0, new BigNumber('1e19'), 0, 0, { from: actors.someone1 }));
    await ico.tune(0, 0, new BigNumber('1e19'), 0, 0, { from: actors.owner });
    // check that only hard cap changed
    assert.equal(await ico.token.call(), token.address);
    assert.equal(await ico.teamWallet.call(), actors.teamWallet);
    assert.equal((await ico.lowCapWei.call()).toString(), new BigNumber('0').toString());
    assert.equal((await ico.hardCapWei.call()).toString(), new BigNumber('1e19').toString());
    assert.equal((await ico.lowCapTxWei.call()).toString(), new BigNumber('1e17').toString());
    assert.equal((await ico.hardCapTxWei.call()).toString(), new BigNumber('11976e18').toString());
    assert.equal(await ico.state.call(), 2 /* Suspended */);
    await ico.resume({ from: actors.owner });
    assert.equal(await ico.state.call(), 1 /* Active */);
    assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    assert.equal(new BigNumber(await ico.collectedWei.call()).toString(), state.sentWei.toString());
    assert.equal(await ico.state.call(), 1 /* Active */);
    const endAt = new BigNumber(await ico.endAt.call()).toNumber();
    await web3IncreaseTimeTo(endAt + 1);
    await ico.touch({ from: actors.someone1 });
    assert.equal(await ico.state.call(), 5 /* Completed */);
  });

  it('Should team wallet match invested funds after ico', async () => {
    assert.equal(new BigNumber(web3.eth.getBalance(actors.teamWallet)).sub(state.teamWalletInitialBalance).toString(),
                 state.sentWei.toString());
    assert.equal(state.investor1Wei
                     .add(state.investor2Wei).toString(), state.sentWei.toString());
  });

  it('token must be destructible', async () => {
    const token = await ICHXToken.deployed();

    // Sign selfdestruct request by owner pkey for: wrong contract address and wrong sender address
    let vrs = signSelfdestruct(OWNER_PKEY, actors.owner, actors.someone1);
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner}));

    // Sign selfdestruct request by owner pkey for: contract address and wrong sender address
    vrs = signSelfdestruct(OWNER_PKEY, token.address, actors.someone1);
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner}));

    // Sign selfdestruct request by owner pkey for: contract address and owner address
    vrs = signSelfdestruct(OWNER_PKEY, token.address, actors.owner);
    // only for owner
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.someone1}));

    await token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner});
    await assertEvmIsNotAContractAddress(token.owner.call());
  });

  it('ICO must be destructible', async () => {
    assert.isTrue(Ico != null);
    const ico = Ico!!;

    // Sign selfdestruct request by owner pkey for: wrong contract address and wrong sender address
    let vrs = signSelfdestruct(OWNER_PKEY, actors.owner, actors.someone1);
    await assertEvmThrows(ico.selfDestruct(vrs.v, vrs.r, vrs.s, { from: actors.owner }));

    // Sign selfdestruct request by owner pkey for: contract address and wrong sender address
    vrs = signSelfdestruct(OWNER_PKEY, ico.address, actors.someone1);
    await assertEvmThrows(ico.selfDestruct(vrs.v, vrs.r, vrs.s, { from: actors.owner }));

    // Sign selfdestruct request by owner pkey for: contract address and owner address
    vrs = signSelfdestruct(OWNER_PKEY, ico.address, actors.owner);
    // only for owner
    await assertEvmThrows(ico.selfDestruct(vrs.v, vrs.r, vrs.s, { from: actors.someone1 }));

    await ico.selfDestruct(vrs.v, vrs.r, vrs.s, { from: actors.owner });
    await assertEvmIsNotAContractAddress(ico.owner.call());
  });
});