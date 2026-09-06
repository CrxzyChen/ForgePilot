import { Copy, Maximize2, Minimize, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { StudioWindowState } from '../contracts.ts';

export function WindowControls() {
  const [state, setState] = useState<StudioWindowState>({
    maximized: false,
    fullScreen: false,
  });

  useEffect(() => {
    void window.aiGameStudio.window.getState().then((result) => {
      if (result.ok) setState(result.value);
    });
    return window.aiGameStudio.window.onState(setState);
  }, []);

  return (
    <div className="window-controls" aria-label="窗口控制">
      <button
        type="button"
        title="最小化"
        aria-label="最小化窗口"
        onClick={() => void window.aiGameStudio.window.minimize()}
      >
        <Minimize />
      </button>
      <button
        type="button"
        title={state.maximized ? '还原' : '最大化'}
        aria-label={state.maximized ? '还原窗口' : '最大化窗口'}
        onClick={() => void window.aiGameStudio.window.toggleMaximize()}
      >
        {state.maximized ? <Copy /> : <Maximize2 />}
      </button>
      <button
        type="button"
        className="window-close"
        title="关闭"
        aria-label="关闭窗口"
        onClick={() => void window.aiGameStudio.window.close()}
      >
        <X />
      </button>
    </div>
  );
}
