import type { CSSProperties } from 'react';

/** Quattro fasi, ognuna leggibile in tre battute: un solo segno, dodici passi. */
export function GenerationDial({ done, total }: { done: number; total: number }) {
  const completed = total > 0 ? Math.min(12, Math.floor((done / total) * 12)) : 0;

  return (
    <span className="generation-dial" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <i
          key={index}
          className={`${index < completed ? 'is-done' : ''} ${index === completed && completed < 12 ? 'is-current' : ''} ${index % 3 === 0 ? 'is-phase' : ''}`}
          style={{ '--dial-index': index } as CSSProperties}
        />
      ))}
    </span>
  );
}
