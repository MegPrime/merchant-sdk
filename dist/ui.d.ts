import { type CheckoutSnapshot, type LabelKey } from './types.js';
/**
 * The bundled renderer.
 *
 * INLINE DOM IN A SHADOW ROOT, NOT AN IFRAME.
 *
 * An iframe is normally a SECRET boundary: it exists so the host page cannot
 * read what is inside it. Here there is no secret on the other side. The
 * publishable key is public by construction, the fulfillment id is a capability
 * the payer is about to be shown anyway, and the poll carries no credential. An
 * iframe would buy isolation from something that is not a threat, while costing
 * a second document, a postMessage bridge, and a widget that cannot inherit the
 * host's fonts or resize with its container.
 *
 * The tempting counter-argument — "an iframe stops the host tampering with the
 * amount" — does not hold. The amount that binds is the one the payer's own
 * wallet resolves from the fulfillment id, not the one this page draws. A host
 * that rewrites the number on screen changes what their customer reads and
 * nothing about what is charged, and that is equally true inside an iframe.
 *
 * A shadow root gets the part that IS worth having: the host's CSS cannot
 * accidentally restyle a payment widget into something unreadable.
 */
export interface Renderer {
    update(snap: CheckoutSnapshot): void;
    destroy(): void;
}
export declare function mountUI(container: HTMLElement, opts: {
    labels?: Partial<Record<LabelKey, string>>;
    theme?: 'light' | 'dark' | 'auto';
    onClose: () => void;
}): Renderer;
