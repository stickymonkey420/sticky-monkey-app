// Large vector illustrations identifying the business type on My Business.
// Pure inline SVG -- razor sharp at any size / pixel density, no image
// files or generation cost. Currently covers the "Care & Wellness" group
// only; any other category renders nothing.

type Scene = { bg: [string, string]; art: React.ReactNode };

const SKIN = "#f2c29b";
const SKIN_SHADE = "#e0a982";
const INK = "#1b2130";

const SCENES: { match: RegExp; scene: Scene }[] = [
  {
    // Babysitting / Nanny Services
    match: /babysit|nanny/i,
    scene: {
      bg: ["#ffd6e7", "#ffb3cf"],
      art: (
        <>
          {/* adult */}
          <circle cx="62" cy="52" r="15" fill={SKIN} />
          <path d="M47 50c0-12 8-19 16-19s16 7 15 19c-4-6-10-8-15-8s-12 2-16 8z" fill="#5a3b2e" />
          <path d="M40 120c0-26 10-46 22-46s22 20 22 46z" fill="#4f8cff" />
          {/* arm cradling child */}
          <path d="M72 96c10 2 20 0 28-6" stroke={SKIN} strokeWidth="8" strokeLinecap="round" fill="none" />
          {/* child */}
          <circle cx="100" cy="74" r="11" fill={SKIN} />
          <path d="M89 72c1-8 6-12 11-12s10 4 11 11c-3-3-7-4-11-4s-8 1-11 5z" fill="#f5b041" />
          <path d="M88 112c0-16 5-26 12-26s12 10 12 26z" fill="#f5d020" />
          <circle cx="96" cy="74" r="1.6" fill={INK} />
          <circle cx="104" cy="74" r="1.6" fill={INK} />
          <path d="M97 79q3 2.5 6 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="57" cy="52" r="1.8" fill={INK} />
          <circle cx="67" cy="52" r="1.8" fill={INK} />
          <path d="M58 58q4 3 8 0" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          {/* heart */}
          <path d="M118 38c-3-6-12-4-11 3 1 5 11 11 11 11s10-6 11-11c1-7-8-9-11-3z" fill="#ff5c7a" />
          {/* bottle */}
          <rect x="116" y="96" width="12" height="20" rx="4" fill="#ffffff" />
          <rect x="118" y="90" width="8" height="7" rx="2" fill="#7aa8ff" />
          <rect x="116" y="104" width="12" height="4" fill="#ffe7a0" />
        </>
      ),
    },
  },
  {
    // Fitness / Personal Trainer
    match: /fitness|personal trainer/i,
    scene: {
      bg: ["#ffe2b8", "#ffc178"],
      art: (
        <>
          {/* figure lifting */}
          <circle cx="80" cy="60" r="13" fill={SKIN} />
          <path d="M67 56c1-9 7-13 13-13s12 4 13 13c-4-4-8-5-13-5s-9 1-13 5z" fill={INK} />
          <path d="M64 112l4-38h24l4 38z" fill="#ff5c7a" />
          <path d="M67 78l-22-46M93 78l22-46" stroke={SKIN} strokeWidth="9" strokeLinecap="round" />
          <path d="M70 112l-4 22M90 112l4 22" stroke="#2d3a55" strokeWidth="10" strokeLinecap="round" />
          {/* barbell (overhead) */}
          <rect x="22" y="27" width="116" height="5" rx="2.5" fill="#3b4258" />
          <rect x="18" y="15" width="10" height="29" rx="3" fill={INK} />
          <rect x="30" y="19" width="7" height="21" rx="2" fill="#4a536b" />
          <rect x="132" y="15" width="10" height="29" rx="3" fill={INK} />
          <rect x="123" y="19" width="7" height="21" rx="2" fill="#4a536b" />
          <circle cx="75" cy="61" r="1.8" fill={INK} />
          <circle cx="85" cy="61" r="1.8" fill={INK} />
          <path d="M76 67h8" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          {/* sweat */}
          <path d="M100 50q3 5 0 8q-3-3 0-8z" fill="#7aa8ff" />
        </>
      ),
    },
  },
  {
    // Massage Therapist
    match: /massage/i,
    scene: {
      bg: ["#d8f5e8", "#a8e6cf"],
      art: (
        <>
          {/* table */}
          <rect x="18" y="100" width="124" height="10" rx="4" fill="#8a6a52" />
          <rect x="26" y="110" width="7" height="24" rx="2" fill="#6e533f" />
          <rect x="127" y="110" width="7" height="24" rx="2" fill="#6e533f" />
          {/* client lying face down */}
          <rect x="34" y="86" width="96" height="16" rx="8" fill="#ffffff" />
          <circle cx="40" cy="88" r="11" fill={SKIN} />
          <path d="M29 86c2-8 7-11 12-11s9 3 11 8c-4-2-8-2-12-1s-8 2-11 4z" fill="#5a3b2e" />
          <path d="M50 84c16-6 40-6 60 0" stroke={SKIN} strokeWidth="10" strokeLinecap="round" fill="none" />
          {/* towel */}
          <rect x="88" y="82" width="42" height="18" rx="6" fill="#7fd1ae" />
          {/* therapist hands */}
          <path d="M70 52c0 14 2 22 6 28M96 52c0 14-2 22-6 28" stroke={SKIN_SHADE} strokeWidth="8" strokeLinecap="round" fill="none" />
          <circle cx="83" cy="40" r="11" fill={SKIN} />
          <path d="M72 38c1-8 6-11 11-11s10 3 11 11c-3-3-7-4-11-4s-8 1-11 4z" fill={INK} />
          <path d="M66 70c0-14 7-22 17-22s17 8 17 22z" fill="#3ddc97" />
          {/* stones + leaf */}
          <ellipse cx="128" cy="44" rx="12" ry="6" fill="#4a536b" />
          <ellipse cx="128" cy="36" rx="9" ry="5" fill="#626b84" />
          <ellipse cx="128" cy="29" rx="6" ry="3.5" fill="#7d86a0" />
          <path d="M30 40c10-14 26-12 26-12s-2 16-16 20c-6 2-10-2-10-8z" fill="#3ddc97" />
          <path d="M34 46l18-14" stroke="#1e8c5f" strokeWidth="1.6" />
        </>
      ),
    },
  },
  {
    // Pet Sitting / Dog Walking
    match: /pet|dog/i,
    scene: {
      bg: ["#dbe8ff", "#b5ceff"],
      art: (
        <>
          {/* walker */}
          <circle cx="50" cy="40" r="12" fill={SKIN} />
          <path d="M38 36c1-8 6-12 12-12s11 4 12 12c-3-3-7-4-12-4s-9 1-12 4z" fill="#5a3b2e" />
          <path d="M36 92c0-24 6-40 14-40s14 16 14 40z" fill="#f5d020" />
          <path d="M42 92l-5 36M58 92l5 36" stroke="#2d3a55" strokeWidth="9" strokeLinecap="round" />
          <path d="M60 64l18 14" stroke={SKIN} strokeWidth="7" strokeLinecap="round" />
          {/* leash */}
          <path d="M80 80q20 6 32 22" stroke="#ff5c7a" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* dog */}
          <ellipse cx="116" cy="114" rx="22" ry="12" fill="#c98b4e" />
          <circle cx="134" cy="100" r="11" fill="#c98b4e" />
          <ellipse cx="140" cy="104" rx="6" ry="4.5" fill="#e7b07a" />
          <circle cx="145" cy="102" r="2" fill={INK} />
          <circle cx="135" cy="97" r="1.8" fill={INK} />
          <path d="M126 92c-4 0-8 6-6 12 3-1 6-5 6-12z" fill="#8a5a2e" />
          <rect x="100" y="120" width="6" height="14" rx="3" fill="#a8723f" />
          <rect x="124" y="120" width="6" height="14" rx="3" fill="#a8723f" />
          <path d="M94 110c-8-6-10-14-6-18" stroke="#c98b4e" strokeWidth="5" strokeLinecap="round" fill="none" />
          <rect x="125" y="106" width="14" height="4" rx="2" fill="#ff5c7a" />
          {/* paw prints */}
          <g fill="#7aa8ff">
            <circle cx="96" cy="40" r="4" />
            <circle cx="90" cy="33" r="2" />
            <circle cx="96" cy="31" r="2" />
            <circle cx="102" cy="33" r="2" />
            <circle cx="122" cy="56" r="4" />
            <circle cx="116" cy="49" r="2" />
            <circle cx="122" cy="47" r="2" />
            <circle cx="128" cy="49" r="2" />
          </g>
        </>
      ),
    },
  },
  {
    // Senior / Elder Care
    match: /senior|elder/i,
    scene: {
      bg: ["#ece0ff", "#cfb8ff"],
      art: (
        <>
          {/* senior seated */}
          <rect x="30" y="88" width="50" height="10" rx="4" fill="#8a6a52" />
          <rect x="30" y="60" width="9" height="38" rx="4" fill="#8a6a52" />
          <rect x="34" y="98" width="6" height="30" rx="2" fill="#6e533f" />
          <rect x="72" y="98" width="6" height="30" rx="2" fill="#6e533f" />
          <circle cx="56" cy="50" r="13" fill={SKIN} />
          <path d="M43 48c0-10 6-15 13-15s13 5 13 15c-2-5-7-7-13-7s-11 2-13 7z" fill="#e6e8ee" />
          <path d="M42 90c0-20 6-30 14-30s14 10 14 30z" fill="#b07aff" />
          <circle cx="51" cy="51" r="4" fill="none" stroke={INK} strokeWidth="1.4" />
          <circle cx="61" cy="51" r="4" fill="none" stroke={INK} strokeWidth="1.4" />
          <path d="M55 51h2" stroke={INK} strokeWidth="1.4" />
          <path d="M52 58q4 3 8 0" stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          {/* cane */}
          <path d="M22 72q0-8 8-8v62" stroke="#4a536b" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* caregiver */}
          <circle cx="112" cy="42" r="12" fill={SKIN} />
          <path d="M100 40c1-9 6-12 12-12s11 3 12 12c-3-3-7-4-12-4s-9 1-12 4z" fill={INK} />
          <path d="M96 112c0-30 7-50 16-50s16 20 16 50z" fill="#4f8cff" />
          <path d="M98 76c-10 4-18 8-24 12" stroke={SKIN} strokeWidth="7" strokeLinecap="round" />
          <circle cx="108" cy="43" r="1.6" fill={INK} />
          <circle cx="116" cy="43" r="1.6" fill={INK} />
          <path d="M109 48q3 2 6 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          {/* heart + mug */}
          <path d="M132 26c-2-5-10-3-9 2 1 4 9 9 9 9s8-5 9-9c1-5-7-7-9-2z" fill="#ff5c7a" />
          <rect x="112" y="118" width="18" height="14" rx="3" fill="#ffffff" />
          <path d="M130 121q6 0 6 5t-6 5" stroke="#ffffff" strokeWidth="2.5" fill="none" />
          <path d="M116 112q2-4 0-8M122 112q2-4 0-8" stroke="#ffffff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity=".8" />
        </>
      ),
    },
  },
  {
    // Yoga Instructor
    match: /yoga/i,
    scene: {
      bg: ["#d5f2f5", "#9fdde6"],
      art: (
        <>
          {/* sun */}
          <circle cx="80" cy="54" r="34" fill="#fff4c2" opacity=".8" />
          {/* mat */}
          <rect x="22" y="122" width="116" height="9" rx="4.5" fill="#b07aff" />
          {/* lotus pose */}
          <circle cx="80" cy="46" r="12" fill={SKIN} />
          <path d="M68 44c1-9 6-13 12-13s11 4 12 13c-3-3-7-4-12-4s-9 1-12 4z" fill="#5a3b2e" />
          <circle cx="80" cy="30" r="6" fill="#5a3b2e" />
          <path d="M76 47q2 1.5 3 0M81 47q2 1.5 3 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M77 52q3 2 6 0" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <path d="M68 100c0-24 5-40 12-40s12 16 12 40z" fill="#3ddc97" />
          {/* arms to knees, mudra */}
          <path d="M70 70c-10 12-18 24-22 36M90 70c10 12 18 24 22 36" stroke={SKIN} strokeWidth="7" strokeLinecap="round" fill="none" />
          <circle cx="48" cy="107" r="4" fill={SKIN} />
          <circle cx="112" cy="107" r="4" fill={SKIN} />
          {/* crossed legs */}
          <path d="M44 116c12-14 30-16 44-8 14 8 24 8 30 2" stroke="#2d3a55" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M116 116c-12-14-30-16-44-8" stroke="#3b4a6b" strokeWidth="11" strokeLinecap="round" fill="none" />
          {/* lotus flower */}
          <path d="M132 40c-4-8 0-14 0-14s4 6 0 14z" fill="#ff8fb1" />
          <path d="M132 40c-8-2-11-8-11-8s7 0 11 8z" fill="#ffb3cf" />
          <path d="M132 40c8-2 11-8 11-8s-7 0-11 8z" fill="#ffb3cf" />
          <path d="M24 60c4-6 10-6 12 0" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M120 74c4-6 10-6 12 0" stroke="#ffffff" strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ),
    },
  },
];

export function hasCategoryIllustration(categoryName: string | null | undefined, groupLabel: string | null | undefined): boolean {
  if (!/care\s*&\s*wellness/i.test(groupLabel ?? "")) return false;
  return SCENES.some((s) => s.match.test(categoryName ?? ""));
}

export default function CategoryIllustration({
  categoryName,
  groupLabel,
  size = 128,
}: {
  categoryName: string | null | undefined;
  groupLabel: string | null | undefined;
  size?: number;
}) {
  if (!hasCategoryIllustration(categoryName, groupLabel)) return null;
  const found = SCENES.find((s) => s.match.test(categoryName ?? ""));
  if (!found) return null;
  const id = `cat-bg-${(categoryName ?? "x").replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      role="img"
      aria-label={`${categoryName} illustration`}
      className="shrink-0 rounded-2xl shadow-lg"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={found.scene.bg[0]} />
          <stop offset="1" stopColor={found.scene.bg[1]} />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="24" fill={`url(#${id})`} />
      {found.scene.art}
    </svg>
  );
}
