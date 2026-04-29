import { useEffect } from 'react';
import { useVisualizerStore } from '@/store/visualizerStore';

export function useTracePlayback() {
  const isPlaying = useVisualizerStore((s) => s.isPlaying);
  const speedMs = useVisualizerStore((s) => s.speedMs);
  const stepForward = useVisualizerStore((s) => s.stepForward);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      stepForward();
    }, speedMs);
    return () => clearInterval(id);
  }, [isPlaying, speedMs, stepForward]);
}
