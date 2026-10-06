import { chromium } from "@playwright/test";
const BASE = "http://localhost:3006";
const pages = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
const p = await ctx.newPage();
p.on("response", () => {});
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForSelector(`input[type="email"]`, { timeout: 120000 });
await p.waitForTimeout(3000);
for (let i = 0; i < 6; i++) {
  await p.fill('input[type="email"]', "admin@qa-learnos.test");
  await p.fill('input[type="password"]', "Demo@2026!");
  await p.click('button[type="submit"]');
  try { await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }); break; } catch {}
}
await p.evaluate(() => fetch("/api/switch-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "TENANT_ADMIN" }) }));
for (const href of pages) {
  const logs = [];
  const h = (m) => { if (m.type() === "error") logs.push(m.text()); };
  const pe = (e) => logs.push("pageerror: " + e.message + "\n" + (e.stack || "").split("\n").slice(0, 6).join("\n"));
  p.on("console", h); p.on("pageerror", pe);
  await p.goto(`${BASE}${href}`, { waitUntil: "networkidle", timeout: 180000 }).catch((e) => logs.push("goto: " + e.message));
  await p.waitForTimeout(3000);
  if (process.env.CLICK) {
    for (const name of process.env.CLICK.split("|")) {
      logs.push(`--- click ${name}`);
      await p.getByRole("button", { name, exact: false }).first().click({ timeout: 15000 }).catch((e) => logs.push("click: " + e.message.split("\n")[0]));
      await p.waitForTimeout(4000);
      logs.push(`url=${p.url()}`);
    }
  }
  console.log(`\n##### ${href}\n` + logs.map((l) => l.slice(0, 2500)).join("\n---\n"));
  p.off("console", h); p.off("pageerror", pe);
}
await b.close();
