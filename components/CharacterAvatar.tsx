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
    eyeRadius: 4.5,
    idleMouth: "M 28 52 Q 40 63 52 52",
    browLeft:  "M 23 27 Q 28 24 33 26",
    browRight: "M 47 27 Q 52 24 57 26",
    cheeks: false,
  },
  sad: {
    color: "#818cf8",
    eyeScale: 0.85,
    eyeRadius: 4.5,
    idleMouth: "M 28 56 Q 40 48 52 56",
    browLeft:  "M 23 26 Q 28 29 33 27",
    browRight: "M 47 26 Q 52 29 57 27",
    cheeks: false,
  },
  angry: {
    color: "#f87171",
    eyeScale: 0.75,
    eyeRadius: 4.2,
    idleMouth: "M 29 55 Q 40 51 51 55",
    browLeft:  "M 23 28 Q 28 24 33 27",
    browRight: "M 47 27 Q 52 24 57 28",
    cheeks: false,
  },
  embarrassed: {
    color: "#fb7185",
    eyeScale: 0.8,
    eyeRadius: 4.5,
    idleMouth: "M 30 53 Q 40 58 50 53",
    browLeft:  "M 23 27 Q 28 25 33 27",
    browRight: "M 47 27 Q 52 25 57 27",
    cheeks: true,
  },
  excited: {
    color: "#fbbf24",
    eyeScale: 1.1,
    eyeRadius: 5.2,
    idleMouth: "M 27 51 Q 40 65 53 51",
    browLeft:  "M 23 25 Q 28 21 33 24",
    browRight: "M 47 25 Q 52 21 57 24",
    cheeks: false,
  },
  surprised: {
    color: "#fb923c",
    eyeScale: 1.15,
    eyeRadius: 5.5,
    idleMouth: "M 33 52 Q 40 62 47 52",
    browLeft:  "M 23 24 Q 28 20 33 23",
    browRight: "M 47 24 Q 52 20 57 23",
    cheeks: false,
  },
  thinking: {
    color: "#c084fc",
    eyeScale: 0.9,
    eyeRadius: 4.5,
    idleMouth: "M 30 53 Q 38 57 48 51",
    browLeft:  "M 23 27 Q 28 24 33 26",
    browRight: "M 47 25 Q 52 27 57 25",
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

type Props = { mouthOpenness: number; emotion?: Emotion };

export function CharacterAvatar({ mouthOpenness, emotion = "happy" }: Props) {
  const [isBlinking, setIsBlinking] = useState(false);
  const [eyeOffset, setEyeOffset] = useState({ x: 0, y: 0 });
  const [float, setFloat] = useState({ x: 0, y: 0, rotate: 0 });
  const [blob, setBlob] = useState("");
  const [currentColor, setCurrentColor] = useState(EMOTIONS[emotion].color);
  const blinkRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());

  // Smoothly lerp the blob colour toward the target emotion colour
  const colorRef = useRef(currentColor);
  const targetColorRef = useRef(EMOTIONS[emotion].color);

  useEffect(() => {
    targetColorRef.current = EMOTIONS[emotion].color;
  }, [emotion]);

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

  return (
    <div style={{
      display: "inline-block",
      transform: `translate(${float.x}px, ${float.y}px) rotate(${float.rotate}deg)`,
    }}>
      <svg width="260" height="260" viewBox="-20 -20 120 120" aria-hidden style={{ display: "block", overflow: "visible" }}>
        {/* Organic blob body — always pink */}
        {blob && (
          <path
            d={blob}
            fill="#f472b6"
          />
        )}

        {/* Face overlay — emotion colour tints face area only */}
        <ellipse
          cx="40" cy="43"
          rx="26" ry="21"
          fill={cfg.color}
          opacity="0.5"
          style={{ transition: "fill 0.6s ease" }}
        />

        {/* Cheek blushes (embarrassed) */}
        {cfg.cheeks && (
          <>
            <circle cx="18" cy="46" r="7" fill="#fda4af" opacity="0.55" />
            <circle cx="62" cy="46" r="7" fill="#fda4af" opacity="0.55" />
          </>
        )}

        {/* Eyebrows */}
        <path
          d={cfg.browLeft}
          stroke="#1a1a1a"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          style={{ transition: "d 0.4s ease" }}
        />
        <path
          d={cfg.browRight}
          stroke="#1a1a1a"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          style={{ transition: "d 0.4s ease" }}
        />

        {/* Left eye */}
        <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
          <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
            <circle cx="28" cy="34" r={cfg.eyeRadius} fill="#1a1a1a" />
            <circle cx="29.5" cy="32.5" r="1.5" fill="white" />
          </g>
        </g>

        {/* Right eye */}
        <g style={{ transform: `translate(${eyeOffset.x}px, ${eyeOffset.y}px)`, transition: "transform 0.38s ease-out" }}>
          <g className="char-eye-inner" style={{ transform: `scaleY(${eyeScaleY})`, transition: blinkTransition }}>
            <circle cx="52" cy="34" r={cfg.eyeRadius} fill="#1a1a1a" />
            <circle cx="53.5" cy="32.5" r="1.5" fill="white" />
          </g>
        </g>

        {/* Mouth */}
        {mouthOpen ? (
          <ellipse cx="40" cy="54" rx="11" ry={mouthRy} fill="#1a1a1a" />
        ) : (
          <path
            d={cfg.idleMouth}
            stroke="#1a1a1a"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
            style={{ transition: "d 0.4s ease" }}
          />
        )}
      </svg>
    </div>
  );
}
