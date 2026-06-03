"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, User, KeyRound, Loader2, Home } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type LoginTab = "credentials" | "pin";

export default function LoginPage() {
  const router = useRouter();
  const { login, loginWithPin } = useAuth();

  const [activeTab, setActiveTab] = useState<LoginTab>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === "credentials") {
      usernameRef.current?.focus();
    } else {
      pinRef.current?.focus();
    }
  }, [activeTab]);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    try {
      await login(username.trim(), password);
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid username or password.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!pin.trim()) {
      setError("Please enter your staff PIN.");
      return;
    }

    setIsLoading(true);
    try {
      await loginWithPin(pin.trim());
      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Invalid PIN. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#111111] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <img
              src="/logo-icon.png"
              alt="Pickup Logo"
              className="h-16 w-auto object-contain"
            />
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight">
                <span className="text-white">PICK</span><span className="text-[#FFD439]">UP</span>
              </h1>
              <p className="text-sm font-semibold tracking-[0.35em] text-[#FFD439]/70 mt-0.5">
                JAMAICA
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Smart Locker System — Admin Dashboard
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-800 bg-[#1a1a2e] p-6 sm:p-8 shadow-2xl">
          {/* Tabs */}
          <div className="flex mb-6 rounded-lg overflow-hidden border border-gray-700">
            <button
              type="button"
              onClick={() => {
                setActiveTab("credentials");
                setError("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "credentials"
                  ? "bg-[#FFD439] text-[#111111]"
                  : "bg-[#1a1a2e] text-gray-400 hover:text-gray-300"
              }`}
            >
              <User size={16} />
              Username / Password
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("pin");
                setError("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                activeTab === "pin"
                  ? "bg-[#FFD439] text-[#111111]"
                  : "bg-[#1a1a2e] text-gray-400 hover:text-gray-300"
              }`}
            >
              <KeyRound size={16} />
              Staff PIN
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Credentials form */}
          {activeTab === "credentials" && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-gray-300 mb-1.5"
                >
                  Username
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    ref={usernameRef}
                    id="username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="w-full rounded-lg border border-gray-700 bg-[#111111] py-3 pl-10 pr-4 text-sm text-white placeholder:text-gray-600 focus:border-[#FFD439] focus:outline-none focus:ring-1 focus:ring-[#FFD439] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-300 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-gray-700 bg-[#111111] py-3 pl-10 pr-4 text-sm text-white placeholder:text-gray-600 focus:border-[#FFD439] focus:outline-none focus:ring-1 focus:ring-[#FFD439] transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#FFD439] py-3 text-sm font-semibold text-[#111111] hover:bg-[#FFD439]/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <Lock size={18} />
                    Sign In
                  </>
                )}
              </button>
            </form>
          )}

          {/* PIN form */}
          {activeTab === "pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="pin"
                  className="block text-sm font-medium text-gray-300 mb-1.5"
                >
                  Staff PIN
                </label>
                <div className="relative">
                  <KeyRound
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    ref={pinRef}
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter your 4–6 digit PIN"
                    className="w-full rounded-lg border border-gray-700 bg-[#111111] py-3 pl-10 pr-4 text-sm text-white placeholder:text-gray-600 focus:border-[#FFD439] focus:outline-none focus:ring-1 focus:ring-[#FFD439] transition-colors tracking-widest"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Quick access for locker operators and delivery staff.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#FFD439] py-3 text-sm font-semibold text-[#111111] hover:bg-[#FFD439]/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <KeyRound size={18} />
                    Enter with PIN
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Back to Home link */}
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-[#FFD439] transition-colors"
          >
            <Home size={16} />
            Back to Kiosk Home
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-600 mt-4">
          © {new Date().getFullYear()} Pickup Jamaica. All rights reserved.
        </p>
      </div>
    </div>
  );
}
