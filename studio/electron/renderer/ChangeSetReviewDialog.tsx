import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StudioChangeSet } from '../../workspace/studio-change-set-service.ts';

export function ChangeSetReviewDialog({
  change,
  onSubmit,
  onClose,
}: {
  change: StudioChangeSet;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supplement = change.status === 'rejected';
  useEffect(() => {
    const previousFocus = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    // React autoFocus runs before a closed native dialog becomes interactive.
    reasonInput.current?.focus();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  const submit = async () => {
    if (submitting.current || !reason.trim() || reason.trim().length > 4096)
      return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="studio-text-dialog studio-change-review-dialog"
      aria-labelledby="change-review-title"
      aria-describedby="change-review-help"
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting.current) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header>
          <strong id="change-review-title">
            {supplement ? '补充审核意见' : '拒绝变更集'}
          </strong>
          <button
            type="button"
            disabled={pending}
            aria-label="取消审核反馈"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        <div className="change-review-context">
          <strong>{change.summary}</strong>
          <code>{change.id}</code>
          <small>提案版本 {change.proposalHash.slice(0, 12)}</small>
          <p id="change-review-help">
            意见将绑定此版本，供 Copilot
            读取并修正。不会应用文件、启动任务或改变授权；提交后保留为审核历史。
          </p>
        </div>
        <label htmlFor="change-review-reason">
          <span>审核意见</span>
          <textarea
            ref={reasonInput}
            id="change-review-reason"
            autoFocus
            required
            maxLength={4096}
            disabled={pending}
            value={reason}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? 'change-review-error' : 'change-review-count'
            }
            placeholder="说明哪里不符合预期、失败证据，以及需要怎样修正。"
            onChange={(event) => setReason(event.target.value)}
          />
          <small id="change-review-count">{reason.length} / 4096</small>
        </label>
        {error && (
          <p
            id="change-review-error"
            className="change-review-error"
            role="alert"
          >
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={pending} onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            disabled={pending || !reason.trim() || reason.trim().length > 4096}
          >
            {pending ? '保存反馈…' : supplement ? '保存审核意见' : '拒绝并反馈'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
