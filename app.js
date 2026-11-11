"use strict";
// ---- data path from #d= fragment, kept in localStorage (never sent to a server: fragments aren't)
function takeD() {
  const m = location.hash.match(/(?:^#|&)d=([A-Za-z0-9_-]{32,})/);
  if (m) { localStorage.setItem("desk_d", m[1]); const r = location.hash.match(/&r=([\w/]+)/); history.replaceState(null, "", location.pathname + "#" + (r ? r[1] : "home")); return true }
}
takeD();
let D = localStorage.getItem("desk_d"), BASE = D ? `d/${D}/` : null;
const $ = s => document.querySelector(s), V = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (v, sign) => v == null ? "n/a" : (sign ? (v >= 0 ? "+" : "-") : (v < 0 ? "-" : "")) + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const big = v => v == null ? "n/a" : "$" + (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0));
const hm = t => new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const px = p => p == null ? "n/a" : "$" + (p >= 1 ? p.toFixed(4) : p.toPrecision(4));
const store = { state: null, chart: null, activity: null, coins: {}, lastOk: 0, fail: 0, range: "LIVE" };
const LAYERS = ["Mint authority", "Freeze authority", "Dev wallet", "Top 10 holders", "Liquidity", "Pool age", "Bundled wallets", "Delegations"];

// ---- fetching with error banner (keeps last good numbers)
let retryAt = 0;
async function get(path) {
  const r = await fetch(BASE + path + "?t=" + Date.now(), { cache: "no-store" });
  if (!r.ok) throw new Error(r.status); return r.json();
}
function banner() {
  const e = $("#err"); const stale = store.state && Date.now() / 1000 - store.state.ts > 15 * 60;
  if (!store.fail && !stale) { e.classList.add("hidden"); return }
  const n = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  e.textContent = `Desk offline · retrying in ${n}s · last update ${store.state ? hm(store.state.ts) : "never"}`; e.classList.remove("hidden");
}
async function poll() {
  if (!BASE) return;
  try {
    const [s, c, a] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json")]);
    store.state = s; store.chart = c; store.activity = a; store.fail = 0; store.lastOk = Date.now();
    const m = route()[1]; if (m) { try { store.coins[m] = await get(`coin/${m}.json`) } catch (e) { } }
  } catch (e) { store.fail++ }
  retryAt = Date.now() + 15000; banner(); render(false);
}
setInterval(banner, 1000);

// ---- router
function route() { const h = location.hash.slice(1) || "home"; const [p, m] = h.split("/"); return [p, m] }
addEventListener("hashchange", () => {
  if (takeD()) { D = localStorage.getItem("desk_d"); BASE = `d/${D}/`; Object.assign(store, { state: null, chart: null, activity: null, coins: {} }); render(true); poll(); return } render(true); const m = route()[1]; if (m && !store.coins[m]) poll() });

function navbar(title, extra = "") {
  return `<div class="nav"><a class="avatar" href="#account">${esc((store.state?.account?.fomo_handle || "G")[0].toUpperCase())}</a>
  <div class="navtitle">${title}</div>${extra}</div>`;
}
const sk = (h, mt = 12) => `<div class="sk" style="height:${h}px;margin:${mt}px 16px 0"></div>`;

// ---- odometer
let lastBal = null;
function odometer(v) {
  const s = usd(v); const chars = [...s];
  return `<div class="big" aria-label="${s}">` + chars.map((ch, i) => /\d/.test(ch)
    ? `<span class="odo"><span data-d="${ch}" style="transition-delay:${(chars.length - 1 - i) * 30}ms">${[...Array(10).keys()].map(d => `<i>${d}</i>`).join("")}</span></span>`
    : `<span>${ch}</span>`).join("") + `</div>`;
}
function rollOdo() { document.querySelectorAll(".odo>span").forEach(el => requestAnimationFrame(() => el.style.transform = `translateY(-${el.dataset.d}em)`)) }

// ---- shared bits
function actRow(r) {
  const tgt = r.kind === "rejected" ? `#auditor/${r.mint}` : `#coin/${r.mint}`;
  const ic = { bought: "B", sold: "S", stopped: "↓", rejected: "×" }[r.kind];
  return `<a class="row" href="${tgt}"><div class="ic ${r.kind}">${ic}</div><div class="tt"><b>${esc(r.title)}</b><span>${esc(r.subtitle)}</span></div>
  <div class="v ${r.kind === "sold" ? "up" : r.kind === "stopped" ? "down" : ""}">${esc(r.value)}</div></a>`;
}
function strips(layers) {
  return `<div class="strips">` + LAYERS.map((n, i) => { const l = (layers || []).find(x => x.n === i + 1);
    return `<div class="strip ${l ? (l.pass ? "ok" : "bad") : ""}">${esc(n)}</div>` }).join("") + `</div>`;
}
function dot(a) { return `<span class="sdot ${a.paused ? "pz" : a.alive ? "" : "off"}"></span>` }
function cards(s) {
  const A = s.agents, au = A.auditor, sc = A.scanner, an = A.analyst, ex = A.executor, rk = A.risk;
  const R = 42 * (innerWidth - 32) / 504;
  const c = (body) => `<div class="card" style="border-radius:${R}px">${body}</div>`;
  const aul = au.last;
  const auStatus = !aul ? "No coin taken apart yet" : au.running ? "taking apart..." :
    (aul.layers.length === 8 && aul.layers.every(l => l.pass)) ? "8/8 → Executor" : esc((aul.layers.find(l => !l.pass) || {}).value || "");
  const feed = sc.feed.length ? sc.feed.map(f => `<div class="${f.verdict === "kill" ? "kill" : ""}"><a class="nm" href="${f.verdict === "pass" ? "#auditor/" + f.mint : "#coin/" + f.mint}">${esc(f.name)}</a>
     <span class="rs">${f.verdict === "kill" ? esc(f.reason) : f.verdict === "pass" ? "→ auditor" : esc(f.reason || "")}</span></div>`).join("") : `<div><span class="m">Listening for graduations</span></div>`;
  const al = an.last; const exl = ex.last;
  return [
    c(`<h3>${dot(sc)}<span style="color:var(--cy)">Scanner</span></h3><div class="k">${sc.pools} pools</div><div class="m">${sc.waiting} in the waiting room</div><div class="feed">${feed}</div>`),
    c(`<h3>${dot(au)}Auditor</h3><div class="k">${au.taken} taken apart</div>${strips(aul?.layers)}<div class="m">${aul ? esc(aul.name) + " · " : ""}${auStatus}</div><div class="m" style="margin-top:auto">${au.rejected} rejected</div>`),
    c(`<h3>${dot(an)}<span style="color:var(--y)">Analyst</span></h3><div class="k">Scoring</div><canvas class="ring" id="ring"></canvas><div class="m" style="text-align:center">${al ? esc(al.name) + " · " + esc(al.reason || (al.pass ? "pass" : "")) : "Nothing scored yet"} · ${esc(an.mode)} · min ${an.min_score}</div>`),
    c(`<h3>${dot(ex)}<span style="color:var(--g)">Executor</span></h3><div class="k">${ex.trades} trades</div><div class="m">${exl ? usd(exl.size_usd) + " · " + (exl.stack_pct ?? ex.stack_pct) + "% of stack" : "No order yet · " + ex.stack_pct + "% of stack"}</div>
      <div class="bar"><i style="width:${exl ? 100 : 0}%"></i></div><div class="m">${exl ? (exl.status === "filled" || s.mode === "PAPER" ? "✓ Filled" : "Executing... " + (exl.status === "sent" ? 50 : 100) + "%") : ""}</div>`),
    c(`<h3>${dot(rk)}<span style="color:var(--p)">Risk</span></h3><div class="k">Guarding</div><div class="m">${rk.open} open</div>
      <div class="m" style="margin-top:12px">${rk.last_exit ? (rk.last_exit.reason === "trail" ? "Trailed out" : rk.last_exit.reason === "stop" ? "Stopped" : esc(rk.last_exit.reason)) + " · " + esc(rk.last_exit.name) + " " + usd(rk.last_exit.pnl, true) : "No exits yet"}</div>
      <div class="pills"><span class="pill r">stop -${rk.stop_pct}%</span><span class="pill g">trail ${rk.trail_pct}%</span></div>`)
  ].join("");
}

// ---- screens
const LPN = { pumpfun: "pump.fun", bonkfun: "BonkFun", raydium: "Raydium", meteora: "Meteora", trending: "Trending", follow: "Follow" };
const AGN = { scanner: "Scanner", auditor: "Auditor", analyst: "Analyst", executor: "Executor", risk: "Risk", logger: "Logger", follower: "Follower" };
const ago = t => { if (!t) return ""; const s = Math.max(0, Date.now() / 1000 - t); return s < 60 ? Math.floor(s) + "s" : s < 3600 ? Math.floor(s / 60) + "m" : Math.floor(s / 3600) + "h" };
function followCard(F) {
  if (!F) return "";
  const s = F.stats || {}, live = F.ws === "connected";
  const rec = (F.recent || []).length ? F.recent.map(r => `<div class="kv"><span>${esc(r.handle)} · $${esc(r.symbol || r.mint.slice(0, 6))}</span><span>${esc(r.result || "")}</span></div>`).join("") : '<div class="emptytxt" style="padding:6px 0">No trader buys seen yet. Alerts go to Telegram the moment one lands.</div>';
  return `<div class="sect"><span>Follower <small>· ${live ? F.subs + "/" + F.wallets.length + " wallets live" : esc(F.ws)}${F.latency_s != null ? " · ~" + F.latency_s + "s" : ""}</small></span></div>
  <div class="nd-card"><div class="kv"><span>Tonight</span><span>${s.buys || 0} buys · ${s.passed || 0} cleared · ${s.entries || 0} PAPER</span></div>${rec}
  <div class="nd-pills" style="margin:8px 0 2px">${F.wallets.map(w => `<span class="nd-pill">${esc(w.handle)} <b>${esc(w.short)}</b></span>`).join("")}</div></div>`;
}
function recapCard(r) {
  if (!r) return `<div class="nd-card"><h4>Morning recap</h4><div class="emptytxt" style="padding:6px 0">First recap arrives after the night ends at 8:00 AM ET.</div></div>`;
  const sg = v => (v >= 0 ? "+" : "-") + "$" + Math.abs(v).toFixed(2);
  return `<div class="nd-card"><h4>Morning recap · ${new Date(r.to * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</h4>
   <div class="kv"><span>Balance</span><span>${usd(r.balance_start)} → ${usd(r.balance_end)}</span></div>
   <div class="kv"><span>PnL</span><span class="${r.pnl >= 0 ? "up" : "down"}">${sg(r.pnl)} (${r.pnl_pct >= 0 ? "+" : ""}${r.pnl_pct.toFixed(2)}%)</span></div>
   <div class="kv"><span>Trades · W/L</span><span>${r.trades} · ${r.wins}/${r.losses}</span></div>
   <div class="kv"><span>Biggest hit</span><span class="up">${r.biggest_hit ? "$" + esc(r.biggest_hit.name) + " " + sg(r.biggest_hit.pnl) : "none"}</span></div>
   <div class="kv"><span>Worst loss</span><span class="down">${r.worst_loss ? "$" + esc(r.worst_loss.name) + " " + sg(r.worst_loss.pnl) : "none"}</span></div>
   ${r.follow ? `<div class="kv"><span>Follow</span><span>${r.follow.buys} buys · ${r.follow.entries} PAPER · W/L ${r.follow.wins}/${r.follow.losses}</span></div>` : ""}
   <div class="kv"><span>Top kills</span><span>${(r.top_kills || []).map(k => esc(k.reason) + " " + k.n).join(" · ") || "none"}</span></div></div>`;
}
function home(first) {
  const s = store.state, ch = store.chart?.LIVE, N = s?.night;
  if (!s || !N) return `<div class="nd-head"><b>NIGHT DESK</b></div>` + sk(90) + sk(200) + sk(60) + sk(300);
  const up = N.pnl >= 0, st = N.stats;
  const agentsHtml = N.agent_lines.map(a => `<div class="nd-agent"><span class="sdot ${a.paused ? "pz" : a.alive ? "" : "off"}"></span><b>${AGN[a.agent]}</b><span class="ln">${esc(a.line)}</span><span class="ag">${ago(a.line_ts)}</span></div>`).join("");
  const tally = N.kill_tally.length ? N.kill_tally.map(k => `<div class="kv"><span>${esc(k.reason)}</span><span>${k.n}</span></div>`).join("") : '<div class="emptytxt" style="padding:6px 0">No kills logged tonight</div>';
  const trades = N.closed.length ? N.closed.map(t => `<a class="row" href="#coin/${t.mint}"><div class="ic ${t.pnl >= 0 ? "sold" : "stopped"}">${t.pnl >= 0 ? "▲" : "▼"}</div><div class="tt"><b>$${esc(t.name)}</b><span>${hm(t.ts)} · ${esc(t.reason)} · ${esc(LPN[t.launchpad] || t.launchpad)}</span></div><div class="v ${t.pnl >= 0 ? "up" : "down"}">${usd(t.pnl, true)}<br><small>${t.pct >= 0 ? "+" : ""}${t.pct}%</small></div></a>`).join("") : '<div class="emptytxt">No closed trades yet. PAPER trades show here once a coin clears all 5 agents.</div>';
  const pills = Object.entries(N.launchpads).map(([k, n]) => { const src = k === "pumpfun" ? N.sources.pumpportal : k === "follow" ? (N.follow && N.follow.ws !== "connected" && !String(N.follow.ws).startsWith("starting") ? { ok: false, why: N.follow.ws } : null) : k === "trending" ? (N.sources.gt_trending?.ok === false && N.sources.dexscreener_boosts?.ok === false ? N.sources.gt_trending : null) : N.sources.geckoterminal; const off = src && src.ok === false;
    return `<span class="nd-pill ${off ? "off" : ""}" title="${esc(off ? src.why : "")}">${esc(LPN[k] || k)} <b>${n}</b></span>` }).join("");
  V.innerHTML = `<div class="nd-head"><b>NIGHT DESK</b><span class="nd-sub">${N.agents_running}/${N.agents_total} agents</span><span class="nd-mode ${N.mode === "LIVE" ? "live" : ""}">${esc(N.mode)}</span></div>
  <div class="bal">${odometer(N.balance)}</div>
  <div class="sub"><span class="${up ? "up" : "down"}">${usd(N.pnl, true)} (${up ? "+" : ""}${N.pnl_pct.toFixed(2)}%)</span><span class="mult">${N.multiplier.toFixed(2)}×</span><span style="color:var(--t2);font-size:13px">vs ${usd(N.start)} night start</span></div>
  <div class="chartwrap" style="height:200px"><canvas id="line"></canvas>${(ch?.points || []).length < 2 ? '<div class="empty-chart">Equity line starts with the first balance points</div>' : !(ch?.marks || []).length ? '<div class="empty-chart">Flat: no trades yet tonight</div>' : ""}</div>
  <div class="nd-stats"><div><small>SCANNED</small>${st.scanned}</div><div><small>PASSED</small>${st.passed}</div><div><small>TRADES</small>${st.trades}</div><div><small>W-L</small>${st.wins}-${st.losses}</div></div>
  <div class="nd-pills">${pills}</div>
  <div class="sect"><span>Agents <small>· live</small></span><a href="#agents">See all</a></div><div class="nd-card">${agentsHtml}</div>
  <div class="sect"><span>Logger <small>· ${N.kills_tonight} kills tonight</small></span></div><div class="nd-card">${tally}</div>
  ${followCard(N.follow)}
  ${recapCard(N.recap)}
  <div class="sect"><span>Closed trades</span></div><div class="rows nd-trades">${trades}</div>`;
  requestAnimationFrame(() => { $("#line") && Charts.line($("#line"), ch || { points: [] }, N.start); rollOdo() });
  return null;
}
function agents() {
  const s = store.state; if (!s) return navbar("Agents") + [1, 2, 3, 4, 5].map(() => sk(300)).join("");
  const C = { scanner: ["Scanner", "pools", "var(--cy)"], auditor: ["Auditor", "taken", "#fff"], analyst: ["Analyst", "scored", "var(--y)"], executor: ["Executor", "trades", "var(--g)"], risk: ["Risk", "open", "var(--p)"] };
  return navbar("Agents") + Object.entries(C).map(([k, [nm, f, col]]) => { const a = s.agents[k];
    const rows = s.decisions[k].map(d => `<div class="dec"><span style="color:var(--t2)">${hm(d.ts)}</span><span><a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.name)}</a> <span style="color:var(--t2)">${esc(d.verdict ?? (d.pass ? "pass" : "reject"))}</span></span><span class="r">${esc(d.reason ?? (d.score != null ? "score " + d.score : ""))}</span></div>`).join("");
    return `<div class="agentfull"><h3>${dot(a)}<span style="color:${col}">${nm}</span><span class="ro">${a.paused ? "Paused" : "Running"} · Telegram: ${a.paused ? "resume" : "pause"} ${k}</span></h3>
     <div class="m" style="color:var(--t2)">${a[f] ?? 0} ${f} today</div>${rows || '<div class="emptytxt">No decisions yet</div>'}
     <a class="btn sec" href="#account" style="margin:12px 0 0;width:100%">Settings</a></div>` }).join("");
}
function activityScreen() {
  const a = store.activity; if (!a) return navbar("Activity") + [1, 2, 3, 4, 5, 6].map(() => sk(52, 8)).join("");
  const rows = a.pages.flat();
  return navbar("Activity") + `<div class="rows">${rows.length ? rows.map(actRow).join("") : '<div class="emptytxt">Nothing yet tonight</div>'}</div>`;
}
const beamDone = {};
function auditorScreen(m, first) {
  const c = store.coins[m]; if (!c) return `<a class="back" href="#home">‹ Back</a>` + sk(260) + sk(400);
  const L = c.layers, bad = L.find(l => !l.pass), cleared = c.verdict === "cleared";
  const vrows = LAYERS.map((n, i) => { const l = L.find(x => x.n === i + 1);
    return `<div class="kv"><span>${i + 1}. ${esc(n)}</span><span class="${l ? (l.pass ? "up" : "down") : ""}">${l ? (l.pass ? "✓ " : "✗ ") + esc(l.value) : "not checked"}</span></div>` }).join("");
  V.innerHTML = `<a class="back" href="#home">‹ Back</a><div class="nav"><div class="navtitle" style="font-size:22px">${esc(c.name || m.slice(0, 6))} ${c.mode === "PAPER" ? '<span class="paper">PAPER</span>' : ""}</div></div>
  <div class="discs">${LAYERS.map((n, i) => `<div class="disc" id="disc${i + 1}">${i + 1}</div>`).join("")}</div>
  <div class="verdict">${!L.length ? '<b>No coin taken apart yet</b>' : bad ? `<b class="down">Rejected · ${esc(bad.value)}</b><span style="color:var(--t2)">Grok Bot won't buy ${esc(c.name || m.slice(0, 6))}</span>` : cleared ? `<b class="up">Cleared · 8/8 parts</b><span style="color:var(--t2)">Sent to Executor · ${c.sent_usd != null ? usd(c.sent_usd) : "not sized"}</span>` : "<b>taking apart...</b>"}</div>
  <div class="group" style="margin-top:14px">${vrows}</div>
  <div class="group"><div class="kv"><span>Take apart before buying</span><span>${store.state?.account?.settings?.auditor?.enabled === false ? "Off" : "On"} · read-only</span></div></div>
  <a class="btn" href="${esc(c.coin_url)}" target="_blank" rel="noopener">Open on FOMO</a>`;
  // beam: reads only layers the server actually sent
  const paint = (i) => { const l = L.find(x => x.n === i); const d = $("#disc" + i); if (d && l) { d.classList.remove("beam"); d.classList.add(l.pass ? "ok" : "bad"); d.textContent = (l.pass ? "✓ " : "✗ ") + LAYERS[i - 1] } };
  if (Charts.reduce || beamDone[m] === L.length) { for (let i = 1; i <= 8; i++) paint(i); return null }
  const from = beamDone[m] || 0; for (let i = 1; i <= from; i++) paint(i); beamDone[m] = L.length;
  L.map(l => l.n).filter(n => n > from).sort((a, b) => a - b).forEach((n, k) => {
    setTimeout(() => { const d = $("#disc" + n); d && d.classList.add("beam") }, k * 500);
    setTimeout(() => paint(n), k * 500 + 350);
  });
  return null;
}
function coinScreen(m) {
  const c = store.coins[m]; if (!c) return `<a class="back" href="#home">‹ Back</a>` + sk(60) + sk(70) + sk(240) + sk(160);
  const p = c.position, open = p && p.status !== "closed", age = c.migrated_at ? Math.floor((Date.now() / 1000 - c.migrated_at) / 3600) : null;
  const ch = p && c.price ? 100 * (c.price / p.entry_price - 1) : null, sh = c.layers.length ? `${c.layers.filter(l => l.pass).length}/8` : null;
  const ex = c.exit, tl = ex ? `${Math.floor(ex.timeout_left_s / 3600)}h ${Math.floor(ex.timeout_left_s % 3600 / 60)}m` : "";
  V.innerHTML = `<a class="back" href="#home">‹ Back</a><div class="nav" style="flex-wrap:wrap"><div class="navtitle" style="font-size:22px">${esc(c.name || m.slice(0, 6))}</div>${c.mode === "PAPER" ? '<span class="paper">PAPER</span>' : ""}
   ${sh ? `<a href="#auditor/${m}" class="chip ${c.verdict === "rejected" ? "bad" : ""}">🛡 ${sh}</a>` : ""}</div>
  <div style="padding:0 16px;color:var(--t2)">${esc(c.symbol || "")} · Solana${age != null ? " · " + age + "h old" : ""}</div>
  <div style="padding:8px 16px 0;font:700 44px -apple-system,system-ui,sans-serif">${px(c.price)}</div>
  ${ch != null ? `<div class="sub"><span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}% since entry</span></div>` : ""}
  <div class="chartwrap"><canvas id="cnd"></canvas></div>
  <div class="stats"><div><small>Market cap</small>${big(c.stats.mcap)}</div><div><small>Liquidity</small>${big(c.stats.liquidity)}</div><div><small>24h volume</small>${big(c.stats.vol24)}</div><div><small>Holders</small>${c.stats.holders ?? "n/a"}</div></div>
  ${p ? `<div class="group"><div class="kv"><span>Your position · ${usd(p.size_usd)} in · Executor</span><span>${open ? "open" : "closed " + usd(p.pnl_usd, true)}</span></div></div>` : ""}
  ${open && ex ? `<div class="group"><h4>Exit</h4><div class="kv"><span>Stop line (-${ex.stop_pct}%)</span><span>${px(ex.stop_line)}</span></div><div class="kv"><span>Trail line</span><span>${ex.trail_line ? px(ex.trail_line) : "starts at " + px(ex.trail_at)}</span></div><div class="kv"><span>Time left to timeout</span><span>${tl}</span></div></div>` : ""}
  <a class="btn" href="${esc(c.coin_url)}" target="_blank" rel="noopener">${open ? "Sell on FOMO" : "Buy on FOMO"}</a>`;
  requestAnimationFrame(() => Charts.candles($("#cnd"), c.candles, open && ex ? ex.exit_line : null));
  return null;
}
function account() {
  const s = store.state; if (!s) return navbar("Account") + sk(120) + sk(300);
  const a = s.account; const grp = Object.entries(a.settings).map(([g, kv]) => `<div class="group"><h4>${esc(g)}</h4>${Object.entries(kv).map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(typeof v === "object" ? JSON.stringify(v) : v)}</span></div>`).join("")}</div>`).join("");
  return navbar("Account") + `<div class="group"><div class="kv"><span>Mode</span><span>${a.mode === "PAPER" ? '<span class="paper">PAPER</span>' : "LIVE"} · type LIVE in Telegram</span></div>
   <div class="kv"><span>Stack</span><span>${a.mode === "PAPER" ? usd(s.balance) + " paper (start " + usd(a.paper_start_stack) + ")" : a.stack != null ? usd(a.stack) : "not set · Telegram: stack N"}</span></div></div>
  <a class="btn" href="${esc(a.profile_url)}" target="_blank" rel="noopener">Your FOMO profile</a>
  <button class="btn sec" id="inv" data-u="${esc(a.signup_url)}">Invite a friend</button>
  <div class="group"><h4>Notifications</h4><div class="kv"><span>Telegram</span><span>${a.telegram ? "Connected" : "Not connected"}</span></div>
   <div class="kv"><span>Send test push</span><span>Telegram: test</span></div><div class="kv"><span>Web push</span><span>${esc(a.webpush)}</span></div></div>
  <div class="sect"><span>Settings <small>· read-only, change in Telegram</small></span></div>${grp}`;
}
function render(first) {
  const [p, m] = route(); document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === p));
  if (!BASE) { V.innerHTML = navbar("Grok Bot") + `<div class="emptytxt">Open the desk link once (it carries #d=…) to connect this phone.</div>`; return }
  if (p === "home" && !first && document.activeElement?.id === "q") return; // don't wipe search while typing
  const h = p === "agents" ? agents() : p === "activity" ? activityScreen() : p === "account" ? account() : p === "coin" ? coinScreen(m) : p === "auditor" ? auditorScreen(m, first) : home(first);
  if (h != null) V.innerHTML = h;
  const inv = $("#inv"); if (inv) inv.onclick = async () => { const u = inv.dataset.u; try { await navigator.share({ url: u }) } catch (e) { try { await navigator.clipboard.writeText(u) } catch (_) { } const t = document.createElement("div"); t.className = "toast"; t.textContent = "Link copied"; document.body.append(t); setTimeout(() => t.remove(), 1800) } };
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { });
render(true); poll(); setInterval(poll, 15000);
