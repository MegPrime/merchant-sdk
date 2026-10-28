/**
 * @megprime/merchant-sdk/server — the half that holds the secret key.
 *
 * WHY THIS IS A SEPARATE ENTRY POINT.
 *
 * Everything else in this package is written to run in the buyer's browser and
 * is safe there: a publishable key cannot name an amount, and a fulfillment id
 * is a capability the payer is about to be shown anyway. The secret key is the
 * opposite. It CAN name an amount, and it can ask for a refund. It belongs on a
 * server and nowhere else.
 *
 * A separate module is how that stays true in practice. Bundlers pull in what
 * is imported, so a component that reaches for `proposeRefund` pulls this file
 * — and this file refuses to run in a browser. That is a loud failure in
 * development rather than a quiet one in production, where the quiet version is
 * a merchant's secret key sitting in a JavaScript bundle any customer can read.
 *
 *     import { proposeRefund } from '@megprime/merchant-sdk/server';
 *
 * WHAT A SECRET KEY MAY DO, IN FULL: create a payment request for an amount it
 * states and read its store's requests back, propose a refund of a payment it
 * created and read back the proposals it raised, and manage its store's
 * webhooks (endpoints, test events, the events feed, redelivery). It may not
 * approve a refund — only the store owner may, in the MegPrime app — and it may
 * never name where money goes.
 *
 * `verifyWebhook` needs no key and makes no request; it is here because it
 * runs on the same server and uses node:crypto.
 */
import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { errorFromResponse, makeError, normalizeClassification, normalizeRewardPercentage } from './errors.js';
import { assertRefundAddress, mppDepositIntentPath, toMppDepositIntent, } from './mpp.js';
export { formatMppBaseUnits, MPP_TOKEN_ADDRESS, BASE_CHAIN_ID, MPP_DECIMALS } from './mpp.js';
import { gatewayFor } from './env.js';
export { ENVS, GATEWAYS, CHAINS, BASE_SEPOLIA_CHAIN_ID, USDC_BASE_ADDRESS, USDC_BASE_SEPOLIA_ADDRESS, gatewayFor, chainFor, } from './env.js';
/**
 * Refuse to run in a browser.
 *
 * Checked at the top of every call rather than once at import: a bundler that
 * tree-shakes or a framework that evaluates modules on both sides would make an
 * import-time check unreliable, and this is the one guard in the package whose
 * failure is a leaked credential.
 */
