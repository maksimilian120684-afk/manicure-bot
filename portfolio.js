"use strict";
// Галерея «Prace mistrza»: открывается без входа в Facebook (обычная веб-страница).
// Фото: cfg.portfolioPhotos (полные https-ссылки). Если пусто, показываем демо-картинки.
const cfg = require("./config");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function page() {
  const base = (process.env.RENDER_EXTERNAL_URL || cfg.publicUrl || "").replace(/\/$/, "");
  const photos = (cfg.portfolioPhotos && cfg.portfolioPhotos.length)
    ? cfg.portfolioPhotos
    : [0, 1, 2, 3].map((i) => `${base}/img/svc-${i}.jpg`);
  const items = photos.map((u) => `<a href="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join("");
  const fb = cfg.pageUrl ? `<p><a class="btn" href="${esc(cfg.pageUrl)}">Nasza strona na Facebooku</a></p>` : "";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prace mistrza – ${esc(cfg.businessName)}</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#faf5ff;color:#222;text-align:center}
h1{color:#5b21b6;margin:20px 12px 4px}p.sub{margin:0 12px 16px;color:#555}
.g{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 8px 16px;max-width:760px;margin:0 auto}
.g img{width:100%;border-radius:10px;display:block}
.btn{display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:24px;margin:8px 0 28px}</style></head><body>
<h1>Prace mistrza</h1><p class="sub">${esc(cfg.businessName)}</p>
<div class="g">${items}</div>${fb}</body></html>`;
}

module.exports = (app) => app.get("/portfolio", (_req, res) => res.type("html").send(page()));
