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
/** Options both renderers share. Defaults suit a payment on a phone screen. */
export interface QrOptions {
    /** Pixel width for the data URL, or viewport size for the SVG. Default 240. */
    width?: number;
    /** Quiet-zone modules around the code. Default 1. Below 1 scanners struggle. */
    margin?: number;
    /**
     * Error-correction level. Default 'M'.
     *
     * 'H' survives a logo covering the middle, at the cost of a denser code. Do
     * not raise it "for safety" on a long URL: density rises with it, and a dense
     * code on a small screen is harder to scan, not easier.
     */
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    /** Foreground colour, hex. Default '#000000'. */
    dark?: string;
    /** Background colour, hex. Default '#ffffff'. A transparent background is
     *  refused by most scanners in the wild, so this defaults to opaque white. */
    light?: string;
}
/** The error every function here throws when handed something unencodable. */
export declare class QrInputError extends Error {
    constructor(message: string);
}
/**
 * A PNG data URL, for `<img src>`.
 *
 * `qrcode` is imported lazily, so an integrator who draws nothing never pays
 * for the encoder — the same reason the widget defers it.
 */
export declare function toQrDataUrl(payUrl: string, options?: QrOptions): Promise<string>;
/**
 * An SVG string, for inlining.
 *
 * Preferred over the PNG where the code may be printed or scaled: a receipt at
 * 300dpi renders a 240px PNG as a soft square, and a soft QR is a customer
 * holding their phone at it for ten seconds.
 */
export declare function toQrSvg(payUrl: string, options?: QrOptions): Promise<string>;
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
export declare const WALLET_PAY_ORIGIN = "https://merchant.megprimepay.com";
export declare function payUrlFor(fulfillmentId: string, payOrigin?: string): string;
/**
 * The wallet link for a fulfillment id: https://merchant.megprimepay.com/send?fulfillment_id=<id>
 *
 * For anyone with a Base wallet holding USDC. No MegPrime account is needed.
 * Test store only until MegPrime decides on KYC. `payUrlFor` (the app link) is
 * unchanged; this is additive.
 */
export declare function walletPayUrlFor(fulfillmentId: string, origin?: string): string;
/** SVG QR of the wallet link for a fulfillment id. */
export declare function walletQrSvg(fulfillmentId: string, options?: QrOptions): Promise<string>;
/** PNG data-URL QR of the wallet link for a fulfillment id. */
export declare function walletQrDataUrl(fulfillmentId: string, options?: QrOptions): Promise<string>;
/** SVG QR of the app link for a fulfillment id. */
export declare function appQrSvg(fulfillmentId: string, options?: QrOptions): Promise<string>;
/** PNG data-URL QR of the app link for a fulfillment id. */
export declare function appQrDataUrl(fulfillmentId: string, options?: QrOptions): Promise<string>;
