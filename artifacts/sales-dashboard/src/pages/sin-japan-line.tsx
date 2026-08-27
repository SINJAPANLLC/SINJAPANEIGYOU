import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AirtableStatus = {
  configured: boolean;
  connection: "connected" | "not_configured" | "error";
  baseConfigured: boolean;
  tablesCached: boolean;
  error: string | null;
  lineConfigured: boolean;
  managerLineConfigured: boolean;
  webhookUrl: string;
};

type AirtableRecord = { table: string; recordId: string; title: string; content: string; createdAt: string | null };
type ChatMessage = { role: "user" | "assistant"; content: string; records?: AirtableRecord[] };
type DriverGroup = { id: number; groupId: string; groupType: "onboarding" | "operation"; status: string; createdAt: string };
type Driver = {
  id: number;
  name: string;
  airtableLookupKey: string;
  airtableRecordId: string | null;
  lineUserId: string | null;
  status: string;
  workflowStatus: "hired" | "onboarding" | "ready" | "operating" | "inactive";
  amazonAccountStatus: "not_required" | "pending" | "verified" | "needs_help";
  appsStatus: "pending" | "verified" | "needs_help";
  firstOperationDate: string | null;
  groups: DriverGroup[];
};
type LinkCode = { code: string; groupType: "onboarding" | "operation"; expiresAt: string; driverName: string };
type Escalation = {
  id: number;
  driverId: number;
  category: string;
  urgency: "urgent" | "high" | "normal";
  summary: string;
  status: string;
  createdAt: string;
  managerNotifiedAt: string | null;
};
type Resource = { id: number; title: string; url: string; phase: string; description: string | null };

const workflowStages = [
  { value: "hired", label: "採用確定", detail: "採用後グループを作成・紐付け" },
  { value: "onboarding", label: "準備・研修", detail: "登録・シフト・研修・契約・車両" },
  { value: "ready", label: "稼働準備完了", detail: "Amazon・アプリ・初回稼働日の確認" },
  { value: "operating", label: "稼働中", detail: "稼働用グループで日々の報告を受付" },
] as const;

const phaseLabels: Record<string, string> = {
  all: "全段階",
  hired: "採用確定",
  onboarding: "準備・研修",
  ready: "稼働準備完了",
  operating: "稼働中",
};

function formatDateTime(value: string | null) {
  if (!value) return "未送信";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || "通信に失敗しました");
  return data as T;
}

