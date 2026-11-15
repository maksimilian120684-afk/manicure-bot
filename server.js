"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const cfg = require("./config");

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
  if (s) {
    if (payload === "CANCEL") {
      sessions.delete(psid);
      return send(psid, "Запись отменена. Если передумаете, нажмите «Записаться».", MENU);
    }
    if (s.step === "service") {
      const name = payload && payload.startsWith("SVC:") ? payload.slice(4) : text;
      s.data.service = name; s.step = "date";
      return send(psid, "На какой день вам удобно? (например: завтра или 20 ноября)");
    }
    if (s.step === "date") {
      s.data.date = text; s.step = "time";
      return send(psid, "В какое время? (например: 15:00)");
    }
    if (s.step === "time") {
      s.data.time = text; s.step = "contact";
      return send(psid, "Напишите, пожалуйста, ваше имя и номер телефона.");
    }
    if (s.step === "contact") {
      s.data.contact = text; s.step = "confirm";
      const d = s.data;
      return send(psid,
        `Проверьте запись:\nУслуга: ${d.service}\nДата: ${d.date}\nВремя: ${d.time}\nКонтакт: ${d.contact}`,
        [{ title: "Подтвердить", payload: "CONFIRM" }, { title: "Отменить", payload: "CANCEL" }]);
    }
    if (s.step === "confirm") {
      if (payload === "CONFIRM") {
        saveBooking({ psid, ...s.data });
        sessions.delete(psid);
        if (OWNER_PSID) {
          const d = s.data;
          send(OWNER_PSID, `Новая запись: ${d.service}, ${d.date} ${d.time}, ${d.contact}`).catch(() => {});
        }
        return send(psid, "Готово! Запись принята, мы вам перезвоним для подтверждения. Спасибо!", MENU);
      }
      return send(psid, "Нажмите «Подтвердить» или «Отменить».",
        [{ title: "Подтвердить", payload: "CONFIRM" }, { title: "Отменить", payload: "CANCEL" }]);
    }
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
