import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ─────────────────────────────────────────────
// AUDIO ENGINE
// ─────────────────────────────────────────────
// Tuned to make strokes comfortably audible on quieter speakers without pushing
// the per-stroke envelopes harder, which helps preserve accent balance.
const MASTER_GAIN_VALUE = 1.8;
const masterGainNodeCache = new WeakMap();

function makeAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return new Ctx();
}

function getAudioOutput(ctx) {
  let masterGain = masterGainNodeCache.get(ctx);
  if (!masterGain) {
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_GAIN_VALUE;
    masterGain.connect(ctx.destination);
    masterGainNodeCache.set(ctx, masterGain);
  }
  return masterGain;
}

function playTom(ctx, t, g = 1) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(gain); gain.connect(getAudioOutput(ctx));
  osc.start(t); osc.stop(t + 0.35);
  const o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o2.type = "triangle"; o2.frequency.setValueAtTime(95, t);
  g2.gain.setValueAtTime(0.001, t);
  g2.gain.exponentialRampToValueAtTime(0.25 * g, t + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  o2.connect(g2); g2.connect(getAudioOutput(ctx));
  o2.start(t); o2.stop(t + 0.22);
}

function playBak(ctx, t, g = 1) {
  const sz = ctx.sampleRate * 0.06;
  const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/sz,2.5);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7*g, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t+0.07);
  src.connect(hp); hp.connect(gain); gain.connect(getAudioOutput(ctx));
  src.start(t); src.stop(t+0.08);
  const osc = ctx.createOscillator(), og = ctx.createGain();
  osc.type = "square"; osc.frequency.setValueAtTime(2200, t);
  og.gain.setValueAtTime(0.08*g, t);
  og.gain.exponentialRampToValueAtTime(0.001, t+0.02);
  osc.connect(og); og.connect(getAudioOutput(ctx));
  osc.start(t); osc.stop(t+0.025);
}

function playPelang(ctx, t, g = 1) {
  const sz = ctx.sampleRate * 0.055;
  const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/sz,1.4);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.55*g, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t+0.06);
  src.connect(bp); bp.connect(gain); gain.connect(getAudioOutput(ctx));
  src.start(t); src.stop(t+0.07);
}

function playHaft(ctx, t, g = 1) {
  const sz = ctx.sampleRate * 0.035;
  const buf = ctx.createBuffer(1, sz, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < sz; i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/sz,1.8);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.38*g, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t+0.045);
  src.connect(bp); bp.connect(gain); gain.connect(getAudioOutput(ctx));
  src.start(t); src.stop(t+0.05);
}

function playStroke(ctx, type, t, accent) {
  const g = accent ? 1.2 : 0.8;
  if (type === "tom")    playTom(ctx, t, g);
  else if (type === "bak")    playBak(ctx, t, g);
  else if (type === "pelang") playPelang(ctx, t, g);
  else if (type === "haft")   playHaft(ctx, t, g);
  // rest: silence
}

// ─────────────────────────────────────────────
// DATA MODEL
// Cycle → [Measure] → [Beat] → [Stroke]
// ─────────────────────────────────────────────
const STROKE_CYCLE  = ["tom","bak","pelang","haft","rest"];
const STROKE_LABEL  = { tom:"TOM", bak:"BAK", pelang:"PLG", haft:"HFT", rest:"·" };
const STROKE_COLOR  = { tom:"#c2703a", bak:"#d4c5a2", pelang:"#7aabcc", haft:"#8fb5a5", rest:"transparent" };
const STROKE_TEXT   = { tom:"#fff8ef", bak:"#1a130a", pelang:"#fff", haft:"#fff", rest:"#5a4a38" };

