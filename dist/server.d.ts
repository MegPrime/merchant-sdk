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
import type { Currency, Uoa } from './types.js';
export interface ServerOptions {
    /** msk_… Never ship this to a browser. */
    secretKey: string;
    /** Gateway root. Defaults to https://api.megprimepay.com */
    gateway?: string;
    /** Aborts the request. Default 10s: a checkout waiting on this is a customer waiting. */
    timeoutMs?: number;
}
export interface CreatePaymentOptions extends ServerOptions {
    /** Minor units as a decimal string. Your server decides this. */
    amountUoa: Uoa;
    /** One uuid per SALE. A retry with the same ref returns the SAME request. */
    clientRef?: string;
    /** Rides onto the request for the merchant. 200 characters or fewer. */
    memo?: string;
}
export interface PaymentRequest {
    /** Absent when the upstream did not answer — see `unconfirmed` in the README.
     *  Do not show a QR for a request with no id. */
    fulfillmentId?: string;
    amountUoa: Uoa;
    currency?: Currency;
    deadline?: Date;
    clientRef?: string;
    /** The deep link to encode as a QR, when there is a request to pay. */
    payUrl?: string;
    /** The wallet link: any Base wallet holding USDC, no account. */
    walletPayUrl?: string;
}
export type RefundState = 'proposed' | 'approved' | 'rejected' | 'failed';
export interface RefundProposal {
    id: string;
    state: RefundState;
    amountUoa: Uoa;
    /** The refund the OWNER pays, once they have approved. Absent before that,
     *  and on a proposal the payments core refused. */
    refundFulfillmentId?: string;
    /** The wallet the refund goes to. For a sale created with a secret key this is
     *  the platform refund wallet, NOT the on-chain payer: MegPrime settles with
     *  the partner's users off-chain. Absent means the payer. Present on proposal
     *  and approval responses. */
    refundDestination?: string;
    /** Why it was rejected, or why raising it failed. */
    decisionReason?: string;
    decidedAt?: Date;
    createdAt?: Date;
}
export interface ProposeRefundOptions extends ServerOptions {
    /** The settled sale to refund: the id `createPaymentRequest` returned. */
    fulfillmentId: string;
    /** Minor units, at most what actually arrived. */
    amountUoa: Uoa;
    /** For the owner deciding. 500 characters or fewer. */
    reason?: string;
    /** One uuid per refund decision. A retry returns the SAME proposal. */
    clientRef?: string;
}
/**
 * Create a payment request for an amount your server decided.
 *
 * Send the client the `fulfillmentId` and nothing else; the browser renders it
 * with `attachCheckout`, or draws its own QR from `payUrl`.
 */
export declare function createPaymentRequest(o: CreatePaymentOptions): Promise<PaymentRequest>;
/**
 * Ask the merchant to refund a payment you created.
 *
 * This QUEUES the refund: the store owner decides, and pays it themselves. Your
 * key cannot approve one, and cannot say where the money goes — for a sale a
 * secret key created, the payments core sends it to MegPrime's platform refund
 * wallet (see `RefundProposal.refundDestination`), not the on-chain payer.
 *
 * Poll `getRefundProposal` for the answer.
 */
export declare function proposeRefund(o: ProposeRefundOptions): Promise<RefundProposal>;
/** Read back a proposal this key raised — the owner's decision, when they make one. */
export declare function getRefundProposal(o: ServerOptions & {
    proposalId: string;
}): Promise<RefundProposal>;
/**
 * What actually arrived, for a sale or for a refund.
 *
 * Credential-free by design: this is the same endpoint the browser polls, so a
 * server and a page can agree about one payment without the server holding a
 * second opinion. Use it to confirm a sale before releasing goods, and to watch
 * an approved refund until the merchant has actually paid it.
 */
export declare function getPaymentStatus(fulfillmentId: string, o?: {
    gateway?: string;
    timeoutMs?: number;
}): Promise<{
    status: string;
    paidUoa: Uoa;
    amountUoa: Uoa;
    settledAt?: Date;
}>;
export { toQrDataUrl, toQrSvg, payUrlFor, walletPayUrlFor, walletQrSvg, walletQrDataUrl, appQrSvg, appQrDataUrl, type QrOptions, QrInputError } from './qr.js';
export type { CheckoutError, CheckoutErrorCode, Currency, Uoa } from './types.js';
export { formatUoa } from './money.js';
