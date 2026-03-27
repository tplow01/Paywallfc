import Head from "next/head";
import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CLUBS, getClubByKey } from "../lib/clubs";
import { isBlackout, PRICES, SEASON_MONTHS, TV_LIC_SEASON, tvLicSoFar } from "../lib/calculator";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// ─── Constants ───────────────────────────────────────────────────────────────
// Source: "The Price of Loyalty" research report (2025/26 season) — Premier League only
// Amazon Prime excluded: only required for Champions League, not PL
// SEASON_MONTHS, TV_LIC_SEASON, tvLicSoFar imported from lib/calculator
const SKY_MONTHLY  = PRICES.skyNow;                           // £34.99 — NOW Sports
const TNT_MONTHLY  = PRICES.tnt;                              // £30.99 — TNT/HBO Max, 9 months (Sep–May)
const SKY_SEASON   = SKY_MONTHLY * SEASON_MONTHS;             // £349.90
const TNT_SEASON   = TNT_MONTHLY * 9;                         // £278.91 (no TNT in August)
const TOTAL_SEASON = SKY_SEASON + TNT_SEASON + TV_LIC_SEASON; // £775.13
const PINT_PRICE   = 6.20;

// ─── Nav links ────────────────────────────────────────────────────────────────
const NAV_LINKS = [["#calculator","Calculator"],["#costs","The Cost"],["#problem","The Problem"]];

// ─── Shared form input props ──────────────────────────────────────────────────
const INPUT_CLS     = "w-full px-5 py-4 font-sans text-[14px] outline-none transition-colors placeholder-[rgba(223,235,247,0.22)] rounded-none";
const INPUT_STYLE   = { background: "rgba(223,235,247,0.04)", border: "1px solid rgba(223,235,247,0.1)", color: "#dfebf7" };
const INPUT_FOCUS   = {
  onFocus: e => { e.target.style.borderColor = "#fed107"; },
  onBlur:  e => { e.target.style.borderColor = "rgba(223,235,247,0.1)"; },
};

// ─── Video interrupt popup sequence ──────────────────────────────────────────
const POPUP_SEQUENCE = [
  { id: 1,  delay: 1500,  duration: 3800, type: "subscribe", brand: "sky",
    headline: "Subscribe to continue watching", sub: "From £34.99/month. No contract required.",
    cta: "Start your subscription", dismiss: "Not now" },
  { id: 2,  delay: 6800,  duration: 3200, type: "blackout",
    headline: "Match unavailable",
    sub: "This fixture falls within the 14:45–17:15 Saturday blackout window under UK broadcasting regulations." },
  { id: 3,  delay: 11400, duration: 1800, type: "stat",  stat: "£349.90", label: "Sky Sports. Every season." },
  { id: 4,  delay: 14400, duration: 3200, type: "subscribe", brand: "tnt",
    headline: "This match is on TNT Sports", sub: "Add TNT Sports to your package from £30.99/month.",
    cta: "Upgrade now", dismiss: "Cancel" },
  { id: 5,  delay: 18800, duration: 1600, type: "stat",  stat: "113",     label: "Games blacked out. Every season." },
  { id: 6,  delay: 21800, duration: 2800, type: "expired",
    headline: "Your free trial has ended", sub: "Continue watching Premier League football from £34.99/month.",
    cta: "Subscribe", dismiss: "Log out" },
  { id: 7,  delay: 26000, duration: 1000, type: "stat",  stat: "£278.91", label: "TNT Sports. Per season." },
  { id: 8,  delay: 27500, duration: 1000, type: "stat",  stat: "£146.32", label: "TV Licence. Still required." },
  { id: 9,  delay: 29000, duration: 1000, type: "stat",  stat: "30%",     label: "Of games. Unwatchable." },
  { id: 10, delay: 30500, duration: 6000, type: "final", stat: `£${TOTAL_SEASON.toFixed(2)}`,
    label: "A year. Just to watch the Premier League.", cta: "Sign the petition" },
];

function numFmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function monthsElapsed() {
  const start = new Date("2025-08-15");
  const ms    = Math.max(0, new Date() - start);
  return Math.min(ms / (1000 * 60 * 60 * 24 * 30.44), SEASON_MONTHS);
}
function calcSoFar(months) {
  return (SKY_MONTHLY + TNT_MONTHLY) * months + tvLicSoFar(months);
}
function fmt(n)  { return "£" + n.toFixed(2); }
function fmtR(n) { return "£" + numFmt(n); }
function formatDate(d) {
  return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
function getResult(match, teamId) {
  if (match.status !== "FINISHED") return null;
  const h = match.score.fullTime.home, a = match.score.fullTime.away;
  const isHome = match.homeTeam.id === teamId;
  const score  = isHome ? `${h}–${a}` : `${a}–${h}`;
  const diff   = isHome ? h - a : a - h;
  return { score, result: diff > 0 ? "W" : diff < 0 ? "L" : "D" };
}

// ─── Animated stat ────────────────────────────────────────────────────────────
function AnimStat({ prefix = "", value, suffix = "", decimals = 0, label, accent = "#fed107" }) {
  const ref        = useRef(null);
  const displayRef = useRef(null);
  const proxy      = useRef({ val: 0 });

  useGSAP(() => {
    // Set initial hidden state via GSAP (runs before paint via useLayoutEffect)
    gsap.set(ref.current, { opacity: 0, y: 20 });
    const trigger = { trigger: ref.current, start: "top 85%", once: true };
    gsap.to(ref.current, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", scrollTrigger: trigger });
    gsap.to(proxy.current, {
      val: value, duration: 2, ease: "power2.out", scrollTrigger: trigger,
      onUpdate() {
        if (displayRef.current) {
          const v = proxy.current.val;
          displayRef.current.textContent = prefix + (decimals > 0 ? v.toFixed(decimals) : numFmt(v)) + suffix;
        }
      },
    });
  }, { scope: ref });

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <div ref={displayRef} className="font-display font-black leading-none" style={{ fontSize: "clamp(3.5rem,8vw,7rem)", color: accent, letterSpacing: "-0.02em" }}>
        {prefix}{decimals > 0 ? (0).toFixed(decimals) : "0"}{suffix}
      </div>
      <div className="font-display font-semibold text-[15px] tracking-[0.15em] uppercase" style={{ color: "rgba(223,235,247,0.4)" }}>{label}</div>
    </div>
  );
}

// ─── Blackout bars ────────────────────────────────────────────────────────────
function BlackoutBars() {
  const ref  = useRef(null);
  const bars = [
    { label: "Total PL games",       value: 380, max: 380, color: "rgba(255,255,255,0.15)" },
    { label: "Streamable (Sky+TNT)", value: 267, max: 380, color: "#FFD700", emphasis: true },
    { label: "3pm blackouts",        value: 113, max: 380, color: "#e03535" },
  ];

  useGSAP(() => {
    gsap.from(ref.current.querySelectorAll(".bv-fill"), {
      scaleX: 0, duration: 1.5, ease: "power2.out", stagger: 0.18,
      transformOrigin: "left center",
      scrollTrigger: { trigger: ref.current, start: "top 82%", once: true },
    });
  }, { scope: ref });

  return (
    <div ref={ref} className="flex flex-col gap-4">
      {bars.map((bar, i) => (
        <div key={i}>
          <div className="flex justify-between mb-2">
            <span className={`font-display font-bold text-xs tracking-widest uppercase ${bar.emphasis ? "text-white" : "text-brand-muted"}`}>{bar.label}</span>
            <span className="font-display font-bold text-xs" style={{ color: bar.color }}>{bar.value}</span>
          </div>
          <div className={`rounded-sm overflow-hidden bg-brand-border ${bar.emphasis ? "h-3" : "h-1.5"}`}>
            <div className="bv-fill h-full rounded-sm" style={{ width: `${(bar.value / bar.max) * 100}%`, background: bar.color, boxShadow: bar.emphasis ? "0 0 16px rgba(255,215,0,0.4)" : "none" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Popup overlay ────────────────────────────────────────────────────────────
function PopupOverlay({ popup, onDismiss }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), 30); return () => clearTimeout(t); }, []);

  const base = {
    position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    opacity: visible ? 1 : 0, transition: "opacity 0.18s ease",
  };

  if (popup.type === "stat") return (
    <div style={{ ...base, background: "rgba(8,8,8,0.95)", flexDirection: "column", gap: "0.75rem" }}>
      <div className="font-display font-black text-center" style={{ fontSize: "clamp(4rem,12vw,8rem)", color: "#FFD700", lineHeight: 0.88 }}>{popup.stat}</div>
      <div className="font-display font-bold text-center text-brand-muted tracking-widest uppercase text-sm">{popup.label}</div>
    </div>
  );

  if (popup.type === "final") return (
    <div style={{ ...base, background: "rgba(8,8,8,0.97)", flexDirection: "column", gap: "1rem" }}>
      <div className="font-display font-bold text-brand-muted tracking-widest uppercase text-xs">Total annual cost</div>
      <div className="font-display font-black text-center" style={{ fontSize: "clamp(3.5rem,10vw,7rem)", color: "#FFD700", lineHeight: 0.88 }}>{popup.stat}</div>
      <div className="font-display font-bold text-center text-white/50 tracking-widest uppercase text-sm max-w-xs" style={{ lineHeight: 1.5 }}>{popup.label}</div>
      <a href="#petition" onClick={onDismiss} className="mt-3 font-display font-black text-sm tracking-widest uppercase px-8 py-3 bg-brand-yellow text-black inline-block">{popup.cta} →</a>
    </div>
  );

  if (popup.type === "blackout") return (
    <div style={{ ...base, backdropFilter: "blur(3px)", background: "rgba(224,53,53,0.06)" }}>
      <div className="bg-brand-panel border border-red-500/30 p-8 max-w-sm w-11/12 text-center">
        <div className="text-red-500 text-3xl mb-4">⊘</div>
        <div className="font-display font-black text-white uppercase text-xl mb-3">{popup.headline}</div>
        <div className="text-sm text-white/40 leading-relaxed mb-6">{popup.sub}</div>
        <button onClick={onDismiss} className="font-display font-bold text-xs tracking-widest uppercase px-6 py-2 border border-white/10 text-white/30 cursor-pointer bg-transparent">Close</button>
      </div>
    </div>
  );

  if (popup.type === "subscribe") {
    const brandColor = popup.brand === "sky" ? "#0072c6" : "#f0a500";
    const brandName  = popup.brand === "sky" ? "SKY SPORTS" : "TNT SPORTS";
    return (
      <div style={{ ...base, backdropFilter: "blur(4px)", background: "rgba(0,0,0,0.8)" }}>
        <div className="max-w-sm w-11/12 overflow-hidden" style={{ border: `1px solid ${brandColor}35` }}>
          <div className="font-display font-black text-xs tracking-widest uppercase text-white px-4 py-2" style={{ background: brandColor }}>{brandName}</div>
          <div className="bg-brand-panel p-6">
            <div className="font-display font-black text-white text-xl mb-2">{popup.headline}</div>
            <div className="text-sm text-white/40 leading-relaxed mb-5">{popup.sub}</div>
            <div className="flex gap-3">
              <button className="flex-1 py-2.5 font-display font-black text-xs tracking-widest uppercase text-white border-none cursor-pointer" style={{ background: brandColor }}>{popup.cta}</button>
              <button onClick={onDismiss} className="px-4 py-2.5 font-display text-xs text-white/30 cursor-pointer bg-transparent border border-white/10">{popup.dismiss}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (popup.type === "expired") return (
    <div style={{ ...base, backdropFilter: "blur(5px)", background: "rgba(0,0,0,0.9)" }}>
      <div className="bg-brand-panel border border-white/7 max-w-sm w-11/12 p-8 text-center">
        <div className="font-display font-black text-white text-xl mb-2">{popup.headline}</div>
        <div className="text-sm text-white/40 leading-relaxed mb-6">{popup.sub}</div>
        <div className="flex gap-3">
          <button className="flex-1 py-3 bg-white text-black font-display font-black text-xs tracking-widest uppercase border-none cursor-pointer">{popup.cta}</button>
          <button onClick={onDismiss} className="flex-1 py-3 bg-transparent border border-white/10 text-white/30 font-display text-xs cursor-pointer">{popup.dismiss}</button>
        </div>
      </div>
    </div>
  );

  return null;
}

// ─── Video section ────────────────────────────────────────────────────────────
function VideoSection() {
  const sectionRef  = useRef(null);
  const [popup, setPopup] = useState(null);
  const started     = useRef(false);
  const timers      = useRef([]);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        obs.disconnect();
        POPUP_SEQUENCE.forEach(({ id, delay, duration, ...data }) => {
          const t1 = setTimeout(() => setPopup({ id, ...data }), delay);
          const t2 = setTimeout(() => setPopup(null), delay + duration);
          timers.current.push(t1, t2);
        });
      }
    }, { threshold: 0.3 });
    if (sectionRef.current) obs.observe(sectionRef.current);
    return () => { obs.disconnect(); timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <div ref={sectionRef} className="relative aspect-video bg-black overflow-hidden border border-brand-border rounded-sm shadow-2xl">
      {/* Pitch placeholder */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #1c2e1c 0%, #0d1a0d 45%, #090f09 100%)" }}>
        {/* Pitch lines */}
        <div className="absolute inset-0 opacity-15">
          <div className="absolute inset-[5%] border border-white/70" />
          <div className="absolute top-[5%] bottom-[5%] left-1/2 w-px bg-white/70" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[16%] rounded-full border border-white/70" style={{ paddingBottom: "16%" }} />
          <div className="absolute top-[22%] left-[5%] w-[14%] h-[56%] border border-white/70 border-l-0" />
          <div className="absolute top-[22%] right-[5%] w-[14%] h-[56%] border border-white/70 border-r-0" />
        </div>
        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.6) 100%)" }} />
        {/* Broadcast bar */}
        <div className="absolute top-0 left-0 right-0 px-4 py-2 flex justify-between items-center" style={{ background: "linear-gradient(180deg,rgba(0,0,0,0.8),transparent)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500" style={{ animation: "livePulse 1.4s ease-in-out infinite" }} />
            <span className="font-display font-black text-xs tracking-widest text-white">LIVE</span>
            <span className="font-display text-xs text-white/40 tracking-wider">PREMIER LEAGUE</span>
          </div>
          <span className="font-display font-bold text-xs text-white/40 tracking-wider">HD</span>
        </div>
        {/* Score bug */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-1 flex items-center gap-3">
          <span className="font-display font-bold text-xs text-white tracking-wider">HOME</span>
          <span className="font-display font-black text-sm text-brand-yellow tracking-wider">2 – 1</span>
          <span className="font-display font-bold text-xs text-white tracking-wider">AWAY</span>
        </div>
        {/* Match time */}
        <div className="absolute bottom-0 left-0 right-0 px-4 py-2" style={{ background: "linear-gradient(0deg,rgba(0,0,0,0.8),transparent)" }}>
          <span className="font-display text-xs text-white/30 tracking-widest">67' — MATCH IN PROGRESS</span>
        </div>
        {/* Watermark */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display font-black text-xs tracking-widest uppercase text-white/5 select-none">Match Footage</span>
        </div>
      </div>

      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.04) 3px,rgba(0,0,0,0.04) 4px)" }} />

      {/* Popup layer */}
      {popup && (
        <div className="absolute inset-0 z-20">
          <PopupOverlay key={popup.id} popup={popup} onDismiss={() => setPopup(null)} />
        </div>
      )}
    </div>
  );
}

// ─── Calculator section ───────────────────────────────────────────────────────
function CalculatorSection() {
  const [clubKey, setClubKey] = useState("");
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

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

  const months   = monthsElapsed();
  const soFar    = calcSoFar(months);
  const skySoFar = SKY_MONTHLY * months;
  const tntSoFar = TNT_MONTHLY * Math.max(0, months - 1); // TNT starts Sep (no TNT in Aug)
  const tvSoFar  = soFar - skySoFar - tntSoFar;

  const finished   = matches ? matches.filter(m => m.status === "FINISHED") : [];
  const blacked    = finished.filter(m => isBlackout(m.utcDate));
  const streamable = finished.length - blacked.length;
  const cpg        = streamable > 0 ? soFar / streamable : 0;

  return (
    <section id="calculator" style={{ borderTop: "1px solid rgba(223,235,247,0.07)" }}>
      <div className="max-w-[1440px] mx-auto px-6 py-24">

        {/* ── Section header — full width above the interactive grid ── */}
        <div className="grid grid-cols-12 gap-6 mb-10">
          <div className="col-span-12 lg:col-span-5">
            <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase text-brand-yellow mb-4">Your Numbers</div>
            <h2 className="font-display font-black uppercase text-brand-text" style={{ fontSize: "clamp(2.4rem,5vw,57px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
              What are you actually paying?
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-7 flex items-end">
            <p className="text-[15.5px] leading-[28px]" style={{ color: "rgba(223,235,247,0.6)" }}>
              Select your club to see this season's cost breakdown, your personal blackout count, and exactly how much each game is costing you.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 items-start">

          {/* ── LEFT: sticky panel with picker + stats ── */}
          <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-[72px]">

            {/* Club picker */}
            <div className="relative mb-6">
              <select
                value={clubKey}
                onChange={e => setClubKey(e.target.value)}
                className="w-full appearance-none cursor-pointer outline-none font-display font-bold text-[17.6px]"
                style={{
                  padding: "17px 49px 17px 21px",
                  background: "rgba(223,235,247,0.05)",
                  border: "1px solid rgba(223,235,247,0.15)",
                  color: clubKey ? "#dfebf7" : "rgba(223,235,247,0.35)",
                }}
              >
                <option value="">— Select your club —</option>
                {CLUBS.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
              </select>
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-yellow text-xs pointer-events-none">▼</span>
            </div>

            {/* Stat cards — shown once matches are loaded */}
            {club && matches && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Spent so far",  value: fmtR(soFar),     sub: "Aug 2025 – now", highlight: true },
                    { label: "Your blackouts", value: blacked.length,  sub: "games blocked" },
                    { label: "Cost per game", value: fmt(cpg),         sub: `${streamable} streamable` },
                  ].map((s, i) => (
                    <div key={i} className={`p-4 border ${s.highlight ? "bg-brand-yellow/8 border-brand-yellow/20" : "bg-brand-panel border-brand-border"}`}>
                      <div className={`font-display font-semibold text-xs tracking-widest uppercase mb-2 ${s.highlight ? "text-brand-yellow/60" : "text-brand-muted"}`}>{s.label}</div>
                      <div className={`font-display font-black text-2xl leading-none ${s.highlight ? "text-brand-yellow" : "text-brand-text"}`}>{s.value}</div>
                      <div className="text-xs mt-1" style={{ color: "rgba(223,235,247,0.3)" }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="bg-brand-panel border border-brand-border p-4 rounded-sm">
                  <div className="font-display font-bold text-xs tracking-widest uppercase text-brand-muted mb-4">Spend by service</div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Sky",     val: skySoFar, color: "#4a90d9" },
                      { label: "TNT",     val: tntSoFar, color: "#f0a500" },
                      { label: "Licence", val: tvSoFar,  color: "rgba(255,255,255,0.5)" },
                    ].map(({ label, val, color }) => (
                      <div key={label}>
                        <div className="font-display font-bold text-xs tracking-widest uppercase text-brand-muted mb-1">{label}</div>
                        <div className="font-display font-black text-xl" style={{ color }}>{fmtR(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {cpg > 0 && (
                  <div className="bg-brand-panel border border-brand-yellow/15 p-4 rounded-sm">
                    <div className="font-display font-bold text-xs tracking-widest uppercase text-brand-yellow/60 mb-3">Put it in perspective</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-display font-black text-3xl text-white leading-none">{fmt(cpg)}</div>
                        <div className="text-xs text-white/40 mt-1">per game you watch</div>
                      </div>
                      <div>
                        <div className="font-display font-black text-3xl text-brand-yellow leading-none">{(cpg / PINT_PRICE).toFixed(1)}</div>
                        <div className="text-xs text-white/40 mt-1">pints at £{PINT_PRICE.toFixed(2)} each</div>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-brand-border">
                      <p className="font-display font-bold italic text-sm text-white/70 leading-relaxed">
                        That's roughly <span className="text-brand-yellow">{Math.floor((soFar / PINT_PRICE) / 4)} rounds</span> for you and three mates watching {club.name} at the pub — for free.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT: fixtures / empty state ── */}
          <div className="col-span-12 lg:col-span-7">
            {/* Empty state */}
            {!club && (
              <div className="p-12 text-center" style={{ background: "linear-gradient(180deg, rgba(254,209,7,0.08) 0%, rgba(254,209,7,0.02) 100%)", border: "1px solid rgba(254,209,7,0.2)" }}>
                <div className="font-display font-bold text-xs tracking-[2.4px] uppercase text-center mb-2" style={{ color: "rgba(254,209,7,0.75)" }}>Interactive calculator</div>
                <div className="font-display font-extrabold text-[16.8px] tracking-[1px] uppercase text-center text-brand-text">Select a club above to trigger your live cost breakdown</div>
              </div>
            )}

            {/* Loading */}
            {club && loading && (
              <div className="text-white/30 font-display text-center py-10">Loading {club.name} fixtures…</div>
            )}

            {/* Error */}
            {club && error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 font-sans text-sm p-4 rounded-sm">Could not load fixtures: {error}</div>
            )}

            {/* Fixture list */}
            {club && matches && (
              <div className="bg-brand-panel border border-brand-border rounded-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-brand-border flex justify-between items-center bg-[#1A1A1A]">
                  <div className="font-display font-black text-white uppercase tracking-wider text-sm">{club.name} — 2025/26</div>
                  <div className="w-2 h-2 rounded-full bg-brand-yellow" />
                </div>
                {finished.length > 0 ? (
                  <div className="divide-y divide-brand-border">
                    {finished.map(m => {
                      const blacked = isBlackout(m.utcDate);
                      const result  = getResult(m, club.id);
                      const isHome  = m.homeTeam.id === club.id;
                      const opp     = isHome ? (m.awayTeam.shortName || m.awayTeam.name) : "@ " + (m.homeTeam.shortName || m.homeTeam.name);
                      const resColor = result ? (result.result === "W" ? "#4caf50" : result.result === "L" ? "#e03535" : "rgba(255,255,255,0.4)") : "rgba(255,255,255,0.3)";
                      return (
                        <div key={m.id} className={`grid px-5 py-3 gap-2 items-center ${blacked ? "bg-red-500/5" : "hover:bg-white/3"} transition-colors`}
                          style={{ gridTemplateColumns: "80px 1fr 48px 64px" }}>
                          <div>
                            <div className="font-sans text-xs text-white/40">{formatDate(m.utcDate)}</div>
                            <div className="font-sans text-xs text-white/25">{formatTime(m.utcDate)}</div>
                          </div>
                          <div className="font-sans text-sm font-medium flex items-center gap-2" style={{ color: blacked ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.8)" }}>
                            {opp}
                            {blacked && <span className="font-display font-bold text-xs text-red-400 bg-red-500/15 px-2 py-0.5">BLOCKED</span>}
                          </div>
                          <div className="font-display font-bold text-sm text-right" style={{ color: resColor }}>{result ? result.score : "—"}</div>
                          <div className="font-display font-bold text-sm text-right" style={{ color: blacked ? "#ef4444" : "rgba(255,255,255,0.5)" }}>{blacked ? "—" : fmt(cpg)}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-white/25 font-display text-sm">No fixtures played yet this season.</div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Landing() {
  const [email, setEmail]         = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [signers, setSigners]     = useState(4261);
  const [scrolled, setScrolled]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useGSAP(() => {
    ScrollTrigger.batch(".stat-card", {
      onEnter: els => gsap.from(els, { opacity: 0, y: 24, duration: 0.5, stagger: 0.1, ease: "power2.out" }),
      once: true, start: "top 87%",
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setSigners(s => s + Math.floor(Math.random() * 3)), 8000);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearInterval(interval); window.removeEventListener("scroll", onScroll); };
  }, []);

  const handleSubmit = (e) => { e.preventDefault(); if (email && firstName) setSubmitted(true); };

  return (
    <>
      <Head>
        <title>Paywall FC — Your Club. Their Profit.</title>
        <meta name="description" content="UK football fans are being priced out of watching their own clubs. Join the campaign." />
      </Head>

      {/* ── NAV ── */}
      <header className="sticky top-0 z-50 transition-all" style={{
        background: scrolled ? "rgba(17,16,17,0.98)" : "rgba(17,16,17,0.94)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(223,235,247,0.07)",
      }}>
        <div className="max-w-[1440px] mx-auto px-6 h-[60px] flex items-center justify-between gap-6">

          {/* Badge only */}
          <a href="#" className="shrink-0">
            <img src="/badge.png" alt="Paywall FC" className="w-9 h-9 object-contain" />
          </a>

          {/* Right: nav links + CTA */}
          <div className="flex items-center gap-1">
            <nav className="hidden md:flex items-center gap-1 mr-3">
              {NAV_LINKS.map(([href, label]) => (
                <a key={href} href={href}
                  className="font-display font-semibold text-[11px] tracking-[1.5px] uppercase px-4 py-2 transition-colors"
                  style={{ color: "rgba(223,235,247,0.4)" }}
                  onMouseEnter={e => e.target.style.color = "#fed107"}
                  onMouseLeave={e => e.target.style.color = "rgba(223,235,247,0.4)"}
                >{label}</a>
              ))}
            </nav>
            <a href="#petition" className="shrink-0 font-display font-black text-[11px] tracking-[1.8px] uppercase px-5 py-2 transition-opacity hover:opacity-85"
              style={{ background: "#fdd209", color: "#121212" }}>
              Sign the Petition
            </a>
            <button className="md:hidden font-display font-bold text-xs text-brand-yellow" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t bg-brand-dark" style={{ borderColor: "rgba(223,235,247,0.07)" }}>
            {NAV_LINKS.map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMobileOpen(false)}
                className="block font-display font-semibold text-sm tracking-widest uppercase px-6 py-3 border-b transition-colors hover:text-brand-yellow"
                style={{ color: "rgba(223,235,247,0.5)", borderColor: "rgba(223,235,247,0.07)" }}>{label}</a>
            ))}
          </div>
        )}
      </header>

      {/* ── HERO (VIDEO) ── */}
      <section className="border-b" style={{ borderColor: "rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-16 pb-10 grid grid-cols-12 gap-6">
          <div className="col-span-12">
            <div className="font-display font-semibold text-xs tracking-[0.3em] uppercase mb-4 flex items-center gap-2"
              style={{ color: "#e03535" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "#e03535", animation: "livePulse 1.4s ease-in-out infinite" }} />
              The Experience — scroll into view to start
            </div>
            <VideoSection />
            <p className="font-display text-xs tracking-widest mt-3" style={{ color: "rgba(223,235,247,0.2)" }}>
              Popups appear automatically · This is what watching football feels like in 2026
            </p>
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      <div className="overflow-hidden py-[14px]" style={{ background: "linear-gradient(90deg, #fed107, #ffd42a)" }}>
        <div className="flex whitespace-nowrap" style={{ animation: "tick 28s linear infinite" }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex">
              {["Sky Sports: £34.99/mo |","TNT Sports: £30.99/mo |","TV Licence: £14.54/mo |","Total: £775/season |","113 Premier League games blacked out |","30% of the season unwatchable"].map((item, j) => (
                <span key={j} className="font-display font-extrabold text-[15px] tracking-[2.1px] uppercase px-9" style={{ color: "#121212" }}>
                  {item}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── CALCULATOR ── */}
      <CalculatorSection />

      {/* ── THE COST OF FOOTBALL ── */}
      <section id="costs" style={{ borderTop: "1px solid rgba(223,235,247,0.07)", borderBottom: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-24">

          {/* Header */}
          <div className="grid grid-cols-12 gap-6 mb-16">
            <div className="col-span-12 lg:col-span-5">
              <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase text-brand-yellow mb-4">And that's only the Premier League</div>
              <h2 className="font-display font-black uppercase text-brand-text" style={{ fontSize: "clamp(2.4rem,5vw,57px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
                £775.<br />And that's<br />just the start.
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-7 flex items-end">
              <p className="text-[15.5px] leading-[28px]" style={{ color: "rgba(223,235,247,0.6)" }}>
                Every number in the calculator above covers the Premier League alone. Millions of English fans don't stop there — the Champions League, La Liga, Serie A, Ligue 1. Each competition sits behind a different paywall. Add them up and see what this sport is really costing you.
              </p>
            </div>
          </div>

          {/* Escalation ladder */}
          <div className="grid grid-cols-12 gap-6 mb-16">
            <div className="col-span-12 lg:col-span-8 lg:col-start-5 flex flex-col gap-0" style={{ border: "1px solid rgba(223,235,247,0.07)" }}>
              {[
                { label: "Premier League only",             services: "Sky Sports + TNT Sports + TV Licence",                                  annual: "£775",     color: "#dfebf7", accent: "rgba(223,235,247,0.04)", border: "rgba(223,235,247,0.07)", tag: null },
                { label: "+ Champions League",              services: "TNT Sports CL package on top",                                          annual: "~£820",    color: "#fed107", accent: "rgba(254,209,7,0.03)",  border: "rgba(254,209,7,0.12)",  tag: null },
                { label: "+ All major European football",   services: "DAZN (Serie A) + Premier Sports + Disney+ (La Liga) + Ligue 1+",         annual: "~£1,697",  color: "#e03535", accent: "rgba(224,53,53,0.04)",  border: "rgba(224,53,53,0.15)",  tag: "Today" },
                { label: "+ Paramount+ from 2027/28",       services: "Champions League moves exclusively to Paramount+ — another subscription", annual: "~£1,757+", color: "#e03535", accent: "rgba(224,53,53,0.07)",  border: "rgba(224,53,53,0.22)",  tag: "Coming soon" },
              ].map((tier, i) => (
                <div key={i} className="px-6 py-5 flex items-center justify-between gap-4" style={{
                  background: tier.accent,
                  borderBottom: i < 3 ? `1px solid ${tier.border}` : "none",
                }}>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-bold text-[15px]" style={{ color: tier.color }}>{tier.label}</span>
                      {tier.tag && <span className="font-display font-black text-[9px] tracking-[1.5px] uppercase px-2 py-[2px]" style={{ background: tier.color, color: "#121212" }}>{tier.tag}</span>}
                    </div>
                    <div className="text-[12px] leading-[19px]" style={{ color: "rgba(223,235,247,0.32)" }}>{tier.services}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display font-black text-[26px] leading-none" style={{ color: tier.color }}>{tier.annual}</div>
                    <div className="font-display text-[10px] tracking-[1px] uppercase mt-1" style={{ color: "rgba(223,235,247,0.28)" }}>per season</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats — the numbers in full */}
          <div className="grid grid-cols-12 gap-6" style={{ borderTop: "1px solid rgba(223,235,247,0.07)", paddingTop: "4rem" }}>
            <div className="col-span-6 md:col-span-3 stat-card"><AnimStat prefix="£" value={775} label="PL only — per season" accent="#dfebf7" /></div>
            <div className="col-span-6 md:col-span-3 stat-card"><AnimStat value={113} label="Games blacked out" accent="#e03535" /></div>
            <div className="col-span-6 md:col-span-3 stat-card"><AnimStat value={30} suffix="%" label="Of the season unwatchable" accent="#e03535" /></div>
            <div className="col-span-6 md:col-span-3 stat-card"><AnimStat prefix="~£" value={1697} label="To watch all football" accent="#fed107" /></div>
          </div>

        </div>
      </section>

      {/* ── PROBLEM + BLACKOUT (merged) ── */}
      <section id="problem" style={{ borderTop: "1px solid rgba(223,235,247,0.07)", borderBottom: "1px solid rgba(224,53,53,0.12)", background: "rgba(224,53,53,0.018)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-24 grid grid-cols-12 gap-6 items-start">

          {/* ── Left: full narrative ── */}
          <div className="col-span-12 md:col-span-5 flex flex-col gap-8">

            {/* Problem block */}
            <div>
              <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase mb-4" style={{ color: "#e03535" }}>The Problem</div>
              <h2 className="font-display font-black uppercase mb-5 text-brand-text" style={{ fontSize: "clamp(2.4rem,5vw,57px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
                Fans silenced<br />by their own<br />wallets.
              </h2>
              <div className="flex flex-col gap-5 text-[15.5px] leading-[28px]" style={{ color: "rgba(223,235,247,0.6)" }}>
                <p>There was a time when you could watch your club on a single channel. That era is gone. Premier League rights have been deliberately fragmented across Sky, TNT, and the BBC —{" "}
                  <strong className="font-semibold text-brand-text">forcing fans to pay for all three or miss out.</strong>
                </p>
                <p>Leagues and broadcasters call it{" "}
                  <strong className="font-semibold text-brand-text">"protecting the grassroots game."</strong>{" "}
                  Fans call it what it is: a cartel protecting profit.
                </p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "rgba(224,53,53,0.2)" }} />

            {/* Blackout block */}
            <div>
              <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase mb-4" style={{ color: "#e03535" }}>The 3pm Blackout</div>
              <h3 className="font-display font-black uppercase mb-5 text-brand-text" style={{ fontSize: "clamp(1.8rem,3.5vw,40px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
                Pay for everything.<br />Watch less.
              </h3>
              <div className="flex flex-col gap-4 text-[15.5px] leading-[28px] mb-6" style={{ color: "rgba(223,235,247,0.6)" }}>
                <p>Under UK broadcasting law, no live football can be shown between 2:45pm and 5:15pm on Saturdays. The rule dates back to 1960.</p>
                <p>In 2025/26, it means{" "}
                  <strong className="font-semibold text-brand-text">113 Premier League games per season</strong>
                  {" "}are completely unwatchable — regardless of how much you've paid.
                </p>
              </div>
              <div className="p-5" style={{ background: "rgba(224,53,53,0.05)", border: "1px solid rgba(224,53,53,0.2)" }}>
                <div className="font-display font-extrabold text-[11.5px] tracking-[1.9px] uppercase mb-2" style={{ color: "#e03535" }}>The rule, verbatim</div>
                <p className="text-[13.5px] leading-[23px]" style={{ color: "rgba(223,235,247,0.45)" }}>
                  "No live broadcast coverage of any association football match in the United Kingdom may commence between 14:45 and 17:15 on a Saturday." — UEFA Article 48, UEFA Statutes
                </p>
              </div>
            </div>
          </div>

          {/* ── Right: callouts ── */}
          <div className="col-span-12 md:col-span-7 flex flex-col gap-6">

            <div className="p-8 flex flex-col gap-3" style={{ background: "rgba(224,53,53,0.06)", border: "1px solid rgba(224,53,53,0.2)" }}>
              <div className="font-display font-black" style={{ fontSize: "clamp(4rem,10vw,96px)", color: "#e03535", lineHeight: "1" }}>113</div>
              <div className="font-display font-bold text-[13px] tracking-[2px] uppercase" style={{ color: "rgba(223,235,247,0.45)" }}>Premier League games per season — paid for. Subscribed to. Completely unwatchable.</div>
            </div>

            <div className="p-8 flex flex-col gap-3" style={{ background: "rgba(224,53,53,0.04)", border: "1px solid rgba(224,53,53,0.14)" }}>
              <div className="font-display font-black" style={{ fontSize: "clamp(4rem,10vw,96px)", color: "#e03535", lineHeight: "1" }}>1960</div>
              <div className="font-display font-bold text-[13px] tracking-[2px] uppercase" style={{ color: "rgba(223,235,247,0.45)" }}>The year the 3pm blackout rule was introduced. Before colour TV. Before satellite. Before the internet existed.</div>
            </div>

          </div>
        </div>
      </section>

      {/* ── FAN VOICES ── */}
      <section style={{ borderTop: "1px solid rgba(223,235,247,0.07)", borderBottom: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-24">
          <div className="grid grid-cols-12 gap-6 mb-12">
            <div className="col-span-12 lg:col-span-5">
              <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase text-brand-yellow mb-4">You're not alone</div>
              <h2 className="font-display font-black uppercase text-brand-text" style={{ fontSize: "clamp(2.4rem,5vw,57px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
                Every fan<br />feels it.
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-7 flex items-end">
              <p className="text-[15.5px] leading-[28px]" style={{ color: "rgba(223,235,247,0.6)" }}>
                This isn't one fan's frustration. Across every club, every age group, every income bracket — the story is the same. Paying more. Watching less. Running out of patience.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-6">
            {[
              { text: `"I pay for everything. Still missed games. Sick to my stomach, honestly. They know we'll keep paying, so they just keep taking."`, attr: "Adam, Arsenal supporter, 23" },
              { text: `"It's not just streaming — kits, tickets, subscriptions. Football's becoming inaccessible to younger kids. The people running this game are out of touch."`, attr: "Lewis, Southampton supporter, 23" },
              { text: `"Extortionate, expensive, poor. That's all I've got left to say. I've run out of ways to be angry about it."`, attr: "Harry, Arsenal supporter, 24" },
            ].map((q, i) => (
              <div key={i} className="col-span-12 md:col-span-4 pl-6 pr-5 py-6" style={{
                borderLeft: "3px solid rgba(254,209,7,0.45)",
                background: "rgba(254,209,7,0.02)",
              }}>
                <p className="text-[17px] leading-[30px] mb-4 italic" style={{ color: "rgba(223,235,247,0.82)" }}>{q.text}</p>
                <p className="font-display font-semibold text-[11px] tracking-[1.4px] uppercase" style={{ color: "rgba(223,235,247,0.35)" }}>— {q.attr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT + DEMANDS ── */}
      <section style={{ borderBottom: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-24 grid grid-cols-12 gap-6">

          {/* About Paywall FC */}
          <div className="col-span-12 lg:col-span-5 mb-6">
            <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase text-brand-yellow mb-4">About Paywall FC</div>
            <h2 className="font-display font-black uppercase text-brand-text" style={{ fontSize: "clamp(2.4rem,5vw,57px)", letterSpacing: "-0.02em", lineHeight: "1.05" }}>
              A fictional club.<br />A very real<br />fight.
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-7 lg:flex lg:items-end mb-16">
            <p className="text-[15.5px] leading-[28px]" style={{ color: "rgba(223,235,247,0.6)" }}>
              Paywall FC is a campaign built to give a name, a badge, and a voice to every fan priced out of the game they love. We're not affiliated with any club or broadcaster. We track the real cost of watching football in England — and we're demanding change before the 2029 rights deal locks fans out for another decade.
            </p>
          </div>

          {/* Demands */}
          <div className="col-span-12 mb-4">
            <div className="font-display font-semibold text-[11px] tracking-[3.5px] uppercase text-brand-yellow">What we're demanding</div>
          </div>
          <div className="col-span-12 grid grid-cols-12 gap-0" style={{ borderTop: "1px solid rgba(254,209,7,0.08)", borderBottom: "1px solid rgba(254,209,7,0.08)" }}>
            {[
              {
                n: "01",
                t: "One fair subscription",
                d: "All Premier League matches — every single one — accessible through a single, affordable subscription. No more forcing fans to pay for multiple platforms just to watch their club.",
              },
              {
                n: "02",
                t: "End the 3pm blackout",
                d: "Abolish the 3pm Saturday blackout rule for streaming. It was designed for a world before the internet. It punishes the fans who pay the most and watch their club the least.",
              },
              {
                n: "03",
                t: "Fans at the table",
                d: "Meaningful fan consultation before the 2029 Premier League broadcast rights deal is signed. The fans who fund this sport must have a say in how it's sold.",
              },
            ].map((s, i) => (
              <div key={i} className="stat-card col-span-12 md:col-span-4 relative py-10 px-10" style={{
                background: "linear-gradient(180deg, rgba(254,209,7,0.03) 0%, transparent 100%)",
                borderLeft: i > 0 ? "1px solid rgba(223,235,247,0.07)" : "none",
              }}>
                <div className="absolute top-6 right-6 font-display font-black leading-none select-none" style={{ fontSize: "83px", color: "rgba(254,209,7,0.09)" }}>{s.n}</div>
                <div className="font-display font-black text-[23px] uppercase tracking-[0.7px] mb-3 text-brand-text">{s.t}</div>
                <p className="text-[14.7px] leading-[25.8px]" style={{ color: "rgba(223,235,247,0.5)" }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PETITION ── */}
      <section id="petition" style={{ borderTop: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-24 grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-8 md:col-start-3 lg:col-span-6 lg:col-start-4 text-center">
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <span className="w-12 h-px" style={{ background: "rgba(254,209,7,0.3)" }} />
            <span className="font-display font-semibold text-[11.7px] tracking-[3.5px] uppercase text-brand-yellow">Take Action</span>
            <span className="w-12 h-px" style={{ background: "rgba(254,209,7,0.3)" }} />
          </div>

          <h2 className="font-display font-black uppercase text-center text-brand-text mb-6" style={{ fontSize: "clamp(3rem,10vw,88px)", letterSpacing: "-1.76px", lineHeight: "0.88" }}>
            Add your<br />name.
          </h2>

          <p className="text-[16px] leading-[28px] text-center mb-8" style={{ color: "rgba(223,235,247,0.5)" }}>
            Demand the Premier League and broadcasters introduce fair, affordable access — and end the 3pm blackout rule for streaming fans.
          </p>

          {/* Count */}
          <div className="font-display font-black text-center mb-2" style={{
            fontSize: "clamp(4rem,12vw,116px)", color: "#fed107",
            lineHeight: "1", textShadow: "0 0 28px rgba(254,209,7,0.22)",
            animation: "countGlow 3.5s ease-in-out infinite",
          }} suppressHydrationWarning>{numFmt(signers)}</div>
          <div className="font-display font-bold text-[12.8px] tracking-[2.8px] uppercase mb-8" style={{ color: "rgba(223,235,247,0.42)" }} suppressHydrationWarning>fans have signed</div>

          <div className="px-4 py-3 font-display font-bold text-[11.8px] tracking-[1.8px] uppercase text-center mb-10" style={{
            background: "rgba(254,209,7,0.06)",
            border: "1px solid rgba(254,209,7,0.25)",
            color: "rgba(254,209,7,0.85)",
          }}>
            Momentum is building every day
          </div>

          {submitted ? (
            <div className="p-10" style={{ border: "1px solid rgba(254,209,7,0.2)", background: "rgba(254,209,7,0.05)" }}>
              <img src="/badge.png" alt="" className="w-16 h-16 object-contain mx-auto mb-4" style={{ filter: "drop-shadow(0 0 12px rgba(254,209,7,0.35))" }} />
              <div className="font-display font-black text-brand-yellow text-2xl uppercase mb-2">You're in, {firstName}.</div>
              <div className="text-sm leading-relaxed" style={{ color: "rgba(223,235,247,0.5)" }}>Share the campaign so others can add their name. Together, we're impossible to ignore.</div>
            </div>
          ) : (
            <form className="flex flex-col gap-[10px]" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-[10px]">
                <input className={INPUT_CLS} style={INPUT_STYLE} {...INPUT_FOCUS}
                  type="text" placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                <input className={INPUT_CLS} style={INPUT_STYLE} {...INPUT_FOCUS}
                  type="text" placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
              <input className={INPUT_CLS} style={INPUT_STYLE} {...INPUT_FOCUS}
                type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className={INPUT_CLS} style={INPUT_STYLE} {...INPUT_FOCUS}
                type="text" placeholder="Club you support (optional)" />
              <button type="submit" className="w-full py-[18px] font-display font-black text-[16.8px] tracking-[2.5px] uppercase transition-opacity hover:opacity-85"
                style={{ background: "#fed107", color: "#121212" }}>
                Sign the Petition
              </button>
              <p className="text-[12px] leading-[20px] text-center pt-3" style={{ color: "rgba(223,235,247,0.22)" }}>
                By signing you agree to receive campaign updates from Paywall FC. We'll never share your data. Unsubscribe anytime. Not affiliated with any PL club or broadcaster.
              </p>
            </form>
          )}
        </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: "1px solid rgba(223,235,247,0.07)" }}>
        <div className="max-w-[1440px] mx-auto px-6 py-12 grid grid-cols-12 gap-6 items-center">
          <div className="col-span-12 md:col-span-3 flex items-center gap-[10px]">
            <img src="/badge.png" alt="" className="w-7 h-7 object-contain" style={{ opacity: 0.8 }} />
            <span className="font-display font-extrabold text-brand-yellow text-[16px] tracking-[0.96px]">PAYWALL FC</span>
          </div>
          <p className="col-span-12 md:col-span-6 text-[12.5px] leading-5 text-center" style={{ color: "rgba(223,235,247,0.22)" }}>
            A campaign project. Not affiliated with the Premier League, Sky, TNT, or any professional football club.
          </p>
          <div className="col-span-12 md:col-span-3 flex justify-end gap-6">
            {[["#problem","Problem"],["#costs","Costs"],["#calculator","Calculator"],["#petition","Petition"]].map(([href, label]) => (
              <a key={href} href={href} className="font-display font-semibold text-xs tracking-[1.2px] uppercase transition-colors"
                style={{ color: "rgba(223,235,247,0.28)" }}
                onMouseEnter={e => e.target.style.color = "#fed107"}
                onMouseLeave={e => e.target.style.color = "rgba(223,235,247,0.28)"}
              >{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
