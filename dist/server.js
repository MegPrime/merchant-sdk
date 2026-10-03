/**
 * @megprime/merchant-sdk/server — the half that holds the secret key.
 *
 * WHY THIS IS A SEPARATE ENTRY POINT.
 *
 * Everything else in this package is written to run in the buyer's browser and
 * is safe there: a publishable key cannot name an amount, and a fulfillment id
 * is a capability the payer is about to be shown anyway. The secret key is the
 * opposite. It CAN name an amount, and it can ask for a refund. It belongs on a
 * server and nowhere else.
 *
 * A separate module is how that stays true in practice. Bundlers pull in what
 * is imported, so a component that reaches for `proposeRefund` pulls this file
 * — and this file refuses to run in a browser. That is a loud failure in
 * development rather than a quiet one in production, where the quiet version is
 * a merchant's secret key sitting in a JavaScript bundle any customer can read.
 *
 *     import { proposeRefund } from '@megprime/merchant-sdk/server';
 *
 * WHAT A SECRET KEY MAY DO, IN FULL: create a payment request for an amount it
 * states, propose a refund of a payment it created, and read back the proposals
 * it raised. It may not approve a refund — only the store owner may, in the
 * MegPrime app — and it may never name where money goes.
 */
import { errorFromResponse, makeError } from './errors.js';
const DEFAULT_GATEWAY = 'https://api.megprimepay.com';
/**
 * Refuse to run in a browser.
 *
 * Checked at the top of every call rather than once at import: a bundler that
 * tree-shakes or a framework that evaluates modules on both sides would make an
 * import-time check unreliable, and this is the one guard in the package whose
 * failure is a leaked credential.
 */
function assertServer() {
    const g = globalThis;
    if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') {
        throw makeError('invalid_options', '@megprime/merchant-sdk/server must not run in a browser: it carries your secret key, which can name an amount and ask for refunds. Call it from your server and send the client only the fulfillment id.');
    }
}
function assertSecretKey(key) {
    const k = (key ?? '').trim();
    if (!k.startsWith('msk_')) {
        throw makeError('invalid_options', 'secretKey must be an msk_ key');
    }
    return k;
}
function assertAmount(amountUoa) {
    const a = (amountUoa ?? '').trim();
    // Minor units as a decimal string, positive. A float here is a rounded price.
    if (!/^\d{1,39}$/.test(a) || /^0*$/.test(a)) {
        throw makeError('invalid_options', `amountUoa must be a positive integer string of minor units (e.g. "12500000" for $12.50 of a 6-decimal token), got ${JSON.stringify(amountUoa)}`);
    }
    return a;
}
async function call(path, method, o, body, map) {
    assertServer();
    const key = assertSecretKey(o.secretKey);
    const gateway = (o.gateway || DEFAULT_GATEWAY).replace(/\/+$/, '');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 10000);
    try {
        const res = await fetch(`${gateway}${path}`, {
            method,
            headers: {
                'X-Secret-Key': key,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: ac.signal,
        });
        const parsed = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw errorFromResponse(res.status, parsed);
        }
        return map((parsed.data ?? {}));
    }
    catch (e) {
        // A thrown CheckoutError is the server's answer; anything else never got
        // one, which is UNKNOWN rather than a refusal. Retry those with the same
        // clientRef and you get the original, never a second charge.
        if (e?.code)
            throw e;
        throw makeError('network', e instanceof Error ? e.message : 'network error');
    }
    finally {
        clearTimeout(timer);
    }
}
function date(v) {
    if (typeof v !== 'string' || !v)
        return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
}
function str(v) {
    return typeof v === 'string' && v !== '' ? v : undefined;
}
/**
 * Create a payment request for an amount your server decided.
 *
 * Send the client the `fulfillmentId` and nothing else; the browser renders it
 * with `attachCheckout`, or draws its own QR from `payUrl`.
 */