function assertServer() {
    const g = globalThis;
    if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
        throw makeError('invalid_options', '@megprime/merchant-sdk/server must not run in a browser: it carries your secret key, which can name an amount and ask for refunds. Call it from your server and send the client only the fulfillment id.');
    }
}
function assertSecretKey(key) {
    const k = (key ?? '').trim();
    if (!k.startsWith('msk_')) {
        throw makeError('invalid_options', 'secretKey must be an msk_ key');
    }
    return k;
}
function assertAmount(amountUoa) {
    const a = (amountUoa ?? '').trim();
    // Minor units as a decimal string, positive. A float here is a rounded price.
    if (!/^\d{1,39}$/.test(a) || /^0*$/.test(a)) {
        throw makeError('invalid_options', `amountUoa must be a positive integer string of minor units (e.g. "12500000" for $12.50 of a 6-decimal token), got ${JSON.stringify(amountUoa)}`);
    }
    return a;
}
async function call(path, method, o, body, map) {
    assertServer();
    const key = assertSecretKey(o.secretKey);
    const gateway = gatewayFor(o); // refuses an unknown env before any request
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 10000);
    try {
        const res = await fetch(`${gateway}${path}`, {
            method,
            headers: {
                'X-Secret-Key': key,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: ac.signal,
        });
        const parsed = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw errorFromResponse(res.status, parsed);
        }
        return map((parsed.data ?? {}));
    }
    catch (e) {
        // A thrown CheckoutError is the server's answer; anything else never got
        // one, which is UNKNOWN rather than a refusal. Retry those with the same
        // clientRef and you get the original, never a second charge.
        if (e?.code)
            throw e;
        throw makeError('network', e instanceof Error ? e.message : 'network error');
    }
    finally {
        clearTimeout(timer);
    }
}
function date(v) {
    if (typeof v !== 'string' || !v)
        return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(v) {
    return typeof v === 'string' && v !== '' ? v : undefined;
}
/**
 * Create a payment request for an amount your server decided.
 *
 * Send the client the `fulfillmentId` and nothing else; the browser renders it
 * with `attachCheckout`, or draws its own QR from `payUrl`.
 */
export async function createPaymentRequest(o) {
    const amount = assertAmount(o.amountUoa);
    if ((o.memo?.length ?? 0) > 200) {
        throw makeError('invalid_options', 'memo must be 200 characters or fewer');
    }
    const classification = normalizeClassification(o.classification);
    const rewardPct = normalizeRewardPercentage(o.merchantRewardPercentage);
    payOriginsFor(o); // refuse a bad env before the request exists, not after
    return call('/api/v1/mpmerchant/server/pay-requests', 'POST', o, {
        notional_uoa: amount,
        ...(o.clientRef ? { client_ref: o.clientRef } : {}),
        ...(o.memo ? { memo: o.memo } : {}),
        ...(classification ? { classification } : {}),
        ...(rewardPct !== undefined ? { merchant_reward_percentage: rewardPct } : {}),
    }, (d) => {
        const id = str(d.fulfillment_id);
        return {
            fulfillmentId: id,
            requestId: str(d.id),
            amountUoa: str(d.notional_uoa) ?? amount,
            currency: d.currency ?? undefined,
            deadline: date(d.deadline),
            clientRef: str(d.client_ref),
            classification: str(d.classification),
            merchantRewardPercentage: num(d.merchant_reward_percentage),
            // Built here so nothing downstream has to know the URL shape. Absent
            // exactly when the id is — a link to nothing is worse than no link.
            ...(id ? payLinks(id, o) : {}),
        };
    });
}
/**
 * Ask for a refund of a payment you created.
 *
 * Your key cannot say where the money goes. For a sale a secret key created, a
 * refund
 * at or under the key's auto-refund limit (100 USDC by default, with a daily
 * total) comes back `owed` at once; above it, it stays `proposed` for the owner.
 * Either way MegPrime settles it with you OFF-CHAIN, by wire: nothing moves
 * on-chain and there is no refund to pay or watch.
 *
 * Poll `getRefundProposal` for the answer.
 */
export async function proposeRefund(o) {
    const amount = assertAmount(o.amountUoa);
    if (!o.fulfillmentId?.trim()) {
        throw makeError('invalid_options', 'fulfillmentId is required: name the sale you are refunding');
    }
    if ((o.reason?.length ?? 0) > 500) {
        throw makeError('invalid_options', 'reason must be 500 characters or fewer');
    }
    return call('/api/v1/mpmerchant/server/refund-proposals', 'POST', o, {
        fulfillment_id: o.fulfillmentId.trim(),
        amount_uoa: amount,
        ...(o.reason ? { reason: o.reason } : {}),
        ...(o.clientRef ? { client_ref: o.clientRef } : {}),
    }, toProposal);
}
/** Read back a proposal this key raised — the owner's decision, when they make one. */
export async function getRefundProposal(o) {
    if (!o.proposalId?.trim()) {
        throw makeError('invalid_options', 'proposalId is required');
    }
    return call(`/api/v1/mpmerchant/server/refund-proposals/${encodeURIComponent(o.proposalId.trim())}`, 'GET', o, undefined, toProposal);
}
function toProposal(d) {
    return {
        id: str(d.id) ?? '',
        state: str(d.state) ?? 'proposed',
        amountUoa: str(d.amount_uoa) ?? '0',
        refundFulfillmentId: str(d.refund_fulfillment_id),
        settlement: str(d.settlement),
        autoApproved: str(d.decided_by) === 'system:auto' ? true : undefined,
        refundDestination: str(d.refund_destination),
        decisionReason: str(d.decision_reason),
        decidedAt: date(d.decided_at),
        createdAt: date(d.created_at),
    };
}
/**
 * What actually arrived, for a sale or for a refund.
 *
 * Credential-free by design: this is the same endpoint the browser polls, so a
 * server and a page can agree about one payment without the server holding a
 * second opinion. Use it to confirm a sale before releasing goods, and to watch
 * an approved refund until the merchant has actually paid it.
 */
export async function getPaymentStatus(fulfillmentId, o) {
    assertServer();
    if (!fulfillmentId?.trim()) {
        throw makeError('invalid_options', 'fulfillmentId is required');
    }
    const gateway = gatewayFor(o);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o?.timeoutMs ?? 10000);
    try {
        const res = await fetch(`${gateway}/api/v1/enforcer/fulfillments/${encodeURIComponent(fulfillmentId.trim())}/status`, { signal: ac.signal });
        const parsed = await res.json().catch(() => ({}));
        if (!res.ok)
            throw errorFromResponse(res.status, parsed);
        const d = (parsed.data ?? parsed);
        return {
            status: (str(d.status) ?? '').toLowerCase(),
            paidUoa: str(d.paid_sum) ?? '0',
            amountUoa: str(d.notional_uoa) ?? '0',
            settledAt: date(d.settled_at),
        };
    }
    catch (e) {
        if (e?.code)
            throw e;
        throw makeError('network', e instanceof Error ? e.message : 'network error');
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Pay from an exchange, raised by your server: an MPP deposit address and the
 * EXACT amount to send there on Base, for a fulfillment you hold.
 *
 * Idempotent per request: a repeat returns the same intent. Paid detection is
 * unchanged: watch `getPaymentStatus` (or the webhook) for the fulfillment to
 * confirm. `refundAddress` is checked locally (0x + 40 hex, non-zero) before
 * the request; anything the forwarder cannot route is returned there.
 */
export async function createMppDepositIntent(fulfillmentId, o) {
    const refund = assertRefundAddress(o?.refundAddress);
    const id = fulfillmentId?.trim();
    if (!id)
        throw makeError('invalid_options', 'fulfillmentId is required');
    return call(mppDepositIntentPath(id), 'POST', o, { refund_address: refund }, (d) => toMppDepositIntent(d).instructions);
}
// ---------------------------------------------------------------------------
// Webhooks
//
// Wire facts below are read from enforcer-mp-merchant (internal/webhooks,
// internal/payments/server_webhooks.go) and enforcer-webhook/outbound/sign.go.
// The event payload is delivered exactly as stored, in snake_case, so the
// object types here are the WIRE shape, not the camelCase SDK shapes above.
// ---------------------------------------------------------------------------
/** The header carrying the signature. Node lowercases incoming header names. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-megprime-signature';
/** Same value as the payload's `id`. */
export const WEBHOOK_EVENT_ID_HEADER = 'x-megprime-event-id';
export const WEBHOOK_EVENT_TYPE_HEADER = 'x-megprime-event-type';
/** Differs per endpoint, and per redelivery target. Not a dedupe key. */
export const WEBHOOK_DELIVERY_ID_HEADER = 'x-megprime-delivery-id';
/** Default replay window, matching the server's outbound.DefaultTolerance. */
export const WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;
export const PAYMENT_REQUEST_EVENT_TYPES = [
    'payment_request.paid',
    'payment_request.failed',
    'payment_request.expired',
    'payment_request.voided',
];
export const REFUND_EVENT_TYPES = [
    'refund.proposed',
    'refund.owed',
    'refund.rejected',
    'refund.wired',
    'refund.failed',
];
/** Every event type the server emits today. Ignore (and 2xx) types not in this
 *  list: new ones may be added without a version bump. */
export const WEBHOOK_EVENT_TYPES = [...PAYMENT_REQUEST_EVENT_TYPES, ...REFUND_EVENT_TYPES, 'webhook.test'];
/** A delivery that failed verification. Answer it with a 400 and do not act on it. */
export class WebhookSignatureError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'WebhookSignatureError';
        this.code = code;
    }
}
function rawBytes(rawBody) {
    if (typeof rawBody === 'string')
        return Buffer.from(rawBody, 'utf8');
    if (rawBody instanceof Uint8Array)
        return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
    if (rawBody instanceof ArrayBuffer)
        return Buffer.from(rawBody);
    // A parsed object here means a JSON body parser ran first. That is a bug in
    // the receiver, not a bad delivery, so it is a TypeError rather than a 400:
    // answering 400 would quietly fail every delivery until the endpoint
    // auto-disables.
    throw new TypeError('verifyWebhook needs the RAW request body (string, Buffer, Uint8Array or ArrayBuffer), not parsed JSON. ' +
        "In Express use express.raw({ type: 'application/json' }) on the webhook route; with fetch-style requests use await req.arrayBuffer().");
}
/**
 * Verify a webhook delivery and return the parsed event.
 *
 * - `rawBody` must be exactly the bytes received. Parsing and re-stringifying
 *   changes whitespace and key order and the signature will not match.
 * - `signatureHeader` is the `X-MegPrime-Signature` value:
 *   `t=<unix>,v1=<hex>[,v1=<hex>]`. During the 24h after a secret rotation the
 *   server signs with BOTH secrets and sends one `v1` per secret.
 * - `secrets` is your `whsec_…` string, used as-is (do not decode it). Pass an
 *   array to accept more than one, e.g. the old and new secret while you deploy
 *   a rotation. Any `v1` matching any secret passes.
 *
 * Parsing matches the server's reference verifier: a segment without `=`, a
 * repeated `t`, or a `v1` that is not 64 hex characters is `malformed`; unknown
 * schemes (e.g. `v0=`) are ignored. A timestamp more than `toleranceSeconds`
 * from now, in the past OR the future, is `stale`. MACs are compared in
 * constant time, and every candidate is checked (no early exit).
 */
