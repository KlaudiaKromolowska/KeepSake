"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrganization } from "@/lib/orgs/actions";
import { ORG_COPY as C } from "@/lib/orgs/copy";

/**
 * Create a care home. On success the caller is its first admin (server-side, via create_organization)
 * and we route straight into the new org's management page.
 */
export function CreateOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const created = await createOrganization({ name: name.trim() });
      if (created.error !== null) {
        setError(created.error);
        return;
      }
      setName("");
      router.push(`/orgs/${created.data.orgId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="org-name" className="text-lg font-medium">
        {C.list.nameLabel}
      </label>
      <input
        id="org-name"
        type="text"
        required
        maxLength={200}
        autoComplete="off"
        placeholder={C.list.namePlaceholder}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
      />
      <button
        type="submit"
        disabled={isPending || name.trim().length === 0}
        className="h-[56px] w-full rounded-xl bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
      >
        {isPending ? C.list.creating : C.list.createButton}
      </button>
      {error && (
        <p role="alert" className="text-lg text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
