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
export function formatUoa(amount, currency) {
    if (!amount || !currency)
        return undefined;
    if (!/^-?\d+$/.test(amount))
        return undefined;
    const dec = currency.decimals;
    if (!Number.isInteger(dec) || dec < 0 || dec > 36)
        return undefined;
    const neg = amount.startsWith('-');
    const digits = (neg ? amount.slice(1) : amount).padStart(dec + 1, '0');
    const whole = digits.slice(0, digits.length - dec) || '0';
    const frac = dec > 0 ? digits.slice(digits.length - dec) : '';
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    // Trailing zeros are kept: a price is 5.00, not 5. Trimming them makes two
    // different-looking figures out of one amount.
    const body = frac ? `${grouped}.${frac}` : grouped;
    const sym = currency.symbol ? ` ${currency.symbol}` : '';
    return `${neg ? '-' : ''}${body}${sym}`;
}
