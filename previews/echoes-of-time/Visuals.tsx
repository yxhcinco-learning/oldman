import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  back: <path d="m14 5-7 7 7 7" />,
  arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  mic: <><rect x="8" y="2" width="8" height="14" rx="4" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>,
  pen: <><path d="m16 3 5 5-12 12-6 1 1-6L16 3Zm-3 3 5 5M4 15l5 5" /></>,
  chat: <path d="M20 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9ZM7 8h9M7 12h6" />,
  spark: <><path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z" /><path d="m20 1 .9 2.1L23 4l-2.1.9L20 7l-.9-2.1L17 4l2.1-.9L20 1Z" /></>,
  book: <><path d="M12 5C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 1Zm0 0v15" /><path d="M5 8h4M5 12h4m6-4h4m-4 4h4" /></>,
  leaf: <><path d="M20 3C8 2 3 7 5 15c7 5 16 0 15-12ZM3 21 16 8M8 15l-1-5m6 1 5 1" /></>,
  format: <><path d="M5 4h14M5 9h14M5 14h8M5 19h14" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-5 4 3 4-6 4 5" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  undo: <><path d="M8 5 3 10l5 5M3 10h10a6 6 0 0 1 6 6v3" /></>,
};

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.spark}</svg>;
}

export function LetterDrawing() {
  return (
    <svg className="letter-drawing" viewBox="0 0 200 170" fill="none" aria-hidden="true">
      <ellipse cx="96" cy="151" rx="81" ry="8" fill="#153b2e" opacity=".045" />
      <path d="m24 83 133-17 15 74-134 14Z" fill="#efe7d8" />
      <path d="m24 83 71 31 62-48M38 154l53-45m81 31-63-30" stroke="#ab977c" strokeWidth="1.4" strokeLinecap="round" />
      <path d="m60 104-8-70 92-10 8 69-50 17Z" fill="#fffefb" stroke="#c8c4b8" strokeWidth="1.4" />
      <path d="m69 51 52-6M72 65l49-6M74 79l36-4" stroke="#b8b9aa" strokeWidth="2" strokeLinecap="round" />
      <path d="M148 123c-8-36-3-72 21-103" stroke="#496756" strokeWidth="2" strokeLinecap="round" />
      <path d="M148 94c-24-4-26-21-21-29 14 7 23 13 21 29Zm2-23c1-18 14-28 25-24-3 16-10 25-25 24Zm9-30c-8-16-2-27 11-31 2 17-3 23-11 31Zm-13 76c4-18 18-21 27-16-6 14-14 17-27 16Z" fill="#617d66" opacity=".83" />
      <circle cx="92" cy="117" r="12" fill="#ae6e49" /><path d="m88 120 7-8m-7 1 6 6" stroke="#f5e6d7" strokeWidth="1.2" />
    </svg>
  );
}

export function StoryDrawing({ kind }: { kind: string }) {
  const train = kind === 'train';
  const flower = kind === 'flower' || kind === 'home';
  const dinner = kind === 'dinner';
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden="true" className={`story-drawing art-${kind}`}>
      <rect width="240" height="180" fill={train ? '#e8ebe4' : flower ? '#e8ecdf' : '#eee3d4'} />
      <circle cx="183" cy="43" r="24" fill="#e6ba7e" opacity=".63" />
      <path d="M-10 125c59-22 87 12 144-4s75-15 123 8v62H-10Z" fill={train ? '#bbcbba' : '#cfccb6'} opacity=".64" />
      {train ? <>
        <path d="m10 151 208-14m-197 24 208-15M50 149l4 7m32-9 4 6m32-8 4 6m32-8 4 6m32-8 4 6" stroke="#6a7f69" strokeWidth="2" />
        <path d="m39 102 144-11c13-1 21 8 21 18v22L36 145v-31c0-5 1-10 3-12Z" fill="#496b54" />
        <path d="m36 130 168-13m-157-12 147-11" stroke="#d4c7a6" strokeWidth="3" />
        {[54, 86, 118, 150].map((x, i) => <rect key={x} x={x} y={108 - i * 2.5} width="21" height="15" rx="2" fill="#d9dec9" transform={`rotate(-4 ${x} 110)`} />)}
        <circle cx="66" cy="144" r="7" fill="#384e3c" /><circle cx="177" cy="135" r="7" fill="#384e3c" />
        <path d="m23 72 8-5m1 10 16-9m162 2 11-6" stroke="#93a38b" strokeWidth="1.5" strokeLinecap="round" />
      </> : flower ? <>
        <path d="M79 149v-47l47-31 45 31v44" fill="#f5eddc" stroke="#8b987a" strokeWidth="2" />
        <path d="m68 103 58-40 56 40" stroke="#4a6650" strokeWidth="7" strokeLinecap="round" />
        <path d="M114 147v-33h24v33" fill="#7d8b6b" />
        <path d="M92 109h12v17H92Z" fill="#c9c4a3" />
        <path d="M49 151c9-42 6-87-11-109m13 69 29-31M48 83 22 67" stroke="#787c55" strokeWidth="4" strokeLinecap="round" />
        {[[34, 44], [25, 63], [50, 60], [66, 75], [18, 88], [40, 97], [78, 88]].map(([x, y]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="17" ry="12" fill="#708b64" opacity=".78" />)}
        {[[25, 49], [41, 64], [58, 84], [32, 89], [78, 83]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#e4bc68" />)}
      </> : dinner ? <>
        <ellipse cx="120" cy="126" rx="79" ry="30" fill="#986947" />
        <path d="M48 130v12c43 23 99 23 145-2v-12" fill="#815d44" />
        <ellipse cx="122" cy="124" rx="32" ry="11" fill="#f7f0dd" /><ellipse cx="122" cy="122" rx="24" ry="7" fill="#80916a" />
        <path d="M61 105h28c-1 21-24 20-28 0Zm95 10h28c-1 21-24 20-28 0Z" fill="#fcf7e9" />
        <path d="m54 129 31 12m-32-7 31 12m82-43 18 9m-19-5 18 9" stroke="#b9af8d" strokeWidth="2" />
        <path d="M112 98c-13-12 13-17 0-28m16 29c-13-12 13-17 0-28" stroke="#8c937a" strokeWidth="1.5" opacity=".6" />
      </> : <>
        <circle cx="62" cy="124" r="29" stroke="#506852" strokeWidth="3" /><circle cx="178" cy="124" r="29" stroke="#506852" strokeWidth="3" />
        <path d="m62 124 40-53 25 53H62Zm65 0 30-49-55-4m55 4 21 49m-26-62 9 26m-10-26 20-6m-80 7h27" stroke="#536d55" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m92 65 10 6m25 53 10 12m-4 0h12M166 59l23-1" stroke="#9e7651" strokeWidth="4" strokeLinecap="round" />
        <path d="m65 47 6-15m7 18 12-9" stroke="#a5a890" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      <path d="M16 168c62 3 136-3 207-4" stroke="#718065" strokeWidth="1" opacity=".35" />
    </svg>
  );
}
