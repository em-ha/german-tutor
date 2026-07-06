"use client";

import { useEffect, useRef, useState } from "react";

const EYE_OFFSETS = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 2.2, y: 0 },
  { x: -2.2, y: 0 },
  { x: 0, y: 1.8 },
  { x: 1.5, y: -1 },
  { x: -1.5, y: -0.8 },
  { x: 2, y: 1.2 },
];

const DOME_BODY_WIDTH = 900; // px — fixed body width; mobile viewport crops the centre

// Exact vector from Figma node 31:762 ("Vector 1" — updated rounder pebble design). 900×945
const QUATSCHI_W = 900.378;
const QUATSCHI_H = 945.325;
const QUATSCHI_PATH =
  "M 13.833 683.999 C -13.805 568.840 2.185 363.998 42.185 279.998 C 82.185 195.998 128.185 179.998 172.833 147.482 C 217.481 114.966 253.833 69.999 318.949 33.671 C 485.849 -59.441 581.833 63.516 691.833 125.999 C 807.710 191.821 856.833 254.999 884.833 387.999 C 906.695 491.844 919.481 685.999 823.833 795.999 C 728.185 905.999 666.185 919.998 576.185 937.998 C 486.185 955.998 168.841 951.104 61.833 801.999 C 31.833 760.197 19.353 706.999 13.833 683.999 Z";

// The 9 anchor points extracted from the Figma vectorNetwork (each segment endpoint).
const BASE_DOME_POINTS: [number, number][] = [
  [ 13.833, 683.999],  // 0: lower-left
  [ 42.185, 279.998],  // 1: left-upper
  [172.833, 147.482],  // 2: upper-left shoulder
  [318.949,  33.671],  // 3: top peak
  [691.833, 125.999],  // 4: upper-right
  [884.833, 387.999],  // 5: right
  [823.833, 795.999],  // 6: lower-right
  [576.185, 937.998],  // 7: bottom-right
  [ 61.833, 801.999],  // 8: bottom-left
];

// Cubic bezier control point offsets for each segment i → (i+1).
// rcp1 is relative to the segment START point (tangentStart from Figma vectorNetwork).
// rcp2 is relative to the segment END point (tangentEnd from Figma vectorNetwork).
// Keeping these fixed while wobbling the anchor points preserves the Figma shape character.
const DOME_CP_OFFSETS: [[number, number], [number, number]][] = [
  [[-27.638, -115.159], [-40.000,  84.000]],  // 0→1
  [[ 40.000,  -84.000], [-44.648,  32.516]],  // 1→2
  [[ 44.648,  -32.516], [-65.116,  36.328]],  // 2→3
  [[166.900,  -93.112], [-110.000, -62.483]], // 3→4
  [[115.877,   65.822], [-28.000, -133.000]], // 4→5
  [[ 21.862,  103.845], [ 95.648, -110.000]], // 5→6
  [[-95.648,  110.000], [ 90.000,  -18.000]], // 6→7
  [[-90.000,   18.000], [107.008,  149.105]], // 7→8
  [[-30.000,  -41.802], [  5.520,   23.000]], // 8→0
];

// Approximate centroid of the blob (used for radial wobble direction)
const BLOB_CX = 450;
const BLOB_CY = 490;

/** Generates a liquid-morphing version of the dome blob each frame.
 *  Anchor points are nudged radially (in/out from centroid) with overlapping sine waves.
 *  Cubic bezier control point offsets stay fixed relative to each anchor point,
 *  so the Figma shape character is fully preserved — only the edges ripple. */
