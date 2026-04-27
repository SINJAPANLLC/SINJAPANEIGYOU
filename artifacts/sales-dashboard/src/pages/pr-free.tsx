import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Trash2, Copy, PenLine, FileText, Loader2, Send, ChevronDown, CalendarClock, PlayCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PrArticle {
  id: number;
  businessId: number;
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
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="font-semibold"
          placeholder="タイトル"
        />
        <Textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={10}
          className="text-sm font-mono"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => updateMutation.mutate({ title: editTitle, content: editContent })}
            disabled={updateMutation.isPending}
          >
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
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight">{article.title}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(article.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
              {article.postedAt && (
                <span className="ml-2">
                  投稿: {new Date(article.postedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </span>
              )}
            </p>
          </div>
          <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded border font-medium ${statusLabel[article.status]?.color || ""}`}>
            {statusLabel[article.status]?.label || article.status}
          </span>
        </div>

        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/20 rounded p-3 max-h-48 overflow-y-auto mb-4">
          {article.content}
        </pre>

        {/* 自動投稿セクション */}
        {article.status !== "posted" && (
          <div className="flex items-center gap-2 mb-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <Send className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-xs text-blue-300 flex-1">PR-FREEに自動投稿</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-blue-500/30 hover:border-blue-400">
                  {selectedCategory}
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {PR_FREE_CATEGORIES.map((cat) => (
                  <DropdownMenuItem key={cat} onClick={() => setSelectedCategory(cat)}>
                    {cat}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => autoPostMutation.mutate()}
              disabled={autoPostMutation.isPending}
            >
              {autoPostMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />送信中...</>
              ) : (
                <><Send className="w-3.5 h-3.5" />自動投稿</>
              )}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={copyToClipboard}>
            <Copy className="w-3 h-3" />コピー
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => setEditing(true)}>
            <PenLine className="w-3 h-3" />編集
          </Button>
          {article.status !== "posted" && (
            <Button
              size="sm" variant="outline" className="gap-1.5 text-xs h-7"
              onClick={() => updateMutation.mutate({ status: "posted", postedAt: new Date().toISOString() })}
            >
              投稿済みにする
            </Button>
          )}
          <Button
            size="sm" variant="ghost" className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive ml-auto"
            onClick={onDelete}
          >
            <Trash2 className="w-3 h-3" />削除
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PrFreePage() {
  const { selectedBusinessId } = useBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [topic, setTopic] = useState("");

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

  const { data: articles = [], isLoading } = useQuery<PrArticle[]>({
    queryKey: ["/api/pr-articles", selectedBusinessId],
    queryFn: async () => {
      const res = await fetch(`/api/pr-articles?businessId=${selectedBusinessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      return res.json();
    },
    enabled: !!selectedBusinessId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pr-articles/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: selectedBusinessId, topic }),
      });
      if (!res.ok) throw new Error("生成失敗");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles", selectedBusinessId] });
      setTopic("");
      toast({ title: "✅ 記事を生成しました" });
    },
    onError: () => toast({ title: "エラー", description: "記事生成に失敗しました", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/pr-articles/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles", selectedBusinessId] });
      toast({ title: "削除しました" });
    },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <FileText className="w-6 h-6" />
              PR-FREE 自動記事作成＆投稿
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              AIが記事を生成し、PR-FREE（pr-free.jp）に自動投稿します。
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
              {runDailyMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />実行中...</>
              ) : (
                <><PlayCircle className="w-3.5 h-3.5" />今すぐ全ビジネス投稿</>
              )}
            </Button>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="w-3 h-3" />
              毎日10:00 (JST) 自動実行
            </span>
          </div>
        </div>
      </div>

      {!selectedBusinessId ? (
        <div className="border border-dashed border-border rounded p-12 text-center text-muted-foreground">
          左のサイドバーからビジネスを選択してください
        </div>
      ) : (
        <>
          {/* 記事生成フォーム */}
          <div className="border border-border rounded-lg p-5 mb-6 bg-muted/10">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              AI記事生成
            </h2>
            <div className="flex gap-3">
              <Input
                placeholder="テーマ・トピック（任意）例: 新サービス開始、実績紹介..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && generateMutation.mutate()}
              />
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {generateMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />生成中...</>
                ) : (
                  <><Sparkles className="w-4 h-4" />記事を生成</>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ※ 生成後、カテゴリを選択して「自動投稿」ボタンを押すとPR-FREEに直接送信されます
            </p>
          </div>

          {/* 記事一覧 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />読み込み中...
            </div>
          ) : articles.length === 0 ? (
            <div className="border border-dashed border-border rounded p-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">まだ記事がありません。上のボタンで生成してください。</p>
            </div>
          ) : (
            <div className="space-y-4">
              {articles.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  onDelete={() => deleteMutation.mutate(article.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
