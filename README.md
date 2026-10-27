# @megprime/merchant-sdk

Take payments into a MegPrime store from your own application. No backend of
your own required.

```bash
npm install github:MegPrime/merchant-sdk#v0.9.0
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

## Environments

`env` selects the environment everywhere it is accepted (`createCheckout`,
`attachCheckout`, every `/server` function, `getPaymentStatus`). Use the env
that matches your key. It picks the pay-link hosts and the chain. The gateway is
the same for all three: every environment is a tenant of one API, and the key
decides the tenant.

| | `prod` (default) | `uat` | `sandbox` (coming soon) |
| --- | --- | --- | --- |
| Gateway (default for `gateway`) | `https://api.megprimepay.com` | `https://api.megprimepay.com` | `https://api.megprimepay.com` |
| App pay host (`payUrl`) | `https://app.megprimepay.com` | `https://uat.megprimepay.com` | `https://dev.megprimepay.com` |
| Wallet pay host (`walletPayUrl`) | `https://merchant.megprimepay.com` | `https://merchant-uat.megprimepay.com` | `https://merchant-dev.megprimepay.com` |
| Chain | Base (8453) | Base (8453) | Base Sepolia (84532) |
| Settlement token | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | testnet USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| MPP / pay from an exchange | yes | yes | not yet (throws `unsupported_on_sandbox`) |
| Real money? | **Yes** | **Yes**: same chain and tokens as PROD, separate tenant | No: separate tenant, testnet tokens with no value |

- **An explicit `gateway` always wins** over `env`'s default; `payOrigin` /
  `walletPayOrigin` override the pay hosts the same way.
- **An unknown `env` is refused** (`invalid_options`) before any request,
  never defaulted to PROD.
- **The sandbox is a tenant of the PROD API**, like UAT: same gateway, and
  the sandbox key selects the sandbox tenant. It runs on **Base Sepolia with
  testnet USDC**: get some from the Circle faucet at https://faucet.circle.com
  (pick Base Sepolia). MPP and pay from an exchange are not on the sandbox
  yet: `mppTransferUri`,
  `mppDepositQr*` and the `*MppDepositIntent` methods throw
  `unsupported_on_sandbox` with `env: 'sandbox'`.
- **The sandbox is coming soon.** The option ships now so integrations can be
  written against it; sandbox keys and hosts are not live until MegPrime
  announces them.

`gatewayFor({ env })`, `payOriginsFor({ env })` and `chainFor(env)` return
these values; `GATEWAYS`, `PAY_ORIGINS` and `CHAINS` are the tables.

```ts
const env = (process.env.MEGPRIME_ENV ?? 'prod') as 'prod' | 'uat' | 'sandbox';
await createPaymentRequest({ secretKey, amountUoa, env });
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

### Two links: app and wallet

Every request has two payer links, both `/send?fulfillment_id=<id>`:

| Field | PROD origin | UAT origin (`env: 'uat'`) | Sandbox origin (`env: 'sandbox'`) | Use it for |
| --- | --- | --- | --- | --- |
| `payUrl` | `https://app.megprimepay.com` | `https://uat.megprimepay.com` | `https://dev.megprimepay.com` | MegPrime users, who pay in the app. |
| `walletPayUrl` | `https://merchant.megprimepay.com` | `https://merchant-uat.megprimepay.com` | `https://merchant-dev.megprimepay.com` | Anyone with a Base wallet holding USDC. No MegPrime account needed. |

