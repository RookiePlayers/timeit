"use client";

import { SERVER_UNAVAILABLE_MESSAGE } from "@/lib/api-client";

type Props = {
  title?: string;
  message?: string;
};

export default function ServerUnavailable({
  title = "Server unavailable",
  message = SERVER_UNAVAILABLE_MESSAGE,
}: Props) {
  return (
    <div className="min-h-screen theme-bg flex items-center justify-center px-6">
      <div className="w-full max-w-xl border border-[var(--border)] bg-[var(--card)] rounded-2xl p-8 shadow-lg text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-[var(--card-soft)] flex items-center justify-center text-[var(--primary)] text-xl font-semibold">
          !
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)]">{title}</h1>
          <p className="text-sm text-[var(--muted)] mt-2">{message}</p>
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-contrast)] font-semibold hover:opacity-90 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
