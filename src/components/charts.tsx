// Gráficos ligeros en SVG/CSS (sin dependencias), renderizados en servidor.

export function Donut({ data, size = 140, label }: { data: { label: string; value: number; color: string }[]; size?: number; label?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 15.915; // circunferencia = 100
  let offset = 25;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox="0 0 42 42" role="img" aria-label={label}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="#efeff1" strokeWidth="5" />
        {total > 0 && data.map((d) => {
          const pct = (d.value / total) * 100;
          const el = pct > 0 ? (
            <circle key={d.label} cx="21" cy="21" r={r} fill="none" stroke={d.color} strokeWidth="5"
              strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`} strokeDashoffset={offset}>
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          ) : null;
          offset -= pct;
          return el;
        })}
        <text x="21" y="20.5" textAnchor="middle" className="fill-ink-900" style={{ fontSize: 7, fontWeight: 700 }}>{total}</text>
        <text x="21" y="26" textAnchor="middle" className="fill-ink-500" style={{ fontSize: 3 }}>tareas</text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-ink-600">{d.label}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Columns({ data, color = "#3b66f0", height = 120 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2" style={{ height: height + 24 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-medium tabular-nums text-ink-500">{d.value || ""}</span>
          <div className="w-full max-w-[36px] rounded-t-md" style={{ height: Math.max(2, (d.value / max) * height), background: d.value ? color : "#efeff1" }} title={`${d.label}: ${d.value}`} />
          <span className="text-[10px] text-ink-400">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function StackedBar({ segments, total }: { segments: { value: number; color: string; label: string }[]; total: number }) {
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
      {segments.map((s) => s.value > 0 && (
        <div key={s.label} style={{ width: `${(s.value / Math.max(1, total)) * 100}%`, background: s.color }} title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}