**Testing with a UAT key? Pass `env: 'uat'`** (a sandbox key: `env: 'sandbox'`, see [Environments](#environments)). The key decides which
environment a request lives in, but the links are built locally, and the
default is PROD. A UAT request opened on a PROD host is refused (a blank page
and a 403). `createPaymentRequest`, `getPaymentRequest` and `new Checkout(...)`
all take `env`, plus `payOrigin` / `walletPayOrigin` to name a host directly:

```ts
await createPaymentRequest({ secretKey, amountUoa, env: process.env.MEGPRIME_ENV === 'uat' ? 'uat' : 'prod' });
```

The wallet link is for the test store only until MegPrime decides on KYC.
`payUrl` is unchanged. Build either from an id with `payUrlFor(id)` and
`walletPayUrlFor(id)`; QR helpers: `appQrSvg`, `appQrDataUrl`, `walletQrSvg`,
`walletQrDataUrl` (or `toQrSvg(walletPayUrlFor(id))`).

**Encode `payUrl` (or `walletPayUrl`), never the id.** A QR of a fulfillment id scans cleanly and
resolves to nothing, which is worse than an error because it looks like it
worked. Both functions refuse anything that is not a URL, and say why.

### Tokens: payers pay MPP, stores receive USDC

On the wallet pay link the **payer pays in MPP** (18 decimals), swapped through
the Z5 router. The **store settles in USDC** through its router plan. **Request
amounts stay USDC minor units (6 dp)**: `amountUoa` is always USDC, whatever the
payer sends. The public pay-details response carries `input_token` (the MPP
address) and `input_decimals` (18); the `PublicPayDetails` type has both. Never
use `input_decimals` to scale `amountUoa`.

## Pay from an exchange

An exchange cannot sign a transaction. It can only send tokens to an address. For
a payer whose MPP is on an exchange, ask for a deposit address and the exact
amount to send there:

```ts
const ins = await checkout.createMppDepositIntent({ refundAddress: '0x…' });
// ins.sendTo           deposit address
// ins.amountToSend     "14080296915726607"  (18-dp base units, a STRING)
// ins.amountToSendMpp  "0.014080296915726607" (every digit, no rounding)
// ins.expiresAt, ins.warning

import { mppDepositQrSvg, mppTransferUri } from '@megprime/merchant-sdk/qr';
const svg = await mppDepositQrSvg(ins.sendTo, ins.amountToSend);
// mppTransferUri(...) = ethereum:0x6E02F4A1631379a49e8B7E222CfA6Bf913b05E89@8453/transfer?address=<sendTo>&uint256=<amount>

const intent = await checkout.getMppDepositIntent();
// intent.state (awaiting | received | underpaid | overpaid | settling | settled | refunded | parked),
// intent.receivedAmount, intent.expiresAt
```

A payer who comes back (new tab) with the same refund address gets the same
deposit address back, without creating a new one:

```ts
const intent = await checkout.resumeMppDepositIntent({ refundAddress: '0x…' });
// rejects with code 'mpp_deposit_intent_not_found' (404) when this refund
// address has no intent on this request yet: call createMppDepositIntent.
```

This works on a `createCheckout` checkout once it is `awaiting_payment`, and on an
`attachCheckout` checkout straight away. Holding the fulfillment id is enough,
and no key is sent. A server can raise the same intent with
`createMppDepositIntent(fulfillmentId, { secretKey, refundAddress })` from
`@megprime/merchant-sdk/server`.

Paid detection does not change. The checkout's status polling moves to `paid`
when the fulfillment confirms. Do not treat `intent.state` as the paid signal.

`refundAddress` is checked before any request is sent. It must be `0x` followed
by 40 hex characters, and it cannot be the zero address. Amounts are always
decimal strings. Never pass them through `Number`.

Show the payer all three warnings:

1. **Base only, MPP only.** Send MPP on the Base network. Another token, or MPP
   on another network, will not settle this payment.
2. **The exact amount.** Send exactly `amountToSendMpp` before `expiresAt`. Any
   extra is refunded to `refundAddress`. A short or late payment is refunded
   there too and does not pay.
3. **Refunds go to `refundAddress`.** An exchange deposit address may not
   credit a refund sent to it. Use an address you control, such as a self-custody
   wallet.

## Webhooks

Webhooks tell your server the moment a payment or refund changes. Every route
below is under `https://api.megprimepay.com/api/v1/mpmerchant`, authenticated by
the store's secret key in `X-Secret-Key`, and scoped to that key's store
(another store's endpoint or event is a 404, never a 403). All of it is
server-side only.

### Register an endpoint and store the secret

```ts
import { createWebhookEndpoint } from '@megprime/merchant-sdk/server';

const ep = await createWebhookEndpoint({
  secretKey: process.env.MEGPRIME_SECRET_KEY!,
  url: 'https://shop.example/hooks/megprime',
  description: 'production',            // optional, 500 characters or fewer
});
// ep.secret is the signing secret (whsec_…). It is returned ONCE, here, and
// never again: write it straight into your server-side secret store as
// MEGPRIME_WHSEC. Do not log it. Lost it? rotateWebhookSecret.
```

Raw HTTP: `POST /server/webhook-endpoints` with `{ "url": "…", "description": "…" }`
returns `201` and `data.secret`.

- The URL must be **https on port 443** and resolve to a **public** address
  (`invalid_webhook_url` otherwise), 2048 characters or fewer.
- At most **5 live endpoints** per store (`webhook_endpoint_limit`).
- Every endpoint receives **every** event type. There is no per-endpoint filter:
  ignore the types you don't need, and still answer them `2xx`.
- `listWebhookEndpoints` (`GET /server/webhook-endpoints`) shows `enabled`,
  `disabledReason` and `consecutiveFailures`. It never returns a secret.
- `deleteWebhookEndpoint` (`DELETE /server/webhook-endpoints/{id}`) stops
  delivery; deliveries still pending for it fail without retry.

### Verify every delivery

Each delivery is a `POST` with `Content-Type: application/json` and these
headers:

| header | value |
|---|---|
| `X-MegPrime-Signature` | `t=<unix>,v1=<hex>`, and one more `v1=` per extra live secret during a rotation |
| `X-MegPrime-Event-Id` | `evt_…`, same as the body's `id` |
| `X-MegPrime-Event-Type` | the event type |
| `X-MegPrime-Delivery-Id` | per endpoint; not a dedupe key |
| `User-Agent` | `MegPrime-Webhooks/1` |

`v1` is `hex(HMAC-SHA256(secret, "<t>.<raw body>"))`. The key is the **whole**
`whsec_…` string as UTF-8, prefix included; don't decode it.

`verifyWebhook(rawBody, signatureHeader, secrets, { toleranceSeconds })` from
`@megprime/merchant-sdk/server` checks it and returns the parsed event:

- **Pass the raw body**: the exact bytes received, as a `Buffer`, `Uint8Array`,
  `ArrayBuffer` or string. If a JSON body parser runs first, re-serialising
  changes whitespace and key order and the signature won't match. Passing a
  parsed object throws a `TypeError`, a bug in your route rather than a bad
  delivery.
- `secrets` is one secret or an array. **Any `v1` matching any secret passes**,
  which is how a rotation overlap works.
- A timestamp more than `toleranceSeconds` (default **300**) from your clock,
  **in the past or the future**, is refused. Keep your server clock on NTP.
- MACs are compared in constant time.
- A failure throws `WebhookSignatureError` with `code`:
  `malformed` (missing header, a segment without `=`, no or repeated `t`, a `v1`
  that isn't 64 hex, a body that isn't JSON), `stale` (outside the tolerance) or
  `no_match`. **Answer `400` and do nothing.** Unknown schemes such as `v0=` are
  ignored.

**Node / Express.** Put `express.raw` on the webhook route, before any global
`express.json()` reaches it:

```ts
import express from 'express';
import { verifyWebhook, WebhookSignatureError, type WebhookEvent } from '@megprime/merchant-sdk/server';

const app = express();
const secrets = [process.env.MEGPRIME_WHSEC!, process.env.MEGPRIME_WHSEC_PREVIOUS].filter(Boolean) as string[];

app.post('/hooks/megprime', express.raw({ type: 'application/json' }), (req, res) => {
  let event: WebhookEvent;
  try {
    event = verifyWebhook(req.body, req.headers['x-megprime-signature'], secrets);  // req.body is a Buffer
  } catch (e) {
    if (e instanceof WebhookSignatureError) return res.sendStatus(400);
    throw e;
  }
  // Insert event.id into a table with a UNIQUE constraint. A duplicate means
  // you already have it: still answer 2xx. Queue the work and return now.
  enqueue(event);
  res.sendStatus(204);
});

app.use(express.json()); // other routes, AFTER the webhook route
```

**Framework-agnostic (fetch `Request`: Next.js route handlers, Hono, Bun, Deno,
Supabase Edge Functions, Cloudflare Workers with `nodejs_compat`):**

```ts
import { verifyWebhook, WebhookSignatureError } from '@megprime/merchant-sdk/server';

export async function handleMegPrimeWebhook(req: Request): Promise<Response> {
  const raw = new Uint8Array(await req.arrayBuffer());   // bytes, not req.json()
  let event;
  try {
    event = verifyWebhook(raw, req.headers.get('x-megprime-signature'), [MEGPRIME_WHSEC]);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return new Response('bad signature', { status: 400 });
    throw e;
  }
  await recordOnce(event.id, event);                     // dedupe, then queue
  return new Response(null, { status: 204 });
}
```

**Without the SDK (Web Crypto, any runtime).** `crypto.subtle.verify` compares
in constant time:

```ts
async function verifyMegPrime(raw: Uint8Array, header: string | null, secrets: string[], toleranceSec = 300) {
  const parts = (header ?? '').split(',').map((p) => p.trim().split('='));
  const ts = parts.filter(([k]) => k === 't').map(([, v]) => v);
  const v1 = parts.filter(([k]) => k === 'v1').map(([, v]) => v).filter((h) => /^[0-9a-f]{64}$/i.test(h));
  if (ts.length !== 1 || !/^\d+$/.test(ts[0]) || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts[0])) > toleranceSec) return false;
  const signed = new Uint8Array([...new TextEncoder().encode(`${ts[0]}.`), ...raw]);
  for (const s of secrets) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    for (const h of v1) {
      const mac = Uint8Array.from(h.match(/../g)!, (b) => parseInt(b, 16));
      if (await crypto.subtle.verify('HMAC', key, mac, signed)) return true;
    }
  }
  return false;
}
```

Supabase: deploy the receiving function with `--no-verify-jwt`. MegPrime sends
no `Authorization` header; the signature is the authentication.

### Events and payload

Every body has this envelope. It's the same object `listEvents` returns:

```json
{
  "id": "evt_0123456789abcdef0123456789abcdef",
  "type": "payment_request.paid",
  "created_at": "2026-10-12T22:00:00Z",
  "api_version": "2026-10-12",
  "data": { "object": { "…": "the payment request or refund, snake_case" } }
}
```

`id` is stable across retries and redeliveries: **dedupe on it**. Delivery is
at-least-once and **not ordered**, so act on the object's own `status`/`state`
and timestamps, not on arrival order. `data.object` is the resource as it was
when the event was cut, in the wire's snake_case (types: `PaymentRequestEvent`,
`RefundEvent`, `WebhookTestEvent`; `WEBHOOK_EVENT_TYPES` lists them all). Treat
an unknown `type` as "ignore and answer 2xx": new types can be added.

| type | when | `data.object` |
|---|---|---|
| `payment_request.paid` | the payments core reports the sale confirmed or settled | payment request + `tx_hash` |
| `payment_request.failed` | upstream status became `failed`, `expired`, `cancelled` or `declined` (see `status`) | payment request |
| `payment_request.expired` | 60s past `deadline` and still unpaid | payment request |
| `payment_request.voided` | store staff voided it in the MegPrime app (`voided_at`) | payment request |
| `refund.proposed` | a refund over your key's auto-refund limit is waiting on the owner | refund |
| `refund.owed` | approved, automatically (`decided_by: "system:auto"`) or by the owner. MegPrime owes it and settles by wire | refund |
| `refund.rejected` | the owner rejected it (`decision_reason`) | refund |
| `refund.wired` | MegPrime sent the wire (`wired_at`). **This is the money moving** | refund |
| `refund.failed` | an on-chain refund the payments core refused (`decision_reason`); not used for secret-key sales | refund |
| `webhook.test` | you called `sendTestWebhook` | `{ "endpoint_id": "…" }` |

**Payment request object:** `id` (request id), `fulfillment_id`, `store_id`,
`terminal_id`, `client_ref`, `notional_uoa` (minor units, string), `currency`
(`symbol`, `decimals`, `address`, `chain_id`), `memo`, `classification` and
`classification_id` (only when the sale was created with one), `reference`,
`receiver_wallet`, `request_token`, `chain_id`, `device_paired`, `deadline`,
`status` (the payments core's last status, not normalised: lowercase it),
`status_at`, `settled_at`, `voided_at`, `created_at`, `updated_at`; plus
`tx_hash` on `payment_request.paid`. Match it to your order by `client_ref` or
`fulfillment_id`.

**`payment_request.paid` is not proof of the amount.** It fires on the upstream
status, and the object has no `paid_sum`. Before releasing goods, call
`getPaymentStatus(fulfillment_id)` and require `paidUoa >= amountUoa`, as in
INTEGRATION.md section 5. A webhook replaces your polling *trigger*, not
that check. Payment events come from a sweeper that runs about every 10s, so
expect a few seconds of lag after the chain.

**Refund object:** `id`, `request_id` (the sale's request id), `store_id`,
`amount_uoa`, `reason`, `state`, `settlement` (`off_chain` for secret-key
sales), `client_ref`, `decided_by`, `decided_at`, `decision_reason`,
`wired_at`, `refund_fulfillment_id`, `refund_destination`,
`proposed_by_key_id`, `created_at`, `updated_at`. Finance's wire reference is
never included.

### Retries and auto-disable

- A delivery succeeds on any **2xx** within **10 seconds**. Redirects are not
  followed. Anything else, including a timeout or a 3xx, is a failed attempt.
  Answer fast and do the work afterwards.
- A failed delivery is retried with backoff, **12 attempts in all**. The waits
  after each failure are 30s, 2m, 10m, 30m, 1h, 2h, 4h, 8h, 12h, 12h, 12h, so
  the last attempt is about **52 hours** after the first. After the 12th the
  delivery is `failed`.
- Each delivery that ends `failed` adds one to the endpoint's
  `consecutiveFailures`; any success resets it to 0. At **10 consecutive failed
  deliveries** the endpoint is **disabled**, with
  `disabledReason: "auto-disabled after 10 consecutive failed deliveries"`.
- While an endpoint is disabled, new events are **not queued** for it and its
  pending deliveries fail at once. They aren't lost: they're in `listEvents`.

### Re-enable

Fix the receiver first, or it will disable again. Then:

```ts
await enableWebhookEndpoint({ secretKey, endpointId });  // POST /server/webhook-endpoints/{id}/enable
await sendTestWebhook({ secretKey, endpointId });         // check it end to end
// then gap-fill (below) from the last event you processed
```

`enable` clears `disabledReason` and resets `consecutiveFailures` to 0.

### Rotate the secret (24h overlap)

```ts
const { secret } = await rotateWebhookSecret({ secretKey, endpointId });
// POST /server/webhook-endpoints/{id}/rotate-secret: the new whsec_, ONCE
```

The **previous secret keeps working for 24 hours**. During that window every
delivery is signed with **both**, so the header carries two `v1=` values. A
receiver still on the old secret keeps verifying, and so does one already on
the new secret. To roll over:

1. Rotate and store the new secret as `MEGPRIME_WHSEC`, keeping the old one as
   `MEGPRIME_WHSEC_PREVIOUS`.
2. Deploy with `verifyWebhook(raw, sig, [MEGPRIME_WHSEC, MEGPRIME_WHSEC_PREVIOUS])`.
3. Remove the old secret any time after; it stops working 24h after the rotation.

Only the most recent previous secret is kept, so rotating again inside the 24h
ends the earlier overlap at once. That is also how to cut off a **leaked**
secret immediately: rotate **twice**. The leaked secret is dropped, and the
overlap runs on the intermediate one, which never left your hands.

### Gap filling: `GET /server/events?after=`

After downtime, or as a periodic safety net, page through what you may have
missed. Events come **oldest first**, strictly after the event id you pass;
`limit` is 1 to 100 (default 50). An `after` that isn't one of your store's
event ids is `webhook_event_not_found`.

```ts
import { listEvents } from '@megprime/merchant-sdk/server';

let after = await loadCursor();            // an evt_… you have processed, or undefined for the start
for (;;) {
  const page = await listEvents({ secretKey, after, limit: 100 });
  for (const event of page.events) await handleOnce(event);   // same dedupe as the webhook route
  after = page.nextAfter;
  await saveCursor(after);
  if (!page.mayHaveMore) break;
}
```

The feed holds the exact payloads that were (or will be) delivered, including
`webhook.test` events. Events are ordered by the time they were *cut*, which is
inside the transaction that caused them, so one can land just behind a cursor
you have already passed. Re-read from an event a few minutes old rather than
from the very latest, and let dedupe absorb the overlap.

### Redeliver one event

```ts
const { queued } = await redeliverEvent({ secretKey, eventId: 'evt_…' });
// POST /server/events/{id}/redeliver: 202, data.queued = endpoints it was queued for
```

This resets (or creates) a pending delivery of that event for **every enabled
endpoint** of the store, sent on the worker's next tick with a fresh signature
and the full retry schedule. `queued: 0` means no endpoint is enabled.

### Test events

`sendTestWebhook({ secretKey, endpointId })` (`POST
/server/webhook-endpoints/{id}/test`, `202`) queues a `webhook.test` event to
that one endpoint only. It's signed and retried like any other. The response
carries no event id; the delivery and `listEvents` do. Use it after creating,
rotating or re-enabling an endpoint.

### Errors from these routes

| code | status | meaning |
|---|---|---|
| `invalid_webhook_url` | 400 | not https:443, not public, or too long |
| `webhook_endpoint_limit` | 422 | 5 live endpoints already |
| `webhook_endpoint_not_found` | 404 | no live endpoint with that id on this store |
| `webhook_event_not_found` | 404 | no event with that id (or `after`) on this store |
| `payment_request_not_found` | 404 | `getPaymentRequest`: not this store's request |
| `invalid_body` | 400 | bad body or query (e.g. `limit` outside 1..100) |
| `webhooks_unavailable` | 503 | webhooks are switched off server-side; retryable |
| `publishable_key_invalid` | 401 | the secret key is unknown, revoked or malformed |

## Taking payments and refunds from your server

The secret key (`msk_…`) lives on a server and nowhere else, so it has its own
entry point — importing it into a component pulls a module that **refuses to run
in a browser**:

```ts
import { createPaymentRequest, getPaymentRequest, proposeRefund, getRefundProposal, getPaymentStatus }
  from '@megprime/merchant-sdk/server';

const sale = await createPaymentRequest({
  secretKey: process.env.MEGPRIME_SECRET_KEY!,
  amountUoa: '12500000',          // minor units. Never a float
  clientRef: order.id,            // one per sale: a retry returns the SAME request
  classification: 'hotel',        // optional: a slug the merchant registered (what the sale is FOR)
});
// send the browser sale.fulfillmentId — and nothing else

// read it back later by fulfillment id or request id (status, settledAt, voidedAt)
const stored = await getPaymentRequest({ secretKey, id: sale.fulfillmentId! });

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
// 'owed'     → approved (automatically at or under your key's limit, 100 USDC
//              by default); MegPrime settles it with you OFF-CHAIN, by wire
// 'wired'    → MegPrime has sent the wire
// 'proposed' → over the limit: waiting on the owner
// 'rejected' | 'failed' → now.decisionReason says why
```

**Your key can ask for a refund, and it never says where the money goes.** For a
sale your secret key created, a refund at or under the key's auto-refund limit
(100 USDC per refund and 500 USDC per day by default; MegPrime sets them) comes
back **`owed` straight away**; a larger one stays `proposed` until the store
owner decides. Either way **nothing moves on-chain**: MegPrime settles refunds
with you off-chain, by wire, and you settle with your own customer.
`settlement` is `off_chain` and `autoApproved` is true when no person was
involved. A refund can never exceed what the sale actually received.

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
| `classification_unknown` | no | `classification` is not a live slug on this key's tenant (unregistered, archived, or another tenant's); nothing was created |
| `invalid_classification_slug` | no | `classification` is not a slug: lower-case letters, digits and single hyphens, 64 characters or fewer (refused locally) |
| `embedded_payments_unavailable` | yes | the merchant's deployment is incomplete |
| `rate_limited` | yes | too many requests from this key or address |
| `network` | yes | the request never got an answer |
| `invalid_options` | no | the SDK refused your options before any request |
| `payment_request_not_found` | no | secret-key lookup: not this store's request |
| `webhooks_unavailable` | yes | webhooks are switched off server-side |
| `mpp_deposit_intent_not_found` | no | pay from an exchange: no such intent on this request (on `resumeMppDepositIntent`: this refund address has none yet) |
| `invalid_webhook_url`, `webhook_endpoint_limit`, `webhook_endpoint_not_found`, `webhook_event_not_found`, `invalid_body` | no | see [Webhooks](#webhooks) |

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

### Classify a sale

A merchant can register **payment classifications** — what a sale is *for*
(`hotel`, `travel`) — in their MegPrime account, and you may name one by slug on
any create: `classification` on `createPaymentRequest` and on the checkout
options. The slug comes back on the request and in every webhook payload, so
the merchant can group and report on it.

The slug is a contract, not a label: it must match a **live** classification on
the key's tenant exactly (the SDK lower-cases and trims it). An unregistered or
archived slug is refused with `classification_unknown` and **nothing is
created** — a typo is found at integration, not at month end. Omit it for an
unclassified sale.

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
