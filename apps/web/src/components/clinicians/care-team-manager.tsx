"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { linkClinician, unlinkClinician } from "@/lib/clinicians/actions";
import { CLINICIAN_COPY as C } from "@/lib/clinicians/copy";
import type { CareTeamMember } from "@/lib/clinicians/load";

/**
 * Caregiver-facing care-team management for one patient: share the read-only trend view with a
 * clinician by email, and revoke it. Both actions are RLS/definer-guarded server-side; this only
 * drives them and refreshes the server-rendered member list on success.
 */
export function CareTeamManager({
  patientId,
  members,
}: {
  patientId: string;
  members: CareTeamMember[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function share(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await linkClinician({ patientId, email: email.trim() });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setEmail("");
      setMessage(C.manage.shared);
      router.refresh();
    });
  }

  function remove(clinicianId: string) {
    startTransition(async () => {
      await unlinkClinician({ patientId, clinicianId });
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <form onSubmit={share} className="flex flex-col gap-3">
        <label htmlFor="clinician-email" className="text-lg font-medium">
          {C.manage.emailLabel}
        </label>
        <input
          id="clinician-email"
          type="email"
          required
          autoComplete="off"
          placeholder={C.manage.emailPlaceholder}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
        />
        <button
          type="submit"
          disabled={isPending || email.trim().length === 0}
          className="h-[56px] w-full rounded-xl bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
        >
          {isPending ? C.manage.sharing : C.manage.shareButton}
        </button>
        {message && (
          <p role="status" className="text-lg text-zinc-700">
            {message}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{C.manage.currentHeading}</h2>
        {members.length === 0 ? (
          <p className="text-lg text-zinc-600">{C.manage.none}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li
                key={m.clinicianId}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
              >
                <span className="text-lg text-zinc-900">{m.email}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => remove(m.clinicianId)}
                  className="min-h-[40px] rounded-lg border border-zinc-300 px-4 text-base font-medium text-zinc-700 disabled:opacity-50"
                >
                  {isPending ? C.manage.removing : C.manage.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
