// src/actions/transfer.ts
import { elizaLogger } from "@elizaos/core";
import {
  ModelClass
} from "@elizaos/core";
import { composeContext, generateObjectDeprecated } from "@elizaos/core";

// src/providers/wallet.ts
import NodeCache from "node-cache";
import * as path from "node:path";
import { restoreKeyPairFromSecretKey } from "@kadena/cryptography-utils";

// src/kadenaGraphClient.ts
import pkg from "@apollo/client";
var { ApolloClient, InMemoryCache, gql } = pkg;
var getClient = (network) => {
  if (network === "mainnet01") {
    return new ApolloClient({
      uri: "https://graph.kadena.network/graphql",
      cache: new InMemoryCache()
    });
  } else {
    return new ApolloClient({
      uri: "https://graph.testnet.kadena.network/graphql",
      cache: new InMemoryCache()
    });
  }
};
var MY_QUERY = gql`
  query MyQuery($accountName: String!, $fungibleName: String!) {
    fungibleChainAccounts(
      accountName: $accountName
      fungibleName: $fungibleName
    ) {
      balance
      chainId
    }
  }
`;
var FETCH_ONCHAIN_QUERY = gql`
  query FetchReserve($chainId: String!, $code: String!) {
    pactQuery(
      pactQuery: {chainId: $chainId, code: $code}
    ) {
      result
      status
      error
    }
  }
`;
var FETCH_FUNGIBLE_CHAIN_ACCOUNT_QUERY = gql`
  query MyQuery($accountName: String!, $chainId: String!, $fungibleName: String!) {
    fungibleChainAccount(
      accountName: $accountName
      chainId: $chainId
      fungibleName: $fungibleName
    ) {
      balance
    }
  }
`;
var fetchFungibleChainAccounts = async (accountName, fungibleName, network) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: MY_QUERY,
      variables: { accountName, fungibleName }
    });
    return data.fungibleChainAccounts;
  } catch (error) {
    console.error("Error fetching fungible chain accounts:", error);
    throw error;
  }
};
var fetchOnChain = async (chainId, code, network) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: FETCH_ONCHAIN_QUERY,
      variables: { chainId, code }
    });
    return data.pactQuery;
  } catch (error) {
    console.error("Error fetching reserve:", error);
    throw error;
  }
};
var fetchFungibleChainAccount = async (accountName, chainId, fungibleName, network) => {
  try {
    const client = getClient(network);
    const { data } = await client.query({
      query: FETCH_FUNGIBLE_CHAIN_ACCOUNT_QUERY,
      variables: { accountName, chainId, fungibleName }
    });
    return data.fungibleChainAccount;
  } catch (error) {
    console.error("Error fetching fungible chain account:", error);
    throw error;
  }
};

