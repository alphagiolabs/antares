import { Search } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { TechnicalReportListItem } from './types';

interface Props {
  reports: TechnicalReportListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// perf-10: react-window v2 List. tr-list-item is a 2-row grid (~60px); the
// sub line (codigo_infraestructura) can wrap to ~76px, so 76px fits both with no
// clipping. Falls back to the original flat map when the container has no measured
// height (jsdom/tests / pre-measurement), so existing tests that assert on rendered
// rows keep working unchanged.
const ITEM_HEIGHT = 76;

interface ReportRowData {
  reports: TechnicalReportListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface ReportRowProps {
  report: TechnicalReportListItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  style?: CSSProperties;
}

const ReportRow = memo(function ReportRow({ report, isSelected, onSelect, style }: ReportRowProps) {
  return (
    <button
      className={`tr-list-item ${isSelected ? 'active' : ''}`}
      onClick={() => onSelect(report.id)}
      style={style}
    >
      <span className="tr-list-code">#{report.metadata.informe_id}</span>
      <span className="tr-list-main">{report.header.cs || 'Sin C.S.'}</span>
      <span className="tr-list-sub">{report.header.codigo_infraestructura || report.id}</span>
      <span className={`tr-status ${report.status}`}>{report.status === 'completed' ? 'Listo' : 'Borrador'}</span>
    </button>
  );
});

const ReportRowV2 = memo(function ReportRowV2({
  index,
  style,
  reports,
  selectedId,
  onSelect,
}: { index: number; style: CSSProperties; ariaAttributes: unknown } & ReportRowData) {
  const report = reports[index];
  return (
    <div style={style}>
      <ReportRow report={report} isSelected={selectedId === report.id} onSelect={onSelect} style={{ marginBottom: 0 }} />
    </div>
  );
});

export default function DatabasePanel({ reports, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [cs, setCs] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
      }
    };
    measure();
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const csOptions = useMemo(() => {
    return [...new Set(reports.map((report) => report.header.cs).filter(Boolean))].sort();
  }, [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesCs = !cs || report.header.cs === cs;
      const matchesQuery = !q
        || report.id.toLowerCase().includes(q)
        || String(report.metadata.informe_id).includes(q)
        || report.header.cs.toLowerCase().includes(q)
        || report.header.codigo_infraestructura.toLowerCase().includes(q);
      return matchesCs && matchesQuery;
    });
  }, [reports, query, cs]);

  const rowProps = useMemo<ReportRowData>(
    () => ({ reports: filtered, selectedId, onSelect }),
    [filtered, selectedId, onSelect],
  );

  return (
    <aside className="tr-panel tr-database">
      <div className="tr-panel-header">
        <div>
          <p className="tr-eyebrow">Base local</p>
          <h2>{reports.length} informes</h2>
        </div>
      </div>

      <div className="tr-filter-block">
        <label className="tr-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar informe" />
        </label>
        <select value={cs} onChange={(event) => setCs(event.target.value)}>
          <option value="">Todos los C.S.</option>
          {csOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </div>

      <div className="tr-list">
        <div ref={containerRef} className="h-full w-full">
          {filtered.length === 0 ? (
            <div className="tr-empty">No hay informes para mostrar</div>
          ) : size ? (
            <List
              rowComponent={ReportRowV2 as (props: RowComponentProps<ReportRowData>) => ReactElement | null}
              rowCount={filtered.length}
              rowHeight={ITEM_HEIGHT}
              rowProps={rowProps}
              defaultHeight={size.h}
              overscanCount={5}
              className="custom-scrollbar"
            />
          ) : (
            filtered.map((report) => (
              <ReportRow
                key={report.id}
                report={report}
                isSelected={selectedId === report.id}
                onSelect={onSelect}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}
