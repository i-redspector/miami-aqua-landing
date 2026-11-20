/*
 * Edit this file to change services, prices, time slots and media.
 * The server (server.js) reads the same file, so prices charged
 * at checkout always match what the page shows.
 */
(function (root) {
  const CONFIG = {
    business: 'Miami Aqua Experience',
    // WhatsApp: digits only, with country code. Used by every WhatsApp button.
    whatsapp: '13058536859',
    whatsappMessage: "Hi Miami Aqua Experience! I'd like to book a session.",
    currency: 'usd',
    timezone: 'America/New_York',

    // 'booking' = one flat price per experience (as written: $350 for 2 hours)
    // 'person'  = price multiplied by number of people
    priceMode: 'booking',

    minGuests: 1,
    maxGuests: 6,

    // How many days ahead people can book
    bookingWindowDays: 90,

    // Session start times (24h "HH:MM", local Miami time) and labels
    slots: [
      { id: '09:30', label: '9:30 AM' },
      { id: '12:30', label: '12:30 PM' },
      { id: '15:30', label: '3:30 PM' }
    ],

    services: {
      wakesurf: {
        name: 'Wake Surfing',
        duration: '2 hours',
        price: 350,
        blurb: 'Private boat, captain & coaching'
      },
      efoil: {
        name: 'E-Foil / E-Surf',
        duration: '2 hours',
        price: 350,
        blurb: 'Electric hydrofoil or e-surfboard + instructor'
      }
    },

    // Drop your videos in public/assets/media/ and point to them here.
    media: {
      hero: { video: 'assets/media/hero.mp4', poster: 'assets/media/hero-poster.jpg' },
      wakesurf: { video: 'assets/media/wakesurf.mp4', poster: 'assets/media/wakesurf-poster.jpg' },
      efoil: { video: 'assets/media/efoil.mp4', poster: 'assets/media/efoil-poster.jpg' }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.AQUA_CONFIG = CONFIG;
})(this);
