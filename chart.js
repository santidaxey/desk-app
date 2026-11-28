// hand-drawn canvas charts, devicePixelRatio aware
const Charts = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setup(cv) {
    const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
    cv.width = r.width * d; cv.height = r.height * d; const g = cv.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); return [g, r.width, r.height];
  }
  function line(cv, data, start, opt = {}) {
    const [g, W, H] = setup(cv); g.clearRect(0, 0, W, H);
    const pts = data.points || [], top = 64, bot = H - 12;
    const vals = pts.map(p => p[1]).concat([start]);
    let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < 1e-9) { hi += 1; lo -= 1 }
    const t0 = pts.length ? pts[0][0] : 0, t1 = pts.length ? pts[pts.length - 1][0] : 1;
    const X = t => pts.length < 2 ? W : 16 + (W - 32) * (t - t0) / Math.max(1, t1 - t0);
    const Y = v => bot - (bot - top) * (v - lo) / (hi - lo);
    // dashed start line
    g.setLineDash([4, 5]); g.strokeStyle = "rgba(235,235,245,0.3)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, Y(start)); g.lineTo(W, Y(start)); g.stroke(); g.setLineDash([]);
    if (pts.length < 2) return;
    const grad = g.createLinearGradient(0, top, 0, bot); grad.addColorStop(0, "rgba(0,211,90,0.28)"); grad.addColorStop(1, "rgba(0,211,90,0)");
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.lineTo(X(t1), bot); g.lineTo(X(t0), bot); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])));
    g.strokeStyle = "#00d35a"; g.lineWidth = 2; g.stroke();
    // marks, never overlap: a later mark moves up a row
    g.font = "600 12px -apple-system, system-ui, sans-serif"; const placed = [];
    const val = t => { let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p; return best[1] };
    for (const m of data.marks || []) {
      if (m.ts < t0) continue;
      const w = g.measureText(m.label).width + 14, x = Math.min(Math.max(X(m.ts) - w / 2, 4), W - w - 4);
      let row = 0; while (placed.some(p => p.row === row && x < p.x + p.w + 4 && p.x < x + w + 4)) row++;
      placed.push({ x, w, row });
      const y = Math.max(4, Math.min(Y(val(m.ts)) - 30 - row * 26, top - 30 + 30));
      const c = { bought: "#0a84ff", sold: "#00d35a", stopped: "#ff453a" }[m.kind];
      g.fillStyle = c; g.globalAlpha = .18; g.beginPath(); g.roundRect(x, y, w, 22, 11); g.fill(); g.globalAlpha = 1;
      g.fillStyle = c; g.fillText(m.label, x + 7, y + 15);
    }
  }
  function candles(cv, cs, exitLine) {
    const [g, W, H] = setup(cv); g.clearRect(0, 0, W, H);
    if (!cs.length) { g.fillStyle = "rgba(235,235,245,0.6)"; g.font = "15px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.fillText("No price data yet", W / 2, H / 2); return }
    const vh = 40, top = 10, bot = H - vh - 8;
    let lo = Math.min(...cs.map(c => c[3])), hi = Math.max(...cs.map(c => c[2]));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine) }
    if (hi - lo < 1e-15) { hi *= 1.01; lo *= 0.99 }
    const n = Math.min(cs.length, 60), arr = cs.slice(-n), bw = (W - 32) / n;
    const Y = v => bot - (bot - top) * (v - lo) / (hi - lo); const vmax = Math.max(1e-9, ...arr.map(c => c[5]));
    arr.forEach((c, i) => {
      const x = 16 + i * bw + bw / 2, up = c[4] >= c[1]; g.strokeStyle = g.fillStyle = up ? "#00d35a" : "#ff453a";
      g.beginPath(); g.moveTo(x, Y(c[2])); g.lineTo(x, Y(c[3])); g.stroke();
      const y1 = Y(Math.max(c[1], c[4])), y2 = Y(Math.min(c[1], c[4])); g.fillRect(x - bw * .35, y1, bw * .7, Math.max(1, y2 - y1));
      g.globalAlpha = .5; const h = vh * c[5] / vmax; g.fillRect(x - bw * .35, H - h, bw * .7, h); g.globalAlpha = 1;
    });
    if (exitLine) {
      g.setLineDash([6, 5]); g.strokeStyle = "#ff9f0a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, Y(exitLine)); g.lineTo(W, Y(exitLine)); g.stroke(); g.setLineDash([]);
      g.fillStyle = "#ff9f0a"; g.font = "600 12px -apple-system, system-ui, sans-serif"; g.fillText("Risk trailing stop", 16, Y(exitLine) - 6);
    }
  }
  function ring(cv, score, min) {
    const [g, W, H] = setup(cv), r = Math.min(W, H) / 2 - 8; g.clearRect(0, 0, W, H); g.lineWidth = 10; g.lineCap = "round";
    g.strokeStyle = "#2c2c2e"; g.beginPath(); g.arc(W / 2, H / 2, r, 0, 2 * Math.PI); g.stroke();
    if (score != null) { g.strokeStyle = score >= min ? "#00d35a" : "#ffd60a"; g.beginPath(); g.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * score / 100); g.stroke() }
    g.fillStyle = "#fff"; g.font = "700 34px -apple-system, system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(score == null ? "–" : score, W / 2, H / 2);
  }
  return { line, candles, ring, reduce };
})();
