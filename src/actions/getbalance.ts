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
import { fetchFungibleChainAccounts, fetchFungibleChainAccount } from "../kadenaGraphClient";

interface BalanceContent extends Content {
    chain?: string;
    address?: string;
    token: string;
    network?: string;
}

function isBalanceContent(content: unknown): content is BalanceContent {
    elizaLogger.info("Validating balance content:", content);
    const c = content as BalanceContent;
    return (
        (typeof c.chain === "string" || typeof c.chain === "undefined")  &&
        typeof c.token === "string" &&
        (typeof c.network === "string" || typeof c.network === "undefined")
    );
}

const getBalanceTemplate = `
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

export const getBalance: Action = {
    name: "GET_BALANCE",
    similes: [
        "CHECK_BALANCE",
        "BALANCE",
        "GET_TOKEN_BALANCE",
        "SHOW_BALANCE",
        "CHECK_KDA",
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
        "check my kda balance",
    ],
    shouldHandle: (message: Memory) => {
        const text = message.content?.text?.toLowerCase() || "";
        const should = (
            (text.includes("check") || text.includes("get") || text.includes("balance") || text.includes("how much")) &&
            (text.includes("kda") || text.includes("coin") || text.includes("my"))
        );
        elizaLogger.debug("GET_BALANCE shouldHandle result:", { should, matchedText: text });
        return should;
    },
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.debug("Validating GET_BALANCE for user:", message.userId);
        return true;
    },
    priority: 1000,
    description: "Get balance of a token for the given address on Kadena network",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.info("Starting GET_BALANCE handler for:", message.content?.text);

        try {
            const walletInfo = await walletProvider.get(runtime, message, state);
            if (!walletInfo) {
                throw new Error("Failed to initialize wallet provider");
            }

            let currentState: State = state ? 
                await runtime.updateRecentMessageState(state) :
                (await runtime.composeState(message)) as State;
            
            state.walletInfo = walletInfo;

            const balanceContext = composeContext({
                state: currentState,
                template: getBalanceTemplate,
            });

            const content = await generateObjectDeprecated({
                runtime,
                context: balanceContext,
                modelClass: ModelClass.SMALL,
            });

            if (!isBalanceContent(content)) {
                elizaLogger.info("Invalid balance content:", content);
                if (callback) {
                    callback({
                        text: "Invalid balance request format",
                        content: { error: "Invalid parameters" },
                    });
                }
                return false;
            }

            const network = content.network || runtime.getSetting("KADENA_NETWORK") || "mainnet01";
            const address = content.address.length>64? content.address : walletInfo.account;
            const token = content.token.toLowerCase();
            const chain = content.chain;

            if (!address.startsWith("k:")) {
                throw new Error("Address must start with 'k:'");
            }

            let response;
            if (token === "kda" || token === "coin") {
                const portfolio = await walletInfo.fetchKdaAmountAndPrice(runtime);
                
                if (chain) {
                    const chainData = await fetchFungibleChainAccounts(address, 'coin', network);
                    const specificChain = chainData.find((item: any) => item.chainId === chain);
                    
                    response = {
                        address,
                        chain,
                        balance: {
                            token: "KDA",
                            amount: specificChain?.balance || "0",
                            usdValue: specificChain ? 
                                (parseFloat(specificChain.balance) * portfolio.kda_usd).toFixed(2) 
                                : "0.00"
                        }
                    };
                } else {
                    const chainData = await fetchFungibleChainAccounts(address, 'coin', network);
                    response = {
                        address,
                        balances: chainData.map((item: any) => ({
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
                            amount: result?.balance || "0"
                        }
                    };
                } else {
                    const results = await fetchFungibleChainAccounts(address, token, network);
                    response = {
                        address,
                        balances: results.map((item: any) => ({
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
                    text = `Balances for ${address}:\n` + 
                        response.balances.map((bal: any) => 
                            `• ${bal.token} on chain ${bal.chain}: ${bal.amount}` +
                            (bal.usdValue ? ` ($${bal.usdValue})` : "")
                        ).join("\n");
                } else if (response.balance) {
                    text = `Balance on chain ${response.chain}:\n` +
                        `• ${response.balance.token}: ${response.balance.amount}` +
                        (response.balance.usdValue ? ` ($${response.balance.usdValue})` : "");
                }

                callback({
                    text: text || "No balance information found",
                    content: response,
                });
            }

            return true;

        } catch (error) {
            elizaLogger.error("Balance check failed:", error);
            if (callback) {
                callback({
                    text: `Error: ${error.message}`,
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
                    text: "check my kda balance",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Checking your KDA balance...",
                    action: "GET_BALANCE",
                    content: {
                        address: "{{walletAddress}}",
                        token: "coin",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "what's my balance on chain 2?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "Retrieving balance for chain 2...",
                    action: "GET_BALANCE",
                    content: {
                        chain: "2",
                        token: "kda",
                    },
                },
            },
        ],
    ] as ActionExample[][],
} as Action;