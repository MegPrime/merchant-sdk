import { type CheckoutOptions, type CheckoutSnapshot } from './types.js';
import { type MppDepositInstructions, type MppDepositIntent } from './mpp.js';
export declare class Checkout {
    private opts;
    private snap;
    private timer;
    private startedAt;
    private gracePollsLeft;
    private destroyed;
    private onVisibility;
    /**
     * `attachTo` is a fulfillment somebody ELSE created — a developer's server,
     * using its own credential, for an amount it computed. This checkout then
     * only renders and polls it.
     *
     * That split is the whole reason the server path is safe with a free-form
     * amount: the figure is decided on a machine the customer cannot reach, and
     * by the time it arrives here it is frozen on the fulfillment. The client is
     * handed an id and nothing worth tampering with.
     */
    private attachTo;
    /** The normalised classification slug, set by validate(). */
    private classification;
    constructor(opts: CheckoutOptions & {
        attachTo?: string;
    });
    /** The current view. A copy, so a host cannot mutate SDK state by accident. */
    get snapshot(): CheckoutSnapshot;
    /**
     * Create the request and begin polling.
     *
     * Safe to await or to fire and forget: every outcome arrives through the
     * callbacks either way.
     */
    start(): Promise<CheckoutSnapshot>;
    /**
     * Stop this checkout.
     *
     * It CANNOT recall the request. A publishable key has no power to void
     * anything, so a customer holding a screenshot of the QR can still pay after
     * this returns. That is why onCancel says so, and why the bundled UI's button
     * says "Close" rather than "Cancel payment".
     */
    cancel(reason?: 'merchant' | 'abandoned'): void;
    /** Release every timer and listener. Idempotent. */
    destroy(): void;
    /**
     * Pay from an exchange: ask for an MPP deposit address and the exact amount.
     *
     * Works in created and attached mode alike; holding the fulfillment id is
     * enough, no key is sent. It does not change how paid is detected: the
     * status polling flips to `paid` when the fulfillment confirms. Rejects with
     * a CheckoutError (`invalid_options` for a bad refund address, before any
     * request; the gateway's code otherwise).
     */
    createMppDepositIntent(o: {
        refundAddress: string;
    }): Promise<MppDepositInstructions>;
    /** Read back the deposit intent `createMppDepositIntent` issued. */
    getMppDepositIntent(): Promise<MppDepositIntent>;
    /**
     * Resume this payer's deposit intent by their refund address (read-only;
     * never creates one). 404 `mpp_deposit_intent_not_found` when they have none.
     */
    resumeMppDepositIntent(o: {
        refundAddress: string;
    }): Promise<MppDepositIntent>;
    private mppIntentId;
    private requireFulfillmentId;
    private mppFetch;
    private gateway;
    /** Refuse locally what the server would refuse anyway, to save a round trip
     *  and to give a developer the error at the call site. */
    private validate;
    private transition;
    private fail;
    /**
     * Poll while the tab is hidden, but slowly.
     *
     * Stopping entirely is tempting and wrong: the common flow is a payer
     * switching to their wallet app to pay, which hides this tab for exactly the
     * window in which the answer arrives. Coming back to a spinner that never
     * moved, on a sale that settled a minute ago, is the failure that matters.
     */
    private watchVisibility;
    private stopPolling;
    /**
     * Arm the next poll.
     *
     * A chain of setTimeout, never setInterval: an interval on a slow network
     * stacks requests and the queue never drains. The next timer is armed only
     * after a response settles, so there is exactly one poll in flight.
     */
    private armPoll;
    private poll;
    /**
     * Did less arrive than was committed?
     *
     * Both figures are uint256-scale decimal strings, so the comparison is
     * BigInt: a float64 rounds above 2^53 and would call a shortfall exact.
     * Unknown (either figure missing or unparseable) is treated as NOT underpaid,
     * because refusing to ever report a real payment is a worse failure than the
     * one this guards — and the host still has both numbers on the snapshot.
     */
    private underpaid;
    private pollFailed;
    /** The next interval, or a grace poll, or expiry. */
    private nextIntervalOrExpire;
}
