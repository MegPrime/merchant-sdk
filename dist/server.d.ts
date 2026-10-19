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
import type { Currency, Uoa } from './types.js';
import { type MppDepositInstructions } from './mpp.js';
export type { MppDepositInstructions, MppDepositIntent, MppDepositState } from './mpp.js';
export { formatMppBaseUnits, MPP_TOKEN_ADDRESS, BASE_CHAIN_ID, MPP_DECIMALS } from './mpp.js';
export interface ServerOptions {
    /** msk_… Never ship this to a browser. */
    secretKey: string;
    /** Gateway root. Defaults to https://api.megprimepay.com */
    gateway?: string;
    /** Aborts the request. Default 10s: a checkout waiting on this is a customer waiting. */
    timeoutMs?: number;
    /** Pay-page environment for the payUrl/walletPayUrl this returns. Defaults to 'prod'; set 'uat' with a UAT key. */
    env?: PayEnv;
    /** payUrl host, overriding `env`. */
    payOrigin?: string;
    /** walletPayUrl host, overriding `env`. */
    walletPayOrigin?: string;
}
export interface CreatePaymentOptions extends ServerOptions {
    /** Minor units as a decimal string. Your server decides this. */
    amountUoa: Uoa;
    /** One uuid per SALE. A retry with the same ref returns the SAME request. */
    clientRef?: string;
    /** Rides onto the request for the merchant. 200 characters or fewer. */
    memo?: string;
}
export interface PaymentRequest {
    /** Absent when the upstream did not answer — see `unconfirmed` in the README.
     *  Do not show a QR for a request with no id. */
    fulfillmentId?: string;
    /** The request's own id (what webhook `data.object.id` carries). */
    requestId?: string;
    amountUoa: Uoa;
    currency?: Currency;
    deadline?: Date;
    clientRef?: string;
    /** The deep link to encode as a QR, when there is a request to pay. */
    payUrl?: string;
    /** The wallet link: any Base wallet holding USDC, no account. */
    walletPayUrl?: string;
}
/**
 * - `proposed`: waiting on the store owner (over your key's auto-refund limit).
 * - `owed`: approved, automatically (100 USDC or less by default) or by the
 *   owner. MegPrime owes it and settles it with you OFF-CHAIN, by wire.
 * - `wired`: MegPrime has sent the wire.
 * - `approved`: an ON-CHAIN refund the owner must pay (not used for sales your
 *   secret key created).
 * - `rejected` | `failed`: see `decisionReason`.
 */
export type RefundState = 'proposed' | 'owed' | 'wired' | 'approved' | 'rejected' | 'failed';
/** How the refund is settled. Sales your secret key created settle `off_chain`. */
export type RefundSettlement = 'off_chain' | 'on_chain';
export interface RefundProposal {
    id: string;
    state: RefundState;
    amountUoa: Uoa;
    /** The refund the OWNER pays, once they have approved. Absent before that,
     *  and on a proposal the payments core refused. */
    refundFulfillmentId?: string;
    /** `off_chain` for sales your secret key created: MegPrime settles by wire. */
    settlement?: RefundSettlement;
    /** True when it was approved automatically, under your key's limit. */
    autoApproved?: boolean;
    /** Only for an on-chain refund: the wallet it goes to. */
    refundDestination?: string;
    /** Why it was rejected, or why raising it failed. */
    decisionReason?: string;
    decidedAt?: Date;
    createdAt?: Date;
}
export interface ProposeRefundOptions extends ServerOptions {
    /** The settled sale to refund: the id `createPaymentRequest` returned. */
    fulfillmentId: string;
    /** Minor units, at most what actually arrived. */
    amountUoa: Uoa;
    /** For the owner deciding. 500 characters or fewer. */
    reason?: string;
    /** One uuid per refund decision. A retry returns the SAME proposal. */
    clientRef?: string;
}
/**
 * Create a payment request for an amount your server decided.
 *
 * Send the client the `fulfillmentId` and nothing else; the browser renders it
 * with `attachCheckout`, or draws its own QR from `payUrl`.
 */
