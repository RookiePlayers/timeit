"use client";

import { useAuthState } from "react-firebase-hooks/auth";
import { auth, storage } from "@/lib/firebase";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { updateProfile } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import NavBar from "@/components/NavBar";
import useFeature from "@/hooks/useFeature";
import { getEntitlementLabel } from "@/services/featureFlags";
import { tokensApi, type TokenListItem, ApiError } from "@/lib/api-client";

export default function ProfilePage() {
  const [user, loading, error] = useAuthState(auth);
  const { entitlement } = useFeature();
  const [, setSigningOut] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tokens, setTokens] = useState<TokenListItem[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenDays, setTokenDays] = useState<number | "">("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

  useEffect(() => {
    if (!user) {return;}

    const loadTokens = async () => {
      setLoadingTokens(true);
      try {
        const tokensList = await tokensApi.list();
        setTokens(tokensList);
      } catch (err) {
        console.error("Failed to load tokens:", err);
        if (err instanceof ApiError) {
          setTokenMessage(err.message);
        }
      } finally {
        setLoadingTokens(false);
      }
    };

    void loadTokens();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-red-600 gap-3">
        <p>Auth error: {error.message}</p>
        <Link href="/auth" className="text-blue-600 hover:underline">Go to sign in</Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-[var(--text)]">
        <p className="text-lg font-semibold">You need to sign in to manage your profile.</p>
        <div className="flex gap-3">
          <Link href="/auth" className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-contrast)] rounded-lg shadow hover:opacity-90 transition-colors">
            Sign in
          </Link>
          <Link href="/auth?mode=signup" className="px-4 py-2 border border-[var(--border)] rounded-lg text-[var(--text)] hover:border-[var(--primary)]/40 hover:text-[var(--primary)] transition-colors">
            Create account
          </Link>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await updateProfile(user, { displayName: displayName.trim() || undefined });
      setSaveMessage("Profile updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update profile.";
      setSaveMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setUploadingPhoto(true);
    setPhotoMessage(null);
    try {
      const safeName = file.name.replace(/\s+/g, "-");
      const fileRef = ref(storage, `profile-pictures/${user!.uid}/${Date.now()}-${safeName}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      await updateProfile(user!, { photoURL: url });
      setPhotoMessage("Profile photo updated.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to upload photo.";
      setPhotoMessage(msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handlePhotoUpload(file);
    }
  };

  const handleCreateToken = async () => {
    if (!user) {return;}
    setTokenMessage(null);
    setNewToken(null);

    try {
      const response = await tokensApi.create({
        name: tokenName || "API Token",
        expiresInDays: typeof tokenDays === "number" && tokenDays > 0 ? tokenDays : undefined,
      });

      setTokenMessage("Token created. Copy and store it securely.");
      setNewToken(response.token);
      setTokenName("");
      setTokenDays("");

      const updatedTokens = await tokensApi.list();
      setTokens(updatedTokens);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to create token.";
      setTokenMessage(msg);
    }
  };

  const handleRevokeToken = async (id: string) => {
    try {
      await tokensApi.revoke(id);
      setTokens(tokens.filter(t => t.id !== id));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to revoke token.";
      setTokenMessage(msg);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await auth.signOut();
    setSigningOut(false);
  };

  const title = user.displayName || user.email || "Developer";
  const entitlementLabel = getEntitlementLabel(entitlement);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <NavBar
        userName={title || undefined}
        userPhoto={user?.photoURL}
        onSignOut={handleSignOut}
        links={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/clockit-online", label: "Clockit Online" },
          { href: "/advanced-stats", label: "Advanced Stats" },
          { href: "/recent-activity", label: "Recent Activity" },
          { href: "/session-activity", label: "Session Activity" },
          { href: "/docs", label: "Docs" },
          
        ]}
      />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <header className="flex items-center gap-4 mb-8">
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-[var(--card)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)] font-bold text-lg overflow-hidden">
              {user.photoURL ? (
                <Image src={user.photoURL} alt="Profile" width={64} height={64} className="object-cover w-full h-full" />
              ) : (
                <span className="text-xl">{user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "U"}</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-2 -right-2 bg-[var(--card)] border border-[var(--border)] rounded-full px-2 py-1 text-[11px] font-semibold text-[var(--primary)] shadow-sm hover:border-[var(--primary)]/40 hover:text-[var(--primary)] transition-colors"
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? "..." : "Edit"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
          </div>
          <div>
            <p className="text-sm text-[var(--primary)] font-semibold">Profile</p>
            <h1 className="text-2xl font-bold text-[var(--text)]">{user.displayName || user.email}</h1>
            {user.email && <p className="text-sm text-[var(--muted)]">{user.email}</p>}
            <p className="text-sm text-[var(--muted)]">Entitlement: {entitlementLabel}</p>
          </div>
        </header>

        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--text)]">Account</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[var(--text)]">
              Display name
              <input
                type="text"
                value={displayName || user.displayName || ""}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] bg-[var(--card)]"
                placeholder={user.displayName || "Your name"}
              />
            </label>
            <div className="text-sm text-[var(--muted)]">
              <p><strong>Email:</strong> {user.email || "Not set"}</p>
              <p><strong>Provider:</strong> {user.providerData.map((p) => p.providerId).join(", ")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--primary-contrast)] bg-[var(--primary)] hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            {saveMessage && <p className="text-sm text-[var(--muted)]">{saveMessage}</p>}
            {photoMessage && <p className="text-sm text-[var(--muted)]">{photoMessage}</p>}
          </div>
        </section>

        <section className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-sm p-6 space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">API Tokens</h2>
          <p className="text-sm text-[var(--muted)]">
            Use these tokens to connect the VS Code plugin and back up CSV data automatically. Tokens are shown only once on creation.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium text-[var(--text)] col-span-2">
              Token name
              <input
                type="text"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] bg-[var(--card)]"
                placeholder="VS Code Backup"
              />
            </label>
            <label className="block text-sm font-medium text-[var(--text)]">
              Expiry (days, optional)
              <input
                type="number"
                min="1"
                value={tokenDays}
                onChange={(e) => setTokenDays(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] bg-[var(--card)]"
                placeholder="e.g. 90"
              />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateToken}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--primary-contrast)] bg-[var(--primary)] hover:bg-[var(--primary-dark)] transition-colors"
            >
              Create token
            </button>
            {tokenMessage && <p className="text-sm text-[var(--muted)]">{tokenMessage}</p>}
          </div>
          {newToken && (
            <div className="border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-contrast)] rounded-lg p-3 text-sm">
              <p className="font-semibold mb-1">Copy your token now:</p>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <code className="text-xs break-all w-full">{newToken}</code>
                <div className="flex justify-end">
                  <button
                    onClick={() => navigator.clipboard.writeText(newToken)}
                    className="px-3 py-1 text-xs font-semibold text-[var(--primary-contrast)] bg-[var(--primary)] rounded-md hover:bg-[var(--primary-dark)]"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="divide-y divide-[var(--muted)] border border-[var(--border)] rounded-xl overflow-hidden">
            {loadingTokens ? (
              <p className="text-sm text-[var(--muted)] px-4 py-3">Loading tokens...</p>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-[var(--muted)] px-4 py-3">No tokens yet.</p>
            ) : (
              tokens.map((t) => (
                <div key={t.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-[var(--background)]">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--text)]">{t.name || "Token"}</p>
                    <p className="text-xs text-[var(--muted)]">
                      Last 4: {t.lastFour || "—"} · Created: {formatDate(t.createdAt)} {t.expiresAt ? `· Expires: ${formatDate(t.expiresAt)}` : "· No expiry"}
                    </p>
                    {t.lastUsedAt && (
                      <p className="text-xs text-[var(--muted)]">Last used: {formatDate(t.lastUsedAt)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void handleRevokeToken(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-50 border border-red-400 hover:bg-red-400 bg-red-500 transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-sm p-6 space-y-4 mt-6">
          <h2 className="text-lg font-semibold text-[var(--text)]">Data control</h2>
          <p className="text-sm text-[var(--muted)]">
            You own your data. Manage deletion requests or request a data export from here.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/delete-data"
              className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-red-500 text-red-50 font-semibold border border-red-400 hover:bg-red-400 transition-colors"
            >
              Delete my data
            </Link>
            <Link
              href="/request-data"
              className="flex-1 inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-500 text-blue-50 font-semibold border border-blue-400 hover:bg-blue-400 transition-colors"
            >
              Request my data
            </Link>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Need help? Email support@octech.dev from your account email and we&apos;ll assist.
          </p>
        </section>
      </main>
    </div>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) {return "—";}
  return new Date(dateStr).toLocaleDateString();
}
