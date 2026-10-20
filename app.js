'use strict';

// ---------- narzędzia ----------
const KEY = 'kasa-v1';
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const qtyFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 8 });
const fxFmt = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const pctFmt = new Intl.NumberFormat('pl-PL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const monthFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const curFmts = {};

const money = v => pln.format(v || 0);
const signed = v => (v > 0 ? '+' : '') + pln.format(v || 0);
const inCur = (v, cur) => (curFmts[cur] ??= new Intl.NumberFormat('pl-PL', { style: 'currency', currency: cur })).format(v || 0);
const pct = v => pctFmt.format(v || 0);
const cls = v => (v > 0.005 ? 'pos' : v < -0.005 ? 'neg' : 'muted');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseNum = s => {
  const v = parseFloat(String(s ?? '').replace(/[\s zł]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
};
const inputNum = v => (v || v === 0 ? String(+v.toFixed(8)).replace('.', ',') : '');
const today = () => new Date().toLocaleDateString('sv-SE'); // RRRR-MM-DD w czasie lokalnym
const thisMonth = () => today().slice(0, 7);
const monthEnd = m => m + '-31';
const monthName = m => monthFmt.format(new Date(m + '-01T12:00'));
const monthLabel = m => monthShort.format(new Date(m + '-01T12:00'));
const dateLabel = d => dateFmt.format(new Date(d + 'T12:00'));
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

const ACCOUNT_TYPES = ['Konto osobiste', 'Oszczędnościowe', 'Lokata', 'Obligacje', 'Gotówka', 'Krypto', 'Emerytalne (IKE/IKZE/PPK)', 'Inne'];
const CASH_KINDS = { in: 'Wpłata', out: 'Wypłata', div: 'Dywidenda / odsetki' };
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF'];
// Giełdy, na których szukamy waloru (symbol TradingView „GIEŁDA:TICKER”), wg waluty.
const EXCHANGES = { PLN: ['GPW'], EUR: ['XETR', 'EURONEXT', 'MIL', 'BME'], USD: ['NASDAQ', 'NYSE', 'AMEX'], GBP: ['LSE'], CHF: ['SIX'] };
// Symbole z wersji 2 (format Yahoo) przepisujemy na TradingView; zwykły ticker z USA ustalimy automatycznie.
const YAHOO_SUFFIX = { WA: 'GPW', DE: 'XETR', L: 'LSE', SW: 'SIX', MI: 'MIL', MC: 'BME', AS: 'EURONEXT', PA: 'EURONEXT' };
function fromYahoo(sym) {
  if (!sym || sym.includes(':')) return sym || '';
  const m = sym.match(/^(.+)\.([A-Z]+)$/);
  if (m && YAHOO_SUFFIX[m[2]]) return `${YAHOO_SUFFIX[m[2]]}:${m[1]}`;
  const c = sym.match(/^([A-Z0-9]+)-(USD|EUR)$/);
  return c ? `BITSTAMP:${c[1]}${c[2]}` : '';
}

// ---------- dane ----------
// accounts:  { id, name, type }
// balances:  { id, accountId, month: 'RRRR-MM', amount }
// brokers:   { id, name }                                              — rachunki maklerskie
// assets:    { id, ticker, name, currency, symbol, symbolManual, price, priceDate }
//            cena w walucie waloru; symbol TradingView (np. GPW:PKO), pusty = do ustalenia automatycznie
// trades:    { id, assetId, brokerId, date, type: 'buy'|'sell', qty, price, fx, fee }
//            price w walucie waloru, fx = ile zł za 1 jednostkę waluty, fee w zł
// cash:      { id, brokerId, date, kind: 'in'|'out'|'div', amount, note } — ruchy na rachunku, w zł
// snapshots: { month, value, deposited }                               — wartość portfela zapisana przy podsumowaniu miesiąca
// fx:        { USD: { rate, date } }                                   — ostatnie kursy średnie NBP
// settings:  { quotesUrl, lastRefresh }
let db = load();

function blank() {
  return {
    version: 3, accounts: [], balances: [], brokers: [], assets: [], trades: [], cash: [], snapshots: [],
    fx: {}, settings: { quotesUrl: '', lastRefresh: 0 },
  };
}
function migrate(d) {
  d = { ...blank(), version: 1, ...d };
  d.settings = { ...blank().settings, ...d.settings };
  if (!d.brokers.length && (d.trades.length || d.cash.length)) d.brokers.push({ id: uid(), name: 'Rachunek maklerski' });
  const def = d.brokers[0]?.id;
  for (const t of d.trades) { t.brokerId ??= def; t.fx ??= 1; }
  for (const c of d.cash) c.brokerId ??= def;
  for (const a of d.assets) {
    a.currency ??= 'PLN';
    if (d.version < 3) a.symbol = fromYahoo(a.symbol);
    a.symbol ??= '';
  }
  d.version = 3;
  return d;
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && typeof d === 'object') return migrate(d);
  } catch {}
  return blank();
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
}

// ---------- obliczenia ----------
function latestBalance(accountId, upTo = '9999-12') {
  let best = null;
  for (const b of db.balances) {
    if (b.accountId === accountId && b.month <= upTo && (!best || b.month > best.month)) best = b;
  }
  return best;
}
const accountsTotal = upTo => sum(db.accounts, a => latestBalance(a.id, upTo)?.amount || 0);

const assetById = id => db.assets.find(a => a.id === id);
const brokerName = id => db.brokers.find(b => b.id === id)?.name || '—';

function fxRate(cur, fxs = {}) {
  if (cur === 'PLN') return 1;
  if (fxs[cur]) return fxs[cur];
  if (db.fx[cur]) return db.fx[cur].rate;
  // Brak kursu NBP — bierzemy kurs z ostatniej transakcji w tej walucie.
  const t = db.trades.filter(t => assetById(t.assetId)?.currency === cur).sort(byDate).pop();
  return t?.fx || 1;
}
const tradeValue = t => t.qty * t.price * (t.fx || 1); // w zł, bez prowizji
const tradeFlow = t => (t.type === 'buy' ? -(tradeValue(t) + t.fee) : tradeValue(t) - t.fee);

// Pozycje osobno dla każdego rachunku i waloru, metodą średniego kosztu (w zł, z prowizjami).
function lots(upTo = '9999-12-31', prices = {}, fxs = {}) {
  const out = [];
  for (const br of db.brokers) {
    for (const a of db.assets) {
      const trades = db.trades.filter(t => t.assetId === a.id && t.brokerId === br.id && t.date <= upTo).sort(byDate);
      if (!trades.length) continue;
      let qty = 0, cost = 0, costCur = 0, realized = 0;
      for (const t of trades) {
        if (t.type === 'buy') {
          qty += t.qty;
          cost += tradeValue(t) + t.fee;
          costCur += t.qty * t.price;
        } else {
          const q = Math.min(t.qty, qty);
          const share = qty ? q / qty : 0;
          realized += q * t.price * (t.fx || 1) - t.fee - cost * share;
          cost -= cost * share;
          costCur -= costCur * share;
          qty -= q;
        }
      }
      if (qty < 1e-9) { qty = 0; cost = 0; costCur = 0; }
      const price = prices[a.id] ?? a.price ?? 0;
      const rate = fxRate(a.currency, fxs);
      out.push({ asset: a, brokerId: br.id, qty, cost, costCur, realized, value: qty * price * rate, price, rate, trades });
    }
  }
  return out;
}

// Łączy pozycje tego samego waloru z różnych rachunków.
function mergeLots(list) {
  const m = new Map();
  for (const l of list) {
    if (!m.has(l.asset.id)) m.set(l.asset.id, { ...l.asset, price: l.price, rate: l.rate, qty: 0, cost: 0, costCur: 0, realized: 0, value: 0, trades: [], brokers: [] });
    const x = m.get(l.asset.id);
    x.qty += l.qty; x.cost += l.cost; x.costCur += l.costCur; x.realized += l.realized; x.value += l.value;
    x.trades.push(...l.trades);
    if (l.qty) x.brokers.push(l.brokerId);
  }
  return [...m.values()].map(x => ({
    ...x,
    avg: x.qty ? x.cost / x.qty : 0,
    avgCur: x.qty ? x.costCur / x.qty : 0,
    unrealized: x.value - x.cost,
    trades: x.trades.sort(byDate),
  }));
}

function portfolio(upTo = '9999-12-31', prices, fxs, brokerId = null) {
  const brokers = db.brokers.filter(b => !brokerId || b.id === brokerId);
  const all = lots(upTo, prices, fxs);
  const r = { posValue: 0, cost: 0, realized: 0, income: 0, deposited: 0, freeCash: 0, value: 0, base: 0, gain: 0, tracksCash: false };
  for (const b of brokers) {
    const L = all.filter(l => l.brokerId === b.id);
    const cash = db.cash.filter(c => c.brokerId === b.id && c.date <= upTo);
    // Gotówkę na rachunku śledzimy tylko, jeśli użytkownik wpisuje na nim wpłaty/wypłaty.
    const tracks = db.cash.some(c => c.brokerId === b.id && c.kind !== 'div');
    const posValue = sum(L, l => l.value), cost = sum(L, l => l.cost), realized = sum(L, l => l.realized);
    const income = sum(cash, c => (c.kind === 'div' ? c.amount : 0));
    const deposited = sum(cash, c => (c.kind === 'in' ? c.amount : c.kind === 'out' ? -c.amount : 0));
    const flow = sum(db.trades.filter(t => t.brokerId === b.id && t.date <= upTo), tradeFlow);
    const freeCash = tracks ? deposited + income + flow : 0;
    r.posValue += posValue; r.cost += cost; r.realized += realized; r.income += income;
    r.deposited += deposited; r.freeCash += freeCash;
    r.value += posValue + freeCash;
    r.base += tracks ? deposited : cost;
    r.gain += tracks ? posValue + freeCash - deposited : posValue - cost + realized + income;
    r.tracksCash ||= tracks;
  }
  r.pos = mergeLots(all.filter(l => brokers.some(b => b.id === l.brokerId)));
  r.gainPct = r.base > 0 ? r.gain / r.base : 0;
  return r;
}

function history() {
  const now = thisMonth();
  const months = new Set([...db.balances.map(b => b.month), ...db.snapshots.map(s => s.month)]);
  if (db.accounts.length || db.assets.length) months.add(now);
  return [...months].filter(m => m <= now).sort().map(m => {
    const acc = accountsTotal(m);
    let inv;
    if (m === now) inv = portfolio().value;
    else {
      const snap = db.snapshots.filter(s => s.month <= m).sort((a, b) => (a.month < b.month ? 1 : -1))[0];
      inv = snap ? snap.value : 0;
    }
    return { month: m, accounts: acc, invest: inv, total: acc + inv };
  });
}

function findAsset(ticker) {
  const t = ticker.trim().toUpperCase();
  return db.assets.find(a => a.ticker.toUpperCase() === t);
}

// ---------- kursy i notowania ----------
async function nbpRate(cur, date = today()) {
  const from = new Date(date + 'T12:00');
  from.setDate(from.getDate() - 10); // weekendy i święta — bierzemy ostatni opublikowany kurs
  const r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${cur.toLowerCase()}/${from.toLocaleDateString('sv-SE')}/${date}/?format=json`);
  if (!r.ok) throw new Error('NBP ' + r.status);
  const rates = (await r.json()).rates;
  const last = rates[rates.length - 1];
  return { rate: last.mid, date: last.effectiveDate };
}

// Notowania z TradingView — ich serwer pozwala na zapytania prosto z przeglądarki.
// Opcjonalny własny pośrednik (tools/kursy-worker.js) przyjmuje te same parametry.
const TV_URL = 'https://scanner.tradingview.com/symbol';
const normUrl = u => (/^https?:\/\//.test(u) ? u : 'https://' + u);

async function quote(symbol, base = db.settings.quotesUrl) {
  const u = new URL(base ? normUrl(base) : TV_URL);
  u.searchParams.set('symbol', symbol);
  u.searchParams.set('fields', 'close,currency,description,update_time');
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json().catch(() => null);
  if (j?.close > 0) return normQuote({ price: j.close, currency: j.currency, name: j.description, time: j.update_time });
  if (j?.code === 'symbol_not_exists') return null;
  throw new Error(r.ok ? 'nieznana odpowiedź' : 'HTTP ' + r.status);
}

// Ceny z Londynu bywają podawane w pensach.
function normQuote(q) {
  if (!q || !(q.price > 0)) return null;
  if (q.currency === 'GBp' || q.currency === 'GBX') return { ...q, price: q.price / 100, currency: 'GBP' };
  return { ...q, currency: (q.currency || '').toUpperCase() };
}

function symbolCandidates(ticker, cur) {
  const t = ticker.toUpperCase().replace(/[^A-Z0-9._]/g, '');
  if (!t) return [];
  const list = (EXCHANGES[cur] || []).map(x => `${x}:${t}`);
  if (cur === 'USD' || cur === 'EUR') list.push(`BITSTAMP:${t}${cur}`, `COINBASE:${t}${cur}`); // krypto
  return list;
}

// Szuka giełdy, na której walor jest notowany w swojej walucie.
async function resolveSymbol(ticker, cur) {
  for (const symbol of symbolCandidates(ticker, cur)) {
    const q = await quote(symbol);
    if (q && q.currency === cur) return { symbol, quote: q };
  }
  return null;
}

let refreshing = false;
let refreshMsg = '';
let quotesMsg = null; // wynik sprawdzenia serwera notowań w Ustawieniach: { text, cls }
async function refreshPrices() {
  if (refreshing) return;
  refreshing = true;
  refreshMsg = '';
  render();
  const held = portfolio().pos.filter(p => p.qty > 0);
  const errors = [];
  const curs = [...new Set(held.map(p => p.currency))].filter(c => c !== 'PLN');
  await Promise.all(curs.map(async c => {
    try { db.fx[c] = await nbpRate(c); } catch { errors.push('kurs ' + c); }
  }));
  let offline = false;
  await Promise.all(held.map(async p => {
    const a = assetById(p.id);
    try {
      let q = a.symbol ? await quote(a.symbol) : null;
      if (!q && !a.symbolManual) {
        const found = await resolveSymbol(a.ticker, a.currency);
        if (found) { a.symbol = found.symbol; q = found.quote; }
      }
      if (!q) { errors.push(`${a.ticker} (ustaw symbol w szczegółach)`); return; }
      if (q.currency !== a.currency) { errors.push(`${a.ticker} (notowany w ${q.currency})`); return; }
      a.price = q.price;
      a.priceDate = q.time ? new Date(q.time * 1000).toLocaleDateString('sv-SE') : today();
    } catch {
      offline = true;
    }
  }));
  if (offline) errors.push('notowania niedostępne — sprawdź internet');
  db.settings.lastRefresh = Date.now();
  refreshMsg = errors.length ? 'Nie udało się pobrać: ' + errors.join(', ') : '';
  refreshing = false;
  save();
}

function autoRefresh() {
  const held = db.trades.length && portfolio().pos.some(p => p.qty > 0);
  if (held && navigator.onLine !== false && Date.now() - db.settings.lastRefresh > 15 * 60 * 1000) refreshPrices();
}

// ---------- widoki ----------
const TITLES = { overview: 'Przegląd', accounts: 'Konta', invest: 'Giełda', settings: 'Ustawienia' };
let current = 'overview';
let investBroker = null; // filtr rachunku w zakładce Giełda

function render() {
  for (const v of Object.keys(TITLES)) $('#view-' + v).hidden = v !== current;
  $('#title').textContent = TITLES[current];
  $('#checkin').hidden = current === 'settings';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === current));
  ({ overview: renderOverview, accounts: renderAccounts, invest: renderInvest, settings: renderSettings })[current]();
}

function renderOverview() {
  const el = $('#view-overview');
  if (!db.accounts.length && !db.assets.length) {
    el.innerHTML = `
      <div class="card empty">
        <p><b>Witaj w Kasie!</b><br>Dodaj swoje konta oszczędnościowe i inwestycje, a co miesiąc wpisuj salda — zobaczysz, jak rośnie Twój majątek.</p>
        <div class="actions">
          <button class="btn primary" data-action="add-account">Dodaj konto</button>
          <button class="btn" data-action="add-trade">Dodaj zakup akcji</button>
        </div>
      </div>`;
    return;
  }
  const p = portfolio();
  const acc = accountsTotal();
  const total = acc + p.value;
  const hist = history();
  const prev = hist.length > 1 ? hist[hist.length - 2] : null;
  const diff = prev ? total - prev.total : null;

  const parts = [
    ...db.accounts.map(a => ({ name: a.name, value: latestBalance(a.id)?.amount || 0 })),
    ...db.brokers.map(b => ({ name: b.name, value: portfolio(undefined, undefined, undefined, b.id).value })),
  ].filter(x => x.value > 0).sort((a, b) => b.value - a.value);
  const max = Math.max(...parts.map(x => x.value), 1);

  el.innerHTML = `
    <div class="card hero">
      <div class="label">Majątek netto</div>
      <div class="big">${money(total)}</div>
      ${diff !== null ? `<div class="sub ${cls(diff)}">${signed(diff)} ${prev.total > 0 ? `(${pct(diff / prev.total)})` : ''} <span class="muted">vs ${monthName(prev.month)}</span></div>` : ''}
    </div>
    <div class="grid">
      <div class="stat"><div class="label">Konta</div><div class="val">${money(acc)}</div></div>
      <div class="stat"><div class="label">Giełda</div><div class="val">${money(p.value)}</div>
        <div class="sub ${cls(p.gain)}">${signed(p.gain)} · ${pct(p.gainPct)}</div></div>
    </div>
    ${hist.length > 1 ? `<div class="card chart"><h2>Historia majątku</h2>${chart(hist)}</div>` : ''}
    ${parts.length ? `<div class="card"><h2>Gdzie są pieniądze</h2>
      ${parts.map(x => `<div style="margin:10px 0">
        <div style="display:flex;justify-content:space-between;gap:10px"><span>${esc(x.name)}</span>
        <span class="num">${money(x.value)} <span class="muted">${total > 0 ? Math.round((x.value / total) * 100) + '%' : ''}</span></span></div>
        <div class="bar"><i style="width:${(x.value / max) * 100}%"></i></div></div>`).join('')}
    </div>` : ''}
    ${hist.length > 1 ? `<div class="list"><div class="head">Miesiące</div>
      ${hist.slice().reverse().map((h, i, arr) => {
        const d = arr[i + 1] ? h.total - arr[i + 1].total : null;
        return `<div class="row"><div class="main"><div class="title">${monthName(h.month)}</div>
          <div class="meta">konta ${money(h.accounts)} · giełda ${money(h.invest)}</div></div>
          <div class="right"><div>${money(h.total)}</div>${d !== null ? `<div class="meta ${cls(d)}">${signed(d)}</div>` : ''}</div></div>`;
      }).join('')}</div>` : ''}`;
}

function chart(hist) {
  const W = 340, H = 150, padL = 4, padR = 4, padT = 10, padB = 22;
  const vals = hist.map(h => h.total);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo;
  lo -= span * 0.1; hi += span * 0.1;
  const x = i => padL + (i * (W - padL - padR)) / (hist.length - 1);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = hist.map((h, i) => `${x(i).toFixed(1)},${y(h.total).toFixed(1)}`);
  const area = `M${pts[0]} L${pts.join(' L')} L${x(hist.length - 1)},${H - padB} L${x(0)},${H - padB} Z`;
  const last = hist.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Wykres majątku netto">
    <path d="${area}" fill="var(--accent-soft)"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${x(last)}" cy="${y(hist[last].total)}" r="4" fill="var(--accent)"/>
    <text class="axis" x="${padL}" y="${H - 6}">${monthLabel(hist[0].month)}</text>
    <text class="axis" x="${W - padR}" y="${H - 6}" text-anchor="end">${monthLabel(hist[last].month)}</text>
  </svg>`;
}

function renderAccounts() {
  const el = $('#view-accounts');
  const rows = db.accounts.map(a => {
    const b = latestBalance(a.id);
    const stale = b && b.month < thisMonth();
    return `<button class="row" data-action="account" data-id="${a.id}">
      <div class="main"><div class="title">${esc(a.name)}</div><div class="meta">${esc(a.type)}</div></div>
      <div class="right"><div>${b ? money(b.amount) : '—'}</div>
      <div class="meta">${b ? (stale ? '⚠︎ ' : '') + monthName(b.month) : 'brak salda'}</div></div></button>`;
  }).join('');
  el.innerHTML = `
    ${db.accounts.length ? `<div class="card hero"><div class="label">Razem na kontach</div><div class="big">${money(accountsTotal())}</div></div>
      <div class="list">${rows}</div>`
      : `<div class="card empty"><p>Nie masz jeszcze żadnych kont. Dodaj konto osobiste, oszczędnościowe, lokatę, obligacje…</p></div>`}
    <div class="actions"><button class="btn primary" data-action="add-account">+ Dodaj konto</button></div>`;
}

function priceStatus() {
  if (refreshing) return 'Pobieram kursy i notowania…';
  return db.settings.lastRefresh ? `Notowania z ${timeFmt.format(db.settings.lastRefresh)}` : 'Notowania jeszcze nie pobrane';
}

function renderInvest() {
  const el = $('#view-invest');
  if (investBroker && !db.brokers.some(b => b.id === investBroker)) investBroker = null;
  const p = portfolio(undefined, undefined, undefined, investBroker);
  const held = p.pos.filter(x => x.qty > 0).sort((a, b) => b.value - a.value);
  const closed = p.pos.filter(x => x.qty === 0);
  const inScope = x => !investBroker || x.brokerId === investBroker;
  const ops = [
    ...db.trades.filter(inScope).map(t => ({ ...t, op: 'trade' })),
    ...db.cash.filter(inScope).map(c => ({ ...c, op: 'cash' })),
  ].sort((a, b) => byDate(b, a)).slice(0, 30);
  const multi = db.brokers.length > 1;

  const posRow = x => {
    const foreign = x.currency !== 'PLN';
    const meta = x.qty
      ? `${qtyFmt.format(x.qty)} szt. · śr. ${foreign ? inCur(x.avgCur, x.currency) : money(x.avg)} · teraz ${inCur(x.price, x.currency)}`
      : `sprzedane · zysk ${signed(x.realized)}`;
    const where = multi && !investBroker && x.brokers.length ? ` · ${x.brokers.map(brokerName).map(esc).join(', ')}` : '';
    return `<button class="row" data-action="asset" data-id="${x.id}">
      <div class="main"><div class="title">${esc(x.ticker)}${x.name ? ` <span class="muted" style="font-weight:400">${esc(x.name)}</span>` : ''}</div>
        <div class="meta">${meta}${where}</div></div>
      <div class="right">${x.qty ? `<div>${money(x.value)}</div>
        <div class="meta ${cls(x.unrealized)}">${signed(x.unrealized)} · ${pct(x.cost ? x.unrealized / x.cost : 0)}</div>` : ''}</div></button>`;
  };

  const opRow = o => {
    const where = multi && !investBroker ? ` · ${esc(brokerName(o.brokerId))}` : '';
    if (o.op === 'trade') {
      const a = assetById(o.assetId);
      const total = tradeValue(o) + (o.type === 'buy' ? o.fee : -o.fee);
      return `<button class="row" data-action="edit-trade" data-id="${o.id}">
        <div class="main"><div class="title">${o.type === 'buy' ? 'Kupno' : 'Sprzedaż'} ${esc(a?.ticker)}</div>
        <div class="meta">${dateLabel(o.date)} · ${qtyFmt.format(o.qty)} × ${inCur(o.price, a?.currency || 'PLN')}${where}</div></div>
        <div class="right">${o.type === 'buy' ? '−' : '+'}${money(total)}</div></button>`;
    }
    return `<button class="row" data-action="edit-cash" data-id="${o.id}">
      <div class="main"><div class="title">${CASH_KINDS[o.kind]}</div>
      <div class="meta">${dateLabel(o.date)}${o.note ? ' · ' + esc(o.note) : ''}${where}</div></div>
      <div class="right ${o.kind === 'out' ? '' : 'pos'}">${o.kind === 'out' ? '−' : '+'}${money(o.amount)}</div></button>`;
  };

  const usedCurs = [...new Set(held.map(x => x.currency))].filter(c => c !== 'PLN');

  el.innerHTML = `
    ${multi ? `<div class="chips">
      <button class="chip ${investBroker ? '' : 'on'}" data-action="filter-broker" data-id="">Wszystkie</button>
      ${db.brokers.map(b => `<button class="chip ${investBroker === b.id ? 'on' : ''}" data-action="filter-broker" data-id="${b.id}">${esc(b.name)}</button>`).join('')}
    </div>` : ''}
    <div class="card hero">
      <div class="label">Wartość portfela${investBroker ? ' · ' + esc(brokerName(investBroker)) : ''}</div>
      <div class="big">${money(p.value)}</div>
      <div class="sub ${cls(p.gain)}">${signed(p.gain)} · ${pct(p.gainPct)} <span class="muted">łącznie</span></div>
    </div>
    <div class="status">
      <span>${priceStatus()}</span>
      ${db.trades.length ? `<button class="link" data-action="refresh" ${refreshing ? 'disabled' : ''}>Odśwież</button>` : ''}
    </div>
    ${refreshMsg ? `<p class="hint neg">${esc(refreshMsg)}</p>` : ''}
    <div class="grid">
      ${p.tracksCash
        ? `<div class="stat"><div class="label">Wpłacono netto</div><div class="val">${money(p.deposited)}</div></div>
           <div class="stat"><div class="label">Wolna gotówka</div><div class="val">${money(p.freeCash)}</div></div>`
        : `<div class="stat"><div class="label">Koszt zakupu</div><div class="val">${money(p.cost)}</div></div>
           <div class="stat"><div class="label">Wartość akcji</div><div class="val">${money(p.posValue)}</div></div>`}
      <div class="stat"><div class="label">Niezrealizowany zysk</div><div class="val ${cls(p.posValue - p.cost)}">${signed(p.posValue - p.cost)}</div></div>
      <div class="stat"><div class="label">Zrealizowany + dywidendy</div><div class="val ${cls(p.realized + p.income)}">${signed(p.realized + p.income)}</div></div>
    </div>
    <div class="actions">
      <button class="btn primary" data-action="add-trade">+ Transakcja</button>
      <button class="btn" data-action="add-cash">+ Wpłata / wypłata</button>
    </div>
    ${held.length ? `<div class="list"><div class="head">Posiadane</div>${held.map(posRow).join('')}</div>` : ''}
    ${usedCurs.length ? `<p class="hint">Kursy NBP: ${usedCurs.map(c => `1 ${c} = ${fxFmt.format(fxRate(c))} zł`).join(' · ')}</p>` : ''}
    ${closed.length ? `<div class="list"><div class="head">Zamknięte</div>${closed.map(posRow).join('')}</div>` : ''}
    ${ops.length ? `<div class="list"><div class="head">Ostatnie operacje</div>${ops.map(opRow).join('')}</div>` : ''}
    ${!p.tracksCash && db.trades.length ? `<p class="hint">Wskazówka: dodaj swoje wpłaty na rachunek maklerski, żeby widzieć, ile w sumie wpłaciłeś i ile gotówki czeka na rachunku.</p>` : ''}`;
}

function renderSettings() {
  const count = db.balances.length + db.trades.length + db.cash.length;
  $('#view-settings').innerHTML = `
    <div class="list">
      <div class="head">Rachunki maklerskie</div>
      ${db.brokers.map(b => `<button class="row" data-action="broker" data-id="${b.id}">
        <div class="main"><div class="title">${esc(b.name)}</div>
        <div class="meta">${db.trades.filter(t => t.brokerId === b.id).length} transakcji</div></div>
        <div class="right muted">›</div></button>`).join('') || '<div class="row muted">Brak — utworzysz go przy pierwszej transakcji.</div>'}
    </div>
    <div class="actions"><button class="btn" data-action="add-broker">+ Dodaj rachunek maklerski</button></div>

    <div class="card">
      <h2>Notowania</h2>
      <p class="hint" style="margin-bottom:10px">Ceny akcji pobierają się same z TradingView, a kursy walut z NBP — przy otwarciu aplikacji i przyciskiem „Odśwież”. Wysyłane są tylko symbole walorów, nigdy kwoty.</p>
      <p class="hint" style="margin-bottom:10px">Gdyby TradingView przestał odpowiadać, możesz postawić własny serwer pośredniczący (instrukcja w README) i wpisać tu jego adres. Zwykle pole zostaw puste.</p>
      <form id="quotes-form" style="display:flex;flex-direction:column;gap:10px">
        <label class="field"><span>Własny serwer notowań (opcjonalnie)</span>
          <input name="url" value="${esc(db.settings.quotesUrl)}" placeholder="puste = TradingView bezpośrednio" autocomplete="off" autocapitalize="off" inputmode="url"></label>
        <div class="actions"><button class="btn primary" type="submit">Zapisz i sprawdź</button></div>
        <p class="hint ${quotesMsg?.cls || ''}" id="quotes-msg">${esc(quotesMsg?.text || '')}</p>
      </form>
    </div>

    <div class="card">
      <h2>Kopia zapasowa</h2>
      <p class="hint" style="margin-bottom:12px">Dane są zapisane tylko na tym telefonie. Rób regularnie kopię (np. do iCloud Drive w aplikacji Pliki) — po usunięciu aplikacji z ekranu początkowego dane znikną.</p>
      <div class="actions">
        <button class="btn primary" data-action="export">Eksportuj kopię</button>
        <button class="btn" data-action="import">Wczytaj kopię</button>
      </div>
      <p class="hint" style="margin-top:10px">${db.accounts.length} kont · ${db.brokers.length} rachunków maklerskich · ${db.assets.length} walorów · ${count} wpisów</p>
    </div>
    <div class="card">
      <h2>Strefa niebezpieczna</h2>
      <div class="actions"><button class="btn danger" data-action="wipe">Usuń wszystkie dane</button></div>
    </div>
    <p class="hint" style="text-align:center">Kasa · dane tylko na tym telefonie</p>`;

  $('#quotes-form').onsubmit = async e => {
    e.preventDefault();
    const url = e.target.elements.url.value.trim();
    $('#quotes-msg').textContent = 'Sprawdzam…';
    try {
      const q = await quote('GPW:PKO', url);
      if (!q) throw new Error('brak danych');
      db.settings.quotesUrl = url;
      db.settings.lastRefresh = 0;
      quotesMsg = { text: `Działa! PKO BP: ${inCur(q.price, q.currency)}`, cls: 'pos' };
      save();
      refreshPrices();
    } catch (err) {
      quotesMsg = { text: `Nie udało się połączyć (${err.message}). Sprawdź adres.`, cls: 'neg' };
      render();
    }
  };
}

// ---------- okna dialogowe ----------
function modal(title, body, { submit = 'Zapisz', onSubmit, extra = '' } = {}) {
  const dlg = $('#modal');
  dlg.innerHTML = `<form novalidate>
    <header><h2>${esc(title)}</h2><button type="button" class="x" data-close aria-label="Zamknij">✕</button></header>
    <div class="body">${body}</div>
    <footer>${extra}${onSubmit ? `<button class="btn primary" type="submit">${submit}</button>` : ''}</footer></form>`;
  const form = $('form', dlg);
  form.onsubmit = e => {
    e.preventDefault();
    if (onSubmit(Object.fromEntries(new FormData(form)), form) !== false) dlg.close();
  };
  dlg.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => dlg.close()));
  if (!dlg.open) dlg.showModal();
  return form;
}
const closeModal = () => $('#modal').close();
const field = (label, input, attrs = '') => `<label class="field" ${attrs}><span>${label}</span>${input}</label>`;
const numInput = (name, value = '', extra = '') => `<input name="${name}" inputmode="decimal" autocomplete="off" value="${esc(value)}" ${extra}>`;
function need(form, name, ok, msg) {
  if (ok) return true;
  const input = form.elements[name];
  input.setCustomValidity(msg);
  input.reportValidity();
  input.oninput = () => input.setCustomValidity('');
  return false;
}

