import React, { useState, useRef, useEffect, useCallback } from "react";

// ---------- Sound synthesis (Web Audio, no samples needed) ----------
function makeAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  return new Ctx();
}

// Tom: deep bass resonant strike (center of skin)
function playTom(ctx, t, gainMul = 1) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.9 * gainMul, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.35);

  // a touch of body resonance
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(95, t);
  g2.gain.setValueAtTime(0.001, t);
  g2.gain.exponentialRampToValueAtTime(0.25 * gainMul, t + 0.005);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc2.connect(g2);
  g2.connect(ctx.destination);
  osc2.start(t);
  osc2.stop(t + 0.22);
}

// Tak: sharp rim/edge slap (high, bright, short)
function playTak(ctx, t, gainMul = 1) {
  const bufferSize = ctx.sampleRate * 0.06;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.5);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "highpass";
  bandpass.frequency.value = 1800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.7 * gainMul, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.08);

  // metallic tick on top
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(2200, t);
  og.gain.setValueAtTime(0.08 * gainMul, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
  osc.connect(og);
  og.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.025);
}

// Ka/Pa: light fingertip tap (other hand, soft & high but rounder than Tak)
function playKa(ctx, t, gainMul = 1) {
  const bufferSize = ctx.sampleRate * 0.035;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.value = 1100;
  bandpass.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.45 * gainMul, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);
  noise.stop(t + 0.06);
}

function playStroke(ctx, type, t, accent) {
  const mul = accent ? 1.15 : 0.85;

  if (type === "tom") playTom(ctx, t, mul);

  else if (type === "bak")
    playTak(ctx, t, mul);

  else if (type === "pelang")
    playKa(ctx, t, mul * 1.2);

  else if (type === "haft")
    playKa(ctx, t, mul * 0.7);
}

// ---------- Pattern data model ----------
// A pattern = array of "beats". Each beat = { subdivisions: n, strokes: [n items] }
// Each stroke item: { type: 'tom'|'bak'|'pelang'|'haft'|'rest', accent: bool }

const STROKE_CYCLE = [
  "tom",
  "bak",
  "pelang",
  "haft",
  "rest"
];

const STROKE_LABEL = {
  tom: "TOM",
  bak: "BAK",
  pelang: "PELANG",
  haft: "HAFT",
  rest: "·"
};

const STROKE_COLOR = {
  tom: "#c2703a",
  bak: "#e8d9b5",
  pelang: "#8db8ff",
  haft: "#9ab6a6",
  rest: "#3a332c",
};

function defaultStroke(idx) {
  return { type: idx === 0 ? "tom" : "bak", accent: idx === 0 };
}

function makeMeasure(subdivisions) {
  return {
    subdivisions,
    strokes: Array.from({ length: subdivisions }, (_, i) => defaultStroke(i)),
  };
}



function defaultPattern() {
  return [
    makeMeasure(4),
    makeMeasure(4),
    makeMeasure(4),
    makeMeasure(4),
  ];
}


