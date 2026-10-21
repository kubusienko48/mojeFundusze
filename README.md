# Kasa — mój majątek

Aplikacja webowa (PWA) na iPhone'a i komputer do śledzenia majątku: salda kont co miesiąc + portfel giełdowy.
Bez własnego serwera: dane są w pamięci urządzenia, opcjonalnie synchronizowane w postaci zaszyfrowanej
(patrz „Synchronizacja”).

## Instalacja na iPhonie

Safari instaluje aplikację tylko ze strony z adresem **https**, więc najpierw trzeba ją opublikować.
Najprościej za darmo na GitHub Pages.

### 1. Publikacja na GitHub Pages (raz, na komputerze)

1. Na https://github.com/new utwórz repozytorium, np. `kasa`. Musi być **publiczne** (darmowe GitHub Pages
   działa tylko z publicznymi). Publiczny jest tylko kod — Twoje dane nigdy do repozytorium nie trafiają.
   Nie zaznaczaj „Add a README”.
2. W terminalu, w tym katalogu (zamiast `<login>` wpisz swój login z GitHuba):
   ```
   git init -b main
   git add .
   git commit -m "Kasa"
   git remote add origin https://github.com/<login>/kasa.git
   git push -u origin main
   ```
   Przy `git push` GitHub poprosi o login i zamiast hasła o token
   (https://github.com/settings/tokens/new — zakres `repo`), chyba że masz już skonfigurowany klucz SSH.
3. W repozytorium na GitHubie: **Settings → Pages** → Source: „Deploy from a branch” → gałąź `main`,
   folder `/ (root)` → **Save**.
4. Po 1–2 minutach na górze tej strony pojawi się adres, np. `https://<login>.github.io/kasa/`.
   Otwórz go na komputerze i sprawdź, czy aplikacja się ładuje.

### 2. Dodanie do ekranu początkowego (na iPhonie)

1. Otwórz adres `https://<login>.github.io/kasa/` w **Safari** (nie w Chrome ani w aplikacji GitHuba).
2. Stuknij przycisk **Udostępnij** (kwadrat ze strzałką w górę; w nowszych iOS czasem schowany pod `•••`
   na pasku adresu).
3. Przewiń w dół i wybierz **Do ekranu początkowego**.
4. Jeśli widzisz przełącznik **„Otwórz jako aplikację internetową”**, zostaw go włączonego.
   Stuknij **Dodaj**.
5. Uruchamiaj Kasę zawsze **z ikony na ekranie początkowym**, nie z Safari. Ikona i Safari mają osobne
   dane — to, co wpiszesz w Safari, nie pojawi się w aplikacji z ikony.

Przy pierwszym uruchomieniu potrzebny jest internet, potem aplikacja działa też offline
(bez internetu nie pobierze tylko notowań, kursów i synchronizacji).

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
