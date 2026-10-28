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
    'webhooks_unavailable',
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
        (typeof b.detail === 'string' && b.detail) ||
        serverCode ||
        `request failed with status ${status}`;
    const known = [
        'publishable_key_invalid',
        'price_not_found',
        'price_over_key_cap',
        'embedded_payments_unavailable',
        'rate_limited',
        'payment_request_not_found',
        'webhooks_unavailable',
        'invalid_webhook_url',
        'webhook_endpoint_limit',
        'webhook_endpoint_not_found',
        'webhook_event_not_found',
        'invalid_body',
        'mpp_deposit_intent_not_found',
        'classification_unknown',
        'invalid_classification_slug',
        'invalid_merchant_reward_percentage',
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
/** The server's slug rule, mirrored so a typo is refused before a round trip. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG = 64;
/**
 * Normalise a `classification` option the way the server does — trimmed and
 * lower-cased — and refuse anything that could never match a registered slug.
 * Undefined or blank means "unclassified" and sends nothing.
 */
export function normalizeClassification(v) {
    const slug = v?.trim().toLowerCase() ?? '';
    if (!slug)
        return undefined;
    if (slug.length > MAX_SLUG || !SLUG_RE.test(slug)) {
        throw makeError('invalid_classification_slug', `classification must be a slug (lower-case letters, digits and single hyphens, ${MAX_SLUG} characters or fewer)`);
    }
    return slug;
}
/** The server's rule: a plain number from 0 to 100 with at most 2 decimals. */
const REWARD_RE = /^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$/;
/**
 * Check a `merchantRewardPercentage` option the way the server does and return
 * the number to send. Undefined means "none stated" and sends nothing. A
 * number is checked by its shortest decimal form, so 2.5 passes and 1e-7 or
 * 2.555 do not; a string is accepted for callers holding a decimal string.
 */
export function normalizeRewardPercentage(v) {
    if (v === undefined)
        return undefined;
    const text = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v).trim();
    if (!REWARD_RE.test(text) || Number(text) > 100) {
        throw makeError('invalid_merchant_reward_percentage', 'merchantRewardPercentage must be a number from 0 to 100 with at most 2 decimal places');
    }
    return Number(text);
}
