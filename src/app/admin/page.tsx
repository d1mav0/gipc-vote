'use client';

import { useEffect, useState, useCallback } from 'react';

interface RoundData {
  name: string;
  status: 'draft' | 'open' | 'closed';
  competitors: string[];
  counts: Record<string, number>;
  total: number;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [round, setRound] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(false);

  // Setup form
  const [roundName, setRoundName] = useState('');
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
    const competitors = competitorText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);
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

  async function openVoting() {
    await fetch('/api/admin/open', { method: 'POST' });
    await fetchRound();
  }

  async function closeVoting() {
    await fetch('/api/admin/close', { method: 'POST' });
    await fetchRound();
  }

  // ── Login screen ──
  if (!authed) {
    return (
      <div className="card" style={{ maxWidth: 360 }}>
        <h1>Admin</h1>
        <p>Enter the admin password to continue.</p>
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus
        />
        {loginError && <div className="error">{loginError}</div>}
        <div className="gap" />
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={login}>Sign in</button>
      </div>
    );
  }

  // ── No round yet — setup form ──
  if (!round) {
    return (
      <div className="card admin-layout">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1>New Round</h1>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
        <input
          className="input"
          type="text"
          placeholder="Round name (e.g. GIPC 2026 — Audience Favourite)"
          value={roundName}
          onChange={e => setRoundName(e.target.value)}
        />
        <textarea
          className="input"
          placeholder={"Competitor names, one per line:\nAlice Smith\nBob Jones\n..."}
          value={competitorText}
          onChange={e => setCompetitorText(e.target.value)}
        />
        {setupError && <div className="error">{setupError}</div>}
        <button className="btn btn-primary" onClick={createRound} disabled={loading}>
          {loading ? 'Saving…' : 'Create round'}
        </button>
      </div>
    );
  }

  // ── Round exists — control panel ──
  const maxVotes = Math.max(...Object.values(round.counts), 1);
  const sorted = [...round.competitors].sort((a, b) => (round.counts[b] ?? 0) - (round.counts[a] ?? 0));

  return (
    <div className="card admin-layout">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>{round.name}</h1>
        <button className="btn btn-ghost" onClick={logout}>Log out</button>
      </div>

      <div className="row" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
        <span className={`badge badge-${round.status}`}>{round.status}</span>
        <span style={{ color: '#888', fontSize: '0.9rem' }}>{round.total} vote{round.total !== 1 ? 's' : ''}</span>
        <div style={{ flex: 1 }} />
        {round.status === 'draft' && <button className="btn btn-success" onClick={openVoting}>Open voting</button>}
        {round.status === 'open'  && <button className="btn btn-danger"  onClick={closeVoting}>Close voting</button>}
        {round.status === 'closed' && (
          <button className="btn btn-ghost" onClick={() => setRound(null)}>New round</button>
        )}
      </div>

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
    </div>
  );
}
