/**
 * A uuid v4 for client_ref.
 *
 * crypto.randomUUID where it exists, which is everywhere current. The fallback
 * is for older Safari and for a page served over plain http, where the whole
 * `crypto` object may be absent — and a checkout that throws because it could
 * not name itself would be a worse failure than a slightly weaker id. The id is
 * an idempotency key, not a secret: it is never used to authorise anything, so
 * collision resistance is all that is being asked of it.
 */
export function uuid() {
    const c = globalThis.crypto;
    if (c?.randomUUID)
        return c.randomUUID();
    if (c?.getRandomValues) {
        const b = c.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    }
    // Last resort. Math.random is not cryptographic, which is acceptable for an
    // idempotency key and would not be for anything else.
    const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
}
