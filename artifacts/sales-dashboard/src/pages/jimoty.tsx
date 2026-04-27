import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Loader2, PlayCircle, ExternalLink, MapPin, Building2,
  AlertCircle, CheckCircle2, Clock, Plus, Star, User, Users,
} from "lucide-react";

interface JimotyAccount {
  id: number;
  label: string;
  email: string;
  isDefault: boolean;
  accountType: string;
  createdAt: string;
}

interface JimotyPost {
  id: number;
  businessId: number | null;
  businessName: string | null;
  accountId: number | null;
  title: string;
  body: string;
  status: string;
  postedAt: string | null;
  jimotyUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
}

interface BizWithAccount {
  id: number;
  name: string;
  jimotyAccountId: number | null;
}

interface JimotyStatus {
  configured: boolean;
  accountCount: number;
  hasEnvCreds: boolean;
  scheduledTime: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:  { label: "下書き",   color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: <Clock className="w-3 h-3" /> },
  posted: { label: "投稿済み", color: "bg-green-500/20 text-green-400 border-green-500/30",   icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "失敗",     color: "bg-red-500/20 text-red-400 border-red-500/30",          icon: <AlertCircle className="w-3 h-3" /> },
};

function AccountForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [accountType, setAccountType] = useState<"business" | "personal">("business");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jimoty/accounts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, email, password, isDefault, accountType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "作成失敗");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/status"] });
      toast({ title: "✅ アカウントを追加しました" });
      onSave();
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  return (
    <div className="border border-border bg-muted/10 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">新しいアカウント</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input placeholder="ラベル（例：法人アカウント）" value={label} onChange={e => setLabel(e.target.value)} className="rounded-none text-sm h-8" />
        <Input placeholder="メールアドレス" type="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-none text-sm h-8" />
        <Input placeholder="パスワード" type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-none text-sm h-8" />
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="accountType" value="business" checked={accountType === "business"} onChange={() => setAccountType("business")} />
            法人・ビジネス
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="accountType" value="personal" checked={accountType === "personal"} onChange={() => setAccountType("personal")} />
            個人
          </label>
        </div>
      </div>
      {accountType === "business" && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} className="rounded" />
          デフォルトアカウントにする
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="rounded-none h-8 gap-1.5" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !label || !email || !password}>
          {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          追加
        </Button>
        <Button size="sm" variant="ghost" className="rounded-none h-8" onClick={onCancel}>キャンセル</Button>
      </div>
    </div>
  );
}

