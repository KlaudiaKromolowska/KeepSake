// Kiosk sound toggle — some rooms (and demo cameras) need silence. Fixed top-right so it is
// reachable from every session screen without being part of any screen's focus flow.

const TOGGLE_COPY = { on: "Sound on", off: "Sound off" } as const;

export function NarrationToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted}
      className="fixed right-4 top-4 z-20 min-h-[64px] min-w-[64px] rounded-2xl border-2 border-zinc-500 bg-white px-6 text-xl font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
    >
      {muted ? TOGGLE_COPY.off : TOGGLE_COPY.on}
    </button>
  );
}
