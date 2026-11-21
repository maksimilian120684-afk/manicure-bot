"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cfg = require("./config");
const cal = require("./calendar");
const T = require("./texts");
const { renderCalendar } = require("./calendar-image");
const pad2 = (n) => String(n).padStart(2, "0");

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const OWNER_PSID = process.env.OWNER_PSID; // необязательно: куда присылать новые записи
const PORT = process.env.PORT || 3000;
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
require("./privacy")(app); require("./portfolio")(app); // политика конфиденциальности

// ---------- отправка сообщений ----------
const API = "https://graph.facebook.com/v21.0/me";
const GRAPH = API + "/messages";
const baseUrl = () => (process.env.RENDER_EXTERNAL_URL || cfg.publicUrl || "").replace(/\/$/, "");
const img = (name) => (baseUrl() ? `${baseUrl()}/img/${name}` : undefined);

function qrs(list) {
  return (list || []).slice(0, 13).map((q) => ({
    content_type: "text",
    title: q.title.slice(0, 20),
    payload: q.payload
  }));
}

async function sendRaw(psid, message) {
  const res = await fetch(`${GRAPH}?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message })
  });
  if (!res.ok) console.error("Send API error:", res.status, await res.text());
  return res.ok;
}

async function send(psid, text, quickReplies) {
  const message = { text };
  if (quickReplies && quickReplies.length) message.quick_replies = qrs(quickReplies);
  return sendRaw(psid, message);
}

// Карточки: одна или несколько плашек с картинкой, заголовком, подписью и кнопками
function card(image, title, subtitle, buttons) {
  const el = { title: title.slice(0, 80), buttons: buttons.slice(0, 3) };
  if (subtitle) el.subtitle = subtitle.slice(0, 80);
  if (image) el.image_url = image;
  return el;
}
async function sendCards(psid, elements, quick) {
  const message = { attachment: { type: "template", payload: { template_type: "generic", elements: elements.slice(0, 10) } } };
  if (quick && quick.length) message.quick_replies = qrs(quick);
  return sendRaw(psid, message);
}

const pb = (title, payload) => ({ type: "postback", title: title.slice(0, 20), payload });
const MENU = [
  { title: T.btn.book, payload: "BOOK" },
  { title: T.btn.portfolio, payload: "PORTFOLIO" },
  { title: T.btn.prices, payload: "PRICES" },
  { title: T.btn.info, payload: "INFO" }
];
const menuExcept = (p) => MENU.filter((m) => m.payload !== p);

// Главная карточка
async function sendMenu(psid) {
  const buttons = [
    pb(T.btn.book, "BOOK"),
    cfg.portfolioUrl ? { type: "web_url", url: cfg.portfolioUrl, title: T.btn.portfolio } : pb(T.btn.prices, "PRICES"),
    pb(T.btn.prices, "PRICES")
  ];
  const ok = await sendCards(psid, [card(img("cover.jpg"), cfg.businessName, cfg.tagline, buttons)], [{ title: T.btn.info, payload: "INFO" }]);
  if (!ok) return send(psid, cfg.greeting, MENU); // запасной вариант: обычное меню кнопками
}

// Каталог услуг: красивая плашка на каждую услугу
async function sendServices(psid) {
  const els = cfg.services.slice(0, 10).map((s, i) =>
    card(img(`svc-${i}.jpg`), `💅 ${s.name}`, `${s.price} • ${s.duration || 60} min`, [pb(T.btn.choose, "SVC:" + i)]));
  const ok = await sendCards(psid, els, menuExcept("BOOK").filter((m) => m.payload !== "PRICES"));
  if (!ok) {
    const lines = cfg.services.map((s) => `• ${s.name} — ${s.price}`).join("\n");
    return send(psid, lines, MENU);
  }
}

async function sendInfo(psid) {
  const phone = (cfg.phone || "").replace(/[^\d+]/g, "");
  const buttons = [
    { type: "web_url", url: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(cfg.address), title: T.btn.map },
    ...(phone ? [{ type: "phone_number", title: T.btn.call, payload: phone }] : []),
    pb(T.btn.menu, "MENU")
  ];
  const ok = await sendCards(psid, [card(img("info.jpg"), cfg.businessName, T.infoSub(cfg), buttons)], menuExcept("INFO"));
  if (!ok) return send(psid, `📍 ${cfg.address}\n🕒 ${cfg.hours}\n📞 ${cfg.phone}`, MENU);
}

async function sendPortfolio(psid) {
  if (!cfg.portfolioUrl) return send(psid, T.portfolioSoon, MENU);
  const ok = await sendCards(psid,
    [card(img("portfolio.jpg"), "📸 " + T.btn.portfolio.replace("📸 ", ""), T.portfolioText,
      [{ type: "web_url", url: cfg.portfolioUrl, title: T.btn.seeWorks }, pb(T.btn.book, "BOOK")])],
    menuExcept("PORTFOLIO"));
  if (!ok) return send(psid, `${T.portfolioText} ${cfg.portfolioUrl}`, MENU);
}

// Стартовый экран чата: приветствие, кнопка «Начать», постоянное меню рядом с полем ввода
async function setupProfile() {
  const body = {
    get_started: { payload: "GET_STARTED" },
    greeting: [{ locale: "default", text: (cfg.profileGreeting || cfg.greeting).slice(0, 160) }],
    persistent_menu: [{
      locale: "default",
      composer_input_disabled: false,
      call_to_actions: [
        pb(T.btn.book, "BOOK"),
        ...(cfg.portfolioUrl ? [{ type: "web_url", title: T.btn.portfolio, url: cfg.portfolioUrl }] : []),
        pb(T.btn.prices, "PRICES"),
        pb(T.btn.info, "INFO")
      ]
    }]
  };
  const post = async (b, label) => {
    try {
      const res = await fetch(`${API}/messenger_profile?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b)
      });
      console.log(label, res.status, await res.text());
    } catch (e) {
      console.error(label + " не настроен:", e.message);
    }
  };
  await post(body, "Профиль чата:");
}

