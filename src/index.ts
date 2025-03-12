import type { Plugin } from "@elizaos/core";
import {transferToken} from "./actions/transfer";
import  {getBalance} from "./actions/getbalance";
import { swapToken } from "./actions/swap";
import { WalletProvider, walletProvider } from "./providers/wallet";

export { WalletProvider, transferToken, getBalance };

export const kadenaPlugin: Plugin = {
    name: "kadena",
    description: "Kadena Blockchain Plugin for Eliza",
    actions: [getBalance, transferToken, swapToken],
    evaluators: [],
    providers: [walletProvider],
};

export default kadenaPlugin;
