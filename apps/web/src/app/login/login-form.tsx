"use client";

import { useState, useTransition } from "react";
import { demoSignIn, requestMagicLink } from "@/lib/auth/actions";

export function LoginForm({ demoModeEnabled }: { demoModeEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    startTransition(async () => {
      const result = await requestMagicLink(email);
      setMessage(result.error ? result.error : "Check your email for a sign-in link.");
    });
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label htmlFor="email" className="text-xl">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(changeEvent) => setEmail(changeEvent.target.value)}
          className="h-[60px] w-full rounded-lg border border-zinc-300 px-4 text-xl"
        />
        <button
          type="submit"
          disabled={isPending}
          className="h-[60px] w-full rounded-lg bg-zinc-900 text-xl font-medium text-white disabled:opacity-50"
        >
          Send sign-in link
        </button>
      </form>

      {message && (
        <p role="status" className="text-xl">
          {message}
        </p>
      )}

      {demoModeEnabled && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              // demoSignIn redirects on success; a return value only means an error.
              const result = await demoSignIn();
              setMessage(result.error);
            })
          }
          className="h-[60px] w-full rounded-lg border border-zinc-300 text-xl font-medium disabled:opacity-50"
        >
          Enter demo
        </button>
      )}
    </div>
  );
}