// ---------- состояние диалога (в памяти) ----------
const sessions = new Map(); // psid -> { step, data }

function saveBooking(b) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8")); } catch (_) {}
  list.push({ ...b, createdAt: new Date().toISOString() });
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(list, null, 2));
}

const svcByName = (n) => cfg.services.find((s) => s.name === n) || { name: n, duration: 60, price: "" };

// ---------- подписанные ссылки на картинки календаря ----------
const SECRET = () => APP_SECRET || VERIFY_TOKEN || "dev-secret";
const b64u = (x) => Buffer.from(x).toString("base64url");
function signToken(obj, ttlMs = 40 * 60 * 1000) {
  const body = b64u(JSON.stringify({ ...obj, e: Date.now() + ttlMs }));
  const sig = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(tok) {
  if (typeof tok !== "string" || !tok.includes(".")) return null;
  const [body, sig] = tok.split(".");
  const expected = crypto.createHmac("sha256", SECRET()).update(body).digest("base64url");
  const a = Buffer.from(sig || ""), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return o.e > Date.now() ? o : null;
  } catch (_) { return null; }
}
const addDaysKey = (k, n) => {
  const [y, m, d] = k.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
};

// ---------- календарь прямо в чате: картинка месяца + кнопки с датами ----------
const PAGE_DAYS = 10;

function calImageUrl(s, pageDays) {
  const svc = svcByName(s.data.service);
  const [y, m] = pageDays[0].split("-").map(Number);
  const mk = `${y}-${pad2(m)}-`;
  const free = s.days.filter((k) => k.startsWith(mk)).map((k) => +k.slice(8));
  const hi = pageDays.filter((k) => k.startsWith(mk)).map((k) => +k.slice(8));
  return `${baseUrl()}/cal.png?p=${signToken({ y, m, f: free, h: hi, s: svc.name }, 7 * 24 * 3600 * 1000)}`;
}

