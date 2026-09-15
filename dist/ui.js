import { DEFAULT_LABELS } from './types.js';
import { formatUoa } from './money.js';
export function mountUI(container, opts) {
    const L = { ...DEFAULT_LABELS, ...(opts.labels ?? {}) };
    const root = container.attachShadow
        ? container.attachShadow({ mode: 'open' })
        : container;
    const style = document.createElement('style');
    style.textContent = css(opts.theme ?? 'auto');
    root.appendChild(style);
    const wrap = document.createElement('div');
    wrap.className = 'mp';
    // The whole widget is a live region at `polite`: a payer using a screen
    // reader must be told the payment landed without having to go looking, and
    // `assertive` would interrupt them mid-sentence to do it.
    wrap.setAttribute('role', 'status');
    wrap.setAttribute('aria-live', 'polite');
    root.appendChild(wrap);
    let lastQrFor;
    let destroyed = false;
    function render(snap) {
        if (destroyed)
            return;
        const amount = formatUoa(snap.amountUoa, snap.currency);
        if (snap.state === 'creating' || snap.state === 'idle') {
            wrap.innerHTML = `<p class="muted">${esc(L.waiting)}</p>`;
            return;
        }
        if (snap.state === 'paid') {
            wrap.innerHTML =
                `<p class="big ok">${esc(L.paid)}</p>` +
                    (amount ? `<p class="muted">${esc(amount)}</p>` : '');
            return;
        }
        if (snap.state === 'expired') {
            wrap.innerHTML = `<p class="big">${esc(L.expired)}</p>`;
            return;
        }
        if (snap.state === 'cancelled') {
            wrap.innerHTML = `<p class="big">${esc(L.cancelled)}</p>`;
            return;
        }
        if (snap.state === 'error' || snap.state === 'unconfirmed') {
            // `unconfirmed` shows no QR, deliberately: we do not know that a payable
            // request exists, and a code pointing at nothing is worse than an error.
            const msg = snap.error?.message || L.errorGeneric;
            wrap.innerHTML = `<p class="big err">${esc(L.errorGeneric)}</p><p class="muted">${esc(msg)}</p>`;
            return;
        }
        // awaiting_payment | settling
        const reconnecting = snap.consecutiveFailures >= 2;
        wrap.innerHTML = `
      <p class="big">${esc(L.scanToPay)}</p>
      ${amount ? `<p class="amount">${esc(amount)}</p>` : ''}
      <div class="qr" data-qr></div>
      <p><a class="btn" data-open href="${attr(snap.payUrl ?? '#')}">${esc(L.openInApp)}</a></p>
      <p class="muted">${esc(reconnecting ? L.reconnecting : L.waiting)}</p>
      <p><button class="link" data-close type="button">${esc(L.close)}</button></p>
    `;
        wrap.querySelector('[data-close]')?.addEventListener('click', opts.onClose);
        if (snap.payUrl && snap.payUrl !== lastQrFor) {
            lastQrFor = snap.payUrl;
            void drawQR(wrap.querySelector('[data-qr]'), snap.payUrl, L.qrAlt);
        }
    }
    return {
        update: render,
        destroy() {
            destroyed = true;
            wrap.remove();
            style.remove();
        },
    };
}
/**
 * The QR is drawn by `qrcode`, loaded on demand.
 *
 * Lazily imported so a headless integrator — one rendering their own UI — never
 * pays for an encoder they do not use. Not hand-rolled: a subtly wrong matrix
 * is a customer who cannot pay, and that is not a thing to risk to save a
 * dependency.
 */
async function drawQR(host, url, alt) {
    if (!host)
        return;
    try {
        const qrcode = await import('qrcode');
        const dataUrl = await qrcode.toDataURL(url, { width: 240, margin: 1 });
        const img = document.createElement('img');
        img.src = dataUrl;
        // The QR is the payment instrument. A screen-reader user needs the link
        // itself, not the word "QR code", so the alt text is followed by a real
        // anchor above — see the `openInApp` button, which is the accessible path.
        img.alt = alt;
        img.width = 240;
        img.height = 240;
        host.replaceChildren(img);
    }
    catch {
        // The link is always rendered above, so a failed encoder degrades to
        // "tap to pay" rather than to a dead checkout.
        host.replaceChildren();
    }
}
function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const attr = esc;
function css(theme) {
    const dark = `--bg:#111;--fg:#fff;--muted:#9aa0a6;--ok:#34d399;--err:#f87171;--btn:#fff;--btnfg:#111`;
    const light = `--bg:#fff;--fg:#111;--muted:#5f6368;--ok:#047857;--err:#b91c1c;--btn:#111;--btnfg:#fff`;
    const base = theme === 'dark' ? dark : light;
    const auto = theme === 'auto'
        ? `@media (prefers-color-scheme: dark){:host{${dark}}}`
        : '';
    return `
:host{${base};display:block;color-scheme:light dark}
.mp{background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:20px;border-radius:16px}
.big{font-size:16px;font-weight:600;margin:0 0 6px}
.amount{font-size:24px;font-weight:700;margin:0 0 12px;font-variant-numeric:tabular-nums}
.muted{color:var(--muted);margin:8px 0 0}
.ok{color:var(--ok)} .err{color:var(--err)}
.qr{min-height:240px;display:flex;align-items:center;justify-content:center}
.qr img{border-radius:8px;background:#fff;padding:8px}
.btn{display:inline-block;background:var(--btn);color:var(--btnfg);text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600}
.link{background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer;font:inherit}
.btn:focus-visible,.link:focus-visible{outline:2px solid var(--fg);outline-offset:2px}
${auto}`;
}
