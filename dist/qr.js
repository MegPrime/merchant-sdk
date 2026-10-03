/**
 * The QR, as an API rather than a thing only the bundled widget can draw.
 *
 * The widget draws one for you, and for the common case that is the whole
 * answer. But the widget is opt-in — omit `container` and the SDK renders
 * nothing — and until now the headless path meant adding `qrcode` yourself and
 * learning that the thing to encode is `snapshot.payUrl`. That is a footgun in
 * the shape of a blank page: the obvious guess is to encode the fulfillment id,
 * which produces a QR no wallet can resolve.
 *
 * So: two functions and one rule.
 *
 * THE RULE. Encode `payUrl`, and nothing else. It is the deep link a payer's
 * wallet knows how to open; an id, an amount or a JSON blob is not. Both
 * functions here refuse anything that is not a URL rather than drawing a code
 * that scans cleanly and does nothing, which is the worst failure available —
 * it looks like it worked.
 */
/** The error every function here throws when handed something unencodable. */
export class QrInputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QrInputError';
    }
}
function assertPayUrl(url) {
    const s = typeof url === 'string' ? url.trim() : '';
    if (!s) {
        // The usual cause: drawing before the request exists. payUrl is absent
        // until the checkout reaches `awaiting_payment`, and in `unconfirmed` it
        // stays absent on purpose — see the note on that state in types.ts.
        throw new QrInputError('no payUrl to encode. Wait for snapshot.payUrl (it is absent until the payment request exists, and in `unconfirmed` deliberately stays absent)');
    }
    let parsed;
    try {
        parsed = new URL(s);
    }
    catch {
        throw new QrInputError(`payUrl must be a URL, got ${JSON.stringify(s.slice(0, 40))}. Encode snapshot.payUrl, not a fulfillment id: a QR of an id scans cleanly and resolves to nothing`);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new QrInputError(`payUrl must be http(s), got ${parsed.protocol}`);
    }
    return s;
}
function opts(o) {
    return {
        width: o?.width ?? 240,
        margin: o?.margin ?? 1,
        errorCorrectionLevel: o?.errorCorrectionLevel ?? 'M',
        color: { dark: o?.dark ?? '#000000', light: o?.light ?? '#ffffff' },
    };
}
/**
 * A PNG data URL, for `<img src>`.
 *
 * `qrcode` is imported lazily, so an integrator who draws nothing never pays
 * for the encoder — the same reason the widget defers it.
 */
export async function toQrDataUrl(payUrl, options) {
    const url = assertPayUrl(payUrl);
    const qrcode = await import('qrcode');
    return qrcode.toDataURL(url, opts(options));
}
/**
 * An SVG string, for inlining.
 *
 * Preferred over the PNG where the code may be printed or scaled: a receipt at
 * 300dpi renders a 240px PNG as a soft square, and a soft QR is a customer
 * holding their phone at it for ten seconds.
 */
export async function toQrSvg(payUrl, options) {
    const url = assertPayUrl(payUrl);
    const qrcode = await import('qrcode');
    return qrcode.toString(url, { ...opts(options), type: 'svg' });
}
/**
 * The deep link for a fulfillment id.
 *
 * Use this when you hold an id and no checkout — a refund your server raised, a
 * request created by another process, a receipt reprint. It is the one place
 * the URL shape is written down, so nothing else has to guess it:
 *
 *     https://app.megprimepay.com/send?fulfillment_id=<id>
 *
 * Never build that string by hand elsewhere. A hand-built link with the wrong
 * host is a QR that opens nothing, and the person holding the phone cannot tell
 * that from a broken payment.
 */
export const WALLET_PAY_ORIGIN = 'https://merchant.megprimepay.com';
export function payUrlFor(fulfillmentId, payOrigin = 'https://app.megprimepay.com') {
    const id = String(fulfillmentId ?? '').trim();
    if (!id)
        throw new QrInputError('fulfillmentId is required');
    return `${payOrigin.replace(/\/+$/, '')}/send?fulfillment_id=${encodeURIComponent(id)}`;
}
/**
 * The wallet link for a fulfillment id: https://merchant.megprimepay.com/send?fulfillment_id=<id>
 *
 * For anyone with a Base wallet holding USDC. No MegPrime account is needed.
 * Test store only until MegPrime decides on KYC. `payUrlFor` (the app link) is
 * unchanged; this is additive.
 */
export function walletPayUrlFor(fulfillmentId, origin = WALLET_PAY_ORIGIN) {
    return payUrlFor(fulfillmentId, origin);
}
/** SVG QR of the wallet link for a fulfillment id. */
export function walletQrSvg(fulfillmentId, options) {
    return toQrSvg(walletPayUrlFor(fulfillmentId), options);
}
/** PNG data-URL QR of the wallet link for a fulfillment id. */
export function walletQrDataUrl(fulfillmentId, options) {
    return toQrDataUrl(walletPayUrlFor(fulfillmentId), options);
}
/** SVG QR of the app link for a fulfillment id. */
export function appQrSvg(fulfillmentId, options) {
    return toQrSvg(payUrlFor(fulfillmentId), options);
}
/** PNG data-URL QR of the app link for a fulfillment id. */
export function appQrDataUrl(fulfillmentId, options) {
    return toQrDataUrl(payUrlFor(fulfillmentId), options);
}
