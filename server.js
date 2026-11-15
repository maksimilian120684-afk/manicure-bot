"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cfg = require("./config");
const cal = require("./calendar");

const PAGE_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const OWNER_PSID = process.env.OWNER_PSID; // необязательно: куда присылать новые записи
const PORT = process.env.PORT || 3000;
const GRAPH = "https://graph.facebook.com/v21.0/me/messages";
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

// ---------- отправка сообщений ----------
async function send(psid, text, quickReplies) {
  const message = { text };
  if (quickReplies && quickReplies.length) {
    message.quick_replies = quickReplies.slice(0, 13).map((q) => ({
      content_type: "text",
      title: q.title.slice(0, 20),
      payload: q.payload
    }));
  }
  const res = await fetch(`${GRAPH}?access_token=${encodeURIComponent(PAGE_TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message })
  });
  if (!res.ok) console.error("Send API error:", res.status, await res.text());
}

const MENU = [
  { title: "Записаться", payload: "BOOK" },
  { title: "Услуги и цены", payload: "PRICES" },
  { title: "Адрес и часы", payload: "INFO" }
];

// ---------- состояние диалога (в памяти) ----------
const sessions = new Map(); // psid -> { step, data }

function saveBooking(b) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf8")); } catch (_) {}
  list.push({ ...b, createdAt: new Date().toISOString() });
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(list, null, 2));
}

const CONFIRM_BTNS = [{ title: "Подтвердить", payload: "CONFIRM" }, { title: "Отменить", payload: "CANCEL" }];
const svcByName = (n) => cfg.services.find((s) => s.name === n) || { name: n, duration: 60 };

async function offerDays(psid, s) {
  const svc = svcByName(s.data.service);
  try {
    s.slots = await cal.getFreeSlots(cfg, svc.duration || 60);
  } catch (e) {
    console.error("Calendar error:", e.message);
    s.manual = true; s.step = "date";
    return send(psid, "Не получилось загрузить расписание. Напишите, пожалуйста, желаемый день (например: завтра или 20 ноября).");
  }
  const days = Object.keys(s.slots).slice(0, 12);
  if (!days.length) {
    sessions.delete(psid);
    return send(psid, `К сожалению, свободных окон на ближайшие дни нет. Позвоните нам: ${cfg.phone}`, MENU);
  }
  s.step = "day";
  return send(psid, "Выберите удобный день:",
    days.map((d) => ({ title: cal.dayLabel(d), payload: "DAY:" + d })));
}

async function offerTimes(psid, s, offset) {
  const all = s.slots[s.data.dateKey] || [];
  const PAGE = 9;
  const page = all.slice(offset, offset + PAGE);
  const qr = page.map((t) => ({ title: t, payload: "TIME:" + t }));
  if (offset + PAGE < all.length) qr.push({ title: "Ещё время ▶", payload: "MORE:" + (offset + PAGE) });
  qr.push({ title: "Другой день", payload: "DAYS" });
  s.step = "time";
  return send(psid, `${cal.dayLabel(s.data.dateKey)}: выберите время`, qr);
}

async function handle(psid, text, payload) {
  const key = (payload || text || "").trim();
  const low = key.toLowerCase();

  if (!key || ["меню", "menu", "start", "привет", "здравствуйте", "/start"].includes(low) || payload === "MENU") {
    sessions.delete(psid);
    return send(psid, cfg.greeting, MENU);
  }
  if (payload === "PRICES") {
    const lines = cfg.services.map((s) => `• ${s.name} — ${s.price}`).join("\n");
    return send(psid, `Наши услуги:\n${lines}`, MENU);
  }
  if (payload === "INFO") {
    return send(psid, `📍 ${cfg.address}\n🕒 ${cfg.hours}\n📞 ${cfg.phone}`, MENU);
  }
  if (payload === "BOOK") {
    sessions.set(psid, { step: "service", data: {} });
    return send(psid, "На какую услугу хотите записаться?",
      cfg.services.map((s) => ({ title: s.name, payload: "SVC:" + s.name })));
  }

  const s = sessions.get(psid);
  if (!s) return send(psid, "Выберите, пожалуйста, один из вариантов:", MENU);

  if (payload === "CANCEL") {
    sessions.delete(psid);
    return send(psid, "Запись отменена. Если передумаете, нажмите «Записаться».", MENU);
  }

  if (s.step === "service") {
    const name = payload && payload.startsWith("SVC:") ? payload.slice(4) : text;
    s.data.service = name;
    if (cal.isConfigured()) return offerDays(psid, s);
    s.step = "date";
    return send(psid, "На какой день вам удобно? (например: завтра или 20 ноября)");
  }

  // ----- выбор из календаря -----
  if (s.step === "day") {
    if (payload && payload.startsWith("DAY:")) {
      s.data.dateKey = payload.slice(4);
      s.data.date = cal.dayLabel(s.data.dateKey);
      return offerTimes(psid, s, 0);
    }
    return offerDays(psid, s);
  }
  if (s.step === "time") {
    if (payload === "DAYS") return offerDays(psid, s);
    if (payload && payload.startsWith("MORE:")) return offerTimes(psid, s, parseInt(payload.slice(5), 10) || 0);
    if (payload && payload.startsWith("TIME:")) {
      s.data.time = payload.slice(5); s.step = "contact";
      return send(psid, "Напишите, пожалуйста, ваше имя и номер телефона.");
    }
    return offerTimes(psid, s, 0);
  }

  // ----- ручной режим (если календарь не подключён или недоступен) -----
  if (s.step === "date") {
    s.data.date = text; s.step = "time_manual";
    return send(psid, "В какое время? (например: 15:00)");
  }
  if (s.step === "time_manual") {
    s.data.time = text; s.step = "contact";
    return send(psid, "Напишите, пожалуйста, ваше имя и номер телефона.");
  }

  if (s.step === "contact") {
    s.data.contact = text; s.step = "confirm";
    const d = s.data;
    return send(psid, `Проверьте запись:\nУслуга: ${d.service}\nДата: ${d.date}\nВремя: ${d.time}\nКонтакт: ${d.contact}`, CONFIRM_BTNS);
  }

  if (s.step === "confirm") {
    if (payload !== "CONFIRM") return send(psid, "Нажмите «Подтвердить» или «Отменить».", CONFIRM_BTNS);
    const d = s.data;
    if (cal.isConfigured() && d.dateKey) {
      const svc = svcByName(d.service);
      try {
        // перепроверяем, что время ещё свободно (его могли занять, пока клиент думал)
        const fresh = await cal.getFreeSlots(cfg, svc.duration || 60);
        if (!(fresh[d.dateKey] || []).includes(d.time)) {
          s.slots = fresh;
          s.step = "day";
          await send(psid, "К сожалению, это время только что заняли. Выберите другое:");
          return offerDays(psid, s);
        }
        await cal.createEvent(cfg, {
          summary: `${d.service} — ${d.contact}`,
          description: `Запись из Messenger.\nУслуга: ${d.service}\nКонтакт: ${d.contact}\nMessenger ID: ${psid}`,
          dateStr: d.dateKey, timeStr: d.time, durationMin: svc.duration || 60
        });
      } catch (e) {
        console.error("Create event error:", e.message);
        sessions.delete(psid);
        return send(psid, `Не удалось сохранить запись. Пожалуйста, позвоните нам: ${cfg.phone}`, MENU);
      }
    } else {
      saveBooking({ psid, ...d });
    }
    sessions.delete(psid);
    if (OWNER_PSID) {
      send(OWNER_PSID, `Новая запись: ${d.service}, ${d.date} ${d.time}, ${d.contact}`).catch(() => {});
    }
    return send(psid, "Готово! Вы записаны. Ждём вас! Если планы изменятся, напишите нам заранее.", MENU);
  }

  return send(psid, "Выберите, пожалуйста, один из вариантов:", MENU);
}

// ---------- webhook ----------
app.get("/", (_req, res) => res.send(`${cfg.businessName}: бот работает`));

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
      if (!ev.sender || !ev.message || ev.message.is_echo) continue;
      const payload = ev.message.quick_reply && ev.message.quick_reply.payload;
      handle(ev.sender.id, ev.message.text, payload).catch((e) => console.error("handle error:", e));
    }
  }
});

if (require.main === module) {
  if (!PAGE_TOKEN || !VERIFY_TOKEN) console.warn("Задайте PAGE_ACCESS_TOKEN и VERIFY_TOKEN в переменных окружения");
  app.listen(PORT, () => console.log("Бот запущен на порту", PORT));
}
module.exports = { app, handle };
