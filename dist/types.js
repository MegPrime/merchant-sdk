/**
 * The wire and the public surface.
 *
 * Amounts are ALWAYS minor units as a decimal string, never a number. 1500000
 * of a 6-decimal token is 1.50, and a JavaScript number cannot be trusted with
 * money: 2^53 is about 9e9 minor units, and a float that rounds a price is a
 * customer shown the wrong figure.
 */
/** Terminal states. Once here, polling has stopped for good. */
export const TERMINAL_STATES = [
    'paid',
    'expired',
    'cancelled',
    'error',
    'unconfirmed',
];
export function isTerminal(s) {
    return TERMINAL_STATES.includes(s);
}
export const DEFAULT_LABELS = {
    scanToPay: 'Scan to pay',
    openInApp: 'Open in the app',
    waiting: 'Waiting for payment…',
    reconnecting: 'Reconnecting…',
    paid: 'Paid',
    expired: 'This payment request has expired',
    // Not "Cancelled payment": a publishable key cannot void anything, so the
    // request may still be payable. Saying it was cancelled would be a lie the
    // merchant has to live with.
    cancelled: 'Closed',
    close: 'Close',
    qrAlt: 'QR code containing a payment link',
    errorGeneric: "This payment couldn't be started",
};
