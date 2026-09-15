/**
 * Which failures are worth trying again.
 *
 * A wrong price id is not retryable — it will be wrong forever, and retrying
 * turns a clear error into a hang. A network blip is, and a 429 is once its
 * window passes.
 */
const RETRYABLE = new Set([
    'network',
    'rate_limited',
    'embedded_payments_unavailable',
    'unknown',
]);
export function makeError(code, message, status) {
    const e = new Error(message);
    e.name = 'CheckoutError';
    e.code = code;
    if (status !== undefined)
        e.status = status;
    e.retryable = RETRYABLE.has(code);
    return e;
}
/**
 * Map a server refusal onto a code.
 *
 * The server's machine code is authoritative when present. Falling back to the
 * status is for the cases where something between us and the service answered
 * — a gateway, a proxy, a captive portal — and there is no envelope to read.
 */
export function errorFromResponse(status, body) {
    const b = (body ?? {});
    // The gateway's envelope is `{ "error": "<code>" }`. `code` is accepted too,
    // so a future envelope that splits code from message still maps.
    const serverCode = (typeof b.code === 'string' && b.code) ||
        (typeof b.error === 'string' && b.error) ||
        undefined;
    const message = (typeof b.message === 'string' && b.message) ||
        serverCode ||
        `request failed with status ${status}`;
    const known = [
        'publishable_key_invalid',
        'price_not_found',
        'price_over_key_cap',
        'embedded_payments_unavailable',
        'rate_limited',
    ];
    if (serverCode && known.includes(serverCode)) {
        return makeError(serverCode, message, status);
    }
    if (status === 401 || status === 403) {
        return makeError('publishable_key_invalid', message, status);
    }
    if (status === 404)
        return makeError('price_not_found', message, status);
    if (status === 429)
        return makeError('rate_limited', message, status);
    if (status === 503) {
        return makeError('embedded_payments_unavailable', message, status);
    }
    return makeError('unknown', message, status);
}