export declare function createPaymentRequest(o: CreatePaymentOptions): Promise<PaymentRequest>;
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
export declare function proposeRefund(o: ProposeRefundOptions): Promise<RefundProposal>;
/** Read back a proposal this key raised — the owner's decision, when they make one. */
export declare function getRefundProposal(o: ServerOptions & {
    proposalId: string;
}): Promise<RefundProposal>;
/**
 * What actually arrived, for a sale or for a refund.
 *
 * Credential-free by design: this is the same endpoint the browser polls, so a
 * server and a page can agree about one payment without the server holding a
 * second opinion. Use it to confirm a sale before releasing goods, and to watch
 * an approved refund until the merchant has actually paid it.
 */
export declare function getPaymentStatus(fulfillmentId: string, o?: {
    gateway?: string;
    timeoutMs?: number;
}): Promise<{
    status: string;
    paidUoa: Uoa;
    amountUoa: Uoa;
    settledAt?: Date;
}>;
/**
 * Pay from an exchange, raised by your server: an MPP deposit address and the
 * EXACT amount to send there on Base, for a fulfillment you hold.
 *
 * Idempotent per request: a repeat returns the same intent. Paid detection is
 * unchanged: watch `getPaymentStatus` (or the webhook) for the fulfillment to
 * confirm. `refundAddress` is checked locally (0x + 40 hex, non-zero) before
 * the request; anything the forwarder cannot route is returned there.
 */
export declare function createMppDepositIntent(fulfillmentId: string, o: ServerOptions & {
    refundAddress: string;
}): Promise<MppDepositInstructions>;
/** The header carrying the signature. Node lowercases incoming header names. */
export declare const WEBHOOK_SIGNATURE_HEADER = "x-megprime-signature";
/** Same value as the payload's `id`. */
export declare const WEBHOOK_EVENT_ID_HEADER = "x-megprime-event-id";
export declare const WEBHOOK_EVENT_TYPE_HEADER = "x-megprime-event-type";
/** Differs per endpoint, and per redelivery target. Not a dedupe key. */
export declare const WEBHOOK_DELIVERY_ID_HEADER = "x-megprime-delivery-id";
/** Default replay window, matching the server's outbound.DefaultTolerance. */
export declare const WEBHOOK_DEFAULT_TOLERANCE_SECONDS = 300;
export declare const PAYMENT_REQUEST_EVENT_TYPES: readonly ["payment_request.paid", "payment_request.failed", "payment_request.expired", "payment_request.voided"];
export declare const REFUND_EVENT_TYPES: readonly ["refund.proposed", "refund.owed", "refund.rejected", "refund.wired", "refund.failed"];
/** Every event type the server emits today. Ignore (and 2xx) types not in this
 *  list: new ones may be added without a version bump. */
export declare const WEBHOOK_EVENT_TYPES: readonly ["payment_request.paid", "payment_request.failed", "payment_request.expired", "payment_request.voided", "refund.proposed", "refund.owed", "refund.rejected", "refund.wired", "refund.failed", "webhook.test"];
export type PaymentRequestEventType = (typeof PAYMENT_REQUEST_EVENT_TYPES)[number];
export type RefundEventType = (typeof REFUND_EVENT_TYPES)[number];
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
/**
 * `data.object` of a `payment_request.*` event: the sale as stored when the
 * event was cut. snake_case, exactly as delivered.
 */
export interface WebhookPaymentRequestObject {
    /** The request id (not the fulfillment id). */
    id: string;
    store_id: string;
    terminal_id: string | null;
    terminal_name?: string;
    created_by?: string;
    /** The v3 fulfillment. Absent only for a request that never got one. */
    fulfillment_id?: string;
    receiver_wallet: string;
    device_paired: boolean;
    client_ref?: string;
    request_token: string;
    chain_id: number;
    /** Minor units, decimal string. */
    notional_uoa: Uoa;
    currency?: Currency;
    memo?: string;
    reference: string;
    deadline: string;
    /** v3's last status as cached, e.g. `confirmed`, `settled`, `failed`,
     *  `expired`, `cancelled`, `declined`. Not normalised: compare lowercased. */
    status?: string;
    status_at?: string;
    settled_at?: string;
    voided_at?: string;
    created_at: string;
    updated_at: string;
    /** `payment_request.paid` only: the settling chain transaction, when known. */
    tx_hash?: string;
}
/**
 * `data.object` of a `refund.*` event: the partner view of the refund.
 * Finance's wire reference and who wired it are never included.
 */
