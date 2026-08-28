import { useEffect, useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { ShieldCheck, AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Mail, Search, Server } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type AuditData = {
  business: { id: number; name: string; serviceUrl: string | null };
  checks: Array<{ level: "error" | "warning"; message: string }>;
  status: "blocked" | "review" | "ready";
  templates: Array<{
    id: number;
    name: string;
    issues: Array<{ level: "error" | "warning"; message: string }>;
    preview: { subject: string; html: string };
  }>;
  sampleLead: { id: number; companyName: string; email: string } | null;
  schedules: any[];
  readiness: {
    collection: boolean;
    sending: boolean;
    smtp: { ready: boolean; checkedAt: string; error?: string };
    leadCount: number;
    emailCount: number;
    unsentEmailCount: number;
    profile: { keyword: string; persona: string } | null;
  };
};

export default function AuditPage() {
  const { selectedBusinessId } = useBusiness();
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch("/api/business-audit", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : []))
      .then((audits: AuditData[]) => {
        const match = audits.find((a) => a.business.id === selectedBusinessId);
        setData(match || null);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [selectedBusinessId]);

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-3">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">ビジネスを選択してください</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-muted/20 animate-pulse border border-border"></div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-3">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">監査データがありません</p>
        </div>
      </div>
    );
  }

  const errorCount = data.checks.filter(c => c.level === "error").length;
  const warningCount = data.checks.filter(c => c.level === "warning").length;

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-muted/5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="font-bold text-sm uppercase tracking-widest font-mono">送信・文章監査</span>
          <Badge variant={data.status === "ready" ? "default" : data.status === "blocked" ? "destructive" : "secondary"} className="rounded-none font-mono text-[10px] uppercase tracking-widest">
            {data.status}
          </Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-5xl mx-auto space-y-8">
          
          {/* Summary Section */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border border border-border">
            <div className="bg-card p-6">
              <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-4">総評</div>
              <div className="flex items-center gap-3">
                {data.status === "ready" ? (
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                ) : data.status === "blocked" ? (
                  <AlertCircle className="w-8 h-8 text-destructive" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-yellow-500" />
                )}
                <div>
                  <div className="font-bold text-lg">
                    {data.status === "ready" ? "送信可能" : data.status === "blocked" ? "送信ブロック" : "要確認"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {errorCount} エラー, {warningCount} 警告
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card p-6">
              <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-4">リスト収集</div>
              <div className="flex items-center gap-2">
                <Search className={`w-5 h-5 ${data.readiness.collection ? "text-green-500" : "text-destructive"}`} />
                <div className="font-bold text-sm">{data.readiness.collection ? "準備完了" : "設定不足"}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">{data.readiness.leadCount}件 / メールあり {data.readiness.emailCount}件</div>
            </div>
            <div className="bg-card p-6">
              <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-4">メール送信</div>
              <div className="flex items-center gap-2">
                <Mail className={`w-5 h-5 ${data.readiness.sending ? "text-green-500" : "text-yellow-500"}`} />
                <div className="font-bold text-sm">{data.readiness.sending ? "送信可能" : "安全停止中"}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">未送信 {data.readiness.unsentEmailCount}件</div>
            </div>
            <div className="bg-card p-6">
              <div className="text-[10px] font-mono text-muted-foreground tracking-widest uppercase mb-4">SMTP</div>
              <div className="flex items-center gap-2">
                <Server className={`w-5 h-5 ${data.readiness.smtp.ready ? "text-green-500" : "text-destructive"}`} />
                <div className="font-bold text-sm">{data.readiness.smtp.ready ? "接続済み" : "接続不可"}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-2">{new Date(data.readiness.smtp.checkedAt).toLocaleString("ja-JP")}</div>
            </div>
          </div>

          {data.readiness.profile && (
            <div className="border border-border bg-card p-4">
              <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">法人向け収集条件</div>
              <div className="text-sm font-medium">{data.readiness.profile.keyword}</div>
              <div className="text-xs text-muted-foreground mt-1">個人向けフリーメールを除外し、公開された法人窓口のみを保存します。</div>
            </div>
          )}

          {/* Issues List */}
          {data.checks.length > 0 && (
            <div className="border border-border bg-card">
              <div className="border-b border-border p-4 bg-muted/10 text-[11px] font-mono font-bold tracking-widest uppercase">
                検出された問題 ({data.checks.length})
              </div>
              <div className="divide-y divide-border">
                {data.checks.map((check, i) => (
                  <div key={i} className="p-4 flex items-start gap-3">
                    {check.level === "error" ? (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                    )}
                    <div className="text-sm">{check.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Templates Preview */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold tracking-widest uppercase font-mono border-b border-border pb-2">テンプレートプレビュー</h2>
            {data.templates.length === 0 ? (
              <div className="text-sm text-muted-foreground border border-border p-8 text-center bg-muted/5">
                テンプレートがありません。<Link href="/templates" className="text-foreground underline underline-offset-4">作成</Link>してください。
              </div>
            ) : (
              data.templates.map(template => (
                <div key={template.id} className="border border-border bg-card overflow-hidden">
                  <div className="border-b border-border p-4 bg-muted/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="font-bold text-sm">{template.name}</span>
                    </div>
                    {template.issues.length > 0 && (
                      <Badge variant="destructive" className="rounded-none text-[10px] font-mono uppercase">
                        {template.issues.length} 問題
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
                    {/* Issues specific to this template */}
                    <div className="bg-card p-4 space-y-4">
                      <div>
                        <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">プレビュー件名</div>
                        <div className="text-sm font-medium border border-border p-3 bg-muted/5">
                          {template.preview.subject}
                        </div>
                      </div>
                      {template.issues.length > 0 && (
                        <div>
                          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-2">固有の問題</div>
                          <ul className="space-y-2">
                            {template.issues.map((issue, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-destructive">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                {issue.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="pt-4 border-t border-border">
                        <Link href="/templates">
                          <Button variant="outline" size="sm" className="rounded-none text-xs tracking-widest uppercase w-full">
                            テンプレートを編集 <ChevronRight className="w-3.5 h-3.5 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                    
                    {/* HTML Preview Render */}
                    <div className="bg-white text-black p-0 h-[400px] overflow-auto relative">
                      <div className="absolute top-2 right-2 z-10 bg-black/80 text-white text-[10px] font-mono px-2 py-1 tracking-widest uppercase">
                        HTML Preview
                      </div>
                      <iframe
                        srcDoc={template.preview.html}
                        sandbox=""
                        className="w-full h-full border-0"
                        title={`Preview ${template.name}`}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