export async function createPaymentRequest(o) {
    const amount = assertAmount(o.amountUoa);
    if ((o.memo?.length ?? 0) > 200) {
        throw makeError('invalid_options', 'memo must be 200 characters or fewer');
    }
    return call('/api/v1/mpmerchant/server/pay-requests', 'POST', o, {
        notional_uoa: amount,
        ...(o.clientRef ? { client_ref: o.clientRef } : {}),
        ...(o.memo ? { memo: o.memo } : {}),
    }, (d) => {
        const id = str(d.fulfillment_id);
        return {
            fulfillmentId: id,
            amountUoa: str(d.notional_uoa) ?? amount,
            currency: d.currency ?? undefined,
            deadline: date(d.deadline),
            clientRef: str(d.client_ref),
            // Built here so nothing downstream has to know the URL shape. Absent
            // exactly when the id is — a link to nothing is worse than no link.
            ...(id ? { payUrl: payUrlForId(id), walletPayUrl: walletPayUrlForId(id) } : {}),
        };
    });
}
/**
 * Ask the merchant to refund a payment you created.
 *
 * This QUEUES the refund: the store owner decides, and pays it themselves. Your
 * key cannot approve one, and cannot say where the money goes — the payments
 * core sends it back to whoever actually paid the original.
 *
 * Poll `getRefundProposal` for the answer.
 */
export async function proposeRefund(o) {
    const amount = assertAmount(o.amountUoa);
    if (!o.fulfillmentId?.trim()) {
        throw makeError('invalid_options', 'fulfillmentId is required: name the sale you are refunding');
    }
    if ((o.reason?.length ?? 0) > 500) {
        throw makeError('invalid_options', 'reason must be 500 characters or fewer');
    }
    return call('/api/v1/mpmerchant/server/refund-proposals', 'POST', o, {
        fulfillment_id: o.fulfillmentId.trim(),
        amount_uoa: amount,
        ...(o.reason ? { reason: o.reason } : {}),
        ...(o.clientRef ? { client_ref: o.clientRef } : {}),
    }, toProposal);
}
/** Read back a proposal this key raised — the owner's decision, when they make one. */
export async function getRefundProposal(o) {
    if (!o.proposalId?.trim()) {
        throw makeError('invalid_options', 'proposalId is required');
    }
    return call(`/api/v1/mpmerchant/server/refund-proposals/${encodeURIComponent(o.proposalId.trim())}`, 'GET', o, undefined, toProposal);
}
function toProposal(d) {
    return {
        id: str(d.id) ?? '',
        state: str(d.state) ?? 'proposed',
        amountUoa: str(d.amount_uoa) ?? '0',
        refundFulfillmentId: str(d.refund_fulfillment_id),
        decisionReason: str(d.decision_reason),
        decidedAt: date(d.decided_at),
        createdAt: date(d.created_at),
    };
}
/**
 * What actually arrived, for a sale or for a refund.
 *
 * Credential-free by design: this is the same endpoint the browser polls, so a
 * server and a page can agree about one payment without the server holding a
 * second opinion. Use it to confirm a sale before releasing goods, and to watch
 * an approved refund until the merchant has actually paid it.
 */
export async function getPaymentStatus(fulfillmentId, o) {
    assertServer();
    if (!fulfillmentId?.trim()) {
        throw makeError('invalid_options', 'fulfillmentId is required');
    }
    const gateway = (o?.gateway || DEFAULT_GATEWAY).replace(/\/+$/, '');
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), o?.timeoutMs ?? 10000);
    try {
        const res = await fetch(`${gateway}/api/v1/enforcer/fulfillments/${encodeURIComponent(fulfillmentId.trim())}/status`, { signal: ac.signal });
        const parsed = await res.json().catch(() => ({}));
        if (!res.ok)
            throw errorFromResponse(res.status, parsed);
        const d = (parsed.data ?? parsed);
        return {
            status: (str(d.status) ?? '').toLowerCase(),
            paidUoa: str(d.paid_sum) ?? '0',
            amountUoa: str(d.notional_uoa) ?? '0',
            settledAt: date(d.settled_at),
        };
    }
    catch (e) {
        if (e?.code)
            throw e;
        throw makeError('network', e instanceof Error ? e.message : 'network error');
    }
    finally {
        clearTimeout(timer);
    }
}
// Re-exported from qr.ts so a server rendering a receipt does not need a second
// import path. Drawing a QR needs no credential.
export { toQrDataUrl, toQrSvg, payUrlFor, walletPayUrlFor, walletQrSvg, walletQrDataUrl, appQrSvg, appQrDataUrl, QrInputError } from './qr.js';
import { payUrlFor as payUrlForId, walletPayUrlFor as walletPayUrlForId } from './qr.js';
export { formatUoa } from './money.js';
