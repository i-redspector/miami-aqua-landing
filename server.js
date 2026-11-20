/*
 * Miami Aqua Experience: booking + Stripe Checkout server.
 *
 *   STRIPE_SECRET_KEY      sk_live_... or sk_test_...  (no key = demo mode, nothing charged)
 *   STRIPE_WEBHOOK_SECRET  whsec_...  (optional, recommended in production)
 *   PUBLIC_URL             https://yourdomain.com (used for Stripe return URLs)
 *   ADMIN_TOKEN            any long random string, to view bookings at /admin?token=...
 *   PORT                   default 3000
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const CONFIG = require('./public/config.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
const DB_FILE = path.join(__dirname, 'data', 'bookings.json');
const HOLD_MINUTES = 30; // an unpaid checkout holds the slot this long (Stripe minimum)

/* ---------------- tiny JSON "database" ---------------- */
function load() { try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return []; } }
function save(rows) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(rows, null, 2));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}
function isActive(b) {
  if (b.status === 'paid') return true;
  return b.status === 'pending' && Date.now() - new Date(b.createdAt).getTime() < HOLD_MINUTES * 60e3;
}
const takenSlots = (service, date) => load().filter((b) => b.service === service && b.date === date && isActive(b)).map((b) => b.slot);
function markPaid(sessionId, extra = {}) {
  const rows = load();
  const b = rows.find((r) => r.stripeSessionId === sessionId);
  if (b && b.status !== 'paid') { Object.assign(b, { status: 'paid', paidAt: new Date().toISOString() }, extra); save(rows); console.log('[booking paid]', b.id, b.service, b.date, b.slot, b.phone); }
  return b;
}

/* ---------------- helpers ---------------- */
function miamiNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).reduce((o, x) => (o[x.type] = x.value, o), {});
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const clean = (s, max = 80) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const publicBooking = (b) => ({ id: b.id, service: b.service, date: b.date, slot: b.slot, guests: b.guests, phone: b.phone, status: b.status, amount: b.amount });

function validate(body) {
  const service = CONFIG.services[body.service] ? body.service : null;
  if (!service) return { error: 'Please choose an experience.' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date || isNaN(Date.parse(date))) return { error: 'Please pick a valid date.' };
  const slot = CONFIG.slots.find((s) => s.id === body.slot);
  if (!slot) return { error: 'Please pick a time slot.' };
  const now = miamiNow();
  const ahead = daysBetween(now.date, date);
  if (ahead < 0 || ahead > CONFIG.bookingWindowDays || (ahead === 0 && slot.id <= now.time)) return { error: 'That date or time is no longer available.' };
  const guests = Array.isArray(body.guests) ? body.guests.map((g) => clean(g)).filter(Boolean) : [];
  if (guests.length < CONFIG.minGuests || guests.length > CONFIG.maxGuests) return { error: `Please add between ${CONFIG.minGuests} and ${CONFIG.maxGuests} riders.` };
  if (guests.some((g) => g.length < 2)) return { error: 'Please enter a full name for every rider.' };
  const phone = clean(body.phone, 30);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return { error: 'Please enter a valid phone number.' };
  const email = clean(body.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Please enter a valid email.' };
  const svc = CONFIG.services[service];
  const amount = CONFIG.priceMode === 'person' ? svc.price * guests.length : svc.price;
  return { value: { service, date, slot: slot.id, slotLabel: slot.label, guests, phone, email, amount } };
}

/* ---------------- app ---------------- */
const app = express();
app.disable('x-powered-by');

// Stripe webhook needs the raw body, so it's registered before express.json()
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.sendStatus(404);
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
  catch (e) { return res.status(400).send(`Webhook error: ${e.message}`); }
  const s = event.data.object;
  if (event.type === 'checkout.session.completed' && s.payment_status === 'paid') markPaid(s.id, { stripePaymentIntent: s.payment_intent });
  if (event.type === 'checkout.session.expired') {
    const rows = load(); const b = rows.find((r) => r.stripeSessionId === s.id);
    if (b && b.status === 'pending') { b.status = 'expired'; save(rows); }
  }
  res.json({ received: true });
});

