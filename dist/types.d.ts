/**
 * The wire and the public surface.
 *
 * Amounts are ALWAYS minor units as a decimal string, never a number. 1500000
 * of a 6-decimal token is 1.50, and a JavaScript number cannot be trusted with
 * money: 2^53 is about 9e9 minor units, and a float that rounds a price is a
 * customer shown the wrong figure.
 */
/** Minor units of the settlement token, as a decimal string. */
export type Uoa = string;
/**
 * The scale of every amount beside it, sent by the server.
 *
 * Without this an SDK in a third-party app receives "5000000" and a contract
 * address and can only hardcode a guess — which becomes wrong the day the
 * merchant's settlement token changes, on the screen telling a customer what
 * they are about to pay. The server emits it on the create response.
 */
export interface Currency {
    symbol: string;
    decimals: number;
    address: string;
    chain_id: number;
}
/** The states a checkout passes through. */
export type CheckoutState = 'idle' | 'creating' | 'awaiting_payment' | 'settling' | 'paid' | 'expired' | 'cancelled' | 'error' | 'unconfirmed';
/** Terminal states. Once here, polling has stopped for good. */
export declare const TERMINAL_STATES: readonly CheckoutState[];
export declare function isTerminal(s: CheckoutState): boolean;
/**
 * Machine codes the server returns. Branch on `code`, never on `message` —
 * messages are for humans and will change.
 */
export type CheckoutErrorCode = 
/** The key is unknown, revoked, expired or malformed. Deliberately one code:
 *  a caller able to tell these apart can probe for keys that once existed. */
'publishable_key_invalid'
/** No live price with that id on this key's store. Also returned for a price
 *  belonging to a DIFFERENT store, so a key cannot be used to discover what
 *  other merchants have registered. */
 | 'price_not_found'
/** The price exceeds the ceiling set on this key when it was minted. */
 | 'price_over_key_cap'
/** The merchant's deployment has no service credential; nothing could be
 *  created. An operator problem, not something the shopper did. */
 | 'embedded_payments_unavailable'
/** Too many requests from this key or this address. */
 | 'rate_limited'
/** The request never reached the gateway, or the gateway never answered. */
 | 'network'
/** The SDK refused the options it was handed, before any request. */
 | 'invalid_options'
/** Anything the SDK does not recognise. */
 | 'unknown';
export interface CheckoutError extends Error {
    code: CheckoutErrorCode;
    /** HTTP status, when there was one. */
    status?: number;
    /** True when trying again could plausibly work. A wrong price id cannot. */
    retryable: boolean;
}
/** Everything a renderer needs, and everything a host may inspect. */
export interface CheckoutSnapshot {
    state: CheckoutState;
    /** Absent before the request is created, and in `unconfirmed`. */
    fulfillmentId?: string;
    /** The idempotency key for this SALE. Stable across retries. */
    clientRef: string;
    /** The URL a payer opens. Encode this as the QR. */
    payUrl?: string;
    /** The wallet link (merchant.megprimepay.com): pay from any Base wallet holding USDC, no account. Test store only for now. */
    walletPayUrl?: string;
    /** Server-authored. The client never chooses this. */
    amountUoa?: Uoa;
    /** How much has actually arrived, once polling has an answer. */
    paidUoa?: Uoa;
    /** The scale for the two amounts above. */
    currency?: Currency;
    /** When the request stops being payable. */
    deadline?: Date;
    /** When the money actually landed, once it has. */
    settledAt?: Date;
    lastPolledAt?: Date;
    /** Consecutive failed polls. Non-zero means the answer is UNKNOWN, not "not
     *  paid" — a renderer should say "reconnecting", never "unpaid". */
    consecutiveFailures: number;
    error?: CheckoutError;
}
export interface PaidResult {
    fulfillmentId: string;
    clientRef: string;
    amountUoa: Uoa;
    paidUoa: Uoa;
    currency?: Currency;
    settledAt?: Date;
}
export interface CancelResult {
    /**
     * 'payer'     — upstream reports cancelled or declined.
     * 'merchant'  — the host called .cancel().
     * 'abandoned' — the checkout was destroyed while the sale was still live.
     *
     * IN EVERY CASE THE REQUEST MAY STILL BE PAYABLE. A publishable key cannot
     * void anything, so a customer holding a screenshot of the QR can still pay
     * after the widget is gone. Reconcile against the merchant's own records,
     * never against this callback.
     */
    reason: 'payer' | 'merchant' | 'abandoned';
    fulfillmentId?: string;
    clientRef: string;
}
export interface CheckoutOptions {
    /** mpk_… Public by construction: safe to ship in a bundle. */
    publishableKey: string;
    /** A price the STORE registered. The only thing a client may choose. */
    priceId: string;
    /** Gateway root. Defaults to https://api.megprimepay.com */
    gateway?: string;
    /**
     * One uuid per SALE, not per attempt.
     *
     * Supply it if your app knows what a basket is — it almost certainly does,
     * and the SDK does not. Omitted, the SDK mints one and holds it for the life
     * of the checkout, which makes a retry after a lost response return the SAME
     * request instead of charging twice.
     */
    clientRef?: string;
    /** Rides onto the request for the merchant. Refused locally above 200 chars
     *  rather than spending a round trip to be told. */
    memo?: string;
    /** Omit for headless. A string is treated as a selector. */
    container?: HTMLElement | string;
    theme?: 'light' | 'dark' | 'auto';
    /** Override any label. The host owns its own copy and its own language. */
    labels?: Partial<Record<LabelKey, string>>;
    onSuccess?(result: PaidResult): void;
    onError?(error: CheckoutError): void;
    onCancel?(result: CancelResult): void;
    /** Every transition, including non-terminal ones. */
    onStateChange?(state: CheckoutState, snapshot: CheckoutSnapshot): void;
}
export type LabelKey = 'scanToPay' | 'openInApp' | 'waiting' | 'reconnecting' | 'paid' | 'expired' | 'cancelled' | 'close' | 'qrAlt' | 'errorGeneric';
export declare const DEFAULT_LABELS: Record<LabelKey, string>;
