"use strict";
// Галерея «Prace mistrza»: открывается без входа в Facebook (обычная веб-страница).
// Фото мастера: любые .jpg/.png/.webp, загруженные в корень репозитория (кроме img_*.jpg и cover.jpg).
// Либо cfg.portfolioPhotos (полные https-ссылки). Если ничего нет, показываем демо-картинки.
const fs = require("fs");
const path = require("path");
const cfg = require("./config");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const base = () => (process.env.RENDER_EXTERNAL_URL || cfg.publicUrl || "").replace(/\/$/, "");

function workFiles() {
  try {
    return fs.readdirSync(__dirname)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !/^img_/.test(f) && !/^cover\./i.test(f))
      .sort();
  } catch (_) { return []; }
}

function page() {
  let photos = (cfg.portfolioPhotos && cfg.portfolioPhotos.length) ? cfg.portfolioPhotos : workFiles().map((f) => `${base()}/work/${encodeURIComponent(f)}`);
  if (!photos.length) photos = [0, 1, 2, 3].map((i) => `${base()}/img/svc-${i}.jpg`);
  const items = photos.map((u) => `<a href="${esc(u)}"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join("");
  const fb = cfg.pageUrl ? `<p><a class="btn" href="${esc(cfg.pageUrl)}">Nasza strona na Facebooku</a></p>` : "";
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prace mistrza – ${esc(cfg.businessName)}</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#faf5ff;color:#222;text-align:center}
h1{color:#5b21b6;margin:20px 12px 4px}p.sub{margin:0 12px 16px;color:#555}
.g{display:grid;grid-template-columns:1fr;gap:8px;padding:0 8px 16px;max-width:760px;margin:0 auto}
.g img{width:100%;border-radius:10px;display:block}
.btn{display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;padding:12px 22px;border-radius:24px;margin:8px 0 28px}</style></head><body>
<h1>Prace mistrza</h1><p class="sub">${esc(cfg.businessName)}</p>
<div class="g">${items}</div>${fb}</body></html>`;
}

module.exports = (app) => {
  app.get("/portfolio", (_req, res) => res.type("html").send(page()));
  app.get("/work/:file", (req, res) => {
    if (!workFiles().includes(req.params.file)) return res.sendStatus(404);
    res.set("Cache-Control", "public, max-age=3600");
    res.sendFile(path.join(__dirname, req.params.file));
  });
};
