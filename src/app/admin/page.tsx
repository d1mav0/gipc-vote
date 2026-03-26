'use client';

import { useEffect, useState, useCallback } from 'react';

interface Location {
  code: string;
  count: number;
  excluded: boolean;
}

interface RoundData {
  name: string;
  status: 'draft' | 'open' | 'closed';
  competitors: string[];
  excludedCountries: string[];
  counts: Record<string, number>;
  total: number;
  totalRaw: number;
  locations: Location[];
}

function countryName(code: string): string {
  if (!code) return 'Unknown';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code; }
  catch { return code; }
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E0 + c.charCodeAt(0) - 65));
}

export default function AdminPage() {
  const [authed, setAuthed]         = useState(false);
  const [password, setPassword]     = useState('');
  const [loginError, setLoginError] = useState('');
  const [round, setRound]           = useState<RoundData | null>(null);
  const [loading, setLoading]       = useState(false);
  const [roundName, setRoundName]   = useState('');
  const [competitorText, setCompetitorText] = useState('');
  const [setupError, setSetupError] = useState('');

  const fetchRound = useCallback(async () => {
    const res = await fetch('/api/admin/round');
    if (res.status === 401) { setAuthed(false); return; }
    const data = await res.json();
    setRound(data.round);
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetchRound();
    const interval = setInterval(fetchRound, 3000);
    return () => clearInterval(interval);
  }, [authed, fetchRound]);

  async function login() {
    setLoginError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) { setLoginError('Wrong password.'); return; }
    setAuthed(true);
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
    setRound(null);
  }

  async function createRound() {
    setSetupError('');
    const competitors = competitorText.split('\n').map(s => s.trim()).filter(Boolean);
    if (!roundName.trim() || competitors.length === 0) {
      setSetupError('Enter a round name and at least one competitor.');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/admin/round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roundName.trim(), competitors }),
    });
    setLoading(false);
    if (!res.ok) { setSetupError('Failed to create round.'); return; }
    await fetchRound();
  }

  async function openVoting()  { await fetch('/api/admin/open',  { method: 'POST' }); await fetchRound(); }
  async function closeVoting() { await fetch('/api/admin/close', { method: 'POST' }); await fetchRound(); }

  async function toggleExclusion(code: string, currentlyExcluded: boolean) {
    await fetch('/api/admin/exclusions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: code, action: currentlyExcluded ? 'include' : 'exclude' }),
    });
    await fetchRound();
  }

  // ── Login ──
  if (!authed) {
    return (
      <div className="card" style={{ maxWidth: 360 }}>
        <h1>Admin</h1>
        <p>Enter the admin password to continue.</p>
        <input className="input" type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()} autoFocus />
        {loginError && <div className="error">{loginError}</div>}
        <div className="gap" />
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={login}>Sign in</button>
      </div>
    );
  }

  // ── Setup form ──
  if (!round) {
    return (
      <div className="card admin-layout">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1>New Round</h1>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
        <input className="input" type="text"
          placeholder="Round name (e.g. GIPC 2026 — Audience Favourite)"
          value={roundName} onChange={e => setRoundName(e.target.value)} />
        <textarea className="input"
          placeholder={"Competitor names, one per line:\nAlice Smith\nBob Jones\n..."}
          value={competitorText} onChange={e => setCompetitorText(e.target.value)} />
        {setupError && <div className="error">{setupError}</div>}
        <button className="btn btn-primary" onClick={createRound} disabled={loading}>
          {loading ? 'Saving…' : 'Create round'}
        </button>
      </div>
    );
  }

  // ── Control panel ──
  const maxVotes = Math.max(...Object.values(round.counts), 1);
  const sorted = [...round.competitors].sort((a, b) => (round.counts[b] ?? 0) - (round.counts[a] ?? 0));
  const excluded = round.totalRaw - round.total;

  return (
    <div className="card admin-layout">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>{round.name}</h1>
        <button className="btn btn-ghost" onClick={logout}>Log out</button>
      </div>

      {/* Status bar */}
      <div className="row" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
        <span className={`badge badge-${round.status}`}>{round.status}</span>
        <span style={{ color: '#888', fontSize: '0.9rem' }}>
          {round.total} vote{round.total !== 1 ? 's' : ''}
          {excluded > 0 && <span style={{ color: '#e67e22' }}> · {excluded} excluded</span>}
        </span>
        <div style={{ flex: 1 }} />
        {round.status === 'draft'  && <button className="btn btn-success" onClick={openVoting}>Open voting</button>}
        {round.status === 'open'   && <button className="btn btn-danger"  onClick={closeVoting}>Close voting</button>}
        {round.status === 'closed' && <button className="btn btn-ghost"   onClick={() => setRound(null)}>New round</button>}
      </div>

      {/* Results */}
      {sorted.map(name => {
        const count = round.counts[name] ?? 0;
        const pct = Math.round((count / maxVotes) * 100);
        return (
          <div key={name} className="results-row">
            <span className="results-name">{name}</span>
            <div className="results-bar-wrap">
              <div className="results-bar" style={{ width: `${pct}%` }} />
            </div>
            <span className="results-count">{count}</span>
          </div>
        );
      })}

      {/* Locations */}
      {round.locations.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#6c63ff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.75rem' }}>
            Votes by location
          </div>
          {round.locations.map(loc => (
            <div key={loc.code || 'unknown'} style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.45rem 0', borderBottom: '1px solid #252836',
              opacity: loc.excluded ? 0.5 : 1,
            }}>
              <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{countryFlag(loc.code)}</span>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>
                {countryName(loc.code)}
                {loc.code && <span style={{ color: '#666', marginLeft: '0.4rem', fontSize: '0.78rem' }}>{loc.code}</span>}
              </span>
              <span style={{ fontSize: '0.9rem', color: '#aaa', minWidth: 28, textAlign: 'right' }}>{loc.count}</span>
              <button
                onClick={() => toggleExclusion(loc.code, loc.excluded)}
                style={{
                  padding: '0.2rem 0.6rem', borderRadius: 99, fontSize: '0.75rem',
                  fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: loc.excluded ? '#555' : '#27ae60',
                  color: '#fff', minWidth: 64,
                }}
              >
                {loc.excluded ? 'excluded' : 'included'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
