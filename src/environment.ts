import type { IAgentRuntime } from "@elizaos/core";
import { z } from "zod";

export const kadenaEnvSchema = z.object({
    KADENA_SECRET_KEY: z.string().min(1, "Kadena secret key is required"),
    KADENA_NETWORK: z.enum(["mainnet01", "testnet04"]).default("mainnet01"),
});

export type KadenaConfig = z.infer<typeof kadenaEnvSchema>;

export async function validateKadenaConfig(
    runtime: IAgentRuntime
): Promise<KadenaConfig> {
    try {
        const config = {
            KADENA_SECRET_KEY:
                runtime.getSetting("KADENA_SECRET_KEY") ||
                process.env.KADENA_SECRET_KEY,
                KADENA_NETWORK:
                runtime.getSetting("KADENA_NETWORK") ||
                process.env.KADENA_NETWORK ||
                "mainnet01",
        };

        return kadenaEnvSchema.parse(config);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(
                `Kadena configuration validation failed:\n${errorMessages}`
            );
        }
        throw error;
    }
}