function makeLiquidDomePath(t: number): string {
  const n = BASE_DOME_POINTS.length;

  const animPts: [number, number][] = BASE_DOME_POINTS.map(([x, y], i) => {
    const phase = (i / n) * Math.PI * 2;
    const wobble =
      Math.sin(phase * 2 + t * 0.5) * 5 +
      Math.sin(phase * 3 + t * 0.75) * 3;
    const dx = x - BLOB_CX;
    const dy = y - BLOB_CY;
    const len = Math.sqrt(dx * dx + dy * dy);
    return [x + (dx / len) * wobble, y + (dy / len) * wobble];
  });

  const f = (v: number) => v.toFixed(1);
  let d = `M ${f(animPts[0][0])} ${f(animPts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const pt = animPts[i];
    const e = animPts[(i + 1) % n];
    const [[r1x, r1y], [r2x, r2y]] = DOME_CP_OFFSETS[i];
    d += ` C ${f(pt[0]+r1x)} ${f(pt[1]+r1y)} ${f(e[0]+r2x)} ${f(e[1]+r2y)} ${f(e[0])} ${f(e[1])}`;
  }
  d += " Z";
  return d;
}

// Face anchor in blob coordinate space (derived from Figma node 31:761 face position)
const FACE_BLOB_X = 415;
const FACE_BLOB_Y = 62;

export type Emotion =
  | "happy"
  | "sad"
  | "angry"
  | "embarrassed"
  | "excited"
  | "surprised"
  | "thinking"
  | "asleep";

type EmotionConfig = {
  color: string;
  /** Base eye scale (blinking overlays this) */
  eyeScale: number;
  /** Eye size multiplier */
  eyeRadius: number;
  /** SVG path for idle mouth (null = use open ellipse logic) */
  idleMouth: string;
  /** Left brow: [x1,y1, cpx,cpy, x2,y2] */
  browLeft: string;
  /** Right brow */
  browRight: string;
  /** Cheek blush circles */
  cheeks: boolean;
  /** Render closed-eye arc paths instead of ellipses (asleep) */
  closedEyes?: boolean;
};

const EMOTIONS: Record<Emotion, EmotionConfig> = {
  // Brow/mouth paths re-derived from Figma node 31:761.
  // Eye positions: left (23,18), right (48,14) — right eye is higher.
  // All paths in SVG face-coordinate space (faceScale ≈ 2.4, origin at face center).
  happy: {
    color: "#fd92ca",
    eyeScale: 1,
    eyeRadius: 2.8,
    idleMouth: "M 24 37 C 43 49 51 34 52 33",
    browLeft:  "M 14 10 C 15 8 18 5 26 6",
    browRight: "M 41 4 C 43 3 47 0 54 2",
    cheeks: false,
  },
  sad: {
    color: "#818cf8",
    eyeScale: 0.85,
    eyeRadius: 2.8,
    idleMouth: "M 29 40 C 35 34 52 34 58 40",  // frown — bows up in middle
    browLeft:  "M 12 17 C 15 14 17 14 21 13",  // inner-low sad brow
    browRight: "M 46 9 C 50 9 55 10 58 12",    // slightly rising
    cheeks: false,
  },
  angry: {
    color: "#f87171",
    eyeScale: 0.75,
    eyeRadius: 2.6,
    idleMouth: "M 23 36 C 28 30 46 30 52 36",  // frown
    browLeft:  "M 19 12 C 23 14 26 15 30 16",  // descends left→right (furrowed)
    browRight: "M 42 14 C 44 13 52 9 55 6",    // rises left→right (V-furrowed)
    cheeks: false,
  },
  embarrassed: {
    color: "#fe66b6",
    eyeScale: 0.9,
    eyeRadius: 3.6,                             // bigger eyes
    idleMouth: "M 29 42 C 34 42 41 41 46 39",  // subtle downward-left curve
    browLeft:  "M 10 15 C 12 12 17 8 21 8",
    browRight: "M 46 6 C 50 6 55 7 58 10",
    cheeks: true,
  },
  excited: {
    color: "#ffcd83",
    eyeScale: 1.1,
    eyeRadius: 3.2,
    idleMouth: "M 23 33 Q 36 47 49 33",
    browLeft:  "M 18 9 Q 23 5 28 8",
    browRight: "M 43 5 Q 48 1 53 4",
    cheeks: false,
  },
  surprised: {
    color: "#fb923c",
    eyeScale: 1.15,
    eyeRadius: 3.4,
    idleMouth: "M 29 34 Q 36 44 43 34",
    browLeft:  "M 18 8 Q 23 4 28 7",
    browRight: "M 43 4 Q 48 0 53 3",
    cheeks: false,
  },
  thinking: {
    color: "#c084fc",
    eyeScale: 0.9,
    eyeRadius: 2.8,
    idleMouth: "M 26 35 Q 34 39 44 33",
    browLeft:  "M 18 11 Q 23 8 28 10",
    browRight: "M 43 5 Q 48 7 53 5",
    cheeks: false,
  },
  asleep: {
    color: "#94a3b8",
    eyeScale: 1,
    eyeRadius: 2.8,
    idleMouth: "M 30 36 Q 38 40 46 36",
    browLeft:  "M 14 12 C 17 10 20 9 24 9",
    browRight: "M 45 9 C 48 9 51 10 54 11",
    cheeks: false,
    closedEyes: true,
  },
};

/** Generate a smooth organic blob path using N control points deformed by sine waves */
function makeBlob(cx: number, cy: number, r: number, t: number): string {
  const n = 10;
  const pts: [number, number][] = [];

  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    const wobble =
      Math.sin(angle * 2 + t * 0.7) * 5 +
      Math.sin(angle * 3 + t * 1.2) * 3 +
      Math.sin(angle * 1 + t * 0.5) * 4;
    const rad = r + wobble;
    pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad]);
  }

  const mid = (a: [number, number], b: [number, number]): [number, number] =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

  const start = mid(pts[n - 1], pts[0]);
  let d = `M ${start[0].toFixed(2)} ${start[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const cp = pts[i];
    const end = mid(pts[i], pts[(i + 1) % n]);
    d += ` Q ${cp[0].toFixed(2)} ${cp[1].toFixed(2)} ${end[0].toFixed(2)} ${end[1].toFixed(2)}`;
  }
  d += " Z";
  return d;
}


type Props = {
  mouthOpenness: number;
  emotion?: Emotion;
  size?: number;
  variant?: "round" | "dome";
  /** 0–1 live audio reaction: head turns yellow, brows raise, smile grows */
  excitement?: number;
};

export function CharacterAvatar({
  mouthOpenness,
  emotion = "happy",
  size = 260,
  variant = "round",
  excitement = 0,
}: Props) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [float, setFloat] = useState({ x: 0, y: 0, rotate: 0 });
  const [blob, setBlob] = useState("");
  const [domeBlob, setDomeBlob] = useState(QUATSCHI_PATH);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const containerSizeRef = useRef({ w: 0, h: 0 });
  const blinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());

  // Measure container for dome variant
  useEffect(() => {
    if (variant !== "dome") return;
    const el = containerRef.current;
    if (!el) return;
    const update = (w: number, h: number) => {
      containerSizeRef.current = { w, h };
      setContainerSize({ w, h });
    };
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);
    update(el.offsetWidth, el.offsetHeight);
    return () => ro.disconnect();
  }, [variant]);

  // — Float + blob shape — driven by one RAF loop
  useEffect(() => {
    const animate = () => {
      const t = (Date.now() - startRef.current) / 1000;
      setFloat({
        x: Math.sin(t * 0.63) * 8,
        y: Math.sin(t * 1.1) * 10,
        rotate: Math.sin(t * 0.45) * 2.5,
      });
      setBlob(makeBlob(40, 40, 55, t));
      setDomeBlob(makeLiquidDomePath(t));
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // — Blinking —
  useEffect(() => {
    const scheduleBlink = () => {
      blinkRef.current = setTimeout(() => {
        setIsBlinking(true);
        setTimeout(() => {
          setIsBlinking(false);
          if (Math.random() < 0.2) {
            setTimeout(() => {
              setIsBlinking(true);
              setTimeout(() => { setIsBlinking(false); scheduleBlink(); }, 90);
            }, 180);
          } else {
            scheduleBlink();
          }
        }, 110);
      }, 1800 + Math.random() * 3200);
    };
    scheduleBlink();
    return () => { if (blinkRef.current) clearTimeout(blinkRef.current); };
  }, []);

  // — Looking around —
  useEffect(() => {
    const scheduleLook = () => {
      lookRef.current = setTimeout(() => {
        const offset = EYE_OFFSETS[Math.floor(Math.random() * EYE_OFFSETS.length)];
        setEyeOffset(offset);
        scheduleLook();
      }, 1800 + Math.random() * 3500);
    };
    scheduleLook();
    return () => { if (lookRef.current) clearTimeout(lookRef.current); };
  }, []);

  const cfg = EMOTIONS[emotion];
  const mouthOpen = mouthOpenness > 0.08;
  const mouthRy = Math.max(0.5, mouthOpenness * 9);
  const baseEyeScale = cfg.eyeScale;
  const eyeScaleY = isBlinking ? 0.06 : baseEyeScale;
  const blinkTransition = isBlinking ? "transform 0.05s ease-in" : "transform 0.09s ease-out";

  // ── Shared face JSX (used by both variants) ─────────────────────────────────
  const faceElements = (
    <>
      {/* Cheek blushes (embarrassed) — small dots below each eye */}
      {cfg.cheeks && (
        <>
          <circle cx="15" cy="32" r="5" fill="white" opacity="0.5" />
          <circle cx="58" cy="28" r="5" fill="white" opacity="0.5" />
        </>
      )}

      {/* Eyebrows — rise with excitement */}
      <g style={{ transform: `translateY(${-6 * excitement}px)`, transition: "transform 0.15s ease-out" }}>
        <path
          d={cfg.browLeft}
          stroke="#161d2f"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: "d 0.4s ease" }}
        />
        <path
          d={cfg.browRight}
          stroke="#161d2f"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          style={{ transition: "d 0.4s ease" }}
        />
      </g>

      {cfg.closedEyes ? (
        <>
          {/* Closed eyes — matching arc paths for asleep, symmetric around face centre */}
          <path d="M 18 18 C 20 15 23 15 26 17" stroke="#161d2f" strokeWidth="4"
                fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d="M 43 18 C 45 15 48 15 51 17" stroke="#161d2f" strokeWidth="4"
                fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {/* Floating zzZ bubbles rising from mouth */}
          {(["z", "z", "Z"] as const).map((letter, i) => (
            <text
              key={i}
              x={50 + i * 5}
              y={34 - i * 5}
              fontSize={5 + i * 1.5}
              fontFamily="Arial, sans-serif"
              fontWeight="bold"
              fill="#161d2f"
              style={{
                animation: `floatZed 1.8s ease-in-out ${i * 0.6}s infinite`,
                transformOrigin: `${50 + i * 5}px ${34 - i * 5}px`,
              }}
            >
              {letter}
            </text>
          ))}
        </>
      ) : (
        <>
          {/* Left eye — ellipse, slight counter-clockwise tilt */}
          <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
            <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
              <ellipse cx="23" cy="18" rx={cfg.eyeRadius * 1.4} ry={cfg.eyeRadius} fill="#161d2f" transform="rotate(-10, 23, 18)" />
            </g>
          </g>

          {/* Right eye — ellipse, slight counter-clockwise tilt */}
          <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
            <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
              <ellipse cx="48" cy="14" rx={cfg.eyeRadius * 1.4} ry={cfg.eyeRadius} fill="#161d2f" transform="rotate(-8, 48, 14)" />
            </g>
          </g>
        </>
      )}

      {/* Mouth — asymmetric smile grows with excitement (pivot around mouth centre) */}
      {mouthOpen ? (
        <ellipse cx="38" cy="36" rx="10" ry={mouthRy} fill="#161d2f" />
      ) : (
        <g style={{
          transform: `translate(38px,36px) scale(${1 + 0.35 * excitement},${1 + 0.8 * excitement}) translate(-38px,-36px)`,
          transition: "transform 0.15s ease-out",
        }}>
          <path
            d={cfg.idleMouth}
            stroke="#161d2f"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ transition: "d 0.4s ease" }}
          />
        </g>
      )}
    </>
  );

  // ── DOME VARIANT ─────────────────────────────────────────────────────────────
  if (variant === "dome") {
    const { w, h } = containerSize;
    const s = w / QUATSCHI_W;                  // ≈0.993 — scale to fit container width
    const topMargin = Math.max(h * 0.05, 36);  // headroom: path peak (~36px) + this; float-up (18px) never clips
    const faceCx = FACE_BLOB_X * s;
    const faceCy = FACE_BLOB_Y * s + topMargin;
    const faceScale = Math.min(Math.max(w * 0.0034, 1.3), 2.4); // ≈2.4 at w=887

    return (
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: DOME_BODY_WIDTH, // fixed — mobile viewport crops the centre slice
          pointerEvents: "none",
        }}
      >
        {w > 0 && h > 0 && (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            aria-hidden
            style={{ display: "block", overflow: "visible" }}
          >
            <defs>
              {/* Yellow excitement gradient — radial, centred on the head, fades to transparent by mid-body */}
              <radialGradient id="excite-grad" gradientUnits="userSpaceOnUse"
                cx={FACE_BLOB_X} cy="45" r="480">
                <stop offset="0%"   stopColor="#FFCD83" stopOpacity="1" />
                <stop offset="45%"  stopColor="#FFCD83" stopOpacity="0.78" />
                <stop offset="100%" stopColor="#fd92ca" stopOpacity="0" />
              </radialGradient>
              {/* 3D highlight — upper-right light source */}
              <radialGradient id="highlight-grad" gradientUnits="objectBoundingBox"
                cx="0.68" cy="0.18" r="0.52">
                <stop offset="0%"   stopColor="white" stopOpacity="0.38" />
                <stop offset="35%"  stopColor="white" stopOpacity="0.12" />
                <stop offset="70%"  stopColor="white" stopOpacity="0.03" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              {/* 3D shadow — bottom/lower-left darkening, opposite the light source */}
              <radialGradient id="shadow-grad" gradientUnits="objectBoundingBox"
                cx="0.35" cy="0.92" r="0.72">
                <stop offset="0%"   stopColor="black" stopOpacity="0.28" />
                <stop offset="45%"  stopColor="black" stopOpacity="0.12" />
                <stop offset="100%" stopColor="black" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* ONE group that floats — body + face together */}
            <g style={{
              transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`,
              transformOrigin: `${w / 2}px ${h * 0.4}px`,
            }}>
              {/* Blob: liquid-morphing path updated every frame in the RAF loop */}
              <g transform={`translate(0 ${topMargin}) scale(${s})`}>
                <path d={domeBlob} fill="#fd92ca" />
                {/* 3D shadow — darkens bottom/lower-left to give depth */}
                <path d={domeBlob} fill="url(#shadow-grad)" />
                {/* Yellow overlay: opacity scales with audio level (0 = hidden, 1 = full Figma yellow) */}
                <path
                  d={domeBlob}
                  fill="url(#excite-grad)"
                  style={{ opacity: excitement, transition: "opacity 0.15s linear" }}
                />
                {/* 3D highlight on top — soft white sheen in upper-right, always visible */}
                <path d={domeBlob} fill="url(#highlight-grad)" />
              </g>

              {/* Face — glued to the head, rides the float */}
              <g transform={`translate(${faceCx}, ${faceCy})`}>
                <g transform={`scale(${faceScale}) translate(-40, -18)`}>
                  {faceElements}
                </g>
              </g>


            </g>
          </svg>
        )}
      </div>
    );
  }

  // ── ROUND VARIANT (default — idle state) ────────────────────────────────────
  return (
    <div style={{
      display: "inline-block",
      transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`,
    }}>
      <svg width={size} height={size} viewBox="-20 -20 120 120" aria-hidden style={{ display: "block", overflow: "visible" }}>
        {/* Organic blob body — always pink */}
        {blob && (
          <path
            d={blob}
            fill="#fd92ca"
          />
        )}

        {/* ── Face elements — scaled down to fit within the blob ── */}
        {/* Scale 0.48 around face centre (40, 18) keeps face small & clear of text */}
        <g transform="translate(40, 18) scale(0.48) translate(-40, -18)">
          {faceElements}
        </g>
      </svg>
    </div>
  );
}