app.use(express.json({ limit: '20kb' }));

app.get('/api/availability', (req, res) => {
  const { service, date } = req.query;
  if (!CONFIG.services[service] || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'Bad request' });
  res.json({ booked: takenSlots(service, date) });
});

app.post('/api/checkout', async (req, res) => {
  const { error, value: v } = validate(req.body || {});
  if (error) return res.status(400).json({ error });
  if (takenSlots(v.service, v.date).includes(v.slot)) return res.status(409).json({ error: 'Sorry, that time slot is no longer available. Please pick another.' });

  const svc = CONFIG.services[v.service];
  const booking = { id: 'bk_' + crypto.randomBytes(6).toString('hex'), ...v, status: 'pending', createdAt: new Date().toISOString() };

  if (!stripe) { // demo mode: confirm immediately, no charge
    booking.status = 'paid'; booking.demo = true;
    save([...load(), booking]);
    console.log('[demo booking]', booking.id, booking.service, booking.date, booking.slot, booking.phone);
    return res.json({ demo: true, booking: publicBooking(booking) });
  }

  try {
    const prettyDate = new Date(v.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: CONFIG.priceMode === 'person' ? v.guests.length : 1,
        price_data: {
          currency: CONFIG.currency,
          unit_amount: svc.price * 100,
          product_data: { name: `${svc.name} · ${svc.duration}`, description: `${prettyDate} at ${v.slotLabel} · ${v.guests.length} rider(s): ${v.guests.join(', ')}`.slice(0, 500) }
        }
      }],
      customer_email: v.email || undefined,
      metadata: { booking_id: booking.id, service: v.service, date: v.date, slot: v.slot, phone: v.phone, guests: v.guests.join(', ').slice(0, 500) },
      expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60 + 60,
      success_url: `${PUBLIC_URL}/?booking=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/?booking=cancelled`
    });
    booking.stripeSessionId = session.id;
    save([...load(), booking]);
    res.json({ url: session.url });
  } catch (e) {
    console.error('Stripe error:', e.message);
    res.status(502).json({ error: 'Payment provider error. Please try again in a moment.' });
  }
});

app.get('/api/confirm', async (req, res) => {
  const id = String(req.query.session_id || '');
  let b = load().find((r) => r.stripeSessionId === id);
  if (!b || !stripe) return res.status(404).json({ error: 'Booking not found.' });
  if (b.status !== 'paid') {
    try {
      const s = await stripe.checkout.sessions.retrieve(id);
      if (s.payment_status === 'paid') b = markPaid(id, { stripePaymentIntent: s.payment_intent });
    } catch (e) { return res.status(502).json({ error: 'Could not verify payment yet. Refresh in a moment.' }); }
  }
  if (b.status !== 'paid') return res.status(402).json({ error: 'Payment has not completed.' });
  res.json({ booking: publicBooking(b) });
});

// Simple owner view of bookings: /admin?token=YOUR_ADMIN_TOKEN
app.get('/admin', (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  const given = String(req.query.token || '');
  if (!token || given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) return res.sendStatus(404);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = load().filter((b) => b.status === 'paid').sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot));
  res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookings</title>
  <style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}</style>
  <h1>Paid bookings (${rows.length})</h1><div style="overflow-x:auto"><table><tr><th>Date</th><th>Time</th><th>Experience</th><th>Riders</th><th>Phone</th><th>Email</th><th>Paid</th></tr>
  ${rows.map((b) => `<tr><td>${esc(b.date)}</td><td>${esc(b.slotLabel)}</td><td>${esc(CONFIG.services[b.service]?.name)}</td><td>${b.guests.map(esc).join('<br>')}</td><td><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></td><td>${esc(b.email)}</td><td>$${b.amount}${b.demo ? ' (demo)' : ''}</td></tr>`).join('')}
  </table></div>`);
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, () => console.log(`Miami Aqua running on ${PUBLIC_URL} ${stripe ? '(Stripe live)' : '(DEMO MODE: set STRIPE_SECRET_KEY to take payments)'}`));
