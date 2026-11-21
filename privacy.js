"use strict";
// Страница политики конфиденциальности (по-польски): нужна Meta для публикации приложения.
const cfg = require("./config");

function page() {
  const name = cfg.businessName;
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Polityka prywatności – ${name}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:32px auto;padding:0 16px;line-height:1.6;color:#222}h1{color:#5b21b6}h2{margin-top:28px;color:#6d28d9}</style></head><body>
<h1>Polityka prywatności</h1>
<p>Ostatnia aktualizacja: 21 listopada 2026. Niniejsza polityka dotyczy asystenta rezerwacji w Messengerze, który obsługuje stronę „${name}” na Facebooku.</p>
<h2>1. Administrator danych</h2>
<p>Administratorem danych jest właściciel strony „${name}” na Facebooku. Kontakt: wiadomość na Messengerze do strony „${name}”.</p>
<h2>2. Jakie dane zbieramy</h2>
<p>Przetwarzamy wyłącznie dane potrzebne do rezerwacji wizyty: identyfikator rozmowy w Messengerze (nadawany przez Facebooka), treść wiadomości w rozmowie z asystentem, wybraną usługę, termin wizyty oraz imię i numer telefonu, które sam(a) podajesz podczas rezerwacji.</p>
<h2>3. Cel i podstawa przetwarzania</h2>
<p>Dane wykorzystujemy do przyjęcia i obsługi rezerwacji oraz kontaktu w sprawie wizyty (art. 6 ust. 1 lit. b RODO – podjęcie działań przed zawarciem umowy i jej wykonanie) oraz do wewnętrznej organizacji pracy (art. 6 ust. 1 lit. f RODO).</p>
<h2>4. Komu przekazujemy dane</h2>
<p>Dane nie są sprzedawane ani udostępniane w celach reklamowych. Korzystamy z usług: Meta Platforms (Messenger), Google (kalendarz rezerwacji) oraz Render (hosting asystenta), które przetwarzają dane w naszym imieniu.</p>
<h2>5. Jak długo przechowujemy dane</h2>
<p>Dane rezerwacji przechowujemy do czasu odbycia wizyty i przez okres niezbędny do rozliczeń lub dochodzenia roszczeń, a następnie je usuwamy.</p>
<h2>6. Twoje prawa</h2>
<p>Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu oraz przenoszenia danych, a także prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych. Aby skorzystać z tych praw, napisz do nas na Messengerze.</p>
<h2>7. Usunięcie danych</h2>
<p>Aby usunąć swoje dane, napisz do strony „${name}” na Messengerze z prośbą o usunięcie danych. Dane zostaną usunięte niezwłocznie, najpóźniej w ciągu 30 dni.</p>
<h2>8. Pliki cookies</h2>
<p>Asystent w Messengerze nie używa plików cookies na własnych serwerach.</p>
</body></html>`;
}

module.exports = (app) => {
  app.get(["/privacy", "/polityka-prywatnosci"], (_req, res) => res.type("html").send(page()));
};
