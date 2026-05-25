"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111111] px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-900/20 border border-red-800/50">
          <AlertTriangle size={40} className="text-red-400" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">
          Something went wrong
        </h1>

        <p className="text-gray-400 mb-2 text-sm">
          An unexpected error occurred while processing your request.
        </p>

        {error?.message && (
          <div className="mb-6 rounded-lg bg-[#1a1a2e] border border-gray-700 px-4 py-3 text-sm text-gray-300 font-mono break-words">
            {error.message}
          </div>
        )}

        {error?.digest && (
          <p className="text-xs text-gray-600 mb-6">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="w-full sm:w-auto rounded-lg bg-[#FFD439] px-6 py-3 text-sm font-semibold text-[#111111] hover:bg-[#FFD439]/90 transition-colors"
          >
            Try Again
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto rounded-lg border border-gray-700 px-6 py-3 text-sm font-medium text-gray-300 hover:bg-[#1a1a2e] transition-colors text-center"
          >
            Go Home
          </Link>
        </div>

        <p className="mt-8 text-xs text-gray-600">
          © {new Date().getFullYear()} Pickup Jamaica
        </p>
      </div>
    </div>
  );
}
