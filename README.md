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

Podgląd na komputerze: `python3 -m http.server 8080` w tym katalogu, potem http://localhost:8080
(port 8000 zajmuje lokalny kontener DynamoDB).

## Na komputerze (Ubuntu)

Otwórz ten sam adres `https://<login>.github.io/<repo>/` w **Chrome** i kliknij ikonę instalacji po prawej stronie
paska adresu (albo menu ⋮ → „Przesyłaj, zapisz i udostępnij” → „Zainstaluj stronę jako aplikację”). Kasa pojawi
się w menu aplikacji Ubuntu i otworzy się we własnym oknie. Firefox nie potrafi instalować takich aplikacji.

## Synchronizacja telefon ↔ komputer

Dane są szyfrowane na urządzeniu (AES-256, klucz z Twojego hasła) i zapisywane w prywatnym Gist na Twoim
GitHubie. GitHub przechowuje tylko zaszyfrowane bajty.

1. Utwórz token: https://github.com/settings/tokens/new?scopes=gist&description=Kasa — zaznaczony tylko
   zakres `gist`, ważność wg uznania (po wygaśnięciu trzeba wkleić nowy).
2. Na pierwszym urządzeniu: Ustawienia → Synchronizacja → wklej token, wymyśl hasło szyfrowania → Połącz.
3. Na drugim urządzeniu to samo: **ten sam token i to samo hasło**. Dane z obu urządzeń się połączą.

Synchronizacja dzieje się sama: przy otwarciu aplikacji, po każdej zmianie i przy przejściu aplikacji w tło.
Zmiany zrobione offline na obu urządzeniach scalają się rekord po rekordzie (wygrywa nowsza zmiana,
usunięte wpisy nie wracają). Hasła nie da się odzyskać — zapisz je w menedżerze haseł.

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

Wystarczy `git push`. GitHub Pages publikuje zmiany po ok. minucie, a iPhone pobiera nową wersję przy
następnym uruchomieniu aplikacji z internetem. Jeśli aplikacja wisiała w tle, zamknij ją w przełączniku
aplikacji (przesuń w górę) i otwórz ponownie. Dane na telefonie zostają nietknięte.

`CACHE` w `sw.js` zmieniaj tylko przy dodaniu lub usunięciu plików z listy `FILES`.

## Kopia zapasowa

Ustawienia → Eksportuj kopię → „Zachowaj w Plikach” (iCloud Drive). Dane z aplikacji na ekranie
początkowym są osobne od danych w Safari, a po usunięciu ikony znikają — chyba że masz włączoną
synchronizację, wtedy po ponownym dodaniu aplikacji wystarczy połączyć ją znowu.