// Wybór rachunku maklerskiego, z opcją dodania nowego.
const DEFAULT_BROKER = '__default';
function brokerField(selected) {
  const opts = db.brokers.length
    ? db.brokers.map(b => `<option value="${b.id}" ${b.id === selected ? 'selected' : ''}>${esc(b.name)}</option>`).join('')
    : `<option value="${DEFAULT_BROKER}">Rachunek maklerski</option>`;
  return field('Rachunek maklerski', `<select name="broker">${opts}<option value="__new">+ Nowy rachunek…</option></select>`);
}
function bindBrokerField(form) {
  const sel = form.elements.broker;
  let prev = sel.value;
  sel.addEventListener('change', () => {
    if (sel.value !== '__new') { prev = sel.value; return; }
    const name = prompt('Nazwa rachunku (np. XTB, mBank eMakler, IKE w Bossa)')?.trim();
    if (!name) { sel.value = prev; return; }
    const b = { id: uid(), name };
    db.brokers.push(b);
    save();
    sel.querySelector(`option[value="${DEFAULT_BROKER}"]`)?.remove();
    sel.querySelector('option[value="__new"]').before(new Option(name, b.id));
    sel.value = prev = b.id;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function resolveBroker(value) {
  if (value !== DEFAULT_BROKER) return value;
  const b = { id: uid(), name: 'Rachunek maklerski' };
  db.brokers.push(b);
  return b.id;
}

function accountForm(acc) {
  const isNew = !acc;
  const b = acc && latestBalance(acc.id);
  const balances = acc ? db.balances.filter(x => x.accountId === acc.id).sort((a, b) => (a.month < b.month ? 1 : -1)) : [];
  const form = modal(isNew ? 'Nowe konto' : acc.name, `
    ${field('Nazwa', `<input name="name" value="${esc(acc?.name)}" placeholder="np. mBank oszczędnościowe" autocomplete="off">`)}
    ${field('Rodzaj', `<select name="type">${ACCOUNT_TYPES.map(t => `<option ${t === acc?.type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
    <div class="two">
      ${field('Saldo (zł)', numInput('amount', '', `placeholder="${b ? inputNum(b.amount) : '0,00'}"`))}
      ${field('Za miesiąc', `<input type="month" name="month" value="${thisMonth()}">`)}
    </div>
    ${balances.length ? `<div class="list"><div class="head">Historia sald</div>
      ${balances.map(x => `<div class="row"><div class="main">${monthName(x.month)}</div>
        <div class="right">${money(x.amount)}</div>
        <button type="button" class="x" data-del-balance="${x.id}" aria-label="Usuń">✕</button></div>`).join('')}</div>` : ''}`,
  {
    extra: isNew ? '' : `<button type="button" class="btn danger" data-del-account>Usuń konto</button>`,
    onSubmit: (d, f) => {
      if (!need(f, 'name', d.name.trim(), 'Podaj nazwę konta')) return false;
      const amount = parseNum(d.amount);
      if (!need(f, 'amount', d.amount.trim() === '' || !Number.isNaN(amount), 'Nieprawidłowa kwota')) return false;
      let a = acc;
      if (!a) { a = { id: uid() }; db.accounts.push(a); }
      a.name = d.name.trim();
      a.type = d.type;
      if (!Number.isNaN(amount)) setBalance(a.id, d.month || thisMonth(), amount);
      save();
    },
  });
  form.querySelectorAll('[data-del-balance]').forEach(btn => (btn.onclick = () => {
    db.balances = db.balances.filter(x => x.id !== btn.dataset.delBalance);
    save();
    accountForm(acc);
  }));
  const del = form.querySelector('[data-del-account]');
  if (del) del.onclick = () => {
    if (!confirm(`Usunąć konto „${acc.name}” razem z całą historią sald?`)) return;
    db.accounts = db.accounts.filter(x => x.id !== acc.id);
    db.balances = db.balances.filter(x => x.accountId !== acc.id);
    closeModal();
    save();
  };
}

function setBalance(accountId, month, amount) {
  const ex = db.balances.find(b => b.accountId === accountId && b.month === month);
  if (ex) ex.amount = amount;
  else db.balances.push({ id: uid(), accountId, month, amount });
}

function tradeForm(trade, preset = {}) {
  const asset = trade ? assetById(trade.assetId) : preset.asset;
  const type = trade?.type || 'buy';
  const brokerId = trade?.brokerId || preset.brokerId || investBroker || db.brokers[0]?.id;
  const cur0 = asset?.currency || 'PLN';
  const form = modal(trade ? 'Edytuj transakcję' : 'Nowa transakcja', `
    <div class="seg">
      <label><input type="radio" name="type" value="buy" ${type === 'buy' ? 'checked' : ''}><span>Kupno</span></label>
      <label><input type="radio" name="type" value="sell" ${type === 'sell' ? 'checked' : ''}><span>Sprzedaż</span></label>
    </div>
    ${brokerField(brokerId)}
    <div class="two">
      ${field('Ticker / symbol', `<input name="ticker" list="tickers" value="${esc(asset?.ticker)}" placeholder="np. PKO, VWCE" autocomplete="off" autocapitalize="characters">`)}
      ${field('Data', `<input type="date" name="date" value="${trade?.date || today()}" max="${today()}">`)}
    </div>
    <datalist id="tickers">${db.assets.map(a => `<option value="${esc(a.ticker)}">${esc(a.name)}</option>`).join('')}</datalist>
    <div class="two">
      ${field('Nazwa (opcjonalnie)', `<input name="name" value="${esc(asset?.name)}" placeholder="np. PKO BP" autocomplete="off">`)}
      ${field('Waluta', `<select name="currency" ${asset ? 'disabled' : ''}>${CURRENCIES.map(c => `<option ${c === cur0 ? 'selected' : ''}>${c}</option>`).join('')}</select>`)}
    </div>
    <div class="two">
      ${field('Ilość (szt.)', numInput('qty', inputNum(trade?.qty)))}
      ${field(`Cena za szt. (<span class="cur">${cur0}</span>)`, numInput('price', inputNum(trade?.price)))}
    </div>
    <div class="two">
      ${field(`Kurs <span class="cur">${cur0}</span>/PLN`, numInput('fx', cur0 !== 'PLN' ? inputNum(trade?.fx) : ''), 'id="fx-field"')}
      ${field('Prowizja (zł)', numInput('fee', inputNum(trade?.fee), 'placeholder="0"'))}
    </div>
    <p class="hint" id="fx-hint"></p>
    <div class="total muted" id="trade-total"></div>`,
  {
    extra: trade ? `<button type="button" class="btn danger" data-del>Usuń</button>` : '',
    onSubmit: (d, f) => {
      const qty = parseNum(d.qty), price = parseNum(d.price), fee = d.fee.trim() ? parseNum(d.fee) : 0;
      if (!need(f, 'ticker', d.ticker.trim(), 'Podaj symbol')) return false;
      if (!need(f, 'qty', qty > 0, 'Podaj ilość większą od zera')) return false;
      if (!need(f, 'price', price >= 0, 'Podaj cenę')) return false;
      let a = findAsset(d.ticker);
      const cur = a ? a.currency : d.currency;
      const fx = cur === 'PLN' ? 1 : parseNum(d.fx);
      if (!need(f, 'fx', fx > 0, 'Podaj kurs waluty')) return false;
      if (!need(f, 'fee', fee >= 0, 'Nieprawidłowa prowizja')) return false;
      const date = d.date || today();
      const broker = resolveBroker(d.broker);
      if (d.type === 'sell') {
        const owned = a ? sum(db.trades.filter(t => t.assetId === a.id && t.brokerId === broker && t.id !== trade?.id && t.date <= date), t => (t.type === 'buy' ? t.qty : -t.qty)) : 0;
        if (!need(f, 'qty', qty <= owned + 1e-9, `Na tym rachunku masz na ten dzień tylko ${qtyFmt.format(Math.max(owned, 0))} szt.`)) return false;
      }
      if (!a) {
        const ticker = d.ticker.trim().toUpperCase();
        a = { id: uid(), ticker, name: '', currency: cur, symbol: '', price, priceDate: date };
        db.assets.push(a);
      }
      if (d.name.trim()) a.name = d.name.trim();
      // Jeśli nie mamy nowszej ceny rynkowej, cena z transakcji jest najlepszym przybliżeniem.
      if (!a.priceDate || date >= a.priceDate) { a.price = price; a.priceDate = date; }
      const t = trade || { id: uid() };
      Object.assign(t, { assetId: a.id, brokerId: broker, date, type: d.type, qty, price, fx, fee });
      if (!trade) db.trades.push(t);
      pruneAssets();
      save();
      if (!a.symbol) refreshPrices();
    },
  });

  const el = form.elements;
  let fxTouched = !!(trade && cur0 !== 'PLN');
  const currency = () => findAsset(el.ticker.value)?.currency || el.currency.value;
  const upd = () => {
    const cur = currency();
    form.querySelectorAll('.cur').forEach(s => (s.textContent = cur));
    $('#fx-field', form).hidden = cur === 'PLN';
    const q = parseNum(el.qty.value), pr = parseNum(el.price.value);
    const fe = parseNum(el.fee.value) || 0;
    const fx = cur === 'PLN' ? 1 : parseNum(el.fx.value);
    const buy = el.type.value === 'buy';
    let txt = '';
    if (q > 0 && pr >= 0) {
      const gross = q * pr;
      txt = `${buy ? 'Zapłacisz' : 'Otrzymasz'} razem: `;
      txt += cur === 'PLN' ? money(buy ? gross + fe : gross - fe)
        : `${inCur(gross, cur)}${fx > 0 ? ` ≈ ${money(buy ? gross * fx + fe : gross * fx - fe)} z prowizją` : ''}`;
    }
    $('#trade-total', form).textContent = txt;
  };
  let fxReq = 0;
  const loadFx = async () => {
    const cur = currency();
    const hint = $('#fx-hint', form);
    if (cur === 'PLN') { hint.textContent = ''; return; }
    if (fxTouched) return;
    const req = ++fxReq;
    hint.textContent = 'Pobieram kurs NBP…';
    try {
      const r = await nbpRate(cur, el.date.value || today());
      if (req !== fxReq || fxTouched) return;
      el.fx.value = inputNum(r.rate);
      hint.textContent = `Kurs średni NBP z ${dateLabel(r.date)}. Popraw go, jeśli broker przeliczył po innym kursie.`;
      upd();
    } catch {
      if (req === fxReq) hint.textContent = 'Nie udało się pobrać kursu NBP — wpisz go ręcznie.';
    }
  };
  const syncAsset = () => {
    const a = findAsset(el.ticker.value);
    el.currency.disabled = !!a;
    if (a) {
      el.currency.value = a.currency;
      if (!el.name.value) el.name.value = a.name || '';
    }
    upd();
    loadFx();
  };
  form.addEventListener('input', upd);
  el.fx.addEventListener('input', () => (fxTouched = true));
  el.ticker.addEventListener('change', syncAsset);
  el.currency.addEventListener('change', () => { fxTouched = false; syncAsset(); });
  el.date.addEventListener('change', () => { if (!trade) fxTouched = false; loadFx(); });
  bindBrokerField(form);
  upd();
  if (!trade) loadFx();

  const del = form.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm('Usunąć tę transakcję?')) return;
    db.trades = db.trades.filter(x => x.id !== trade.id);
    pruneAssets();
    closeModal();
    save();
  };
}

// Walor bez żadnych transakcji nie ma sensu — usuwamy go.
function pruneAssets() {
  db.assets = db.assets.filter(a => db.trades.some(t => t.assetId === a.id));
}

function cashForm(entry) {
  const kind = entry?.kind || 'in';
  const form = modal(entry ? 'Edytuj operację' : 'Rachunek maklerski', `
    <div class="seg">
      ${Object.entries(CASH_KINDS).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${v.split(' ')[0]}</span></label>`).join('')}
    </div>
    ${brokerField(entry?.brokerId || investBroker || db.brokers[0]?.id)}
    <div class="two">
      ${field('Kwota (zł)', numInput('amount', inputNum(entry?.amount)))}
      ${field('Data', `<input type="date" name="date" value="${entry?.date || today()}">`)}
    </div>
    ${field('Notatka (opcjonalnie)', `<input name="note" value="${esc(entry?.note)}" placeholder="np. dywidenda PZU" autocomplete="off">`)}
    <p class="hint">Wpłata/wypłata — przelewy między Twoim kontem a rachunkiem maklerskim. Dywidenda — pieniądze, które pojawiły się na rachunku bez Twojej wpłaty. Kwoty w złotówkach.</p>`,
  {
    extra: entry ? `<button type="button" class="btn danger" data-del>Usuń</button>` : '',
    onSubmit: (d, f) => {
      const amount = parseNum(d.amount);
      if (!need(f, 'amount', amount > 0, 'Podaj kwotę większą od zera')) return false;
      const c = entry || { id: uid() };
      Object.assign(c, { kind: d.kind, brokerId: resolveBroker(d.broker), amount, date: d.date || today(), note: d.note.trim() });
      if (!entry) db.cash.push(c);
      save();
    },
  });
  bindBrokerField(form);
  const del = form.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm('Usunąć tę operację?')) return;
    db.cash = db.cash.filter(x => x.id !== entry.id);
    closeModal();
    save();
  };
}

function brokerForm(broker) {
  const used = broker && (db.trades.some(t => t.brokerId === broker.id) || db.cash.some(c => c.brokerId === broker.id));
  const form = modal(broker ? broker.name : 'Nowy rachunek maklerski', `
    ${field('Nazwa', `<input name="name" value="${esc(broker?.name)}" placeholder="np. XTB, mBank eMakler, IKE" autocomplete="off">`)}
    ${used ? '<p class="hint">Rachunek ma transakcje lub wpłaty — żeby go usunąć, najpierw usuń je.</p>' : ''}`,
  {
    extra: broker && !used ? `<button type="button" class="btn danger" data-del>Usuń</button>` : '',
    onSubmit: (d, f) => {
      if (!need(f, 'name', d.name.trim(), 'Podaj nazwę')) return false;
      if (broker) broker.name = d.name.trim();
      else db.brokers.push({ id: uid(), name: d.name.trim() });
      save();
    },
  });
  const del = form.querySelector('[data-del]');
  if (del) del.onclick = () => {
    db.brokers = db.brokers.filter(b => b.id !== broker.id);
    closeModal();
    save();
  };
}

function assetForm(asset) {
  const p = portfolio().pos.find(x => x.id === asset.id);
  const foreign = asset.currency !== 'PLN';
  const form = modal(asset.ticker, `
    ${asset.name ? `<p class="hint" style="margin-top:-6px">${esc(asset.name)} · ${asset.currency}</p>` : ''}
    <div class="grid">
      <div class="stat"><div class="label">Posiadasz</div><div class="val">${qtyFmt.format(p.qty)} szt.</div></div>
      <div class="stat"><div class="label">Wartość</div><div class="val">${money(p.value)}</div>
        ${foreign ? `<div class="sub muted">${inCur(p.qty * p.price, asset.currency)}</div>` : ''}</div>
      <div class="stat"><div class="label">Kupione za</div><div class="val">${money(p.cost)}</div>
        <div class="sub muted">śr. ${foreign ? inCur(p.avgCur, asset.currency) : money(p.avg)}/szt.</div></div>
      <div class="stat"><div class="label">Zysk</div><div class="val ${cls(p.unrealized)}">${signed(p.unrealized)}</div>
        <div class="sub ${cls(p.unrealized)}">${pct(p.cost ? p.unrealized / p.cost : 0)}</div></div>
    </div>
    ${foreign ? '<p class="hint">Zysk w złotówkach uwzględnia zmianę kursu waluty.</p>' : ''}
    ${p.realized ? `<p class="hint">Zrealizowany zysk ze sprzedaży: <b class="${cls(p.realized)}">${signed(p.realized)}</b></p>` : ''}
    <div class="two">
      ${field(`Aktualna cena (${asset.currency})`, numInput('price', inputNum(asset.price)))}
      ${field('Z dnia', `<input type="date" name="date" value="${asset.priceDate || today()}">`)}
    </div>
    <div class="inline">
      ${field('Symbol w TradingView', `<input name="symbol" value="${esc(asset.symbol)}" placeholder="ustalany automatycznie" autocomplete="off" autocapitalize="characters">`)}
      <button type="button" class="btn" data-check>Sprawdź</button>
    </div>
    <div id="symbol-msg" class="hint"></div>
    <div class="list"><div class="head">Transakcje</div>
      ${p.trades.slice().reverse().map(t => `<button type="button" class="row" data-trade="${t.id}">
        <div class="main"><div class="title">${t.type === 'buy' ? 'Kupno' : 'Sprzedaż'}</div>
        <div class="meta">${dateLabel(t.date)}${db.brokers.length > 1 ? ' · ' + esc(brokerName(t.brokerId)) : ''}</div></div>
        <div class="right">${qtyFmt.format(t.qty)} × ${inCur(t.price, asset.currency)}</div></button>`).join('')}
    </div>`,
  {
    extra: `<button type="button" class="btn" data-add>+ Transakcja</button>`,
    onSubmit: (d, f) => {
      const price = parseNum(d.price);
      if (!need(f, 'price', price >= 0, 'Podaj cenę')) return false;
      if (price !== asset.price) { asset.price = price; asset.priceDate = d.date || today(); }
      const symbol = d.symbol.trim().toUpperCase();
      if (symbol !== asset.symbol) { asset.symbol = symbol; asset.symbolManual = !!symbol; }
      save();
    },
  });
  const msg = $('#symbol-msg', form);
  form.querySelector('[data-check]').onclick = async () => {
    const input = form.elements.symbol;
    const typed = input.value.trim().toUpperCase();
    msg.textContent = 'Sprawdzam…';
    try {
      let symbol = typed, q = null;
      if (typed.includes(':')) q = await quote(typed);
      else {
        const found = await resolveSymbol(typed || asset.ticker, asset.currency);
        if (found) ({ symbol, quote: q } = found);
      }
      if (!q) {
        msg.innerHTML = `Nie znaleziono notowań. Wpisz symbol w formacie <b>GIEŁDA:TICKER</b>, tak jak na tradingview.com — np. GPW:PKO, XETR:VWCE, NASDAQ:AAPL, BITSTAMP:BTCUSD.`;
        return;
      }
      input.value = symbol;
      const ok = q.currency === asset.currency;
      msg.innerHTML = `<b>${esc(symbol)}</b>${q.name ? ' — ' + esc(q.name) : ''}: ${inCur(q.price, q.currency)}`
        + (ok ? '' : `<br><span class="neg">Ten symbol jest notowany w ${esc(q.currency)}, a walor w ${asset.currency} — wybierz notowanie w ${asset.currency}.</span>`);
      if (ok) {
        form.elements.price.value = inputNum(q.price);
        form.elements.date.value = q.time ? new Date(q.time * 1000).toLocaleDateString('sv-SE') : today();
      }
    } catch (err) {
      msg.textContent = `Notowania niedostępne (${err.message}). Sprawdź internet.`;
    }
  };
  form.querySelectorAll('[data-trade]').forEach(b => (b.onclick = () => tradeForm(db.trades.find(t => t.id === b.dataset.trade))));
  form.querySelector('[data-add]').onclick = () => tradeForm(null, { asset });
}

// Comiesięczne podsumowanie: salda wszystkich kont + aktualne ceny walorów i kursy walut w jednym formularzu.
function checkinForm(month = thisMonth()) {
  const isNow = month === thisMonth();
  const held = portfolio(monthEnd(month)).pos.filter(p => p.qty > 0);
  const curs = [...new Set(held.map(p => p.currency))].filter(c => c !== 'PLN');
  const snap = db.snapshots.find(s => s.month === month);
  const form = modal('Podsumowanie miesiąca', `
    ${field('Miesiąc', `<input type="month" name="month" value="${month}" max="${thisMonth()}">`)}
    ${db.accounts.length ? `<div class="list"><div class="head">Salda kont</div>
      ${db.accounts.map(a => {
        const cur = db.balances.find(b => b.accountId === a.id && b.month === month);
        const last = latestBalance(a.id, month);
        return `<div class="row"><div class="main"><div class="title">${esc(a.name)}</div>
          <div class="meta">${last ? `ostatnio ${money(last.amount)} (${monthName(last.month)})` : 'brak danych'}</div></div>
          <div style="width:42%">${numInput('acc_' + a.id, cur ? inputNum(cur.amount) : '', `placeholder="${last ? inputNum(last.amount) : 'kwota'}" class="mini"`)}</div></div>`;
      }).join('')}</div>` : '<p class="hint">Nie masz jeszcze żadnych kont.</p>'}
    ${held.length ? `<div class="list"><div class="head">Ceny akcji ${isNow ? '(dziś)' : 'na koniec miesiąca'}</div>
      ${held.map(p => `<div class="row"><div class="main"><div class="title">${esc(p.ticker)}</div>
        <div class="meta">${qtyFmt.format(p.qty)} szt. · cena w ${p.currency}</div></div>
        <div style="width:42%">${numInput('px_' + p.id, isNow ? inputNum(p.price) : '', `placeholder="${inputNum(p.price)}" class="mini"`)}</div></div>`).join('')}</div>` : ''}
    ${curs.length ? `<div class="list"><div class="head">Kursy walut</div>
      ${curs.map(c => `<div class="row"><div class="main"><div class="title">1 ${c}</div><div class="meta">w złotówkach</div></div>
        <div style="width:42%">${numInput('fx_' + c, isNow ? inputNum(fxRate(c)) : '', `placeholder="${inputNum(fxRate(c))}" class="mini"`)}</div></div>`).join('')}</div>` : ''}
    <p class="hint">Puste pola zostaną uzupełnione ostatnią znaną wartością.${isNow && held.length ? ' Ceny i kursy podpowiadają się z ostatniego pobrania notowań.' : ''}${snap ? ` Ten miesiąc ma już zapisaną wartość portfela: ${money(snap.value)}.` : ''}</p>`,
  {
    onSubmit: d => {
      const m = d.month || month;
      for (const a of db.accounts) {
        const raw = d['acc_' + a.id] ?? '';
        let v = parseNum(raw);
        if (Number.isNaN(v)) {
          if (raw.trim()) continue;
          v = latestBalance(a.id, m)?.amount;
          if (v === undefined) continue;
        }
        setBalance(a.id, m, v);
      }
      const now = m === thisMonth();
      const fxs = {};
      for (const c of curs) {
        const v = parseNum(d['fx_' + c]);
        fxs[c] = v > 0 ? v : fxRate(c);
        if (now && v > 0 && v !== db.fx[c]?.rate) db.fx[c] = { rate: v, date: today() };
      }
      const prices = {};
      for (const p of held) {
        const v = parseNum(d['px_' + p.id]);
        prices[p.id] = Number.isNaN(v) ? p.price : v;
        const a = assetById(p.id);
        if (now && !Number.isNaN(v) && v !== a.price) { a.price = v; a.priceDate = today(); }
      }
      if (db.assets.length) {
        const pf = portfolio(now ? today() : monthEnd(m), prices, fxs);
        db.snapshots = db.snapshots.filter(s => s.month !== m);
        db.snapshots.push({ month: m, value: pf.value, deposited: pf.base });
      }
      save();
    },
  });
  form.elements.month.onchange = e => { if (e.target.value && e.target.value !== month) checkinForm(e.target.value); };
}

// ---------- kopia zapasowa ----------
async function exportData() {
  const json = JSON.stringify(db, null, 2);
  const name = `kasa-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.onchange = async () => {
    try {
      const d = JSON.parse(await input.files[0].text());
      if (!d || !Array.isArray(d.accounts) || !Array.isArray(d.trades)) throw new Error();
      if (!confirm('Zastąpić obecne dane danymi z kopii?')) return;
      db = migrate(d);
      save();
      alert('Kopia wczytana.');
    } catch {
      alert('To nie jest prawidłowy plik kopii Kasy.');
    }
  };
  input.click();
}

// ---------- zdarzenia ----------
const ACTIONS = {
  checkin: () => checkinForm(),
  'add-account': () => accountForm(),
  account: id => accountForm(db.accounts.find(a => a.id === id)),
  'add-trade': () => tradeForm(),
  'edit-trade': id => tradeForm(db.trades.find(t => t.id === id)),
  'add-cash': () => cashForm(),
  'edit-cash': id => cashForm(db.cash.find(c => c.id === id)),
  asset: id => assetForm(assetById(id)),
  'add-broker': () => brokerForm(),
  broker: id => brokerForm(db.brokers.find(b => b.id === id)),
  'filter-broker': id => { investBroker = id || null; render(); },
  refresh: () => refreshPrices(),
  export: exportData,
  import: importData,
  wipe: () => {
    if (!confirm('Na pewno usunąć WSZYSTKIE dane? Tego nie da się cofnąć.')) return;
    db = blank();
    save();
  },
};

document.addEventListener('click', e => {
  const tab = e.target.closest('.tabs button');
  if (tab) { current = tab.dataset.view; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el.dataset.id);
});
// Kliknięcie w tło zamyka okno.
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoRefresh(); });

navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
render();
autoRefresh();
