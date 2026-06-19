import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { api } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useDialog } from '../../hooks/useDialog';
import RunList, { HistoryRun } from './RunList';
import RunDetail from './RunDetail';
import { dispatchHistoryReexecute } from './historyEvents';
import { downloadCsvFromBase64 } from '../../utils/csv';
import { getTypeFilters, type RunTypeId } from './runTypes';

const HISTORY_PAGE_SIZE = 50;

function toIsoForFilter(date: string): string | undefined {
  // Convert "YYYY-MM-DD" to a comparable ISO timestamp. We use the start
  // of the day for `from` and end of day for `to` to make the filter
  // inclusive from the user's perspective.
  if (!date) return undefined;
  return new Date(`${date}T00:00:00`).toISOString();
}

function endOfDayIso(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T23:59:59.999999`).toISOString();
}

export default function HistoryView() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const { confirm } = useDialog();
  const [runs, setRuns] = useState<HistoryRun[]>([]);
  const [selected, setSelected] = useState<HistoryRun | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeType, setActiveType] = useState<RunTypeId | 'all'>('all');
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [hasMoreRuns, setHasMoreRuns] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const reqId = useRef(0);
  const typeFilters = useMemo(() => getTypeFilters(t), [t]);

  const loadPage = useCallback(async (reset: boolean) => {
    const id = ++reqId.current;
    setLoadingRuns(true);
    try {
      const offset = reset ? 0 : runs.length;
      const params: { limit: number; offset: number; run_type?: string; date_from?: string; date_to?: string } = {
        limit: HISTORY_PAGE_SIZE + 1,
        offset,
      };
      if (activeType !== 'all') params.run_type = activeType;
      const isoFrom = toIsoForFilter(dateFrom);
      if (isoFrom) params.date_from = isoFrom;
      const isoTo = endOfDayIso(dateTo);
      if (isoTo) params.date_to = isoTo;
      const r = await api.historyList(params);
      if (id !== reqId.current) return;
      const page = (r.runs as HistoryRun[]).slice(0, HISTORY_PAGE_SIZE);
      const nextRuns = reset ? page : [...runs, ...page];
      setHasMoreRuns((r.runs as HistoryRun[]).length > HISTORY_PAGE_SIZE);
      setRuns(nextRuns);
      if (selected && !nextRuns.some((run) => run.id === selected.id)) setSelected(null);
    } catch {
      if (id === reqId.current) addToast({ message: t('history.errors.load'), type: 'error' });
    } finally {
      if (id === reqId.current) setLoadingRuns(false);
    }
    // We intentionally exclude `runs` from deps to avoid a feedback loop;
    // we compare it via a ref-style pattern by reading the closure snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeType, dateFrom, dateTo, runs, selected, t, addToast]);

  const refresh = useCallback(() => {
    void loadPage(true);
  }, [loadPage]);

  useEffect(() => {
    setSelectedIds(new Set());
    void loadPage(true);
  }, [activeType, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRuns = useMemo(() => {
    if (!searchQuery.trim()) return runs;
    const q = searchQuery.toLowerCase();
    return runs.filter((r) =>
      r.formato.toLowerCase().includes(q) ||
      r.patron.toLowerCase().includes(q) ||
      new Date(r.timestamp).toLocaleString().toLowerCase().includes(q)
    );
  }, [runs, searchQuery]);

  const reexecute = (run: HistoryRun) => {
    dispatchHistoryReexecute(run);
    addToast({ message: t('history.toasts.reexecute'), type: 'success' });
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const del = async (id: number) => {
    const ok = await confirm({
      title: t('history.confirmDelete.title'),
      description: t('history.confirmDelete.description'),
      type: 'destructive',
      confirmLabel: t('history.delete'),
    });
    if (!ok) return;
    try {
      await api.historyDelete(id);
      await refresh();
      if (selected?.id === id) setSelected(null);
      addToast({ message: t('history.toasts.deleted'), type: 'success' });
    } catch {
      addToast({ message: t('history.errors.delete'), type: 'error' });
    }
  };

  const delMany = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({
      title: t('history.confirmDeleteMany.title', { count: selectedIds.size }),
      description: t('history.confirmDeleteMany.description', { count: selectedIds.size }),
      type: 'destructive',
      confirmLabel: t('history.delete'),
    });
    if (!ok) return;
    try {
      const ids = Array.from(selectedIds);
      await api.historyDeleteMany(ids);
      await refresh();
      setSelectedIds(new Set());
      addToast({ message: t('history.toasts.deletedMany', { count: ids.length }), type: 'success' });
    } catch {
      addToast({ message: t('history.errors.delete'), type: 'error' });
    }
  };

  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      const params: { ids?: number[]; run_type?: string; date_from?: string; date_to?: string } = {};
      if (ids) {
        params.ids = ids;
      } else {
        if (activeType !== 'all') params.run_type = activeType;
        const isoFrom = toIsoForFilter(dateFrom);
        if (isoFrom) params.date_from = isoFrom;
        const isoTo = endOfDayIso(dateTo);
        if (isoTo) params.date_to = isoTo;
      }
      const result = await api.historyExport(params);
      const date = new Date().toISOString().slice(0, 10);
      downloadCsvFromBase64(`historial-${date}.csv`, result.csv);
      addToast({ message: t('history.toasts.exported', { count: result.count }), type: 'success' });
    } catch {
      addToast({ message: t('history.errors.export'), type: 'error' });
    } finally {
      setExporting(false);
    }
  };

  const hasActiveFilters = activeType !== 'all' || Boolean(dateFrom) || Boolean(dateTo);
  const clearAllFilters = () => {
    setActiveType('all');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Barra de herramientas superior */}
      <div className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-primary-glow)] text-[var(--accent-primary)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">{t('history.title')}</h2>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                {filteredRuns.length > 0
                  ? `${filteredRuns.length} ${filteredRuns.length === 1 ? 'ejecución' : 'ejecuciones'}`
                  : t('history.noRuns')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('history.search.placeholder')}
                className="w-56 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 pl-9 pr-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all focus:border-[var(--accent-primary)] focus:outline-none focus:shadow-[0_0_0_3px_var(--accent-primary-glow)]"
              />
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[12px] font-medium transition-all ${
                filtersOpen || hasActiveFilters
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-glow)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)]'
              }`}
              title="Filtros"
            >
              <SlidersHorizontal size={14} strokeWidth={2} />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent-primary)] px-1 text-[10px] font-bold text-[var(--text-on-accent)]">
                  {(activeType !== 'all' ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)}
                </span>
              )}
            </button>

            <button
              onClick={() => void exportCsv()}
              disabled={exporting}
              data-testid="history-export-csv"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 text-[12px] font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--border-medium)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              title={t('history.actions.exportCsv')}
            >
              <Download size={14} strokeWidth={2} />
              <span className="hidden sm:inline">{exporting ? t('history.exporting') : t('history.actions.exportCsv')}</span>
            </button>
          </div>
        </div>

        {/* Panel de filtros desplegable */}
        {filtersOpen && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1 flex-wrap rounded-full bg-[var(--bg-base)] p-1 border border-[var(--border-subtle)]">
              {typeFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setActiveType(filter.value)}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-all ${
                    activeType === filter.value
                      ? 'bg-[var(--accent-primary)] text-[var(--text-on-accent)] shadow-sm'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <label className="flex items-center gap-1.5">
                <span>{t('history.filters.from')}</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
              <span className="text-[var(--text-muted)]">→</span>
              <label className="flex items-center gap-1.5">
                <span>{t('history.filters.to')}</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1 text-[11px] text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </label>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
                >
                  <X size={11} strokeWidth={2} />
                  {t('history.filters.clearDates')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Barra de seleccion masiva */}
      {selectedIds.size > 0 && (
        <div
          data-testid="history-bulk-bar"
          className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--accent-primary-glow)] px-5 py-2.5"
        >
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent-primary)] px-2 text-[11px] font-bold text-[var(--text-on-accent)]">
                {selectedIds.size}
              </span>
              <span className="font-medium">{t('history.selection.count', { count: selectedIds.size })}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void delMany()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--accent-red)]/30 bg-[color:var(--accent-red)]/10 px-3 py-1.5 text-[11px] font-medium text-[var(--accent-red)] transition-colors hover:bg-[color:var(--accent-red)]/20"
              >
                <Trash2 size={12} strokeWidth={2} />
                {t('history.actions.deleteSelected', { count: selectedIds.size })}
              </button>
              <button
                onClick={clearSelection}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <X size={12} strokeWidth={2} />
                {t('history.actions.clearSelection')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cuerpo: lista + detalle */}
      <div className="flex flex-1 min-h-0">
        <div className="w-[300px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <RunList
              runs={filteredRuns}
              selected={selected}
              onSelect={setSelected}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
            />
          </div>
          <div className="shrink-0 border-t border-[var(--border-subtle)] px-4 py-3">
            {hasMoreRuns && (
              <button
                onClick={() => void loadPage(false)}
                disabled={loadingRuns}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] font-medium text-[var(--text-secondary)] transition-all hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingRuns ? t('history.loading') : t('history.loadMore')}
              </button>
            )}
            {loadingRuns && runs.length === 0 && (
              <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">{t('history.loadingRuns')}</p>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--bg-base)] min-h-0">
          {selected ? (
            <RunDetail
              run={selected}
              onReexecute={() => reexecute(selected)}
              onDelete={() => del(selected.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center animate-fade-in">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-[var(--accent-primary-glow)] blur-xl opacity-60" aria-hidden="true" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
              </div>
              <p className="text-[14px] font-medium text-[var(--text-secondary)]">{t('history.empty')}</p>
              <p className="mt-1 text-[12px] text-[var(--text-muted)]">Selecciona una ejecución del listado para revisar su detalle</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
