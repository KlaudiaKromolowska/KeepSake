import { requireUser } from "@/lib/actions";
import { signOut } from "@/lib/auth/actions";

export const metadata = { title: "Dashboard — Keepsake" };

export default async function DashboardPage() {
  const { user } = await requireUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-2xl font-semibold">Keepsake — signed in as {user.email}</h1>
      <form action={signOut}>
        <button
          type="submit"
          className="h-[60px] rounded-lg border border-zinc-300 px-8 text-xl font-medium"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
