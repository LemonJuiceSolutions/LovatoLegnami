// Registrazione di clip per il video: screencast CDP (JPEG alta qualità) → mp4 H.264 30 fps con ffmpeg.
// Cursore visibile iniettato nella pagina, movimenti morbidi, digitazione lenta.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const B = "http://localhost:3140";
const HERE = new URL(".", import.meta.url).pathname;
export const OUT = join(HERE, "..", "video", "remotion", "public", "recordings");
mkdirSync(OUT, { recursive: true });

const CURSOR_JS = (mobile) => `
(() => {
  if (window.__cur) return;
  const install = () => {
    if (!document.body) return requestAnimationFrame(install);
    const st = document.createElement('style');
    st.textContent = \`
      button.fixed.bottom-6.right-6.rounded-full{display:none!important}
      #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .08s ease-out;will-change:transform}
      #__cur.down .ring{transform:scale(.72);opacity:1}
      #__ripple{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(110,43,208,.75);width:10px;height:10px;opacity:0}
      [data-hide-rec]{visibility:hidden!important}
      nextjs-portal{display:none!important}
      html{scroll-behavior:auto!important}
    \`;
    document.head.appendChild(st);
    const c = document.createElement('div'); c.id='__cur';
    c.innerHTML = ${mobile}
      ? '<div class="ring" style="width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(11,12,20,.22);border:3px solid rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(0,0,0,.35);transition:transform .12s, opacity .12s;opacity:.85"></div>'
      : '<svg width="30" height="30" viewBox="0 0 24 24" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M4 2.5l6.8 18.2 2.6-7.6 7.6-2.6z" fill="#0B0C14" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement('div'); r.id='__ripple'; document.body.appendChild(r);
    const p = window.__curPos || {x: -100, y: -100};
    c.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
    addEventListener('mousemove', e => { window.__curPos = {x:e.clientX,y:e.clientY}; c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', e => {
      c.classList.add('down');
      r.animate([{left:(e.clientX-5)+'px',top:(e.clientY-5)+'px',width:'10px',height:'10px',opacity:.9},{left:(e.clientX-28)+'px',top:(e.clientY-28)+'px',width:'56px',height:'56px',opacity:0}],{duration:450,easing:'ease-out'});
    }, true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
    window.__cur = c;
    // nasconde riferimenti interni alla ricerca di mercato (note dei preset)
    const hide = () => document.querySelectorAll('p,span,div,li').forEach(el => { if (el.children.length === 0 && /chepergola/i.test(el.textContent || '')) el.setAttribute('data-hide-rec',''); });
    new MutationObserver(hide).observe(document.body, {subtree:true, childList:true}); hide();
  };
  install();
})();`;