// загружает свободные окна и показывает первую страницу дат
async function offerCalendar(psid, s, page = 0) {
  const svc = svcByName(s.data.service);
  try {
    s.slots = await cal.getFreeSlots(cfg, svc.duration || 60);
  } catch (e) {
    console.error("Calendar error:", e.message);
    s.step = "date";
    return send(psid, T.calendarFail);
  }
  s.days = Object.keys(s.slots);
  if (!s.days.length) {
    sessions.delete(psid);
    return send(psid, T.noSlots(cfg.phone), MENU);
  }
  return showDays(psid, s, page);
}

async function showDays(psid, s, page) {
  const pages = Math.ceil(s.days.length / PAGE_DAYS);
  page = Math.max(0, Math.min(page, pages - 1));
  s.page = page; s.step = "day";
  const list = s.days.slice(page * PAGE_DAYS, (page + 1) * PAGE_DAYS);
  if (baseUrl()) {
    await sendRaw(psid, { attachment: { type: "image", payload: { url: calImageUrl(s, list), is_reusable: false } } });
  }
  const qr = list.map((k) => ({ title: T.btn.dayChip(cal.dayLabel(k)), payload: "DAY:" + k }));
  if (page > 0) qr.push({ title: T.btn.prevDays, payload: "PAGE:" + (page - 1) });
  if (page < pages - 1) qr.push({ title: T.btn.nextDays, payload: "PAGE:" + (page + 1) });
  qr.push({ title: T.btn.changeService, payload: "BOOK" });
  return send(psid, T.chooseDay(page + 1, pages), qr);
}

async function offerTimes(psid, s, offset) {
  const all = s.slots[s.data.dateKey] || [];
  const PAGE = 9;
  const qr = all.slice(offset, offset + PAGE).map((t) => ({ title: T.btn.timeChip(t), payload: "TIME:" + t }));
  if (offset + PAGE < all.length) qr.push({ title: T.btn.moreTimes, payload: "MORE:" + (offset + PAGE) });
  qr.push({ title: T.btn.otherDay, payload: "DAYS" });
  s.step = "time";
  return send(psid, T.chooseTime(s.data.date), qr);
}

async function askConfirm(psid, s) {
  const d = s.data;
  s.step = "confirm";
  const ok = await sendCards(psid, [card(img("confirm.jpg"), T.confirmTitle, T.confirmSub(d), [
    pb(T.btn.confirm, "CONFIRM"), pb(T.btn.changeDate, "CHANGEDATE"), pb(T.btn.cancel, "CANCEL")
  ])]);
  if (!ok) return send(psid, `${T.confirmTitle}\n${d.service}\n${d.date}, ${d.time}\n${d.contact}`,
    [{ title: T.btn.confirm, payload: "CONFIRM" }, { title: T.btn.cancel, payload: "CANCEL" }]);
}

const GREETINGS = ["меню", "menu", "start", "cześć", "czesc", "hej", "witam", "dzień dobry", "dzien dobry", "привет", "здравствуйте", "/start"];

