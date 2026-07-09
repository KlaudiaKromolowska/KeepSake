"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addOrgMember, removeOrgMember } from "@/lib/orgs/actions";
import { ORG_COPY as C } from "@/lib/orgs/copy";
import type { OrgMember, OrgRole } from "@/lib/orgs/load";

/**
 * Team roster for one care home. Admins can add colleagues by email (role staff|admin) and remove
 * anyone; a non-admin sees the roster read-only but can still remove THEMSELVES (leave). Every action
 * is RLS/definer-guarded server-side — this only drives them and refreshes on success.
 */
export function OrgRosterManager({
  orgId,
  members,
  isAdmin,
  currentUserId,
}: {
  orgId: string;
  members: OrgMember[];
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("staff");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await addOrgMember({ orgId, email: email.trim(), role });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setEmail("");
      setMessage(C.detail.added);
      router.refresh();
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      await removeOrgMember({ orgId, userId });
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <h2 className="text-xl font-semibold">{C.detail.membersHeading}</h2>

      {isAdmin ? (
        <form onSubmit={add} className="flex flex-col gap-3">
          <label htmlFor="member-email" className="text-lg font-medium">
            {C.detail.addMemberLabel}
          </label>
          <input
            id="member-email"
            type="email"
            required
            autoComplete="off"
            placeholder={C.detail.addMemberPlaceholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
          />
          <label htmlFor="member-role" className="text-lg font-medium">
            {C.detail.roleLabel}
          </label>
          <select
            id="member-role"
            value={role}
            onChange={(event) => setRole(event.target.value as OrgRole)}
            className="h-[56px] w-full rounded-xl border border-zinc-300 px-4 text-xl"
          >
            <option value="staff">{C.list.staffBadge}</option>
            <option value="admin">{C.list.adminBadge}</option>
          </select>
          <button
            type="submit"
            disabled={isPending || email.trim().length === 0}
            className="h-[56px] w-full rounded-xl bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
          >
            {isPending ? C.detail.adding : C.detail.addButton}
          </button>
          {message && (
            <p role="status" className="text-lg text-zinc-700">
              {message}
            </p>
          )}
        </form>
      ) : (
        <p className="text-base text-zinc-600">{C.detail.adminOnlyHint}</p>
      )}

      {members.length === 0 ? (
        <p className="text-lg text-zinc-600">{C.detail.noMembers}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            const canRemove = isAdmin || isSelf;
            return (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
              >
                <span className="text-lg text-zinc-900">
                  {m.email}
                  <span className="ml-2 rounded-full border border-zinc-300 px-2 py-0.5 text-sm text-zinc-600">
                    {m.role === "admin" ? C.list.adminBadge : C.list.staffBadge}
                  </span>
                </span>
                {canRemove && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => remove(m.userId)}
                    className="min-h-[40px] rounded-lg border border-zinc-300 px-4 text-base font-medium text-zinc-700 disabled:opacity-50"
                  >
                    {isSelf ? C.detail.leaveButton : C.detail.removeButton}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
