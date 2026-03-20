import Head from "next/head";
import { useState, useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { CLUBS, getClubByKey } from "../lib/clubs";
import { isBlackout, PRICES } from "../lib/calculator";

gsap.registerPlugin(ScrollTrigger, useGSAP);

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
  { id: 7,  delay: 26000, duration: 1000, type: "stat",  stat: "£309.90", label: "TNT Sports. Per season." },
  { id: 8,  delay: 27500, duration: 1000, type: "stat",  stat: "£145.32", label: "TV Licence. Still required." },
  { id: 9,  delay: 29000, duration: 1000, type: "stat",  stat: "30%",     label: "Of games. Unwatchable." },
  { id: 10, delay: 30500, duration: 6000, type: "final", stat: "£805.12",
    label: "A year. And you still can't watch this.", cta: "Sign the petition" },
];

// ─── Constants ───────────────────────────────────────────────────────────────
const SEASON_MONTHS = 10;
const SKY_MONTHLY   = PRICES.skyNow;
const TNT_MONTHLY   = PRICES.tnt;
const SKY_SEASON    = SKY_MONTHLY  * SEASON_MONTHS;
const TNT_SEASON    = TNT_MONTHLY  * SEASON_MONTHS;
const TVLIC_SEASON  = (8 * PRICES.tvLicEarly) + (2 * PRICES.tvLicLate);
const TOTAL_SEASON  = SKY_SEASON + TNT_SEASON + TVLIC_SEASON;
const PINT_PRICE    = 6.20;

function numFmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function monthsElapsed() {
  const start = new Date("2025-08-15");
  const ms    = Math.max(0, new Date() - start);
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
function AnimStat({ prefix = "", value, suffix = "", decimals = 0, label, accent = "#FFD700" }) {
  const ref        = useRef(null);
  const displayRef = useRef(null);
  const proxy      = useRef({ val: 0 });

  useGSAP(() => {
    const trigger = { trigger: ref.current, start: "top 82%", once: true };
    gsap.from(ref.current, { opacity: 0, y: 20, duration: 0.6, ease: "power2.out", scrollTrigger: trigger });
    gsap.to(proxy.current, {
      val: value, duration: 1.8, ease: "power2.out", scrollTrigger: trigger,
      onUpdate() {
        if (displayRef.current) {
          const v = proxy.current.val;
          displayRef.current.textContent = prefix + (decimals > 0 ? v.toFixed(decimals) : numFmt(v)) + suffix;
        }
      },
    });
  }, { scope: ref });

  return (
    <div ref={ref} className="flex flex-col gap-2" style={{ opacity: 0 }}>
      <div ref={displayRef} className="font-display font-black leading-none" style={{ fontSize: "clamp(3rem,7vw,5.5rem)", color: accent }}>
        {prefix}{decimals > 0 ? (0).toFixed(decimals) : "0"}{suffix}
      </div>
      <div className="font-display font-bold text-xs tracking-widest uppercase text-brand-muted">{label}</div>
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
function CalculatorSection({ signers }) {
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
  const tntSoFar = TNT_MONTHLY * months;
  const tvSoFar  = soFar - skySoFar - tntSoFar;

  const finished   = matches ? matches.filter(m => m.status === "FINISHED") : [];
  const blacked    = finished.filter(m => isBlackout(m.utcDate));
  const streamable = finished.length - blacked.length;
  const cpg        = streamable > 0 ? soFar / streamable : 0;

  return (
    <section id="calculator" className="border-t border-brand-border">
      <div className="max-w-[1100px] mx-auto px-6 py-20">
        {/* Header */}
        <div className="mb-10">
          <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-brand-yellow mb-3">Your Numbers</div>
          <h2 className="font-display font-black text-white uppercase leading-none mb-3" style={{ fontSize: "clamp(2.4rem,5vw,3.6rem)", letterSpacing: "-0.01em" }}>
            What are you actually paying?
          </h2>
          <p className="text-white/50 leading-relaxed max-w-lg">
            Select your club to see this season's cost breakdown, your blackout count, and exactly how much each game is costing you.
          </p>
        </div>

        {/* Club picker */}
        <div className="relative max-w-sm mb-10">
          <select
            value={clubKey}
            onChange={e => setClubKey(e.target.value)}
            className="w-full px-5 py-4 bg-brand-panel border border-brand-border font-display font-bold text-lg text-white appearance-none cursor-pointer outline-none rounded-sm transition-colors focus:border-brand-yellow"
            style={{ color: clubKey ? "white" : "rgba(255,255,255,0.3)" }}
          >
            <option value="">— Select your club —</option>
            {CLUBS.map(c => <option key={c.key} value={c.key}>{c.name}</option>)}
          </select>
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-brand-yellow text-xs pointer-events-none">▼</span>
        </div>

        {/* Empty state */}
        {!club && (
          <div className="border border-dashed border-brand-yellow/20 bg-brand-yellow/5 p-10 text-center rounded-sm">
            <div className="font-display font-black text-white uppercase tracking-widest text-lg">Select a club to trigger your live cost breakdown</div>
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

        {/* Results */}
        {club && matches && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
            {/* Left — stats */}
            <div className="flex flex-col gap-4">
              {/* 3 stat cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Spent so far", value: fmtR(soFar), sub: "Aug 2025 – now", highlight: true },
                  { label: "Your blackouts", value: blacked.length, sub: "games blocked" },
                  { label: "Cost per game", value: fmt(cpg), sub: `${streamable} streamable` },
                ].map((s, i) => (
                  <div key={i} className={`p-4 border rounded-sm ${s.highlight ? "bg-brand-yellow/8 border-brand-yellow/20" : "bg-brand-panel border-brand-border"}`}>
                    <div className={`font-display font-bold text-xs tracking-widest uppercase mb-2 ${s.highlight ? "text-brand-yellow/60" : "text-brand-muted"}`}>{s.label}</div>
                    <div className={`font-display font-black text-2xl leading-none ${s.highlight ? "text-brand-yellow" : "text-white"}`}>{s.value}</div>
                    <div className="text-xs text-white/30 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Service breakdown */}
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

              {/* Pints */}
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

            {/* Right — fixtures */}
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
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Landing() {
  const [email, setEmail]           = useState("");
  const [name, setName]             = useState("");
  const [submitted, setSubmitted]   = useState(false);
  const [signers, setSigners]       = useState(4217);
  const [mounted, setMounted]       = useState(false);
  const [scrolled, setScrolled]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.from(".hero-eyebrow", { opacity: 0, y: 16, duration: 0.5 })
      .from(".hero-title",   { opacity: 0, y: 24, duration: 0.55, stagger: 0.1 }, "-=0.25")
      .from(".hero-sub",     { opacity: 0, y: 16, duration: 0.5 }, "-=0.2")
      .from(".hero-actions", { opacity: 0, y: 12, duration: 0.45 }, "-=0.2")
      .from(".hero-badge",   { opacity: 0, scale: 0.85, duration: 0.7, ease: "back.out(1.7)" }, "<0.1");

    ScrollTrigger.batch(".stat-card", {
      onEnter: els => gsap.from(els, { opacity: 0, y: 24, duration: 0.5, stagger: 0.1, ease: "power2.out" }),
      once: true, start: "top 87%",
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setSigners(s => s + Math.floor(Math.random() * 3)), 8000);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { clearInterval(interval); window.removeEventListener("scroll", onScroll); };
  }, []);

  const handleSubmit = (e) => { e.preventDefault(); if (email && name) setSubmitted(true); };

  return (
    <>
      <Head>
        <title>Paywall FC — Your Club. Their Profit.</title>
        <meta name="description" content="UK football fans are being priced out of watching their own clubs. Join the campaign." />
      </Head>

      {/* ── NAV ── */}
      <header className={`sticky top-0 z-50 border-b transition-all ${scrolled ? "bg-[#0d0d0d] border-brand-border" : "bg-brand-dark/90 border-brand-border/50"}`} style={{ backdropFilter: "blur(20px)" }}>
        <div className="h-0.5 bg-brand-yellow w-full" />
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Brand */}
          <a href="#" className="flex items-center gap-3 no-underline">
            <img src="/badge.png" alt="Paywall FC" className="w-9 h-9 object-contain" />
            <div className="hidden sm:flex flex-col leading-none gap-0.5">
              <span className="font-display font-black text-lg text-white tracking-tight leading-none">PAYWALL FC</span>
              <span className="font-display font-bold text-[10px] tracking-widest uppercase text-brand-yellow leading-none">The club you already pay for</span>
            </div>
          </a>

          {/* Nav links */}
          <nav className="hidden md:flex items-center">
            {[["#problem","The Problem"],["#costs","The Cost"],["#calculator","Calculator"],["#petition","Petition"]].map(([href, label]) => (
              <a key={href} href={href} className="font-display font-bold text-xs tracking-widest uppercase text-white/40 hover:text-white transition-colors px-4 h-16 flex items-center border-b-2 border-transparent hover:border-white/20">{label}</a>
            ))}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:block font-sans text-xs text-white/35" suppressHydrationWarning>
              <span className="text-brand-yellow font-bold" suppressHydrationWarning>{numFmt(signers)}</span> fans signed
            </div>
            <a href="#petition" className="font-display font-black text-xs tracking-widest uppercase px-4 py-2 bg-brand-yellow text-black transition-opacity hover:opacity-85">
              Sign the Petition
            </a>
            <button className="md:hidden text-brand-yellow font-display font-bold text-xs" onClick={() => setMobileOpen(o => !o)}>
              {mobileOpen ? "Close" : "Menu"}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-brand-border bg-brand-dark">
            {[["#problem","The Problem"],["#costs","The Cost"],["#calculator","Calculator"],["#petition","Petition"]].map(([href, label]) => (
              <a key={href} href={href} onClick={() => setMobileOpen(false)}
                className="block font-display font-bold text-sm tracking-widest uppercase text-white/50 hover:text-brand-yellow px-6 py-3 border-b border-brand-border/50 transition-colors">{label}</a>
            ))}
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="border-b border-brand-border">
        <div className="max-w-[1400px] mx-auto px-6 py-16 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-10 items-start">
          {/* Left: video + title */}
          <div className="flex flex-col gap-6">
            <div>
              <div className="hero-eyebrow font-display font-bold text-xs tracking-[0.3em] uppercase text-brand-yellow mb-4 flex items-center gap-3">
                <span className="w-8 h-px bg-brand-yellow inline-block" />
                A campaign by football fans, for football fans
              </div>
              <h1 className="font-display font-black uppercase leading-none mb-5" style={{ fontSize: "clamp(3rem,7vw,6rem)", letterSpacing: "-0.02em" }}>
                <span className="hero-title block text-white">Your club.</span>
                <span className="hero-title block">
                  <span className="text-white/15 relative inline-block mr-2">
                    right
                    <span className="absolute left-0 right-0 top-1/2 h-1 bg-red-500 -rotate-1" />
                  </span>
                  <span className="text-white">your.</span>
                </span>
                <span className="hero-title block text-brand-yellow">Their profit.</span>
              </h1>
              <p className="hero-sub text-white/55 leading-relaxed max-w-lg" suppressHydrationWarning>
                UK fans pay <strong className="text-white font-semibold">£805 a season</strong> across three subscriptions — and still can't watch a third of their club's games. Scroll down. See exactly what that looks like.
              </p>
              <div className="hero-actions flex gap-3 mt-6 flex-wrap">
                <a href="#petition" className="font-display font-black text-sm tracking-widest uppercase px-6 py-3 bg-brand-yellow text-black transition-opacity hover:opacity-85">Sign the Petition</a>
                <a href="#calculator" className="font-display font-bold text-sm tracking-widest uppercase px-6 py-3 border border-brand-border text-white/70 hover:border-brand-yellow/50 hover:text-white transition-colors">Calculate Your Cost</a>
              </div>
              <div className="mt-4 font-sans text-xs text-white/30" suppressHydrationWarning>
                <span className="text-brand-yellow font-bold" suppressHydrationWarning>{numFmt(signers)}</span> fans have already signed
              </div>
            </div>

            {/* Video */}
            <div>
              <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-red-400 mb-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" style={{ animation: "livePulse 1.4s ease-in-out infinite" }} />
                The Experience — scroll into view to play
              </div>
              <VideoSection />
              <p className="text-xs text-white/20 tracking-widest mt-2">Popups appear automatically · This is what watching football feels like in 2026</p>
            </div>
          </div>

          {/* Right sidebar: key stats */}
          <aside className="flex flex-col gap-4 xl:sticky xl:top-24">
            {/* Badge */}
            <div className="flex justify-center py-4">
              <img src="/badge.png" alt="Paywall FC" className="hero-badge w-32 h-32 object-contain" style={{ filter: "drop-shadow(0 0 24px rgba(255,215,0,0.15))", animation: "badgeFloat 4s ease-in-out infinite" }} />
            </div>

            {/* Season cost card */}
            <div className="bg-brand-panel border border-brand-border rounded-sm p-5">
              <div className="font-display font-bold text-xs tracking-widest uppercase text-brand-muted mb-4">Season Cost 2025/26</div>
              <div className="divide-y divide-brand-border">
                {[
                  { label: "Sky Sports NOW",    val: "£349.90", color: "#4a90d9" },
                  { label: "TNT Sports",        val: "£309.90", color: "#f0a500" },
                  { label: "TV Licence",        val: "£145.32", color: "rgba(255,255,255,0.5)" },
                ].map(({ label, val, color }) => (
                  <div key={label} className="flex justify-between items-center py-3">
                    <span className="font-sans text-sm text-white/60">{label}</span>
                    <span className="font-display font-black text-lg" style={{ color }}>{val}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-4">
                  <span className="font-display font-bold text-sm uppercase tracking-wider text-brand-yellow">Total</span>
                  <span className="font-display font-black text-3xl text-brand-yellow" style={{ textShadow: "0 0 20px rgba(255,215,0,0.3)" }}>£805.12</span>
                </div>
              </div>
            </div>

            {/* Blackout box */}
            <div className="bg-red-500/8 border border-red-500/25 rounded-sm p-5">
              <div className="font-display font-bold text-xs tracking-widest uppercase text-red-400 mb-3">The 3pm Blackout</div>
              <p className="font-sans text-sm text-white/50 leading-relaxed">
                <strong className="text-white font-semibold">113 games per season</strong> are completely unwatchable under UK law — regardless of how many subscriptions you pay for.
              </p>
            </div>
          </aside>
        </div>
      </section>

      {/* ── TICKER ── */}
      <div className="bg-brand-yellow overflow-hidden py-3">
        <div className="flex whitespace-nowrap" style={{ animation: "tick 28s linear infinite" }}>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex">
              {["Sky Sports: £349.90/season","TNT Sports: £309.90/season","TV Licence: £145.32/season","113 games blacked out","30% unwatchable","£805.12 total cost","3 subscriptions. Still not enough.","The 3pm blackout. Still a thing.","Fans deserve better."].map((item, j) => (
                <span key={j} className="font-display font-black text-sm tracking-widest uppercase text-black px-8">
                  {item} <span className="opacity-30">·</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── STATS ── */}
      <section id="costs" className="border-b border-brand-border">
        <div className="max-w-[1100px] mx-auto px-6 py-20">
          <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-brand-yellow mb-12">The numbers don't lie</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
            <div className="stat-card"><AnimStat prefix="£" value={805.12} decimals={2} label="Total season cost" accent="#ffffff" /></div>
            <div className="stat-card"><AnimStat value={113} label="Games blacked out" accent="#ef4444" /></div>
            <div className="stat-card"><AnimStat value={30} suffix="%" label="Of games unwatchable" accent="#ef4444" /></div>
            <div className="stat-card"><AnimStat value={3} label="Subscriptions required" accent="#FFD700" /></div>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section id="problem" className="border-b border-brand-border">
        <div className="max-w-[1100px] mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          <div>
            <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-red-400 mb-4">The Problem</div>
            <h2 className="font-display font-black text-white uppercase leading-none mb-6" style={{ fontSize: "clamp(2.2rem,4vw,3.2rem)", letterSpacing: "-0.01em" }}>
              Fans silenced by their own wallets
            </h2>
            <div className="flex flex-col gap-4 text-white/55 leading-relaxed text-sm">
              <p>There was a time when you could watch your club on a single channel. That era is gone. PL rights have been deliberately fragmented across Sky, TNT, and the BBC — <strong className="text-white font-semibold">forcing fans to pay for all three or miss out.</strong></p>
              <p>Even those who pay everything still can't watch a third of their club's games. The <strong className="text-white font-semibold">3pm Saturday blackout rule</strong> — a relic from 1960 — ensures the most traditional matchday slot remains completely unwatchable.</p>
              <p>Leagues and broadcasters call it <strong className="text-white font-semibold">"protecting the grassroots game."</strong> Fans call it what it is: a cartel protecting profit.</p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {[
              { text: "I pay Sky, TNT, and the licence fee. I still can't watch my team on a Saturday afternoon. How is this acceptable in 2026?", attr: "Leeds United fan, Manchester" },
              { text: "My dad watched every game on one channel. I spend £800 a year and still miss matches. Something has to change.", attr: "Arsenal supporter, London" },
              { text: "Working class fans are being priced out. Football was the people's game. Not anymore.", attr: "Everton fan, Liverpool" },
            ].map((q, i) => (
              <div key={i} className="stat-card border-l-4 border-red-500/50 pl-5 py-4 bg-red-500/5 hover:bg-red-500/8 hover:translate-x-1 transition-all">
                <p className="text-sm text-white/75 italic leading-relaxed">"{q.text}"</p>
                <p className="font-display font-bold text-xs tracking-widest uppercase text-white/35 mt-3">— {q.attr}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BLACKOUT ── */}
      <section id="blackouts" className="border-b border-red-500/15 bg-red-500/3">
        <div className="max-w-[1100px] mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-start">
          <div>
            <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-red-400 mb-4">The 3pm Blackout</div>
            <h2 className="font-display font-black text-white uppercase leading-none mb-6" style={{ fontSize: "clamp(2.2rem,4vw,3.2rem)", letterSpacing: "-0.01em" }}>
              Pay for everything.<br />Watch less.
            </h2>
            <div className="flex flex-col gap-4 text-white/55 text-sm leading-relaxed mb-6">
              <p>Under UK broadcasting law, no live football can be shown between 2:45pm and 5:15pm on Saturdays. The rule dates back to 1960.</p>
              <p>In 2026, it means <strong className="text-white font-semibold">113 Premier League games per season</strong> are completely unwatchable — regardless of how much you've paid.</p>
            </div>
            <div className="border border-red-500/20 bg-red-500/5 p-5 rounded-sm">
              <div className="font-display font-black text-xs tracking-widest uppercase text-red-400 mb-2">The rule, verbatim</div>
              <p className="text-sm text-white/50 leading-relaxed italic">"No live broadcast coverage of any association football match in the United Kingdom may commence between 14:45 and 17:15 on a Saturday." — FA Regulations, Schedule D</p>
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <BlackoutBars />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Sky Sports",    value: "215",    color: "#4a90d9" },
                { label: "TNT Sports",    value: "52",     color: "#f0a500" },
                { label: "Blacked out",   value: "113",    color: "#ef4444" },
                { label: "Cost per game", value: "≈£3.02", color: "#FFD700" },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-sm border" style={{ background: `${item.color}08`, borderColor: `${item.color}20` }}>
                  <div className="font-display font-black text-2xl leading-none" style={{ color: item.color }}>{item.value}</div>
                  <div className="font-display font-bold text-xs tracking-widest uppercase text-white/35 mt-2">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="border-b border-brand-border">
        <div className="max-w-[1100px] mx-auto px-6 py-20">
          <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-brand-yellow mb-4">How Paywall FC Works</div>
          <h2 className="font-display font-black text-white uppercase leading-none mb-12" style={{ fontSize: "clamp(2.2rem,4vw,3.2rem)", letterSpacing: "-0.01em" }}>
            A hypothetical club.<br />A very real fight.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 border-t border-brand-yellow/15">
            {[
              { n: "01", t: "The Club",     d: "Paywall FC is a fictional football club built to embody every fan priced out of the game they love. We exist to give that frustration a name, a badge, and a voice." },
              { n: "02", t: "The Campaign", d: "We're building a social movement showing the real cost of watching football in the UK. Calculate your costs. Share them. Make the numbers impossible to ignore." },
              { n: "03", t: "The Petition", d: "Sign the petition demanding the Premier League and broadcasters introduce a fair, single-subscription model — and abolish the 3pm blackout rule for streaming." },
            ].map((s, i) => (
              <div key={i} className="stat-card relative p-8 border-l border-brand-border first:border-l-0 hover:bg-brand-yellow/3 transition-colors">
                <div className="absolute top-6 right-6 font-display font-black text-7xl text-brand-yellow/8 leading-none select-none">{s.n}</div>
                <div className="font-display font-black text-xl text-white uppercase mb-3">{s.t}</div>
                <p className="text-sm text-white/50 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CALCULATOR ── */}
      <CalculatorSection signers={signers} />

      {/* ── PETITION ── */}
      <section id="petition" className="border-t border-brand-border">
        <div className="max-w-[580px] mx-auto px-6 py-24 text-center">
          <div className="font-display font-bold text-xs tracking-[0.3em] uppercase text-brand-yellow mb-4 flex items-center justify-center gap-3">
            <span className="flex-1 max-w-12 h-px bg-brand-yellow/30" />
            Take Action
            <span className="flex-1 max-w-12 h-px bg-brand-yellow/30" />
          </div>
          <h2 className="font-display font-black text-white uppercase leading-none mb-4" style={{ fontSize: "clamp(3rem,8vw,6rem)", letterSpacing: "-0.02em" }}>
            Add your name.
          </h2>
          <p className="text-white/50 leading-relaxed mb-10">
            Demand the Premier League and broadcasters introduce fair, affordable access — and end the 3pm blackout rule for streaming fans.
          </p>

          {/* Count */}
          <div className="font-display font-black leading-none mb-2" style={{ fontSize: "clamp(4rem,12vw,8rem)", color: "#FFD700", animation: "countGlow 3.5s ease-in-out infinite" }} suppressHydrationWarning>
            {numFmt(signers)}
          </div>
          <div className="font-display font-bold text-xs tracking-[0.25em] uppercase text-white/40 mb-8" suppressHydrationWarning>fans have signed</div>

          <div className="border border-brand-yellow/25 bg-brand-yellow/6 px-4 py-3 font-display font-bold text-xs tracking-widest uppercase text-brand-yellow/85 mb-10">
            Momentum is building every day
          </div>

          {submitted ? (
            <div className="border border-brand-yellow/20 bg-brand-yellow/5 p-10">
              <img src="/badge.png" alt="" className="w-16 h-16 object-contain mx-auto mb-4" style={{ filter: "drop-shadow(0 0 12px rgba(255,215,0,0.35))" }} />
              <div className="font-display font-black text-brand-yellow text-2xl uppercase mb-2">You're in, {name}.</div>
              <div className="text-sm text-white/50 leading-relaxed">Share the campaign so others can add their name.<br />Together, we're impossible to ignore.</div>
            </div>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-3">
                <input className="w-full px-5 py-4 bg-brand-panel border border-brand-border text-white font-sans outline-none focus:border-brand-yellow transition-colors placeholder-white/20 rounded-none" type="text" placeholder="First name" value={name} onChange={e => setName(e.target.value)} required />
                <input className="w-full px-5 py-4 bg-brand-panel border border-brand-border text-white font-sans outline-none focus:border-brand-yellow transition-colors placeholder-white/20 rounded-none" type="text" placeholder="Last name" />
              </div>
              <input className="w-full px-5 py-4 bg-brand-panel border border-brand-border text-white font-sans outline-none focus:border-brand-yellow transition-colors placeholder-white/20 rounded-none" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
              <input className="w-full px-5 py-4 bg-brand-panel border border-brand-border text-white font-sans outline-none focus:border-brand-yellow transition-colors placeholder-white/20 rounded-none" type="text" placeholder="Club you support (optional)" />
              <button type="submit" className="w-full py-4 bg-brand-yellow text-black font-display font-black text-lg tracking-widest uppercase transition-opacity hover:opacity-85 active:scale-[0.99]">Sign the Petition</button>
              <p className="text-xs text-white/20 leading-relaxed">By signing you agree to receive campaign updates from Paywall FC. We'll never share your data. Unsubscribe anytime. Not affiliated with any PL club or broadcaster.</p>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-brand-border">
        <div className="max-w-[1100px] mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img src="/badge.png" alt="" className="w-7 h-7 object-contain opacity-80" />
            <span className="font-display font-black text-brand-yellow text-sm tracking-wider">PAYWALL FC</span>
          </div>
          <p className="text-xs text-white/20 leading-relaxed">A campaign project. Not affiliated with the Premier League, Sky, TNT, or any professional football club.</p>
          <div className="flex gap-6">
            {[["#problem","Problem"],["#costs","Costs"],["#calculator","Calculator"],["#petition","Petition"]].map(([href, label]) => (
              <a key={href} href={href} className="font-display font-bold text-xs tracking-widest uppercase text-white/25 hover:text-brand-yellow transition-colors">{label}</a>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
