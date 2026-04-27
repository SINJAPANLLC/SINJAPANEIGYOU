import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Trash2, Copy, PenLine, FileText, Loader2, ExternalLink } from "lucide-react";

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

const statusLabel: Record<string, { label: string; color: string }> = {
  draft: { label: "下書き", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  scheduled: { label: "スケジュール済", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  posted: { label: "投稿済み", color: "bg-green-500/20 text-green-400 border-green-500/30" },
};

export default function PrFreePage() {
  const { selectedBusinessId } = useBusiness();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [topic, setTopic] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<PrArticle> }) => {
      const res = await fetch(`/api/pr-articles/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("更新失敗");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pr-articles", selectedBusinessId] });
      setEditingId(null);
      toast({ title: "✅ 更新しました" });
    },
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

  function startEdit(a: PrArticle) {
    setEditingId(a.id);
    setEditTitle(a.title);
    setEditContent(a.content);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "📋 コピーしました" });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6" />
          PR FREE 自動記事作成
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          AIがビジネスに合ったプレスリリース記事を自動生成します。PR TIMES FREEにコピー&投稿するだけ。
        </p>
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
          </div>

          {/* PR TIMES FREE リンク */}
          <div className="flex justify-end mb-4">
            <a
              href="https://prtimes.jp/main/html/rd/p/000000001.000000001.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-border rounded px-3 py-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              PR TIMES FREEで投稿する
            </a>
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
                <div key={article.id} className="border border-border rounded-lg overflow-hidden">
                  {editingId === article.id ? (
                    <div className="p-5 space-y-3">
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
                          onClick={() => updateMutation.mutate({ id: article.id, data: { title: editTitle, content: editContent } })}
                          disabled={updateMutation.isPending}
                        >
                          保存
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>キャンセル</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm leading-tight">{article.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(article.createdAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium ${statusLabel[article.status]?.color || ""}`}>
                            {statusLabel[article.status]?.label || article.status}
                          </span>
                        </div>
                      </div>

                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed bg-muted/20 rounded p-3 max-h-48 overflow-y-auto mb-3">
                        {article.content}
                      </pre>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => copyToClipboard(`${article.title}\n\n${article.content}`)}>
                          <Copy className="w-3 h-3" />コピー
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={() => startEdit(article)}>
                          <PenLine className="w-3 h-3" />編集
                        </Button>
                        <Button
                          size="sm" variant="outline" className="gap-1.5 text-xs h-7"
                          onClick={() => updateMutation.mutate({ id: article.id, data: { status: "posted", postedAt: new Date().toISOString() } })}
                          disabled={article.status === "posted"}
                        >
                          投稿済みにする
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive ml-auto"
                          onClick={() => deleteMutation.mutate(article.id)}
                        >
                          <Trash2 className="w-3 h-3" />削除
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
