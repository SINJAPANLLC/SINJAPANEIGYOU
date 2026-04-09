import { useSignIn } from "@clerk/react";
import { useState } from "react";

export default function SignInPage() {
  const { signIn, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !setActive) {
      setError("少し待ってからお試しください。");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Step 1: Backend verifies credentials and returns a Clerk sign-in token
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { token?: string; error?: string };

      if (!res.ok || !data.token) {
        setError(data.error ?? "メールアドレスまたはパスワードが正しくありません。");
        return;
      }

      // Step 2: Use the token to create a Clerk session (no MFA/factor-one)
      const result = await signIn.create({
        strategy: "ticket",
        ticket: data.token,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        window.location.href = "/dashboard";
      } else {
        setError("ログインに失敗しました。もう一度お試しください。");
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message?: string }[]; message?: string };
      setError(e?.errors?.[0]?.message ?? e?.message ?? "ログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
      <div style={{ width: "100%", maxWidth: 360, padding: "0 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, background: "#fff", borderRadius: 4, marginBottom: 20 }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="0" y="0" width="8" height="8" fill="black" />
              <rect x="10" y="0" width="8" height="8" fill="black" />
              <rect x="0" y="10" width="8" height="8" fill="black" />
              <rect x="10" y="10" width="8" height="8" fill="black" opacity="0.3" />
            </svg>
          </div>
          <h1 style={{ color: "#fff", fontSize: 16, fontWeight: 500, margin: 0 }}>営業自動化ダッシュボード</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              borderRadius: 3,
              padding: "12px 16px",
              fontSize: 14,
              outline: "none",
              opacity: loading ? 0.5 : 1,
            }}
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              borderRadius: 3,
              padding: "12px 16px",
              fontSize: 14,
              outline: "none",
              opacity: loading ? 0.5 : 1,
            }}
          />

          {error && (
            <p style={{ color: "#f87171", fontSize: 12, margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? "rgba(255,255,255,0.6)" : "#fff",
              color: "#000",
              border: "none",
              borderRadius: 3,
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: 4,
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
