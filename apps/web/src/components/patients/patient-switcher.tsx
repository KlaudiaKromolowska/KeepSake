"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setActivePatient } from "@/lib/patients/actions";

interface SwitcherPatient {
  id: string;
  displayName: string;
}

/**
 * Multi-patient switcher for the caregiver dashboard. A single owned patient renders just the name
 * plus "add a person"; two or more render a native <select> that switches the active patient on
 * change. The server action re-validates ownership and revalidates the layout, so the whole
 * dashboard re-renders around the newly-selected patient.
 */
export function PatientSwitcher({
  patients,
  activeId,
}: {
  patients: SwitcherPatient[];
  activeId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const patientId = event.target.value;
    if (patientId === activeId) return;
    startTransition(async () => {
      await setActivePatient({ patientId });
    });
  }

  const active = patients.find((p) => p.id === activeId);

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2">
      {patients.length > 1 ? (
        <label className="flex w-full flex-col items-center gap-2">
          <span className="text-lg text-zinc-600">Practising with</span>
          <select
            value={activeId}
            onChange={onChange}
            disabled={isPending}
            aria-label="Choose the person you are practising with"
            className="h-[56px] w-full rounded-xl border-2 border-zinc-300 bg-white px-4 text-xl text-zinc-900 disabled:opacity-50"
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="text-lg text-zinc-600">Practising with {active?.displayName}</span>
      )}

      <Link
        href="/patients/new"
        className="flex min-h-[40px] items-center text-base text-zinc-600 underline underline-offset-4 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        Add a person
      </Link>
    </div>
  );
}
