import { FOOTER_COPY } from "@/lib/copy";

/**
 * "Not a medical device" + crisis-resource footer (PLAN.md §10/§12) for caregiver-facing pages.
 * Deliberately absent from /session: mid-session screens are patient-facing kiosk UI that must stay
 * calm and distraction-free, and every path into a session passes a page that carries this footer.
 */
export function SiteFooter() {
  return (
    <footer className="w-full border-t border-zinc-200 bg-white px-6 py-5">
      <div className="mx-auto flex max-w-2xl flex-col gap-1 text-center text-sm leading-relaxed text-zinc-500">
        <p>{FOOTER_COPY.notMedical}</p>
        <p>{FOOTER_COPY.crisis}</p>
      </div>
    </footer>
  );
}
