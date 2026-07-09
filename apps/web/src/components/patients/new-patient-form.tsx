"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPatient, setActivePatient } from "@/lib/patients/actions";

/**
 * Minimal "add a person" form for the multi-patient caregiver. Name only — timezone is read from
 * the browser and etiology defaults to 'unspecified' (the disease-specific screen lives elsewhere;
 * §10 keeps disease naming out of the basic add flow). On success the new patient is made active
 * and we return to the dashboard.
 */
export function NewPatientForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    startTransition(async () => {
      const created = await createPatient({
        displayName: displayName.trim(),
        timezone,
        etiology: "unspecified",
      });
      if (created.error !== null) {
        setError(created.error);
        return;
      }
      await setActivePatient({ patientId: created.data.id });
      router.push("/dashboard");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <label htmlFor="displayName" className="text-xl">
        Their name
      </label>
      <input
        id="displayName"
        name="displayName"
        type="text"
        required
        maxLength={100}
        autoComplete="off"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        className="h-[60px] w-full rounded-lg border border-zinc-300 px-4 text-xl"
      />
      <button
        type="submit"
        disabled={isPending || displayName.trim().length === 0}
        className="h-[60px] w-full rounded-lg bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
      >
        {isPending ? "Adding…" : "Add person"}
      </button>
      {error && (
        <p role="alert" className="text-lg text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
