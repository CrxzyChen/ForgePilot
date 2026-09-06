import { ArrowDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Own scrolling independently of streaming state and unrelated workspace updates. */
export function CopilotTranscript({
  children,
  firstEntryId,
}: {
  children: ReactNode;
  firstEntryId?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const previous = useRef({ firstEntryId, firstOffset: 0, top: 0 });
  const [atBottom, setAtBottom] = useState(true);
  const bottom = () => {
    const element = viewport.current;
    if (!element) return;
    following.current = true;
    element.scrollTop = element.scrollHeight;
    previous.current.top = element.scrollTop;
    setAtBottom(true);
  };
  useLayoutEffect(() => {
    const element = viewport.current!;
    if (following.current) bottom();
    else if (
      previous.current.firstEntryId &&
      previous.current.firstEntryId !== firstEntryId
    ) {
      // Anchor the existing message, not the total height: an active reply may
      // grow at the same time as older history is prepended.
      const anchor = Array.from(
        content.current!.querySelectorAll<HTMLElement>(
          '[data-transcript-entry]',
        ),
      ).find(
        (entry) =>
          entry.dataset.transcriptEntry === previous.current.firstEntryId,
      );
      if (anchor)
        element.scrollTop =
          previous.current.top +
          anchor.offsetTop -
          previous.current.firstOffset;
    }
    previous.current = {
      firstEntryId,
      firstOffset:
        content.current!.querySelector<HTMLElement>('[data-transcript-entry]')
          ?.offsetTop ?? 0,
      top: element.scrollTop,
    };
  }, [children, firstEntryId]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      if (following.current) bottom();
    });
    observer.observe(viewport.current!);
    observer.observe(content.current!);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="copilot-conversation">
      <div
        className="copilot-transcript"
        ref={viewport}
        onScroll={() => {
          const element = viewport.current!;
          const pinned =
            element.scrollHeight - element.clientHeight - element.scrollTop <=
            24;
          following.current = pinned;
          previous.current.top = element.scrollTop;
          setAtBottom(pinned);
        }}
      >
        <div ref={content}>{children}</div>
      </div>
      {!atBottom && (
        <button
          className="copilot-jump-bottom"
          onClick={bottom}
          title="回到最新消息并跟随更新"
        >
          <ArrowDown /> 回到底部
        </button>
      )}
    </div>
  );
}
