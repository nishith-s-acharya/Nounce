import { useCallback } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';
import type { ExecuteResponse } from '@/lib/executor/types';

export function useExecution() {
  const setTrace = useVisualizerStore((s) => s.setTrace);
  const setStatus = useVisualizerStore((s) => s.setStatus);
  const setError = useVisualizerStore((s) => s.setError);
  const language = useVisualizerStore((s) => s.language);

  const run = useCallback(
    async (code: string) => {
      setStatus('running');
      setError(null);
      try {
        const res = await fetch('/api/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, language }),
        });
        const data = (await res.json()) as ExecuteResponse;
        if (data.error) {
          setError(data.error.message);
          setTrace(data.trace ?? []);
          return data;
        }
        setTrace(data.trace);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
        return null;
      }
    },
    [setError, setStatus, setTrace, language]
  );

  return { run };
}
