"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrgPatient } from "@/lib/orgs/actions";
import { ORG_COPY as C } from "@/lib/orgs/copy";

/**
 * Admin-only "add a person" to a care home. Name only — timezone is read from the browser and
 * etiology defaults to 'unspecified' (§10 keeps disease naming out of the basic add flow, same as the
 * solo caregiver's add-patient form). The person is org-owned (no personal caregiver_id).
 */
export function CreateOrgPatientForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    startTransition(async () => {
      const created = await createOrgPatient({
        orgId,
        displayName: displayName.trim(),
        timezone,
        etiology: "unspecified",
      });
      if (created.error !== null) {
        setError(created.error);
        return;
      }
      setDisplayName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <h2 className="text-xl font-semibold">{C.detail.addPatientHeading}</h2>
      <label htmlFor="org-patient-name" className="text-lg font-medium">
        {C.detail.nameLabel}
      </label>
      <input
        id="org-patient-name"
        type="text"
        required
        maxLength={100}
        autoComplete="off"
        placeholder={C.detail.namePlaceholder}
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
      />
      <button
        type="submit"
        disabled={isPending || displayName.trim().length === 0}
        className="h-[56px] w-full rounded-xl bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
      >
        {isPending ? C.detail.addingPatient : C.detail.addPatientButton}
      </button>
      {error && (
        <p role="alert" className="text-lg text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