export function verifyWebhook(rawBody, signatureHeader, secrets, opts) {
    const body = rawBytes(rawBody);
    const list = (typeof secrets === 'string' ? [secrets] : Array.isArray(secrets) ? secrets : []).filter((x) => typeof x === 'string' && x.trim() !== '');
    if (list.length === 0) {
        throw new TypeError('verifyWebhook needs at least one non-empty webhook secret (whsec_…)');
    }
    const tol = opts?.toleranceSeconds ?? WEBHOOK_DEFAULT_TOLERANCE_SECONDS;
    if (typeof tol !== 'number' || !Number.isFinite(tol) || tol < 0) {
        throw new TypeError('toleranceSeconds must be a non-negative number');
    }
    const header = Array.isArray(signatureHeader) ? signatureHeader.join(',') : String(signatureHeader ?? '');
    if (header.trim() === '') {
        throw new WebhookSignatureError('malformed', 'missing X-MegPrime-Signature header');
    }
    let t;
    const sigs = [];
    for (const raw of header.split(',')) {
        const part = raw.trim();
        const i = part.indexOf('=');
        if (i < 0) {
            throw new WebhookSignatureError('malformed', 'signature header segment without "="');
        }
        const k = part.slice(0, i);
        const v = part.slice(i + 1);
        if (k === 't') {
            if (t !== undefined || !/^\d{1,15}$/.test(v)) {
                throw new WebhookSignatureError('malformed', 'signature header must carry exactly one numeric t=');
            }
            t = Number(v);
        }
        else if (k === 'v1') {
            if (!/^[0-9a-fA-F]{64}$/.test(v)) {
                throw new WebhookSignatureError('malformed', 'v1= must be 64 hex characters');
            }
            sigs.push(Buffer.from(v, 'hex'));
        }
    }
    if (t === undefined || sigs.length === 0) {
        throw new WebhookSignatureError('malformed', 'signature header must carry t= and at least one v1=');
    }
    const nowSec = Math.floor((opts?.now ?? new Date()).getTime() / 1000);
    if (Math.abs(nowSec - t) > tol) {
        throw new WebhookSignatureError('stale', `timestamp is outside the ${tol}s tolerance`);
    }
    let ok = false;
    for (const secret of list) {
        const mac = createHmac('sha256', secret).update(`${t}.`).update(body).digest();
        for (const s of sigs) {
            // Both are 32 bytes (checked above), so timingSafeEqual never throws.
            if (timingSafeEqual(s, mac))
                ok = true;
        }
    }
    if (!ok)
        throw new WebhookSignatureError('no_match', 'no signature matched');
    let event;
    try {
        event = JSON.parse(body.toString('utf8'));
    }
    catch {
        throw new WebhookSignatureError('malformed', 'body is not valid JSON');
    }
    return event;
}
const WH = '/api/v1/mpmerchant/server/webhook-endpoints';
const EVENT_ID = /^evt_[0-9a-fA-F]{32}$/;
function toEndpoint(d) {
    return {
        id: str(d.id) ?? '',
        url: str(d.url) ?? '',
        description: str(d.description),
        enabled: d.enabled === true,
        disabledReason: str(d.disabled_reason),
        consecutiveFailures: typeof d.consecutive_failures === 'number' ? d.consecutive_failures : 0,
        secret: str(d.secret),
        createdAt: date(d.created_at),
    };
}
function needId(id, what) {
    if (!id?.trim())
        throw makeError('invalid_options', `${what} is required`);
    return encodeURIComponent(id.trim());
}
function needEventId(id, what) {
    const v = (id ?? '').trim();
    if (!EVENT_ID.test(v))
        throw makeError('invalid_options', `${what} must be an event id (evt_ followed by 32 hex characters)`);
    return v;
}
/**
 * Register a webhook endpoint. The response carries the signing secret
 * (`whsec_…`) ONCE: store it in a server-side secret before doing anything
 * else. The URL must be https on port 443 and resolve to a public address; a
 * store may have at most 5 live endpoints (`webhook_endpoint_limit`).
 * Every endpoint receives every event type: there is no per-endpoint filter.
 */
