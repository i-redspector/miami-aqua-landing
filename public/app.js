(function () {
  'use strict';
  const C = window.AQUA_CONFIG;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const money = (n) => '$' + n.toLocaleString('en-US');

  const state = {
    step: 1,
    service: null,
    date: null,        // 'YYYY-MM-DD'
    slot: null,        // '09:30'
    guests: 1,
    names: [''],
    phone: '',
    email: '',
    booked: []         // slot ids already taken for the chosen date
  };

  /* ---------------- Miami time helpers ---------------- */
  function miamiNow() {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: C.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date()).reduce((o, p) => (o[p.type] = p.value, o), {});
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
  }
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const prettyDate = (s) => parseYmd(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  function total() {
    const svc = C.services[state.service];
    if (!svc) return 0;
    return C.priceMode === 'person' ? svc.price * state.guests : svc.price;
  }

  /* ---------------- Media ---------------- */
  function setVideo(video, m) {
    if (!video || !m) return;
    if (m.poster) video.poster = m.poster;
    video.src = m.video;
    video.addEventListener('error', () => video.classList.add('missing'), { once: true });
  }
  setVideo($('#heroVideo'), C.media.hero);
  $$('video[data-media]').forEach((v) => setVideo(v, C.media[v.dataset.media]));

  // Card videos play when visible (mobile) or on hover (desktop)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => { const v = e.target; e.isIntersecting ? v.play().catch(() => {}) : v.pause(); });
  }, { threshold: 0.5 }) : null;
  $$('.card video, .gallery video').forEach((v) => io && io.observe(v));

  // Gallery from assets/media/gallery.json
  fetch('assets/media/gallery.json').then((r) => (r.ok ? r.json() : [])).then((items) => {
    const grid = $('#galleryGrid');
    if (!items.length) { $('#gallery').hidden = true; return; }
    items.slice(0, 12).forEach((it) => {
      const a = document.createElement('a');
      a.className = 'g-item';
      a.href = it.link || 'https://www.instagram.com/miami.aquaexperience';
      a.target = '_blank'; a.rel = 'noopener';
      if (it.type === 'video') {
        const v = document.createElement('video');
        v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
        if (it.poster) v.poster = it.poster;
        v.src = it.src;
        a.appendChild(v); io && io.observe(v);
        a.insertAdjacentHTML('beforeend', '<span class="g-badge">▶</span>');
      } else {
        const img = document.createElement('img');
        img.loading = 'lazy'; img.src = it.src; img.alt = it.caption || 'Miami Aqua Experience';
        a.appendChild(img);
      }
      grid.appendChild(a);
    });
  }).catch(() => { $('#gallery').hidden = true; });

  // Nav shadow on scroll + sticky CTA visibility
  const nav = $('#nav'), sticky = $('#stickyCta'), book = $('#book');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
    const r = book.getBoundingClientRect();
    sticky.classList.toggle('hide', window.scrollY < 400 || (r.top < window.innerHeight && r.bottom > 0));
  }, { passive: true });

  // Pricing FAQ follows config
  const faqPrice = $$('#faq details')[1];
  if (faqPrice && C.priceMode === 'person') {
    faqPrice.querySelector('summary').textContent = 'How does pricing work?';
    faqPrice.querySelector('p').textContent = `Each 2-hour experience is ${money(C.services.wakesurf.price)} per rider. Add everyone's name at checkout.`;
  }

  /* ---------------- Step 1: service ---------------- */
  const serviceOptions = $('#serviceOptions');
  Object.entries(C.services).forEach(([id, s]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'option'; b.dataset.id = id;
    b.innerHTML = `<strong>${s.name}</strong><span>${s.duration} · ${s.blurb}</span><b>${money(s.price)}${C.priceMode === 'person' ? ' / person' : ''}</b>`;
    b.addEventListener('click', () => { state.service = id; renderServices(); refreshAvailability(); });
    serviceOptions.appendChild(b);
  });
  function renderServices() {
    $$('.option', serviceOptions).forEach((b) => b.classList.toggle('selected', b.dataset.id === state.service));
  }

  $$('[data-pick]').forEach((btn) => btn.addEventListener('click', () => {
    state.service = btn.dataset.pick; renderServices(); refreshAvailability();
    goTo(2); book.scrollIntoView({ behavior: 'smooth' });
  }));

  /* ---------------- Step 2: calendar + slots ---------------- */
  const cal = $('#calendar');
  const today = parseYmd(miamiNow().date);
  const lastDay = new Date(today); lastDay.setDate(lastDay.getDate() + C.bookingWindowDays);
  let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  function renderCalendar() {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const canPrev = new Date(y, m, 1) > new Date(today.getFullYear(), today.getMonth(), 1);
    const canNext = new Date(y, m + 1, 1) <= lastDay;
    let html = `<div class="cal-head">
      <button type="button" class="cal-nav" data-cal="-1" ${canPrev ? '' : 'disabled'} aria-label="Previous month">‹</button>
      <strong>${viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
      <button type="button" class="cal-nav" data-cal="1" ${canNext ? '' : 'disabled'} aria-label="Next month">›</button>
    </div><div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="dow">${d}</span>`).join('')}`;
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), id = ymd(date);
      const disabled = date < today || date > lastDay || (id === ymd(today) && allSlotsPassedToday());
      html += `<button type="button" class="day${id === state.date ? ' selected' : ''}${id === ymd(today) ? ' today' : ''}" data-date="${id}" ${disabled ? 'disabled' : ''}>${d}</button>`;
    }
    cal.innerHTML = html + '</div>';
  }
  function allSlotsPassedToday() { const now = miamiNow().time; return C.slots.every((s) => s.id <= now); }

  cal.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal]');
    if (nav) { viewMonth.setMonth(viewMonth.getMonth() + Number(nav.dataset.cal)); renderCalendar(); return; }
    const day = e.target.closest('.day');
    if (day && !day.disabled) { state.date = day.dataset.date; state.slot = null; renderCalendar(); refreshAvailability(); }
  });

  function renderSlots() {
    const wrap = $('#slots');
    wrap.innerHTML = '';
    if (!state.date) { $('#slotsLabel').textContent = 'Select a date first'; return; }
    $('#slotsLabel').textContent = prettyDate(state.date);
    const now = miamiNow();
    C.slots.forEach((s) => {
      const past = state.date === now.date && s.id <= now.time;
      const taken = state.booked.includes(s.id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'slot' + (state.slot === s.id ? ' selected' : '');
      b.disabled = past || taken;
      b.innerHTML = `${s.label}<small>${taken ? 'Booked' : past ? 'Passed' : '2 hrs'}</small>`;
      b.addEventListener('click', () => { state.slot = s.id; renderSlots(); });
      wrap.appendChild(b);
    });
  }

  let availReq = 0;
  function refreshAvailability() {
    state.booked = [];
    renderSlots();
    if (!state.service || !state.date) return;
    const req = ++availReq;
    fetch(`/api/availability?service=${encodeURIComponent(state.service)}&date=${state.date}`)
      .then((r) => (r.ok ? r.json() : { booked: [] }))
      .then((d) => {
        if (req !== availReq) return;
        state.booked = d.booked || [];
        if (state.booked.includes(state.slot)) state.slot = null;
        renderSlots();
      }).catch(() => {});
  }

  /* ---------------- Step 3: riders ---------------- */
  function renderGuests() {
    $('#guestCount').textContent = state.guests;
    $('#guestMinus').disabled = state.guests <= C.minGuests;
    $('#guestPlus').disabled = state.guests >= C.maxGuests;
    while (state.names.length < state.guests) state.names.push('');
    state.names.length = state.guests;
    $('#guestNames').innerHTML = state.names.map((n, i) => `
      <label class="field"><span>${i === 0 ? 'Your full name (lead rider)' : `Rider ${i + 1} full name`}</span>
      <input type="text" data-name="${i}" autocomplete="${i === 0 ? 'name' : 'off'}" value="${n.replace(/"/g, '&quot;')}" placeholder="First & last name" required /></label>`).join('');
  }
  $('#guestMinus').addEventListener('click', () => { state.guests = Math.max(C.minGuests, state.guests - 1); renderGuests(); });
  $('#guestPlus').addEventListener('click', () => { state.guests = Math.min(C.maxGuests, state.guests + 1); renderGuests(); });
  $('#guestNames').addEventListener('input', (e) => { const i = e.target.dataset.name; if (i != null) state.names[i] = e.target.value; });
  $('#phone').addEventListener('input', (e) => { state.phone = e.target.value; });
  $('#email').addEventListener('input', (e) => { state.email = e.target.value; });

  /* ---------------- Step 4: summary ---------------- */
  function renderSummary() {
    const svc = C.services[state.service];
    const slot = C.slots.find((s) => s.id === state.slot);
    const rows = [
      ['Experience', `${svc.name} (${svc.duration})`],
      ['Date', prettyDate(state.date)],
      ['Time', slot.label],
      ['Riders', `${state.guests}: ${state.names.map((n) => n.trim()).join(', ')}`],
      ['Phone', state.phone]
    ];
    if (state.email) rows.push(['Email', state.email]);
    if (C.priceMode === 'person') rows.push(['Price', `${money(svc.price)} × ${state.guests}`]);
    rows.push(['Total', money(total())]);
    $('#summary').innerHTML = rows.map(([k, v], i) => `<div${i === rows.length - 1 ? ' class="total"' : ''}><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
    $('#payBtn').textContent = `Pay ${money(total())} securely`;
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------------- Navigation + validation ---------------- */
  const err = $('#error');
  const showError = (m) => { err.textContent = m || ''; };
  const digits = (s) => s.replace(/\D/g, '');

  function validate(step) {
    if (step === 1 && !state.service) return 'Please choose an experience.';
    if (step === 2 && !state.date) return 'Please pick a date.';
    if (step === 2 && !state.slot) return 'Please pick a time slot.';
    if (step === 3) {
      const missing = state.names.findIndex((n) => n.trim().length < 2);
      if (missing > -1) { const el = $(`[data-name="${missing}"]`); el && el.focus(); return `Please enter a name for ${missing === 0 ? 'the lead rider' : 'rider ' + (missing + 1)}.`; }
      const d = digits(state.phone);
      if (d.length < 10 || d.length > 15) { $('#phone').focus(); return 'Please enter a valid phone number.'; }
      if (state.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) { $('#email').focus(); return 'Please enter a valid email or leave it blank.'; }
    }
    return '';
  }

  function goTo(step) {
    state.step = step;
    $$('.step').forEach((s) => s.classList.toggle('active', s.dataset.step === String(step)));
    $$('#progress li').forEach((li, i) => {
      li.classList.toggle('active', step === 'done' || i + 1 <= step);
      li.classList.toggle('current', i + 1 === step);
    });
    if (step === 2) { renderCalendar(); renderSlots(); }
    if (step === 3) renderGuests();
    if (step === 4) renderSummary();
    showError('');
  }

  $$('[data-next]').forEach((b) => b.addEventListener('click', () => {
    const m = validate(state.step);
    if (m) return showError(m);
    goTo(state.step + 1);
    $('#checkout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goTo(state.step - 1)));

  /* ---------------- Pay ---------------- */
  const payBtn = $('#payBtn');
  payBtn.addEventListener('click', async () => {
    if (!$('#agree').checked) return showError('Please accept the waiver and cancellation policy.');
    showError('');
    payBtn.disabled = true; payBtn.textContent = 'Opening secure checkout…';
    const payload = {
      service: state.service, date: state.date, slot: state.slot,
      guests: state.names.map((n) => n.trim()), phone: state.phone.trim(), email: state.email.trim()
    };
    try { sessionStorage.setItem('aqua-booking', JSON.stringify(state)); } catch (e) {}
    try {
      const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json().catch(() => ({}));
      // Static hosting (e.g. GitHub Pages) has no booking server: run as a preview, nothing is charged
      if ([404, 405, 501].includes(r.status) && !d.error) { showDone({ ...payload, guests: payload.guests }, true); return; }
      if (!r.ok) throw new Error(d.error || 'Checkout is unavailable right now. Please try again.');
      if (d.url) { window.location.href = d.url; return; }
      if (d.demo) { showDone(d.booking, true); return; }
      throw new Error('Unexpected response from checkout.');
    } catch (e) {
      showError(e.message === 'Failed to fetch' ? 'Could not reach the booking server. Check your connection and try again.' : e.message);
      if (/no longer available/i.test(e.message)) { state.slot = null; refreshAvailability(); goTo(2); }
    } finally {
      payBtn.disabled = false; renderSummary();
    }
  });

  function showDone(b, demo) {
    const svc = C.services[b.service];
    const slot = C.slots.find((s) => s.id === b.slot);
    $('#doneText').innerHTML = `${escapeHtml(svc.name)} on <strong>${escapeHtml(prettyDate(b.date))}</strong> at <strong>${escapeHtml(slot.label)}</strong> for ${b.guests.length} ${b.guests.length === 1 ? 'rider' : 'riders'}. We'll text <strong>${escapeHtml(b.phone)}</strong> with the meeting point.` +
      (demo ? '<br><br><em>Demo mode: Stripe isn\'t connected yet, so no card was charged.</em>' : '');
    goTo('done');
    try { sessionStorage.removeItem('aqua-booking'); } catch (e) {}
  }

  /* ---------------- Return from Stripe ---------------- */
  const params = new URLSearchParams(location.search);
  if (params.get('booking') === 'success' && params.get('session_id')) {
    fetch('/api/confirm?session_id=' + encodeURIComponent(params.get('session_id')))
      .then((r) => r.json())
      .then((d) => { if (d.booking) showDone(d.booking); else showError(d.error || 'We could not confirm your payment. Please contact us.'); })
      .catch(() => showError('We could not confirm your payment. Please contact us.'))
      .finally(() => { history.replaceState(null, '', location.pathname + '#book'); book.scrollIntoView(); });
  } else if (params.get('booking') === 'cancelled') {
    try { Object.assign(state, JSON.parse(sessionStorage.getItem('aqua-booking') || '{}')); } catch (e) {}
    $('#phone').value = state.phone || ''; $('#email').value = state.email || '';
    renderServices();
    goTo(state.service && state.date && state.slot ? 4 : 1);
    showError('Payment was cancelled. Your details are saved, so you can try again.');
    history.replaceState(null, '', location.pathname + '#book');
    setTimeout(() => book.scrollIntoView(), 50);
  } else {
    goTo(1);
  }
})();
