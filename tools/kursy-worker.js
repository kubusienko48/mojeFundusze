// Cloudflare Worker — zapasowy pośrednik notowań dla aplikacji Kasa.
// Potrzebny tylko wtedy, gdy TradingView przestanie odpowiadać na zapytania prosto z przeglądarki.
// Przekazuje parametry bez zmian:  ?symbol=GPW:PKO&fields=close,currency  →  {"close":113.72,"currency":"PLN"}

export default {
  async fetch(request) {
    const target = new URL('https://scanner.tradingview.com/symbol');
    target.search = new URL(request.url).search;
    const r = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0', Origin: 'https://www.tradingview.com' },
    });
    return new Response(r.body, {
      status: r.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'max-age=300',
      },
    });
  },
};
