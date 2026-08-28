import { useEffect, useState } from "react";
import { LayoutTemplate, ExternalLink, RefreshCw, PenTool, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

type BusinessPage = {
  id: number;
  businessId: number;
  slug: string;
  status: "draft" | "review" | "published";
  title: string;
  description: string;
  headline: string;
  subheadline: string;
  targetAudience: string | null;
  painPoints: string[] | null;
  benefits: string[] | null;
  faq: Array<{ question: string; answer: string }> | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ogImageUrl: string | null;
  approved: boolean;
  publishedAt: string | null;
};

type Row = {
  page: BusinessPage;
  businessName: string;
  views: number;
  ctaClicks: number;
};

export default function LpManagerPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<BusinessPage>>({});

  const fetchPages = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/business-pages", { credentials: "include" });
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const handleGenerateAll = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/business-pages/generate-all", {
        method: "POST",
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: `${data.created}件の下書きを作成しました` });
        fetchPages();
      } else {
        toast({ title: "作成に失敗しました", variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (id: number) => {
    try {
      const res = await fetch(`/api/business-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast({ title: "保存しました" });
        setEditingId(null);
        fetchPages();
      } else {
        const err = await res.json();
        toast({ title: "保存に失敗しました", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "通信エラー", variant: "destructive" });
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string, approved: boolean) => {
    const nextStatus = currentStatus === "published" ? "draft" : "published";
    if (nextStatus === "published" && !approved) {
      toast({ title: "公開前に確認済みにしてください", variant: "destructive" });
      return;
    }
    
    try {
      const res = await fetch(`/api/business-pages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast({ title: nextStatus === "published" ? "公開しました" : "下書きに戻しました" });
        fetchPages();
      } else {
        const err = await res.json();
        toast({ title: "更新に失敗しました", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "通信エラー", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-muted/5">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
          <span className="font-bold text-sm uppercase tracking-widest font-mono">LP管理</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-2 py-0.5">{rows.length}件</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchPages} className="rounded-none h-8 w-8 p-0 border-border">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button 
            size="sm" 
            onClick={handleGenerateAll} 
            disabled={generating}
            className="rounded-none h-8 text-xs uppercase tracking-widest"
          >
            {generating ? "生成中..." : "未作成のLPを一括生成"}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-muted/20 animate-pulse border border-border"></div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 border border-border bg-muted/5">
              <LayoutTemplate className="w-12 h-12 mx-auto text-muted-foreground opacity-30 mb-4" />
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest mb-2">LPがありません</p>
              <p className="text-xs text-muted-foreground">「一括生成」ボタンからビジネス用の公開ページを作成できます。</p>
            </div>
          ) : (
            rows.map(({ page, businessName, views, ctaClicks }) => {
              const isEditing = editingId === page.id;
              
              return (
                <div key={page.id} className="border border-border bg-card">
                  <div className="border-b border-border p-4 bg-muted/5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${page.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                      <span className="font-bold text-sm">{businessName}</span>
                      <Badge variant={page.approved ? "default" : "secondary"} className="rounded-none text-[10px] font-mono tracking-widest uppercase">
                        {page.approved ? "確認済" : "未確認"}
                      </Badge>
                      <Badge variant="outline" className="rounded-none text-[10px] font-mono tracking-widest uppercase border-border">
                        {page.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                      <span>PV: {views}</span>
                      <span>CTA: {ctaClicks}</span>
                      <span className="text-muted-foreground/50">|</span>
                      <div className="flex items-center gap-2">
                        <span>公開</span>
                        <Switch 
                          checked={page.status === 'published'} 
                          onCheckedChange={() => handleToggleStatus(page.id, page.status, page.approved)}
                        />
                      </div>
                      {page.status === 'published' && (
                        <a href={`/lp/${page.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-foreground hover:underline underline-offset-4">
                          確認 <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="p-5">
                    {isEditing ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">スラッグ (URL)</label>
                            <Input 
                              value={editForm.slug ?? page.slug} 
                              onChange={e => setEditForm(prev => ({ ...prev, slug: e.target.value }))}
                              className="rounded-none border-border h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">タイトル (SEO)</label>
                            <Input 
                              value={editForm.title ?? page.title} 
                              onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                              className="rounded-none border-border h-9 text-xs"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">見出し (H1)</label>
                          <Input 
                            value={editForm.headline ?? page.headline} 
                            onChange={e => setEditForm(prev => ({ ...prev, headline: e.target.value }))}
                            className="rounded-none border-border h-9 text-xs font-bold"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">サブ見出し</label>
                          <Textarea 
                            value={editForm.subheadline ?? page.subheadline} 
                            onChange={e => setEditForm(prev => ({ ...prev, subheadline: e.target.value }))}
                            className="rounded-none border-border min-h-[60px] text-xs resize-y"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CTA ラベル</label>
                            <Input 
                              value={editForm.ctaLabel ?? page.ctaLabel ?? ''} 
                              onChange={e => setEditForm(prev => ({ ...prev, ctaLabel: e.target.value }))}
                              className="rounded-none border-border h-9 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">CTA URL</label>
                            <Input 
                              value={editForm.ctaUrl ?? page.ctaUrl ?? ''} 
                              onChange={e => setEditForm(prev => ({ ...prev, ctaUrl: e.target.value }))}
                              className="rounded-none border-border h-9 text-xs font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <div className="flex items-center gap-2 mr-auto">
                            <Switch 
                              checked={editForm.approved ?? page.approved} 
                              onCheckedChange={c => setEditForm(prev => ({ ...prev, approved: c }))}
                            />
                            <label className="text-xs font-mono tracking-widest uppercase">内容を確認済みとする</label>
                          </div>
                          
                          <Button variant="outline" size="sm" onClick={() => setEditingId(null)} className="rounded-none h-8 text-xs uppercase tracking-widest">
                            キャンセル
                          </Button>
                          <Button size="sm" onClick={() => handleSave(page.id)} className="rounded-none h-8 text-xs uppercase tracking-widest gap-2">
                            <Save className="w-3.5 h-3.5" /> 保存
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-xl font-bold mb-2">{page.headline}</h3>
                          <p className="text-sm text-muted-foreground">{page.subheadline}</p>
                        </div>
                        <div className="flex items-center gap-4 border-t border-border pt-4">
                          <Button variant="outline" size="sm" onClick={() => { setEditingId(page.id); setEditForm({}); }} className="rounded-none h-8 text-xs uppercase tracking-widest gap-2">
                            <PenTool className="w-3.5 h-3.5" /> 編集
                          </Button>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            /{page.slug}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
