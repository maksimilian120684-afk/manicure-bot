"use strict";
// Работа с Google Calendar без внешних библиотек (сервисный аккаунт + REST).
const crypto = require("crypto");

const SCOPE = "https://www.googleapis.com/auth/calendar";
let cachedToken = null; // { token, exp }

function isConfigured() {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT && process.env.GOOGLE_CALENDAR_ID);
}

function getCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  const creds = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  if (creds.private_key) creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  return creds;
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const creds = getCreds();
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: creds.client_email, scope: SCOPE,
    aud: creds.token_uri || "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600
  }));
  const sig = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(creds.private_key);
  const res = await fetch(creds.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${b64url(sig)}`
    })
  });
  if (!res.ok) throw new Error("Google token error " + res.status + ": " + (await res.text()));
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return cachedToken.token;
}

async function gfetch(url, opts = {}) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- время в часовом поясе салона ----------
function tzOffsetMs(utcMs, tz) {
  const p = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(utcMs))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
// «в салоне сейчас y-m-d h:mi» -> настоящий момент времени (мс UTC)
function zonedToUtcMs(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffsetMs(guess, tz);
  t = guess - tzOffsetMs(t, tz);
  return t;
}
function localParts(utcMs, tz) {
  const p = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short"
  }).formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, wd };
}
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const DAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

// ---------- свободные слоты ----------
// Возвращает { "2026-11-16": ["10:00","11:00",...], ... } только для дней, где есть свободное время
async function getFreeSlots(cfg, durationMin, nowMs = Date.now()) {
  const tz = cfg.timezone;
  const start = localParts(nowMs, tz);
  const days = [];
  let cursor = zonedToUtcMs(start.y, start.m, start.d, 12, 0, tz); // полдень, чтобы не промахнуться на переводе часов
  for (let i = 0; i <= cfg.daysAhead; i++) {
    const lp = localParts(cursor + i * 86400000, tz);
    days.push(lp);
  }
  const first = days[0], last = days[days.length - 1];
  const timeMin = new Date(zonedToUtcMs(first.y, first.m, first.d, 0, 0, tz)).toISOString();
  const timeMax = new Date(zonedToUtcMs(last.y, last.m, last.d, 23, 59, tz)).toISOString();
  const fb = await gfetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: tz, items: [{ id: process.env.GOOGLE_CALENDAR_ID }] })
  });
  const cal = (fb.calendars || {})[process.env.GOOGLE_CALENDAR_ID] || {};
  if (cal.errors && cal.errors.length) throw new Error("Calendar access error: " + JSON.stringify(cal.errors));
  const busy = (cal.busy || []).map((b) => [Date.parse(b.start), Date.parse(b.end)]);

  const result = {};
  const earliest = nowMs + cfg.minLeadHours * 3600000;
  for (const day of days) {
    const hours = cfg.workHours[day.wd];
    if (!hours) continue;
    const dayStart = zonedToUtcMs(day.y, day.m, day.d, hours[0], 0, tz);
    const dayEnd = zonedToUtcMs(day.y, day.m, day.d, hours[1], 0, tz);
    const slots = [];
    for (let t = dayStart; t + durationMin * 60000 <= dayEnd; t += cfg.slotStepMinutes * 60000) {
      if (t < earliest) continue;
      const end = t + durationMin * 60000;
      if (busy.some(([bs, be]) => t < be && end > bs)) continue;
      const hh = Math.round((t - dayStart) / 60000) + hours[0] * 60;
      slots.push(`${pad(Math.floor(hh / 60))}:${pad(hh % 60)}`);
    }
    if (slots.length) result[dateKey(day.y, day.m, day.d)] = slots;
  }
  return result;
}

async function createEvent(cfg, { summary, description, dateStr, timeStr, durationMin }) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const startMs = zonedToUtcMs(y, m, d, h, mi, cfg.timezone);
  const endMs = startMs + durationMin * 60000;
  const id = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
  return gfetch(`https://www.googleapis.com/calendar/v3/calendars/${id}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary, description,
      start: { dateTime: new Date(startMs).toISOString(), timeZone: cfg.timezone },
      end: { dateTime: new Date(endMs).toISOString(), timeZone: cfg.timezone }
    })
  });
}

function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${DAY_NAMES[wd]} ${pad(d)}.${pad(m)}`;
}

module.exports = { isConfigured, getFreeSlots, createEvent, dayLabel, zonedToUtcMs, localParts };
