import { chromium } from "playwright";
const B="http://localhost:3140"; const path=process.argv[2];
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1920,height:1080}, storageState:"state.json"}); const p = await ctx.newPage();
await p.goto(B+path); await p.waitForTimeout(2000);
await p.click("button:has-text('Pubblica')"); await p.waitForTimeout(1500);
await p.screenshot({path:"shots/pub-dialog.png"});
console.log((await p.innerText("[role=dialog]")).slice(0,2000));
console.log(await p.$$eval("[role=dialog] button, [role=dialog] input", bs=>bs.map(b=>b.tagName+":"+(b.innerText||b.type+"="+b.value)).join(" | ")));
const btns = await p.$$("[role=dialog] button"); 
for (const bt of btns) { const t=(await bt.innerText()).trim(); if (/^Pubblica/.test(t)) { await bt.click(); break; } }
await p.waitForTimeout(2500); await p.screenshot({path:"shots/pub-done.png"});
console.log((await p.innerText("main")).slice(0,400));
await b.close();
