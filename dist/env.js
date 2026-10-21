/**
 * Environments: which API, which pay pages, which chain.
 *
 * All three are tenants of one API at https://api.megprimepay.com: the key
 * decides the tenant, so `env` never changes the gateway. `prod` and `uat` run
 * on Base mainnet; `sandbox` runs on Base Sepolia with testnet USDC, so
 * `env: 'sandbox'` moves the chain (and the pay hosts), not the gateway.
 * An explicit `gateway` always wins over `env`.
 *
 * An unknown env is refused, never defaulted to PROD: a PROD link built for a
 * UAT or sandbox request is a QR that opens the wrong environment.
 */
import { makeError } from './errors.js';
export const ENVS = ['prod', 'uat', 'sandbox'];
/** The one MegPrime API. Every environment is a tenant on it; the key picks which. */
const API_ROOT = 'https://api.megprimepay.com';
/** Gateway root per environment. All the same host: the key, not the env, selects the tenant. */
export const GATEWAYS = {
    prod: API_ROOT,
    uat: API_ROOT,
    sandbox: API_ROOT,
};
/** Base mainnet. */
export const BASE_CHAIN_ID = 8453;
/** Base Sepolia (testnet). */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** USDC on Base mainnet. */
export const USDC_BASE_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
/** Circle's testnet USDC on Base Sepolia (faucet: https://faucet.circle.com). */
export const USDC_BASE_SEPOLIA_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
/** The MPP token on Base mainnet. */
export const MPP_TOKEN_ADDRESS = '0x6E02F4A1631379a49e8B7E222CfA6Bf913b05E89';
const BASE = {
    chainId: BASE_CHAIN_ID,
    name: 'Base',
    testnet: false,
    settlementToken: { symbol: 'USDC', address: USDC_BASE_ADDRESS, decimals: 6 },
    mppToken: { symbol: 'MPP', address: MPP_TOKEN_ADDRESS, decimals: 18 },
};
/** Chain and tokens per environment. */
export const CHAINS = {
    prod: BASE,
    uat: BASE,
    sandbox: {
        chainId: BASE_SEPOLIA_CHAIN_ID,
        name: 'Base Sepolia',
        testnet: true,
        settlementToken: { symbol: 'USDC', address: USDC_BASE_SEPOLIA_ADDRESS, decimals: 6 },
    },
};
/** The env, checked. Absent means 'prod'; anything unknown is refused. */
export function resolveEnv(env) {
    const e = env ?? 'prod';
    if (typeof e !== 'string' || !ENVS.includes(e)) {
        throw makeError('invalid_options', `env must be 'prod', 'uat' or 'sandbox', got '${String(e)}'`);
    }
    return e;
}
/** The gateway root for these options: an explicit `gateway` wins, else the env's. Trailing slashes trimmed. */
export function gatewayFor(o) {
    const env = resolveEnv(o?.env); // refused even with an explicit gateway: the pay links still use it
    return (o?.gateway || GATEWAYS[env]).replace(/\/+$/, '');
}
/** Chain and tokens for an environment. */
export function chainFor(env) {
    return CHAINS[resolveEnv(env)];
}
/**
 * Refuse MPP (pay from an exchange) where there is no MPP token: the sandbox,
 * until phase 2. Throws `unsupported_on_sandbox` before any request, rather
 * than handing a payer a mainnet transfer from a testnet checkout.
 */
export function assertMppSupported(env) {
    const e = resolveEnv(env);
    if (!CHAINS[e].mppToken) {
        throw makeError('unsupported_on_sandbox', `MPP (pay from an exchange) is not available on ${e} yet: there is no MPP token on ${CHAINS[e].name}. Use the USDC pay links instead.`);
    }
}
