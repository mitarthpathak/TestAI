'use client';

import { useEffect, useRef, useState } from 'react';
import { PART_IDS } from '@/src/ultron/registry';

export default function UltronStage() {
  const ref = useRef(null);
  const [status, setStatus] = useState(() => Object.fromEntries(PART_IDS.map((id) => [id, 'pending'])));
  const [done, setDone] = useState(false);
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    let stage = null;
    let cancelled = false;
    (async () => {
      const { createStage, readFlags } = await import('@/src/ultron/stage');
      if (cancelled) return;
      const flags = readFlags(window.location.search);
      setCapture(flags.capture);
      stage = await createStage(ref.current, {
        flags,
        onStatus: (ev, u) => {
          if (ev.type === 'status') setStatus({ ...u.status });
          if (ev.type === 'done') setDone(true);
        },
      });
      if (cancelled) stage.dispose();
    })();
    return () => {
      cancelled = true;
      stage?.dispose();
    };
  }, []);

  return (
    <main className={capture ? 'capture' : ''}>
      <div className="stage" ref={ref} />
      <div className={`rail${done ? ' done' : ''}`} aria-hidden="true">
        {PART_IDS.map((id) => (
          <i key={id} data-s={status[id]} />
        ))}
      </div>
    </main>
  );
}
