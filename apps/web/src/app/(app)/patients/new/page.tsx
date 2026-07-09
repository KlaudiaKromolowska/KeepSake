import Link from "next/link";
import { NewPatientForm } from "@/components/patients/new-patient-form";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";

export const metadata = { title: "Add a person — Keepsake" };

/** Add another person to practise with (multi-patient). Auth via the (app) layout. */
export default async function NewPatientPage() {
  await requireUser();
  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-3xl font-semibold">Add a person</h1>
        <NewPatientForm />
        <Link
          href="/dashboard"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          Back to home
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
