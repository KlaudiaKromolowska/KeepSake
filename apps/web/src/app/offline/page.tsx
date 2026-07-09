/**
 * Static offline-fallback shell — the ONLY page response the service worker ever caches (PWA,
 * V3). Deliberately holds no patient/session data: it's served when a navigation fetch fails
 * while offline, so it must be safe to cache for every user.
 */
export default function OfflinePage() {
  return (
    <section className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center text-zinc-900">
      <h1 className="text-3xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-md text-xl text-zinc-700">
        Keepsake can&apos;t reach the network right now. Anything already open in a session is saved
        locally and will sync automatically once you&apos;re back online.
      </p>
    </section>
  );
}
