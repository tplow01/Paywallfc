import Head from "next/head";
import { useState, useEffect, useRef, useCallback } from "react";
import { CLUBS, getClubByKey } from "../lib/clubs";
import { isBlackout, PRICES } from "../lib/calculator";

// ─── Video interrupt popup sequence ──────────────────────────────────────────
const POPUP_SEQUENCE = [
  {
    id: 1, delay: 1500, duration: 3800,
    type: "subscribe", brand: "sky",
    headline: "Subscribe to continue watching",
    sub: "From £34.99/month. No contract required.",
    cta: "Start your subscription",
    dismiss: "Not now",
  },
  {
    id: 2, delay: 6800, duration: 3200,
    type: "blackout",
    headline: "Match unavailable",
    sub: "This fixture falls within the 14:45–17:15 Saturday blackout window under UK broadcasting regulations. No live coverage is permitted.",
  },
  {
    id: 3, delay: 11400, duration: 1800,
    type: "stat",
    stat: "£349.90",
    label: "Sky Sports. Every season.",
  },
  {
    id: 4, delay: 14400, duration: 3200,
    type: "subscribe", brand: "tnt",
    headline: "This match is on TNT Sports",
    sub: "Add TNT Sports to your package from £30.99/month.",
    cta: "Upgrade now",
    dismiss: "Cancel",
  },
  {
    id: 5, delay: 18800, duration: 1600,
    type: "stat",
    stat: "113",
    label: "Games blacked out. Every season.",
  },
  {
    id: 6, delay: 21800, duration: 2800,
    type: "expired",
    headline: "Your free trial has ended",
    sub: "Continue watching Premier League football from £34.99/month.",
    cta: "Subscribe",
    dismiss: "Log out",
  },
  {
    id: 7, delay: 26000, duration: 1000,
    type: "stat",
    stat: "£309.90",
    label: "TNT Sports. Per season.",
  },
  {
    id: 8, delay: 27500, duration: 1000,
    type: "stat",
    stat: "£145.32",
    label: "TV Licence. Still required.",
  },
  {
    id: 9, delay: 29000, duration: 1000,
    type: "stat",
    stat: "30%",
    label: "Of games. Unwatchable.",
  },
  {
    id: 10, delay: 30500, duration: 6000,
    type: "final",
    stat: "£805.12",
    label: "A year. And you still can't watch this.",
    cta: "Sign the petition",
  },
];

// ─── Constants ───────────────────────────────────────────────────────────────
const SEASON_MONTHS    = 10;
const SKY_MONTHLY      = PRICES.skyNow;     // £34.99
const TNT_MONTHLY      = PRICES.tnt;        // £30.99
const SKY_SEASON       = SKY_MONTHLY  * SEASON_MONTHS;
const TNT_SEASON       = TNT_MONTHLY  * SEASON_MONTHS;
const TVLIC_SEASON     = (8 * PRICES.tvLicEarly) + (2 * PRICES.tvLicLate);
const TOTAL_SEASON     = SKY_SEASON + TNT_SEASON + TVLIC_SEASON;
const PINT_PRICE       = 6.20; // avg UK pint 2025/26

// Consistent number formatter — avoids toLocaleString() locale mismatch between Node and browser
function numFmt(n) {
  const str = Math.round(n).toString();
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function monthsElapsed() {
  const start = new Date("2025-08-15");
  const today = new Date();
  const ms    = Math.max(0, today - start);
  return Math.min(ms / (1000 * 60 * 60 * 24 * 30.44), SEASON_MONTHS);
}
function calcSoFar(months) {
  const tvLic = months <= 8
    ? months * PRICES.tvLicEarly
    : (8 * PRICES.tvLicEarly) + ((months - 8) * PRICES.tvLicLate);
  return (SKY_MONTHLY + TNT_MONTHLY) * months + tvLic;
}
function fmt(n)  { return "£" + n.toFixed(2); }
function fmtR(n) { return "£" + numFmt(n); }
function formatDate(utcDate) {
  return new Date(utcDate).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function formatTime(utcDate) {
  return new Date(utcDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function getResult(match, teamId) {
  if (match.status !== "FINISHED") return null;
  const h = match.score.fullTime.home;
  const a = match.score.fullTime.away;
  const isHome = match.homeTeam.id === teamId;
  const score  = isHome ? `${h}–${a}` : `${a}–${h}`;
  const diff   = isHome ? h - a : a - h;
  return { score, result: diff > 0 ? "W" : diff < 0 ? "L" : "D" };
}

// ─── Intersection observer hook ──────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

// ─── Animated counter hook ───────────────────────────────────────────────────
function useCountUp(target, duration = 2000, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start || typeof window === "undefined") return;
    let startTime = null;
    let raf;
    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setValue(ease * target);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);
  return value;
}

// ─── Animated stat ────────────────────────────────────────────────────────────
function AnimStat({ prefix = "", value, suffix = "", decimals = 0, label, accent }) {
  const [ref, inView] = useInView(0.3);
  const count = useCountUp(value, 1800, inView);
  const display = decimals > 0 ? count.toFixed(decimals) : numFmt(count);
  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(20px)", transition: "opacity 0.6s ease, transform 0.6s ease" }}>
      <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "clamp(3.5rem, 9vw, 7rem)", lineHeight: 0.9, color: accent || "#fed107", letterSpacing: "-0.02em" }}>
        {prefix}{display}{suffix}
      </div>
      <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "clamp(0.78rem, 2vw, 0.95rem)", color: "rgba(223,235,247,0.4)", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "0.6rem" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Blackout visual ─────────────────────────────────────────────────────────
function BlackoutVisual() {
  const [ref, inView] = useInView(0.2);
  const bars = [
    { label: "Total PL games", value: 380, max: 380, color: "rgba(223,235,247,0.2)" },
    { label: "Streamable (Sky + TNT)", value: 267, max: 380, color: "#fed107", emphasis: true },
    { label: "3pm blackouts", value: 113, max: 380, color: "#e03535" },
  ];
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {bars.map((bar, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: bar.emphasis ? "0.9rem" : "0.82rem", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.45rem" }}>
            <span style={{ color: bar.emphasis ? "#dfebf7" : "rgba(223,235,247,0.6)" }}>{bar.label}</span>
            <span style={{ color: bar.emphasis ? "#fed107" : (bar.color === "rgba(223,235,247,0.2)" ? "rgba(223,235,247,0.4)" : bar.color), textShadow: bar.emphasis ? "0 0 12px rgba(254,209,7,0.35)" : "none" }}>{bar.value}</span>
          </div>
          <div style={{ height: bar.emphasis ? "14px" : "8px", background: "rgba(223,235,247,0.06)", borderRadius: "2px", overflow: "hidden", border: bar.emphasis ? "1px solid rgba(254,209,7,0.25)" : "none" }}>
            <div style={{ height: "100%", borderRadius: "2px", background: bar.color, width: inView ? `${(bar.value / bar.max) * 100}%` : "0%", transition: `width 1.5s cubic-bezier(0.25,1,0.5,1) ${i * 0.18}s`, boxShadow: bar.emphasis ? "0 0 20px rgba(254,209,7,0.45)" : "none" }} />
          </div>
        </div>
      ))}
      <div style={{ marginTop: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        {[
          { label: "Sky Sports", value: "215", color: "#4a90d9" },
          { label: "TNT Sports", value: "52",  color: "#f0a500" },
          { label: "Blacked out", value: "113", color: "#e03535" },
          { label: "Cost per game", value: "≈£3.02", color: "#fed107" },
        ].map((item, i) => (
          <div key={i} style={{ padding: "1.1rem", border: `1px solid ${item.color}30`, background: `${item.color}0a` }}>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "1.6rem", color: item.color, lineHeight: 1 }}>{item.value}</div>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 500, fontSize: "0.7rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(223,235,247,0.35)", marginTop: "0.3rem" }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pints comparison ────────────────────────────────────────────────────────
function PintsComparison({ cpg, totalSpent, clubName }) {
  const pintsPerGame   = cpg / PINT_PRICE;
  const pintsTotal     = totalSpent / PINT_PRICE;
  const roundsForLads  = Math.floor(pintsTotal / 4);
  const [ref, inView]  = useInView(0.2);

  const glasses = Math.min(Math.round(pintsPerGame), 20);

  return (
    <div ref={ref} style={{ opacity: inView ? 1 : 0, transform: inView ? "none" : "translateY(24px)", transition: "opacity 0.6s ease, transform 0.6s ease", marginTop: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ width: "2rem", height: "1.5px", background: "#fed107" }} />
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.25em", textTransform: "uppercase", color: "#fed107" }}>
          Put it in perspective
        </div>
      </div>

      {/* Per-game VS card */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", border: "1px solid rgba(223,235,247,0.1)", overflow: "hidden", marginBottom: "1rem" }}>
        {/* Left — subscription */}
        <div style={{ padding: "1.5rem 1.25rem", background: "rgba(223,235,247,0.03)" }}>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(223,235,247,0.4)", marginBottom: "0.6rem" }}>Per game you watch</div>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "2.2rem", color: "#dfebf7", lineHeight: 1 }}>{fmt(cpg)}</div>
          <div style={{ fontSize: "0.82rem", color: "rgba(223,235,247,0.45)", marginTop: "0.4rem", lineHeight: 1.5 }}>split across Sky, TNT &amp; TV Licence</div>
        </div>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", background: "rgba(254,209,7,0.08)", borderLeft: "1px solid rgba(254,209,7,0.15)", borderRight: "1px solid rgba(254,209,7,0.15)" }}>
          <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "1.1rem", color: "#fed107", letterSpacing: "0.05em" }}>OR</span>
        </div>

        {/* Right — pints */}
        <div style={{ padding: "1.5rem 1.25rem", background: "rgba(254,209,7,0.04)" }}>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(254,209,7,0.6)", marginBottom: "0.6rem" }}>Pints at the pub</div>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "2.2rem", color: "#fed107", lineHeight: 1 }}>
            {pintsPerGame.toFixed(1)}
          </div>
          <div style={{ fontSize: "0.82rem", color: "rgba(254,209,7,0.5)", marginTop: "0.4rem", lineHeight: 1.5 }}>pints at £{PINT_PRICE.toFixed(2)} each</div>
          {/* Pint markers */}
          <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "3px" }}>
            {Array.from({ length: glasses }).map((_, i) => (
              <span key={i} style={{ width: "10px", height: "14px", border: "1px solid rgba(254,209,7,0.45)", background: "rgba(254,209,7,0.18)", display: "inline-block" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Season total card */}
      <div style={{ padding: "1.5rem", background: "rgba(254,209,7,0.06)", border: "1px solid rgba(254,209,7,0.15)" }}>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(254,209,7,0.6)", marginBottom: "1rem" }}>
          What you've paid so far this season
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "2.8rem", color: "#dfebf7", lineHeight: 1 }}>{fmtR(totalSpent)}</div>
            <div style={{ fontSize: "0.82rem", color: "rgba(223,235,247,0.4)", marginTop: "0.3rem" }}>spent on subscriptions</div>
          </div>
          <div>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "2.8rem", color: "#fed107", lineHeight: 1 }}>{Math.floor(pintsTotal)}</div>
            <div style={{ fontSize: "0.82rem", color: "rgba(254,209,7,0.5)", marginTop: "0.3rem" }}>pints that could've bought</div>
          </div>
        </div>
        <div style={{ marginTop: "1.25rem", padding: "1rem 1.25rem", background: "rgba(18,18,18,0.6)", borderLeft: "3px solid #fed107" }}>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontStyle: "italic", fontWeight: 700, fontSize: "1.05rem", color: "#dfebf7", lineHeight: 1.5 }}>
            That's roughly <span style={{ color: "#fed107" }}>{roundsForLads} rounds</span> for you and three mates at the pub — watching {clubName} on the big screen, for free.
          </div>
        </div>
        <div style={{ marginTop: "1rem", fontSize: "0.78rem", color: "rgba(223,235,247,0.25)", lineHeight: 1.6 }}>
          Based on avg UK pint price of £{PINT_PRICE.toFixed(2)} (2025/26). Pub prices vary. The irony doesn't.
        </div>
      </div>
    </div>
  );
}

