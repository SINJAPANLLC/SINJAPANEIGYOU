import { useEffect, useMemo, useState } from "react";
import {
  BellRing, BookOpen, CheckCircle2, Circle, Clock3, ExternalLink, Link2,
  Loader2, MessageCircle, Plus, RefreshCw, Send, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type Profile = {
  linkCode: string;
  lineConfigured: boolean;
  linked: boolean;
  reportsEnabled: boolean;
  reportHour: number;
  reportMinute: number;
  timezone: string;
  reportTopics: string[];
};
type Todo = { id: number; title: string; priority: string; status: string; createdAt: string };
type Memory = { id: number; content: string; category: string; createdAt: string };
type Report = { id: number; reportDate: string; status: string; content: string | null; deliveredAt: string | null; error: string | null; createdAt: string };

const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";

export default function OfficialLinePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [topicText, setTopicText] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  const openTodos = useMemo(() => todos.filter((todo) => todo.status === "open"), [todos]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/state", { credentials: "include" });
      if (!res.ok) throw new Error("秘書データを読み込めませんでした");
      const data = await res.json();
      setProfile(data.profile);
      setTodos(data.todos);
      setMemories(data.memories);
      setReports(data.reports);
      setActiveReport(data.reports[0] ?? null);
    } catch (error) {
      toast({ title: "読み込みに失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const saveProfile = async (updates: Partial<Profile>) => {
    if (!profile) return;
    setBusy("settings");
    try {
      const res = await fetch("/api/assistant/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("設定を保存できませんでした");
      const updated = await res.json();
      setProfile(updated);
      toast({ title: "秘書設定を保存しました" });
    } catch (error) {
      toast({ title: "保存に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const addTodo = async () => {
    if (!todoTitle.trim()) return;
    const res = await fetch("/api/assistant/todos", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: todoTitle }) });
    if (!res.ok) { toast({ title: "TODOを追加できませんでした", variant: "destructive" }); return; }
    const todo = await res.json();
    setTodos((items) => [todo, ...items]);
    setTodoTitle("");
  };

  const completeTodo = async (todo: Todo) => {
    const res = await fetch(`/api/assistant/todos/${todo.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: todo.status === "open" ? "completed" : "open" }) });
    if (res.ok) {
      const updated = await res.json();
      setTodos((items) => items.map((item) => item.id === updated.id ? updated : item));
    }
  };

  const addMemory = async () => {
    if (!memoryText.trim()) return;
    const res = await fetch("/api/assistant/memories", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: memoryText }) });
    if (!res.ok) { toast({ title: "記憶を保存できませんでした", variant: "destructive" }); return; }
    const memory = await res.json();
    setMemories((items) => [memory, ...items]);
    setMemoryText("");
  };

  const sendChat = async () => {
    if (!chatText.trim()) return;
    const text = chatText.trim();
    setChatText("");
    setChatHistory((items) => [...items, { role: "user", content: text }]);
    setBusy("chat");
    try {
      const res = await fetch("/api/assistant/chat", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!res.ok) throw new Error("返信を作成できませんでした");
      const data = await res.json();
      setChatHistory((items) => [...items, { role: "assistant", content: data.reply }]);
      void load();
    } catch (error) {
      toast({ title: "AI秘書に接続できませんでした", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const runReport = async (deliver: boolean) => {
    setBusy(deliver ? "deliver" : "preview");
    try {
      const path = deliver ? "/api/assistant/reports/run" : "/api/assistant/reports/preview";
      const res = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deliver }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.report?.error || data.error || "レポートを作成できませんでした");
      setActiveReport(data.report);
      setReports((items) => [data.report, ...items.filter((item) => item.id !== data.report.id)]);
      toast({ title: deliver ? "LINEへレポートを送信しました" : "レポートのプレビューを作成しました" });
    } catch (error) {
      toast({ title: "レポート作成に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const testLine = async () => {
    setBusy("line-test");
    try {
      const res = await fetch("/api/assistant/line/test", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "LINEテストに失敗しました");
      toast({ title: "LINEにテストメッセージを送りました" });
    } catch (error) {
      toast({ title: "接続テストに失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const addTopic = () => {
    if (!profile || !topicText.trim() || profile.reportTopics.includes(topicText.trim())) return;
    void saveProfile({ reportTopics: [...profile.reportTopics, topicText.trim()] });
    setTopicText("");
  };

  if (loading || !profile) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border px-6 py-5 flex flex-wrap gap-4 items-center justify-between bg-gradient-to-r from-emerald-950/30 via-background to-background">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><Sparkles className="w-5 h-5 text-emerald-400" /></div>
          <div><p className="text-[10px] uppercase tracking-[0.24em] text-emerald-400 font-mono">Personal operations</p><h1 className="text-lg font-semibold">AI秘書 / 公式LINE</h1></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-none" onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5 mr-2" />更新</Button>
          <Button size="sm" className="rounded-none bg-emerald-600 hover:bg-emerald-500" onClick={() => void runReport(true)} disabled={busy !== null || !profile.linked}><Send className="w-3.5 h-3.5 mr-2" />今すぐLINEへ報告</Button>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <section className="grid lg:grid-cols-3 gap-4">
          <div className="border border-border bg-card p-5 lg:col-span-2">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div><p className="text-xs font-mono text-emerald-400 uppercase tracking-widest">Daily briefing</p><h2 className="font-semibold mt-1">毎朝の秘書レポート</h2><p className="text-sm text-muted-foreground mt-1">TODO、営業状況、調査トピック、今日の一歩を日本時間で通知します。</p></div>
              <Switch checked={profile.reportsEnabled} onCheckedChange={(checked) => void saveProfile({ reportsEnabled: checked })} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs text-muted-foreground">配信時刻（日本時間）</Label><div className="flex items-center gap-1 mt-1"><Input type="number" min="0" max="23" value={profile.reportHour} onChange={(e) => setProfile({ ...profile, reportHour: Number(e.target.value) })} className="w-16 h-9 rounded-none" /><span className="text-muted-foreground">:</span><Input type="number" min="0" max="59" value={String(profile.reportMinute).padStart(2, "0")} onChange={(e) => setProfile({ ...profile, reportMinute: Number(e.target.value) })} className="w-16 h-9 rounded-none" /></div></div>
              <Button variant="outline" size="sm" className="rounded-none h-9" disabled={busy === "settings"} onClick={() => void saveProfile({ reportHour: profile.reportHour, reportMinute: profile.reportMinute })}>時刻を保存</Button>
              <Button variant="outline" size="sm" className="rounded-none h-9" disabled={busy !== null} onClick={() => void runReport(false)}><BookOpen className="w-3.5 h-3.5 mr-2" />プレビュー</Button>
            </div>
          </div>
          <div className="border border-border bg-card p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">秘書の現在地</p>
            <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">LINE連携</span><span className={profile.linked ? "text-emerald-400" : "text-amber-400"}>{profile.linked ? "連携済み" : "未連携"}</span></div><div className="flex justify-between"><span className="text-muted-foreground">未完了TODO</span><span>{openTodos.length}件</span></div><div className="flex justify-between"><span className="text-muted-foreground">保存した記憶</span><span>{memories.length}件</span></div></div>
          </div>
        </section>

        <section className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center justify-between"><div className="flex gap-2 items-center"><Link2 className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">本人専用LINEを連携</h2></div><span className={`text-xs px-2 py-1 border ${profile.lineConfigured ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}`}>{profile.lineConfigured ? "API設定済み" : "API設定待ち"}</span></div>
              <div className="p-5 grid md:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs mb-1">1. シークレット</p><p>Replit Secretsに <code>LINE_CHANNEL_SECRET</code> と <code>LINE_CHANNEL_ACCESS_TOKEN</code> を安全に登録します。</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">2. Webhook URL</p><p>LINE DevelopersのWebhook URLを <code>/api/assistant/line/webhook</code> に設定します。</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">3. 本人確認コード</p><div className="font-mono text-lg tracking-[0.2em] text-emerald-400 py-1">{profile.linkCode}</div><p>公式LINEへ「連携コード {profile.linkCode}」と送信します。</p></div>
              </div>
              {profile.linked && <div className="px-5 pb-5"><Button variant="outline" className="rounded-none" size="sm" disabled={busy === "line-test"} onClick={() => void testLine()}>{busy === "line-test" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <MessageCircle className="w-3.5 h-3.5 mr-2" />}接続テストを送る</Button></div>}
            </div>

            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center gap-2"><BellRing className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">調査テーマ</h2></div>
              <div className="p-5"><div className="flex gap-2"><Input value={topicText} onChange={(e) => setTopicText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTopic()} placeholder="例: 物流2026年問題のニュース" className="rounded-none" /><Button onClick={addTopic} className="rounded-none"><Plus className="w-4 h-4" /></Button></div><div className="flex flex-wrap gap-2 mt-3">{profile.reportTopics.length ? profile.reportTopics.map((topic) => <button key={topic} onClick={() => void saveProfile({ reportTopics: profile.reportTopics.filter((item) => item !== topic) })} className="border border-border px-2 py-1 text-xs hover:border-destructive hover:text-destructive">{topic} ×</button>) : <p className="text-sm text-muted-foreground">未設定の場合は、営業に役立つニュースを自動で収集します。</p>}</div></div>
            </div>

            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">秘書に相談する</h2></div>
              <div className="p-5 space-y-3 max-h-80 overflow-y-auto">{chatHistory.length === 0 ? <p className="text-sm text-muted-foreground">「明日のTODOに見積もり作成を追加」「今月の目標を覚えて」など、自然な文章で話しかけられます。</p> : chatHistory.map((message, index) => <div key={index} className={`text-sm p-3 border ${message.role === "user" ? "ml-8 border-border bg-muted/30" : "mr-8 border-emerald-500/20 bg-emerald-500/5"}`}>{message.content}</div>)}</div>
              <div className="p-5 pt-0 flex gap-2"><Input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void sendChat()} placeholder="AI秘書への依頼を入力…" className="rounded-none" /><Button onClick={() => void sendChat()} disabled={busy === "chat"} className="rounded-none bg-emerald-600 hover:bg-emerald-500">{busy === "chat" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button></div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="border border-border bg-card"><div className="p-5 border-b border-border flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">TODO</h2></div><div className="p-4 flex gap-2"><Input value={todoTitle} onChange={(e) => setTodoTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addTodo()} placeholder="新しいTODO" className="rounded-none h-8 text-sm" /><Button size="sm" onClick={() => void addTodo()} className="rounded-none h-8"><Plus className="w-4 h-4" /></Button></div><div className="px-4 pb-4 space-y-2">{todos.slice(0, 8).map((todo) => <button key={todo.id} onClick={() => void completeTodo(todo)} className={`w-full text-left flex gap-2 p-2 text-sm border border-transparent hover:border-border ${todo.status === "completed" ? "line-through text-muted-foreground" : ""}`}>{todo.status === "completed" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}<span>{todo.title}</span></button>)}{todos.length === 0 && <p className="text-sm text-muted-foreground px-2">TODOはありません。</p>}</div></div>
            <div className="border border-border bg-card"><div className="p-5 border-b border-border flex items-center gap-2"><BookOpen className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">長期記憶</h2></div><div className="p-4 flex gap-2"><Input value={memoryText} onChange={(e) => setMemoryText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addMemory()} placeholder="明示的に覚えさせる内容" className="rounded-none h-8 text-sm" /><Button size="sm" onClick={() => void addMemory()} className="rounded-none h-8"><Plus className="w-4 h-4" /></Button></div><div className="px-4 pb-4 space-y-2">{memories.slice(0, 6).map((memory) => <div key={memory.id} className="group text-xs p-2 bg-muted/30 flex gap-2"><span className="flex-1">{memory.content}</span><button onClick={async () => { await fetch(`/api/assistant/memories/${memory.id}`, { method: "DELETE", credentials: "include" }); setMemories((items) => items.filter((item) => item.id !== memory.id)); }} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></div>)}{memories.length === 0 && <p className="text-sm text-muted-foreground px-2">「覚えて」と明示した情報だけ保存します。</p>}</div></div>
          </div>
        </section>

        <section className="grid lg:grid-cols-[0.8fr_1.2fr] gap-6">
          <div className="border border-border bg-card"><div className="p-5 border-b border-border flex items-center gap-2"><Clock3 className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">配信履歴</h2></div><div className="divide-y divide-border">{reports.length ? reports.map((report) => <button key={report.id} onClick={() => setActiveReport(report)} className={`w-full text-left p-4 hover:bg-muted/30 ${activeReport?.id === report.id ? "bg-emerald-500/5" : ""}`}><div className="flex justify-between gap-2 text-sm"><span>{report.reportDate}</span><span className={report.status === "delivered" ? "text-emerald-400" : report.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{report.status === "delivered" ? "配信済み" : report.status === "failed" ? "失敗" : "作成済み"}</span></div><p className="text-xs text-muted-foreground mt-1">{formatTime(report.createdAt)}</p></button>) : <p className="p-5 text-sm text-muted-foreground">まだレポートはありません。</p>}</div></div>
          <div className="border border-border bg-card"><div className="p-5 border-b border-border flex items-center justify-between"><div><p className="text-xs font-mono text-emerald-400 uppercase tracking-widest">Report preview</p><h2 className="font-semibold mt-1">{activeReport ? `${activeReport.reportDate} のレポート` : "レポートを作成してください"}</h2></div>{activeReport?.deliveredAt && <span className="text-xs text-emerald-400">LINE配信済み</span>}</div><div className="p-5 whitespace-pre-wrap leading-7 text-sm text-foreground/90 min-h-64">{activeReport?.content || activeReport?.error || "「プレビュー」を押すと、朝9時に届く内容を確認できます。"}</div></div>
        </section>
      </main>
    </div>
  );
}