function PostCard({ post, accounts, onDelete }: { post: JimotyPost; accounts: JimotyAccount[]; onDelete: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jimoty/posts/${post.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("削除失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      onDelete();
      toast({ title: "🗑️ 削除しました" });
    },
  });

  const sc = statusConfig[post.status] ?? statusConfig.draft;
  const account = accounts.find(a => a.id === post.accountId);
  const isPersonal = account?.accountType === "personal";

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] border px-1.5 py-0.5 ${sc.color}`}>
              {sc.icon}{sc.label}
            </span>
            {post.businessName ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" />{post.businessName}
              </span>
            ) : (
              <span className="text-[10px] text-purple-400 flex items-center gap-1">
                <Users className="w-3 h-3" />個人投稿
              </span>
            )}
            {account && (
              <span className={`text-[10px] flex items-center gap-1 ${isPersonal ? "text-purple-400" : "text-blue-400"}`}>
                <User className="w-3 h-3" />{account.label}
              </span>
            )}
          </div>
          <p className="text-sm font-medium truncate">{post.title}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {post.jimotyUrl && (
            <a href={post.jimotyUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-red-400"
            onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{post.body}</p>
      {post.errorMsg && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1">⚠ {post.errorMsg}</p>
      )}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>作成: {new Date(post.createdAt).toLocaleString("ja-JP")}</span>
        {post.postedAt && <span>投稿: {new Date(post.postedAt).toLocaleString("ja-JP")}</span>}
      </div>
    </div>
  );
}

export default function JimotyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "accounts" | "assign">("posts");
  const [openPostPanel, setOpenPostPanel] = useState<number | null>(null);
  const [selectedBizForPost, setSelectedBizForPost] = useState<Record<number, number>>({});

  const { data: accounts = [] } = useQuery<JimotyAccount[]>({
    queryKey: ["/api/jimoty/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery<JimotyPost[]>({
    queryKey: ["/api/jimoty/posts"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/posts", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: status } = useQuery<JimotyStatus>({
    queryKey: ["/api/jimoty/status"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/status", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: businesses = [] } = useQuery<BizWithAccount[]>({
    queryKey: ["/api/jimoty/businesses"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/businesses", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("削除失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/status"] });
      toast({ title: "🗑️ アカウントを削除しました" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      toast({ title: "✅ デフォルトアカウントを変更しました" });
    },
  });

  const setTypeMutation = useMutation({
    mutationFn: async ({ id, accountType }: { id: number; accountType: string }) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      toast({ title: "✅ アカウント種別を変更しました" });
    },
  });

  const assignAccountMutation = useMutation({
    mutationFn: async ({ bizId, accountId }: { bizId: number; accountId: number | null }) => {
      const res = await fetch(`/api/jimoty/businesses/${bizId}/account`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/businesses"] });
      toast({ title: "✅ アカウントを割り当てました" });
    },
  });

  const runDailyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jimoty/run-daily", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "実行失敗");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "✅ " + (data.message ?? "日次投稿を開始しました") });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] }), 3000);
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const postOneMutation = useMutation({
    mutationFn: async (bizId: number) => {
      const res = await fetch(`/api/jimoty/generate-and-post/${bizId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "失敗");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      toast({ title: data.url ? `✅ 投稿完了 (${data.accountLabel ?? ""})` : "✅ " + data.message });
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const postWithAccountMutation = useMutation({
    mutationFn: async ({ bizId, accountId }: { bizId: number; accountId: number }) => {
      const res = await fetch(`/api/jimoty/generate-and-post/${bizId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "失敗");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      setOpenPostPanel(null);
      toast({ title: data.url ? `✅ 投稿完了 (${data.accountLabel ?? ""})` : "✅ " + data.message });
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const personalPostMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await fetch(`/api/jimoty/personal-post/${accountId}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "失敗");
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      setOpenPostPanel(null);
      toast({ title: data.url ? "✅ 個人投稿完了" : "✅ " + data.message });
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const postedCount = posts.filter(p => p.status === "posted").length;
  const failedCount = posts.filter(p => p.status === "failed").length;
  const tabs = [
    { id: "posts", label: "投稿履歴" },
    { id: "accounts", label: `アカウント (${accounts.length})` },
    { id: "assign", label: "割り当て" },
  ] as const;

  const businessAccounts = accounts.filter(a => a.accountType === "business");

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          <h1 className="text-xl font-bold tracking-tight">ジモティー自動投稿</h1>
        </div>
        <Button size="sm" className="rounded-none gap-2"
          onClick={() => runDailyMutation.mutate()}
          disabled={runDailyMutation.isPending || !status?.configured}>
          {runDailyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          全ビジネス一括投稿
        </Button>
      </div>

      <div className={`border p-3 text-sm flex items-start gap-2 ${status?.configured ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
        {status?.configured ? (
          <>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{accounts.length}件のアカウント設定済み{status.hasEnvCreds && accounts.length === 0 ? " (環境変数)" : ""}</p>
              <p className="text-xs mt-0.5">毎日 {status.scheduledTime} に自動投稿します</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="font-medium">アカウントタブからジモティーのアカウントを追加してください</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">総投稿数</p>
          <p className="text-2xl font-bold mt-1">{posts.length}</p>
        </div>
        <div className="border border-green-500/30 bg-green-500/5 p-3">
          <p className="text-[10px] text-green-400 uppercase tracking-wider">投稿済み</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{postedCount}</p>
        </div>
        <div className="border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[10px] text-red-400 uppercase tracking-wider">失敗</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{failedCount}</p>
        </div>
      </div>

      <div className="flex border-b border-border">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${activeTab === tab.id ? "border-foreground text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "accounts" && (
        <div className="space-y-3">
          {accounts.map(account => {
            const isPersonal = account.accountType === "personal";
            const isOpen = openPostPanel === account.id;
            const selectedBiz = selectedBizForPost[account.id];
            const isBusinessPosting = postWithAccountMutation.isPending;
            const isPersonalPosting = personalPostMutation.isPending;

            return (
              <div key={account.id} className={`border ${isPersonal ? "border-purple-500/30" : "border-border"}`}>
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{account.label}</span>
                      {isPersonal ? (
                        <span className="text-[10px] border border-purple-500/40 bg-purple-500/10 text-purple-400 px-1.5 py-0.5 flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" />個人・人脈
                        </span>
                      ) : account.isDefault ? (
                        <span className="text-[10px] border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5" />デフォルト・自動投稿
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPersonal ? "個人名・メールアドレス非公開" : account.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant={isOpen ? "secondary" : "ghost"}
                      className="rounded-none h-7 text-xs gap-1 px-2"
                      onClick={() => setOpenPostPanel(isOpen ? null : account.id)}>
                      {isPersonal ? <Users className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                      今すぐ投稿
                    </Button>
                    {!isPersonal && !account.isDefault && (
                      <Button size="sm" variant="ghost" className="rounded-none h-7 text-xs gap-1 px-2"
                        onClick={() => setDefaultMutation.mutate(account.id)}
                        disabled={setDefaultMutation.isPending}>
                        <Star className="w-3 h-3" />デフォルト
                      </Button>
                    )}
                    {isPersonal ? (
                      <Button size="sm" variant="ghost" className="rounded-none h-7 text-xs gap-1 px-2 text-muted-foreground"
                        onClick={() => setTypeMutation.mutate({ id: account.id, accountType: "business" })}
                        disabled={setTypeMutation.isPending}>
                        法人に変更
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="rounded-none h-7 text-xs gap-1 px-2 text-muted-foreground"
                        onClick={() => setTypeMutation.mutate({ id: account.id, accountType: "personal" })}
                        disabled={setTypeMutation.isPending}>
                        個人に変更
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-red-400"
                      onClick={() => deleteAccountMutation.mutate(account.id)}
                      disabled={deleteAccountMutation.isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className={`border-t p-3 ${isPersonal ? "border-purple-500/20 bg-purple-500/5" : "border-border bg-muted/10"}`}>
                    {isPersonal ? (
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-purple-400 font-medium">人脈・出会い系の投稿をAIが自動生成します</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">個人名・メールアドレスは一切含まれません</p>
                        </div>
                        <Button size="sm" className="rounded-none h-8 gap-1.5 shrink-0 bg-purple-600 hover:bg-purple-700"
                          disabled={isPersonalPosting}
                          onClick={() => personalPostMutation.mutate(account.id)}>
                          {isPersonalPosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                          AI生成して投稿
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex-1 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground shrink-0">ビジネス選択:</span>
                          <select
                            className="flex-1 bg-background border border-border text-sm rounded-none px-2 py-1 h-8"
                            value={selectedBiz ?? ""}
                            onChange={e => setSelectedBizForPost(prev => ({ ...prev, [account.id]: Number(e.target.value) }))}
                          >
                            <option value="">-- ビジネスを選択 --</option>
                            {businesses.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                        <Button size="sm" className="rounded-none h-8 gap-1.5 shrink-0"
                          disabled={!selectedBiz || isBusinessPosting}
                          onClick={() => postWithAccountMutation.mutate({ bizId: selectedBiz!, accountId: account.id })}>
                          {isBusinessPosting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                          AI生成して投稿
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {showAddAccount ? (
            <AccountForm onSave={() => setShowAddAccount(false)} onCancel={() => setShowAddAccount(false)} />
          ) : (
            <Button variant="outline" size="sm" className="rounded-none gap-2 w-full"
              onClick={() => setShowAddAccount(true)}>
              <Plus className="w-4 h-4" />アカウントを追加
            </Button>
          )}
        </div>
      )}

      {activeTab === "assign" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">各ビジネスに使用するジモティーアカウントを設定してください。未設定の場合はデフォルトアカウントが使用されます。</p>
          {businesses.map(biz => (
            <div key={biz.id} className="border border-border p-3 flex items-center justify-between gap-3">
              <span className="text-sm truncate flex-1">{biz.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <select
                  className="bg-background border border-border text-sm rounded-none px-2 py-1 h-8"
                  value={biz.jimotyAccountId ?? ""}
                  onChange={e => assignAccountMutation.mutate({
                    bizId: biz.id,
                    accountId: e.target.value ? Number(e.target.value) : null,
                  })}
                >
                  <option value="">デフォルト</option>
                  {businessAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                <Button size="sm" variant="ghost" className="rounded-none h-8 px-2 text-xs gap-1"
                  disabled={postOneMutation.isPending || !status?.configured}
                  onClick={() => postOneMutation.mutate(biz.id)}>
                  {postOneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
                  投稿
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "posts" && (
        <div className="space-y-2">
          {postsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />読み込み中...
            </div>
          ) : posts.length === 0 ? (
            <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              まだ投稿履歴がありません
            </div>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} accounts={accounts} onDelete={() => {}} />)
          )}
        </div>
      )}
    </div>
  );
}
