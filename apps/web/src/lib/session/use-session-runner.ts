"use client";

import type { SessionEvent, SessionState, SrConfig } from "@keepsake/core/sr";
import { useEffect, useRef, useState } from "react";
import { SessionRunner } from "./runner";

/**
 * React binding for `SessionRunner` — instantiated once per mount with real wall-clock deps.
 * The caller's `onChange` lives in a ref so a re-render never re-instantiates the runner.
 */
export function useSessionRunner(
  initial: SessionState,
  config: SrConfig,
  demoSpeed: number,
  onChange: (state: SessionState, event: SessionEvent) => void,
): { state: SessionState; currentWait: SessionRunner["currentWait"]; runner: SessionRunner } {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [, forceRender] = useState(0);
  const [runner] = useState(
    () =>
      new SessionRunner(initial, {
        now: () => Date.now(),
        setTimer: (ms, fn) => {
          const id = setTimeout(fn, ms);
          return () => clearTimeout(id);
        },
        demoSpeed,
        config,
        onChange: (state, event) => {
          onChangeRef.current(state, event);
          forceRender((n) => n + 1);
        },
      }),
  );

  useEffect(() => () => runner.dispose(), [runner]);

  return { state: runner.state, currentWait: runner.currentWait, runner };
}
