// Всё, что относится к конкретному бизнесу, меняется ТОЛЬКО здесь.
// Для нового клиента копируете проект и правите этот файл (и пересобираете картинки: tools/make_images.py).
module.exports = {
  businessName: "Manicure Test",
  greeting: "Cześć! 👋 Jestem asystentem salonu „Manicure Test”. W czym mogę pomóc?",
  address: "ul. Przykładowa 1 (wpisz prawdziwy adres)",
  hours: "Pon–Sob 10:00–19:00, niedziela nieczynne",
  phone: "+48 000 000 000",

  // ----- Первое впечатление -----
  // Короткая подпись под названием в карточке меню (до 80 символов)
  tagline: "Manicure, pedicure, lakier hybrydowy. Rezerwacja online w minutę",
  // Текст на стартовом экране чата (до 160 символов)
  profileGreeting: "Cześć! Tutaj zapiszesz się online na manicure, sprawdzisz ceny i zobaczysz prace mistrza. Kliknij „Rozpocznij”.",
  // Ссылка на портфолио мастера (Facebook, Instagram или любой сайт, только https)
  portfolioUrl: "https://www.facebook.com/profile.php?id=61596355940206&sk=photos",
  // Публичный адрес бота (нужен для картинок). На Render подставляется сам, это запасной вариант.
  publicUrl: "https://manicure-bot-p4xm.onrender.com",

  // Услуги: duration — длительность в минутах (по ней считаются свободные окна)
  services: [
    { name: "Manicure", price: "od 100 zł", duration: 60 },
    { name: "Pedicure", price: "od 150 zł", duration: 60 },
    { name: "Lakier hybrydowy", price: "od 120 zł", duration: 60 },
    { name: "Przedłużanie paznokci", price: "od 200 zł", duration: 60 }
  ],

  // ----- Календарь -----
  timezone: "Europe/Warsaw",
  // Рабочие часы по дням недели: 0 = воскресенье ... 6 = суббота. [начало, конец] в часах, null = выходной
  workHours: { 0: null, 1: [10, 19], 2: [10, 19], 3: [10, 19], 4: [10, 19], 5: [10, 19], 6: [10, 19] },
  slotStepMinutes: 60,   // как часто начинаются записи (60 = 10:00, 11:00 ...; 30 = каждые полчаса)
  daysAhead: 60,         // на сколько дней вперёд можно записаться (максимум 90)
  minLeadHours: 2        // раньше чем через сколько часов нельзя записаться
};
