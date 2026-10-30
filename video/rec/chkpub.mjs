import { chromium } from "playwright";
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1920,height:1080}, storageState:"state.json"}); const p = await ctx.newPage();
await p.goto("http://localhost:3140/admin/tipologie"); await p.waitForTimeout(2500);
console.log((await p.innerText("main")).slice(0,700));
await b.close();
