import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111111] px-4">
      <div className="text-center max-w-md">
        <p className="text-8xl font-extrabold text-[#FFD439] mb-4">404</p>

        <h1 className="text-2xl font-bold text-white mb-2">Page Not Found</h1>

        <p className="text-gray-400 text-sm mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-[#FFD439] px-6 py-3 text-sm font-semibold text-[#111111] hover:bg-[#FFD439]/90 transition-colors"
        >
          ← Go Home
        </Link>

        <div className="mt-10">
          <p className="text-xs font-semibold tracking-[0.25em] text-[#FFD439]/50">
            PICKUP JAMAICA
          </p>
        </div>
      </div>
    </div>
  );
}
