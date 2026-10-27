/** The environments the SDK knows. Defaults to 'prod' wherever it is accepted. */
export type PayEnv = 'prod' | 'uat' | 'sandbox';
export declare const ENVS: readonly PayEnv[];
/** Gateway root per environment. All the same host: the key, not the env, selects the tenant. */
export declare const GATEWAYS: Readonly<Record<PayEnv, string>>;
/** Base mainnet. */
export declare const BASE_CHAIN_ID = 8453;
/** Base Sepolia (testnet). */
export declare const BASE_SEPOLIA_CHAIN_ID = 84532;
/** USDC on Base mainnet. */
export declare const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Circle's testnet USDC on Base Sepolia (not the sandbox settlement token; see TEST_USDC_BASE_SEPOLIA_ADDRESS). */
export declare const USDC_BASE_SEPOLIA_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
/** The sandbox's test MPP token on Base Sepolia (18 dp). MegPrime issues test tokens on request. */
export declare const TEST_MPP_BASE_SEPOLIA_ADDRESS = "0xdbDf97AB328b7a8F772c0a704DEE2075fc1cF6cE";
/** The sandbox's TestUSDC on Base Sepolia (6 dp): what the store receives. */
export declare const TEST_USDC_BASE_SEPOLIA_ADDRESS = "0xbD50C0A517fD4A5F409002a5493E384eaf4fA7Fc";
/** The MPP token on Base mainnet. */
export declare const MPP_TOKEN_ADDRESS = "0x6E02F4A1631379a49e8B7E222CfA6Bf913b05E89";
export interface ChainInfo {
    chainId: number;
    /** Human name, e.g. "Base" or "Base Sepolia". */
    name: string;
    /** True when the chain is a testnet and nothing here is real money. */
    testnet: boolean;
    /** The token sales settle in. */
    settlementToken: {
        symbol: 'USDC';
        address: string;
        decimals: 6;
    };
    /** The MPP token, when pay-from-an-exchange is available here. On the sandbox it is the test MPP token. */
    mppToken?: {
        symbol: 'MPP';
        address: string;
        decimals: 18;
    };
}
/** Chain and tokens per environment. */
export declare const CHAINS: Readonly<Record<PayEnv, ChainInfo>>;
/** The env, checked. Absent means 'prod'; anything unknown is refused. */
export declare function resolveEnv(env: unknown): PayEnv;
/** The gateway root for these options: an explicit `gateway` wins, else the env's. Trailing slashes trimmed. */
export declare function gatewayFor(o?: {
    env?: PayEnv;
    gateway?: string;
}): string;
/** Chain and tokens for an environment. */
export declare function chainFor(env?: PayEnv): ChainInfo;
