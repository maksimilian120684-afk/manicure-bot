"use strict";
// Все фразы бота на польском. Чтобы поменять язык или тон, правится только этот файл.
const DAYS_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];
const DAYS_LONG = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const MONTHS_GEN = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
const pad = (n) => String(n).padStart(2, "0");

function parts(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return { y, m, d, wd };
}

module.exports = {
  DAYS_SHORT, DAYS_LONG, MONTHS_GEN,
  // "wt 25.11"
  dayShort(dateKey) { const p = parts(dateKey); return `${DAYS_SHORT[p.wd].toLowerCase()} ${pad(p.d)}.${pad(p.m)}`; },
  // "wtorek, 25 listopada"
  dayLong(dateKey) { const p = parts(dateKey); return `${DAYS_LONG[p.wd]}, ${p.d} ${MONTHS_GEN[p.m - 1]}`; },

  btn: {
    book: "💅 Zapisz się",
    portfolio: "📸 Prace mistrza",
    prices: "💰 Usługi i ceny",
    info: "📍 Adres i godziny",
    menu: "🏠 Menu",
    choose: "✨ Wybieram",
    book2: "✨ Zapisz się",
    openCalendar: "📅 Otwórz kalendarz",
    changeService: "↩ Zmień usługę",
    confirm: "✅ Potwierdzam",
    changeDate: "📅 Zmień termin",
    cancel: "❌ Anuluj",
    map: "🗺 Pokaż na mapie",
    call: "📞 Zadzwoń",
    seeWorks: "📸 Zobacz prace"
  },

  welcomeGeneric: "Cześć! 👋 W czym mogę pomóc?",
  pickOne: "Wybierz proszę jedną z opcji poniżej 👇",
  portfolioSoon: "Prace mistrza pojawią się tutaj już wkrótce 💅",
  portfolioText: "Zobacz prace mistrza na naszej stronie",
  pricesIntro: "💰 Nasze usługi i ceny. Wybierz usługę, aby od razu zarezerwować termin:",
  bookIntro: "💅 Na jaką usługę chcesz się zapisać?",
  askDateManual: "Na jaki dzień chcesz się zapisać? (np. jutro albo 20 listopada)",
  askTimeManual: "O której godzinie? (np. 15:00)",
  askContact: "👤 Podaj proszę swoje imię i numer telefonu (np. Anna, 600 123 456).",
  calendarFail: "Nie udało się wczytać grafiku 😔 Napisz proszę, na jaki dzień chcesz się zapisać (np. jutro albo 20 listopada).",
  noSlots: (phone) => `Niestety w najbliższych dniach nie ma wolnych terminów 😔 Zadzwoń do nas: ${phone}`,
  cancelled: "Rezerwacja anulowana. Gdy zmienisz zdanie, kliknij „Zapisz się” 💅",
  tapConfirm: "Kliknij „Potwierdzam” albo „Anuluj” 👇",
  slotTaken: "Niestety ten termin został właśnie zajęty 😔 Wybierz inny:",
  saveFail: (phone) => `Nie udało się zapisać rezerwacji. Zadzwoń proszę: ${phone}`,
  success: "Do zobaczenia! Jeśli plany się zmienią, napisz do nas wcześniej 💖",
  ownerNew: (d) => `🔔 Nowa rezerwacja: ${d.service}, ${d.date} ${d.time}, ${d.contact}`,

  calendarTitle: "📅 Wybierz termin",
  calendarSub: (svc) => `${svc.name} • ${svc.duration} min • ${svc.price}`,
  selected: (d) => `✅ Wybrany termin: ${d.date}, ${d.time}`,
  confirmTitle: "✅ Sprawdź rezerwację",
  confirmSub: (d) => `${d.service}\n📅 ${d.shortDate}, ${d.time} • 👤 ${(d.contact || "").slice(0, 22)}`,
  successTitle: "🎉 Rezerwacja potwierdzona!",
  successSub: (d) => `${d.service} • ${d.shortDate}, ${d.time}`,
  // подпись плашки ограничена 80 символами: сначала часы работы, адрес сокращается при необходимости
  infoSub: (cfg) => {
    const hours = `🕒 ${cfg.hours}`;
    const room = Math.max(10, 79 - hours.length);
    let addr = `📍 ${cfg.address}`;
    if (addr.length > room) addr = addr.slice(0, room - 1).trimEnd() + "…";
    return `${addr}\n${hours}`;
  },

  // legacy fallback, gdy nie ma kalendarza w oknie przeglądarki
  chooseDay: "📅 Wybierz dogodny dzień:",
  chooseTime: (label) => `${label}: wybierz godzinę 🕒`,
  moreTimes: "Więcej godzin ▶",
  otherDay: "Inny dzień"
};