// ─── Match row ────────────────────────────────────────────────────────────────
function MatchRow({ match, teamId, cpg }) {
  const blacked  = isBlackout(match.utcDate);
  const result   = getResult(match, teamId);
  const isHome   = match.homeTeam.id === teamId;
  const opponent = isHome
    ? (match.awayTeam.shortName || match.awayTeam.name)
    : "@ " + (match.homeTeam.shortName || match.homeTeam.name);
  const resColor = result
    ? result.result === "W" ? "#4caf50" : result.result === "L" ? "#e03535" : "rgba(223,235,247,0.4)"
    : "rgba(223,235,247,0.3)";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "90px 1fr 50px 72px",
      gap: "0 8px", alignItems: "center", padding: "8px 10px",
      marginBottom: "3px", borderRadius: "2px",
      background: blacked ? "rgba(224,53,53,0.07)" : "rgba(223,235,247,0.03)",
      border: `1px solid ${blacked ? "rgba(224,53,53,0.2)" : "rgba(223,235,247,0.07)"}`,
    }}>
      <div style={{ fontSize: "0.72rem", color: "rgba(223,235,247,0.4)", lineHeight: 1.4 }}>
        <div>{formatDate(match.utcDate)}</div>
        <div style={{ fontSize: "0.68rem", color: "rgba(223,235,247,0.25)" }}>{formatTime(match.utcDate)}</div>
      </div>
      <div style={{ fontSize: "0.85rem", fontWeight: 500, color: blacked ? "rgba(224,53,53,0.7)" : "rgba(223,235,247,0.8)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
        {opponent}
        {blacked && <span style={{ fontSize: "0.62rem", fontFamily: "'Kanit', sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(224,53,53,0.15)", color: "#e03535", padding: "2px 5px" }}>BLOCKED</span>}
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 700, textAlign: "right", fontFamily: "'Kanit', sans-serif", color: resColor }}>
        {result ? result.score : "—"}
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, textAlign: "right", fontFamily: "'Kanit', sans-serif", color: blacked ? "#e03535" : "rgba(223,235,247,0.6)" }}>
        {blacked ? "—" : fmt(cpg)}
      </div>
    </div>
  );
}

// ─── Video placeholder ────────────────────────────────────────────────────────
function VideoPlaceholder() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #1c2e1c 0%, #0d1a0d 45%, #090f09 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Pitch markings */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.18 }}>
        <div style={{ position: "absolute", inset: "5%", border: "1px solid rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", top: "5%", bottom: "5%", left: "50%", width: "1px", background: "rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "16%", paddingBottom: "16%", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.7)" }} />
        <div style={{ position: "absolute", top: "22%", left: "5%", width: "14%", height: "56%", border: "1px solid rgba(255,255,255,0.7)", borderLeft: "none" }} />
        <div style={{ position: "absolute", top: "22%", right: "5%", width: "14%", height: "56%", border: "1px solid rgba(255,255,255,0.7)", borderRight: "none" }} />
        <div style={{ position: "absolute", top: "35%", left: "5%", width: "7%", height: "30%", border: "1px solid rgba(255,255,255,0.7)", borderLeft: "none" }} />
        <div style={{ position: "absolute", top: "35%", right: "5%", width: "7%", height: "30%", border: "1px solid rgba(255,255,255,0.7)", borderRight: "none" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "6px", height: "6px", borderRadius: "50%", background: "rgba(255,255,255,0.7)" }} />
      </div>
      {/* Atmosphere vignette */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.55) 100%)" }} />
      {/* Broadcast top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "0.6rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(180deg, rgba(0,0,0,0.75), transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#e03535", boxShadow: "0 0 6px #e03535", animation: "livePulse 1.4s ease-in-out infinite" }} />
          <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.2em", color: "#fff" }}>LIVE</span>
          <span style={{ fontFamily: "'Kanit', sans-serif", fontSize: "0.6rem", color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em" }}>PREMIER LEAGUE</span>
        </div>
        <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.65rem", color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em" }}>HD</span>
      </div>
      {/* Score bug */}
      <div style={{ position: "absolute", top: "0.65rem", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.8)", padding: "0.35rem 0.9rem", display: "flex", alignItems: "center", gap: "0.65rem" }}>
        <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.05em", color: "#fff" }}>HOME</span>
        <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "0.9rem", color: "#fed107", padding: "0 0.4rem", letterSpacing: "0.05em" }}>2 – 1</span>
        <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.72rem", letterSpacing: "0.05em", color: "#fff" }}>AWAY</span>
      </div>
      {/* Match time */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0.6rem 1rem", background: "linear-gradient(0deg, rgba(0,0,0,0.75), transparent)" }}>
        <span style={{ fontFamily: "'Kanit', sans-serif", fontSize: "0.6rem", letterSpacing: "0.15em", color: "rgba(255,255,255,0.3)" }}>67' — MATCH IN PROGRESS</span>
      </div>
      {/* Noise texture */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")", pointerEvents: "none" }} />
      {/* Placeholder watermark */}
      <span style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(255,255,255,0.06)", userSelect: "none" }}>Match Footage</span>
    </div>
  );
}

