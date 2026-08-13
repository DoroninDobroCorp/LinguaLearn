import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { formatCounterOutcome } from '../utils/outcomes';

const CATEGORY_OPTIONS = ['all', '1', '2', '3', '4', '5', '6', '7'];
const MODE_OPTIONS = ['all', 'live', 'prematch'];
const MARGIN_OPTIONS = ['all', 'calculated', 'fallback'];
const VERIFY_OPTIONS = ['all', 'OK', 'ODDS_CHANGE', 'UNAVAILABLE', 'ERROR'];

function fmtNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(2)}%`;
}

function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toneFor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < 0.00001) return '';
  return n > 0 ? 'positive' : 'negative';
}

const RESULT_LABELS = {
  pinnacle_win: 'Robin/Pinnacle won',
  donor_win: 'Donor won',
  void: 'Void',
};

function StatTile({ label, value, tone }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={`value ${tone || ''}`}>{value}</div>
    </div>
  );
}

function compactEventValue(event, field) {
  const fields = Array.isArray(field) ? field : [field];
  for (const key of fields) {
    const value = event?.[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'number') return Number.isFinite(value) ? value.toString() : '-';
    return String(value);
  }
  return '-';
}

function counterOutcomeFor(bookmaker, selection) {
  if (!selection) return '-';
  return formatCounterOutcome({ bk2: bookmaker, bk2_selection: selection });
}

function StatsRecordModal({ detail, loading, settling, onClose, onDownloadJsonl, onDownloadCsv, onSettle }) {
  const record = detail?.record || {};
  const priceChanges = detail?.price_changes || [];
  const rawEventsCount = detail?.events_count || 0;
  const priceChangesReady = Boolean(detail?.price_changes_ready);
  const settlementResult = record.settlement_result || '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal stats-detail-modal" onClick={(event) => event.stopPropagation()}>
        <h2>
          Virtual bet file
          <button className="modal-close" onClick={onClose}>×</button>
        </h2>

        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <span>Loading file...</span>
          </div>
        ) : (
          <>
            <div className="stats-detail-head">
              <div>
                <span>Record</span>
                <strong>{record.record_id}</strong>
              </div>
              <div>
                <span>Match</span>
                <strong>{record.match}</strong>
              </div>
              <div>
                <span>Market</span>
                <strong>{record.market} · {record.selection}</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{record.robin_price_source || '-'}</strong>
              </div>
              <div>
                <span>Pinnacle</span>
                <strong>{record.pin_odds_verified || record.pin_odds_forted || '-'}</strong>
              </div>
              <div>
                <span>Robin offer</span>
                <strong>{record.robin_odds || '-'}</strong>
              </div>
              <div>
                <span>Donor</span>
                <strong>{record.counter_bookmaker || '-'} · {record.counter_odds || '-'} · {counterOutcomeFor(record.counter_bookmaker, record.counter_selection)}</strong>
              </div>
              <div>
                <span>Result</span>
                <strong>{RESULT_LABELS[settlementResult] || 'Open'}</strong>
              </div>
            </div>

            <div className="stats-economy-grid">
              <StatTile label="Turnover" value={fmtMoney(record.virtual_turnover)} />
              <StatTile label="Robin stake" value={fmtMoney(record.robin_stake)} />
              <StatTile label="Donor stake" value={fmtMoney(record.donor_stake)} />
              <StatTile label="Client arb P/L" value={fmtMoney(record.client_arb_profit)} tone={toneFor(record.client_arb_profit)} />
              <StatTile label="Donor-only P/L" value={fmtMoney(record.client_donor_only_profit)} tone={toneFor(record.client_donor_only_profit)} />
              <StatTile label="Robin house P/L" value={fmtMoney(record.robin_house_profit)} tone={toneFor(record.robin_house_profit)} />
              <StatTile label="House ROI" value={fmtPct(record.robin_house_roi_pct)} tone={toneFor(record.robin_house_roi_pct)} />
            </div>

            <div className="stats-settlement-actions">
              <span>Set result</span>
              <button className="btn btn-link" disabled={settling} onClick={() => onSettle(record.record_id, 'pinnacle_win')}>
                Robin/Pinnacle won
              </button>
              <button className="btn btn-link" disabled={settling} onClick={() => onSettle(record.record_id, 'donor_win')}>
                Donor won
              </button>
              <button className="btn btn-link" disabled={settling} onClick={() => onSettle(record.record_id, 'void')}>
                Void
              </button>
              {settlementResult && (
                <button className="btn btn-link danger" disabled={settling} onClick={() => onSettle(record.record_id, 'clear')}>
                  Clear
                </button>
              )}
            </div>

            <div className="stats-detail-actions">
              <button className="btn btn-link" onClick={() => onDownloadJsonl(record.record_id)}>Download JSONL</button>
              <button className="btn btn-link" disabled={!priceChangesReady} onClick={() => onDownloadCsv(record.record_id)}>Download price CSV</button>
              <span>{priceChangesReady ? `${priceChanges.length} price rows` : 'monitoring in progress'} · {rawEventsCount} raw events{detail?.truncated ? ' · truncated' : ''}</span>
            </div>

            <div className="stats-detail-table-wrap">
              {priceChanges.length === 0 ? (
                <div className="empty-msg">{priceChangesReady ? 'No price changes recorded.' : 'Price CSV will appear after the observation window ends.'}</div>
              ) : (
                <table className="stats-table stats-detail-table">
                  <thead>
                    <tr>
                      <th>Change</th>
                      <th>Time</th>
                      <th>Elapsed</th>
                      <th>Status</th>
                      <th>Pinnacle</th>
                      <th>Last known</th>
                      <th>Robin offer</th>
                      <th>Donor</th>
                      <th>Source</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceChanges.map((event, idx) => (
                      <tr key={`${event.event || 'price'}-${event.timestamp || idx}-${idx}`}>
                        <td>{compactEventValue(event, 'event')}</td>
                        <td>{compactEventValue(event, 'timestamp')}</td>
                        <td>{compactEventValue(event, 'elapsed_sec')}</td>
                        <td>{compactEventValue(event, 'status')}</td>
                        <td className="mono-cell">{compactEventValue(event, ['pinnacle_price', 'price'])}</td>
                        <td className="mono-cell">{compactEventValue(event, ['pinnacle_last_known_price', 'last_known_price'])}</td>
                        <td className="mono-cell">{compactEventValue(event, 'robin_offered_odds')}</td>
                        <td>
                          <strong>{compactEventValue(event, 'counter_odds')}</strong>
                          <span>
                            {compactEventValue(event, 'counter_bookmaker')} · {counterOutcomeFor(
                              compactEventValue(event, 'counter_bookmaker'),
                              compactEventValue(event, 'counter_selection'),
                            )}
                          </span>
                        </td>
                        <td>{compactEventValue(event, 'source')}</td>
                        <td>
                          <span>{compactEventValue(event, 'detail')}</span>
                          <details>
                            <summary>Raw</summary>
                            <pre>{JSON.stringify(event, null, 2)}</pre>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Stats({ showToast }) {
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [detail, setDetail] = useState(null);
  const [filters, setFilters] = useState({
    category: 'all',
    mode: 'all',
    margin: 'all',
    verifyStatus: 'all',
    search: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getAdminStatsSummary(),
      api.getAdminStatsRecords(filters),
    ])
      .then(([summaryData, recordsData]) => {
        setSummary(summaryData);
        setRows(recordsData.records || []);
      })
      .catch((error) => showToast?.(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [filters, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const downloadCsv = async () => {
    setDownloading(true);
    try {
      await api.downloadAdminStatsCsv();
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setDownloading(false);
    }
  };

  const openRecord = async (recordId) => {
    setDetailLoading(true);
    setDetail({ record: { record_id: recordId }, price_changes: [], events: [] });
    try {
      const data = await api.getAdminStatsRecord(recordId);
      setDetail(data);
    } catch (error) {
      setDetail(null);
      showToast?.(error.message, 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const downloadRecordJsonl = async (recordId) => {
    try {
      await api.downloadAdminStatsRecordJsonl(recordId);
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  const downloadRecordCsv = async (recordId) => {
    try {
      await api.downloadAdminStatsRecordPriceCsv(recordId);
    } catch (error) {
      showToast?.(error.message, 'error');
    }
  };

  const settleRecord = async (recordId, result) => {
    if (!recordId) return;
    setSettling(true);
    try {
      await api.settleAdminStatsRecord(recordId, result);
      const [summaryData, recordsData, detailData] = await Promise.all([
        api.getAdminStatsSummary(),
        api.getAdminStatsRecords(filters),
        api.getAdminStatsRecord(recordId),
      ]);
      setSummary(summaryData);
      setRows(recordsData.records || []);
      setDetail(detailData);
      showToast?.('Stats result updated', 'success');
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setSettling(false);
    }
  };

  const byCategory = useMemo(() => summary?.by_category || {}, [summary]);
  const byMode = useMemo(() => summary?.by_mode || {}, [summary]);
  const settlement = summary?.settlement || {};

  return (
    <>
      <div className="page-header stats-header">
        <div>
          <h1>Stats · Virtual bets</h1>
          <p>Read-only collector output for margin checks and Pinnacle price drift.</p>
        </div>
        <div className="stats-actions">
          <button className="btn btn-link" onClick={loadData} disabled={loading}>Refresh</button>
          <button className="btn btn-primary" onClick={downloadCsv} disabled={downloading}>
            {downloading ? 'Downloading...' : 'Download CSV'}
          </button>
        </div>
      </div>

      <div className="stats-row">
        <StatTile label="Records" value={fmtNumber(summary?.total_records || 0, 0)} tone="robin" />
        <StatTile label="Unique matches" value={fmtNumber(summary?.unique_matches || 0, 0)} />
        <StatTile label="Live" value={fmtNumber(byMode.live || 0, 0)} />
        <StatTile label="Prematch" value={fmtNumber(byMode.prematch || 0, 0)} />
        <StatTile label="Margin calculated" value={fmtNumber(summary?.margin_calculated || 0, 0)} tone="positive" />
        <StatTile label="Fallback" value={fmtNumber(summary?.fallback || 0, 0)} />
      </div>

      <div className="stats-row stats-economy-summary">
        <StatTile label="Settled / open" value={`${fmtNumber(settlement.settled || 0, 0)} / ${fmtNumber(settlement.open || 0, 0)}`} />
        <StatTile label="Client arb ROI" value={fmtPct(settlement.client_arb_roi_pct)} tone={toneFor(settlement.client_arb_roi_pct)} />
        <StatTile label="Client arb P/L" value={fmtMoney(settlement.client_arb_profit)} tone={toneFor(settlement.client_arb_profit)} />
        <StatTile label="Donor-only ROI" value={fmtPct(settlement.client_donor_only_roi_pct)} tone={toneFor(settlement.client_donor_only_roi_pct)} />
        <StatTile label="Robin house ROI" value={fmtPct(settlement.robin_house_roi_pct)} tone={toneFor(settlement.robin_house_roi_pct)} />
        <StatTile label="House / turnover" value={fmtPct(settlement.robin_house_turnover_roi_pct)} tone={toneFor(settlement.robin_house_turnover_roi_pct)} />
      </div>

      <div className="stats-split">
        <div className="stats-panel">
          <div className="stats-panel-title">Categories</div>
          <div className="category-bars">
            {CATEGORY_OPTIONS.filter((c) => c !== 'all').map((category) => {
              const count = byCategory[category] || 0;
              const pct = summary?.total_records ? (count / summary.total_records) * 100 : 0;
              return (
                <div key={category} className="category-bar">
                  <span>Cat {category}</span>
                  <div><i style={{ width: `${Math.max(2, pct)}%` }} /></div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-panel-title">Price checkpoints</div>
          <div className="checkpoint-grid">
            <StatTile label="Live 20s" value={fmtNumber(summary?.checkpoints?.price_live_20s || 0, 0)} />
            <StatTile label="Live 2m" value={fmtNumber(summary?.checkpoints?.price_live_2m || 0, 0)} />
            <StatTile label="Prematch 2m" value={fmtNumber(summary?.checkpoints?.price_prematch_2m || 0, 0)} />
            <StatTile label="Prematch 20m" value={fmtNumber(summary?.checkpoints?.price_prematch_20m || 0, 0)} />
          </div>
        </div>
      </div>

      <div className="history-tabs stats-filters">
        <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
          {CATEGORY_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? 'All categories' : `Category ${value}`}</option>)}
        </select>
        <select value={filters.mode} onChange={(e) => setFilters((f) => ({ ...f, mode: e.target.value }))}>
          {MODE_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? 'All modes' : value}</option>)}
        </select>
        <select value={filters.margin} onChange={(e) => setFilters((f) => ({ ...f, margin: e.target.value }))}>
          {MARGIN_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? 'Margin + fallback' : value}</option>)}
        </select>
        <select value={filters.verifyStatus} onChange={(e) => setFilters((f) => ({ ...f, verifyStatus: e.target.value }))}>
          {VERIFY_OPTIONS.map((value) => <option key={value} value={value}>{value === 'all' ? 'All verify statuses' : value}</option>)}
        </select>
        <input
          type="search"
          placeholder="Search match, sport, market"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading stats...</span>
        </div>
      ) : rows.length === 0 ? (
        <p className="empty-msg">No records match the filters.</p>
      ) : (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Cat</th>
                <th>Mode</th>
                <th>Match</th>
                <th>Market</th>
                <th>Odds</th>
                <th>Edge</th>
                <th>Margin</th>
                <th>Verify</th>
                <th>20s / 2m / 20m</th>
                <th>Last</th>
                <th>Result</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.record_id}>
                  <td>{row.created_at?.replace('T', ' ').replace('Z', '')}</td>
                  <td>{row.category}</td>
                  <td>{row.mode}</td>
                  <td>
                    <strong>{row.match}</strong>
                    <span>{row.sport} · {row.league}</span>
                  </td>
                  <td>
                    <strong>{row.market}</strong>
                    <span>{row.selection}</span>
                  </td>
                  <td className="mono-cell">
                    <strong>P {row.pin_odds_verified || row.pin_odds_forted || '-'}</strong>
                    <span>R {row.robin_odds || '-'} · D {row.counter_odds || '-'}</span>
                  </td>
                  <td>
                    <strong>{fmtPct(row.forted_profit_pct)} Forted</strong>
                    <span>{fmtPct(row.robin_profit_pct)} Robin</span>
                  </td>
                  <td>
                    {row.margin_calculated === '1' ? 'calc' : 'fallback'}
                    <span>{row.robin_price_source}</span>
                  </td>
                  <td>{row.verify_status}</td>
                  <td className="mono-cell">
                    {[row.price_live_20s, row.price_live_2m || row.price_prematch_2m, row.price_prematch_20m].filter(Boolean).join(' / ') || '-'}
                  </td>
                  <td className="mono-cell">{row.last_price || '-'}{row.price_closed === '1' ? ' · closed' : ''}</td>
                  <td>
                    <strong>{RESULT_LABELS[row.settlement_result] || 'Open'}</strong>
                    <span>{row.settlement_result ? `${fmtMoney(row.client_arb_profit)} client · ${fmtMoney(row.robin_house_profit)} house` : 'not settled'}</span>
                  </td>
                  <td>
                    <button className="btn btn-link stats-open-file" onClick={() => openRecord(row.record_id)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <StatsRecordModal
          detail={detail}
          loading={detailLoading}
          onClose={() => setDetail(null)}
          onDownloadJsonl={downloadRecordJsonl}
          onDownloadCsv={downloadRecordCsv}
          onSettle={settleRecord}
          settling={settling}
        />
      )}
    </>
  );
}
