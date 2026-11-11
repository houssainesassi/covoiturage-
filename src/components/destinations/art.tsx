import { useId, type ReactNode } from "react";
import type { ArtKind } from "@/lib/destinations";
import { cn } from "@/lib/utils";

/*
 * Lightweight 3D-style (isometric) illustrations drawn as inline SVG: no image
 * download, sharp on every screen, a few KB each. To use real AI-generated
 * images later, put them in /public/destinations and pass `src` to DestinationVisual.
 */

const SKY: Record<ArtKind, [string, string]> = {
  "el-fahs": ["#d8f3e9", "#fef3c7"],
  zaghouan: ["#dbeafe", "#d8f3e9"],
  tunis: ["#e0e7ff", "#fce7f3"],
  sousse: ["#cffafe", "#e0f2fe"],
  siliana: ["#fef9c3", "#ffedd5"],
  generic: ["#e2e8f0", "#d8f3e9"],
};

type P = [number, number];
const pts = (...p: P[]) => p.map(([x, y]) => `${x},${y}`).join(" ");

/** Isometric box. (x, y) is the bottom front corner; w runs to the right, d to the left. */
function Box({ x, y, w, d, h, c }: { x: number; y: number; w: number; d: number; h: number; c: [string, string, string] }) {
  const F: P = [x, y], R: P = [x + w, y - w / 2], L: P = [x - d, y - d / 2], B: P = [x + w - d, y - w / 2 - d / 2];
  const up = ([a, b]: P): P => [a, b - h];
  return (
    <g>
      <polygon points={pts(F, L, up(L), up(F))} fill={c[1]} />
      <polygon points={pts(F, R, up(R), up(F))} fill={c[2]} />
      <polygon points={pts(up(F), up(R), up(B), up(L))} fill={c[0]} />
    </g>
  );
}

function Tree({ x, y, s = 1, id }: { x: number; y: number; s?: number; id: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="2" rx="12" ry="5" fill="#000" opacity=".12" />
      <rect x="-2.5" y="-14" width="5" height="16" rx="2" fill="#8b5e34" />
      <circle cx="0" cy="-24" r="14" fill={`url(#${id}-leaf)`} />
      <circle cx="-5" cy="-29" r="5" fill="#fff" opacity=".25" />
    </g>
  );
}

function Landmark({ kind, id }: { kind: ArtKind; id: string }) {
  switch (kind) {
    case "el-fahs":
      return (
        <g>
          <polygon points={pts([78, 160], [208, 120], [236, 128], [106, 170])} fill="#64748b" />
          <polyline points={pts([100, 163], [222, 125])} stroke="#fff" strokeWidth="2" strokeDasharray="8 8" fill="none" />
          <Tree x={84} y={138} id={id} /><Tree x={124} y={124} s={0.85} id={id} /><Tree x={232} y={158} s={1.1} id={id} /><Tree x={196} y={172} s={0.8} id={id} />
          <Box x={168} y={152} w={26} d={22} h={20} c={["#fde68a", "#f5d0a9", "#e7b98a"]} />
        </g>
      );
    case "zaghouan":
      return (
        <g>
          <polygon points={pts([60, 156], [150, 58], [170, 150])} fill="#1a7e68" />
          <polygon points={pts([150, 58], [250, 150], [170, 150])} fill="#14433b" />
          <polygon points={pts([150, 58], [131, 80], [146, 76], [156, 84], [166, 75])} fill="#fff" opacity=".85" />
          <Box x={214} y={174} w={34} d={20} h={6} c={["#f4f1ea", "#d6cfbf", "#c4bba8"]} />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={200 + i * 9} y={147 - i * 4.5} width="4" height="20" fill="#e9e4d8" />)}
          <Tree x={92} y={170} s={0.8} id={id} />
        </g>
      );
    case "tunis":
      return (
        <g>
          <Box x={110} y={168} w={30} d={26} h={64} c={["#c7d2fe", "#6366f1", "#4f46e5"]} />
          <Box x={168} y={164} w={28} d={24} h={92} c={["#bae6fd", "#0ea5e9", "#0284c7"]} />
          <Box x={214} y={170} w={26} d={22} h={46} c={["#fde68a", "#f59e0b", "#d97706"]} />
          <g transform="translate(78 150)">
            <rect x="-14" y="-18" width="28" height="18" fill="#f4f1ea" />
            <path d="M-14 -18 A14 14 0 0 1 14 -18 Z" fill="#1a7e68" />
            <rect x="12" y="-40" width="6" height="40" fill="#e9e4d8" />
          </g>
        </g>
      );
    case "sousse":
      return (
        <g>
          <polygon points={pts([160, 190], [290, 150], [228, 131], [98, 171])} fill={`url(#${id}-sea)`} />
          <path d="M140 176 q8 -4 16 0 t16 0 M196 158 q8 -4 16 0 t16 0" stroke="#fff" strokeWidth="2" fill="none" opacity=".8" />
          <Box x={110} y={150} w={30} d={28} h={50} c={["#fde7c7", "#e8c39b", "#d4a777"]} />
          {[0, 1, 2].map((i) => <rect key={i} x={112 + i * 10} y={94 - i * 5} width="6" height="6" fill="#d4a777" />)}
          <g transform="translate(70 140)">
            <path d="M0 0 q2 -20 -2 -40" stroke="#8b5e34" strokeWidth="4" fill="none" />
            <path d="M-2 -40 q-16 -4 -24 8 M-2 -40 q16 -6 24 6 M-2 -40 q-8 -14 -20 -12 M-2 -40 q8 -14 20 -12" stroke="#1a7e68" strokeWidth="5" strokeLinecap="round" fill="none" />
          </g>
        </g>
      );
    case "siliana":
      return (
        <g>
          <ellipse cx="110" cy="150" rx="70" ry="22" fill="#fbbf24" />
          <ellipse cx="210" cy="160" rx="64" ry="20" fill="#f59e0b" />
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M${70 + i * 18} ${150 + (i % 2) * 6} l2 -16 l2 16`} fill="#b45309" opacity=".55" />
          ))}
          <polygon points={pts([170, 120], [204, 96], [240, 120])} fill="#a16207" />
          <polygon points={pts([204, 96], [262, 116], [240, 120])} fill="#854d0e" />
          <circle cx="250" cy="70" r="16" fill="#fb923c" opacity=".85" />
        </g>
      );
    default:
      return (
        <g transform="translate(160 150)">
          <ellipse cx="0" cy="6" rx="22" ry="8" fill="#000" opacity=".15" />
          <path d="M0 4 C-30 -30 -34 -46 -34 -60 a34 34 0 0 1 68 0 c0 14 -4 30 -34 64 Z" fill={`url(#${id}-pin)`} />
          <circle cx="0" cy="-60" r="13" fill="#fff" />
        </g>
      );
  }
}

