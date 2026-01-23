"use client";

import Link from "next/link";
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/firebase";
import Image from "next/image";
import { IconArrowLeft, IconBrandGithub, IconBrandGoogle, IconMail, IconShieldLock } from "@tabler/icons-react";

type Mode = "signin" | "signup";

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <AuthContent />
    </Suspense>
  );
}

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompletingLink, setIsCompletingLink] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const actionCodeSettings = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    return {
      url: process.env.NEXT_PUBLIC_FIREBASE_REDIRECT_URL || `${origin}/auth`,
      handleCodeInApp: true,
    };
  }, []);

  useEffect(() => {
    const requestedMode = searchParams?.get("mode");
    if (requestedMode === "signup") {
      setMode("signup");
    } else {
      setMode("signin");
    }
  }, [searchParams]);

  const setModeWithUrl = (nextMode: Mode) => {
    setMode(nextMode);
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (nextMode === "signup") {
      params.set("mode", "signup");
    } else {
      params.delete("mode");
    }
    router.replace(`/auth${params.toString() ? `?${params.toString()}` : ""}`);
  };

  useEffect(() => {
    const completeEmailLinkSignIn = async () => {
      if (typeof window === "undefined") { return; }
      if (!isSignInWithEmailLink(auth, window.location.href)) { return; }

      const storedEmail = window.localStorage.getItem("clockit.emailLink");
      if (!storedEmail) {
        setError("Email link is missing an email address. Re-enter your email to finish signing in.");
        return;
      }

      try {
        setIsCompletingLink(true);
        await signInWithEmailLink(auth, storedEmail, window.location.href);
        window.localStorage.removeItem("clockit.emailLink");
        setStatus("Signed in with email link.");
        setError(null);
        setIsRedirecting(true);
        router.push("/");
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setIsCompletingLink(false);
      }
    };

    void completeEmailLinkSignIn();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmailPassword = async () => {
    setStatus(null);
    setError(null);
    setIsSubmitting(true);
    try {
      const emailValid = isValidEmail(email);
      const passwordValid = isValidPassword(password);
      const nameValid = mode === "signin" || isValidName(name);

      if (!emailValid) {
        throw new Error("Enter a valid email address.");
      }
      if (!passwordValid) {
        throw new Error("Password must be 8+ characters with at least one uppercase letter and one number.");
      }
      if (!nameValid) {
        throw new Error("Name must start with a letter or number and use standard characters only.");
      }

      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, email, password);
        setStatus("Signed in successfully.");
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (cred.user && name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
        setStatus("Account created and signed in.");
      }
      setIsRedirecting(true);
      router.push("/");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProviderLogin = async (providerName: "google" | "github") => {
    setStatus(null);
    setError(null);
    const provider = providerName === "google" ? new GoogleAuthProvider() : new GithubAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setStatus(`Signed in with ${providerName === "google" ? "Google" : "GitHub"}.`);
      setIsRedirecting(true);
      router.push("/");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const handlePasswordReset = async () => {
    setStatus(null);
    setError(null);
    if (!email) {
      setError("Enter your email first to reset your password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setStatus("Password reset email sent.");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const handleEmailLink = async () => {
    setStatus(null);
    setError(null);
    if (mode !== "signin") {
      setError("Magic links are only available for sign in.");
      return;
    }
    if (!email) {
      setError("Enter your email to send a magic link.");
      return;
    }
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("clockit.emailLink", email);
      }
      setStatus("Magic link sent. Check your email to finish signing in.");
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f5f7fb] via-white to-[#eef3ff] text-gray-900">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Image src="/icon.png" alt="Clockit Icon" width={28} height={28} className="rounded-full" />
            <span className="font-bold text-lg tracking-tight">Clockit</span>
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">Auth</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/docs" className="text-gray-600 hover:text-gray-900 font-medium">Docs</Link>
            <Link href="/" className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
              <IconArrowLeft size={16} /> Home
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium border border-blue-100">
            <IconShieldLock size={16} /> Secure sign-in
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight text-gray-900">Sign in to Clockit</h1>
          <p className="text-lg text-gray-600 max-w-xl">
            Use email and password, a magic link, or your favorite provider. We also support Google and GitHub for quick access.
          </p>
          <ul className="space-y-3 text-gray-700">
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full" />
              Email/password with account creation.
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full" />
              Magic link sign-in for one-click access.
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-blue-500 rounded-full" />
              Password reset and provider sign-in flows.
            </li>
          </ul>
        </section>

        <section className="bg-white shadow-lg rounded-2xl border border-gray-100 p-8 space-y-6">
          <div className="flex items-center gap-3">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === "signin" ? "bg-blue-50 text-blue-700 border border-blue-100" : "text-gray-600 hover:text-gray-900"
              }`}
              onClick={() => setModeWithUrl("signin")}
            >
              Sign in
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === "signup" ? "bg-blue-50 text-blue-700 border border-blue-100" : "text-gray-600 hover:text-gray-900"
              }`}
              onClick={() => setModeWithUrl("signup")}
            >
              Create account
            </button>
          </div>

          <div className="space-y-4">
            {mode === "signup" && (
              <label className="block text-sm font-medium text-gray-700">
                Name
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                  placeholder="Your name"
                  autoComplete="name"
                />
              </label>
            )}
            <label className="block text-sm font-medium text-gray-700">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </label>
            <div className="flex items-center justify-between text-sm">
              <button onClick={handlePasswordReset} className="text-blue-600 hover:underline">
                Forgot password?
              </button>
              {mode === "signin" && (
                <button onClick={handleEmailLink} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  <IconMail size={16} /> Send magic link
                </button>
              )}
            </div>
            <button
              onClick={handleEmailPassword}
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold shadow hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {isSubmitting ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="flex-1 border-t border-gray-200" />
            <span>Or continue with</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => handleProviderLogin("google")}
              className="w-full border border-gray-200 rounded-lg py-2.5 font-semibold text-gray-800 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center gap-2"
            >
              <IconBrandGoogle size={18} /> Google
            </button>
            <button
              onClick={() => handleProviderLogin("github")}
              className="w-full border border-gray-200 rounded-lg py-2.5 font-semibold text-gray-800 hover:border-blue-200 hover:bg-blue-50 flex items-center justify-center gap-2"
            >
              <IconBrandGithub size={18} /> GitHub
            </button>
          </div>

          {(status || error || isCompletingLink) && (
            <div className="rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: error ? "#fecdd3" : "#bfdbfe",
                backgroundColor: error ? "#fff1f2" : "#eff6ff",
                color: error ? "#b91c1c" : "#1d4ed8",
              }}
            >
              {isCompletingLink
                ? "Completing email link sign-in..."
                : isRedirecting
                  ? `${error ?? status ?? "Signed in"}. Redirecting...`
                  : error || status}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPassword(value: string) {
  return /[A-Z]/.test(value) && /\d/.test(value) && /[a-zA-Z]/.test(value) && value.length >= 8;
}

function isValidName(value: string) {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9]/.test(trimmed)) return false;
  // Restrict to common safe characters to avoid injection-ish input
  return /^[A-Za-z0-9 _.'-]+$/.test(trimmed);
}
