"use client";

import type { SessionEvent, SessionState, SrConfig } from "@keepsake/core/sr";
import { useEffect, useRef, useState } from "react";
import { type CurrentWait, SessionRunner } from "./runner";

export interface SessionRunnerHandle {
  state: SessionState;
  currentWait: CurrentWait | null;
  runner: SessionRunner;
}

/**
 * React binding for `SessionRunner`. The runner is constructed inside a mount effect (not lazy
 * `useState`) so its timer is owned by the effect's lifecycle: under StrictMode's mount → unmount
 * → remount, the first runner is disposed by the cleanup before the second is created, so a
 * distractor-phase mount never leaks a live `setTimeout`. Returns `null` until the effect has run.
 */
export function useSessionRunner(
  initial: SessionState,
  config: SrConfig,
  demoSpeed: number,
  onChange: (state: SessionState, event: SessionEvent) => void,
): SessionRunnerHandle | null {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The runner is built once from the mount-time values; later prop changes must not rebuild it
  // (that would restart the session), so the construction inputs live in refs.
  const initialRef = useRef(initial);
  const configRef = useRef(config);
  const demoSpeedRef = useRef(demoSpeed);

  const [runner, setRunner] = useState<SessionRunner | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const r = new SessionRunner(initialRef.current, {
      now: () => Date.now(),
      setTimer: (ms, fn) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      },
      demoSpeed: demoSpeedRef.current,
      config: configRef.current,
      onChange: (state, event) => {
        onChangeRef.current(state, event);
        forceRender((n) => n + 1);
      },
    });
    setRunner(r);
    return () => r.dispose();
  }, []);

  if (!runner) return null;
  return { state: runner.state, currentWait: runner.currentWait, runner };
}
