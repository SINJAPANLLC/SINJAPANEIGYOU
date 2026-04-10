import { useState, useEffect } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Plus, Trash2, Building2, RefreshCw, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

type CronJob = {
  id: number;
  businessId: number;
  name: string;
  type: string;
  cronExpression: string;
  config: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
};

type Template = {
  id: number;
  name: string;
  subjectTemplate: string;
};

const TYPE_LABELS: Record<string, string> = {
  lead_search_and_send: "収集＋メール送信",
  lead_search: "リード自動収集",
  email_send: "メール自動送信",
};

const PRESET_SCHEDULES = [
  { label: "毎日 午前9時", value: "0 9 * * *" },
  { label: "毎日 午後1時", value: "0 13 * * *" },
  { label: "毎週月曜 午前9時", value: "0 9 * * 1" },
  { label: "毎週金曜 午前10時", value: "0 10 * * 5" },
  { label: "毎月1日 午前9時", value: "0 9 1 * *" },
  { label: "カスタム", value: "custom" },
];

function parseCron(expr: string) {
  const preset = PRESET_SCHEDULES.find(p => p.value === expr && p.value !== "custom");
  return preset ? preset.label : expr;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit"
  }).format(new Date(dateStr));
}

const DEFAULT_FORM = {
  name: "",
  type: "lead_search_and_send",
  schedulePreset: "0 9 * * 1",
  cronExpression: "0 9 * * 1",
  keyword: "",
  location: "",
  maxResults: "10",
  templateId: "",
};

