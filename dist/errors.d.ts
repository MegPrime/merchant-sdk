import type { CheckoutError, CheckoutErrorCode } from './types.js';
export declare function makeError(code: CheckoutErrorCode, message: string, status?: number): CheckoutError;
/**
 * Map a server refusal onto a code.
 *
 * The server's machine code is authoritative when present. Falling back to the
 * status is for the cases where something between us and the service answered
 * — a gateway, a proxy, a captive portal — and there is no envelope to read.
 */
export declare function errorFromResponse(status: number, body: unknown): CheckoutError;
/**
 * Normalise a `classification` option the way the server does — trimmed and
 * lower-cased — and refuse anything that could never match a registered slug.
 * Undefined or blank means "unclassified" and sends nothing.
 */
export declare function normalizeClassification(v: string | undefined): string | undefined;
/**
 * Check a `merchantRewardPercentage` option the way the server does and return
 * the number to send. Undefined means "none stated" and sends nothing. A
 * number is checked by its shortest decimal form, so 2.5 passes and 1e-7 or
 * 2.555 do not; a string is accepted for callers holding a decimal string.
 */
export declare function normalizeRewardPercentage(v: number | string | undefined): number | undefined;
