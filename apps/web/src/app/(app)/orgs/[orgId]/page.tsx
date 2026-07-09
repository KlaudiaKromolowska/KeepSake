import Link from "next/link";
import { notFound } from "next/navigation";
import { CreateOrgPatientForm } from "@/components/orgs/create-org-patient-form";
import { OrgRosterManager } from "@/components/orgs/org-roster-manager";
import { SiteFooter } from "@/components/site-footer";
import { requireUser } from "@/lib/actions";
import { ORG_COPY as C } from "@/lib/orgs/copy";
import { listMyOrgs, listOrgMembers, listOrgPatients } from "@/lib/orgs/load";

export const metadata = { title: "Care home — Keepsake" };

/**
 * Manage one care home: the team roster (admins add/remove; anyone can leave) and the people the org
 * supports (admins add). Membership is verified via listMyOrgs — a non-member (or an unknown id) has
 * this org absent from their roster and gets a 404. RLS independently scopes every read/write below.
 */
export default async function OrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { user, supabase } = await requireUser();

  const myOrgs = await listMyOrgs(supabase, user.id);
  const org = myOrgs.find((o) => o.id === orgId);
  if (!org) notFound();
  const isAdmin = org.role === "admin";

  const [members, patients] = await Promise.all([
    listOrgMembers(supabase, orgId),
    listOrgPatients(supabase, orgId),
  ]);

  return (
    <>
      <main className="flex flex-1 flex-col items-center gap-8 bg-white p-6 text-zinc-900">
        <div className="flex w-full max-w-2xl flex-col gap-2">
          <h1 className="text-3xl font-semibold">{org.name}</h1>
          <span className="w-fit rounded-full border border-zinc-300 px-3 py-1 text-sm text-zinc-600">
            {isAdmin ? C.list.adminBadge : C.list.staffBadge}
          </span>
        </div>

        <OrgRosterManager
          orgId={orgId}
          members={members}
          isAdmin={isAdmin}
          currentUserId={user.id}
        />

        <div className="flex w-full max-w-xl flex-col gap-4">
          <h2 className="text-xl font-semibold">{C.detail.patientsHeading}</h2>
          {patients.length === 0 ? (
            <p className="text-lg text-zinc-600">{C.detail.noPatients}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {patients.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-zinc-200 px-4 py-3 text-lg text-zinc-900"
                >
                  {p.displayName}
                </li>
              ))}
            </ul>
          )}
          {isAdmin && <CreateOrgPatientForm orgId={orgId} />}
        </div>

        <Link
          href="/orgs"
          className="flex min-h-[48px] items-center rounded-xl border border-zinc-300 px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
        >
          {C.detail.backToList}
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
