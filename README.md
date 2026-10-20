# Kasa — mój majątek

Aplikacja webowa (PWA) na iPhone'a do śledzenia majątku: salda kont co miesiąc + portfel giełdowy.
Bez serwera i bez kont: dane są tylko w pamięci telefonu (localStorage).

## Uruchomienie na iPhonie

Safari instaluje PWA tylko z adresu **https**, więc pliki trzeba gdzieś opublikować, np. na GitHub Pages:

1. Utwórz repozytorium na GitHubie i wrzuć do niego zawartość tego katalogu.
2. Settings → Pages → Source: „Deploy from a branch”, gałąź `main`, katalog `/ (root)`.
3. Na iPhonie otwórz w Safari adres `https://<login>.github.io/<repo>/`.
4. Udostępnij → **Do ekranu początkowego**.

Strona jest publiczna, ale same dane finansowe nigdy nie opuszczają telefonu.

Podgląd na komputerze: `python3 -m http.server` w tym katalogu, potem http://localhost:8000.

## Notowania

Ceny akcji, ETF-ów i krypto aplikacja pobiera sama z TradingView, a kursy walut z API NBP — przy otwarciu
(nie częściej niż co 15 minut) i przyciskiem „Odśwież” w zakładce Giełda. Wysyłane są tylko symbole
walorów, nigdy ilości ani kwoty.

Giełdę aplikacja ustala sama na podstawie tickera i waluty: PLN → GPW, EUR → Xetra/Euronext/Mediolan/Madryt,
USD → NASDAQ/NYSE/AMEX (albo krypto na Bitstamp/Coinbase), GBP → Londyn, CHF → SIX. Jeśli trafi źle
albo nie znajdzie, wpisz symbol w szczegółach waloru w formacie `GIEŁDA:TICKER`, tak jak na
tradingview.com, np. `GPW:PKO`, `XETR:VWCE`, `NASDAQ:AAPL`, `BITSTAMP:BTCUSD`. Krypto prowadź w USD lub EUR.

### Zapasowy serwer notowań (zwykle niepotrzebny)

To nieoficjalne źródło. Jeśli TradingView kiedyś zablokuje zapytania z przeglądarki, postaw darmowy
Cloudflare Worker z pliku [tools/kursy-worker.js](tools/kursy-worker.js) (dash.cloudflare.com → Workers & Pages →
Create Worker → wklej kod → Deploy) i wpisz jego adres w Ustawienia → Notowania.

## Waluty i rachunki maklerskie

- Walor ma swoją walutę. Przy transakcji wpisujesz cenę w tej walucie i kurs (podpowiadany kurs średni NBP
  z dnia transakcji — popraw go na kurs brokera, jeśli chcesz dokładnie). Prowizje, wpłaty i dywidendy są w zł.
- Zysk w złotówkach uwzględnia zmianę kursu waluty.
- Każda transakcja i wpłata należy do rachunku maklerskiego (np. XTB, IKE). W zakładce Giełda można
  filtrować po rachunku; średnia cena zakupu liczona jest osobno dla każdego rachunku.

## Aktualizacja

Po zmianie plików podbij `CACHE` w `sw.js` (np. `kasa-v2`), żeby telefon pobrał nową wersję.

## Kopia zapasowa

Ustawienia → Eksportuj kopię → „Zachowaj w Plikach” (iCloud Drive). Dane z aplikacji na ekranie
początkowym są osobne od danych w Safari, a po usunięciu ikony znikają.