export async function setup({ mobile = false, auth = false, width, height, dsf } = {}) {
  const browser = await chromium.launch({ args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
  const vw = width ?? (mobile ? 390 : 1920), vh = height ?? (mobile ? 844 : 1080);
  const ctx = await browser.newContext({
    viewport: { width: vw, height: vh }, deviceScaleFactor: dsf ?? (mobile ? 2 : 1), isMobile: mobile, hasTouch: false,
    storageState: auth ? join(HERE, "state.json") : undefined, locale: "it-IT", timezoneId: "Europe/Rome",
    acceptDownloads: true,
  });
  await ctx.addInitScript(CURSOR_JS(mobile));
  const page = await ctx.newPage();
  const h = makeHelpers(page, { vw, vh, mobile, dsf: dsf ?? (mobile ? 2 : 1) });
  return { browser, ctx, page, ...h, vw, vh };
}

function makeHelpers(page, { vw, vh, mobile, dsf }) {
  let pos = { x: vw * 0.6, y: vh * 0.6 };
  let rec = null;
  const wait = (ms) => page.waitForTimeout(ms);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  async function moveTo(x, y, ms = 700) {
    const sx = pos.x, sy = pos.y;
    const cx = (sx + x) / 2 + (y - sy) * 0.12, cy = (sy + y) / 2 - (x - sx) * 0.12;
    const t0 = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const t = easeIO(k);
      const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * x;
      const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * y;
      await page.mouse.move(px, py);
      if (k >= 1) break;
      await page.waitForTimeout(12);
    }
    pos = { x, y };
  }
  async function locate(target) {
    const loc = typeof target === "string" ? page.locator(target).first() : target;
    await loc.waitFor({ state: "visible", timeout: 20000 });
    await loc.scrollIntoViewIfNeeded();
    const bb = await loc.boundingBox();
    return { loc, bb };
  }
  async function hover(target, ms = 700) {
    const { loc, bb } = await locate(target);
    await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2, ms);
    return loc;
  }
  async function click(target, { ms = 700, pause = 250, after = 500, dx = 0.5, dy = 0.5 } = {}) {
    const { bb } = await locate(target);
    const x = bb.x + bb.width * dx, y = bb.y + bb.height * dy;
    await moveTo(x, y, ms);
    await wait(pause);
    await page.mouse.down(); await wait(90); await page.mouse.up();
    await wait(after);
  }
  async function type(target, text, { clear = true, delay = 85, after = 350 } = {}) {
    await click(target, { after: 150 });
    const loc = typeof target === "string" ? page.locator(target).first() : target;
    if (clear) { await loc.press("ControlOrMeta+a"); await loc.press("Backspace"); }
    await loc.pressSequentially(String(text), { delay });
    await wait(after);
  }
  /** scroll morbido della finestra (o di un elemento) di dy pixel in ms */
  async function scroll(dy, ms = 1200, selector = null) {
    await page.evaluate(async ({ dy, ms, selector }) => {
      const el = selector ? document.querySelector(selector) : null;
      const get = () => (el ? el.scrollTop : window.scrollY);
      const set = (v) => (el ? (el.scrollTop = v) : window.scrollTo(0, v));
      const s = get(), t0 = performance.now();
      await new Promise((res) => {
        const f = (now) => {
          const k = Math.min(1, (now - t0) / ms);
          const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          set(s + dy * e);
          k < 1 ? requestAnimationFrame(f) : res();
        };
        requestAnimationFrame(f);
      });
    }, { dy, ms, selector });
  }
  async function scrollToEl(target, { ms = 1100, offset = 120, selector = null } = {}) {
    const loc = typeof target === "string" ? page.locator(target).first() : target;
    await loc.waitFor({ state: "attached", timeout: 20000 });
    const dy = await loc.evaluate((el, { offset, selector }) => {
      const r = el.getBoundingClientRect();
      if (selector) { const c = document.querySelector(selector); return r.top - c.getBoundingClientRect().top - offset; }
      return r.top - offset;
    }, { offset, selector });
    await scroll(dy, ms, selector);
  }
  async function drag(x1, y1, x2, y2, ms = 1500) {
    await moveTo(x1, y1, 500);
    await page.mouse.down();
    const t0 = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const t = easeIO(k);
      await page.mouse.move(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      if (k >= 1) break;
      await page.waitForTimeout(12);
    }
    await page.mouse.up();
    pos = { x: x2, y: y2 };
  }
  async function goto(url, { waitMs = 800 } = {}) {
    await page.goto(url.includes("://") ? url : B + url, { waitUntil: "networkidle" }).catch(() => {});
    await page.mouse.move(pos.x, pos.y);
    await wait(waitMs);
  }

  async function start(name) {
    const dir = join(HERE, "frames", name);
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    const cdp = await page.context().newCDPSession(page);
    const frames = [];
    cdp.on("Page.screencastFrame", async (f) => {
      const i = frames.length;
      const file = join(dir, `f${String(i).padStart(6, "0")}.jpg`);
      writeFileSync(file, Buffer.from(f.data, "base64"));
      frames.push({ file, ts: f.metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(vw * dsf), maxHeight: Math.round(vh * dsf), everyNthFrame: 1 });
    // forza un primo frame
    await page.mouse.move(pos.x + 1, pos.y); await page.mouse.move(pos.x, pos.y);
    rec = { name, dir, cdp, frames, t0: Date.now() / 1000 };
    return rec;
  }
  async function stop({ trimStart = 0 } = {}) {
    await page.mouse.move(pos.x + 1, pos.y); await wait(300);
    const end = Date.now() / 1000;
    await rec.cdp.send("Page.stopScreencast").catch(() => {});
    const { frames, dir, name } = rec;
    if (!frames.length) throw new Error("nessun frame");
    let list = "";
    for (let i = 0; i < frames.length; i++) {
      const next = i + 1 < frames.length ? frames[i + 1].ts : end;
      const d = Math.max(0.001, next - frames[i].ts);
      list += `file '${frames[i].file}'\nduration ${d.toFixed(4)}\n`;
    }
    list += `file '${frames[frames.length - 1].file}'\n`;
    writeFileSync(join(dir, "list.txt"), list);
    const out = join(OUT, `${name}.mp4`);
    const vf = mobile ? "scale=780:1688:flags=lanczos,format=yuv420p" : "scale=1920:1080:flags=lanczos,format=yuv420p";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
      ...(trimStart ? ["-ss", String(trimStart)] : []),
      "-vf", vf, "-r", "30", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-an", out]);
    const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
    const fps = (frames.length / (end - frames[0].ts)).toFixed(1);
    console.log(`[rec] ${name}.mp4  ${(+dur).toFixed(1)} s  (${frames.length} frame, ~${fps} fps sorgente)`);
    rmSync(dir, { recursive: true, force: true });
    rec = null;
    return out;
  }
  return { wait, moveTo, hover, click, type, scroll, scrollToEl, drag, goto, start, stop, get pos() { return pos; }, setPos: (p) => (pos = p) };
}
