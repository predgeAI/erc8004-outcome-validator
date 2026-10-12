import { useState, type ReactNode } from "react";

export type CheckState = "idle" | "running" | "ok" | "fail" | "na";

export function CheckIcon({ state }: { state: CheckState }) {
  if (state === "running" || state === "idle") return <span className={`ci ci-${state}`} aria-hidden><span className="spin" /></span>;
  if (state === "ok") return (
    <span className="ci ci-ok" aria-hidden>
      <svg viewBox="0 0 20 20"><path className="draw" d="M5 10.5l3.2 3.2L15 7" /></svg>
    </span>
  );
  if (state === "fail") return (
    <span className="ci ci-fail" aria-hidden><svg viewBox="0 0 20 20"><path d="M6 6l8 8M14 6l-8 8" /></svg></span>
  );
  return <span className="ci ci-na" aria-hidden><svg viewBox="0 0 20 20"><path d="M6 10h8" /></svg></span>;
}

export function CheckRow({ state, title, detail, testId }: { state: CheckState; title: ReactNode; detail?: ReactNode; testId?: string }) {
  return (
    <li className={`check check-${state}`} data-testid={testId} data-state={state}>
      <CheckIcon state={state} />
      <div className="check-body">
        <div className="check-title">{title}</div>
        {detail && <div className="check-detail">{detail}</div>}
      </div>
    </li>
  );
}

export function Ext({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>;
}

export function Hash({ value, href, n = 6 }: { value: string; href?: string; n?: number }) {
  const s = value.length > 2 * n + 2 ? `${value.slice(0, n + 2)}…${value.slice(-4)}` : value;
  return href ? <Ext href={href} className="mono hash">{s}</Ext> : <span className="mono hash" title={value}>{s}</span>;
}

export function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn-ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

export function Shield({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 4l9.5 3.5v7c0 6-4 11-9.5 13.5C10.5 25.5 6.5 20.5 6.5 14.5v-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 16l3 3 5.5-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const fmtDate = (iso: string | undefined | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
};