// Time signatures with beat groupings for Persian music
const TIME_SIGS = {
  "4/4": { beats: 4, groups: [[4]] },
  "3/4": { beats: 3, groups: [[3]] },
  "6/8": { beats: 6, groups: [[3,3]] },
  "7/8": { beats: 7, groups: [[2,2,3],[2,3,2],[3,2,2]] },
  "5/8": { beats: 5, groups: [[2,3],[3,2]] },
  "8/8": { beats: 8, groups: [[3,3,2],[3,2,3],[2,3,3]] },
  "10/8":{ beats:10, groups: [[3,3,2,2],[3,2,3,2],[2,3,3,2]] },
  "12/8":{ beats:12, groups: [[3,3,3,3]] },
};
const LOCAL_STORAGE_KEY = "tombak-metronome:last-rhythm-v1";
const PERSISTENCE_DEBOUNCE_MS = 150;
const DEFAULT_STROKE_TYPE = "tom";
const DEFAULT_BPM = 80;
const DEFAULT_ACCENT_DOWNBEATS = true;

function makeStroke(type=DEFAULT_STROKE_TYPE, accent=false) { return { type, accent }; }
function makeBeat(subs=1) {
  return { subdivisions: subs, strokes: Array.from({length:subs}, () => makeStroke(DEFAULT_STROKE_TYPE)) };
}
function makeMeasure(timeSig="4/4", groupIdx=0) {
  const { beats } = TIME_SIGS[timeSig];
  return {
    timeSig,
    groupIdx,
    beats: Array.from({length: beats}, () => makeBeat(1)),
  };
}
function defaultCycle() {
  return [makeMeasure("4/4"), makeMeasure("4/4")];
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  return Math.max(min, Math.min(max, rounded));
}

function normalizeStroke(rawStroke) {
  const type = STROKE_CYCLE.includes(rawStroke?.type) ? rawStroke.type : DEFAULT_STROKE_TYPE;
  return { type, accent: Boolean(rawStroke?.accent) };
}

function normalizeBeat(rawBeat) {
  const subdivisions = clampInt(rawBeat?.subdivisions, 1, 12, 1);
  const rawStrokes = Array.isArray(rawBeat?.strokes) ? rawBeat.strokes : [];
  const strokes = Array.from({ length: subdivisions }, (_, sIdx) => normalizeStroke(rawStrokes[sIdx]));
  return { subdivisions, strokes };
}

function normalizeMeasure(rawMeasure) {
  const timeSig = rawMeasure?.timeSig in TIME_SIGS ? rawMeasure.timeSig : "4/4";
  const maxGroupIdx = TIME_SIGS[timeSig].groups.length - 1;
  const groupIdx = clampInt(rawMeasure?.groupIdx, 0, maxGroupIdx, 0);
  const rawBeats = Array.isArray(rawMeasure?.beats) ? rawMeasure.beats : [];
  const beats = rawBeats.length > 0
    ? rawBeats.map(normalizeBeat)
    : Array.from({ length: TIME_SIGS[timeSig].beats }, () => makeBeat(1));
  return { timeSig, groupIdx, beats };
}

function normalizeCycle(rawCycle) {
  if (!Array.isArray(rawCycle) || rawCycle.length === 0) return defaultCycle();
  return rawCycle.map(normalizeMeasure);
}

function readSavedRhythmState() {
  const fallback = { cycle: defaultCycle(), bpm: DEFAULT_BPM, accentDownbeats: DEFAULT_ACCENT_DOWNBEATS };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      cycle: normalizeCycle(parsed?.cycle),
      bpm: clampInt(parsed?.bpm, 20, 400, DEFAULT_BPM),
      accentDownbeats: typeof parsed?.accentDownbeats === "boolean" ? parsed.accentDownbeats : DEFAULT_ACCENT_DOWNBEATS,
    };
  } catch {
    return fallback;
  }
}

function saveRhythmState(serializedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, serializedState);
  } catch {}
}