export default function SchedulePage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [form, setForm] = useState(DEFAULT_FORM);

  const fetchJobs = async () => {
    if (!selectedBusinessId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/cron-jobs?businessId=${selectedBusinessId}`, { credentials: "include" });
      if (res.ok) setJobs(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    if (!selectedBusinessId) return;
    const res = await fetch(`/api/templates?businessId=${selectedBusinessId}`, { credentials: "include" });
    if (res.ok) setTemplates(await res.json());
  };

  useEffect(() => {
    fetchJobs();
    fetchTemplates();
  }, [selectedBusinessId]);

  const handleCreate = async () => {
    if (!selectedBusinessId || !form.name || !form.cronExpression) return;

    const config: Record<string, unknown> = {};
    if (form.type === "lead_search" || form.type === "lead_search_and_send") {
      config.keyword = form.keyword;
      config.location = form.location;
      config.maxResults = Number(form.maxResults);
    }
    if (form.type === "email_send" || form.type === "lead_search_and_send") {
      if (form.templateId && form.templateId !== "none") config.templateId = Number(form.templateId);
    }

    const res = await fetch("/api/cron-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        businessId: selectedBusinessId,
        name: form.name,
        type: form.type,
        cronExpression: form.cronExpression,
        config,
        isActive: true,
      }),
    });
    if (res.ok) {
      toast({ title: "スケジュールを作成しました" });
      setIsCreateOpen(false);
      setForm(DEFAULT_FORM);
      fetchJobs();
    } else {
      toast({ title: "作成に失敗しました", variant: "destructive" });
    }
  };

  const handleToggle = async (job: CronJob) => {
    const res = await fetch(`/api/cron-jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !job.isActive }),
    });
    if (res.ok) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, isActive: !j.isActive } : j));
      toast({ title: `スケジュールを${!job.isActive ? "有効" : "無効"}にしました` });
    }
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/cron-jobs/${id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setJobs(prev => prev.filter(j => j.id !== id));
      toast({ title: "スケジュールを削除しました" });
    } else {
      toast({ title: "削除に失敗しました", variant: "destructive" });
    }
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-3">
          <Building2 className="w-8 h-8 mx-auto text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">ビジネスを選択してください</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* ヘッダー */}
      <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-muted/5">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="font-bold text-sm uppercase tracking-widest font-mono">スケジュール</span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border px-2 py-0.5">{jobs.length}件</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={fetchJobs} className="rounded-none h-8 w-8 p-0 border-border">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={open => { setIsCreateOpen(open); if (open) fetchTemplates(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-none h-8 text-xs uppercase tracking-widest">
                <Plus className="w-3 h-3 mr-2" /> 新規作成
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-lg max-h-[90vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="font-bold font-mono tracking-widest uppercase text-sm">スケジュールを作成</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto min-h-0">
              <div className="space-y-5 py-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">スケジュール名</Label>
                  <Input
                    placeholder="例: 毎週月曜 リード収集"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="rounded-none border-border h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">タスクタイプ</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v, templateId: "" }))}>
                    <SelectTrigger className="rounded-none border-border h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      <SelectItem value="lead_search_and_send" className="rounded-none text-sm">収集＋メール送信（おすすめ）</SelectItem>
                      <SelectItem value="lead_search" className="rounded-none text-sm">リード自動収集のみ</SelectItem>
                      <SelectItem value="email_send" className="rounded-none text-sm">メール自動送信のみ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">実行タイミング</Label>
                  <Select
                    value={form.schedulePreset}
                    onValueChange={v => setForm(f => ({
                      ...f,
                      schedulePreset: v,
                      cronExpression: v === "custom" ? f.cronExpression : v,
                    }))}
                  >
                    <SelectTrigger className="rounded-none border-border h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-border">
                      {PRESET_SCHEDULES.map(p => (
                        <SelectItem key={p.value} value={p.value} className="rounded-none text-sm">{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.schedulePreset === "custom" && (
                    <div className="space-y-1">
                      <Input
                        placeholder="例: 0 9 * * 1 (分 時 日 月 曜)"
                        value={form.cronExpression}
                        onChange={e => setForm(f => ({ ...f, cronExpression: e.target.value }))}
                        className="rounded-none border-border h-9 font-mono text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground font-mono">分 時 日 月 曜 の順で入力</p>
                    </div>
                  )}
                </div>

                {(form.type === "lead_search" || form.type === "lead_search_and_send") && (
                  <div className="space-y-3 border border-border p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">収集設定</p>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-mono text-muted-foreground">キーワード</Label>
                      <Input
                        placeholder="例: IT企業 東京"
                        value={form.keyword}
                        onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
                        className="rounded-none border-border h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-mono text-muted-foreground">地域 (任意)</Label>
                      <Input
                        placeholder="例: 渋谷区"
                        value={form.location}
                        onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                        className="rounded-none border-border h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-mono text-muted-foreground">最大件数</Label>
                      <Select value={form.maxResults} onValueChange={v => setForm(f => ({ ...f, maxResults: v }))}>
                        <SelectTrigger className="rounded-none border-border h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border-border">
                          {["5", "10", "20", "30", "50"].map(n => (
                            <SelectItem key={n} value={n} className="rounded-none text-sm">{n}件</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {(form.type === "email_send" || form.type === "lead_search_and_send") && (
                  <div className="space-y-3 border border-border p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">送信設定</p>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-mono text-muted-foreground">使用テンプレート</Label>
                      {templates.length === 0 ? (
                        <div className="h-9 border border-border flex items-center px-3 text-sm text-muted-foreground font-mono">
                          テンプレートがありません
                        </div>
                      ) : (
                        <Select value={form.templateId} onValueChange={v => setForm(f => ({ ...f, templateId: v }))}>
                          <SelectTrigger className="rounded-none border-border h-9 text-sm">
                            <SelectValue placeholder="テンプレートを選択（任意）" />
                          </SelectTrigger>
                          <SelectContent className="rounded-none border-border">
                            <SelectItem value="none" className="rounded-none text-sm text-muted-foreground">指定なし（最初のテンプレートを使用）</SelectItem>
                            {templates.map(t => (
                              <SelectItem key={t.id} value={String(t.id)} className="rounded-none text-sm">
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <p className="text-[10px] text-muted-foreground font-mono">未選択の場合は最初のテンプレートが使われます</p>
                    </div>
                    <div className="bg-muted/30 border border-border p-3 text-[11px] font-mono text-muted-foreground space-y-1">
                      {form.type === "lead_search_and_send"
                        ? <p>対象: 今回収集した新規リード（email あり）に即時送信</p>
                        : <p>対象: 未送信リード（email あり）</p>
                      }
                      <p>変数: {"{{company_name}}"} が会社名に自動置換されます</p>
                    </div>
                  </div>
                )}
              </div>
              </div>
              <DialogFooter className="shrink-0 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-none text-xs uppercase tracking-widest h-9">キャンセル</Button>
                <Button onClick={handleCreate} disabled={!form.name || !form.cronExpression} className="rounded-none text-xs uppercase tracking-widest h-9">
                  作成する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* コンテンツ */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 animate-pulse bg-muted/40 border border-border" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
            <Clock className="w-8 h-8 text-muted-foreground opacity-20" />
            <div>
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">スケジュールがありません</p>
              <p className="text-xs text-muted-foreground mt-1">「新規作成」から自動実行を設定できます</p>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-3">
            {jobs.map(job => {
              const config = (() => { try { return JSON.parse(job.config); } catch { return {}; } })();
              const templateName = config.templateId
                ? (templates.find(t => t.id === Number(config.templateId))?.name ?? `テンプレートID: ${config.templateId}`)
                : null;
              return (
                <div
                  key={job.id}
                  className={`border border-border bg-card p-5 flex items-start gap-4 transition-opacity ${job.isActive ? "" : "opacity-50"}`}
                >
                  {/* ステータスドット */}
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${job.isActive ? "bg-green-500" : "bg-muted-foreground"}`} />

                  {/* 情報 */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-sm">{job.name}</h3>
                      <span className="text-[10px] font-mono border border-border px-1.5 py-0.5 text-muted-foreground uppercase tracking-widest">
                        {TYPE_LABELS[job.type] ?? job.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-5 text-xs font-mono text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {parseCron(job.cronExpression)}
                        <span className="text-muted-foreground/50">({job.cronExpression})</span>
                      </span>
                      {config.keyword && (
                        <span>キーワード: <span className="text-foreground">{config.keyword}</span></span>
                      )}
                      {config.location && (
                        <span>地域: <span className="text-foreground">{config.location}</span></span>
                      )}
                      {config.maxResults && (
                        <span>最大: <span className="text-foreground">{config.maxResults}件</span></span>
                      )}
                      {(job.type === "email_send" || job.type === "lead_search_and_send") && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          テンプレート: <span className="text-foreground">{templateName ?? "最初のテンプレート"}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-5 text-[10px] font-mono text-muted-foreground/60">
                      <span>最終実行: {formatDate(job.lastRunAt)}</span>
                    </div>
                  </div>

                  {/* コントロール */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground">{job.isActive ? "有効" : "無効"}</span>
                      <Switch
                        checked={job.isActive}
                        onCheckedChange={() => handleToggle(job)}
                        className="data-[state=checked]:bg-foreground"
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-bold">スケジュールを削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            「{job.name}」を削除します。この操作は元に戻せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(job.id)}
                            className="rounded-none text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            削除する
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
