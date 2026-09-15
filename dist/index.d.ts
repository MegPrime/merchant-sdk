import type { CheckoutOptions, CheckoutSnapshot } from './types.js';
export * from './types.js';
export { formatUoa } from './money.js';
export interface CheckoutHandle {
    start(): Promise<CheckoutSnapshot>;
    /**
     * Stop the checkout.
     *
     * This CANNOT recall the payment request. A publishable key has no power to
     * void anything, so a customer holding a screenshot of the QR can still pay
     * after this returns. Reconcile against the merchant's records, never against
     * this call.
     */
    cancel(): void;
    destroy(): void;
    readonly snapshot: CheckoutSnapshot;
}
/**
 * Create a checkout.
 *
 * With a `container`, the SDK renders a QR, a deeplink and status into a shadow
 * root. Without one it renders nothing and reports state through
 * `onStateChange` — use `snapshot.payUrl` to draw your own.
 */
export declare function createCheckout(opts: CheckoutOptions): CheckoutHandle;
/**
 * Render and poll a payment request your SERVER already created.
 *
 * This is the other half of the server-side path. Your backend computes the
 * total, calls MegPrime with its own credential, and sends the client nothing
 * but the `fulfillmentId`. No key of any kind reaches the browser.
 *
 * Use this whenever the amount is CALCULATED — a basket, shipping, tax. The
 * publishable-key path deliberately cannot do that: a price computed on the
 * customer's device is a price the customer chooses.
 *
 *     // your server
 *     const { fulfillment_id } = await megprime.createPaymentRequest({ amount });
 *
 *     // your page
 *     attachCheckout({ fulfillmentId: fulfillment_id, container: '#pay',
 *                      onSuccess: fulfilOrder });
 */
export declare function attachCheckout(opts: Omit<CheckoutOptions, 'publishableKey' | 'priceId'> & {
    fulfillmentId: string;
}): CheckoutHandle;
