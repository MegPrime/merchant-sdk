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