// Flatten cycle → event list for scheduler
function buildEventList(cycle) {
  const events = [];
  cycle.forEach((measure, mIdx) => {
    const numBeats = measure.beats.length;
    measure.beats.forEach((beat, bIdx) => {
      const subs = beat.subdivisions;
      beat.strokes.forEach((stroke, sIdx) => {
        // Each event occupies 1/(numBeats * subs) of the total measure duration
        events.push({ mIdx, bIdx, sIdx, stroke, fracOfMeasure: 1 / (numBeats * subs) });
      });
    });
  });
  return events;
}

// ─────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────

function StrokeCell({ stroke, isActive, onClick, onDoubleClick }) {
  return (
    <div style={{ position:"relative", display:"inline-block" }}>
      <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={e => { e.preventDefault(); onDoubleClick(); }}
        title="Tap: cycle stroke · Double-tap: toggle accent"
        style={{
          width: 44, height: 44,
          borderRadius: 10,
          border: stroke.accent ? "2px solid #f3e6c8" : `1px solid ${stroke.type==="rest" ? "#3a2e22" : "transparent"}`,
          background: stroke.type === "rest" ? "#1c1510" : STROKE_COLOR[stroke.type],
          color: STROKE_TEXT[stroke.type],
          fontSize: stroke.type==="pelang"||stroke.type==="haft" ? 9 : 10,
          fontWeight: 800,
          letterSpacing: "0.02em",
          cursor: "pointer",
          opacity: stroke.type === "rest" ? 0.45 : 1,
          boxShadow: isActive ? "0 0 0 3px rgba(243,230,200,0.6)" : "none",
          transition: "box-shadow 0.08s",
          fontFamily: "inherit",
        }}
      >
        {STROKE_LABEL[stroke.type]}
      </button>
      {isActive && (
        <div style={{
          position:"absolute", top:0, left:0, width:44, height:44,
          borderRadius:10, border:"2px solid #f3e6c8",
          animation:"pulse-ring 0.4s ease-out forwards",
          pointerEvents:"none",
        }}/>
      )}
    </div>
  );
}

function BeatCard({ beat, mIdx, bIdx, isActiveBeat, activeSub, onSetSubs, onCycleStroke, onToggleAccent, groupLabel }) {
  return (
    <div style={{
      background: isActiveBeat ? "rgba(194,112,58,0.12)" : "rgba(255,255,255,0.025)",
      border: isActiveBeat ? "1px solid rgba(194,112,58,0.6)" : "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12,
      padding: "10px 12px",
      display:"flex", flexDirection:"column", gap:8,
      boxShadow: isActiveBeat ? "0 0 14px rgba(194,112,58,0.2)" : "none",
      transition: "background 0.1s, border-color 0.1s, box-shadow 0.1s",
    }}>
      {/* Beat header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:10, color:"#6a5a40", letterSpacing:"0.12em", fontWeight:700 }}>
            BEAT {bIdx+1}
          </span>
          {groupLabel && (
            <span style={{ fontSize:9, color:"#8a6f3e", background:"rgba(194,112,58,0.15)", borderRadius:4, padding:"1px 5px" }}>
              {groupLabel}
            </span>
          )}
        </div>
        {/* Subdivision stepper */}
        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
          <button onClick={() => onSetSubs(Math.max(1, beat.subdivisions-1))} style={miniBtn}>–</button>
          <span style={{ fontSize:13, fontWeight:700, color:"#c9b896", width:16, textAlign:"center" }}>
            {beat.subdivisions}
          </span>
          <button onClick={() => onSetSubs(Math.min(12, beat.subdivisions+1))} style={miniBtn}>+</button>
          <span style={{ fontSize:9, color:"#5a4a38", marginLeft:2 }}>divs</span>
        </div>
      </div>
      {/* Strokes */}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {beat.strokes.map((stroke, sIdx) => (
          <StrokeCell
            key={sIdx}
            stroke={stroke}
            isActive={isActiveBeat && activeSub === sIdx}
            onClick={() => onCycleStroke(sIdx)}
            onDoubleClick={() => onToggleAccent(sIdx)}
          />
        ))}
      </div>
    </div>
  );
}

