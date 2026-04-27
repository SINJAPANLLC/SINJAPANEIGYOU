import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Loader2, PlayCircle, ExternalLink, MapPin, Building2, AlertCircle, CheckCircle2, Clock,
} from "lucide-react";

interface JimotyPost {
  id: number;
  businessId: number;
  businessName: string;
  title: string;
  body: string;
  status: string;
  postedAt: string | null;
  jimotyUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
}

interface JimotyStatus {
  configured: boolean;
  email: string | null;
  scheduledTime: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:   { label: "下書き",   color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",  icon: <Clock className="w-3 h-3" /> },
  posted:  { label: "投稿済み", color: "bg-green-500/20 text-green-400 border-green-500/30",     icon: <CheckCircle2 className="w-3 h-3" /> },
  failed:  { label: "失敗",     color: "bg-red-500/20 text-red-400 border-red-500/30",            icon: <AlertCircle className="w-3 h-3" /> },
};

function PostCard({ post, onDelete }: { post: JimotyPost; onDelete: () => void }) {
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

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] border px-1.5 py-0.5 ${sc.color}`}>
              {sc.icon}{sc.label}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />{post.businessName}
            </span>
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
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-red-400"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{post.body}</p>

      {post.errorMsg && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1">
          ⚠ {post.errorMsg}
        </p>
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

  const { data: posts = [], isLoading } = useQuery<JimotyPost[]>({
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
      if (!res.ok) throw new Error("status取得失敗");
      return res.json();
    },
  });

  const { data: businesses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/businesses"],
    queryFn: async () => {
      const res = await fetch("/api/businesses", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
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
      toast({ title: data.url ? `✅ 投稿完了` : "✅ " + data.message });
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const postedCount = posts.filter(p => p.status === "posted").length;
  const failedCount = posts.filter(p => p.status === "failed").length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          <h1 className="text-xl font-bold tracking-tight">ジモティー自動投稿</h1>
        </div>
        <Button
          size="sm"
          className="rounded-none gap-2"
          onClick={() => runDailyMutation.mutate()}
          disabled={runDailyMutation.isPending || !status?.configured}
        >
          {runDailyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          全ビジネス一括投稿
        </Button>
      </div>

      <div className={`border p-3 text-sm flex items-start gap-2 ${status?.configured ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
        {status?.configured ? (
          <>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">設定済み: {status.email}</p>
              <p className="text-xs mt-0.5">毎日 {status.scheduledTime} に全ビジネスを自動投稿します</p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">未設定: JIMOTY_EMAIL / JIMOTY_PASSWORD を環境変数に設定してください</p>
              <p className="text-xs mt-0.5">ジモティーのアカウントのメールアドレスとパスワードが必要です</p>
            </div>
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

      {businesses.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">ビジネス別手動投稿</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {businesses.map(biz => (
              <Button
                key={biz.id}
                variant="outline"
                size="sm"
                className="rounded-none text-xs justify-start gap-1.5 h-auto py-2"
                disabled={postOneMutation.isPending || !status?.configured}
                onClick={() => postOneMutation.mutate(biz.id)}
              >
                {postOneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <MapPin className="w-3 h-3 shrink-0" />}
                <span className="truncate">{biz.name}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">投稿履歴</p>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />読み込み中...
          </div>
        ) : posts.length === 0 ? (
          <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
            まだ投稿履歴がありません
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map(post => (
              <PostCard key={post.id} post={post} onDelete={() => {}} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
