/**
 * @megprime/merchant-sdk
 *
 * Take payments into a MegPrime store from your own application, with no
 * backend of your own.
 *
 * THE ONE PROPERTY EVERYTHING ELSE FOLLOWS FROM
 *
 * This SDK never sends an amount. It sends a `priceId` the MERCHANT registered,
 * and the server reads the figure from that row.
 *
 * That is not a stylistic choice. The client belongs to the BUYER — anyone can
 * open devtools and change a number before it is sent — and the buyer is not an
 * intruder to be kept out, they are a legitimate customer who would rather pay
 * less. Authenticating them does not help: it proves who is paying and says
 * nothing about how much. Neither do CORS, origin allowlists or referrer
 * checks, which are browser policy, and curl is not a browser.
 *
 * Because the client can only CHOOSE among prices the merchant set, and never
 * INVENT one, the publishable key is safe to ship inside a public bundle. It
 * cannot name an amount, a wallet or a store, and it cannot read anything. Its
 * single power is to point money at the store it is bound to.
 *
 *     import { createCheckout } from '@megprime/merchant-sdk';
 *
 *     const checkout = createCheckout({
 *       publishableKey: 'mpk_…',
 *       priceId: '9f1c0b8e-…',
 *       container: '#pay',
 *       onSuccess: ({ paidUoa }) => fulfilOrder(paidUoa),
 *       onError:   (err)        => show(err.message),
 *       onCancel:  ()           => close(),
 *     });
 *     await checkout.start();
 */
import { Checkout } from './checkout.js';
import { mountUI } from './ui.js';
export * from './types.js';
export { formatUoa } from './money.js';
/**
 * Create a checkout.
 *
 * With a `container`, the SDK renders a QR, a deeplink and status into a shadow
 * root. Without one it renders nothing and reports state through
 * `onStateChange` — use `snapshot.payUrl` to draw your own.
 */
export function createCheckout(opts) {
    return build(opts);
}
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
export function attachCheckout(opts) {
    return build({
        ...opts,
        publishableKey: '',
        priceId: '',
        attachTo: opts.fulfillmentId,
    });
}
function build(opts) {
    let ui;
    const withUI = {
        ...opts,
        onStateChange(state, snap) {
            ui?.update(snap);
            opts.onStateChange?.(state, snap);
        },
    };
    const checkout = new Checkout({ ...withUI, attachTo: opts.attachTo });
    const el = typeof opts.container === 'string'
        ? globalThis.document?.querySelector(opts.container)
        : opts.container;
    if (el) {
        ui = mountUI(el, {
            labels: opts.labels,
            theme: opts.theme,
            // Closing the widget stops polling and reports `abandoned` — it does not
            // and cannot cancel the request upstream.
            onClose: () => checkout.cancel('merchant'),
        });
        ui.update(checkout.snapshot);
    }
    return {
        start: () => checkout.start(),
        cancel: () => checkout.cancel('merchant'),
        destroy: () => {
            checkout.destroy();
            ui?.destroy();
            ui = undefined;
        },
        get snapshot() {
            return checkout.snapshot;
        },
    };
}
