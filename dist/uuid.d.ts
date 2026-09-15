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
export declare function uuid(): string;