async function handle(psid, text, payload) {
  const key = (payload || text || "").trim();
  const low = key.toLowerCase();

  if (!key || GREETINGS.includes(low) || payload === "MENU" || payload === "GET_STARTED") {
    sessions.delete(psid);
    return sendMenu(psid);
  }
  if (payload === "PORTFOLIO") return sendPortfolio(psid);
  if (payload === "PRICES") { await send(psid, T.pricesIntro); return sendServices(psid); }
  if (payload === "INFO") return sendInfo(psid);
  if (payload === "BOOK") {
    sessions.set(psid, { step: "service", data: {} });
    await send(psid, T.bookIntro);
    return sendServices(psid);
  }
  if (payload && payload.startsWith("SVC:")) {
    const svc = cfg.services[parseInt(payload.slice(4), 10)];
    if (!svc) return sendServices(psid);
    const s = { step: "day", data: { service: svc.name } };
    sessions.set(psid, s);
    if (cal.isConfigured()) return offerCalendar(psid, s);
    s.step = "date";
    return send(psid, T.askDateManual);
  }

  const s = sessions.get(psid);
  if (!s) return send(psid, T.pickOne, MENU);

  if (payload === "CANCEL") {
    sessions.delete(psid);
    return send(psid, T.cancelled, MENU);
  }
  if (payload === "CHANGEDATE") return cal.isConfigured() ? offerCalendar(psid, s) : (s.step = "date", send(psid, T.askDateManual));

  if (s.step === "service") {
    const found = cfg.services.findIndex((x) => x.name.toLowerCase() === low);
    if (found >= 0) return handle(psid, "", "SVC:" + found);
    return sendServices(psid);
  }

  // ----- выбор даты и времени кнопками под картинкой календаря -----
  if (s.step === "day") {
    if (payload && payload.startsWith("PAGE:")) return showDays(psid, s, parseInt(payload.slice(5), 10) || 0);
    if (payload && payload.startsWith("DAY:")) {
      s.data.dateKey = payload.slice(4);
      s.data.date = T.dayLong(s.data.dateKey);
      s.data.shortDate = T.dayShort(s.data.dateKey);
      return offerTimes(psid, s, 0);
    }
    return showDays(psid, s, s.page || 0);
  }
  if (s.step === "time") {
    if (payload === "DAYS") return showDays(psid, s, s.page || 0);
    if (payload && payload.startsWith("MORE:")) return offerTimes(psid, s, parseInt(payload.slice(5), 10) || 0);
    if (payload && payload.startsWith("TIME:")) {
      s.data.time = payload.slice(5); s.step = "contact";
      return send(psid, `${T.selected(s.data)}\n\n${T.askContact}`);
    }
    return offerTimes(psid, s, 0);
  }

  // ----- ручной режим (если календарь не подключён или недоступен) -----
  if (s.step === "date") {
    s.data.date = text; s.data.shortDate = text; s.step = "time_manual";
    return send(psid, T.askTimeManual);
  }
  if (s.step === "time_manual") {
    s.data.time = text; s.step = "contact";
    return send(psid, T.askContact);
  }

  if (s.step === "contact") {
    s.data.contact = text;
    return askConfirm(psid, s);
  }

  if (s.step === "confirm") {
    if (payload !== "CONFIRM") return send(psid, T.tapConfirm, [{ title: T.btn.confirm, payload: "CONFIRM" }, { title: T.btn.cancel, payload: "CANCEL" }]);
    const d = s.data;
    if (cal.isConfigured() && d.dateKey) {
      const svc = svcByName(d.service);
      try {
        // перепроверяем, что время ещё свободно (его могли занять, пока клиент думал)
        const fresh = await cal.getFreeSlots(cfg, svc.duration || 60);
        if (!(fresh[d.dateKey] || []).includes(d.time)) {
          await send(psid, T.slotTaken);
          return offerCalendar(psid, s);
        }
        await cal.createEvent(cfg, {
          summary: `${d.service} — ${d.contact}`,
          description: `Rezerwacja z Messengera.\nUsługa: ${d.service}\nKontakt: ${d.contact}\nMessenger ID: ${psid}`,
          dateStr: d.dateKey, timeStr: d.time, durationMin: svc.duration || 60
        });
      } catch (e) {
        console.error("Create event error:", e.message);
        sessions.delete(psid);
        return send(psid, T.saveFail(cfg.phone), MENU);
      }
    } else {
      saveBooking({ psid, ...d });
    }
    sessions.delete(psid);
    if (OWNER_PSID) send(OWNER_PSID, T.ownerNew(d)).catch(() => {});
    const ok = await sendCards(psid, [card(img("success.jpg"), T.successTitle, T.successSub(d), [pb(T.btn.info, "INFO"), pb(T.btn.menu, "MENU")])]);
    if (!ok) return send(psid, `${T.successTitle} ${T.success}`, MENU);
    return send(psid, T.success);
  }

  return send(psid, T.pickOne, MENU);
}