export async function createWebhookEndpoint(o) {
    const url = (o.url ?? '').trim();
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        parsed = undefined;
    }
    if (!parsed || parsed.protocol !== 'https:' || (parsed.port !== '' && parsed.port !== '443') || url.length > 2048) {
        throw makeError('invalid_options', 'url must be an https:// URL on port 443, 2048 characters or fewer');
    }
    const description = o.description?.trim();
    if ((description?.length ?? 0) > 500) {
        throw makeError('invalid_options', 'description must be 500 characters or fewer');
    }
    return call(WH, 'POST', o, { url, ...(description ? { description } : {}) }, (d) => {
        const e = toEndpoint(d);
        return { ...e, secret: e.secret ?? '' };
    });
}
/** The store's live endpoints. Never includes a secret. */
export async function listWebhookEndpoints(o) {
    return call(WH, 'GET', o, undefined, (d) => {
        const items = (Array.isArray(d) ? d : []);
        return items.map(toEndpoint);
    });
}
/** Delete (soft) an endpoint. Pending deliveries to it fail without retry. */
export async function deleteWebhookEndpoint(o) {
    await call(`${WH}/${needId(o.endpointId, 'endpointId')}`, 'DELETE', o, undefined, () => undefined);
}
/**
 * Issue a new signing secret, returned ONCE. The previous secret keeps
 * verifying for 24 hours: during that window every delivery carries one `v1=`
 * per live secret, so a receiver holding either one verifies. Deploy the new
 * secret (or pass both to `verifyWebhook`) within the 24h.
 */
