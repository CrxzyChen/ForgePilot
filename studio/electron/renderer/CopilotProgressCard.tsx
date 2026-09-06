import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

export function CopilotProgressCard({
  summary,
  actions,
  children,
}: {
  summary: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <section
      className="copilot-progress-disclosure"
      data-expanded={expanded}
      aria-label="Goal / Plan"
    >
      <header className="copilot-progress-card-header">
        <button
          className="copilot-progress-toggle"
          aria-label="展开或收起 Goal / Plan 详情"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronRight />
          <span className="copilot-progress-summary">{summary}</span>
        </button>
        <div className="copilot-progress-actions">{actions}</div>
      </header>
      <div id={detailsId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
