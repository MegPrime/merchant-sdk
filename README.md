# @megprime/merchant-sdk

Take payments into a MegPrime store from your own application. No backend of
your own required.

```bash
npm install github:MegPrime/merchant-sdk#v0.2.0
```

No registry account or token is needed. The package still installs as
`@megprime/merchant-sdk`, so imports are unchanged.

```ts
import { createCheckout } from '@megprime/merchant-sdk';

const checkout = createCheckout({
  publishableKey: 'mpk_…',       // safe in your bundle — see below
  priceId: '9f1c0b8e-…',         // a price the merchant registered
  container: '#pay',
  onSuccess: ({ paidUoa }) => fulfilOrder(paidUoa),
  onError:   (err)        => show(err.message),
  onCancel:  ()           => close(),
});

await checkout.start();
```

## Why the key is safe to publish

**This SDK never sends an amount.** It sends a `priceId` the *merchant*
registered, and the server reads the figure from that row.

That is the whole design. The client belongs to the **buyer** — anyone can open
devtools and change a number before it is sent — and the buyer is not an
intruder to be kept out. They are a legitimate customer who would rather pay
less. Authenticating them does not help: it proves *who* is paying and says
nothing about *how much*. Neither do CORS, origin allowlists or referrer checks,
which are browser policy, and curl is not a browser.

Because a client can only **choose** among prices the merchant set, and never
**invent** one, the key is safe to ship publicly. It cannot name an amount, a
wallet or a store, and it cannot read anything. Its single power is to point
money *at* the store it is bound to.

If you need a dynamic total — a basket, shipping, tax — you need a server, and a
secret key. That is not a limitation this SDK can engineer away: the alternative
is letting the buyer set the price.

## When the amount is calculated

The publishable key deliberately cannot send an amount. If your total is
computed — a basket, shipping, tax — that has to happen on a server, and the
client is handed only the request id:

```ts
import { attachCheckout } from '@megprime/merchant-sdk';

// your server created the request with its own credential and returned the id
const checkout = attachCheckout({
  fulfillmentId,       // no key of any kind in the browser
  container: '#pay',
  onSuccess: ({ paidUoa }) => fulfilOrder(paidUoa),
});
await checkout.start();
```

**Building this with a coding agent (Lovable, Cursor, Claude Code)?** Paste
[`INTEGRATION.md`](./INTEGRATION.md) into it. It is a complete build spec for
this path using a store-bound secret key (`msk_…`), including a Supabase Edge
Function and server-side payment confirmation. It also ships inside the package
at `node_modules/@megprime/merchant-sdk/INTEGRATION.md`.

From the customer's side this is identical — same QR, same polling, same
callbacks. The only difference is who decided the price, and that is the
difference that matters: a total computed on the customer's device is a total
the customer chooses.

## The QR

The bundled widget draws one for you. Without a container, draw it yourself —
the SDK encodes it, so you do not have to learn which field to encode:

```ts
const checkout = createCheckout({ publishableKey, priceId, onStateChange: render });
await checkout.start();

img.src = await checkout.qrDataUrl();     // PNG data url
receipt.innerHTML = await checkout.qrSvg(); // SVG, for anything printed
```

Or from an id your server already has — a refund, a reprint, another process:

```ts
import { payUrlFor, toQrSvg } from '@megprime/merchant-sdk';
await toQrSvg(payUrlFor(fulfillmentId));
```

**Encode `payUrl`, never the id.** A QR of a fulfillment id scans cleanly and
resolves to nothing, which is worse than an error because it looks like it
worked. Both functions refuse anything that is not a URL, and say why.

## Taking payments and refunds from your server

The secret key (`msk_…`) lives on a server and nowhere else, so it has its own
entry point — importing it into a component pulls a module that **refuses to run
in a browser**:

```ts
import { createPaymentRequest, proposeRefund, getRefundProposal, getPaymentStatus }
  from '@megprime/merchant-sdk/server';

const sale = await createPaymentRequest({
  secretKey: process.env.MEGPRIME_SECRET_KEY!,
  amountUoa: '12500000',          // minor units. Never a float
  clientRef: order.id,            // one per sale: a retry returns the SAME request
});
// send the browser sale.fulfillmentId — and nothing else

// later, the guest cancels
const proposal = await proposeRefund({
  secretKey: process.env.MEGPRIME_SECRET_KEY!,
  fulfillmentId: sale.fulfillmentId!,
  amountUoa: '12500000',
  reason: 'Booking cancelled',
  clientRef: refundDecisionId,
});

// the STORE OWNER decides. Poll for the answer
const now = await getRefundProposal({ secretKey, proposalId: proposal.id });
// 'proposed' → waiting on the owner
// 'approved' → now.refundFulfillmentId is the refund they must pay
// 'rejected' | 'failed' → now.decisionReason says why
```

