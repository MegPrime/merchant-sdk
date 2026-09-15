import type { Currency, Uoa } from './types.js';
/**
 * Render minor units using the scale the SERVER sent.
 *
 * Never guesses. Without a currency the SDK shows no figure at all, because a
 * number at the wrong scale is not a cosmetic bug on a checkout — it is a
 * customer being shown the wrong price, and a merchant taking a payment the
 * customer will dispute.
 *
 * BigInt throughout: these are uint256-scale integers and a float64 silently
 * rounds above 2^53.
 */
export declare function formatUoa(amount: Uoa | undefined, currency?: Currency): string | undefined;
