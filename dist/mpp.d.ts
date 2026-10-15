/** The MPP token on Base. */
export declare const MPP_TOKEN_ADDRESS = "0x6E02F4A1631379a49e8B7E222CfA6Bf913b05E89";
/** Base mainnet. */
export declare const BASE_CHAIN_ID = 8453;
/** MPP has 18 decimals. */
export declare const MPP_DECIMALS = 18;
/**
 * The intent's state. The gateway passes enforcer-v3's word through, so the
 * union is open: an unlisted state is still delivered verbatim.
 */
export type MppDepositState = 'awaiting' | 'awaiting_deposit' | 'received' | 'underpaid' | 'overpaid' | 'settling' | 'routed' | 'settled' | 'refunded' | 'parked' | (string & {});
/** What to tell the payer. Send exactly `amountToSend` of MPP on Base to `sendTo`. */
export interface MppDepositInstructions {
    intentId: string;
    network: string;
    token: string;
    /** The deposit address. */
    sendTo: string;
    /** 18-dp base units, a decimal string. Send EXACTLY this. */
    amountToSend: string;
    /** The same amount in MPP, every digit kept (no rounding), e.g. "0.014080296915726607". */
    amountToSendMpp: string;
    expiresAt?: Date;
    warning?: string;
    state: MppDepositState;
    /** The pay request's own status (open | submitted | settled | …). */
    status?: string;
}
/** A deposit intent as read back while the payer sends. */
export interface MppDepositIntent {
    intentId: string;
    state: MppDepositState;
    /** What the address has received so far, 18-dp base units, a decimal string. */
    receivedAmount: string;
    expiresAt?: Date;
    /** The pay request's own status. */
    status?: string;
    instructions: MppDepositInstructions;
}
/** The pay-from-an-exchange half of a CheckoutHandle. */
export interface MppDepositMethods {
    /**
     * Pay from an exchange. Issues (idempotently) an MPP deposit address and
     * the EXACT amount to send there on Base. Works in created and attached
     * mode: holding the fulfillment id is enough, no key is sent. Paid
     * detection is unchanged: the status polling flips to `paid` when the
     * fulfillment confirms. The refund address is checked locally (0x + 40
     * hex, non-zero) before any request.
     */
    createMppDepositIntent(o: {
        refundAddress: string;
    }): Promise<MppDepositInstructions>;
    /** Read back that deposit intent: state, receivedAmount, expiresAt. */
    getMppDepositIntent(): Promise<MppDepositIntent>;
    /**
     * Find the deposit intent THIS payer already holds on this pay request, by
     * the refund address they gave when it was created: a payer who closed the
     * tab comes back to the same deposit address instead of a new one. Read-only:
     * it never creates an intent. Rejects with `mpp_deposit_intent_not_found`
     * (404) when that refund address has none here, so offer
     * `createMppDepositIntent` next. The refund address is checked locally first,
     * exactly as for create. On success, `getMppDepositIntent` reads this intent.
     */
    resumeMppDepositIntent(o: {
        refundAddress: string;
    }): Promise<MppDepositIntent>;
}
/**
 * Refuse a refund address locally: 0x + 40 hex, and not the zero address.
 * Anything the forwarder cannot route goes there, so a typo is lost money.
 */
export declare function assertRefundAddress(addr: unknown): string;
/** Base units (decimal string) to a decimal MPP string. Exact: no rounding, trailing zeros trimmed. */
export declare function formatMppBaseUnits(baseUnits: string, decimals?: number): string;
/** Map the gateway's `data` (snake_case) to the SDK shape. */
export declare function toMppDepositIntent(d: Record<string, unknown>): MppDepositIntent;
/** The route, one place. */
export declare function mppDepositIntentPath(fulfillmentId: string): string;
