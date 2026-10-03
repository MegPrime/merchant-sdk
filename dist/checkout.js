import { isTerminal, } from './types.js';
import { errorFromResponse, makeError } from './errors.js';
import { uuid } from './uuid.js';
import { walletPayUrlFor } from './qr.js';
const DEFAULT_GATEWAY = 'https://api.megprimepay.com';
const DEFAULT_PAY_ORIGIN = 'https://app.megprimepay.com';
const MAX_MEMO = 200;
/**
 * The polling ladder.
 *
 * Two seconds for the first minute is where something actually happens — the
 * payer has the QR in front of them right now. After that they have wandered
 * off and a five-second answer is indistinguishable from a two-second one.
 */
function intervalFor(elapsedMs) {
    if (elapsedMs < 60000)
        return 2000;
    if (elapsedMs < 5 * 60000)
        return 5000;
    return 10000;
}
/**
 * ±15% on every interval.
 *
 * Without it, a hundred tabs opened by the same push notification — or every
 * client reconnecting after a gateway blip — poll in lockstep forever, and the
 * traffic arrives as a spike instead of a flat line.
 */
function jitter(ms) {
    return Math.round(ms * (0.85 + Math.random() * 0.3));
}
/** Failure backoff, capped. A failed poll is UNKNOWN, never "not paid". */
function backoffFor(consecutiveFailures) {
    const ladder = [2000, 4000, 8000, 16000, 30000];
    return ladder[Math.min(consecutiveFailures - 1, ladder.length - 1)] ?? 30000;
}
/**
 * Three extra polls after the deadline.
 *
 * A payment submitted one second before the deadline still has to confirm.
 * Stopping exactly on the deadline reports `expired` for a sale that is about
 * to be `paid` — the worst available wrong answer, because the merchant
 * refuses the goods and the money arrives anyway.
 */