export async function rotateWebhookSecret(o) {
    return call(`${WH}/${needId(o.endpointId, 'endpointId')}/rotate-secret`, 'POST', o, {}, (d) => {
        const e = toEndpoint(d);
        return { ...e, secret: e.secret ?? '' };
    });
}
/**
 * Re-enable an endpoint (e.g. after auto-disable) and reset its failure count.
 * Events raised while it was disabled were NOT queued for it: gap-fill with
 * `listEvents` or `redeliverEvent` afterwards.
 */
export async function enableWebhookEndpoint(o) {
    return call(`${WH}/${needId(o.endpointId, 'endpointId')}/enable`, 'POST', o, {}, toEndpoint);
}
/**
 * Queue a `webhook.test` event to this one endpoint (202). The server does not
 * return the event id; it arrives in the delivery and in `listEvents`.
 */
export async function sendTestWebhook(o) {
    await call(`${WH}/${needId(o.endpointId, 'endpointId')}/test`, 'POST', o, {}, () => undefined);
}
/**
 * Gap filling: the store's events, oldest first, strictly after the event id
 * `after` (or from the beginning without it). `limit` is 1..100, default 50.
 * An `after` the store does not own is `webhook_event_not_found`.
 * Includes `webhook.test` events.
 */
export async function listEvents(o) {
    const q = new URLSearchParams();
    if (o.after !== undefined && o.after !== '')
        q.set('after', needEventId(o.after, 'after'));
    if (o.limit !== undefined) {
        if (!Number.isInteger(o.limit) || o.limit < 1 || o.limit > 100) {
            throw makeError('invalid_options', 'limit must be an integer from 1 to 100');
        }
        q.set('limit', String(o.limit));
    }
    const limit = o.limit ?? 50;
    const qs = q.toString();
    return call(`/api/v1/mpmerchant/server/events${qs ? `?${qs}` : ''}`, 'GET', o, undefined, (d) => {
        const events = (Array.isArray(d) ? d : []);
        const last = events.length ? events[events.length - 1]?.id : undefined;
        return { events, nextAfter: last ?? (o.after || undefined), mayHaveMore: events.length >= limit };
    });
}
/**
 * Resend one event: resets (or creates) a pending delivery of it for EVERY
 * enabled endpoint of the store, sent on the worker's next tick. `queued` is
 * how many endpoints it was queued for (0 if none is enabled).
 */
