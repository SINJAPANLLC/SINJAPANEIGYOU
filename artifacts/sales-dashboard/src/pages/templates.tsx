import { useState } from "react";
import { 
  useListTemplates, 
  useCreateTemplate, 
  useUpdateTemplate, 
  useDeleteTemplate, 
  getListTemplatesQueryKey 
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Plus, Building2, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

const templateSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  subjectTemplate: z.string().min(1, "件名テンプレートは必須です"),
  htmlTemplate: z.string().min(1, "HTMLテンプレートは必須です"),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

const STARTER_TEMPLATES: Array<{ label: string; name: string; subjectTemplate: string; htmlTemplate: string }> = [
  {
    label: "ミニマル・モノクロ",
    name: "ミニマル初回アプローチ",
    subjectTemplate: "{{company_name}}様へ — {{service_name}}のご紹介",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;color:#111111;">
  <div style="padding:48px 48px 0;">
    <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#999;margin-bottom:40px;">{{service_name}}</div>
    <h1 style="font-size:28px;font-weight:700;line-height:1.2;margin:0 0 24px;letter-spacing:-0.02em;">{{company_name}}様、<br>はじめまして。</h1>
    <p style="font-size:15px;line-height:1.8;color:#444;margin:0 0 20px;">突然のご連絡、失礼いたします。<br>私どもは<strong>{{service_name}}</strong>を提供しております。</p>
    <p style="font-size:15px;line-height:1.8;color:#444;margin:0 0 32px;">貴社の営業活動をより効率的にするために、一度お話しさせていただけますでしょうか。</p>
    <a href="{{service_url}}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;padding:14px 32px;margin-bottom:48px;">詳細を見る →</a>
  </div>
  <div style="border-top:1px solid #eee;padding:24px 48px;font-size:11px;color:#bbb;letter-spacing:0.05em;">
    {{service_name}} | <a href="{{service_url}}" style="color:#bbb;">{{service_url}}</a>
  </div>
</div>`,
  },
  {
    label: "グラデーション・モダン",
    name: "モダングラデーション提案",
    subjectTemplate: "【{{service_name}}】{{company_name}}様の課題を解決する方法",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0a0a0a;color:#ffffff;">
  <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);padding:60px 48px;text-align:center;">
    <div style="display:inline-block;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);padding:6px 16px;border-radius:20px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:28px;">{{service_name}}</div>
    <h1 style="font-size:32px;font-weight:800;line-height:1.15;margin:0 0 16px;letter-spacing:-0.03em;">{{company_name}}様へ<br><span style="background:linear-gradient(90deg,#a78bfa,#60a5fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">特別なご提案</span></h1>
    <p style="font-size:15px;color:rgba(255,255,255,0.6);margin:0;line-height:1.7;">貴社の成長をサポートする<br>ソリューションをご紹介します</p>
  </div>
  <div style="padding:48px;background:#111;">
    <p style="font-size:15px;line-height:1.8;color:#ccc;margin:0 0 24px;">突然のご連絡、失礼いたします。私どもは<strong style="color:#fff;">{{service_name}}</strong>を運営しております。</p>
    <p style="font-size:15px;line-height:1.8;color:#ccc;margin:0 0 32px;">{{company_name}}様のビジネスに貢献できると確信しており、ぜひ一度詳細をご覧いただけますと幸いです。</p>
    <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:24px;margin-bottom:32px;">
      <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#666;margin-bottom:12px;">主な特徴</div>
      <div style="font-size:14px;color:#aaa;line-height:2;">✦ 導入企業の97%が満足と回答<br>✦ 30日間無料でお試し可能<br>✦ 専任サポートが付属</div>
    </div>
    <a href="{{service_url}}" style="display:block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;padding:16px;text-align:center;border-radius:4px;font-weight:700;">無料で試してみる →</a>
  </div>
  <div style="padding:24px 48px;background:#0a0a0a;text-align:center;font-size:11px;color:#444;">
    <a href="{{service_url}}" style="color:#555;text-decoration:none;">{{service_name}}</a> &nbsp;·&nbsp; 配信停止は<a href="#unsubscribe" style="color:#555;">こちら</a>
  </div>
</div>`,
  },
  {
    label: "エレガント・ホワイト",
    name: "エレガント提案メール",
    subjectTemplate: "{{company_name}}様へ — ご検討いただきたいご提案",
    htmlTemplate: `<div style="max-width:560px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;background:#faf9f7;color:#2c2c2c;">
  <div style="padding:56px 56px 0;text-align:center;">
    <div style="width:40px;height:1px;background:#2c2c2c;margin:0 auto 24px;"></div>
    <div style="font-size:10px;letter-spacing:0.25em;text-transform:uppercase;color:#888;margin-bottom:40px;">{{service_name}}</div>
    <div style="width:40px;height:1px;background:#2c2c2c;margin:0 auto 40px;"></div>
  </div>
  <div style="padding:0 56px 40px;">
    <h2 style="font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#888;font-weight:400;margin:0 0 16px;">{{company_name}} 御中</h2>
    <h1 style="font-size:26px;font-weight:700;line-height:1.3;margin:0 0 28px;color:#1a1a1a;letter-spacing:-0.01em;">拝啓、貴社のご発展を<br>心よりお慶び申し上げます。</h1>
    <p style="font-size:14px;line-height:2;color:#555;margin:0 0 20px;">この度は、弊社サービス<strong style="color:#2c2c2c;">{{service_name}}</strong>についてご案内申し上げたく、ご連絡いたしました。</p>
    <p style="font-size:14px;line-height:2;color:#555;margin:0 0 36px;">貴社のご状況に合わせた最適なプランをご提案できますため、ぜひ一度ご覧いただけますと幸いでございます。</p>
    <div style="border-top:1px solid #e0ddd8;border-bottom:1px solid #e0ddd8;padding:24px 0;margin-bottom:36px;text-align:center;">
      <a href="{{service_url}}" style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#2c2c2c;text-decoration:none;font-family:'Helvetica Neue',sans-serif;font-weight:600;">詳細はこちら &nbsp; →</a>
    </div>
    <p style="font-size:13px;line-height:1.8;color:#888;margin:0;">敬具<br><strong style="color:#555;">{{service_name}} 営業部</strong></p>
  </div>
  <div style="padding:24px 56px;border-top:1px solid #e0ddd8;font-size:10px;color:#bbb;letter-spacing:0.08em;font-family:'Helvetica Neue',sans-serif;">
    {{service_url}} &nbsp;|&nbsp; <a href="#unsubscribe" style="color:#bbb;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "ネオン・テック",
    name: "テック系ネオン提案",
    subjectTemplate: "{{company_name}}様、{{service_name}}で営業効率3倍へ",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Courier New',Courier,monospace;background:#020617;color:#e2e8f0;">
  <div style="padding:48px;border-bottom:1px solid #1e293b;">
    <div style="font-size:10px;letter-spacing:0.2em;color:#22d3ee;margin-bottom:32px;">// {{service_name}}</div>
    <h1 style="font-size:30px;font-weight:700;line-height:1.2;margin:0 0 8px;letter-spacing:-0.02em;">こんにちは、<br><span style="color:#22d3ee;">{{company_name}}</span>様。</h1>
    <div style="width:48px;height:2px;background:linear-gradient(90deg,#22d3ee,#818cf8);margin:20px 0 28px;"></div>
    <p style="font-size:14px;line-height:1.9;color:#94a3b8;margin:0 0 20px;">私たちは<strong style="color:#e2e8f0;">{{service_name}}</strong>を通じて、B2B営業チームの効率を劇的に向上させています。</p>
    <p style="font-size:14px;line-height:1.9;color:#94a3b8;margin:0 0 36px;">30分のデモセッションで、貴社の課題に対する具体的な解決策をご提示できます。</p>
    <div style="display:grid;margin-bottom:36px;">
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:2px solid #22d3ee;padding:16px 20px;margin-bottom:8px;">
        <span style="font-size:11px;color:#22d3ee;">01 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">AIによる自動リード収集</span>
      </div>
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:2px solid #818cf8;padding:16px 20px;margin-bottom:8px;">
        <span style="font-size:11px;color:#818cf8;">02 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">パーソナライズドメール自動生成</span>
      </div>
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:2px solid #f472b6;padding:16px 20px;">
        <span style="font-size:11px;color:#f472b6;">03 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">リアルタイム開封・クリック追跡</span>
      </div>
    </div>
    <a href="{{service_url}}" style="display:inline-block;border:1px solid #22d3ee;color:#22d3ee;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;padding:14px 28px;">デモを予約する →</a>
  </div>
  <div style="padding:20px 48px;font-size:10px;color:#334155;letter-spacing:0.1em;">
    {{service_name}} · <a href="{{service_url}}" style="color:#334155;text-decoration:none;">{{service_url}}</a> · <a href="#unsubscribe" style="color:#334155;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
];

export default function TemplatesPage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStarters, setShowStarters] = useState(false);
  const [previewMode, setPreviewMode] = useState<"code" | "preview" | "split">("split");

  const { data: templates, isLoading } = useListTemplates(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
        queryKey: getListTemplatesQueryKey({ businessId: selectedBusinessId ?? undefined })
      }
    }
  );

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: { name: "", subjectTemplate: "", htmlTemplate: "" },
  });

  const handleAiGenerate = async () => {
    if (!aiDescription.trim() || aiDescription.trim().length < 5) {
      toast({ title: "説明文を5文字以上入力してください", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: aiDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失敗");
      form.reset({ name: data.name, subjectTemplate: data.subjectTemplate, htmlTemplate: data.htmlTemplate });
      setIsAiOpen(false);
      setAiDescription("");
      setShowStarters(false);
      setIsCreateOpen(true);
      toast({ title: "AIがテンプレートを生成しました。内容を確認して保存してください。" });
    } catch (err: any) {
      toast({ title: err.message || "AI生成に失敗しました", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const applyStarter = (starter: typeof STARTER_TEMPLATES[0]) => {
    form.reset({ name: starter.name, subjectTemplate: starter.subjectTemplate, htmlTemplate: starter.htmlTemplate });
    setShowStarters(false);
    setIsCreateOpen(true);
  };

  const onCreateSubmit = (data: TemplateFormValues) => {
    if (!selectedBusinessId) return;
    createMutation.mutate(
      { data: { ...data, businessId: selectedBusinessId } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setIsCreateOpen(false);
          setSelectedTemplateId(res.id);
          toast({ title: "テンプレートを作成しました" });
          form.reset();
        },
        onError: () => toast({ title: "テンプレートの作成に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleUpdate = (id: number, data: Partial<TemplateFormValues>) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          toast({ title: "テンプレートを保存しました" });
        },
        onError: () => toast({ title: "保存に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          if (selectedTemplateId === id) setSelectedTemplateId(null);
          toast({ title: "テンプレートを削除しました" });
        },
        onError: () => toast({ title: "削除に失敗しました", variant: "destructive" })
      }
    );
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-md border border-dashed border-border p-12">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-bold">ビジネスを選択してください</h2>
          <p className="text-muted-foreground text-sm">メールテンプレートを管理するには、ビジネスを選択してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <h1 className="font-bold tracking-tight text-sm uppercase font-mono">メールテンプレート</h1>

        <div className="flex items-center gap-2">
          {/* AI生成ダイアログ */}
          <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border">
                <Sparkles className="w-3 h-3 mr-2" /> AI生成
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> AIでテンプレートを生成
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono">どんなメールを作りたいか説明してください</Label>
                  <Textarea
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                    placeholder="例: SaaS営業ツールを中小企業に紹介する初回アプローチメール。丁寧で押しつけがましくない感じで。無料トライアルへの誘導を含める。"
                    className="rounded-none border-border text-sm h-32 resize-none"
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground">業種・トーン・目的などを具体的に書くほど精度が上がります</p>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => { setIsAiOpen(false); setAiDescription(""); }} className="rounded-none text-xs uppercase tracking-widest" disabled={isGenerating}>
                  キャンセル
                </Button>
                <Button onClick={handleAiGenerate} disabled={isGenerating || aiDescription.trim().length < 5} className="rounded-none text-xs uppercase tracking-widest">
                  {isGenerating ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" />生成中...</> : <><Sparkles className="w-3 h-3 mr-2" />生成する</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* スターターテンプレート選択 */}
          <Dialog open={showStarters} onOpenChange={setShowStarters}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border">
                サンプルから選ぶ
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-2xl">
              <DialogHeader>
                <DialogTitle className="font-bold">スターターテンプレートを選ぶ</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {STARTER_TEMPLATES.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => applyStarter(s)}
                    className="text-left border border-border p-4 hover:border-foreground hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground group-hover:text-foreground">{s.label}</span>
                    </div>
                    <div className="text-sm font-bold mb-1 truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.subjectTemplate}</div>
                    <div
                      className="mt-3 rounded overflow-hidden border border-border bg-white"
                      style={{ height: 80, pointerEvents: "none" }}
                    >
                      <iframe
                        srcDoc={s.htmlTemplate}
                        title={s.label}
                        className="w-full h-full border-0 scale-75 origin-top-left"
                        style={{ width: "133%", height: "133%", transform: "scale(0.75)", transformOrigin: "top left" }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          {/* 手動作成ダイアログ */}
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) form.reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-none h-8 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">
                <Plus className="w-3 h-3 mr-2" /> 新規作成
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-bold">テンプレートを作成</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">テンプレート名</FormLabel>
                      <FormControl><Input placeholder="例: 初回アプローチv1" className="rounded-none border-border" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="subjectTemplate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">件名テンプレート</FormLabel>
                      <FormControl><Input placeholder="{{company_name}}様へ特別なご提案" className="rounded-none border-border" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="htmlTemplate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">HTML本文</FormLabel>
                      <FormControl><Textarea placeholder="<p>こんにちは...</p>" className="rounded-none border-border font-mono text-xs h-40 resize-none" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); form.reset(); }} className="rounded-none text-xs uppercase tracking-widest">キャンセル</Button>
                    <Button type="submit" disabled={createMutation.isPending} className="rounded-none text-xs uppercase tracking-widest">作成する</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左カラム */}
        <div className="w-1/3 min-w-[280px] border-r border-border bg-card flex flex-col">
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1,2].map(i => <div key={i} className="h-16 animate-pulse bg-muted/40 border border-border" />)}
              </div>
            ) : templates?.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <FileText className="w-6 h-6 text-muted-foreground mx-auto opacity-30" />
                <p className="text-sm text-muted-foreground">テンプレートがありません</p>
                <p className="text-xs text-muted-foreground">「サンプルから選ぶ」または「AI生成」で始めましょう</p>
              </div>
            ) : (
              <div className="divide-y divide-border border-b border-border">
                {templates?.map(template => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`p-4 cursor-pointer transition-colors group relative ${selectedTemplateId === template.id ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50 border-l-2 border-l-transparent'}`}
                  >
                    <div className="pr-8">
                      <h4 className="font-bold text-sm truncate">{template.name}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-1">{template.subjectTemplate}</p>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 右カラム: エディタ */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedTemplateId && selectedTemplate ? (
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">テンプレートを編集</h2>
                <Button
                  onClick={() => handleUpdate(selectedTemplate.id, {
                    name: selectedTemplate.name,
                    subjectTemplate: selectedTemplate.subjectTemplate,
                    htmlTemplate: selectedTemplate.htmlTemplate
                  })}
                  disabled={updateMutation.isPending}
                  className="rounded-none text-xs uppercase tracking-widest h-8"
                >
                  {updateMutation.isPending ? "保存中..." : "変更を保存"}
                </Button>
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">テンプレート名</Label>
                <Input
                  value={selectedTemplate.name}
                  onChange={e => {
                    const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, name: e.target.value } : t);
                    queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                  }}
                  className="rounded-none border-border font-bold text-lg h-12"
                />
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">件名テンプレート</Label>
                <Input
                  value={selectedTemplate.subjectTemplate}
                  onChange={e => {
                    const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, subjectTemplate: e.target.value } : t);
                    queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                  }}
                  className="rounded-none border-border"
                />
              </div>

              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">HTML本文</Label>
                  <div className="flex text-xs border border-border">
                    {(["code", "preview", "split"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPreviewMode(mode)}
                        className={`px-3 py-1 font-mono uppercase tracking-widest transition-colors ${previewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {mode === "code" ? "コード" : mode === "preview" ? "プレビュー" : "分割"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex border border-border min-h-0">
                  {(previewMode === "code" || previewMode === "split") && (
                    <Textarea
                      value={selectedTemplate.htmlTemplate}
                      onChange={e => {
                        const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, htmlTemplate: e.target.value } : t);
                        queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                      }}
                      className={`resize-none rounded-none border-0 font-mono text-xs p-4 shadow-none focus-visible:ring-0 leading-relaxed bg-muted/10 ${previewMode === "split" ? "w-1/2" : "flex-1"}`}
                    />
                  )}
                  {(previewMode === "preview" || previewMode === "split") && (
                    <div className={`${previewMode === "split" ? "w-1/2 border-l border-border" : "flex-1"} bg-white overflow-hidden`}>
                      <iframe
                        srcDoc={selectedTemplate.htmlTemplate || "<p style='color:#999;font-family:sans-serif;padding:16px'>HTMLを入力するとここにプレビューが表示されます</p>"}
                        title="メールプレビュー"
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8 text-center font-mono text-xs uppercase tracking-widest">
              <div className="space-y-4">
                <FileText className="w-8 h-8 mx-auto opacity-20" />
                <p>テンプレートを選択して編集</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
