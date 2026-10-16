import express from "express";
import archiver from "archiver";
import { chromium } from "playwright";
import { Readable } from "node:stream";

const app = express();
app.use(express.json({ limit: "20kb" }));
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;

function validGofileUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  return ["gofile.io", "www.gofile.io"].includes(u.hostname) &&
    (u.protocol === "https:" || u.protocol === "http:");
}
function safeName(s) {
  return String(s || "video").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180);
}
function isVideo(name, mime = "") {
  return /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|ts)$/i.test(name) ||
    /^video\//i.test(mime);
}

app.post("/api/zip", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!validGofileUrl(url)) {
    return res.status(400).json({ error: "Gofileの共有URLを入力してください。" });
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage({ acceptDownloads: false });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const items = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll("a[href]")) {
        const href = el.href;
        const name = (el.innerText || el.getAttribute("download") || el.title || "").trim();
        if (href && name) out.push({ href, name });
      }
      for (const el of document.querySelectorAll("video[src], video source[src]")) {
        out.push({ href: el.src, name: el.getAttribute("download") || el.getAttribute("title") || "video.mp4" });
      }
      return out;
    });

    const unique = new Map();
    for (const item of items) {
      try {
        const u = new URL(item.href);
        if (!["https:", "http:"].includes(u.protocol)) continue;
        if (!(u.hostname === "gofile.io" || u.hostname.endsWith(".gofile.io") ||
              u.hostname.endsWith(".gofilecdn.com"))) continue;
        const name = safeName(item.name || "video");
        if (isVideo(name) || /\.(mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|3gp|ts)(\?|$)/i.test(u.pathname)) {
          unique.set(u.href, { url: u.href, name });
        }
      } catch {}
    }
    await browser.close();
    browser = null;

    const videos = [...unique.values()];
    if (!videos.length) {
      return res.status(422).json({
        error: "公開ページから動画リンクを見つけられませんでした。リンクが有効か確認してください。Gofile側の画面変更、アクセス制限、CAPTCHAなどが原因の場合があります。"
      });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="gofile-videos.zip"');
    const archive = archiver("zip", { zlib: { level: 0 } });
    archive.on("warning", err => { if (err.code !== "ENOENT") res.destroy(err); });
    archive.on("error", err => res.destroy(err));
    archive.pipe(res);

    let ok = 0;
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      try {
        const response = await fetch(v.url, { redirect: "follow", signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body) continue;
        const finalUrl = new URL(response.url);
        if (!["https:", "http:"].includes(finalUrl.protocol)) continue;
        archive.append(Readable.fromWeb(response.body), { name: `${String(++ok).padStart(2, "0")}_${v.name}` });
      } catch (e) {
        console.error("Skipped a video:", v.name, e.message);
      }
    }
    if (ok === 0) {
      archive.abort();
      if (!res.headersSent) return res.status(422).json({ error: "動画をダウンロードできませんでした。アクセス権やGofile側の制限を確認してください。" });
      return res.end();
    }
    await archive.finalize();
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error(err);
    if (!res.headersSent) res.status(500).json({
      error: "処理に失敗しました。公開リンクか確認し、時間をおいて再試行してください。"
    });
    else res.destroy(err);
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Gofile Video Zipper listening on ${PORT}`));
