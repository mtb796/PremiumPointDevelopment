import React, { useEffect, useState } from "react";
import { parseEntry } from "../format.js";

/** A "sample data" badge — every unsourced number must carry one (honesty rule). */
export function SampleBadge({ title }: { title?: string }) {
  return (
    <span className="badge sample" title={title ?? "Sample data — not sourced, not market evidence"}>
      sample
    </span>
  );
}

export function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card">
      <header className="card-h">
        <h2>{title}</h2>
        {right}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

/**
 * A numeric input that accepts entry shortcuts ("1.9k", "$1,900", "4%") and commits a
 * parsed number. `scale` lets a rate be edited as a percent (scale=100 => shows 7 for 0.07).
 */
export function NumberField({
  label,
  value,
  onChange,
  suffix,
  scale = 1,
  digits,
  sample,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  scale?: number;
  digits?: number;
  sample?: boolean;
  hint?: string;
}) {
  const display = (v: number) => {
    const shown = v * scale;
    return Number.isFinite(shown) ? (digits !== undefined ? shown.toFixed(digits) : String(shown)) : "";
  };
  const [text, setText] = useState(display(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display(value));
  }, [value, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (raw: string) => {
    const parsed = parseEntry(raw);
    if (Number.isFinite(parsed)) onChange(parsed / scale);
  };

  return (
    <label className="field">
      <span className="field-label">
        {label} {sample && <SampleBadge />}
      </span>
      <span className="field-input">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Row({ k, v, strong, indent }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean; indent?: boolean }) {
  return (
    <div className={`kv ${strong ? "strong" : ""}`}>
      <span className={indent ? "k indent" : "k"}>{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function Flags({ flags }: { flags: { level: string; code: string; message: string }[] }) {
  if (flags.length === 0) return null;
  return (
    <div className="flags">
      {flags.map((f, i) => (
        <div key={i} className={`flag ${f.level}`}>
          <strong>{f.level}</strong> {f.message}
        </div>
      ))}
    </div>
  );
}