**Your key can ask for a refund. It cannot grant one**, and it never says where
the money goes: MegPrime sends it back to whoever actually paid the original.
The owner approves and pays it themselves. Watch an approved refund land with
`getPaymentStatus(refundFulfillmentId)` — the same credential-free poll the
browser uses.

## Headless

Omit `container` and the SDK renders nothing. Use `snapshot.payUrl` to draw your
own QR, and `onStateChange` for everything else.

```ts
const checkout = createCheckout({
  publishableKey: 'mpk_…',
  priceId: '…',
  onStateChange: (state, snap) => render(state, snap.payUrl),
});
```

## States

| state | meaning |
|---|---|
| `idle` `creating` | before the request exists |
| `awaiting_payment` | the QR is live and nobody has committed |
| `settling` | a payer has committed; the money is confirming |
| `paid` | **terminal** — money arrived |
| `expired` | **terminal** — the window closed unpaid. Not an error |
| `cancelled` | **terminal** — closed by you, the payer, or abandoned |
| `error` | **terminal** — see `snapshot.error.code` |
| `unconfirmed` | **terminal** — see below |

### `unconfirmed`

The upstream did not answer, so whether a payable request exists is **unknown**.
The SDK deliberately shows no QR for it: a code that may point at nothing is
worse than an error. Reconcile against the merchant's records. To try again,
start a **new** checkout with a **new** `clientRef`.

### `cancel()` cannot recall anything

A publishable key has no power to void a request. A customer holding a
screenshot of the QR can still pay after you call `cancel()`. That is why the
bundled UI's button says *Close*, not *Cancel payment*.

## Errors

Branch on `err.code`, never on `err.message`.

| code | retryable | meaning |
|---|---|---|
| `publishable_key_invalid` | no | unknown, revoked, expired or malformed |
| `price_not_found` | no | no live price with that id on this key's store |
| `price_over_key_cap` | no | the price exceeds this key's ceiling |
| `embedded_payments_unavailable` | yes | the merchant's deployment is incomplete |
| `rate_limited` | yes | too many requests from this key or address |
| `network` | yes | the request never got an answer |
| `invalid_options` | no | the SDK refused your options before any request |

## Money

Amounts are **minor units as decimal strings**, never numbers — `"1500000"` of a
6-decimal token is `1.50`. A float cannot be trusted with money.

The server sends the scale with the request, so the SDK never guesses:

```ts
import { formatUoa } from '@megprime/merchant-sdk';
formatUoa(snap.amountUoa, snap.currency); // "1.500000 USDC"
```

Without a `currency` it returns `undefined` and the bundled UI shows no figure.
Showing a number at the wrong scale is worse than showing none: the customer
reads a wrong price and believes it.

## Underpayment

`onSuccess` does not fire on the upstream status alone. The status says the
settlement pipeline finished; `paid_sum` says how much actually arrived, and the
SDK compares them first. Without that, a partial payment would release your
goods and this SDK would have told you it was paid.

## Idempotency

Pass `clientRef` — one uuid per **sale**, not per attempt. Your app knows what a
basket is; the SDK does not. A retry with the same `clientRef` returns the
*same* request instead of charging twice. Omitted, the SDK mints one and holds
it for the life of the checkout.

## Polling

Credential-free `GET`, on a ladder: 2s for the first minute, then 5s, then 10s,
each jittered ±15%. Failures back off to 30s and are treated as **unknown**,
never as "not paid". A hidden tab polls slowly rather than stopping — the usual
flow is a payer switching to their wallet app, which hides your tab for exactly
the window in which the answer arrives.

Polling continues for three extra polls past the deadline. A payment submitted a
second before it still has to confirm, and reporting `expired` for a sale about
to be `paid` is the worst available wrong answer: the merchant refuses the goods
and the money arrives anyway.
