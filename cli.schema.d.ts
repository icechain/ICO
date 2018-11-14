/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface ICliConfig {
  ethereum: {
    /**
     * Network endpoint URL
     */
    endpoint: string;
    /**
     * Directory where contract deployment lock files stored
     */
    lockfilesDir: string;
    /**
     * Network from address
     */
    from: string;
    /**
     * Default Gas limit
     */
    gas: string;
    /**
     * Default Gas price
     */
    gasPrice: string;
    /**
     * ICHX token contract
     */
    ICHXToken: {
      /**
       * Path to the contract schema
       */
      schema: string;
      totalSupplyTokens: string;
      companyTokens: string;
      [k: string]: any;
    };
    /**
     * ICHX token ICO contract
     */
    ICHXICO: {
      /**
       * Path to the contract schema
       */
      schema: string;
      /**
       * Team wallet address on network
       */
      teamWallet: string;
      lowCapWei: string;
      hardCapWei: string;
      lowCapTxWei: string;
      hardCapTxWei: string;
      [k: string]: any;
    };
    [k: string]: any;
  };
  [k: string]: any;
}