export interface WebhookRefundObject {
    id: string;
    store_id: string;
    /** The sale's request id. */
    request_id: string;
    amount_uoa: Uoa;
    reason?: string;
    state: RefundState;
    settlement: RefundSettlement;
    /** `refund.wired` only: when the wire was sent. */
    wired_at?: string;
    proposed_by?: string;
    proposed_by_key_id?: string;
    /** `system:auto` for an automatic approval under the key's limits. */
    decided_by?: string;
    decided_at?: string;
    decision_reason?: string;
    refund_fulfillment_id?: string;
    refund_destination?: string;
    client_ref?: string;
    created_at: string;
    updated_at: string;
}
/** `data.object` of `webhook.test`. */
export interface WebhookTestObject {
    endpoint_id: string;
}
interface WebhookEventBase<T extends string, O> {
    /** `evt_<32 hex>`. Stable across retries and redeliveries: dedupe on it. */
    id: string;
    type: T;
    /** RFC 3339, second precision, UTC. */
    created_at: string;
    /** e.g. `2026-10-12`. */
    api_version: string;
    /** The resource as it was when the event was cut. Act on its own
     *  status/state, not on the order events arrive in. */
    data: {
        object: O;
    };
}
export type PaymentRequestEvent = WebhookEventBase<PaymentRequestEventType, WebhookPaymentRequestObject>;
export type RefundEvent = WebhookEventBase<RefundEventType, WebhookRefundObject>;
export type WebhookTestEvent = WebhookEventBase<'webhook.test', WebhookTestObject>;
export type WebhookEvent = PaymentRequestEvent | RefundEvent | WebhookTestEvent;
export type WebhookSignatureErrorCode = 'malformed' | 'stale' | 'no_match';
/** A delivery that failed verification. Answer it with a 400 and do not act on it. */
export declare class WebhookSignatureError extends Error {
    readonly code: WebhookSignatureErrorCode;
    constructor(code: WebhookSignatureErrorCode, message: string);
}
export interface VerifyWebhookOptions {
    /** Replay window in seconds, either side of now. Default 300. */
    toleranceSeconds?: number;
    /** The clock, for tests. */
    now?: Date;
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
export declare function verifyWebhook(rawBody: string | Uint8Array | ArrayBuffer, signatureHeader: string | string[] | null | undefined, secrets: string | readonly string[], opts?: VerifyWebhookOptions): WebhookEvent;
export interface WebhookEndpoint {
    id: string;
    url: string;
    description?: string;
    /** False after `deleteWebhookEndpoint`, or after the server auto-disabled it
     *  (10 consecutive failed deliveries): see `disabledReason`. */
    enabled: boolean;
    disabledReason?: string;
    /** Deliveries that ended `failed` in a row. Any success resets it to 0. */
    consecutiveFailures: number;
    /** `whsec_…`. Only on create and rotate: store it now, it is not shown again. */
    secret?: string;
    createdAt?: Date;
}
/**
 * Register a webhook endpoint. The response carries the signing secret
 * (`whsec_…`) ONCE: store it in a server-side secret before doing anything
 * else. The URL must be https on port 443 and resolve to a public address; a
 * store may have at most 5 live endpoints (`webhook_endpoint_limit`).
 * Every endpoint receives every event type: there is no per-endpoint filter.
 */
export declare function createWebhookEndpoint(o: ServerOptions & {
    url: string;
    description?: string;
}): Promise<WebhookEndpoint & {
    secret: string;
}>;
/** The store's live endpoints. Never includes a secret. */
export declare function listWebhookEndpoints(o: ServerOptions): Promise<WebhookEndpoint[]>;
/** Delete (soft) an endpoint. Pending deliveries to it fail without retry. */
export declare function deleteWebhookEndpoint(o: ServerOptions & {
    endpointId: string;
}): Promise<void>;
/**
 * Issue a new signing secret, returned ONCE. The previous secret keeps
 * verifying for 24 hours: during that window every delivery carries one `v1=`
 * per live secret, so a receiver holding either one verifies. Deploy the new
 * secret (or pass both to `verifyWebhook`) within the 24h.
 */
export declare function rotateWebhookSecret(o: ServerOptions & {
    endpointId: string;
}): Promise<WebhookEndpoint & {
    secret: string;
}>;
/**
 * Re-enable an endpoint (e.g. after auto-disable) and reset its failure count.
 * Events raised while it was disabled were NOT queued for it: gap-fill with
 * `listEvents` or `redeliverEvent` afterwards.
 */
export declare function enableWebhookEndpoint(o: ServerOptions & {
    endpointId: string;
}): Promise<WebhookEndpoint>;
/**
 * Queue a `webhook.test` event to this one endpoint (202). The server does not
 * return the event id; it arrives in the delivery and in `listEvents`.
 */
export declare function sendTestWebhook(o: ServerOptions & {
    endpointId: string;
}): Promise<void>;
export interface ListEventsResult {
    /** Oldest first: the exact payloads that were (or will be) delivered. */
    events: WebhookEvent[];
    /** Pass as `after` for the next page: the last id on this page, or the
     *  `after` you sent when the page was empty. Undefined only when both are. */
    nextAfter?: string;
    /** True when the page was full, so there may be more. The server sends no
     *  explicit flag; a full last page is followed by an empty one. */
    mayHaveMore: boolean;
}
/**
 * Gap filling: the store's events, oldest first, strictly after the event id
 * `after` (or from the beginning without it). `limit` is 1..100, default 50.
 * An `after` the store does not own is `webhook_event_not_found`.
 * Includes `webhook.test` events.
 */
export declare function listEvents(o: ServerOptions & {
    after?: string;
    limit?: number;
}): Promise<ListEventsResult>;
/**
 * Resend one event: resets (or creates) a pending delivery of it for EVERY
 * enabled endpoint of the store, sent on the worker's next tick. `queued` is
 * how many endpoints it was queued for (0 if none is enabled).
 */
export declare function redeliverEvent(o: ServerOptions & {
    eventId: string;
}): Promise<{
    queued: number;
}>;
export interface PaymentRequestDetails extends PaymentRequest {
    /** v3's status, lowercased (e.g. `open`, `confirmed`, `settled`, `expired`). */
    status?: string;
    memo?: string;
    settledAt?: Date;
    voidedAt?: Date;
    createdAt?: Date;
}
/**
 * One of the store's payment requests, refreshed from the payments core.
 * `id` is the request id OR its fulfillment id; another store's is a 404
 * (`payment_request_not_found`). This reports status, not `paid_sum`: confirm
 * the amount with `getPaymentStatus` before releasing goods.
 */
export declare function getPaymentRequest(o: ServerOptions & {
    id: string;
}): Promise<PaymentRequestDetails>;
/** @deprecated Use `getPaymentRequest`. Same call. */
export declare const getPayRequest: typeof getPaymentRequest;
export { toQrDataUrl, toQrSvg, payUrlFor, walletPayUrlFor, walletQrSvg, walletQrDataUrl, appQrSvg, appQrDataUrl, mppTransferUri, mppDepositQrSvg, mppDepositQrDataUrl, type QrOptions, QrInputError } from './qr.js';
import { type PayEnv } from './qr.js';
export { PAY_ORIGINS, payOriginsFor, type PayEnv, type PayLinkOptions } from './qr.js';
export type { CheckoutError, CheckoutErrorCode, Currency, Uoa } from './types.js';
export { formatUoa } from './money.js';
