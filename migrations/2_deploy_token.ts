const ICHXToken = artifacts.require('./ICHXToken.sol');
export = function(deployer: any) {
  // Set unlimited synchronization timeout
  (<any>ICHXToken).constructor.synchronization_timeout = 0;
  deployer.deploy(ICHXToken, '1e9', '8e8');
};
