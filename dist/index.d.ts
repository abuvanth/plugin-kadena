import { Action, ICacheManager, IAgentRuntime, Plugin } from '@elizaos/core';

declare const transferToken: Action;

declare const getBalance: Action;

declare class WalletProvider {
    private network;
    private keypair;
    private cacheManager;
    private cache;
    private cacheKey;
    account: string;
    constructor(network: any, account: string, keypair: any, cacheManager: ICacheManager);
    private readFromCache;
    private writeToCache;
    private getCachedData;
    private setCachedData;
    fetchKdaAmountAndPrice(runtime: IAgentRuntime): Promise<{
        kda_usd: any;
        balance: string;
        value: string;
    }>;
    getFormattedPortfolio(runtime: IAgentRuntime): Promise<{
        kda_usd: any;
        balance: string;
        value: string;
    } | "Unable to fetch wallet information. Please try again later.">;
}

declare const kadenaPlugin: Plugin;

export { WalletProvider, kadenaPlugin as default, getBalance, kadenaPlugin, transferToken };
