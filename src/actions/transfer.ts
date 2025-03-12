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
import { Pact, isSignedTransaction, readKeyset } from '@kadena/client';
import { signTransaction, isXchainV1 } from "./utils";
import { getClient } from "../constants";

export interface TransferContent extends Content {
    recipient: string;
    amount: string | number;
    fromChain?: string;
    toChain?: string;
}

function isTransferContent(content: unknown): content is TransferContent {
    elizaLogger.debug("Validating transfer content:", content);
    const c = content as TransferContent;
    return (
        typeof c.recipient === "string" && c.recipient.startsWith("k:") &&
        (typeof c.amount === "string" || typeof c.amount === "number") &&
        parseFloat(c.amount.toString()) > 0 &&
        (typeof c.fromChain === "string" || typeof c.fromChain === "undefined") &&
        (typeof c.toChain === "string" || typeof c.toChain === "undefined")
    );
}

const networkId = "mainnet01"; // Could be made configurable via runtime settings

const transferTemplate = `You are processing a token transfer request. Extract parameters from the message.

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

export const transferToken: Action = {
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
    shouldHandle: (message: Memory) => {
        const text = message.content?.text?.toLowerCase() || "";
        return (
            (text.includes("send") || text.includes("transfer")) &&
            text.includes("kda") &&
            text.includes("chain")
        );
    },
    validate: async (_runtime: IAgentRuntime, message: Memory) => {
        elizaLogger.debug("Validating transfer for user:", message.userId);
        return true;
    },
    priority: 1000,
    description: "Transfer KDA tokens between chains on the Kadena network",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.info("Starting transfer handler for:", message.content?.text);

        try {
            const secretKey = runtime.getSetting("KADENA_SECRET_KEY");
            if (!secretKey) throw new Error("KADENA_SECRET_KEY not configured");

            const network = runtime.getSetting("KADENA_NETWORK") || networkId;
            const defaultChain = runtime.getSetting("DEFAULT_CHAIN") || "1";
            const keypair = restoreKeyPairFromSecretKey(secretKey);
            const account = `k:${keypair.publicKey}`;

            const walletInfo = await walletProvider.get(runtime, message, state);
            state.walletInfo = walletInfo;

            const currentState = state ? 
                await runtime.updateRecentMessageState(state) :
                (await runtime.composeState(message)) as State;

            const transferContext = composeContext({
                state: currentState,
                template: transferTemplate,
            });

            const content = await generateObjectDeprecated({
                runtime,
                context: transferContext,
                modelClass: ModelClass.SMALL,
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

            const sourceClient = getClient(network, fromChain);
            let requestKey: string;

            if (isCrossChain) {
                const targetClient = getClient(network, toChain);
                const supportsXchainV1 = await isXchainV1('coin',network);

                // Step 1: Initiate cross-chain transfer
                const transferTx = Pact.builder
                    .execution(
                        Pact.modules['coin'].defpact["transfer-crosschain"](
                            account,
                            content.recipient,
                            readKeyset('ks'),
                            toChain,
                            amount
                        )
                    )
                    .addSigner(keypair.publicKey, (withCap) => {
                        const caps = [];
                        if (supportsXchainV1) {
                            caps.push(withCap("coin.GAS"))
                            caps.push(
                                withCap("coin.TRANSFER_XCHAIN",
                                    account,
                                    content.recipient,
                                    amount,
                                    toChain
                                )
                            );
                        }
                        return caps;
                    })
                    .addKeyset('ks', 'keys-all', content.recipient.slice(2))
                    .setMeta({
                        chainId: fromChain,
                        senderAccount: account,
                        gasLimit: 2500,
                        gasPrice: 0.00000001,
                        ttl: 28800
                    })
                    .setNetworkId(network)
                    .createTransaction();

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

                // Wait for confirmation
                const pollResult = await sourceClient.pollOne(submitResult);
                if (pollResult.result.status !== "success") {
                    throw new Error(`Source chain transaction failed: ${JSON.stringify(pollResult.result.error)}`);
                }

                // Step 2: Get SPV proof and complete on target chain
                const spvProof = await sourceClient.pollCreateSpv(submitResult, toChain);
                
                const continuationTx = Pact.builder
                    .continuation({
                        pactId: pollResult.continuation?.pactId || '',
                        rollback: false,
                        step: 1,
                        proof: spvProof
                    })
                    .addSigner(keypair.publicKey, (withCap) => [
                        withCap("coin.GAS")
                    ])
                    .setMeta({
                        chainId: toChain,
                        senderAccount: 'kadena-xchain-gas',
                        gasLimit: 850,
                        gasPrice: 0.00000001,
                        ttl: 28800
                    })
                    .setNetworkId(network)
                    .createTransaction();

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
                // Single-chain transfer
                const transferTx = Pact.builder
                    .execution(
                        Pact.modules['coin'].transfer(
                            account,
                            content.recipient,
                            amount
                        )
                    )
                    .addSigner(keypair.publicKey, (withCap) => [
                        withCap("coin.GAS"),
                        withCap("coin.TRANSFER",
                            account,
                            content.recipient,
                            amount
                        )
                    ])
                    .setMeta({
                        chainId: fromChain,
                        senderAccount: account,
                        gasLimit: 1500,
                        gasPrice: 0.00000001,
                        ttl: 28800
                    })
                    .setNetworkId(network)
                    .createTransaction();

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
                    text: `Successfully transferred ${amount.decimal} KDA ${
                        isCrossChain ? `from chain ${fromChain} to chain ${toChain}` : `on chain ${fromChain}`
                    }\nTransaction ID: ${requestKey}\nExplorer: ${explorerUrl}`,
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
    ] as ActionExample[][],
} as Action;