// ---------- картинки ----------
app.get("/img/:file", (req, res) => {
  if (!/^[\w-]+\.jpg$/.test(req.params.file)) return res.sendStatus(404);
  res.set("Cache-Control", "public, max-age=3600");
  res.sendFile(path.join(__dirname, "img_" + req.params.file), (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});
app.get("/cover.jpg", (_req, res) => res.sendFile(path.join(__dirname, "img_cover.jpg")));

// картинка-календарь месяца: параметры подписаны, чужие запросы отклоняются
const calCache = new Map();
app.get("/cal.png", (req, res) => {
  const tok = verifyToken(req.query.p);
  if (!tok || !tok.y || !tok.m) return res.sendStatus(404);
  let buf = calCache.get(req.query.p);
  if (!buf) {
    const svc = svcByName(tok.s);
    const lp = cal.localParts(Date.now(), cfg.timezone);
    const today = `${lp.y}-${pad2(lp.m)}-${pad2(lp.d)}`;
    buf = renderCalendar({
      business: cfg.businessName, year: tok.y, month: tok.m, free: tok.f, hi: tok.h,
      today, last: addDaysKey(today, cfg.daysAhead),
      service: `${svc.name} · ${svc.duration || 60} min · ${svc.price}`
    });
    calCache.set(req.query.p, buf);
    if (calCache.size > 60) calCache.delete(calCache.keys().next().value);
  }
  res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
  res.send(buf);
});

// ---------- webhook ----------
app.get("/", (_req, res) => res.send(`${cfg.businessName}: bot działa`));

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

function signatureOk(req) {
  if (!APP_SECRET) { console.warn("APP_SECRET не задан: подпись не проверяется"); return true; }
  const sig = req.get("x-hub-signature-256") || "";
  const expected = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || "").digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post("/webhook", (req, res) => {
  if (!signatureOk(req)) return res.sendStatus(403);
  res.sendStatus(200); // Facebook ждёт быстрый ответ
  if (req.body.object !== "page") return;
  for (const entry of req.body.entry || []) {
    for (const ev of entry.messaging || []) {
      if (!ev.sender) continue;
      console.log("Событие от клиента:", ev.postback ? "postback " + ev.postback.payload : ev.message ? "сообщение" : "другое");
      // нажатие кнопки в карточке/меню или «Начать» (в нём может быть метка источника ref)
      if (ev.postback) {
        const ref = (ev.postback.referral && ev.postback.referral.ref) || "";
        if (ref) console.log("Новый клиент, источник:", ref);
        handle(ev.sender.id, ev.postback.title, ev.postback.payload).catch((e) => console.error("handle error:", e));
        continue;
      }
      // переход по ссылке m.me/...?ref=... , когда чат уже существует
      if (ev.referral) {
        if (ev.referral.ref) console.log("Переход по ссылке, источник:", ev.referral.ref);
        handle(ev.sender.id, "", "MENU").catch((e) => console.error("handle error:", e));
        continue;
      }
      if (!ev.message || ev.message.is_echo) continue;
      const payload = ev.message.quick_reply && ev.message.quick_reply.payload;
      handle(ev.sender.id, ev.message.text, payload).catch((e) => console.error("handle error:", e));
    }
  }
});

if (require.main === module) {
  if (!PAGE_TOKEN || !VERIFY_TOKEN) console.warn("Задайте PAGE_ACCESS_TOKEN и VERIFY_TOKEN в переменных окружения");
  app.listen(PORT, () => {
    console.log("Бот запущен на порту", PORT);
    if (PAGE_TOKEN) setupProfile();
  });
}
module.exports = { app, handle, sendMenu, setupProfile, signToken, verifyToken };
