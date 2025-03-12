import { elizaLogger } from "@elizaos/core";
import {
    type ActionExample,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    type Action,
} from "@elizaos/core";
import { composeContext, generateObjectDeprecated } from "@elizaos/core";
import { walletProvider } from "../providers/wallet";
import { restoreKeyPairFromSecretKey } from "@kadena/cryptography-utils";
import { getClient } from "../constants";
import { Pact, isSignedTransaction } from '@kadena/client';
import { getPairAccount, signTransaction } from "./utils";

export interface SwapContent extends Content {
    fromToken: string;
    toToken: string;
    amount: string | number;
    platform: string;
}

function isSwapContent(content: unknown): content is SwapContent {
    elizaLogger.debug("Validating swap content:", content);
    return (
        typeof (content as SwapContent).fromToken === "string" &&
        typeof (content as SwapContent).toToken === "string" &&
        (typeof (content as SwapContent).amount === "string" ||
            typeof (content as SwapContent).amount === "number") &&
        typeof (content as SwapContent).platform === "string"
    );
}

const swapTemplate = `You are processing a token swap request. Extract the fromToken, toToken, amount, and platform from the message.

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

export const swapToken: Action = {
    name: "SWAP_TOKEN",
    similes: [
        "SWAP_TOKEN",
        "EXCHANGE_TOKEN",
        "TRADE_TOKEN",
        "SWAP_TOKENS",
        "EXCHANGE_TOKENS",
        "TRADE_TOKENS",
    ],
    triggers: [
        "swap kda",
        "swap 1 kda",
        "exchange kda",
        "swap token",
        "exchange token",
        "can you swap",
        "please swap",
        "swap",
    ],
    shouldHandle: (message: Memory) => {
        const text = message.content?.text?.toLowerCase() || "";
        return (
            text.includes("swap") &&
            text.includes("kda") &&
            text.includes("to") &&
            (text.includes("kdswap") || text.includes("mercatus"))
        );
    },
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.debug(
            "Starting swap validation for user:",
            message.userId
        );
        elizaLogger.debug("Message text:", message.content?.text);
        return true; // Let the handler do the validation
    },
    priority: 1000, // High priority for swap actions
    description:
        "Swap tokens from one type to another on the Kadena network",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.debug("Starting SWAP_TOKEN handler...");
        elizaLogger.debug("Message:", {
            text: message.content?.text,
            userId: message.userId,
            action: message.content?.action,
        });

        try {
            const secretKey = runtime.getSetting("KADENA_SECRET_KEY");
            elizaLogger.debug(
                "Got private key:",
                secretKey ? "Present" : "Missing"
            );

            const network = runtime.getSetting("KADENA_NETWORK") || "mainnet01"
            elizaLogger.debug("Network config:", network);
          
            const keypair = restoreKeyPairFromSecretKey(secretKey);
            const account = `k:${keypair.publicKey}`;
            elizaLogger.debug(
                "Created Kadena account:",
                account
            );

            const walletInfo = await walletProvider.get(
                runtime,
                message,
                state
            );
            state.walletInfo = walletInfo;
            let currentState: State;
            if (!state) {
                currentState = (await runtime.composeState(message)) as State;
            } else {
                currentState = await runtime.updateRecentMessageState(state);
            }

            const swapContext = composeContext({
                state: currentState,
                template: swapTemplate,
            });

            // Generate swap content
            const content = await generateObjectDeprecated({
                runtime,
                context: swapContext,
                modelClass: ModelClass.SMALL,
            });

            // Validate swap content
            if (!isSwapContent(content)) {
                console.error("Invalid content for SWAP_TOKEN action.");
                if (callback) {
                    callback({
                        text: "Unable to process swap request. Invalid content provided.",
                        content: { error: "Invalid swap content" },
                    });
                }
                return false;
            }

            console.log(
                `Swapping: ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}`
            );

            const chainId = content.platform.toLowerCase() === "kdswap" ? "1" : "2";
            const pair_account = await getPairAccount(content.platform,content.toToken,network)
            elizaLogger.info("Pair account:", pair_account);    
            const unsignedTransaction = Pact.builder
            .execution(
                `(${content.platform=='kdswap'? 'kdlaunch.kdswap-exchange':'kaddex.exchange'}.swap-exact-in (read-decimal 'token0Amount) (read-decimal 'token1AmountWithSlippage) [${content.fromToken.toLowerCase()=='kda'?'coin':content.fromToken.toLowerCase()} ${content.toToken.toLowerCase()=='kda'?'coin':content.toToken.toLowerCase()}] "${account}" "${account}" (read-keyset 'ks))`
            )
            .addSigner(account.slice(2), (withCapability) => [
              // add necessary coin.GAS capability (this defines who pays the gas)
              withCapability(content.platform=='kdswap'? 'kdlaunch.kdswap-gas-station.GAS_PAYER':'kaddex.gas-station.GAS_PAYER', content.platform=='kdswap'? 'free-gas':'kaddex-free-gas', { int: 1 }, 1.0),
              // add necessary coin.TRANSFER capability
              withCapability(`${content.fromToken.toLowerCase()=='kda'? 'coin':content.fromToken.toLowerCase()}.TRANSFER`, account, pair_account, Number(content.amount)),
            ])
            .addData('ks',{keys:[account.slice(2)], pred:'keys-all'})
            .addData('token0Amount', Number(content.amount))
            .addData('token1AmountWithSlippage', 0)
            .setMeta({ chainId, senderAccount: content.platform=='kdswap'? 'kdswap-gas-payer':'kaddex-free-gas' })
            .setNetworkId(network)
            .createTransaction();
      
          const signedTx = await signTransaction(unsignedTransaction, keypair);
          const client = getClient(network, chainId);  
            const localResponse = await client.local(signedTx);
            if (localResponse.result.status === 'success') {
              const transactionDescriptor = await client.submit(signedTx);
              const explorerUrl = `https://explorer.kadena.io/mainnet/transaction/${transactionDescriptor.requestKey}`;
              elizaLogger.debug("Swap successful:", {
                  hash: transactionDescriptor.requestKey,
                  amount: content.amount,
                  fromToken: content.fromToken,
                  toToken: content.toToken,
                  platform: content.platform,
                  explorerUrl,
              });
  
              if (callback) {
                  callback({
                      text: `Submitted swap ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}\nTransaction: ${transactionDescriptor.requestKey}\nView on Explorer: ${explorerUrl}`,
                      content: {
                          success: true,
                          hash: transactionDescriptor.requestKey,
                          amount: content.amount,
                          fromToken: content.fromToken,
                          toToken: content.toToken,
                          platform: content.platform,
                          explorerUrl,
                      },
                  });
              }
            }
            else{
                if (callback) {
                    callback({
                        text: `Error: ${localResponse.result.error.message}  on swap ${content.amount} ${content.fromToken} to ${content.toToken} on ${content.platform}\n`,
                        content: {
                            success: false,
                            amount: content.amount,
                            fromToken: content.fromToken,
                            toToken: content.toToken,
                            platform: content.platform,
                        },
                    });
                }
            }
          

            return true;
        } catch (error) {
            console.error("Error during token swap:", error);
            if (callback) {
                callback({
                    text: `Error swapping tokens: ${error.message}`,
                    content: { error: error.message },
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
                    text: "can you swap 1 kda to free.cyberfly_token on kdswap",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "I'll help you swap 1 kda to free.cyberfly_token on kdswap...",
                    action: "SWAP_TOKEN",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "swap 1 kda to free.cyberfly_token on mercatus",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Processing token swap...",
                    action: "SWAP_TOKEN",
                },
            },
        ],
    ] as ActionExample[][],
} as Action;
