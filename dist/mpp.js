/**
 * Pay from an exchange: an MPP deposit address for one fulfillment.
 *
 * A payer whose MPP sits on an exchange cannot sign anything; an exchange can
 * only send tokens to an address. The gateway mints that address (a forwarder
 * per fulfillment) and states the EXACT amount to send. Once it receives that
 * amount the forwarder routes it and the fulfillment settles, which the
 * existing status polling reports as `paid`. Nothing here decides paid.
 *
 * Amounts are decimal strings of 18-dp base units. Never a Number: 0.0140…
 * MPP is 14080296915726607 base units, already past 2^53.
 */
import { makeError } from './errors.js';
/** The MPP token on Base. */
export const MPP_TOKEN_ADDRESS = '0x6E02F4A1631379a49e8B7E222CfA6Bf913b05E89';
/** Base mainnet. */
export const BASE_CHAIN_ID = 8453;
/** MPP has 18 decimals. */
export const MPP_DECIMALS = 18;
/**
 * Refuse a refund address locally: 0x + 40 hex, and not the zero address.
 * Anything the forwarder cannot route goes there, so a typo is lost money.
 */
export function assertRefundAddress(addr) {
    const a = typeof addr === 'string' ? addr.trim() : '';
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
        throw makeError('invalid_options', 'refundAddress must be a 0x address (0x followed by 40 hex characters)');
    }
    if (/^0x0{40}$/.test(a)) {
        throw makeError('invalid_options', 'refundAddress must not be the zero address');
    }
    return a;
}
/** Base units (decimal string) to a decimal MPP string. Exact: no rounding, trailing zeros trimmed. */
export function formatMppBaseUnits(baseUnits, decimals = MPP_DECIMALS) {
    const s = String(baseUnits ?? '').trim();
    if (!/^\d+$/.test(s))
        return '';
    const digits = s.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
    const whole = digits.slice(0, digits.length - decimals);
    const frac = digits.slice(digits.length - decimals).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
}
function str(v) {
    return typeof v === 'string' && v !== '' ? v : undefined;
}
function date(v) {
    if (typeof v !== 'string' || !v)
        return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
/** Map the gateway's `data` (snake_case) to the SDK shape. */
export function toMppDepositIntent(d) {
    const pi = (d.payer_instructions ?? {});
    const amount = str(pi.amount_to_send) ?? '';
    const unix = typeof pi.expires_at_unix === 'number' ? pi.expires_at_unix : undefined;
    const expiresAt = date(d.expires_at) ?? (unix ? new Date(unix * 1000) : undefined);
    const intentId = str(d.intent_id) ?? '';
    const state = (str(d.state) ?? '');
    const status = str(d.status);
    return {
        intentId,
        state,
        receivedAmount: str(d.received_amount) ?? '0',
        expiresAt,
        status,
        instructions: {
            intentId,
            network: str(pi.network) ?? 'base',
            token: str(pi.token) ?? 'MPP',
            sendTo: str(pi.send_to) ?? '',
            amountToSend: amount,
            amountToSendMpp: formatMppBaseUnits(amount),
            expiresAt,
            warning: str(pi.warning),
            state,
            status,
        },
    };
}
/** The route, one place. */
export function mppDepositIntentPath(fulfillmentId) {
    return `/api/v1/mpmerchant/public/pay-requests/${encodeURIComponent(fulfillmentId)}/mpp-deposit-intent`;
}
