import type {
    IAgentRuntime,
    ICacheManager,
    Memory,
    Provider,
    State,
} from "@elizaos/core";
import NodeCache from "node-cache";
import * as path from "node:path";
import {restoreKeyPairFromSecretKey} from '@kadena/cryptography-utils'
import { fetchFungibleChainAccounts, fetchOnChain } from "../kadenaGraphClient";

// Provider configuration
const PROVIDER_CONFIG = {
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
};

interface WalletPortfolio {
    totalUsd: string;
    totalKDA: string;
}

interface Prices {
    kda: { usd: string };
}

export class WalletProvider {
    private cache: NodeCache;
    private cacheKey = "kadena/wallet";
    account: string;

    constructor(
        private network:any,
         account: string,
        private keypair: any,
        private cacheManager: ICacheManager
    ) {
        this.cache = new NodeCache({ stdTTL: 300 });
        this.account = account // Cache TTL set to 5 minutes
    }

    private async readFromCache<T>(key: string): Promise<T | null> {
        const cached = await this.cacheManager.get<T>(
            path.join(this.cacheKey, key)
        );
        return cached;
    }

    private async writeToCache<T>(key: string, data: T): Promise<void> {
        await this.cacheManager.set(path.join(this.cacheKey, key), data, {
            expires: Date.now() + 5 * 60 * 1000,
        });
    }

    private async getCachedData<T>(key: string): Promise<T | null> {
        // Check in-memory cache first
        const cachedData = this.cache.get<T>(key);
        if (cachedData) {
            return cachedData;
        }

        // Check file-based cache
        const fileCachedData = await this.readFromCache<T>(key);
        if (fileCachedData) {
            // Populate in-memory cache
            this.cache.set(key, fileCachedData);
            return fileCachedData;
        }

        return null;
    }

    private async setCachedData<T>(cacheKey: string, data: T): Promise<void> {
        // Set in-memory cache
        this.cache.set(cacheKey, data);

        // Write to file-based cache
        await this.writeToCache(cacheKey, data);
    }

    async fetchKdaAmountAndPrice(runtime: IAgentRuntime){
    const network = runtime.getSetting("KADENA_NETWORK") || "mainnet01";

    const code = `(n_bfb76eab37bf8c84359d6552a1d96a309e030b71.dia-oracle.get-value "KDA/USD" )`
    const kdaPrice = await fetchOnChain("1", code, network)
    const result = kdaPrice[0].result
    const parsed_kda_price = JSON.parse(result);
    const kda_usd = typeof parsed_kda_price['value'] === "object" ? parsed_kda_price['value']['decimal'] : parsed_kda_price['value'];
    const data = await fetchFungibleChainAccounts(this.account, 'coin', network);
    let balance = "0.00";
    let value = "0.00";
    
    if (data && data.length > 0)
       balance = data.reduce((sum, item) => sum + parseFloat(item.balance), 0).toFixed(2);
      value = (parseFloat(balance) * kda_usd).toFixed(2);
    return {
        kda_usd: kda_usd,
        balance,
        value
    }
    }


    async getFormattedPortfolio(runtime: IAgentRuntime) {
        try {
            const portfolio = await this.fetchKdaAmountAndPrice(runtime);
            return portfolio;
        } catch (error) {
            console.error("Error generating portfolio report:", error);
            return "Unable to fetch wallet information. Please try again later.";
        }
    }
}

const walletProvider: Provider = {
    get: async (
        runtime: IAgentRuntime,
        _message: Memory,
        _state?: State
    ) => {
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
    },
};

// Module exports
export { walletProvider };
