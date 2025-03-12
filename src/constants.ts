import {createClient} from '@kadena/client';

export const DECIMALS = 12;

export const getClient = (network: string, chainId: string) => {
    if (network === 'mainnet01') {
      return createClient(`https://api.chainweb.com/chainweb/0.0/${network}/chain/${chainId}/pact`);
    } else {
      return createClient(`https://api.testnet.chainweb.com/chainweb/0.0/${network}/chain/${chainId}/pact`);
    }
  };

export const DEFAULT_NETWORK = 'mainnet01';
export const MOVEMENT_EXPLORER_URL = 'https://explorer.kadena.io';