/** Decorative scene for a destination card or header. */
export function DestinationArt({ kind, className }: { kind: ArtKind; className?: string }) {
  const id = `a${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [s1, s2] = SKY[kind];
  return (
    <svg viewBox="0 0 320 210" className={cn("block h-full w-full", className)} aria-hidden focusable="false" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s1} /><stop offset="1" stopColor={s2} /></linearGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bbf7d0" /><stop offset="1" stopColor="#86efac" /></linearGradient>
        <radialGradient id={`${id}-leaf`} cx=".35" cy=".35"><stop offset="0" stopColor="#4bb799" /><stop offset="1" stopColor="#176556" /></radialGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#0284c7" /></linearGradient>
        <linearGradient id={`${id}-pin`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff8a4c" /><stop offset="1" stopColor="#d9480b" /></linearGradient>
      </defs>
      <rect width="320" height="210" fill={`url(#${id}-sky)`} />
      <circle cx="52" cy="44" r="22" fill="#fff" opacity=".55" />
      {/* Floating ground slab: top face + two sides give the 3D depth. */}
      <polygon points={pts([30, 150], [160, 190], [160, 206], [30, 166])} fill="#4bb799" />
      <polygon points={pts([160, 190], [290, 150], [290, 166], [160, 206])} fill="#279c80" />
      <polygon points={pts([30, 150], [160, 110], [290, 150], [160, 190])} fill={`url(#${id}-top)`} />
      <Landmark kind={kind} id={id} />
    </svg>
  );
}

/** Glossy 3D-style car, used in the hero and the rental section. */
export function CarArt({ className, tone = "brand", children }: { className?: string; tone?: "brand" | "accent"; children?: ReactNode }) {
  const id = `c${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [c1, c2] = tone === "brand" ? ["#4bb799", "#165146"] : ["#ff8a4c", "#b53c09"];
  return (
    <svg viewBox="0 0 320 180" className={cn("block", className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e0f2fe" /><stop offset="1" stopColor="#7dd3fc" /></linearGradient>
        <radialGradient id={`${id}-wheel`} cx=".4" cy=".4"><stop offset="0" stopColor="#94a3b8" /><stop offset=".45" stopColor="#334155" /><stop offset="1" stopColor="#0f172a" /></radialGradient>
      </defs>
      <ellipse cx="160" cy="150" rx="132" ry="14" fill="#000" opacity=".18" />
      <path d="M36 128 C36 104 52 96 78 92 L110 58 C118 50 128 46 140 46 L204 46 C218 46 228 52 238 62 L264 92 C284 96 294 106 294 124 L294 132 C294 138 290 142 284 142 L46 142 C40 142 36 138 36 132 Z" fill={`url(#${id}-body)`} />
      <path d="M120 60 L104 92 L170 92 L170 58 L140 58 C130 58 125 59 120 60 Z" fill={`url(#${id}-glass)`} />
      <path d="M182 58 L182 92 L250 92 L230 66 C224 60 216 58 206 58 Z" fill={`url(#${id}-glass)`} />
      <path d="M60 100 L280 100" stroke="#fff" strokeWidth="3" opacity=".35" />
      <rect x="278" y="108" width="14" height="8" rx="3" fill="#fde68a" />
      <rect x="38" y="108" width="10" height="8" rx="3" fill="#fca5a5" />
      {[94, 232].map((cx) => (
        <g key={cx}><circle cx={cx} cy="140" r="24" fill={`url(#${id}-wheel)`} /><circle cx={cx} cy="140" r="9" fill="#cbd5e1" /></g>
      ))}
      <path d="M116 52 C150 44 200 44 226 54" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".45" fill="none" />
      {children}
    </svg>
  );
}
