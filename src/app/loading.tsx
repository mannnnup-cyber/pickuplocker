export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#111111]">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-[#FFD439]" />

        <p className="text-sm text-gray-400 font-medium">Loading…</p>

        <p className="text-xs font-semibold tracking-[0.25em] text-[#FFD439]/40 mt-2">
          PICKUP JAMAICA
        </p>
      </div>
    </div>
  );
}