// src/providers/wallet.ts
var WalletProvider = class {
  constructor(network, account, keypair, cacheManager) {
    this.network = network;
    this.keypair = keypair;
    this.cacheManager = cacheManager;
    this.cache = new NodeCache({ stdTTL: 300 });
    this.account = account;
  }
  cache;
  cacheKey = "kadena/wallet";
  account;
  async readFromCache(key) {
    const cached = await this.cacheManager.get(
      path.join(this.cacheKey, key)
    );
    return cached;
  }
  async writeToCache(key, data) {
    await this.cacheManager.set(path.join(this.cacheKey, key), data, {
      expires: Date.now() + 5 * 60 * 1e3
    });
  }
  async getCachedData(key) {
    const cachedData = this.cache.get(key);
    if (cachedData) {
      return cachedData;
    }
    const fileCachedData = await this.readFromCache(key);
    if (fileCachedData) {
      this.cache.set(key, fileCachedData);
      return fileCachedData;
    }
    return null;
  }
  async setCachedData(cacheKey, data) {
    this.cache.set(cacheKey, data);
    await this.writeToCache(cacheKey, data);
  }
  async fetchKdaAmountAndPrice(runtime) {
    const network = runtime.getSetting("KADENA_NETWORK") || "mainnet01";
    const code = `(n_bfb76eab37bf8c84359d6552a1d96a309e030b71.dia-oracle.get-value "KDA/USD" )`;
    const kdaPrice = await fetchOnChain("1", code, network);
    const result = kdaPrice[0].result;
    const parsed_kda_price = JSON.parse(result);
    const kda_usd = typeof parsed_kda_price["value"] === "object" ? parsed_kda_price["value"]["decimal"] : parsed_kda_price["value"];
    const data = await fetchFungibleChainAccounts(this.account, "coin", network);
    let balance = "0.00";
    let value = "0.00";
    if (data && data.length > 0)
      balance = data.reduce((sum, item) => sum + parseFloat(item.balance), 0).toFixed(2);
    value = (parseFloat(balance) * kda_usd).toFixed(2);
    return {
      kda_usd,
      balance,
      value
    };
  }
  async getFormattedPortfolio(runtime) {
    try {
      const portfolio = await this.fetchKdaAmountAndPrice(runtime);
      return portfolio;
    } catch (error) {
      console.error("Error generating portfolio report:", error);
      return "Unable to fetch wallet information. Please try again later.";
    }
  }
};
var walletProvider = {
  get: async (runtime, _message, _state) => {
    const secretKey = runtime.getSetting("KADENA_SECRET_KEY");
    const keypair = restoreKeyPairFromSecretKey(secretKey);
    const account = `k:${keypair.publicKey}`;
    const network = runtime.getSetting("KADENA_NETWORK");
    try {
      const provider = new WalletProvider(
        network,
        account,
        keypair,
        runtime.cacheManager
      );
      return provider;
    } catch (error) {
      console.error("Error in wallet provider:", error);
      return null;
    }
  }
};

// src/actions/transfer.ts
import { restoreKeyPairFromSecretKey as restoreKeyPairFromSecretKey2 } from "@kadena/cryptography-utils";
import { Pact as Pact2, isSignedTransaction, readKeyset } from "@kadena/client";

// src/actions/utils.ts
import { createSignWithKeypair, Pact } from "@kadena/client";

// src/constants.ts
import { createClient } from "@kadena/client";
var getClient2 = (network, chainId) => {
  if (network === "mainnet01") {
    return createClient(`https://api.chainweb.com/chainweb/0.0/${network}/chain/${chainId}/pact`);
  } else {
    return createClient(`https://api.testnet.chainweb.com/chainweb/0.0/${network}/chain/${chainId}/pact`);
  }
};

