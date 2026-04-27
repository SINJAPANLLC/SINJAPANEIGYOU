import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Copy, PenLine, FileText, Loader2,
  Send, ChevronDown, CalendarClock, PlayCircle, Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PrArticle {
  id: number;
  businessId: number;
  businessName: string;
  title: string;
  content: string;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  createdAt: string;
}

const PR_FREE_CATEGORIES = [
  "ＩＴ・通信", "流通", "芸能", "スポーツ", "映画・音楽",
  "出版・アート・カルチャー", "ゲーム・ホビー", "デジタル製品・家電",
  "インテリア・雑貨", "自動車・バイク", "ファッション", "飲食・食品・飲料",
  "美容・医療・健康", "コンサルティング・シンクタンク", "金融",
  "広告・マーケティング", "教育・資格・人材", "ホテル・レジャー",
  "建設・住宅・空間デザイン", "素材・化学・エネルギー・運輸", "自然・環境", "SDGs", "その他",
];

const statusLabel: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  scheduled: { label: "スケジュール済", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  posted: { label: "投稿済み", color: "bg-green-500/20 text-green-400 border-green-500/30" },
};

function ArticleCard({ article, onDelete }: { article: PrArticle; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(article.title);
  const [editContent, setEditContent] = useState(article.content);
  const [selectedCategory, setSelectedCategory] = useState("その他");

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<PrArticle>) => {
      const res = await fetch(`/api/pr-articles/${article.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("更新失敗");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles"] });
      setEditing(false);
      toast({ title: "✅ 更新しました" });
    },
  });

  const autoPostMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pr-articles/${article.id}/auto-post`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: selectedCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "投稿失敗");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles"] });
      toast({ title: "🎉 PR-FREEへの自動投稿が完了しました！" });
    },
    onError: (e: Error) => toast({ title: "投稿エラー", description: e.message, variant: "destructive" }),
  });

  function copyToClipboard() {
    navigator.clipboard.writeText(`${article.title}\n\n${article.content}`);
    toast({ title: "📋 コピーしました" });
  }

  if (editing) {
    return (
      <div className="border border-border rounded-lg p-5 space-y-3">
        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="font-semibold" placeholder="タイトル" />
        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={10} className="text-sm font-mono" />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => updateMutation.mutate({ title: editTitle, content: editContent })} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "保存"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>キャンセル</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="p-5">
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{article.businessName}</span>
            </div>
            <h3 className="font-semibold text-sm leading-tight">{article.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(article.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              {article.postedAt && (
                <span className="ml-2 text-green-400">
                  投稿: {new Date(article.postedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </span>
              )}
            </p>
          </div>
          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded border font-medium ${statusLabel[article.status]?.color || ""}`}>
            {statusLabel[article.status]?.label || article.status}
          </span>
        </div>

        {/* 本文プレビュー */}
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/20 rounded p-3 max-h-40 overflow-y-auto mb-4">
          {article.content}
        </pre>

        {/* 自動投稿 */}
        {article.status !== "posted" && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <Send className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs text-blue-300 flex-1">PR-FREEに自動投稿</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-500/30 hover:border-blue-400">
                  {selectedCategory}<ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {PR_FREE_CATEGORIES.map((cat) => (
                  <DropdownMenuItem key={cat} onClick={() => setSelectedCategory(cat)}>{cat}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => autoPostMutation.mutate()}
              disabled={autoPostMutation.isPending}
            >
              {autoPostMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />送信中...</> : <><Send className="w-3.5 h-3.5" />自動投稿</>}
            </Button>
          </div>
        )}

        {/* アクション */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={copyToClipboard}>
            <Copy className="w-3 h-3" />コピー
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setEditing(true)}>
            <PenLine className="w-3 h-3" />編集
          </Button>
          {article.status !== "posted" && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7"
              onClick={() => updateMutation.mutate({ status: "posted", postedAt: new Date().toISOString() })}>
              投稿済みにする
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive ml-auto" onClick={onDelete}>
            <Trash2 className="w-3 h-3" />削除
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PrFreePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const runDailyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pr-articles/run-daily", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("実行失敗");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "🚀 全ビジネスの自動投稿を開始しました", description: "バックグラウンドで順番に投稿します（約2分/社）" });
    },
    onError: () => toast({ title: "エラー", description: "実行に失敗しました", variant: "destructive" }),
  });

  // 全ビジネスの記事を常に取得
  const { data: articles = [], isLoading } = useQuery<PrArticle[]>({
    queryKey: ["/api/pr-articles"],
    queryFn: async () => {
      const res = await fetch("/api/pr-articles", { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/pr-articles/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles"] });
      toast({ title: "削除しました" });
    },
  });

  const filtered = filterStatus === "all" ? articles : articles.filter((a) => a.status === filterStatus);
  const postedCount = articles.filter((a) => a.status === "posted").length;
  const draftCount = articles.filter((a) => a.status === "draft").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* ヘッダー */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="w-6 h-6" />
              PR-FREE 自動投稿
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              全ビジネスのPR-FREE（pr-free.jp）投稿を管理します。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-2 border-purple-500/30 hover:border-purple-400 text-purple-300"
              onClick={() => runDailyMutation.mutate()}
              disabled={runDailyMutation.isPending}
            >
              {runDailyMutation.isPending
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />実行中...</>
                : <><PlayCircle className="w-3.5 h-3.5" />今すぐ全ビジネス投稿</>}
            </Button>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="w-3 h-3" />
              毎日10:00 (JST) 自動実行
            </span>
          </div>
        </div>
      </div>

      {/* 集計バッジ */}
      {articles.length > 0 && (
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-muted-foreground">全 {articles.length} 件</span>
          <div className="flex gap-2">
            {(["all", "posted", "draft"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  filterStatus === s
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:border-foreground/50"
                }`}
              >
                {s === "all" ? `すべて (${articles.length})` : s === "posted" ? `投稿済み (${postedCount})` : `下書き (${draftCount})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 記事一覧 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />読み込み中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg p-16 text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {articles.length === 0 ? "まだ記事がありません。上のボタンで生成してください。" : "該当する記事がありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onDelete={() => deleteMutation.mutate(article.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
