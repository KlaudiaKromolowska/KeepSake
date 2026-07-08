import Link from "next/link";
import { WizardView } from "@/components/wizard/wizard-view";
import { requireUser } from "@/lib/actions";
import { WIZARD_COPY } from "@/lib/wizard/copy";

export const metadata = { title: WIZARD_COPY.page.title };

/**
 * Caregiver-facing target wizard. Light theme is forced on the container (`bg-white text-zinc-900`):
 * QA found a dark/light flash between screens, and this page must not depend on the OS scheme.
 */
export default async function NewTargetPage() {
  await requireUser();

  return (
    <main className="flex min-h-dvh flex-col items-center gap-8 bg-white px-6 py-10 text-zinc-900">
      <div className="flex w-full max-w-2xl flex-col gap-3">
        <Link
          href="/dashboard"
          className="text-base text-zinc-600 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {WIZARD_COPY.success.home}
        </Link>
        <h1 className="text-3xl font-semibold">{WIZARD_COPY.page.heading}</h1>
        <p className="text-lg text-zinc-700">{WIZARD_COPY.page.intro}</p>
      </div>

      <WizardView />
    </main>
  );
}