// ---------- Main component ----------
export default function TombakMetronome() {
  const [pattern, setPattern] = useState(defaultPattern());
  const [bpm, setBpm] = useState(80);
  const [bpmInput, setBpmInput] = useState("80");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [currentSub, setCurrentSub] = useState(-1);

  const [accentDownbeats, setAccentDownbeats] = useState(true);

  // Keep the raw input string in sync when bpm is changed via arrow controls
  useEffect(() => { setBpmInput(String(bpm)); }, [bpm]);

  const audioCtxRef = useRef(null);
  const schedulerRef = useRef(null);
  const nextNoteTimeRef = useRef(0);
  const noteQueueRef = useRef([]); // for visual sync
  const eventIdxRef = useRef(0);
  const rafRef = useRef(null);
  const isPlayingRef = useRef(false);

  // Flatten pattern into a sequence of events with relative time-fractions
  const buildEventList = useCallback((pat) => {
    const totalBeats = pat.length;
    const events = [];
    pat.forEach((beat, bIdx) => {
      const subCount = beat.subdivisions;
      for (let s = 0; s < subCount; s++) {
        events.push({
          beatIdx: bIdx,
          subIdx: s,
          subCount,
          stroke: beat.strokes[s],
          // fraction of one "main beat" duration that this subdivision occupies
          fracOfBeat: 1 / subCount,
        });
      }
    });
    return { events, totalBeats };
  }, []);

  const eventListMemoRef = useRef(buildEventList(pattern));
  useEffect(() => {
    eventListMemoRef.current = buildEventList(pattern);
  }, [pattern, buildEventList]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current);
      schedulerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setCurrentBeat(-1);
    setCurrentSub(-1);
    noteQueueRef.current = [];
  }, []);

  const start = useCallback(() => {
    if (isPlayingRef.current) return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = makeAudioCtx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") ctx.resume();

    isPlayingRef.current = true;
    setIsPlaying(true);

    const { events } = eventListMemoRef.current;
    eventIdxRef.current = 0;
    nextNoteTimeRef.current = ctx.currentTime + 0.1;
    noteQueueRef.current = [];

    const secondsPerMainBeat = 60 / bpm;
    const SCHEDULE_AHEAD = 0.15; // seconds
    const LOOKAHEAD_INTERVAL = 25; // ms

    function scheduler() {
      const ctx = audioCtxRef.current;
      while (
        nextNoteTimeRef.current <
        ctx.currentTime + SCHEDULE_AHEAD
      ) {
        const ev = events[eventIdxRef.current % events.length];
        const t = nextNoteTimeRef.current;
        const accent =
          ev.stroke.accent || (accentDownbeats && ev.subIdx === 0);
        playStroke(ctx, ev.stroke.type, t, accent);
        noteQueueRef.current.push({
          time: t,
          beatIdx: ev.beatIdx,
          subIdx: ev.subIdx,
        });
        nextNoteTimeRef.current += secondsPerMainBeat * ev.fracOfBeat;
        eventIdxRef.current++;
      }
    }

    schedulerRef.current = setInterval(scheduler, LOOKAHEAD_INTERVAL);

    function visualLoop() {
      if (!isPlayingRef.current) return;
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      // drop past notes, find the most recent one that has "happened"
      while (
        noteQueueRef.current.length > 1 &&
        noteQueueRef.current[1].time <= now
      ) {
        noteQueueRef.current.shift();
      }
      if (
        noteQueueRef.current.length > 0 &&
        noteQueueRef.current[0].time <= now + 0.001
      ) {
        setCurrentBeat(noteQueueRef.current[0].beatIdx);
        setCurrentSub(noteQueueRef.current[0].subIdx);
      }
      rafRef.current = requestAnimationFrame(visualLoop);
    }
    rafRef.current = requestAnimationFrame(visualLoop);
  }, [bpm, accentDownbeats]);


  useEffect(() => {
    return () => {
      stop();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlay() {
    if (isPlaying) stop();
    else start();
  }

  // ---------- Pattern editing ----------
function addMeasure() {
  setPattern((p) => [...p, makeMeasure(4)]);
}
  function removeMeasure(idx) {
    setPattern((p) => p.filter((_, i) => i !== idx));
  }
  function setSubdivisions(beatIdx, n) {
    setPattern((p) =>
      p.map((b, i) => {
        if (i !== beatIdx) return b;
        const newStrokes = Array.from({ length: n }, (_, s) =>
          b.strokes[s] ? b.strokes[s] : defaultStroke(s)
        );
        return { subdivisions: n, strokes: newStrokes };
      })
    );
  }
  function cycleStroke(beatIdx, subIdx) {
    setPattern((p) =>
      p.map((b, i) => {
        if (i !== beatIdx) return b;
        const strokes = b.strokes.map((st, s) => {
          if (s !== subIdx) return st;
          const curIdx = STROKE_CYCLE.indexOf(st.type);
          const nextType = STROKE_CYCLE[(curIdx + 1) % STROKE_CYCLE.length];
          return { type: nextType, accent: st.accent };
        });
        return { ...b, strokes };
      })
    );
  }
  function toggleAccent(beatIdx, subIdx) {
    setPattern((p) =>
      p.map((b, i) => {
        if (i !== beatIdx) return b;
        const strokes = b.strokes.map((st, s) =>
          s === subIdx ? { ...st, accent: !st.accent } : st
        );
        return { ...b, strokes };
      })
    );
  }


  // ---------- Render ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, #2b2118 0%, #1a140f 55%, #120e0a 100%)",
        color: "#ecdfc8",
        fontFamily:
          "'Iowan Old Style', 'Georgia', 'Times New Roman', serif",
        padding: "32px 16px 64px",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .strike-pulse {
          animation: pulse-ring 0.45s ease-out;
        }
        input[type=range] {
          -webkit-appearance: none;
          height: 4px;
          border-radius: 2px;
          background: #4a3c2c;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #e8d9b5;
          cursor: pointer;
          margin-top: -6px;
        }
        button { font-family: inherit; }
        .beat-card {
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        @media (prefers-reduced-motion: reduce) {
          .strike-pulse { animation: none; }
        }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        {/* Header */}
        <header style={{ marginBottom: 28, textAlign: "center" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "#a3895f",
              marginBottom: 6,
            }}
          >
            Tombak Rhythm Builder
          </div>
          <h1
            style={{
              fontSize: 38,
              margin: 0,
              fontWeight: 700,
              letterSpacing: "0.01em",
              color: "#f3e6c8",
            }}
          >
            تنبک &nbsp;Metronome
          </h1>
<p style={{ color: "#8a7660", fontSize: 14, marginTop: 8 }}>
  Create custom Tombak exercises using
  Tom, Bak, Pelang, and Haft strokes.
</p>
        </header>

        {/* Transport */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            marginBottom: 30,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={togglePlay}
            style={{
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "2px solid #c2703a",
              background: isPlaying
                ? "linear-gradient(145deg,#c2703a,#8f4f26)"
                : "linear-gradient(145deg,#3a2e22,#241b13)",
              color: "#f3e6c8",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.05em",
              cursor: "pointer",
              boxShadow: isPlaying
                ? "0 0 24px rgba(194,112,58,0.55)"
                : "0 4px 14px rgba(0,0,0,0.4)",
            }}
          >
            {isPlaying ? "STOP" : "PLAY"}
          </button>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 12,
                letterSpacing: "0.12em",
                color: "#a3895f",
                marginBottom: 4,
              }}
            >
              TEMPO
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setBpm((b) => Math.max(20, b - 1))}
                style={iconBtnStyle}
              >
                –
              </button>
<input
  type="number"
  min="20"
  max="400"
  value={bpmInput}
  onChange={(e) => setBpmInput(e.target.value)}
  onBlur={(e) => {
    const clamped = Math.max(20, Math.min(400, Number(e.target.value) || 20));
    setBpm(clamped);
    setBpmInput(String(clamped));
  }}
  style={{
    width: 80,
    textAlign: "center",
    fontSize: 26,
    fontWeight: 700,
    background: "#201810",
    color: "#f3e6c8",
    border: "1px solid #4a3c2c",
    borderRadius: 8,
    padding: "4px",
  }}
/>
              <button
                onClick={() => setBpm((b) => Math.min(400, b + 1))}
                style={iconBtnStyle}
              >
                +
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#766350", marginTop: 2 }}>
              beats / min
            </div>
          </div>



          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              color: "#c9b896",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={accentDownbeats}
              onChange={(e) => setAccentDownbeats(e.target.checked)}
            />
            Accent each beat's downbeat
          </label>
        </div>



        {/* Pattern editor */}
        <div
          style={{
            display: "flex",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 16,
            paddingTop: 6,
          }}
        >
          {pattern.map((beat, bIdx) => (
            <div
              key={bIdx}
              className="beat-card"
              style={{
                flex: "0 0 auto",
                minWidth: 150,
                background:
                  currentBeat === bIdx
                    ? "linear-gradient(160deg,#3a2c1c,#241a10)"
                    : "#201810",
                border:
                  currentBeat === bIdx
                    ? "1px solid #c2703a"
                    : "1px solid #382c1f",
                borderRadius: 14,
                padding: 14,
                boxShadow:
                  currentBeat === bIdx
                    ? "0 0 18px rgba(194,112,58,0.35)"
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    color: "#a3895f",
                  }}
                >
                  Measure {bIdx + 1}
                </span>
{pattern.length > 1 && (
  <button
    onClick={() => removeMeasure(bIdx)}
    style={{
      background: "none",
      border: "none",
      color: "#766350",
      cursor: "pointer",
      fontSize: 14,
    }}
    title="Remove Measure"
  >
    ✕
  </button>
)}
              </div>

              {/* subdivision count stepper */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <button
                  onClick={() =>
                    setSubdivisions(bIdx, Math.max(1, beat.subdivisions - 1))
                  }
                  style={iconBtnSmall}
                >
                  –
                </button>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    width: 28,
                    textAlign: "center",
                  }}
                >
                  {beat.subdivisions}
                </div>
                <button
                  onClick={() =>
                    setSubdivisions(bIdx, Math.min(9, beat.subdivisions + 1))
                  }
                  style={iconBtnSmall}
                >
                  +
                </button>
<span style={{ fontSize: 11, color: "#766350" }}>
  subdivisions
</span>
              </div>

              {/* stroke cells */}
              <div
                style={{
                  display: "flex",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {beat.strokes.map((st, sIdx) => {
                  const isNow =
                    isPlaying && currentBeat === bIdx && currentSub === sIdx;
                  return (
                    <div
                      key={sIdx}
                      style={{ position: "relative", textAlign: "center" }}
                    >
                      <button
                        onClick={() => cycleStroke(bIdx, sIdx)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          toggleAccent(bIdx, sIdx);
                        }}
                        onDoubleClick={() => toggleAccent(bIdx, sIdx)}
                        title="Click: change stroke · Double-click: toggle accent"
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          border: st.accent
                            ? "2px solid #f3e6c8"
                            : "1px solid #4a3c2c",
                          background:
                            st.type === "rest"
                              ? "#241c14"
                              : STROKE_COLOR[st.type],
                          color: st.type === "bak" ? "#241c14" : "#1a1108",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: "0.03em",
                          cursor: "pointer",
                          opacity: st.type === "rest" ? 0.5 : 1,
                          boxShadow: isNow
                            ? "0 0 0 3px rgba(243,230,200,0.5)"
                            : "none",
                        }}
                      >
                        {STROKE_LABEL[st.type]}
                      </button>
                      {isNow && (
                        <div
                          className="strike-pulse"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 42,
                            height: 42,
                            borderRadius: 10,
                            border: "2px solid #f3e6c8",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

<button
  onClick={addMeasure}
  style={{
    flex: "0 0 auto",
    minWidth: 140,
    border: "1px dashed #4a3c2c",
    borderRadius: 14,
    background: "transparent",
    color: "#a3895f",
    fontSize: 18,
    cursor: "pointer",
    padding: "12px",
  }}
  title="Add Measure"
>
  + Measure
</button>

        </div>


      </div>
    </div>
  );
}

const iconBtnStyle = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "1px solid #4a3c2c",
  background: "#241c14",
  color: "#e8d9b5",
  fontSize: 18,
  cursor: "pointer",
  lineHeight: "1",
};

const iconBtnSmall = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "1px solid #4a3c2c",
  background: "#241c14",
  color: "#e8d9b5",
  fontSize: 14,
  cursor: "pointer",
  lineHeight: "1",
};