const GRACE_POLLS = 3;
/** Upstream statuses that mean the money arrived. */
const PAID = new Set(['confirmed', 'settled']);
/** Upstream statuses that mean it will not. */
const DEAD = new Set(['expired', 'cancelled', 'declined', 'failed', 'voided']);
/** Upstream statuses that mean a payer has committed but it is not final. */
const IN_FLIGHT = new Set(['claimed', 'submitted']);
export class Checkout {
    constructor(opts) {
        this.startedAt = 0;
        this.gracePollsLeft = GRACE_POLLS;
        this.destroyed = false;
        this.opts = opts;
        this.attachTo = opts.attachTo?.trim() || undefined;
        this.snap = {
            state: 'idle',
            clientRef: opts.clientRef?.trim() || uuid(),
            consecutiveFailures: 0,
        };
    }
    /** The current view. A copy, so a host cannot mutate SDK state by accident. */
    get snapshot() {
        return { ...this.snap };
    }
    /**
     * Create the request and begin polling.
     *
     * Safe to await or to fire and forget: every outcome arrives through the
     * callbacks either way.
     */
    async start() {
        if (this.snap.state !== 'idle')
            return this.snapshot;
        // Attached mode: the request already exists. Nothing is created, no key is
        // needed, and polling begins immediately.
        if (this.attachTo) {
            this.snap.fulfillmentId = this.attachTo;
            this.snap.payUrl = `${DEFAULT_PAY_ORIGIN}/send?fulfillment_id=${encodeURIComponent(this.attachTo)}`;
            this.snap.walletPayUrl = walletPayUrlFor(this.attachTo);
            this.startedAt = Date.now();
            this.transition('awaiting_payment');
            this.watchVisibility();
            this.armPoll(0);
            return this.snapshot;
        }
        const invalid = this.validate();
        if (invalid) {
            this.fail(invalid);
            return this.snapshot;
        }
        this.transition('creating');
        try {
            const res = await fetch(`${this.gateway()}/api/v1/mpmerchant/public/pay-requests`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publishable-Key': this.opts.publishableKey.trim(),
                },
                body: JSON.stringify({
                    price_id: this.opts.priceId.trim(),
                    client_ref: this.snap.clientRef,
                    ...(this.opts.memo ? { memo: this.opts.memo } : {}),
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.fail(errorFromResponse(res.status, body));
                return this.snapshot;
            }
            const data = body.data ?? {};
            const fulfillmentId = str(data.fulfillment_id);
            // THE CASE THAT MUST NOT BECOME A QR.
            //
            // No fulfillment_id with status "unconfirmed" means the upstream did not
            // answer, so whether a payable request exists is UNKNOWN. Rendering a QR
            // for it would show a customer a code that may point at nothing. The sale
            // is reconciled by the merchant against their own records; a host that
            // wants to try again must start a NEW checkout with a NEW client_ref.
            if (!fulfillmentId) {
                this.snap.amountUoa = str(data.notional_uoa);
                this.transition('unconfirmed');
                return this.snapshot;
            }
            this.snap.fulfillmentId = fulfillmentId;
            this.snap.amountUoa = str(data.notional_uoa);
            this.snap.currency = data.currency ?? undefined;
            const dl = str(data.deadline);
            if (dl)
                this.snap.deadline = new Date(dl);
            this.snap.payUrl = `${DEFAULT_PAY_ORIGIN}/send?fulfillment_id=${encodeURIComponent(fulfillmentId)}`;
            this.snap.walletPayUrl = walletPayUrlFor(fulfillmentId);
            this.startedAt = Date.now();
            this.transition('awaiting_payment');
            this.watchVisibility();
            this.armPoll(0);
            return this.snapshot;
        }
        catch (e) {
            this.fail(makeError('network', e instanceof Error ? e.message : 'network error'));
            return this.snapshot;
        }
    }
    /**
     * Stop this checkout.
     *
     * It CANNOT recall the request. A publishable key has no power to void
     * anything, so a customer holding a screenshot of the QR can still pay after
     * this returns. That is why onCancel says so, and why the bundled UI's button
     * says "Close" rather than "Cancel payment".
     */
    cancel(reason = 'merchant') {
        if (isTerminal(this.snap.state))
            return;
        this.stopPolling();
        this.transition('cancelled');
        this.opts.onCancel?.({
            reason,
            fulfillmentId: this.snap.fulfillmentId,
            clientRef: this.snap.clientRef,
        });
    }
    /** Release every timer and listener. Idempotent. */
    destroy() {
        if (this.destroyed)
            return;
        this.destroyed = true;
        const wasLive = !isTerminal(this.snap.state);
        this.stopPolling();
        if (this.onVisibility && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onVisibility);
            this.onVisibility = undefined;
        }
        if (wasLive)
            this.cancel('abandoned');
    }
    // -- internals ----------------------------------------------------------
    gateway() {
        return (this.opts.gateway || DEFAULT_GATEWAY).replace(/\/+$/, '');
    }
    /** Refuse locally what the server would refuse anyway, to save a round trip
     *  and to give a developer the error at the call site. */
    validate() {
        const key = this.opts.publishableKey?.trim() ?? '';
        if (!key.startsWith('mpk_')) {
            return makeError('invalid_options', 'publishableKey must be an mpk_ key');
        }
        if (!this.opts.priceId?.trim()) {
            return makeError('invalid_options', 'priceId is required');
        }
        if ((this.opts.memo?.length ?? 0) > MAX_MEMO) {
            return makeError('invalid_options', `memo must be ${MAX_MEMO} characters or fewer`);
        }
        return undefined;
    }
    transition(state) {
        this.snap.state = state;
        this.opts.onStateChange?.(state, this.snapshot);
        if (state === 'paid') {
            this.opts.onSuccess?.({
                fulfillmentId: this.snap.fulfillmentId,
                clientRef: this.snap.clientRef,
                amountUoa: this.snap.amountUoa ?? '0',
                paidUoa: this.snap.paidUoa ?? '0',
                currency: this.snap.currency,
                settledAt: this.snap.settledAt,
            });
        }
    }
    fail(err) {
        this.stopPolling();
        this.snap.error = err;
        this.transition('error');
        this.opts.onError?.(err);
    }
    /**
     * Poll while the tab is hidden, but slowly.
     *
     * Stopping entirely is tempting and wrong: the common flow is a payer
     * switching to their wallet app to pay, which hides this tab for exactly the
     * window in which the answer arrives. Coming back to a spinner that never
     * moved, on a sale that settled a minute ago, is the failure that matters.
     */
    watchVisibility() {
        if (typeof document === 'undefined')
            return;
        this.onVisibility = () => {
            if (document.visibilityState === 'visible' && !isTerminal(this.snap.state)) {
                // Answer immediately on return rather than waiting out the slow timer.
                this.armPoll(0);
            }
        };
        document.addEventListener('visibilitychange', this.onVisibility);
    }
    stopPolling() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = undefined;
    }
    /**
     * Arm the next poll.
     *
     * A chain of setTimeout, never setInterval: an interval on a slow network
     * stacks requests and the queue never drains. The next timer is armed only
     * after a response settles, so there is exactly one poll in flight.
     */
    armPoll(delayMs) {
        this.stopPolling();
        if (this.destroyed || isTerminal(this.snap.state))
            return;
        this.timer = setTimeout(() => void this.poll(), delayMs);
    }
    async poll() {
        if (this.destroyed || isTerminal(this.snap.state))
            return;
        const id = this.snap.fulfillmentId;
        if (!id)
            return;
        try {
            const res = await fetch(`${this.gateway()}/api/v1/enforcer/fulfillments/${encodeURIComponent(id)}/status`);
            if (!res.ok) {
                // A 4xx here is still UNKNOWN, not "not paid": the request may exist
                // and be paid while a gateway answers badly.
                this.pollFailed(res.status === 429 ? retryAfterMs(res) : undefined);
                return;
            }
            const body = await res.json().catch(() => ({}));
            const data = body.data ?? body;
            this.snap.consecutiveFailures = 0;
            this.snap.lastPolledAt = new Date();
            const status = (str(data.status) ?? '').toLowerCase();
            // In attached mode there was no create response, so the committed amount
            // and its scale are learned here instead.
            const notional = str(data.notional_uoa);
            if (notional && !this.snap.amountUoa)
                this.snap.amountUoa = notional;
            const cur = data.currency;
            if (cur && !this.snap.currency)
                this.snap.currency = cur;
            const paidSum = str(data.paid_sum);
            if (paidSum)
                this.snap.paidUoa = paidSum;
            // Parsed defensively: a malformed timestamp upstream must not throw
            // inside a state transition and lose a payment that actually landed.
            const settledAt = str(data.settled_at);
            if (settledAt) {
                const d = new Date(settledAt);
                if (!Number.isNaN(d.getTime()))
                    this.snap.settledAt = d;
            }
            if (PAID.has(status) || (settledAt && settledAt !== '')) {
                // DO NOT trust the status alone.
                //
                // The status says the settlement pipeline finished; `paid_sum` says how
                // much actually arrived. Firing onSuccess on the first without checking
                // the second means a host releases goods on an underpayment, and the
                // SDK would have told them it was paid. Checking here costs nothing and
                // stays correct even if the upstream rule ever loosens.
                if (this.underpaid()) {
                    this.armPoll(jitter(this.nextIntervalOrExpire()));
                    return;
                }
                this.stopPolling();
                this.transition('paid');
                return;
            }
            if (DEAD.has(status)) {
                this.stopPolling();
                // `expired` is not an error — nothing went wrong, the customer simply
                // did not pay. Routing it to onError would make every integrator write
                // an error branch that says "not an error".
                if (status === 'expired') {
                    this.transition('expired');
                }
                else {
                    this.transition('cancelled');
                    this.opts.onCancel?.({
                        reason: 'payer',
                        fulfillmentId: id,
                        clientRef: this.snap.clientRef,
                    });
                }
                return;
            }
            if (IN_FLIGHT.has(status) && this.snap.state !== 'settling') {
                this.transition('settling');
            }
            this.armPoll(jitter(this.nextIntervalOrExpire()));
        }
        catch {
            this.pollFailed();
        }
    }
    /**
     * Did less arrive than was committed?
     *
     * Both figures are uint256-scale decimal strings, so the comparison is
     * BigInt: a float64 rounds above 2^53 and would call a shortfall exact.
     * Unknown (either figure missing or unparseable) is treated as NOT underpaid,
     * because refusing to ever report a real payment is a worse failure than the
     * one this guards — and the host still has both numbers on the snapshot.
     */
    underpaid() {
        const want = this.snap.amountUoa;
        const got = this.snap.paidUoa;
        if (!want || !got)
            return false;
        if (!/^\d+$/.test(want) || !/^\d+$/.test(got))
            return false;
        try {
            return BigInt(got) < BigInt(want);
        }
        catch {
            return false;
        }
    }
    pollFailed(retryAfter) {
        this.snap.consecutiveFailures += 1;
        this.snap.lastPolledAt = new Date();
        this.opts.onStateChange?.(this.snap.state, this.snapshot);
        // Honour Retry-After verbatim when the server named one; it knows better
        // than our ladder does.
        this.armPoll(retryAfter ?? jitter(backoffFor(this.snap.consecutiveFailures)));
    }
    /** The next interval, or a grace poll, or expiry. */
    nextIntervalOrExpire() {
        const dl = this.snap.deadline?.getTime();
        if (dl && Date.now() > dl) {
            if (this.gracePollsLeft <= 0) {
                this.stopPolling();
                this.transition('expired');
                return 0;
            }
            this.gracePollsLeft -= 1;
            return 10000;
        }
        const base = intervalFor(Date.now() - this.startedAt);
        // Hidden tabs poll slowly rather than not at all — see watchVisibility.
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            return Math.max(base, 15000);
        }
        return base;
    }
}
// Small helpers kept private to the module.
function str(v) {
    return typeof v === 'string' && v !== '' ? v : undefined;
}
function retryAfterMs(res) {
    const h = res.headers?.get?.('Retry-After');
    if (!h)
        return undefined;
    const secs = Number(h);
    return Number.isFinite(secs) ? Math.max(0, secs * 1000) : undefined;
}
