import { requireUser } from "@/lib/actions";

/** Everything in the (app) group requires a signed-in caregiver — redirects to /login. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return children;
}