function MeasureCard({ measure, mIdx, activeMeasure, activeBeat, activeSub, isPlaying,
  onSetTimeSig, onSetGroupIdx, onAddBeat, onRemoveBeat,
  onSetSubs, onCycleStroke, onToggleAccent, canRemove, onRemoveMeasure }) {

  const sigData = TIME_SIGS[measure.timeSig];
  const groups = sigData.groups[measure.groupIdx] || sigData.groups[0];
  const isActive = activeMeasure === mIdx;

  // Build group labels per beat
  const groupLabels = [];
  let gi = 0, gc = 0;
  for (let b = 0; b < measure.beats.length; b++) {
    if (gc === 0) {
      groupLabels.push(`G${gi+1}`);
      gc = groups[gi] || 1;
      gi++;
    } else {
      groupLabels.push(null);
    }
    gc--;
  }

  return (
    <div style={{
      background: isActive ? "linear-gradient(160deg,#2a1e10,#1e160c)" : "#19120d",
      border: isActive ? "1px solid rgba(194,112,58,0.45)" : "1px solid #2a1e12",
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      boxShadow: isActive ? "0 0 28px rgba(194,112,58,0.15)" : "none",
      transition: "all 0.12s",
    }}>
      {/* Measure header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* Measure number pill */}
          <div style={{
            width:28, height:28, borderRadius:"50%",
            background: isActive ? "#c2703a" : "#2a1e12",
            border: isActive ? "none" : "1px solid #3a2a18",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:12, fontWeight:800, color: isActive ? "#fff" : "#7a6040",
          }}>
            {mIdx+1}
          </div>
          <span style={{ fontSize:11, letterSpacing:"0.15em", color:"#8a7050", fontWeight:700 }}>
            MEASURE
          </span>
          {/* Time sig selector */}
          <select
            value={measure.timeSig}
            onChange={e => onSetTimeSig(e.target.value)}
            style={{
              background:"#2a1e12", border:"1px solid #3a2a18", borderRadius:8,
              color:"#c9b896", fontSize:13, fontWeight:700, padding:"3px 8px",
              cursor:"pointer", fontFamily:"inherit",
            }}
          >
            {Object.keys(TIME_SIGS).map(sig => (
              <option key={sig} value={sig}>{sig}</option>
            ))}
          </select>
          {/* Grouping selector (only for sigs with multiple options) */}
          {sigData.groups.length > 1 && (
            <select
              value={measure.groupIdx}
              onChange={e => onSetGroupIdx(Number(e.target.value))}
              style={{
                background:"#2a1e12", border:"1px solid #3a2a18", borderRadius:8,
                color:"#9ab080", fontSize:11, padding:"3px 7px",
                cursor:"pointer", fontFamily:"inherit",
              }}
            >
              {sigData.groups.map((g, i) => (
                <option key={i} value={i}>{g.join("+")}</option>
              ))}
            </select>
          )}
        </div>
        {canRemove && (
          <button onClick={onRemoveMeasure} style={{ background:"none", border:"none", color:"#5a4030", cursor:"pointer", fontSize:16, padding:"2px 6px" }} title="Remove measure">✕</button>
        )}
      </div>

      {/* Beats */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {measure.beats.map((beat, bIdx) => (
          <BeatCard
            key={bIdx}
            beat={beat}
            mIdx={mIdx}
            bIdx={bIdx}
            isActiveBeat={isActive && activeBeat === bIdx}
            activeSub={isActive && activeBeat === bIdx ? activeSub : -1}
            groupLabel={groupLabels[bIdx]}
            onSetSubs={n => onSetSubs(mIdx, bIdx, n)}
            onCycleStroke={sIdx => onCycleStroke(mIdx, bIdx, sIdx)}
            onToggleAccent={sIdx => onToggleAccent(mIdx, bIdx, sIdx)}
          />
        ))}
      </div>

      {/* Beat controls */}
      <div style={{ display:"flex", gap:8, marginTop:12 }}>
        <button onClick={() => onAddBeat(mIdx)} style={beatCtrlBtn}>+ Beat</button>
        {measure.beats.length > 1 && (
          <button onClick={() => onRemoveBeat(mIdx)} style={{ ...beatCtrlBtn, color:"#7a5030" }}>− Beat</button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function TombakRhythmBuilder() {
  const initialRhythmState = useMemo(() => readSavedRhythmState(), []);

  const [cycle, setCycle] = useState(() => initialRhythmState.cycle);
  const [bpm, setBpm] = useState(() => initialRhythmState.bpm);
  const [bpmInput, setBpmInput] = useState(() => String(initialRhythmState.bpm));
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeMeasure, setActiveMeasure] = useState(-1);
  const [activeBeat, setActiveBeat] = useState(-1);
  const [activeSub, setActiveSub] = useState(-1);
  const [accentDownbeats, setAccentDownbeats] = useState(() => initialRhythmState.accentDownbeats);

  const audioCtxRef = useRef(null);
  const schedulerRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const noteQueueRef = useRef([]);
  const eventIdxRef = useRef(0);
  const rafRef = useRef(null);
  const isPlayingRef = useRef(false);
  const lastSavedPayloadRef = useRef(null);
  const eventsRef = useRef(buildEventList(cycle));

  useEffect(() => { eventsRef.current = buildEventList(cycle); }, [cycle]);

  // Keep the raw input string in sync when bpm is changed via arrow controls
  useEffect(() => { setBpmInput(String(bpm)); }, [bpm]);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const payload = JSON.stringify({ cycle, bpm, accentDownbeats });
      if (lastSavedPayloadRef.current === null) {
        lastSavedPayloadRef.current = payload;
        saveRhythmState(payload);
        return;
      }
      if (payload === lastSavedPayloadRef.current) return;
      lastSavedPayloadRef.current = payload;
      saveRhythmState(payload);
    }, PERSISTENCE_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [cycle, bpm, accentDownbeats]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    clearInterval(schedulerRef.current); schedulerRef.current = null;
    cancelAnimationFrame(rafRef.current); rafRef.current = null;
    setActiveMeasure(-1); setActiveBeat(-1); setActiveSub(-1);
    noteQueueRef.current = [];
  }, []);

  const start = useCallback(() => {
    if (isPlayingRef.current) return;
    if (!audioCtxRef.current) audioCtxRef.current = makeAudioCtx();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    isPlayingRef.current = true;
    setIsPlaying(true);
    eventIdxRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.05;
    noteQueueRef.current = [];

    const LOOKAHEAD = 0.15, INTERVAL = 25;

    function scheduler() {
      const ctx = audioCtxRef.current;
      // bpm here controls measures per minute; spm = fixed duration for every measure
      const spm = 60 / bpm; // seconds per measure
      const events = eventsRef.current;
      while (nextNoteTimeRef.current < ctx.currentTime + LOOKAHEAD) {
        const ev = events[eventIdxRef.current % events.length];
        const t = nextNoteTimeRef.current;
        const isDown = ev.sIdx === 0;
        const accent = ev.stroke.accent || (accentDownbeats && isDown);
        playStroke(ctx, ev.stroke.type, t, accent);
        noteQueueRef.current.push({ time: t, mIdx: ev.mIdx, bIdx: ev.bIdx, sIdx: ev.sIdx });
        nextNoteTimeRef.current += spm * ev.fracOfMeasure;
        eventIdxRef.current++;
      }
    }
    schedulerRef.current = setInterval(scheduler, INTERVAL);

    function visualLoop() {
      if (!isPlayingRef.current) return;
      const now = audioCtxRef.current.currentTime;
      while (noteQueueRef.current.length > 1 && noteQueueRef.current[1].time <= now)
        noteQueueRef.current.shift();
      if (noteQueueRef.current.length > 0 && noteQueueRef.current[0].time <= now + 0.001) {
        const { mIdx, bIdx, sIdx } = noteQueueRef.current[0];
        setActiveMeasure(mIdx); setActiveBeat(bIdx); setActiveSub(sIdx);
      }
      rafRef.current = requestAnimationFrame(visualLoop);
    }
    rafRef.current = requestAnimationFrame(visualLoop);
  }, [bpm, accentDownbeats]);

  useEffect(() => () => { stop(); audioCtxRef.current?.close(); }, []);

  // ── Cycle mutations ──
  const addMeasure = () => setCycle(c => [...c, makeMeasure("4/4")]);
  const removeMeasure = mIdx => setCycle(c => c.filter((_,i) => i !== mIdx));

  const setTimeSig = (mIdx, sig) => setCycle(c => c.map((m,i) => {
    if (i !== mIdx) return m;
    const { beats } = TIME_SIGS[sig];
    const newBeats = Array.from({length: beats}, (_,b) => m.beats[b] || makeBeat(1));
    return { ...m, timeSig: sig, groupIdx: 0, beats: newBeats };
  }));

  const setGroupIdx = (mIdx, gIdx) => setCycle(c => c.map((m,i) => i===mIdx ? {...m, groupIdx:gIdx} : m));

  const addBeat = mIdx => setCycle(c => c.map((m,i) => i===mIdx ? {...m, beats:[...m.beats, makeBeat(1)]} : m));
  const removeBeat = mIdx => setCycle(c => c.map((m,i) => i===mIdx && m.beats.length>1 ? {...m, beats:m.beats.slice(0,-1)} : m));

  const setSubdivisions = (mIdx, bIdx, n) => setCycle(c => c.map((m,i) => {
    if (i !== mIdx) return m;
    const beats = m.beats.map((b,j) => {
      if (j !== bIdx) return b;
      const strokes = Array.from({length:n}, (_,s) => b.strokes[s] || makeStroke("tom"));
      return { subdivisions:n, strokes };
    });
    return { ...m, beats };
  }));

  const cycleStroke = (mIdx, bIdx, sIdx) => setCycle(c => c.map((m,i) => {
    if (i !== mIdx) return m;
    const beats = m.beats.map((b,j) => {
      if (j !== bIdx) return b;
      const strokes = b.strokes.map((st,k) => {
        if (k !== sIdx) return st;
        const next = STROKE_CYCLE[(STROKE_CYCLE.indexOf(st.type)+1) % STROKE_CYCLE.length];
        return { ...st, type: next };
      });
      return { ...b, strokes };
    });
    return { ...m, beats };
  }));

  const toggleAccent = (mIdx, bIdx, sIdx) => setCycle(c => c.map((m,i) => {
    if (i !== mIdx) return m;
    const beats = m.beats.map((b,j) => {
      if (j !== bIdx) return b;
      const strokes = b.strokes.map((st,k) => k===sIdx ? {...st, accent:!st.accent} : st);
      return { ...b, strokes };
    });
    return { ...m, beats };
  }));

  const resetToDefault = useCallback(() => {
    stop();
    const newCycle = defaultCycle();
    setCycle(newCycle);
    setBpm(DEFAULT_BPM);
    setBpmInput(String(DEFAULT_BPM));
    setAccentDownbeats(DEFAULT_ACCENT_DOWNBEATS);
    const payload = JSON.stringify({ cycle: newCycle, bpm: DEFAULT_BPM, accentDownbeats: DEFAULT_ACCENT_DOWNBEATS });
    lastSavedPayloadRef.current = payload;
    saveRhythmState(payload);
  }, [stop]);

  // ── Render ──
  return (
    <div style={{
      minHeight:"100vh",
      background:"radial-gradient(ellipse at 50% 0%, #271a0e 0%, #140d08 60%, #0e0905 100%)",
      color:"#ecdfc8",
      fontFamily:"'Georgia','Times New Roman',serif",
      boxSizing:"border-box",
    }}>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform:scale(0.95); opacity:1; }
          100% { transform:scale(1.7);  opacity:0; }
        }
        select:focus, button:focus { outline: 1px solid rgba(194,112,58,0.5); outline-offset:2px; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:#0e0905; }
        ::-webkit-scrollbar-thumb { background:#3a2618; border-radius:3px; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{
        position:"sticky", top:0, zIndex:100,
        background:"rgba(14,9,5,0.92)",
        backdropFilter:"blur(12px)",
        borderBottom:"1px solid #2a1a0e",
        padding:"12px 24px",
        display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12,
      }}>
        {/* Title */}
        <div>
          <div style={{ fontSize:10, letterSpacing:"0.25em", color:"#7a5a30", textTransform:"uppercase" }}>Tombak Rhythm Builder</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#f0e0c0", lineHeight:1.1 }}>تنبک &nbsp;v2</div>
        </div>

        {/* Transport controls */}
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          {/* BPM */}
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={() => setBpm(b=>Math.max(20,b-1))} style={tinyBtn}>–</button>
            <div style={{ textAlign:"center" }}>
              <input
                type="number" min="20" max="400" value={bpmInput}
                onChange={e => setBpmInput(e.target.value)}
                onBlur={e => {
                  const clamped = Math.max(20, Math.min(400, Number(e.target.value) || 20));
                  setBpm(clamped);
                  setBpmInput(String(clamped));
                }}
                style={{
                  width:62, textAlign:"center", fontSize:22, fontWeight:800,
                  background:"#1a1008", color:"#f0e0c0",
                  border:"1px solid #3a2618", borderRadius:8, padding:"2px 4px",
                  fontFamily:"inherit",
                }}
              />
              <div style={{ fontSize:9, color:"#5a4028", letterSpacing:"0.12em" }}>BPM</div>
            </div>
            <button onClick={() => setBpm(b=>Math.min(400,b+1))} style={tinyBtn}>+</button>
          </div>

          {/* Play / Stop */}
          <button
            onClick={() => isPlaying ? stop() : start()}
            style={{
              width:56, height:56, borderRadius:"50%",
              border:`2px solid ${isPlaying ? "#e07030" : "#4a3020"}`,
              background: isPlaying
                ? "linear-gradient(145deg,#c2703a,#8a4820)"
                : "linear-gradient(145deg,#2a1e12,#1a1008)",
              color:"#f0e0c0", fontSize:13, fontWeight:800, letterSpacing:"0.06em",
              cursor:"pointer",
              boxShadow: isPlaying ? "0 0 20px rgba(194,112,58,0.5)" : "none",
            }}
          >
            {isPlaying ? "■" : "▶"}
          </button>

          {/* Accent toggle */}
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:"#8a7050", cursor:"pointer" }}>
            <input type="checkbox" checked={accentDownbeats} onChange={e=>setAccentDownbeats(e.target.checked)}
              style={{ accentColor:"#c2703a" }}
            />
            Auto-accent<br/>downbeats
          </label>

          {/* Reset to Default */}
          <button
            onClick={resetToDefault}
            title="Reset to default pattern"
            style={resetBtn}
          >
            Reset to Default
          </button>
        </div>
      </div>

      {/* ── Stroke legend ── */}
      <div style={{
        display:"flex", gap:10, padding:"12px 24px", flexWrap:"wrap",
        borderBottom:"1px solid #1e1208",
        background:"rgba(0,0,0,0.2)",
      }}>
        {STROKE_CYCLE.map(type => (
          <div key={type} style={{ display:"flex", alignItems:"center", gap:5 }}>
            <div style={{
              width:28, height:28, borderRadius:7,
              background: type==="rest" ? "#1c1510" : STROKE_COLOR[type],
              border: type==="rest" ? "1px solid #3a2e22" : "none",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:9, fontWeight:800, color: STROKE_TEXT[type],
            }}>{STROKE_LABEL[type]}</div>
            <span style={{ fontSize:10, color:"#6a5038" }}>
              { {tom:"Tom (bass)",bak:"Bak (edge)",pelang:"Pelang",haft:"Haft",rest:"Rest"}[type] }
            </span>
          </div>
        ))}
        <div style={{ marginLeft:"auto", fontSize:10, color:"#4a3820", alignSelf:"center" }}>
          Tap cell = cycle stroke · Double-tap = toggle accent
        </div>
      </div>

      {/* ── Measures ── */}
      <div style={{ padding:"20px 24px", maxWidth:760, margin:"0 auto" }}>
        {cycle.map((measure, mIdx) => (
          <MeasureCard
            key={mIdx}
            measure={measure}
            mIdx={mIdx}
            activeMeasure={activeMeasure}
            activeBeat={activeBeat}
            activeSub={activeSub}
            isPlaying={isPlaying}
            onSetTimeSig={(sig) => setTimeSig(mIdx, sig)}
            onSetGroupIdx={(gIdx) => setGroupIdx(mIdx, gIdx)}
            onAddBeat={addBeat}
            onRemoveBeat={removeBeat}
            onSetSubs={setSubdivisions}
            onCycleStroke={cycleStroke}
            onToggleAccent={toggleAccent}
            canRemove={cycle.length > 1}
            onRemoveMeasure={() => removeMeasure(mIdx)}
          />
        ))}

        {/* Add measure */}
        <button onClick={addMeasure} style={{
          width:"100%", padding:"14px", marginTop:4,
          border:"1px dashed #3a2618", borderRadius:18,
          background:"transparent", color:"#6a4a28",
          fontSize:14, cursor:"pointer", fontFamily:"inherit",
          letterSpacing:"0.1em",
        }}>
          + Add Measure
        </button>

        {/* Info footer */}
        <div style={{
          marginTop:32, padding:"16px 20px",
          background:"rgba(0,0,0,0.25)", borderRadius:12,
          border:"1px solid #1e1208",
          fontSize:12, color:"#6a5038", lineHeight:1.8,
        }}>
          <strong style={{ color:"#9a7848" }}>How it works:</strong> Every measure lasts the same total duration regardless of how many beats it contains.
          Beats are evenly spaced within a measure, so adding more beats makes them faster.
          Pack more subdivisions into a beat and they play proportionally faster —
          4 subdivisions in one beat vs 3 in the next creates a quartolet against a triplet, exactly as in Tombak notation.
          Choose a time signature per measure, and for Persian meters like 7/8, pick a beat grouping (e.g. 2+2+3 vs 3+2+2)
          to see the rhythmic accent structure labelled on each beat group.
        </div>
      </div>
    </div>
  );
}

// ── Style constants ──
const miniBtn = {
  width:20, height:20, borderRadius:"50%",
  border:"1px solid #3a2a18", background:"#1c1208",
  color:"#c9a870", fontSize:13, lineHeight:1,
  cursor:"pointer", fontFamily:"inherit", padding:0,
};
const tinyBtn = {
  width:28, height:28, borderRadius:"50%",
  border:"1px solid #3a2a18", background:"#1c1208",
  color:"#c9a870", fontSize:16, lineHeight:1,
  cursor:"pointer", fontFamily:"inherit",
};
const beatCtrlBtn = {
  padding:"5px 14px", borderRadius:20,
  border:"1px solid #3a2618", background:"transparent",
  color:"#8a6840", fontSize:11, cursor:"pointer",
  fontFamily:"inherit", letterSpacing:"0.08em",
};
const resetBtn = {
  padding:"6px 14px", borderRadius:20,
  border:"1px solid #4a2e18", background:"transparent",
  color:"#8a6040", fontSize:11, cursor:"pointer",
  fontFamily:"inherit", letterSpacing:"0.08em",
};
