import { createSignWithKeypair, Pact } from "@kadena/client";
import { fetchOnChain } from "../kadenaGraphClient";
import { getClient } from "../constants";

export const signTransaction = async (unsignedTx: any, keypair: any) => {
    const signTransaction = createSignWithKeypair(keypair);
    const signedTx = signTransaction(unsignedTx);
    return signedTx;
  }

export const getPairAccount = async (dex:string, token:string, network:string) => {
    const exchange = dex=='kdswap'? 'kdlaunch.kdswap-exchange':'kaddex.exchange';
    const chainId = dex=='kdswap'? '1':'2';
    const code = `
        (let*
  (
    (result (${exchange}.get-pair coin ${token}))
    (kda (at 'reserve (at 'leg0 result)))
    (token (at 'reserve (at 'leg1 result)))
  )
  {
  "kda":kda,
  "token":token,
  "account":(at 'account result)
  }
)
    `
    const result = await fetchOnChain(chainId, code, network);
    const account = JSON.parse(result[0].result).account;
    return account;
}

export const isXchainV1 = async (token: string, networkId: string) => {
    const unsignedTransaction = Pact.builder
      .execution(`(at 'interfaces (describe-module "${token}"))`)
      .setNetworkId(networkId)
      .setMeta({ chainId: '1', senderAccount: 'not real' })
      .createTransaction();
    const client = getClient(networkId, '1');
    const response = await client.local(unsignedTransaction, { signatureVerification: false, preflight: false });
    const isTrue = response.result?.data?.some((moduleInterface) => moduleInterface === 'fungible-xchain-v1');
    return isTrue;
  };