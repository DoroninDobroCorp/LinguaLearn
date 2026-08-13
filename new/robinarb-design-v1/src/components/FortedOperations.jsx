import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import BookmakerSwitch from './BookmakerSwitch';

const EMPTY_DRAFT = { sportsText: '', bookmakersText: '', mode: '', filterId: '' };

function splitFilterList(value) {
  return String(value || '')
    .split(/[;,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function draftFromFilters(filters) {
  return {
    sportsText: (filters?.sports || []).join(', '),
    bookmakersText: (filters?.bookmakers || []).join(', '),
    mode: String(filters?.mode || ''),
    filterId: String(filters?.filter_id || ''),
  };
}

export default function FortedOperations({ showToast }) {
  const [filters, setFilters] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = async ({ quiet = false } = {}) => {
    setLoading(true);
    try {
      const data = await api.getFortedFilters();
      setFilters(data.filters);
      setDraft(draftFromFilters(data.filters));
      if (!quiet) showToast?.('Forted settings synchronized', 'success');
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload({ quiet: true });
    // Initial operations snapshot only; later refreshes are explicit or follow
    // a profile switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSports = useMemo(
    () => new Set(splitFilterList(draft.sportsText).map((value) => value.toLowerCase())),
    [draft.sportsText],
  );
  const availableSports = filters?.available_sports || [];

  const updateDraftField = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  };

  const toggleSport = (sport) => {
    setDraft((current) => {
      const values = splitFilterList(current.sportsText);
      const normalized = sport.toLowerCase();
      const exists = values.some((value) => value.toLowerCase() === normalized);
      return {
        ...current,
        sportsText: (exists
          ? values.filter((value) => value.toLowerCase() !== normalized)
          : [...values, sport]
        ).join(', '),
      };
    });
  };

  const apply = async () => {
    const confirmed = window.confirm(
      'Apply global Forted intake settings? Scanner rows will be hidden until the new profile epoch is ready.',
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const data = await api.updateFortedFilters({
        sports: splitFilterList(draft.sportsText),
        bookmakers: splitFilterList(draft.bookmakersText),
        mode: draft.mode.trim() || undefined,
        filter_id: draft.filterId.trim() || undefined,
      });
      setFilters(data.filters);
      setDraft(draftFromFilters(data.filters));
      showToast?.('Forted intake updated; waiting for the matching data epoch', 'success');
    } catch (error) {
      showToast?.(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-operations">
      <section className="control-panel">
        <div className="control-panel-header">
          <div>
            <h3>Bookmaker profile</h3>
            <p>Global Forted profile. Scanner hides stale rows until the matching authoritative epoch arrives.</p>
          </div>
        </div>
        <BookmakerSwitch
          showToast={showToast}
          onSwitchComplete={() => reload({ quiet: true })}
        />
      </section>

      <section className="control-panel">
        <div className="control-panel-header">
          <div>
            <h3>Upstream Forted filters</h3>
            <p>Global intake scope. Apply reconnects the listener and temporarily clears incompatible Scanner rows.</p>
          </div>
          <div className="control-panel-meta">
            <span className="source-pill">Admin only</span>
            {filters && <span className="source-pill">mode {filters.mode}</span>}
          </div>
        </div>

        {loading && !filters ? (
          <div className="empty-msg">Loading Forted operations…</div>
        ) : (
          <>
            <div className="forted-grid">
              <label className="field-block field-block-wide">
                <span>Sports</span>
                <textarea
                  rows="2"
                  value={draft.sportsText}
                  onChange={updateDraftField('sportsText')}
                  placeholder="Tennis, Soccer, Basketball"
                />
                {availableSports.length > 0 && (
                  <div className="field-hint-box">
                    <div className="field-hint-title">Supported sports</div>
                    <div className="suggestion-chips">
                      {availableSports.map((sport) => (
                        <button
                          key={sport}
                          type="button"
                          className={`suggestion-chip ${selectedSports.has(sport.toLowerCase()) ? 'active' : ''}`}
                          onClick={() => toggleSport(sport)}
                        >
                          {sport}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </label>

              <label className="field-block field-block-wide">
                <span>Bookmakers</span>
                <textarea
                  rows="2"
                  value={draft.bookmakersText}
                  onChange={updateDraftField('bookmakersText')}
                  placeholder="bet365.com, leonbets.ru"
                />
              </label>

              <label className="field-block">
                <span>Mode</span>
                <input value={draft.mode} onChange={updateDraftField('mode')} placeholder="0" />
              </label>

              <label className="field-block">
                <span>Filter ID</span>
                <input value={draft.filterId} onChange={updateDraftField('filterId')} placeholder="5925" />
              </label>
            </div>

            {filters && (
              <div className="forted-summary">
                <span>Active: {filters.bookmakers_count} bookmakers</span>
                <span>{filters.sports_count} sports</span>
                <span>{filters.available_sports_count} supported sports</span>
                <span>filter {filters.filter_id}</span>
              </div>
            )}

            <div className="panel-actions">
              <button className="btn btn-primary" onClick={apply} disabled={saving || loading}>
                {saving ? 'Applying…' : 'Apply global intake'}
              </button>
              <button className="btn btn-link" onClick={() => reload()} disabled={saving || loading}>
                {loading ? 'Loading…' : 'Reload actual state'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
