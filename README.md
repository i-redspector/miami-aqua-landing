# Miami Aqua Experience: Landing Page + Booking Checkout

**Live preview:** https://i-redspector.github.io/miami-aqua-landing/ (GitHub Pages, checkout runs in preview mode: no card is charged)

A one-page sales funnel for **Wake Surfing** and **E-Foil / E-Surf** (2-hour experiences, $350 each), with a full checkout:

1. **Experience**: pick Wake Surfing or E-Foil / E-Surf
2. **Date & time**: mini calendar with 3 daily slots: **9:30 AM · 12:30 PM · 3:30 PM** (Miami time). Past days, past times and already-booked slots are blocked.
3. **Riders**: number of people (1–6), a full name for each person, phone number (required), email (optional, for the receipt)
4. **Review & pay**: order summary, waiver checkbox, then **Stripe Checkout** for the card payment
5. **Confirmation** screen after a successful payment

## Run it

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. With no Stripe key it runs in **demo mode**: bookings are saved but no card is charged.

## Go live (take real payments)

Set these environment variables on your host (Render, Railway, Fly.io, a VPS, etc.):

| Variable | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | From Stripe Dashboard → Developers → API keys (`sk_live_...`, or `sk_test_...` for testing) |
| `PUBLIC_URL` | Your site address, e.g. `https://miamiaquaexperience.com` |
| `ADMIN_TOKEN` | Any long random string. View paid bookings at `/admin?token=THAT_STRING` |
| `STRIPE_WEBHOOK_SECRET` | Optional, recommended. In Stripe add a webhook to `https://YOUR_DOMAIN/api/stripe-webhook` for `checkout.session.completed` and `checkout.session.expired` |

Bookings are stored in `data/bookings.json`. On hosts with a temporary disk (e.g. Render free tier), attach a persistent disk or the file resets on redeploy.

## Change prices, slots or services

Edit `public/config.js`. The server reads the same file, so the amount charged always matches the page.

- `priceMode: 'booking'` = $350 flat per experience (current). Use `'person'` to charge $350 × number of people.
- `maxGuests`, `slots`, `bookingWindowDays`, service names and prices are all there.

## Add your videos

See `public/assets/media/README.txt`. Drop in `hero.mp4`, `wakesurf.mp4`, `efoil.mp4` (+ optional poster images). Until they're added, the page shows ocean gradients instead.

## Instagram gallery

Put photos or videos from @miami.aquaexperience in `public/assets/media/instagram/`, then:

```bash
node scripts/build-gallery.js
```

This builds the "See it in action" grid (up to 12 items). The section stays hidden until media is added.
