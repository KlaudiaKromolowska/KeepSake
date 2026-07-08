import { SiteFooter } from "@/components/site-footer";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Keepsake" };

export default function LoginPage() {
  // Server-only env check (not NEXT_PUBLIC_) — when unset, the demo button never renders.
  const demoModeEnabled = process.env.DEMO_MODE === "1";

  return (
    <>
      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <h1 className="text-2xl font-semibold">Keepsake</h1>
        <LoginForm demoModeEnabled={demoModeEnabled} />
      </main>
      <SiteFooter />
    </>
  );
}
