'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RoundStatus {
  status: 'open' | 'closed' | 'draft';
  name: string;
  competitors: string[];
}

export default function BallotPage() {
  const router = useRouter();
  const [round, setRound] = useState<RoundStatus | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [alreadyVoted, setAlreadyVoted] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then(r => r.json())
      .then(setRound);
  }, []);

  if (!round) return null;

  if (round.status !== 'open') {
    return (
      <div className="closed-msg">
        <h1>Voting is not open right now.</h1>
      </div>
    );
  }

  if (alreadyVoted) {
    return (
      <div className="closed-msg">
        <h1>You have already voted — thank you!</h1>
      </div>
    );
  }

  async function handleSubmit() {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitor: selected }),
      });
      if (res.status === 409) { setAlreadyVoted(true); return; }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Something went wrong.');
        return;
      }
      router.push('/thanks');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h1>{round.name}</h1>
      <p>Select your favourite and submit your vote.</p>
      {round.competitors.map(name => (
        <button
          key={name}
          className={`competitor-btn${selected === name ? ' selected' : ''}`}
          onClick={() => setSelected(name)}
        >
          {name}
        </button>
      ))}
      {error && <div className="error">{error}</div>}
      <button
        className="submit-btn"
        disabled={!selected || submitting}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting…' : 'Submit vote'}
      </button>
    </div>
  );
}