export async function redeliverEvent(o) {
    return call(`/api/v1/mpmerchant/server/events/${needEventId(o.eventId, 'eventId')}/redeliver`, 'POST', o, {}, (d) => ({ queued: typeof d.queued === 'number' ? d.queued : 0 }));
}
/**
 * One of the store's payment requests, refreshed from the payments core.
 * `id` is the request id OR its fulfillment id; another store's is a 404
 * (`payment_request_not_found`). This reports status, not `paid_sum`: confirm
 * the amount with `getPaymentStatus` before releasing goods.
 */
export async function getPaymentRequest(o) {
    payOriginsFor(o);
    return call(`/api/v1/mpmerchant/server/pay-requests/${needId(o.id, 'id')}`, 'GET', o, undefined, (d) => {
        // Never fall back to the request id: a pay link must only ever name a
        // fulfillment, and an unconfirmed request has none.
        const fid = str(d.fulfillment_id);
        return {
            requestId: str(d.id),
            fulfillmentId: fid,
            amountUoa: str(d.notional_uoa) ?? '0',
            currency: d.currency ?? undefined,
            deadline: date(d.deadline),
            clientRef: str(d.client_ref),
            classification: str(d.classification),
            merchantRewardPercentage: num(d.merchant_reward_percentage),
            memo: str(d.memo),
            status: str(d.status)?.toLowerCase(),
            settledAt: date(d.settled_at),
            voidedAt: date(d.voided_at),
            createdAt: date(d.created_at),
            ...(fid ? payLinks(fid, o) : {}),
        };
    });
}
/** @deprecated Use `getPaymentRequest`. Same call. */
export const getPayRequest = getPaymentRequest;
// Re-exported from qr.ts so a server rendering a receipt does not need a second
// import path. Drawing a QR needs no credential.
export { toQrDataUrl, toQrSvg, payUrlFor, walletPayUrlFor, walletQrSvg, walletQrDataUrl, appQrSvg, appQrDataUrl, mppTransferUri, mppDepositQrSvg, mppDepositQrDataUrl, QrInputError } from './qr.js';
import { payUrlFor as payUrlForId, payOriginsFor } from './qr.js';
export { PAY_ORIGINS, payOriginsFor } from './qr.js';
function payLinks(fulfillmentId, o) {
    const origins = payOriginsFor(o);
    return { payUrl: payUrlForId(fulfillmentId, origins.app), walletPayUrl: payUrlForId(fulfillmentId, origins.wallet) };
}
export { formatUoa } from './money.js';
