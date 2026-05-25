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

const DOME_BODY_WIDTH = 887; // px — fixed body width; mobile viewport crops the centre

// Exact vector exported from Figma node 11:437 ("quatschi" blob). viewBox 0 0 893.167 947.999
const QUATSCHI_W = 893.167;
const QUATSCHI_H = 947.999;
const QUATSCHI_PATH =
  "M169.648 150.482C142.611 173.431 72.2545 196.999 45.6482 257.999C4.64817 351.999 32.0374 406.999 10.6482 487.999C-0.35219 529.656 1.28629 647.991 10.6482 686.999L10.8798 687.964C16.5146 711.459 29.0607 763.772 58.6481 804.999C84.8706 841.537 184.088 887.114 221.648 906.999C255.648 924.999 381.648 944.999 445.648 944.999C518.724 944.999 625.648 944.999 679.648 916.999C745.648 882.776 775.648 844.999 820.648 798.999C866.927 751.691 872.664 649.843 881.648 581.999C886.234 547.37 898.28 469.999 881.648 390.999C853.648 257.999 804.525 194.82 688.648 128.999C578.648 66.5153 482.664 -56.4413 315.764 36.6707C250.648 72.9985 216.774 110.48 169.648 150.482Z";
// Face anchor in blob coordinate space (from Figma eye ellipses, under the peak)
const FACE_BLOB_X = 420;
const FACE_BLOB_Y = 80;

export type Emotion =
  | "happy"
  | "sad"
  | "angry"
  | "embarrassed"
  | "excited"
  | "surprised"
  | "thinking";

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
};

const EMOTIONS: Record<Emotion, EmotionConfig> = {
  happy: {
    color: "#f472b6",
    eyeScale: 1,
    eyeRadius: 3.0,
    idleMouth: "M 28 32 Q 40 43 52 32",
    browLeft:  "M 23 7 Q 28 4 33 6",
    browRight: "M 47 7 Q 52 4 57 6",
    cheeks: false,
  },
  sad: {
    color: "#818cf8",
    eyeScale: 0.85,
    eyeRadius: 3.0,
    idleMouth: "M 28 36 Q 40 28 52 36",
    browLeft:  "M 23 6 Q 28 9 33 7",
    browRight: "M 47 6 Q 52 9 57 7",
    cheeks: false,
  },
  angry: {
    color: "#f87171",
    eyeScale: 0.75,
    eyeRadius: 2.8,
    idleMouth: "M 29 35 Q 40 31 51 35",
    browLeft:  "M 23 8 Q 28 4 33 7",
    browRight: "M 47 7 Q 52 4 57 8",
    cheeks: false,
  },
  embarrassed: {
    color: "#fb7185",
    eyeScale: 0.8,
    eyeRadius: 3.0,
    idleMouth: "M 30 33 Q 40 38 50 33",
    browLeft:  "M 23 7 Q 28 5 33 7",
    browRight: "M 47 7 Q 52 5 57 7",
    cheeks: true,
  },
  excited: {
    color: "#fbbf24",
    eyeScale: 1.1,
    eyeRadius: 3.5,
    idleMouth: "M 27 31 Q 40 45 53 31",
    browLeft:  "M 23 5 Q 28 1 33 4",
    browRight: "M 47 5 Q 52 1 57 4",
    cheeks: false,
  },
  surprised: {
    color: "#fb923c",
    eyeScale: 1.15,
    eyeRadius: 3.7,
    idleMouth: "M 33 32 Q 40 42 47 32",
    browLeft:  "M 23 4 Q 28 0 33 3",
    browRight: "M 47 4 Q 52 0 57 3",
    cheeks: false,
  },
  thinking: {
    color: "#c084fc",
    eyeScale: 0.9,
    eyeRadius: 3.0,
    idleMouth: "M 30 33 Q 38 37 48 31",
    browLeft:  "M 23 7 Q 28 4 33 6",
    browRight: "M 47 5 Q 52 7 57 5",
    cheeks: false,
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
        x: Math.sin(t * 0.63) * 14,
        y: Math.sin(t * 1.1) * 18,
        rotate: Math.sin(t * 0.45) * 4,
      });
      setBlob(makeBlob(40, 40, 55, t));
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
      {/* Cheek blushes (embarrassed) */}
      {cfg.cheeks && (
        <>
          <circle cx="18" cy="26" r="7" fill="#fda4af" opacity="0.55" />
          <circle cx="62" cy="26" r="7" fill="#fda4af" opacity="0.55" />
        </>
      )}

      {/* Eyebrows — rise with excitement */}
      <g style={{ transform: `translateY(${-6 * excitement}px)`, transition: "transform 0.15s ease-out" }}>
        <path
          d={cfg.browLeft}
          stroke="#1a1a1a"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          style={{ transition: "d 0.4s ease" }}
        />
        <path
          d={cfg.browRight}
          stroke="#1a1a1a"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          style={{ transition: "d 0.4s ease" }}
        />
      </g>

      {/* Left eye */}
      <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
        <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
          <circle cx="28" cy="14" r={cfg.eyeRadius} fill="#1a1a1a" />
          <circle cx="29" cy="12.8" r="1.0" fill="white" />
        </g>
      </g>

      {/* Right eye */}
      <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
        <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
          <circle cx="52" cy="14" r={cfg.eyeRadius} fill="#1a1a1a" />
          <circle cx="53" cy="12.8" r="1.0" fill="white" />
        </g>
      </g>

      {/* Mouth — smile grows with excitement (pivot around mouth centre) */}
      {mouthOpen ? (
        <ellipse cx="40" cy="34" rx="11" ry={mouthRy} fill="#1a1a1a" />
      ) : (
        <g style={{
          transform: `translate(40px,32px) scale(${1 + 0.35 * excitement},${1 + 0.8 * excitement}) translate(-40px,-32px)`,
          transition: "transform 0.15s ease-out",
        }}>
          <path
            d={cfg.idleMouth}
            stroke="#1a1a1a"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
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
                cx={FACE_BLOB_X} cy="130" r="480">
                <stop offset="0%"   stopColor="#FFD43B" stopOpacity="1" />
                <stop offset="45%"  stopColor="#FFA24C" stopOpacity="0.78" />
                <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* ONE group that floats — body + face together */}
            <g style={{
              transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`,
              transformOrigin: `${w / 2}px ${h * 0.4}px`,
            }}>
              {/* Blob: exact Figma path scaled into pixel space */}
              <g transform={`translate(0 ${topMargin}) scale(${s})`}>
                {/* Backfill rect so the bottom is always pink on tall viewports
                    (blob narrows at the bottom; this fills from y=620 downward) */}
                <rect x={0} y={620} width={QUATSCHI_W} height={QUATSCHI_H * 2} fill="#f472b6" />
                <path d={QUATSCHI_PATH} fill="#f472b6" />
                {/* Yellow overlay: opacity scales with audio level (0 = hidden, 1 = full Figma yellow) */}
                <path
                  d={QUATSCHI_PATH}
                  fill="url(#excite-grad)"
                  style={{ opacity: excitement, transition: "opacity 0.15s linear" }}
                />
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
            fill="#f472b6"
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
