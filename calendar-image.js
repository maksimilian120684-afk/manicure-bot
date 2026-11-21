"use strict";
// Рисует картинку-календарь месяца (PNG), которую бот присылает прямо в чат.
const path = require("path");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");

const fs = require("fs");
const fontCandidates = [path.join(__dirname, "font-bold.ttf")];
try { fontCandidates.push(require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf")); } catch (e) {}
const fontFile = fontCandidates.find((f) => fs.existsSync(f));
if (fontFile) GlobalFonts.registerFromPath(fontFile, "CalFont");
else console.log("ВНИМАНИЕ: шрифт для календаря не найден");
const FONT = (px) => `bold ${px}px CalFont`;

const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const WD = ["PN", "WT", "ŚR", "CZ", "PT", "SB", "ND"];
const pad = (n) => String(n).padStart(2, "0");

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}
function spaced(ctx, text, x, y, gap) {
  let cx = x;
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; }
}

// opts: { business, year, month (1-12), free: [дни месяца с терминами], hi: [дни, доступные кнопками сейчас],
//         today: "YYYY-MM-DD", last: "YYYY-MM-DD", service: "Manicure · 60 min · od 100 zł" }
function renderCalendar(opts) {
  const { year, month } = opts;
  const free = new Set(opts.free || []), hi = new Set(opts.hi || []);
  const W = 800, CELL = 94, GAP = 9, PAD = 20, CARD_X = 24;
  const first = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows = Math.ceil((first + dim) / 7);
  const gridH = rows * CELL + (rows - 1) * GAP;
  const HEAD = 214, WDH = 46, CARD_H = PAD + WDH + gridH + PAD, LEG = 120;
  const H = HEAD + CARD_H + LEG;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // фон
  ctx.fillStyle = grad(ctx, 0, 0, W, H, [[0, "#1B0B2E"], [0.55, "#4C1D95"], [1, "#B5179E"]]);
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 10, W, 0, 520);
  glow.addColorStop(0, "rgba(244,114,182,0.55)"); glow.addColorStop(1, "rgba(244,114,182,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // шапка
  ctx.fillStyle = "#FDE68A"; ctx.font = FONT(20);
  spaced(ctx, String(opts.business || "").toUpperCase(), 36, 52, 4);
  ctx.fillStyle = "#F59E0B"; ctx.fillRect(36, 66, 60, 4);
  ctx.fillStyle = "#FFFFFF"; ctx.font = FONT(60);
  ctx.fillText(`${MONTHS[month - 1]} ${year}`, 36, 134);
  if (opts.service) {
    ctx.font = FONT(24);
    const w = ctx.measureText(opts.service).width + 40;
    ctx.fillStyle = "rgba(255,255,255,0.16)"; rr(ctx, 36, 156, Math.min(w, W - 72), 42, 21); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.fillText(opts.service, 56, 185);
  }

  // белая карточка
  ctx.save();
  ctx.shadowColor = "rgba(10,0,30,0.5)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#FFFFFF"; rr(ctx, CARD_X, HEAD, W - 2 * CARD_X, CARD_H, 34); ctx.fill();
  ctx.restore();

  // дни недели
  ctx.font = FONT(22); ctx.textAlign = "center";
  const gx = CARD_X + PAD;
  WD.forEach((d, i) => {
    ctx.fillStyle = i >= 5 ? "#F472B6" : "#9B7BB3";
    ctx.fillText(d, gx + i * (CELL + GAP) + CELL / 2, HEAD + PAD + 30);
  });

  // клетки
  const todayD = opts.today && opts.today.startsWith(`${year}-${pad(month)}-`) ? +opts.today.slice(8) : 0;
  for (let d = 1; d <= dim; d++) {
    const idx = first + d - 1, r = Math.floor(idx / 7), c = idx % 7;
    const x = gx + c * (CELL + GAP), y = HEAD + PAD + WDH + r * (CELL + GAP);
    const key = `${year}-${pad(month)}-${pad(d)}`;
    const inRange = key >= opts.today && key <= opts.last;
    let fill, fg, shadow = null;
    if (inRange && hi.has(d)) { fill = grad(ctx, x, y, x + CELL, y + CELL, [[0, "#FDE68A"], [1, "#F59E0B"]]); fg = "#3B0764"; shadow = "rgba(245,158,11,0.55)"; }
    else if (inRange && free.has(d)) { fill = grad(ctx, x, y, x + CELL, y + CELL, [[0, "#F472B6"], [0.6, "#C026D3"], [1, "#7C3AED"]]); fg = "#FFFFFF"; shadow = "rgba(192,38,211,0.4)"; }
    else if (inRange) { fill = "#F3EAF8"; fg = "#BBA6CC"; }
    else { fill = null; fg = "#DDD2E8"; }
    if (fill) {
      ctx.save();
      if (shadow) { ctx.shadowColor = shadow; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6; }
      ctx.fillStyle = fill; rr(ctx, x, y, CELL, CELL, 24); ctx.fill();
      ctx.restore();
    }
    if (d === todayD) {
      ctx.strokeStyle = "#F59E0B"; ctx.lineWidth = 5; rr(ctx, x + 2.5, y + 2.5, CELL - 5, CELL - 5, 22); ctx.stroke();
    }
    ctx.fillStyle = fg; ctx.font = FONT(inRange ? 42 : 36); ctx.textAlign = "center";
    ctx.fillText(String(d), x + CELL / 2, y + CELL / 2 + 15);
  }

  // легенда
  ctx.textAlign = "left"; ctx.font = FONT(21);
  const ly = HEAD + CARD_H + 44;
  const items = [
    [["#FDE68A", "#F59E0B"], "złote: wybierz poniżej"],
    [["#F472B6", "#7C3AED"], "fioletowe: dalsze terminy"],
    [["#F3EAF8", "#F3EAF8"], "szare: brak terminów"]
  ];
  let lx = 36;
  items.forEach(([cols, label], i) => {
    const row = i < 2 ? 0 : 1;
    const x = i < 2 ? 36 + i * 370 : 36, y = ly + row * 40;
    ctx.fillStyle = grad(ctx, x, y - 20, x + 24, y + 4, [[0, cols[0]], [1, cols[1]]]); rr(ctx, x, y - 20, 24, 24, 7); ctx.fill();
    ctx.fillStyle = "#E9D5FF"; ctx.fillText(label, x + 36, y);
  });
  return canvas.toBuffer("image/png");
}

module.exports = { renderCalendar };