// src/actions/utils.ts
var signTransaction = async (unsignedTx, keypair) => {
  const signTransaction2 = createSignWithKeypair(keypair);
  const signedTx = signTransaction2(unsignedTx);
  return signedTx;
};
var getPairAccount = async (dex, token, network) => {
  const exchange = dex == "kdswap" ? "kdlaunch.kdswap-exchange" : "kaddex.exchange";
  const chainId = dex == "kdswap" ? "1" : "2";
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
    `;
  const result = await fetchOnChain(chainId, code, network);
  const account = JSON.parse(result[0].result).account;
  return account;
};
var isXchainV1 = async (token, networkId2) => {
  var _a, _b;
  const unsignedTransaction = Pact.builder.execution(`(at 'interfaces (describe-module "${token}"))`).setNetworkId(networkId2).setMeta({ chainId: "1", senderAccount: "not real" }).createTransaction();
  const client = getClient2(networkId2, "1");
  const response = await client.local(unsignedTransaction, { signatureVerification: false, preflight: false });
  const isTrue = (_b = (_a = response.result) == null ? void 0 : _a.data) == null ? void 0 : _b.some((moduleInterface) => moduleInterface === "fungible-xchain-v1");
  return isTrue;
};

// src/actions/transfer.ts
function isTransferContent(content) {
  elizaLogger.debug("Validating transfer content:", content);
  const c = content;
  return typeof c.recipient === "string" && c.recipient.startsWith("k:") && (typeof c.amount === "string" || typeof c.amount === "number") && parseFloat(c.amount.toString()) > 0 && (typeof c.fromChain === "string" || typeof c.fromChain === "undefined") && (typeof c.toChain === "string" || typeof c.toChain === "undefined");
}
var networkId = "mainnet01";
var transferTemplate = `You are processing a token transfer request. Extract parameters from the message.

Example requests:
1. Single-chain: "send 5 KDA to k:123 on chain 2"
2. Cross-chain: "transfer 3 KDA from chain 1 to chain 3"

Response format:
\`\`\`json
{
    "recipient": "k:...",
    "amount": "5",
    "fromChain": "1",
    "toChain": "3"
}
\`\`\`

Rules:
1. Recipient must start with "k:"
2. Amount must be numeric
3. fromChain required for cross-chain transfers
4. toChain defaults to fromChain if omitted
5. Chain IDs must be 0-20

Recent messages:
{{recentMessages}}

Extract and return JSON with:
- recipient
- amount
- fromChain (optional)
- toChain (optional)`;
var transferToken = {
  name: "TRANSFER_KDA",
  similes: [
    "CROSS_CHAIN_TRANSFER",
    "SEND_TO_CHAIN",
    "TRANSFER_BETWEEN_CHAINS"
  ],
  triggers: [
    "send kda",
    "transfer kda",
    "cross-chain transfer",
    "send from chain",
    "transfer between chains",
    "send to chain"
  ],
  shouldHandle: (message) => {
    var _a, _b;
    const text = ((_b = (_a = message.content) == null ? void 0 : _a.text) == null ? void 0 : _b.toLowerCase()) || "";
    return (text.includes("send") || text.includes("transfer")) && text.includes("kda") && text.includes("chain");
  },
  validate: async (_runtime, message) => {
    elizaLogger.debug("Validating transfer for user:", message.userId);
    return true;
  },
  priority: 1e3,
  description: "Transfer KDA tokens between chains on the Kadena network",
  handler: async (runtime, message, state, _options, callback) => {
    var _a, _b;
    elizaLogger.info("Starting transfer handler for:", (_a = message.content) == null ? void 0 : _a.text);
    try {
      const secretKey = runtime.getSetting("KADENA_SECRET_KEY");
      if (!secretKey) throw new Error("KADENA_SECRET_KEY not configured");
      const network = runtime.getSetting("KADENA_NETWORK") || networkId;
      const defaultChain = runtime.getSetting("DEFAULT_CHAIN") || "1";
      const keypair = restoreKeyPairFromSecretKey2(secretKey);
      const account = `k:${keypair.publicKey}`;
      const walletInfo = await walletProvider.get(runtime, message, state);
      state.walletInfo = walletInfo;
      const currentState = state ? await runtime.updateRecentMessageState(state) : await runtime.composeState(message);
      const transferContext = composeContext({
        state: currentState,
        template: transferTemplate
      });
      const content = await generateObjectDeprecated({
        runtime,
        context: transferContext,
        modelClass: ModelClass.SMALL
      });
      if (!isTransferContent(content)) {
        throw new Error("Invalid transfer parameters");
      }
      const fromChain = content.fromChain || defaultChain;
      const toChain = content.toChain || fromChain;
      const isCrossChain = fromChain !== toChain;
      const amount = { decimal: parseFloat(content.amount.toString()).toFixed(12) };
      const validChains = Array.from({ length: 20 }, (_, i) => i.toString());
      if (!validChains.includes(fromChain) || !validChains.includes(toChain)) {
        throw new Error("Invalid chain ID (must be 0-19)");
      }
      const sourceClient = getClient2(network, fromChain);
      let requestKey;
      if (isCrossChain) {
        const targetClient = getClient2(network, toChain);
        const supportsXchainV1 = await isXchainV1("coin", network);
        const transferTx = Pact2.builder.execution(
          Pact2.modules["coin"].defpact["transfer-crosschain"](
            account,
            content.recipient,
            readKeyset("ks"),
            toChain,
            amount
          )
        ).addSigner(keypair.publicKey, (withCap) => {
          const caps = [];
          if (supportsXchainV1) {
            caps.push(withCap("coin.GAS"));
            caps.push(
              withCap(
                "coin.TRANSFER_XCHAIN",
                account,
                content.recipient,
                amount,
                toChain
              )
            );
          }
          return caps;
        }).addKeyset("ks", "keys-all", content.recipient.slice(2)).setMeta({
          chainId: fromChain,
          senderAccount: account,
          gasLimit: 2500,
          gasPrice: 1e-8,
          ttl: 28800
        }).setNetworkId(network).createTransaction();
        const signedTransfer = await signTransaction(transferTx, keypair);
        if (!isSignedTransaction(signedTransfer)) {
          throw new Error("Failed to sign source chain transaction");
        }
        const localResult = await sourceClient.local(signedTransfer, {
          signatureVerification: true,
          preflight: true
        });
        if (localResult.result.status !== "success") {
          throw new Error(`Local verification failed: ${JSON.stringify(localResult.result.error)}`);
        }
        const submitResult = await sourceClient.submit(signedTransfer);
        requestKey = submitResult.requestKey;
        const pollResult = await sourceClient.pollOne(submitResult);
        if (pollResult.result.status !== "success") {
          throw new Error(`Source chain transaction failed: ${JSON.stringify(pollResult.result.error)}`);
        }
        const spvProof = await sourceClient.pollCreateSpv(submitResult, toChain);
        const continuationTx = Pact2.builder.continuation({
          pactId: ((_b = pollResult.continuation) == null ? void 0 : _b.pactId) || "",
          rollback: false,
          step: 1,
          proof: spvProof
        }).addSigner(keypair.publicKey, (withCap) => [
          withCap("coin.GAS")
        ]).setMeta({
          chainId: toChain,
          senderAccount: "kadena-xchain-gas",
          gasLimit: 850,
          gasPrice: 1e-8,
          ttl: 28800
        }).setNetworkId(network).createTransaction();
        const signedContinuation = await signTransaction(continuationTx, keypair);
        if (!isSignedTransaction(signedContinuation)) {
          throw new Error("Failed to sign continuation transaction");
        }
        const contLocalResult = await targetClient.local(signedContinuation);
        if (contLocalResult.result.status !== "success") {
          throw new Error(`Continuation preflight failed: ${JSON.stringify(contLocalResult.result.error)}`);
        }
        const contSubmitResult = await targetClient.submit(signedContinuation);
      } else {
        const transferTx = Pact2.builder.execution(
          Pact2.modules["coin"].transfer(
            account,
            content.recipient,
            amount
          )
        ).addSigner(keypair.publicKey, (withCap) => [
          withCap("coin.GAS"),
          withCap(
            "coin.TRANSFER",
            account,
            content.recipient,
            amount
          )
        ]).setMeta({
          chainId: fromChain,
          senderAccount: account,
          gasLimit: 1500,
          gasPrice: 1e-8,
          ttl: 28800
        }).setNetworkId(network).createTransaction();
        const signedTx = await signTransaction(transferTx, keypair);
        if (!isSignedTransaction(signedTx)) {
          throw new Error("Failed to sign transaction");
        }
        const localResult = await sourceClient.local(signedTx, {
          signatureVerification: true,
          preflight: true
        });
        if (localResult.result.status !== "success") {
          throw new Error(`Local verification failed: ${JSON.stringify(localResult.result.error)}`);
        }
        const submitResult = await sourceClient.submit(signedTx);
        requestKey = submitResult.requestKey;
      }
      const explorerUrl = `https://explorer.kadena.io/mainnet/transaction/${requestKey}`;
      if (callback) {
        callback({
          text: `Successfully transferred ${amount.decimal} KDA ${isCrossChain ? `from chain ${fromChain} to chain ${toChain}` : `on chain ${fromChain}`}
Transaction ID: ${requestKey}
Explorer: ${explorerUrl}`,
          content: {
            success: true,
            requestKey,
            amount: amount.decimal,
            fromChain,
            toChain,
            explorerUrl
          }
        });
      }
      return true;
    } catch (error) {
      elizaLogger.error("Transfer failed:", error);
      if (callback) {
        callback({
          text: `Transfer error: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "send 2 KDA to k:1234 on chain 5" }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Transferring 2 KDA on chain 5...",
          action: "TRANSFER_KDA",
          content: {
            recipient: "k:1234",
            amount: 2,
            fromChain: "5"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "transfer 5 KDA from chain 1 to chain 3" }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Processing cross-chain transfer...",
          action: "TRANSFER_KDA",
          content: {
            fromChain: "1",
            toChain: "3",
            amount: 5,
            recipient: "k:abcd"
          }
        }
      }
    ]
  ]
};

// src/actions/getbalance.ts
import { elizaLogger as elizaLogger2 } from "@elizaos/core";
import {
  ModelClass as ModelClass2
} from "@elizaos/core";
import { composeContext as composeContext2, generateObjectDeprecated as generateObjectDeprecated2 } from "@elizaos/core";
function isBalanceContent(content) {
  elizaLogger2.info("Validating balance content:", content);
  const c = content;
  return (typeof c.chain === "string" || typeof c.chain === "undefined") && typeof c.token === "string" && (typeof c.network === "string" || typeof c.network === "undefined");
}
var getBalanceTemplate = `
Get balance request template:
- Chain: {{chain}}
- Address: {{address}}
- Token: {{token}}
- Network: {{network}}

Example request: "check my kda balance"
Example response:
\`\`\`json
{
    "address": "k:...",
    "token": "coin",
    "network": "mainnet01"
}
\`\`\`

Rules:
1. Address should start with "k:" if provided
2. Token can be "kda" or "coin" for KDA
3. Chain is optional (if omitted, return all chains)
4. Network defaults to mainnet01 if not specified

Recent messages:
{{recentMessages}}

Extract and return ONLY the following in a JSON block:
- chain: The chain ID (optional)
- address: The wallet address
- token: The token symbol
- network: The network identifier (optional)
`;
var getBalance = {
  name: "GET_BALANCE",
  similes: [
    "CHECK_BALANCE",
    "BALANCE",
    "GET_TOKEN_BALANCE",
    "SHOW_BALANCE",
    "CHECK_KDA"
  ],
  triggers: [
    "check balance",
    "get balance",
    "check my kda",
    "balance on chain",
    "how much kda",
    "show balance",
    "check",
    "balance",
    "kda balance",
    "my balance",
    "what's my balance",
    "check my kda balance"
  ],
  shouldHandle: (message) => {
    var _a, _b;
    const text = ((_b = (_a = message.content) == null ? void 0 : _a.text) == null ? void 0 : _b.toLowerCase()) || "";
    const should = (text.includes("check") || text.includes("get") || text.includes("balance") || text.includes("how much")) && (text.includes("kda") || text.includes("coin") || text.includes("my"));
    elizaLogger2.debug("GET_BALANCE shouldHandle result:", { should, matchedText: text });
    return should;
  },
  validate: async (_runtime, message) => {
    elizaLogger2.debug("Validating GET_BALANCE for user:", message.userId);
    return true;
  },
  priority: 1e3,
  description: "Get balance of a token for the given address on Kadena network",
  handler: async (runtime, message, state, _options, callback) => {
    var _a;
    elizaLogger2.info("Starting GET_BALANCE handler for:", (_a = message.content) == null ? void 0 : _a.text);
    try {
      const walletInfo = await walletProvider.get(runtime, message, state);
      if (!walletInfo) {
        throw new Error("Failed to initialize wallet provider");
      }
      let currentState = state ? await runtime.updateRecentMessageState(state) : await runtime.composeState(message);
      state.walletInfo = walletInfo;
      const balanceContext = composeContext2({
        state: currentState,
        template: getBalanceTemplate
      });
      const content = await generateObjectDeprecated2({
        runtime,
        context: balanceContext,
        modelClass: ModelClass2.SMALL
      });
      if (!isBalanceContent(content)) {
        elizaLogger2.info("Invalid balance content:", content);
        if (callback) {
          callback({
            text: "Invalid balance request format",
            content: { error: "Invalid parameters" }
          });
        }
        return false;
      }
      const network = content.network || runtime.getSetting("KADENA_NETWORK") || "mainnet01";
      const address = content.address.length > 64 ? content.address : walletInfo.account;
      const token = content.token.toLowerCase();
      const chain = content.chain;
      if (!address.startsWith("k:")) {
        throw new Error("Address must start with 'k:'");
      }
      let response;
      if (token === "kda" || token === "coin") {
        const portfolio = await walletInfo.fetchKdaAmountAndPrice(runtime);
        if (chain) {
          const chainData = await fetchFungibleChainAccounts(address, "coin", network);
          const specificChain = chainData.find((item) => item.chainId === chain);
          response = {
            address,
            chain,
            balance: {
              token: "KDA",
              amount: (specificChain == null ? void 0 : specificChain.balance) || "0",
              usdValue: specificChain ? (parseFloat(specificChain.balance) * portfolio.kda_usd).toFixed(2) : "0.00"
            }
          };
        } else {
          const chainData = await fetchFungibleChainAccounts(address, "coin", network);
          response = {
            address,
            balances: chainData.map((item) => ({
              chain: item.chainId,
              token: "KDA",
              amount: item.balance,
              usdValue: (parseFloat(item.balance) * portfolio.kda_usd).toFixed(2)
            }))
          };
        }
      } else {
        if (chain) {
          const result = await fetchFungibleChainAccount(address, chain, token, network);
          response = {
            address,
            chain,
            balance: {
              token,
              amount: (result == null ? void 0 : result.balance) || "0"
            }
          };
        } else {
          const results = await fetchFungibleChainAccounts(address, token, network);
          response = {
            address,
            balances: results.map((item) => ({
              chain: item.chainId,
              token,
              amount: item.balance
            }))
          };
        }
      }
      if (callback) {
        let text = "";
        if (response.balances) {
          text = `Balances for ${address}:
` + response.balances.map(
            (bal) => `\u2022 ${bal.token} on chain ${bal.chain}: ${bal.amount}` + (bal.usdValue ? ` ($${bal.usdValue})` : "")
          ).join("\n");
        } else if (response.balance) {
          text = `Balance on chain ${response.chain}:
\u2022 ${response.balance.token}: ${response.balance.amount}` + (response.balance.usdValue ? ` ($${response.balance.usdValue})` : "");
        }
        callback({
          text: text || "No balance information found",
          content: response
        });
      }
      return true;
    } catch (error) {
      elizaLogger2.error("Balance check failed:", error);
      if (callback) {
        callback({
          text: `Error: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "check my kda balance"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Checking your KDA balance...",
          action: "GET_BALANCE",
          content: {
            address: "{{walletAddress}}",
            token: "coin"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "what's my balance on chain 2?"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Retrieving balance for chain 2...",
          action: "GET_BALANCE",
          content: {
            chain: "2",
            token: "kda"
          }
        }
      }
    ]
  ]
};

// src/actions/swap.ts
import { elizaLogger as elizaLogger3 } from "@elizaos/core";
import {
  ModelClass as ModelClass3
} from "@elizaos/core";
import { composeContext as composeContext3, generateObjectDeprecated as generateObjectDeprecated3 } from "@elizaos/core";
import { restoreKeyPairFromSecretKey as restoreKeyPairFromSecretKey3 } from "@kadena/cryptography-utils";
import { Pact as Pact3 } from "@kadena/client";
function isSwapContent(content) {
  elizaLogger3.debug("Validating swap content:", content);
  return typeof content.fromToken === "string" && typeof content.toToken === "string" && (typeof content.amount === "string" || typeof content.amount === "number") && typeof content.platform === "string";
}
var swapTemplate = `You are processing a token swap request. Extract the fromToken, toToken, amount, and platform from the message.

Example request: "can you swap 1 kda to free.cyberfly_token on kdswap"
Example response:
\`\`\`json
{
    "fromToken": "kda",
    "toToken": "free.cyberfly_token",
    "amount": "1",
    "platform": "kdswap"
}
\`\`\`

Rules:
1. The fromToken and toToken are token symbols.
2. The amount is typically a number less than 100
3. The platform is either "kdswap" or "mercatus"
4. Return exact values found in the message

Recent messages:
{{recentMessages}}

Extract and return ONLY the following in a JSON block:
- fromToken: The token symbol to swap from
- toToken: The token symbol to swap to
- amount: The number of tokens to swap
- platform: The platform to use for the swap

Return ONLY the JSON block with these four fields.`;
var swapToken = {
  name: "SWAP_TOKEN",
  similes: [
    "SWAP_TOKEN",
    "EXCHANGE_TOKEN",
    "TRADE_TOKEN",
    "SWAP_TOKENS",
    "EXCHANGE_TOKENS",
    "TRADE_TOKENS"
  ],
  triggers: [
    "swap kda",
    "swap 1 kda",
    "exchange kda",
    "swap token",
    "exchange token",
    "can you swap",
    "please swap",
    "swap"
  ],
  shouldHandle: (message) => {
    var _a, _b;
    const text = ((_b = (_a = message.content) == null ? void 0 : _a.text) == null ? void 0 : _b.toLowerCase()) || "";
    return text.includes("swap") && text.includes("kda") && text.includes("to") && (text.includes("kdswap") || text.includes("mercatus"));
  },
  validate: async (_runtime, message) => {
    var _a;
    elizaLogger3.debug(
      "Starting swap validation for user:",
      message.userId
    );
    elizaLogger3.debug("Message text:", (_a = message.content) == null ? void 0 : _a.text);
    return true;
  },
  priority: 1e3,
  // High priority for swap actions
  description: "Swap tokens from one type to another on the Kadena network",
  handler: async (runtime, message, state, _options, callback) => {
    var _a, _b;
    elizaLogger3.debug("Starting SWAP_TOKEN handler...");
    elizaLogger3.debug("Message:", {
      text: (_a = message.content) == null ? void 0 : _a.text,
      userId: message.userId,
      action: (_b = message.content) == null ? void 0 : _b.action
    });
    try {
      const secretKey = runtime.getSetting("KADENA_SECRET_KEY");
      elizaLogger3.debug(
        "Got private key:",
        secretKey ? "Present" : "Missing"
      );
      const network = runtime.getSetting("KADENA_NETWORK") || "mainnet01";
      elizaLogger3.debug("Network config:", network);
      const keypair = restoreKeyPairFromSecretKey3(secretKey);
      const account = `k:${keypair.publicKey}`;
      elizaLogger3.debug(
        "Created Kadena account:",
        account
      );
      const walletInfo = await walletProvider.get(
        runtime,
        message,
        state
      );
      state.walletInfo = walletInfo;
      let currentState;
      if (!state) {
        currentState = await runtime.composeState(message);
      } else {
        currentState = await runtime.updateRecentMessageState(state);
      }
      const swapContext = composeContext3({
        state: currentState,
        template: swapTemplate
      });
      const content = await generateObjectDeprecated3({
        runtime,
        context: swapContext,
        modelClass: ModelClass3.SMALL
      });
      if (!isSwapContent(content)) {
        console.error("Invalid content for SWAP_TOKEN action.");
        if (callback) {
          callback({
            text: "Unable to process swap request. Invalid content provided.",
            content: { error: "Invalid swap content" }
          });
        }
        return false;
      }
      console.log(
        `Swapping: ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}`
      );
      const chainId = content.platform.toLowerCase() === "kdswap" ? "1" : "2";
      const pair_account = await getPairAccount(content.platform, content.toToken, network);
      elizaLogger3.info("Pair account:", pair_account);
      const unsignedTransaction = Pact3.builder.execution(
        `(${content.platform == "kdswap" ? "kdlaunch.kdswap-exchange" : "kaddex.exchange"}.swap-exact-in (read-decimal 'token0Amount) (read-decimal 'token1AmountWithSlippage) [${content.fromToken.toLowerCase() == "kda" ? "coin" : content.fromToken.toLowerCase()} ${content.toToken.toLowerCase() == "kda" ? "coin" : content.toToken.toLowerCase()}] "${account}" "${account}" (read-keyset 'ks))`
      ).addSigner(account.slice(2), (withCapability) => [
        // add necessary coin.GAS capability (this defines who pays the gas)
        withCapability(content.platform == "kdswap" ? "kdlaunch.kdswap-gas-station.GAS_PAYER" : "kaddex.gas-station.GAS_PAYER", content.platform == "kdswap" ? "free-gas" : "kaddex-free-gas", { int: 1 }, 1),
        // add necessary coin.TRANSFER capability
        withCapability(`${content.fromToken.toLowerCase() == "kda" ? "coin" : content.fromToken.toLowerCase()}.TRANSFER`, account, pair_account, Number(content.amount))
      ]).addData("ks", { keys: [account.slice(2)], pred: "keys-all" }).addData("token0Amount", Number(content.amount)).addData("token1AmountWithSlippage", 0).setMeta({ chainId, senderAccount: content.platform == "kdswap" ? "kdswap-gas-payer" : "kaddex-free-gas" }).setNetworkId(network).createTransaction();
      const signedTx = await signTransaction(unsignedTransaction, keypair);
      const client = getClient2(network, chainId);
      const localResponse = await client.local(signedTx);
      if (localResponse.result.status === "success") {
        const transactionDescriptor = await client.submit(signedTx);
        const explorerUrl = `https://explorer.kadena.io/mainnet/transaction/${transactionDescriptor.requestKey}`;
        elizaLogger3.debug("Swap successful:", {
          hash: transactionDescriptor.requestKey,
          amount: content.amount,
          fromToken: content.fromToken,
          toToken: content.toToken,
          platform: content.platform,
          explorerUrl
        });
        if (callback) {
          callback({
            text: `Submitted swap ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}
Transaction: ${transactionDescriptor.requestKey}
View on Explorer: ${explorerUrl}`,
            content: {
              success: true,
              hash: transactionDescriptor.requestKey,
              amount: content.amount,
              fromToken: content.fromToken,
              toToken: content.toToken,
              platform: content.platform,
              explorerUrl
            }
          });
        }
      } else {
        if (callback) {
          callback({
            text: `Error: ${localResponse.result.error.message}  on swap ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}
`,
            content: {
              success: false,
              amount: content.amount,
              fromToken: content.fromToken,
              toToken: content.toToken,
              platform: content.platform
            }
          });
        }
      }
      return true;
    } catch (error) {
      console.error("Error during token swap:", error);
      if (callback) {
        callback({
          text: `Error swapping tokens: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "can you swap 1 kda to free.cyberfly_token on kdswap"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "I'll help you swap 1 kda to free.cyberfly_token on kdswap...",
          action: "SWAP_TOKEN"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "swap 1 kda to free.cyberfly_token on mercatus"
        }
      },
      {
        user: "{{user2}}",
        content: {
          text: "Processing token swap...",
          action: "SWAP_TOKEN"
        }
      }
    ]
  ]
};

// src/index.ts
var kadenaPlugin = {
  name: "kadena",
  description: "Kadena Blockchain Plugin for Eliza",
  actions: [getBalance, transferToken, swapToken],
  evaluators: [],
  providers: [walletProvider]
};
var index_default = kadenaPlugin;
export {
  WalletProvider,
  index_default as default,
  getBalance,
  kadenaPlugin,
  transferToken
};
//# sourceMappingURL=index.js.map