// ─── Popup overlay ────────────────────────────────────────────────────────────
function PopupOverlay({ popup, onDismiss }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const base = { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: visible ? 1 : 0, transition: "opacity 0.18s ease" };

  if (popup.type === "stat") {
    return (
      <div style={{ ...base, background: "rgba(8,8,8,0.93)", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(4rem, 12vw, 8rem)", color: "#fed107", lineHeight: 0.88, letterSpacing: "-0.03em", textAlign: "center" }}>{popup.stat}</div>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "clamp(0.7rem, 2vw, 0.95rem)", letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(223,235,247,0.45)", textAlign: "center" }}>{popup.label}</div>
      </div>
    );
  }

  if (popup.type === "final") {
    return (
      <div style={{ ...base, background: "rgba(8,8,8,0.97)", flexDirection: "column", gap: "1rem" }}>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "clamp(0.65rem, 1.5vw, 0.8rem)", letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(223,235,247,0.3)" }}>Total annual cost</div>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(3.5rem, 10vw, 7rem)", color: "#fed107", lineHeight: 0.88, letterSpacing: "-0.03em", textAlign: "center" }}>{popup.stat}</div>
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "clamp(0.75rem, 2vw, 1rem)", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(223,235,247,0.5)", textAlign: "center", maxWidth: "320px", lineHeight: 1.5 }}>{popup.label}</div>
        <a href="#petition" onClick={onDismiss} style={{ marginTop: "0.75rem", fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(0.72rem, 1.8vw, 0.85rem)", letterSpacing: "0.16em", textTransform: "uppercase", padding: "0.9rem 2.25rem", background: "#fed107", color: "#121212", border: "none", cursor: "pointer", display: "inline-block", textDecoration: "none" }}>{popup.cta} →</a>
      </div>
    );
  }

  if (popup.type === "blackout") {
    return (
      <div style={{ ...base, background: "rgba(224,53,53,0.06)", backdropFilter: "blur(3px)" }}>
        <div style={{ background: "#0e0e0e", border: "1px solid rgba(224,53,53,0.35)", padding: "2rem 2.25rem", maxWidth: "400px", width: "88%", textAlign: "center" }}>
          <div style={{ width: "2.75rem", height: "2.75rem", borderRadius: "50%", background: "rgba(224,53,53,0.08)", border: "1px solid rgba(224,53,53,0.35)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.1rem", fontSize: "1.1rem", color: "#e03535" }}>⊘</div>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(1.1rem, 3vw, 1.35rem)", textTransform: "uppercase", color: "#dfebf7", marginBottom: "0.65rem", letterSpacing: "0.02em" }}>{popup.headline}</div>
          <div style={{ fontSize: "clamp(0.78rem, 2vw, 0.85rem)", color: "rgba(223,235,247,0.4)", lineHeight: 1.75, marginBottom: "1.5rem" }}>{popup.sub}</div>
          <button onClick={onDismiss} style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.15em", textTransform: "uppercase", background: "none", border: "1px solid rgba(223,235,247,0.12)", color: "rgba(223,235,247,0.35)", padding: "0.55rem 1.4rem", cursor: "pointer" }}>Close</button>
        </div>
      </div>
    );
  }

  if (popup.type === "subscribe") {
    const brandColor = popup.brand === "sky" ? "#0072c6" : "#f0a500";
    const brandName  = popup.brand === "sky" ? "SKY SPORTS" : "TNT SPORTS";
    return (
      <div style={{ ...base, backdropFilter: "blur(4px)", background: "rgba(0,0,0,0.78)" }}>
        <div style={{ background: "#111", border: `1px solid ${brandColor}35`, maxWidth: "390px", width: "88%", overflow: "hidden" }}>
          <div style={{ background: brandColor, padding: "0.65rem 1.1rem", fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "0.72rem", letterSpacing: "0.14em", textTransform: "uppercase", color: "#fff" }}>{brandName}</div>
          <div style={{ padding: "1.6rem 1.4rem" }}>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(1rem, 3vw, 1.2rem)", color: "#dfebf7", marginBottom: "0.55rem" }}>{popup.headline}</div>
            <div style={{ fontSize: "clamp(0.78rem, 2vw, 0.84rem)", color: "rgba(223,235,247,0.4)", lineHeight: 1.65, marginBottom: "1.4rem" }}>{popup.sub}</div>
            <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
              <button style={{ flex: 1, padding: "0.7rem", background: brandColor, color: "#fff", fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", border: "none", cursor: "pointer" }}>{popup.cta}</button>
              <button onClick={onDismiss} style={{ padding: "0.7rem 0.9rem", background: "none", border: "1px solid rgba(223,235,247,0.1)", color: "rgba(223,235,247,0.28)", fontFamily: "'Kanit', sans-serif", fontSize: "0.75rem", cursor: "pointer" }}>{popup.dismiss}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (popup.type === "expired") {
    return (
      <div style={{ ...base, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(5px)" }}>
        <div style={{ background: "#161616", border: "1px solid rgba(223,235,247,0.07)", maxWidth: "370px", width: "88%", padding: "1.9rem 1.6rem", textAlign: "center" }}>
          <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(1.1rem, 3vw, 1.25rem)", color: "#dfebf7", marginBottom: "0.5rem" }}>{popup.headline}</div>
          <div style={{ fontSize: "clamp(0.78rem, 2vw, 0.84rem)", color: "rgba(223,235,247,0.38)", lineHeight: 1.65, marginBottom: "1.6rem" }}>{popup.sub}</div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button style={{ flex: 1, padding: "0.75rem", background: "#dfebf7", color: "#121212", fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", border: "none", cursor: "pointer" }}>{popup.cta}</button>
            <button onClick={onDismiss} style={{ flex: 1, padding: "0.75rem", background: "none", border: "1px solid rgba(223,235,247,0.1)", color: "rgba(223,235,247,0.28)", fontFamily: "'Kanit', sans-serif", fontSize: "0.75rem", cursor: "pointer" }}>{popup.dismiss}</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Video interrupt section ──────────────────────────────────────────────────
function VideoInterruptSection() {
  const sectionRef = useRef(null);
  const [currentPopup, setPopup] = useState(null);
  const started = useRef(false);
  const timers  = useRef([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          obs.disconnect();
          POPUP_SEQUENCE.forEach(({ id, delay, duration, ...data }) => {
            const t1 = setTimeout(() => setPopup({ id, ...data }), delay);
            const t2 = setTimeout(() => setPopup(null), delay + duration);
            timers.current.push(t1, t2);
          });
        }
      },
      { threshold: 0.3 }
    );
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => {
      obs.disconnect();
      timers.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <section style={{ padding: "5rem 2rem", background: "#0a0a0a", borderTop: "1px solid rgba(223,235,247,0.06)", borderBottom: "1px solid rgba(223,235,247,0.06)" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2.5rem", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.73rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#e03535", marginBottom: "0.75rem" }}>The Experience</div>
            <h2 style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3.2rem)", lineHeight: 0.92, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
              Every time<br />you try to watch.
            </h2>
          </div>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.8, color: "rgba(223,235,247,0.4)", maxWidth: "320px" }}>
            This is what it actually feels like to be a football fan in 2026. Pay everything. Watch less.
          </p>
        </div>

        {/* Video player */}
        <div ref={sectionRef} style={{ position: "relative", aspectRatio: "16/9", maxWidth: "860px", margin: "0 auto", background: "#050505", overflow: "hidden", boxShadow: "0 0 80px rgba(0,0,0,0.8)" }}>
          {/* Swap in your video here — replace VideoPlaceholder with: */}
          {/* <video autoPlay muted loop playsInline style={{ position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover" }}> */}
          {/*   <source src="/match-footage.mp4" type="video/mp4" /> */}
          {/* </video> */}
          <VideoPlaceholder />

          {/* Scanlines */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)", pointerEvents: "none", zIndex: 1 }} />

          {/* Popup layer */}
          {currentPopup && (
            <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
              <PopupOverlay key={currentPopup.id} popup={currentPopup} onDismiss={() => setPopup(null)} />
            </div>
          )}
        </div>

        <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.73rem", color: "rgba(223,235,247,0.18)", letterSpacing: "0.1em" }}>
          Scroll into view to play · Popups appear automatically
        </p>
      </div>
    </section>
  );
}

// ─── Calculator section ───────────────────────────────────────────────────────
function CalculatorSection() {
  const [clubKey, setClubKey]   = useState("");
  const [matches, setMatches]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState(null);

  const club = getClubByKey(clubKey);

  const fetchMatches = useCallback(async (id) => {
    setLoading(true); setError(null); setMatches(null);
    try {
      const res  = await fetch("/api/fixtures/" + id);
      if (!res.ok) throw new Error("API error " + res.status);
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, []);

  useEffect(() => {
    if (club) fetchMatches(club.id);
    else { setMatches(null); setError(null); }
  }, [club, fetchMatches]);

  const months     = monthsElapsed();
  const soFar      = calcSoFar(months);
  const skySoFar   = SKY_MONTHLY * months;
  const tntSoFar   = TNT_MONTHLY * months;
  const tvSoFar    = soFar - skySoFar - tntSoFar;

  const finished   = matches ? matches.filter(m => m.status === "FINISHED") : [];
  const blacked    = finished.filter(m => isBlackout(m.utcDate));
  const streamable = finished.length - blacked.length;
  const cpg        = streamable > 0 ? soFar / streamable : 0;

  return (
    <section id="calculator" style={{ padding: "6rem 2rem", borderTop: "1px solid rgba(223,235,247,0.08)" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Section header */}
        <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "#fed107", marginBottom: "1rem" }}>
          Your Numbers
        </div>
        <h2 style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 900, fontSize: "clamp(2.4rem, 5vw, 3.6rem)", lineHeight: 0.92, textTransform: "uppercase", letterSpacing: "-0.01em", marginBottom: "0.75rem" }}>
          What are you actually paying?
        </h2>
        <p style={{ fontSize: "1rem", lineHeight: 1.75, color: "rgba(223,235,247,0.5)", marginBottom: "3rem", maxWidth: "520px" }}>
          Select your club to see this season's cost breakdown, your personal blackout count, and exactly how much each game is costing you.
        </p>

        {/* Club picker */}
        <div style={{ position: "relative", maxWidth: "420px", marginBottom: "2.5rem" }}>
          <select
            value={clubKey}
            onChange={e => setClubKey(e.target.value)}
            style={{
              width: "100%", padding: "1rem 3rem 1rem 1.25rem",
              fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "1.1rem",
              background: "rgba(223,235,247,0.05)", border: "1px solid rgba(223,235,247,0.15)",
              color: clubKey ? "#dfebf7" : "rgba(223,235,247,0.35)",
              borderRadius: 0, appearance: "none", cursor: "pointer", outline: "none",
              transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = "#fed107"}
            onBlur={e => e.target.style.borderColor = "rgba(223,235,247,0.15)"}
          >
            <option value="">— Select your club —</option>
            {CLUBS.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <span style={{ position: "absolute", right: "1rem", top: "50%", transform: "translateY(-50%)", color: "#fed107", pointerEvents: "none", fontSize: "0.7rem" }}>▼</span>
        </div>

        {/* States */}
        {!club && (
          <div style={{ padding: "3rem", border: "1px solid rgba(254,209,7,0.2)", background: "linear-gradient(180deg, rgba(254,209,7,0.08), rgba(254,209,7,0.02))", textAlign: "center" }}>
            <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 700, fontSize: "0.75rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(254,209,7,0.75)", marginBottom: "0.5rem" }}>
              Interactive calculator
            </div>
            <div style={{ color: "#dfebf7", fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "1.05rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Select a club above to trigger your live cost breakdown
            </div>
          </div>
        )}
        {club && loading && (
          <div style={{ padding: "3rem", textAlign: "center", color: "rgba(223,235,247,0.3)", fontFamily: "'Kanit', sans-serif", fontSize: "0.95rem" }}>
            Loading {club.name} fixtures…
          </div>
        )}
        {club && error && (
          <div style={{ padding: "1.5rem", background: "rgba(224,53,53,0.08)", border: "1px solid rgba(224,53,53,0.2)", color: "#e03535", fontFamily: "'Kanit', sans-serif", fontSize: "0.9rem" }}>
            Could not load fixtures: {error}
          </div>
        )}

        {club && matches && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5rem", alignItems: "start" }}>

            {/* Left column — stats + pints */}
            <div>
              {/* 3 stat cards */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", marginBottom: "1rem" }}>
                {[
                  { label: "Spent so far", value: fmtR(soFar), sub: "Aug 2025 – now", highlight: true },
                  { label: "Your blackouts", value: blacked.length, sub: "games blocked", highlight: false },
                  { label: "Cost per game", value: fmt(cpg), sub: `${streamable} streamable`, highlight: false },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "1.1rem", background: s.highlight ? "rgba(254,209,7,0.08)" : "rgba(223,235,247,0.04)", border: `1px solid ${s.highlight ? "rgba(254,209,7,0.2)" : "rgba(223,235,247,0.08)"}` }}>
                    <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: s.highlight ? "rgba(254,209,7,0.6)" : "rgba(223,235,247,0.35)", marginBottom: "0.4rem" }}>{s.label}</div>
                    <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "1.5rem", color: s.highlight ? "#fed107" : "#dfebf7", lineHeight: 1 }}>{s.value}</div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(223,235,247,0.3)", marginTop: "0.3rem" }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Service spend */}
              <div style={{ padding: "1.1rem", background: "rgba(223,235,247,0.03)", border: "1px solid rgba(223,235,247,0.07)", marginBottom: "0.5rem" }}>
                <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.65rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(223,235,247,0.3)", marginBottom: "0.75rem" }}>Spend so far by service</div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {[
                    { label: "Sky", val: skySoFar, color: "#4a90d9" },
                    { label: "TNT", val: tntSoFar, color: "#f0a500" },
                    { label: "Licence", val: tvSoFar, color: "rgba(223,235,247,0.5)" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ flex: 1 }}>
                      <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(223,235,247,0.3)", marginBottom: "0.25rem" }}>{label}</div>
                      <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 800, fontSize: "1.1rem", color }}>{fmtR(val)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pints comparison */}
              {cpg > 0 && (
                <PintsComparison cpg={cpg} totalSpent={soFar} clubName={club.name} />
              )}
            </div>

            {/* Right column — fixtures */}
            <div>
              {finished.length > 0 ? (
                <>
                  <div style={{ fontFamily: "'Kanit', sans-serif", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(223,235,247,0.3)", marginBottom: "0.75rem", display: "grid", gridTemplateColumns: "90px 1fr 50px 72px", gap: "0 8px", padding: "0 10px" }}>
                    <span>Date</span><span>Opponent</span><span style={{ textAlign: "right" }}>Score</span><span style={{ textAlign: "right" }}>Cost</span>
                  </div>
                  {finished.map(m => <MatchRow key={m.id} match={m} teamId={club.id} cpg={cpg} />)}
                </>
              ) : (
                <div style={{ padding: "2rem", textAlign: "center", color: "rgba(223,235,247,0.25)", fontFamily: "'Kanit', sans-serif", fontSize: "0.9rem" }}>
                  No fixtures played yet this season.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Landing() {
  const [email, setEmail]         = useState("");
  const [name, setName]           = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [signers, setSigners]     = useState(4217);
  const [mounted, setMounted]     = useState(false);
  const [scrolled, setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setSigners(s => s + Math.floor(Math.random() * 3));
    }, 8000);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearInterval(interval); window.removeEventListener("scroll", onScroll); };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && name) setSubmitted(true);
  };

  return (
    <>
      <Head>
        <title>Paywall FC — Your Club. Their Profit.</title>
        <meta name="description" content="UK football fans are being priced out of watching their own clubs. Join the campaign." />
      </Head>

      <style>{`
        @font-face {
          font-family: 'Mona Sans';
          src: url('https://github.githubassets.com/static/fonts/mona-sans.woff2') format('woff2');
          font-weight: 100 900; font-style: normal; font-display: swap;
        }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
          background: #121212; color: #dfebf7;
          font-family: 'Mona Sans', 'Helvetica Neue', sans-serif;
          overflow-x: hidden; -webkit-font-smoothing: antialiased;
        }
        body::after {
          content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 9999;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
        }
        a { color: inherit; text-decoration: none; }

        /* ── Nav ── */
        .nav-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 200; }
        .nav-top-line { height: 2px; background: #fed107; width: 100%; }
        .nav { display: flex; justify-content: space-between; align-items: center; padding: 0 2rem; height: 60px; backdrop-filter: blur(20px); background: rgba(18,18,18,0.92); border-bottom: 1px solid rgba(254,209,7,0.1); transition: background 0.3s; }
        .nav.scrolled { background: rgba(18,18,18,0.98); border-bottom-color: rgba(254,209,7,0.18); }

        .nav-brand { display: flex; align-items: center; gap: 0.6rem; text-decoration: none; }
        .nav-badge { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; }
        .nav-divider { width: 1px; height: 20px; background: rgba(254,209,7,0.2); margin: 0 0.25rem; }
        .nav-name { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 1rem; letter-spacing: 0.08em; color: #fed107; line-height: 1; }
        .nav-tag { font-family: 'Kanit', sans-serif; font-weight: 500; font-size: 0.58rem; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(223,235,247,0.3); line-height: 1; margin-top: 1px; }

        .nav-links { display: flex; align-items: center; gap: 0; }
        .nav-links a { position: relative; font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.78rem; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(223,235,247,0.4); padding: 0 1.1rem; height: 60px; display: flex; align-items: center; transition: color 0.2s; }
        .nav-links a::after { content: ''; position: absolute; bottom: 0; left: 1.1rem; right: 1.1rem; height: 2px; background: #fed107; transform: scaleX(0); transform-origin: left; transition: transform 0.25s ease; }
        .nav-links a:hover { color: #dfebf7; }
        .nav-links a:hover::after { transform: scaleX(1); }

        .nav-right { display: flex; align-items: center; gap: 1rem; }
        .nav-count { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.72rem; letter-spacing: 0.06em; color: rgba(223,235,247,0.35); white-space: nowrap; }
        .nav-count strong { color: #fed107; font-weight: 800; }
        .nav-cta { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0.55rem 1.25rem; background: #fed107; color: #121212; border: none; cursor: pointer; transition: opacity 0.18s, transform 0.15s; display: inline-flex; align-items: center; gap: 0.4rem; white-space: nowrap; }
        .nav-cta:hover { opacity: 0.88; transform: translateY(-1px); }
        .nav-cta-arrow { font-size: 0.7rem; }

        .nav-mobile-toggle { display: none; background: none; border: none; cursor: pointer; padding: 0.25rem; color: #fed107; }
        .nav-mobile-menu { display: none; position: absolute; top: 100%; left: 0; right: 0; background: rgba(18,18,18,0.98); border-bottom: 1px solid rgba(254,209,7,0.15); padding: 1rem 2rem; flex-direction: column; gap: 0; }
        .nav-mobile-menu.open { display: flex; }
        .nav-mobile-menu a { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.9rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(223,235,247,0.5); padding: 0.85rem 0; border-bottom: 1px solid rgba(223,235,247,0.06); transition: color 0.2s; }
        .nav-mobile-menu a:last-child { border-bottom: none; }
        .nav-mobile-menu a:hover { color: #fed107; }

        @media (max-width: 860px) { .nav-links { display: none; } .nav-count { display: none; } }
        @media (max-width: 560px) { .nav-mobile-toggle { display: block; } .nav-tag { display: none; } }

        .hero { min-height: 100vh; display: flex; align-items: center; padding: 9rem 2rem 4rem; position: relative; overflow: hidden; }
        .hero-glow { position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: 800px; height: 500px; background: radial-gradient(ellipse at 50% 0%, rgba(254,209,7,0.07) 0%, transparent 65%); pointer-events: none; }
        .hero-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(254,209,7,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(254,209,7,0.03) 1px, transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%); pointer-events: none; }
        .hero-inner { max-width: 1100px; margin: 0 auto; width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 3rem; align-items: center; position: relative; }
        .hero-badge { width: clamp(150px, 16vw, 220px); height: clamp(150px, 16vw, 220px); object-fit: contain; filter: drop-shadow(0 0 40px rgba(254,209,7,0.2)); animation: badgeFloat 4s ease-in-out infinite; }
        @keyframes badgeFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

        .hero-eyebrow { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.76rem; letter-spacing: 0.3em; text-transform: uppercase; color: #fed107; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
        .hero-eyebrow::before { content: ''; display: inline-block; width: 2rem; height: 1.5px; background: #fed107; }
        .hero-hl { font-family: 'Kanit', sans-serif; font-weight: 900; font-style: italic; font-size: clamp(3.8rem, 9vw, 8rem); line-height: 0.88; letter-spacing: -0.02em; text-transform: uppercase; }
        .hero-hl .line { display: block; }
        .hero-hl .strike { position: relative; color: rgba(223,235,247,0.15); }
        .hero-hl .strike::after { content: ''; position: absolute; left: -2px; right: -2px; top: 55%; height: 5px; background: #e03535; transform: rotate(-1.5deg); }
        .hero-hl .accent { color: #fed107; }
        .hero-sub { font-size: clamp(0.92rem, 2vw, 1.05rem); color: rgba(223,235,247,0.55); line-height: 1.8; max-width: 500px; margin-top: 1.75rem; }
        .hero-sub strong { color: #dfebf7; font-weight: 600; }
        .hero-actions { display: flex; gap: 1rem; margin-top: 2.25rem; flex-wrap: wrap; }
        .btn-y { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 0.92rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.95rem 2rem; background: #fed107; color: #121212; border: none; cursor: pointer; transition: transform 0.15s, opacity 0.15s; display: inline-block; }
        .btn-y:hover { transform: translateY(-2px); opacity: 0.88; }
        .btn-o { font-family: 'Kanit', sans-serif; font-weight: 700; font-size: 0.92rem; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.95rem 1.75rem; background: transparent; color: #dfebf7; border: 1px solid rgba(223,235,247,0.2); cursor: pointer; transition: border-color 0.2s, color 0.2s; display: inline-block; }
        .btn-o:hover { border-color: #fed107; color: #fed107; }
        .hero-signers { font-family: 'Kanit', sans-serif; font-size: 0.8rem; letter-spacing: 0.06em; color: rgba(223,235,247,0.35); margin-top: 0.9rem; }
        .hero-signers span { color: #fed107; font-weight: 700; }

        .ticker { background: linear-gradient(90deg, #fed107, #ffd42a); color: #121212; padding: 0.95rem 0; overflow: hidden; border-top: 1px solid rgba(18,18,18,0.2); border-bottom: 1px solid rgba(18,18,18,0.2); }
        .ticker-inner { display: flex; white-space: nowrap; animation: tick 28s linear infinite; }
        .ticker-item { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 0.95rem; letter-spacing: 0.14em; text-transform: uppercase; padding: 0 2.25rem; }
        @keyframes tick { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .stats { padding: 6rem 2rem; border-bottom: 1px solid rgba(223,235,247,0.07); }
        .stats-inner { max-width: 1100px; margin: 0 auto; }
        .eyebrow { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.73rem; letter-spacing: 0.3em; text-transform: uppercase; color: #fed107; margin-bottom: 3rem; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 3rem 4rem; }

        .section { padding: 6rem 2rem; }
        .section-inner { max-width: 1100px; margin: 0 auto; }
        .section-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 5rem; align-items: start; }
        @media (max-width: 768px) { .section-2col { grid-template-columns: 1fr; gap: 3rem; } .hero-inner { grid-template-columns: 1fr; } }

        .tag-y { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.73rem; letter-spacing: 0.3em; text-transform: uppercase; color: #fed107; margin-bottom: 1.25rem; }
        .tag-r { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.73rem; letter-spacing: 0.3em; text-transform: uppercase; color: #e03535; margin-bottom: 1.25rem; }
        .sh { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: clamp(2.2rem, 5vw, 3.4rem); line-height: 0.92; text-transform: uppercase; letter-spacing: -0.01em; }
        .body-stack { margin-top: 2rem; display: flex; flex-direction: column; gap: 1.2rem; }
        .body-stack p { font-size: 0.97rem; line-height: 1.8; color: rgba(223,235,247,0.6); }
        .body-stack strong { color: #dfebf7; font-weight: 600; }
        .qcard { border-left: 3px solid rgba(224,53,53,0.5); padding: 1.2rem 1.4rem; background: rgba(224,53,53,0.05); }
        .qtext { font-size: 1rem; line-height: 1.65; color: rgba(223,235,247,0.75); font-style: italic; }
        .qattr { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.73rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(223,235,247,0.35); margin-top: 0.7rem; }

        .bdt { width: 100%; border-collapse: collapse; }
        .bdt tr { border-bottom: 1px solid rgba(223,235,247,0.07); }
        .bdt td { padding: 1.35rem 0; font-size: 0.93rem; color: rgba(223,235,247,0.55); }
        .bdt td:first-child { font-family: 'Kanit', sans-serif; font-weight: 700; font-size: 1rem; letter-spacing: 0.03em; text-transform: uppercase; color: #dfebf7; width: 55%; }
        .bdt td:last-child { text-align: right; font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 1.5rem; color: #fed107; }
        .bdt .r1 td:last-child { font-size: 1.55rem; }
        .bdt .r2 td:last-child { font-size: 1.9rem; }
        .bdt .r3 td:last-child { font-size: 2.25rem; color: #dfebf7; }
        .bdt .total td { border-top: 1.5px solid rgba(254,209,7,0.2); padding-top: 1.5rem; }
        .bdt .total td:first-child { color: #fed107; font-size: 1.2rem; }
        .bdt .total td:last-child { font-size: 3rem; color: #fed107; text-shadow: 0 0 22px rgba(254,209,7,0.28); }
        .bdt .bsub { font-family: 'Mona Sans', sans-serif; font-size: 0.78rem; color: rgba(223,235,247,0.3); font-weight: 400; text-transform: none; letter-spacing: 0; margin-top: 0.2rem; display: block; }

        .rule-box { margin-top: 2rem; padding: 1.4rem 1.5rem; border: 1px solid rgba(224,53,53,0.2); background: rgba(224,53,53,0.04); }
        .rule-title { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.15em; text-transform: uppercase; color: #e03535; margin-bottom: 0.5rem; }
        .rule-text { font-size: 0.87rem; line-height: 1.75; color: rgba(223,235,247,0.5); }

        .how-steps { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid rgba(254,209,7,0.15); border-bottom: 1px solid rgba(254,209,7,0.08); }
        .how-step { padding: 2.5rem; border-left: 1px solid rgba(223,235,247,0.07); position: relative; background: linear-gradient(180deg, rgba(254,209,7,0.03), rgba(254,209,7,0.0)); }
        .how-step:first-child { border-left: none; padding-left: 0; }
        .step-n { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: 5.2rem; color: rgba(254,209,7,0.09); line-height: 1; position: absolute; top: 1.5rem; right: 1.5rem; }
        .step-t { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: 1.45rem; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.8rem; color: #dfebf7; }
        .step-d { font-size: 0.92rem; line-height: 1.75; color: rgba(223,235,247,0.5); }
        @media (max-width: 768px) { .how-steps { grid-template-columns: 1fr; } .how-step { border-left: none; border-top: 1px solid rgba(223,235,247,0.07); padding: 2rem 0; } .how-step:first-child { border-top: none; } }

        .petition-inner { max-width: 580px; margin: 0 auto; text-align: center; }
        .petition-ey { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.73rem; letter-spacing: 0.3em; text-transform: uppercase; color: #fed107; margin-bottom: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.75rem; }
        .petition-ey::before, .petition-ey::after { content: ''; flex: 1; max-width: 3rem; height: 1px; background: rgba(254,209,7,0.3); }
        .petition-h { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: clamp(3rem, 7vw, 5.5rem); line-height: 0.88; text-transform: uppercase; letter-spacing: -0.02em; margin-bottom: 1.25rem; }
        .petition-sub { font-size: 1rem; line-height: 1.75; color: rgba(223,235,247,0.5); margin-bottom: 2.5rem; }
        .pcount { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: clamp(4rem, 10vw, 7.25rem); color: #fed107; line-height: 0.92; text-shadow: 0 0 28px rgba(254,209,7,0.22); }
        .pcount-l { font-family: 'Kanit', sans-serif; font-weight: 700; font-size: 0.8rem; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(223,235,247,0.42); margin: 0.45rem 0 2.5rem; }
        .pcount-band { margin: 1.1rem 0 2.3rem; padding: 0.7rem 1rem; border: 1px solid rgba(254,209,7,0.25); background: rgba(254,209,7,0.06); font-family: 'Kanit', sans-serif; font-weight: 700; font-size: 0.74rem; letter-spacing: 0.15em; text-transform: uppercase; color: rgba(254,209,7,0.85); }
        .pform { display: flex; flex-direction: column; gap: 0.65rem; }
        .prow { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
        @media (max-width: 480px) { .prow { grid-template-columns: 1fr; } }
        .fi { width: 100%; padding: 1rem 1.2rem; background: rgba(223,235,247,0.04); border: 1px solid rgba(223,235,247,0.1); color: #dfebf7; font-family: 'Mona Sans', sans-serif; font-size: 0.9rem; outline: none; transition: border-color 0.2s; border-radius: 0; -webkit-appearance: none; }
        .fi:focus { border-color: #fed107; }
        .fi::placeholder { color: rgba(223,235,247,0.22); }
        .sub-btn { width: 100%; padding: 1.1rem; background: #fed107; color: #121212; font-family: 'Kanit', sans-serif; font-weight: 900; font-size: 1.05rem; letter-spacing: 0.15em; text-transform: uppercase; border: none; cursor: pointer; transition: opacity 0.15s, transform 0.15s; }
        .sub-btn:hover { opacity: 0.88; transform: translateY(-1px); }
        .legal { font-size: 0.75rem; color: rgba(223,235,247,0.22); margin-top: 0.9rem; line-height: 1.65; }
        .success { padding: 3rem 1.5rem; border: 1px solid rgba(254,209,7,0.2); background: rgba(254,209,7,0.04); text-align: center; }
        .success-t { font-family: 'Kanit', sans-serif; font-weight: 900; font-size: 2rem; text-transform: uppercase; color: #fed107; margin-bottom: 0.5rem; }
        .success-s { font-size: 0.95rem; color: rgba(223,235,247,0.5); line-height: 1.65; }

        .footer { padding: 3rem 2rem; border-top: 1px solid rgba(223,235,247,0.07); }
        .footer-inner { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 2rem; flex-wrap: wrap; }
        .footer-brand { display: flex; align-items: center; gap: 0.65rem; }
        .footer-badge { width: 28px; height: 28px; object-fit: contain; opacity: 0.8; }
        .footer-wm { font-family: 'Kanit', sans-serif; font-weight: 800; font-size: 1rem; color: #fed107; letter-spacing: 0.06em; }
        .footer-txt { font-size: 0.78rem; color: rgba(223,235,247,0.22); line-height: 1.6; }
        .footer-links { display: flex; gap: 1.5rem; }
        .footer-links a { font-family: 'Kanit', sans-serif; font-weight: 600; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(223,235,247,0.28); transition: color 0.2s; }
        .footer-links a:hover { color: #fed107; }

        .fade-up { opacity: 0; transform: translateY(20px); animation: fu 0.65s ease forwards; }
        @keyframes fu { to { opacity: 1; transform: none; } }
        .d1{animation-delay:.08s} .d2{animation-delay:.2s} .d3{animation-delay:.32s}
        .d4{animation-delay:.44s} .d5{animation-delay:.56s} .d6{animation-delay:.68s}

        /* ── Hero scanlines ── */
        .hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.025) 3px, rgba(0,0,0,0.025) 4px); pointer-events: none; z-index: 1; }
        .hero-inner { z-index: 2; }

        /* ── Glitch / blackout flicker on hero strike ── */
        @keyframes strikeFlicker {
          0%, 78%, 100% { opacity: 1; transform: none; }
          80% { opacity: 0.2; transform: skewX(-4deg) translateX(-3px); }
          82% { opacity: 1; transform: none; }
          84% { opacity: 0.55; transform: translateX(3px) skewX(2deg); }
          86% { opacity: 1; transform: none; }
        }
        @keyframes lineFlicker {
          0%, 78%, 100% { transform: rotate(-1.5deg); opacity: 1; }
          80% { transform: rotate(-1.5deg) scaleX(0.05); opacity: 0; }
          82% { transform: rotate(-1.5deg) scaleX(1); opacity: 0.5; }
          84% { transform: rotate(0.8deg) translateX(5px); opacity: 1; }
          86% { transform: rotate(-1.5deg); }
        }
        .hero-hl .strike { animation: strikeFlicker 9s ease-in-out infinite; }
        .hero-hl .strike::after { animation: lineFlicker 9s ease-in-out infinite; }

        /* ── Stats ghost number ── */
        .stats { position: relative; overflow: hidden; }
        .stats::before { content: '£805'; position: absolute; right: -1rem; top: 50%; transform: translateY(-50%); font-family: 'Kanit', sans-serif; font-weight: 900; font-size: clamp(9rem, 20vw, 17rem); color: rgba(254,209,7,0.028); line-height: 1; pointer-events: none; letter-spacing: -0.04em; user-select: none; white-space: nowrap; }

        /* ── Reverse ticker ── */
        .ticker-r { background: #0e0e0e; padding: 0.55rem 0; overflow: hidden; border-bottom: 1px solid rgba(224,53,53,0.1); }
        .ticker-r .ticker-inner { animation: tickR 40s linear infinite; }
        @keyframes tickR { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .ticker-r .ticker-item { font-family: 'Kanit', sans-serif; font-weight: 700; font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase; padding: 0 2rem; color: rgba(224,53,53,0.55); }

        /* ── Card hover enhancements ── */
        .qcard { transition: border-color 0.25s, background 0.25s, transform 0.2s; }
        .qcard:hover { border-left-color: rgba(224,53,53,0.9); background: rgba(224,53,53,0.09); transform: translateX(5px); }
        .how-step { transition: background 0.3s; }
        .how-step:hover { background: linear-gradient(180deg, rgba(254,209,7,0.07), rgba(254,209,7,0.01)); }

        /* ── Petition pulse ── */
        @keyframes countGlow {
          0%, 100% { text-shadow: 0 0 28px rgba(254,209,7,0.22); }
          50% { text-shadow: 0 0 55px rgba(254,209,7,0.55), 0 0 100px rgba(254,209,7,0.12); }
        }
        .pcount { animation: countGlow 3.5s ease-in-out infinite; }
        @keyframes bandBreath {
          0%, 100% { border-color: rgba(254,209,7,0.25); }
          50% { border-color: rgba(254,209,7,0.6); box-shadow: 0 0 20px rgba(254,209,7,0.07); }
        }
        .pcount-band { animation: bandBreath 3.5s ease-in-out infinite; }

        /* ── Sub btn active ── */
        .sub-btn:active { transform: translateY(1px) scale(0.99); }

        /* ── Live dot pulse ── */
        @keyframes livePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #e03535; }
          50% { opacity: 0.4; box-shadow: 0 0 2px #e03535; }
        }
      `}</style>

      {/* NAV */}
      <div className="nav-bar">
        <div className="nav-top-line" />
        <nav className={`nav${scrolled ? " scrolled" : ""}`}>

          {/* Brand */}
          <a href="#" className="nav-brand">
            <img src="/silhouette.png" alt="Paywall FC" className="nav-badge" />
            <div className="nav-divider" />
            <div>
              <div className="nav-name">PAYWALL FC</div>
              <div className="nav-tag">The club you already pay for</div>
            </div>
          </a>

          {/* Desktop links */}
          <div className="nav-links">
            <a href="#problem">The Problem</a>
            <a href="#costs">The Cost</a>
            <a href="#calculator">Calculator</a>
            <a href="#petition">Petition</a>
          </div>

          {/* Right: signer count + CTA */}
          <div className="nav-right">
            <div className="nav-count" suppressHydrationWarning>
              <strong suppressHydrationWarning>{numFmt(signers)}</strong> fans signed
            </div>
            <a href="#petition" className="nav-cta">
              Sign the Petition <span className="nav-cta-arrow">▶</span>
            </a>
            <button className="nav-mobile-toggle" onClick={() => setMobileOpen(o => !o)} aria-label="Menu">
              {mobileOpen ? "Close" : "Menu"}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        <div className={`nav-mobile-menu${mobileOpen ? " open" : ""}`}>
          <a href="#problem" onClick={() => setMobileOpen(false)}>The Problem</a>
          <a href="#costs" onClick={() => setMobileOpen(false)}>The Cost</a>
          <a href="#calculator" onClick={() => setMobileOpen(false)}>Calculator</a>
          <a href="#petition" onClick={() => setMobileOpen(false)}>Petition</a>
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-grid" />
        <div className="hero-inner">
          <div>
            <div className={mounted ? "hero-eyebrow fade-up d1" : "hero-eyebrow"}>A campaign by football fans, for football fans</div>
            <h1 className="hero-hl">
              <span className={mounted ? "line fade-up d2" : "line"}>Your club.</span>
              <span className={mounted ? "line fade-up d3" : "line"}>Your <span className="strike">right</span>.</span>
              <span className={mounted ? "line fade-up d4" : "line"}><span className="accent">Their</span> profit.</span>
            </h1>
            <p className={mounted ? "hero-sub fade-up d4" : "hero-sub"}>UK football fans pay over <strong>£800 a season</strong> across three subscriptions — only to find a third of their club's games are still blacked out. The leagues profit. The broadcasters profit. Fans get the bill.</p>
            <div className={mounted ? "hero-actions fade-up d5" : "hero-actions"}>
              <a href="#petition" className="btn-y">Sign the Petition</a>
              <a href="#calculator" className="btn-o">Calculate Your Cost</a>
            </div>
            <div className={mounted ? "hero-signers fade-up d6" : "hero-signers"} suppressHydrationWarning>
              <span suppressHydrationWarning>{numFmt(signers)}</span> fans have already signed
            </div>
          </div>
          <img src="/badge.png" alt="Paywall FC" className="hero-badge" />
        </div>
      </section>

      {/* TICKER */}
      <div className="ticker">
        <div className="ticker-inner">
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: "flex" }}>
              {["Sky Sports: £349.90/season","TNT Sports: £309.90/season","TV Licence: £145.32/season","113 games blacked out","30% unwatchable","£805.12 total cost","3 subscriptions. Still not enough.","The 3pm blackout. Still a thing.","Fans deserve better."].map((item, j) => (
                <span key={j} className="ticker-item">{item} <span style={{ opacity: 0.35 }}>|</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* REVERSE TICKER */}
      <div className="ticker-r">
        <div className="ticker-inner">
          {[...Array(2)].map((_, i) => (
            <div key={i} style={{ display: "flex" }}>
              {["3pm Saturday — signal lost","Blacked out. Again.","You paid. You can't watch.","1960 rule. 2026 fans.","380 games. 113 gone.","Your money. Their blackout.","No stream. No refund.","Still waiting for change.","Signal lost —"].map((item, j) => (
                <span key={j} className="ticker-item">{item} <span style={{ opacity: 0.3 }}>·</span></span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* VIDEO INTERRUPT */}
      <VideoInterruptSection />

      {/* STATS */}
      <section className="stats" id="costs">
        <div className="stats-inner">
          <div className="eyebrow">The numbers don't lie</div>
          <div className="stats-grid">
            <AnimStat prefix="£" value={805.12} decimals={2} label="Total season cost" accent="#dfebf7" />
            <AnimStat value={113} label="Games blacked out" accent="#e03535" />
            <AnimStat value={30} suffix="%" label="Of games unwatchable" accent="#e03535" />
            <AnimStat value={3} label="Subscriptions required" accent="#fed107" />
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="section" id="problem" style={{ borderTop: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="section-inner">
          <div className="section-2col">
            <div>
              <div className="tag-r">The Problem</div>
              <h2 className="sh">Fans silenced by their own wallets</h2>
              <div className="body-stack">
                <p>There was a time when you could watch your club on a single channel. That era is gone. PL rights have been deliberately fragmented across Sky, TNT, and the BBC — <strong>forcing fans to pay for all three or miss out.</strong></p>
                <p>Even those who pay everything still can't watch a third of their club's games. The <strong>3pm Saturday blackout rule</strong> — a relic from 1960 — ensures the most traditional matchday slot remains completely unwatchable.</p>
                <p>Leagues and broadcasters call it <strong>"protecting the grassroots game."</strong> Fans call it what it is: a cartel protecting profit.</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {[
                { text: "I pay Sky, TNT, and the licence fee. I still can't watch my team on a Saturday afternoon. How is this acceptable in 2026?", attr: "Leeds United fan, Manchester" },
                { text: "My dad watched every game on one channel. I spend £800 a year and still miss matches. Something has to change.", attr: "Arsenal supporter, London" },
                { text: "Working class fans are being priced out. Football was the people's game. Not anymore.", attr: "Everton fan, Liverpool" },
              ].map((q, i) => (
                <div key={i} className="qcard">
                  <div className="qtext">"{q.text}"</div>
                  <div className="qattr">— {q.attr}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COST BREAKDOWN */}
      <section className="section" style={{ background: "rgba(254,209,7,0.02)", borderTop: "1px solid rgba(223,235,247,0.07)", borderBottom: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="section-inner">
          <div className="eyebrow">Full Season Cost — 2025/26</div>
          <h2 className="sh" style={{ marginBottom: "3rem" }}>What you pay.<br />Every. Single. Year.</h2>
          <table className="bdt">
            <tbody>
              <tr className="r1"><td>TV Licence<span className="bsub">Aug–Mar: £14.54/mo · Apr–May: £15.00/mo</span></td><td>£145.32</td></tr>
              <tr className="r2"><td>TNT Sports / HBO Max<span className="bsub">£30.99/month × 10 months</span></td><td>£309.90</td></tr>
              <tr className="r3"><td>Sky Sports NOW<span className="bsub">£34.99/month × 10 months — no contract</span></td><td>£349.90</td></tr>
              <tr className="total"><td>Full season total</td><td>£805.12</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: "1.25rem", fontSize: "0.78rem", color: "rgba(223,235,247,0.22)" }}>* Sky NOW pricing. Sky TV bundle: £37.00/mo (24-month contract). Amazon holds no PL rights in 2025–26.</p>
        </div>
      </section>

      {/* BLACKOUT */}
      <section className="section" id="blackouts" style={{ background: "rgba(224,53,53,0.025)", borderBottom: "1px solid rgba(224,53,53,0.12)" }}>
        <div className="section-inner">
          <div className="section-2col">
            <div>
              <div className="tag-r">The 3pm Blackout</div>
              <h2 className="sh">Pay for everything.<br />Watch less.</h2>
              <div className="body-stack">
                <p>Under UK broadcasting law, no live football can be shown between 2:45pm and 5:15pm on Saturdays. The rule dates back to 1960.</p>
                <p>In 2026, it means <strong>113 Premier League games per season</strong> are completely unwatchable — regardless of how much you've paid.</p>
              </div>
              <div className="rule-box">
                <div className="rule-title">The rule, verbatim</div>
                <div className="rule-text">"No live broadcast coverage of any association football match in the United Kingdom may commence between 14:45 and 17:15 on a Saturday." — FA Regulations, Schedule D</div>
              </div>
            </div>
            <BlackoutVisual />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{ borderBottom: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="section-inner">
          <div className="eyebrow">How Paywall FC works</div>
          <h2 className="sh" style={{ marginBottom: "3.5rem" }}>A hypothetical club.<br />A very real fight.</h2>
          <div className="how-steps">
            {[
              { n: "01", t: "The Club", d: "Paywall FC is a fictional football club built to embody every fan priced out of the game they love. We exist to give that frustration a name, a badge, and a voice." },
              { n: "02", t: "The Campaign", d: "We're building a social movement showing the real cost of watching football in the UK. Calculate your costs. Share them. Make the numbers impossible to ignore." },
              { n: "03", t: "The Petition", d: "Sign the petition demanding the Premier League and broadcasters introduce a fair, single-subscription model — and abolish the 3pm blackout rule for streaming." },
            ].map((s, i) => (
              <div key={i} className="how-step">
                <span className="step-n">{s.n}</span>
                <div className="step-t">{s.t}</div>
                <div className="step-d">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CALCULATOR (embedded) */}
      <CalculatorSection />

      {/* PETITION */}
      <section className="section" id="petition" style={{ borderTop: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="petition-inner">
          <div className="petition-ey">Take Action</div>
          <h2 className="petition-h">Add your name.</h2>
          <p className="petition-sub">Demand the Premier League and broadcasters introduce fair, affordable access — and end the 3pm blackout rule for streaming fans.</p>
          <div className="pcount" suppressHydrationWarning>{numFmt(signers)}</div>
          <div className="pcount-l">fans have signed</div>
          <div className="pcount-band">Momentum is building every day</div>

          {submitted ? (
            <div className="success">
              <img src="/badge.png" alt="" style={{ width: 60, height: 60, objectFit: "contain", marginBottom: "1rem", filter: "drop-shadow(0 0 12px rgba(254,209,7,0.35))" }} />
              <div className="success-t">You're in, {name}.</div>
              <div className="success-s">Share the campaign so others can add their name.<br />Together, we're impossible to ignore.</div>
            </div>
          ) : (
            <form className="pform" onSubmit={handleSubmit}>
              <div className="prow">
                <input className="fi" type="text" placeholder="First name" value={name} onChange={e => setName(e.target.value)} required />
                <input className="fi" type="text" placeholder="Last name" />
              </div>
              <input className="fi" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className="fi" type="text" placeholder="Club you support (optional)" />
              <button type="submit" className="sub-btn">Sign the Petition</button>
              <p className="legal">By signing you agree to receive campaign updates from Paywall FC. We'll never share your data. Unsubscribe anytime. Not affiliated with any PL club or broadcaster.</p>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/badge.png" alt="" className="footer-badge" />
            <span className="footer-wm">PAYWALL FC</span>
          </div>
          <div className="footer-txt">A campaign project. Not affiliated with the Premier League,<br />Sky, TNT, or any professional football club.</div>
          <div className="footer-links">
            <a href="#problem">Problem</a>
            <a href="#costs">Costs</a>
            <a href="#calculator">Calculator</a>
            <a href="#petition">Petition</a>
          </div>
        </div>
      </footer>
    </>
  );
}
