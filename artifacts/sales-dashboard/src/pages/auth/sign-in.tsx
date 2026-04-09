import { useSignIn } from "@clerk/react";
import { useState } from "react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn || !setActive) {
      setError("認証システムを初期化中です。しばらくお待ちください。");
      return;
    }
    setError("");
    setLoading(true);

    try {
      // Step 1: Verify credentials on our backend, get a Clerk sign-in token
      const res = await fetch(`${basePath}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      });

      const data = await res.json() as { token?: string; error?: string };

      if (!res.ok || !data.token) {
        setError(data.error ?? "ログインに失敗しました。");
        return;
      }

      // Step 2: Use the token to create a Clerk session
      const result = await signIn.create({
        strategy: "ticket",
        ticket: data.token,
      });

      if (result.status === "complete" && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        window.location.replace(`${basePath}/dashboard`);
        return;
      }

      setError("セッションの作成に失敗しました。もう一度お試しください。");
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? "ログインできませんでした。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-black">
      <div className="w-full max-w-sm px-8">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-white rounded-sm mb-6">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="0" y="0" width="8" height="8" fill="black" />
              <rect x="10" y="0" width="8" height="8" fill="black" />
              <rect x="0" y="10" width="8" height="8" fill="black" />
              <rect x="10" y="10" width="8" height="8" fill="black" opacity="0.3" />
            </svg>
          </div>
          <h1 className="text-white text-lg font-medium tracking-tight">
            営業自動化ダッシュボード
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={!isLoaded || loading}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-sm px-4 py-3 text-sm outline-none focus:border-white/40 transition-colors disabled:opacity-50"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={!isLoaded || loading}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-sm px-4 py-3 text-sm outline-none focus:border-white/40 transition-colors disabled:opacity-50"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !isLoaded}
            className="w-full bg-white text-black text-sm font-medium py-3 rounded-sm hover:bg-white/90 transition-colors disabled:opacity-40 mt-2"
          >
            {!isLoaded ? "読み込み中..." : loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
