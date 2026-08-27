import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, Database, Link2, Loader2, MessageCircle, Plus, Send, Sparkles, Trash2, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type AirtableStatus = { configured: boolean; connection: "connected" | "not_configured" | "error"; baseConfigured: boolean; tablesCached: boolean; error: string | null };
type AirtableRecord = { table: string; recordId: string; title: string; content: string; createdAt: string | null };
type ChatMessage = { role: "user" | "assistant"; content: string; records?: AirtableRecord[] };
type Driver = { id: number; name: string; airtableLookupKey: string; lineUserId: string | null; status: string };

const operatingAreas = [
  { icon: Database, title: "Airtable横断検索", description: "案件・顧客・売上・車両・スタッフなど、物流事業の情報を横断して探します。" },
  { icon: MessageCircle, title: "物流の壁打ち", description: "案件判断、配車、営業、採用の相談を、保存されている情報をもとに整理します。" },
  { icon: Building2, title: "会社専用の秘書", description: "個人用AI秘書とは分け、SIN JAPANの物流事業に必要な情報だけを扱います。" },
];

export default function SinJapanLinePage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<AirtableStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverKey, setNewDriverKey] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [driverQuestion, setDriverQuestion] = useState("");
  const [driverMessages, setDriverMessages] = useState<ChatMessage[]>([]);
  const [isDriverSending, setIsDriverSending] = useState(false);

  useEffect(() => {
    fetch("/api/assistant/sin-japan-line/status", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Airtable設定を確認できませんでした");
        setStatus(await response.json());
      })
      .catch((error: Error) => toast({ title: "Airtable設定を確認できませんでした", description: error.message, variant: "destructive" }));
    fetch("/api/assistant/sin-japan-line/drivers", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) throw new Error("ドライバー一覧を取得できませんでした");
        setDrivers(await response.json());
      })
      .catch((error: Error) => toast({ title: "ドライバー一覧を取得できませんでした", description: error.message, variant: "destructive" }));
  }, [toast]);

  const askSecretary = async () => {
    const text = question.trim();
    if (!text || isSending) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setIsSending(true);
    try {
      const response = await fetch("/api/assistant/sin-japan-line/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "物流秘書からの返信に失敗しました");
      setMessages((current) => [...current, { role: "assistant", content: data.reply, records: data.airtable?.records || [] }]);
    } catch (error) {
      toast({ title: "検索に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const addDriver = async () => {
    const name = newDriverName.trim();
    if (!name) return;
    try {
      const response = await fetch("/api/assistant/sin-japan-line/drivers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, airtableLookupKey: newDriverKey.trim() || name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ドライバー登録に失敗しました");
      setDrivers((current) => [data, ...current]);
      setSelectedDriverId(data.id);
      setNewDriverName("");
      setNewDriverKey("");
      toast({ title: "ドライバーを登録しました" });
    } catch (error) {
      toast({ title: "ドライバー登録に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const removeDriver = async (driver: Driver) => {
    if (!window.confirm(`${driver.name}さんを無効にしますか？`)) return;
    const response = await fetch(`/api/assistant/sin-japan-line/drivers/${driver.id}`, { method: "DELETE", credentials: "include" });
    if (!response.ok) {
      toast({ title: "ドライバーを無効にできませんでした", variant: "destructive" });
      return;
    }
    setDrivers((current) => current.filter((item) => item.id !== driver.id));
    if (selectedDriverId === driver.id) setSelectedDriverId(null);
  };

  const askAsDriver = async () => {
    const text = driverQuestion.trim();
    if (!text || !selectedDriverId || isDriverSending) return;
    setDriverQuestion("");
    setDriverMessages((current) => [...current, { role: "user", content: text }]);
    setIsDriverSending(true);
    try {
      const response = await fetch("/api/assistant/sin-japan-line/driver-chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId: selectedDriverId, text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ドライバー対応に失敗しました");
      setDriverMessages((current) => [...current, { role: "assistant", content: data.reply, records: data.airtable?.records || [] }]);
    } catch (error) {
      toast({ title: "ドライバー対応に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setIsDriverSending(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 md:p-10">
        <header className="mb-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400 font-mono">Logistics secretary</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mt-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">SIN JAPAN LINE</h1>
              <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                SIN JAPANの物流事業専用AI秘書です。話しかけるとAirtableの情報を読み取り、案件・顧客・売上・車両・スタッフに関する回答を整理します。
              </p>
            </div>
            <span className={`inline-flex items-center gap-2 border px-3 py-2 text-xs w-fit ${status?.connection === "connected" ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status?.connection === "connected" ? "bg-emerald-400" : "bg-amber-400"}`} />
              {status?.connection === "connected" ? "Airtable接続済み" : status?.connection === "error" ? "Airtable接続エラー" : "Airtable設定を確認中"}
            </span>
          </div>
        </header>

        <section className="border border-border bg-card mb-6">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="w-10 h-10 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-emerald-400" /></div>
            <div>
              <h2 className="font-semibold">物流秘書に相談する</h2>
              <p className="text-sm text-muted-foreground mt-1">例：「○○社の案件の進捗は？」「今週の配車で注意することは？」「売上が遅れている案件を教えて」</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {messages.length === 0 ? (
              <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground text-center">質問すると、Airtableの関連情報を読み取って回答します。</div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 border border-emerald-500/30 bg-emerald-500/5 p-4" : "mr-8 border border-border bg-muted/20 p-4"}>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-2">{message.role === "user" ? "あなた" : "SIN JAPAN物流秘書"}</p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                    {message.records?.length ? (
                      <div className="mt-4 pt-3 border-t border-border space-y-2">
                        <p className="text-xs text-muted-foreground">Airtable参照レコード</p>
                        {message.records.slice(0, 5).map((record) => <div key={record.recordId} className="text-xs bg-background/50 border border-border p-2"><span className="text-emerald-400">[{record.table}]</span> <strong>{record.title}</strong><p className="text-muted-foreground whitespace-pre-wrap mt-1 line-clamp-3">{record.content}</p></div>)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askSecretary(); } }} placeholder="物流について質問・相談してください…" rows={3} className="rounded-none resize-none" />
              <Button onClick={() => void askSecretary()} disabled={!question.trim() || isSending || status?.connection !== "connected"} className="rounded-none sm:self-end">
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-2" />相談する</>}
              </Button>
            </div>
            {status?.connection === "not_configured" ? <p className="text-xs text-amber-300">AirtableのAPIキーまたはBase IDが未設定です。Secretsと環境変数を確認してください。</p> : null}
            {status?.connection === "error" ? <p className="text-xs text-amber-300">{status.error}</p> : null}
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4 mb-6">
          {operatingAreas.map(({ icon: Icon, title, description }) => (
            <div key={title} className="border border-border bg-card p-5">
              <Icon className="w-5 h-5 text-emerald-400 mb-4" />
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">{description}</p>
            </div>
          ))}
        </section>

        <section className="border border-border bg-card mb-6">
          <div className="p-5 border-b border-border flex items-start gap-3">
            <div className="w-10 h-10 border border-sky-500/30 bg-sky-500/10 flex items-center justify-center shrink-0"><UserRound className="w-5 h-5 text-sky-300" /></div>
            <div>
              <h2 className="font-semibold">ドライバー対応を先に試す</h2>
              <p className="text-sm text-muted-foreground mt-1">LINE接続前でも、登録したドライバーとして担当案件だけを検索する動作を確認できます。</p>
            </div>
          </div>
          <div className="p-5 grid lg:grid-cols-[280px_1fr] gap-6">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">ドライバー登録</p>
              <input value={newDriverName} onChange={(event) => setNewDriverName(event.target.value)} placeholder="ドライバー名" className="w-full h-10 border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500" />
              <input value={newDriverKey} onChange={(event) => setNewDriverKey(event.target.value)} placeholder="Airtable検索キー（任意）" className="w-full h-10 border border-border bg-background px-3 text-sm outline-none focus:border-emerald-500" />
              <Button onClick={() => void addDriver()} disabled={!newDriverName.trim()} className="rounded-none w-full"><Plus className="w-4 h-4 mr-2" />ドライバーを登録</Button>
              <div className="pt-3 border-t border-border space-y-2">
                {drivers.length === 0 ? <p className="text-xs text-muted-foreground">登録されたドライバーはいません。</p> : drivers.map((driver) => (
                  <div key={driver.id} className={`flex items-center gap-2 border p-2 ${selectedDriverId === driver.id ? "border-emerald-500/60 bg-emerald-500/5" : "border-border"}`}>
                    <button onClick={() => { setSelectedDriverId(driver.id); setDriverMessages([]); }} className="flex-1 text-left text-sm truncate">{driver.name}<span className="block text-[10px] text-muted-foreground truncate">検索キー：{driver.airtableLookupKey}</span></button>
                    <button onClick={() => void removeDriver(driver)} className="p-1 text-muted-foreground hover:text-red-300" aria-label={`${driver.name}を無効にする`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="border border-border p-4 min-h-[240px] flex flex-col">
              <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">{selectedDriverId ? `${drivers.find((driver) => driver.id === selectedDriverId)?.name || "ドライバー"}としてテスト` : "ドライバーを選択してください"}</p>
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[360px]">
                {!selectedDriverId ? <p className="text-sm text-muted-foreground py-8 text-center">左側でドライバーを登録・選択すると、担当範囲のテストができます。</p> : driverMessages.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">「今日の配車を教えて」などと入力してください。</p> : driverMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 bg-emerald-500/5 border border-emerald-500/30 p-3" : "mr-8 bg-muted/20 border border-border p-3"}>
                    <p className="text-[10px] text-emerald-400 mb-1">{message.role === "user" ? "ドライバー" : "物流秘書"}</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    {message.records?.length ? <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">{message.records.slice(0, 3).map((record) => <p key={record.recordId}>[{record.table}] {record.title}</p>)}</div> : null}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Textarea value={driverQuestion} onChange={(event) => setDriverQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askAsDriver(); } }} placeholder="ドライバーからの質問…" rows={2} disabled={!selectedDriverId} className="rounded-none resize-none" />
                <Button onClick={() => void askAsDriver()} disabled={!selectedDriverId || !driverQuestion.trim() || isDriverSending} className="rounded-none self-end">{isDriverSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-border bg-card p-5 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">LINEチャネルの接続</h2>
            <p className="text-sm text-muted-foreground mt-1">外部への送信や自動返信は、別途LINE公式アカウントを設定してから有効にします。</p>
          </div>
          <Button asChild variant="outline" className="rounded-none w-fit"><Link href="/official-line">公式LINE設定を見る <ArrowUpRight className="w-4 h-4 ml-2" /></Link></Button>
        </section>
      </div>
    </div>
  );
}