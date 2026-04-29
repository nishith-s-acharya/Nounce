'use client';

import { useVisualizerStore } from '@/store/visualizerStore';
import { cn } from '@/lib/utils';
import type { Language } from '@/lib/executor/types';

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'javascript', label: 'JS' },
  { id: 'java', label: 'Java' },
];

export function LanguageToggle() {
  const language = useVisualizerStore((s) => s.language);
  const setLanguage = useVisualizerStore((s) => s.setLanguage);

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5">
      {LANGUAGES.map((lang) => {
        const active = language === lang.id;
        return (
          <button
            key={lang.id}
            onClick={() => setLanguage(lang.id)}
            className={cn(
              'rounded px-3 py-1 text-xs font-medium transition-all',
              active
                ? 'bg-neon-cyan/15 text-neon-cyan shadow-neon-cyan'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
