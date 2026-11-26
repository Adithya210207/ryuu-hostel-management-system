import type { CSSProperties, ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  arrow: <path d="M5 19 19 5M5 5h14v14" />,
  down: <path d="M12 3v18M4 13l8 8 8-8" />,
  home: <><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" /><path d="M3 10h18" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
  zap: <path d="m13 2-10 12h8l-1 8 11-12h-8Z" />,
  star: <path d="m12 1 2.2 6.8L21 5l-2.8 6.8L25 14l-6.8 2.2L21 23l-6.8-2.8L12 27l-2.2-6.8L3 23l2.8-6.8L-1 14l6.8-2.2L3 5l6.8 2.8Z" transform="translate(2 0) scale(.8)" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  replay: <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  bed: <><path d="M3 18v3m18-3v3M3 18h18v-7H3Zm2-7V4h14v7M8 8h2m4 0h2" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  food: <><path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v19M19 3c-4 3-4 10 0 11V3Zm0 11v8" /></>,
  locker: <><rect x="5" y="2" width="14" height="20" rx="1" /><path d="M12 2v20M8 10v3m8-3v3" /></>,
  lift: <><rect x="3" y="2" width="18" height="20" rx="2" /><path d="M12 8v14m-5-7V8h10v7M9 5h6" /></>,
  car: <><path d="m4 10 2-6h12l2 6M3 10h18v8H3Zm2 8v3m14-3v3M6 14h1m10 0h1" /></>,
  bath: <><path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5ZM5 12V5a3 3 0 0 1 6 0M7 20v2m10-2v2" /><path d="M8 5h6" /></>,
  close: <path d="m5 5 14 14M19 5 5 19" />,
  menu: <path d="M3 7h18M3 16h18" />,
  focus: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5" />,
};

export default function Icon({ name, className = "", style }: { name: string; className?: string; style?: CSSProperties }) {
  return <svg className={`jn-icon ${className}`} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}