export default function SinJapanLinePage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<AirtableStatus | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [dailyReport, setDailyReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverKey, setNewDriverKey] = useState("");
  const [newDriverRecordId, setNewDriverRecordId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [codes, setCodes] = useState<Partial<Record<"onboarding" | "operation", LinkCode>>>({});
  const [driverQuestion, setDriverQuestion] = useState("");
  const [driverMessages, setDriverMessages] = useState<ChatMessage[]>([]);
  const [isDriverSending, setIsDriverSending] = useState(false);
  const [newResource, setNewResource] = useState({ title: "", url: "", phase: "onboarding", description: "" });
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  const loadDashboard = async () => {
    const [nextStatus, nextDrivers, nextEscalations, nextResources, report] = await Promise.all([
      requestJson<AirtableStatus>("/api/assistant/sin-japan-line/status"),
      requestJson<Driver[]>("/api/assistant/sin-japan-line/drivers"),
      requestJson<Escalation[]>("/api/assistant/sin-japan-line/escalations"),
      requestJson<Resource[]>("/api/assistant/sin-japan-line/resources"),
      requestJson<{ content: string }>("/api/assistant/sin-japan-line/daily-report"),
    ]);
    setStatus(nextStatus);
    setDrivers(nextDrivers);
    setEscalations(nextEscalations);
    setResources(nextResources);
    setDailyReport(report.content);
    setSelectedDriverId((current) => current ?? nextDrivers[0]?.id ?? null);
  };

  useEffect(() => {
    void loadDashboard()
      .catch((error: Error) => toast({ title: "運用情報を読み込めませんでした", description: error.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const selectedDriver = useMemo(() => drivers.find((driver) => driver.id === selectedDriverId) || null, [drivers, selectedDriverId]);

  const updateDriver = async (updates: Partial<Driver>) => {
    if (!selectedDriver) return;
    try {
      const driver = await requestJson<Driver>(`/api/assistant/sin-japan-line/drivers/${selectedDriver.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      setDrivers((current) => current.map((item) => item.id === driver.id ? { ...item, ...driver } : item));
      toast({ title: "ドライバーの進捗を更新しました" });
    } catch (error) {
      toast({ title: "更新できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const addDriver = async () => {
    const name = newDriverName.trim();
    if (!name) return;
    try {
      const driver = await requestJson<Driver>("/api/assistant/sin-japan-line/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, airtableLookupKey: newDriverKey.trim() || name, airtableRecordId: newDriverRecordId.trim() || null }),
      });
      setDrivers((current) => [{ ...driver, groups: [] }, ...current]);
      setSelectedDriverId(driver.id);
      setNewDriverName("");
      setNewDriverKey("");
      setNewDriverRecordId("");
      setCodes({});
      toast({ title: "ドライバーを登録しました" });
    } catch (error) {
      toast({ title: "ドライバー登録に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const removeDriver = async (driver: Driver) => {
    if (!window.confirm(`${driver.name}さんを無効にしますか？\n紐付いたグループは使えなくなります。`)) return;
    try {
      await requestJson(`/api/assistant/sin-japan-line/drivers/${driver.id}`, { method: "DELETE" });
      setDrivers((current) => current.filter((item) => item.id !== driver.id));
      if (selectedDriverId === driver.id) setSelectedDriverId(null);
      toast({ title: "ドライバーを無効にしました" });
    } catch (error) {
      toast({ title: "無効にできませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const issueCode = async (groupType: "onboarding" | "operation") => {
    if (!selectedDriver) return;
    try {
      const code = await requestJson<LinkCode>(`/api/assistant/sin-japan-line/drivers/${selectedDriver.id}/link-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupType }),
      });
      setCodes((current) => ({ ...current, [groupType]: code }));
      toast({ title: `${groupType === "operation" ? "稼働用" : "採用・面談用"}の認証コードを発行しました`, description: "15分以内にグループLINEで入力してください。" });
    } catch (error) {
      toast({ title: "認証コードを発行できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const askAsDriver = async () => {
    const text = driverQuestion.trim();
    if (!text || !selectedDriver || isDriverSending) return;
    setDriverQuestion("");
    setDriverMessages((current) => [...current, { role: "user", content: text }]);
    setIsDriverSending(true);
    try {
      const data = await requestJson<{ reply: string; airtable?: { records?: AirtableRecord[] } }>("/api/assistant/sin-japan-line/driver-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriver.id, text }),
      });
      setDriverMessages((current) => [...current, { role: "assistant", content: data.reply, records: data.airtable?.records || [] }]);
    } catch (error) {
      toast({ title: "ドライバー対応に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsDriverSending(false);
    }
  };

  const updateEscalation = async (escalation: Escalation, nextStatus: string) => {
    try {
      await requestJson(`/api/assistant/sin-japan-line/escalations/${escalation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      setEscalations((current) => nextStatus === "resolved"
        ? current.filter((item) => item.id !== escalation.id)
        : current.map((item) => item.id === escalation.id ? { ...item, status: nextStatus } : item));
    } catch (error) {
      toast({ title: "対応状態を更新できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const refreshDailyReport = async () => {
    try {
      const report = await requestJson<{ content: string }>("/api/assistant/sin-japan-line/daily-report");
      setDailyReport(report.content);
      toast({ title: "日次報告を更新しました" });
    } catch (error) {
      toast({ title: "日次報告を更新できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const sendDailyReport = async () => {
    try {
      await requestJson("/api/assistant/sin-japan-line/daily-report/send", { method: "POST" });
      toast({ title: "管理者の公式LINEへ日次報告を送信しました" });
    } catch (error) {
      toast({ title: "日次報告を送信できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const addResource = async () => {
    if (!newResource.title.trim() || !newResource.url.trim()) return;
    try {
      const resource = await requestJson<Resource>("/api/assistant/sin-japan-line/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newResource),
      });
      setResources((current) => [resource, ...current]);
      setNewResource({ title: "", url: "", phase: "onboarding", description: "" });
      toast({ title: "案内リンクを登録しました" });
    } catch (error) {
      toast({ title: "案内リンクを登録できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const removeResource = async (resource: Resource) => {
    if (!window.confirm(`「${resource.title}」を非公開にしますか？`)) return;
    try {
      await requestJson(`/api/assistant/sin-japan-line/resources/${resource.id}`, { method: "DELETE" });
      setResources((current) => current.filter((item) => item.id !== resource.id));
    } catch (error) {
      toast({ title: "非公開にできませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const askSecretary = async () => {
    const text = question.trim();
    if (!text || isSending) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setIsSending(true);
    try {
      const data = await requestJson<{ reply: string; airtable?: { records?: AirtableRecord[] } }>("/api/assistant/sin-japan-line/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setMessages((current) => [...current, { role: "assistant", content: data.reply, records: data.airtable?.records || [] }]);
    } catch (error) {
      toast({ title: "検索に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />運用情報を読み込んでいます</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 md:p-10">
        <header className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400 font-mono">Post-interview driver operations</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mt-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">SIN JAPAN LINE</h1>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                面談後から初回稼働、その後の日々の運用まで。管理者がAirtableへ入力した情報をもとに、LINEで案内・報告受付・緊急連絡を一元化します。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-2 border px-3 py-2 text-xs ${status?.connection === "connected" ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status?.connection === "connected" ? "bg-emerald-400" : "bg-amber-400"}`} />
                {status?.connection === "connected" ? "Airtable接続済み" : "Airtable要確認"}
              </span>
              <span className={`inline-flex items-center gap-2 border px-3 py-2 text-xs ${status?.lineConfigured ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status?.lineConfigured ? "bg-emerald-400" : "bg-amber-400"}`} />
                {status?.lineConfigured ? "会社用LINE接続済み" : "会社用LINE未接続"}
              </span>
            </div>
          </div>
        </header>

        <section className="border border-border bg-card mb-6">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="w-10 h-10 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0"><ClipboardList className="w-5 h-5 text-emerald-400" /></div>
            <div>
              <h2 className="font-semibold">採用後の運用フロー</h2>
              <p className="text-sm text-muted-foreground mt-1">Indeed応募・荷電とAirtableへの正式入力は管理者側で実施し、ここから先をSIN JAPAN LINEが支えます。</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {workflowStages.map((stage, index) => (
              <div key={stage.value} className="p-5">
                <span className="text-[10px] tracking-widest text-emerald-400">STEP {index + 1}</span>
                <h3 className="font-medium mt-2">{stage.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-2">{stage.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-border bg-card mb-6">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="w-10 h-10 border border-sky-500/30 bg-sky-500/10 flex items-center justify-center shrink-0"><UserRound className="w-5 h-5 text-sky-300" /></div>
            <div>
              <h2 className="font-semibold">ドライバー別の進捗・グループ管理</h2>
              <p className="text-sm text-muted-foreground mt-1">ドライバー1名ごとに、採用・面談用と稼働用の2つのグループを認証コードで紐付けます。</p>
            </div>
          </div>
          <div className="p-5 grid lg:grid-cols-[260px_1fr] gap-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">ドライバー登録</p>
              <input value={newDriverName} onChange={(event) => setNewDriverName(event.target.value)} placeholder="ドライバー名" className="w-full h-10 border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500" />
              <input value={newDriverKey} onChange={(event) => setNewDriverKey(event.target.value)} placeholder="Airtable検索キー（任意）" className="w-full h-10 border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500" />
              <input value={newDriverRecordId} onChange={(event) => setNewDriverRecordId(event.target.value)} placeholder="AirtableレコードID（個別案内用）" className="w-full h-10 border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500" />
              <Button onClick={() => void addDriver()} disabled={!newDriverName.trim()} className="rounded-none w-full"><Plus className="w-4 h-4 mr-2" />ドライバーを登録</Button>
              <div className="pt-3 border-t border-border space-y-2 max-h-[480px] overflow-y-auto">
                {drivers.length === 0 ? <p className="text-xs text-muted-foreground">管理者がAirtableへ入力後、ここへドライバーを登録してください。</p> : drivers.map((driver) => (
                  <div key={driver.id} className={`flex items-center gap-2 border p-2 ${selectedDriverId === driver.id ? "border-emerald-500/60 bg-emerald-500/5" : "border-border"}`}>
                    <button onClick={() => { setSelectedDriverId(driver.id); setDriverMessages([]); setCodes({}); }} className="flex-1 text-left text-sm truncate">
                      {driver.name}
                      <span className="block text-[10px] text-muted-foreground truncate">{workflowStages.find((stage) => stage.value === driver.workflowStatus)?.label || driver.workflowStatus} · グループ {driver.groups.length}/2</span>
                    </button>
                    <button onClick={() => void removeDriver(driver)} className="p-1 text-muted-foreground hover:text-red-300" aria-label={`${driver.name}を無効にする`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            {!selectedDriver ? (
              <div className="border border-dashed border-border flex items-center justify-center min-h-[360px] text-sm text-muted-foreground">左側でドライバーを登録・選択してください。</div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div><p className="text-xs uppercase tracking-widest text-emerald-400">Selected driver</p><h3 className="text-xl font-semibold mt-1">{selectedDriver.name}</h3></div>
                  <span className="text-xs border border-border px-3 py-1.5 w-fit">個別参照：{selectedDriver.airtableRecordId ? "レコードID設定済み" : "未設定（会社共通案内のみ）"}</span>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block text-sm">現在の進捗
                    <select value={selectedDriver.workflowStatus} onChange={(event) => void updateDriver({ workflowStatus: event.target.value as Driver["workflowStatus"] })} className="mt-2 w-full h-10 border border-border bg-background px-3 text-sm">
                      {workflowStages.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-sm">初回稼働予定日
                    <input type="date" value={selectedDriver.firstOperationDate || ""} onChange={(event) => void updateDriver({ firstOperationDate: event.target.value || null })} className="mt-2 w-full h-10 border border-border bg-background px-3 text-sm" />
                  </label>
                  <label className="block text-sm">Amazonアカウント確認
                    <select value={selectedDriver.amazonAccountStatus} onChange={(event) => void updateDriver({ amazonAccountStatus: event.target.value as Driver["amazonAccountStatus"] })} className="mt-2 w-full h-10 border border-border bg-background px-3 text-sm">
                      <option value="not_required">案件対象外</option><option value="pending">確認待ち</option><option value="verified">確認済み</option><option value="needs_help">要サポート</option>
                    </select>
                  </label>
                  <label className="block text-sm">Amazonアプリ・ログイン確認
                    <select value={selectedDriver.appsStatus} onChange={(event) => void updateDriver({ appsStatus: event.target.value as Driver["appsStatus"] })} className="mt-2 w-full h-10 border border-border bg-background px-3 text-sm">
                      <option value="pending">確認待ち</option><option value="verified">3アプリ確認済み</option><option value="needs_help">要サポート</option>
                    </select>
                  </label>
                </div>
                <p className="text-xs text-muted-foreground border-l-2 border-amber-400 pl-3">Amazonのパスワード・認証コード・ログイン情報は保存しません。「確認済み」などの状態のみ管理します。</p>

                <div className="grid md:grid-cols-2 gap-4">
                  {(["onboarding", "operation"] as const).map((groupType) => {
                    const group = selectedDriver.groups.find((item) => item.groupType === groupType);
                    const code = codes[groupType];
                    const label = groupType === "onboarding" ? "採用・面談用グループ" : "稼働用グループ";
                    return (
                      <div key={groupType} className="border border-border p-4">
                        <div className="flex items-center justify-between gap-3"><h4 className="font-medium">{label}</h4>{group ? <span className="text-xs text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />紐付け済み</span> : <span className="text-xs text-amber-300">未紐付け</span>}</div>
                        <p className="text-xs text-muted-foreground mt-2">{group ? "このグループからのメッセージをドライバー専用情報として処理します。" : "グループへSIN JAPAN LINEを招待後、認証コードを入力します。"}</p>
                        {!group && <Button variant="outline" onClick={() => void issueCode(groupType)} className="rounded-none mt-4 w-full"><Link2 className="w-4 h-4 mr-2" />認証コードを発行</Button>}
                        {code && !group ? <div className="mt-4 border border-emerald-500/30 bg-emerald-500/5 p-3"><p className="text-xs text-muted-foreground">グループで送信</p><p className="text-lg font-mono tracking-[0.22em] text-emerald-300 mt-1">登録 {code.code}</p><p className="text-[10px] text-muted-foreground mt-2">{formatDateTime(code.expiresAt)}まで・一回限り</p></div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid xl:grid-cols-[1.1fr_.9fr] gap-6 mb-6">
          <div className="border border-border bg-card">
            <div className="p-5 border-b border-border flex items-start gap-3"><div className="w-10 h-10 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center shrink-0"><AlertTriangle className="w-5 h-5 text-amber-300" /></div><div><h2 className="font-semibold">管理者エスカレーション</h2><p className="text-sm text-muted-foreground mt-1">事故・怪我・破損・クレーム・故障・欠勤・遅刻は、管理者LINEへ即時通知します。</p></div></div>
            <div className="p-5 space-y-3 max-h-[420px] overflow-y-auto">
              {escalations.length === 0 ? <div className="text-sm text-muted-foreground text-center py-10">未処理のエスカレーションはありません。</div> : escalations.map((item) => {
                const driver = drivers.find((candidate) => candidate.id === item.driverId);
                return <div key={item.id} className="border border-border p-4"><div className="flex justify-between gap-3"><div><p className={`text-[10px] uppercase tracking-widest ${item.urgency === "urgent" ? "text-red-300" : "text-amber-300"}`}>{item.urgency === "urgent" ? "緊急" : "要確認"} · {item.category}</p><p className="text-sm mt-2 whitespace-pre-wrap">{item.summary}</p></div><select value={item.status} onChange={(event) => void updateEscalation(item, event.target.value)} className="h-8 border border-border bg-background text-xs px-2 shrink-0"><option value="open">未確認</option><option value="acknowledged">確認済み</option><option value="in_progress">対応中</option><option value="resolved">完了</option></select></div><p className="text-xs text-muted-foreground mt-3">{driver?.name || "不明なドライバー"} · {formatDateTime(item.createdAt)} · LINE通知 {formatDateTime(item.managerNotifiedAt)}</p></div>;
              })}
            </div>
          </div>

          <div className="border border-border bg-card">
            <div className="p-5 border-b border-border flex items-start gap-3"><div className="w-10 h-10 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0"><Send className="w-5 h-5 text-emerald-400" /></div><div><h2 className="font-semibold">管理者への日次報告</h2><p className="text-sm text-muted-foreground mt-1">稼働・未報告・トラブルをまとめ、管理者の公式LINEへ送信します。</p></div></div>
            <div className="p-5"><pre className="whitespace-pre-wrap text-xs leading-relaxed bg-muted/20 border border-border p-4 max-h-[280px] overflow-y-auto font-sans">{dailyReport}</pre><div className="flex gap-2 mt-4"><Button variant="outline" onClick={() => void refreshDailyReport()} className="rounded-none flex-1">内容を更新</Button><Button onClick={() => void sendDailyReport()} className="rounded-none flex-1" disabled={!status?.managerLineConfigured}>管理者LINEへ送信</Button></div>{!status?.managerLineConfigured ? <p className="text-xs text-amber-300 mt-3">管理者の公式LINEを連携すると送信できます。日次報告の内容は現在プレビューできます。</p> : null}</div>
          </div>
        </section>

        <section className="border border-border bg-card mb-6">
          <div className="p-5 border-b border-border flex items-start gap-3"><div className="w-10 h-10 border border-violet-500/30 bg-violet-500/10 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-violet-300" /></div><div><h2 className="font-semibold">段階別の案内リンク</h2><p className="text-sm text-muted-foreground mt-1">面談資料、登録フォーム、業務マニュアル、契約書などを登録すると、該当する進捗のドライバーへLINEで案内できます。</p></div></div>
          <div className="p-5 grid lg:grid-cols-[300px_1fr] gap-6">
            <div className="space-y-3"><input value={newResource.title} onChange={(event) => setNewResource((current) => ({ ...current, title: event.target.value }))} placeholder="資料・フォーム名" className="w-full h-10 border border-border bg-background px-3 text-sm" /><input value={newResource.url} onChange={(event) => setNewResource((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." className="w-full h-10 border border-border bg-background px-3 text-sm" /><select value={newResource.phase} onChange={(event) => setNewResource((current) => ({ ...current, phase: event.target.value }))} className="w-full h-10 border border-border bg-background px-3 text-sm">{Object.entries(phaseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><Textarea value={newResource.description} onChange={(event) => setNewResource((current) => ({ ...current, description: event.target.value }))} placeholder="案内時の補足（任意）" rows={3} className="rounded-none resize-none" /><Button onClick={() => void addResource()} disabled={!newResource.title.trim() || !newResource.url.trim()} className="rounded-none w-full"><Plus className="w-4 h-4 mr-2" />案内リンクを登録</Button></div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto">{resources.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">登録された案内リンクはありません。</p> : resources.map((resource) => <div key={resource.id} className="border border-border p-3 flex gap-3"><div className="flex-1 min-w-0"><p className="text-sm font-medium">{resource.title}<span className="ml-2 text-[10px] text-emerald-300">{phaseLabels[resource.phase] || resource.phase}</span></p>{resource.description ? <p className="text-xs text-muted-foreground mt-1">{resource.description}</p> : null}<a href={resource.url} target="_blank" rel="noreferrer" className="text-xs text-sky-300 hover:underline mt-2 inline-flex items-center gap-1 truncate max-w-full">{resource.url}<ExternalLink className="w-3 h-3 shrink-0" /></a></div><button onClick={() => void removeResource(resource)} className="p-1 text-muted-foreground hover:text-red-300 self-start" aria-label={`${resource.title}を非公開にする`}><Trash2 className="w-4 h-4" /></button></div>)}</div>
          </div>
        </section>

        <section className="grid xl:grid-cols-2 gap-6 mb-6">
          <div className="border border-border bg-card">
            <div className="p-5 border-b border-border flex items-start gap-3"><div className="w-10 h-10 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0"><MessageCircle className="w-5 h-5 text-emerald-400" /></div><div><h2 className="font-semibold">ドライバー視点の動作確認</h2><p className="text-sm text-muted-foreground mt-1">個人用AI秘書の記憶・TODO・営業情報を使わず、担当範囲と会社共通案内だけで応答します。</p></div></div>
            <div className="p-5 min-h-[360px] flex flex-col"><p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">{selectedDriver ? `${selectedDriver.name}としてテスト` : "ドライバーを選択してください"}</p><div className="flex-1 space-y-2 overflow-y-auto max-h-[280px]">{!selectedDriver ? <p className="text-sm text-muted-foreground text-center py-8">上のドライバーを選択してください。</p> : driverMessages.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">「登録フォームを教えて」「今日の配車は？」「遅れそうです」などを試してください。</p> : driverMessages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 bg-emerald-500/5 border border-emerald-500/30 p-3" : "mr-8 bg-muted/20 border border-border p-3"}><p className="text-[10px] text-emerald-400 mb-1">{message.role === "user" ? "ドライバー" : "SIN JAPAN LINE"}</p><p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>{message.records?.length ? <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">{message.records.slice(0, 3).map((record) => <p key={record.recordId}>[{record.table}] {record.title}</p>)}</div> : null}</div>)}</div><div className="flex gap-2 mt-4"><Textarea value={driverQuestion} onChange={(event) => setDriverQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askAsDriver(); } }} placeholder="ドライバーからのメッセージ…" rows={2} disabled={!selectedDriver} className="rounded-none resize-none" /><Button onClick={() => void askAsDriver()} disabled={!selectedDriver || !driverQuestion.trim() || isDriverSending} className="rounded-none self-end">{isDriverSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button></div></div>
          </div>

          <div className="border border-border bg-card">
            <div className="p-5 border-b border-border flex items-start gap-3"><div className="w-10 h-10 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-emerald-400" /></div><div><h2 className="font-semibold">物流秘書に相談する</h2><p className="text-sm text-muted-foreground mt-1">案件、配車、車両、スタッフなど、Airtable内の物流情報を横断して確認します。</p></div></div>
            <div className="p-5 min-h-[360px] flex flex-col"><div className="flex-1 space-y-2 overflow-y-auto max-h-[280px]">{messages.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">「今週の配車で注意することは？」などと相談してください。</p> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 bg-emerald-500/5 border border-emerald-500/30 p-3" : "mr-8 bg-muted/20 border border-border p-3"}><p className="text-[10px] text-emerald-400 mb-1">{message.role === "user" ? "管理者" : "物流秘書"}</p><p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>{message.records?.length ? <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">{message.records.slice(0, 3).map((record) => <p key={record.recordId}>[{record.table}] {record.title}</p>)}</div> : null}</div>)}</div><div className="flex gap-2 mt-4"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askSecretary(); } }} placeholder="物流について質問・相談してください…" rows={2} className="rounded-none resize-none" /><Button onClick={() => void askSecretary()} disabled={!question.trim() || isSending || status?.connection !== "connected"} className="rounded-none self-end">{isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button></div></div>
          </div>
        </section>

        <section className="border border-border bg-card p-5 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div className="flex gap-3"><ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" /><div><h2 className="font-semibold">会社用LINEの接続</h2><p className="text-sm text-muted-foreground mt-1">Webhookは実装済みです。会社用のチャンネル情報を設定すると、グループ紐付け・自動応答・緊急通知が有効になります。</p></div></div>
          <Button asChild variant="outline" className="rounded-none w-fit"><Link href="/official-line">公式LINE設定を見る <ArrowUpRight className="w-4 h-4 ml-2" /></Link></Button>
        </section>
      </div>
    </div>
  );
}