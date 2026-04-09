import { useSignIn } from "@clerk/react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function SignInPage() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signIn) return;
    setError("");
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate("/dashboard");
      } else if (result.status === "needs_first_factor") {
        // Fallback: attempt password factor explicitly
        const r2 = await result.attemptFirstFactor({ strategy: "password", password });
        if (r2.status === "complete") {
          await setActive({ session: r2.createdSessionId });
          navigate("/dashboard");
        } else {
          setError("ログインに失敗しました。もう一度お試しください。");
        }
      } else {
        setError("ログインに失敗しました。もう一度お試しください。");
      }
    } catch (err: unknown) {
      const clerkErr = err as { errors?: { message?: string; longMessage?: string }[] };
      const msg = clerkErr?.errors?.[0]?.longMessage
        ?? clerkErr?.errors?.[0]?.message;
      if (msg?.includes("password") || msg?.includes("incorrect")) {
        setError("メールアドレスまたはパスワードが正しくありません。");
      } else if (msg) {
        setError(msg);
      } else {
        setError("ログインできませんでした。もう一度お試しください。");
      }
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
              className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-sm px-4 py-3 text-sm outline-none focus:border-white/40 transition-colors"
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
              className="w-full bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-sm px-4 py-3 text-sm outline-none focus:border-white/40 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs leading-relaxed">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black text-sm font-medium py-3 rounded-sm hover:bg-white/90 transition-colors disabled:opacity-40 mt-2"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
