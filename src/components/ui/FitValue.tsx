import type { CSSProperties } from "react";

// A big stat number that always fits its card: the font shrinks with the
// value's length (down to 16px) and only wraps if it still can't fit.
// `max` is the design size in px (30 = text-3xl, 36 = text-4xl, 24 = text-2xl).
export default function FitValue({
  value,
  max = 30,
  className = "",
  style,
}: {
  value: string;
  max?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const vars = { "--chars": Math.max(1, value.length), "--fit-max": `${max}px` } as CSSProperties;
  return (
    <div className="fit-wrap">
      <div className={`fit-value ${className}`} style={{ ...vars, ...style }}>
        {value}
      </div>
    </div>
  );
}
