import { useEffect, useMemo, useState } from "react";
import {
  BellRing, BookOpen, CheckCircle2, Circle, Clock3, Link2,
  FileText, Loader2, MessageCircle, Plus, RefreshCw, Search, Send, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  webhookUrl: string;
};
type Todo = { id: number; title: string; priority: string; status: string; createdAt: string };
type Memory = { id: number; content: string; category: string; createdAt: string };
type Note = { id: number; title: string; content: string; category: string; createdAt: string };
type Report = { id: number; reportDate: string; status: string; content: string | null; deliveredAt: string | null; error: string | null; createdAt: string };
type SinJapanStatus = { managerLineConfigured: boolean; lineConfigured: boolean };
type SinJapanEscalation = { id: number; status: string };

const formatTime = (value: string | null) => value ? new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const DEFAULT_REPORT_TOPICS = ["日本と世界の経済ニュース", "SNSで話題のニュースとトレンド", "物流・人材業界の最新ニュース", "中小企業と営業活動に影響するニュース"];
const NOTE_CATEGORIES: Record<string, string> = { todo: "TODO候補", idea: "アイデア", decision: "判断", person_company: "人・会社", sales: "営業メモ", reference: "参考情報", temporary: "一時メモ" };

export default function OfficialLinePage() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [sinJapanStatus, setSinJapanStatus] = useState<SinJapanStatus | null>(null);
  const [sinJapanEscalations, setSinJapanEscalations] = useState<SinJapanEscalation[]>([]);
  const [sinJapanManagerReport, setSinJapanManagerReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [todoTitle, setTodoTitle] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteCategory, setNoteCategory] = useState("temporary");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ source: string; category: string; title: string; content: string; createdAt: string }>>([]);
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
      setNotes(data.notes ?? []);
      setReports(data.reports);
      setActiveReport(data.reports[0] ?? null);
      const [statusRes, escalationsRes, managerReportRes] = await Promise.all([
        fetch("/api/assistant/sin-japan-line/status", { credentials: "include" }),
        fetch("/api/assistant/sin-japan-line/escalations", { credentials: "include" }),
        fetch("/api/assistant/sin-japan-line/daily-report", { credentials: "include" }),
      ]);
      if (statusRes.ok) setSinJapanStatus(await statusRes.json());
      if (escalationsRes.ok) setSinJapanEscalations(await escalationsRes.json());
      if (managerReportRes.ok) {
        const managerReport = await managerReportRes.json();
        setSinJapanManagerReport(managerReport.content || "");
      }
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

  const addNote = async () => {
    if (!noteText.trim()) return;
    const res = await fetch("/api/assistant/notes", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: noteText, category: noteCategory }),
    });
    if (!res.ok) { toast({ title: "整理メモを保存できませんでした", variant: "destructive" }); return; }
    const note = await res.json();
    setNotes((items) => [note, ...items]);
    setNoteText("");
  };

  const removeNote = async (note: Note) => {
    const res = await fetch(`/api/assistant/notes/${note.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) setNotes((items) => items.filter((item) => item.id !== note.id));
  };

  const searchKnowledge = async () => {
    if (!searchText.trim()) return;
    setBusy("search");
    try {
      const res = await fetch(`/api/assistant/search?q=${encodeURIComponent(searchText.trim())}`, { credentials: "include" });
      if (!res.ok) throw new Error("情報を検索できませんでした");
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch (error) {
      toast({ title: "検索に失敗しました", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally { setBusy(null); }
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
              <div><p className="text-xs font-mono text-emerald-400 uppercase tracking-widest">Daily briefing</p><h2 className="font-semibold mt-1">毎日の報告（本人用）</h2><p className="text-sm text-muted-foreground mt-1">KGI、数字、最優先、TODO、仕事・生活・学び、今日の情報を毎朝まとめます。</p></div>
              <Switch checked={profile.reportsEnabled} onCheckedChange={(checked) => void saveProfile({ reportsEnabled: checked })} />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="border border-emerald-500/30 bg-emerald-500/5 px-4 py-2"><p className="text-[10px] uppercase tracking-widest text-muted-foreground">配信時刻</p><p className="font-mono text-emerald-300 mt-1">毎日 9:00</p></div>
              <Button variant="outline" size="sm" className="rounded-none h-9" disabled={busy !== null} onClick={() => void runReport(false)}><BookOpen className="w-3.5 h-3.5 mr-2" />プレビュー</Button>
            </div>
          </div>
          <div className="border border-border bg-card p-5">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">秘書の現在地</p>
            <div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">LINE連携</span><span className={profile.linked ? "text-emerald-400" : "text-amber-400"}>{profile.linked ? "連携済み" : "未連携"}</span></div><div className="flex justify-between"><span className="text-muted-foreground">未完了TODO</span><span>{openTodos.length}件</span></div><div className="flex justify-between"><span className="text-muted-foreground">保存した記憶</span><span>{memories.length}件</span></div></div>
          </div>
        </section>

        <section className="grid xl:grid-cols-[0.75fr_1.25fr] gap-4">
          <div className="border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 border border-amber-500/30 bg-amber-500/10 flex items-center justify-center shrink-0"><BellRing className="w-5 h-5 text-amber-300" /></div>
              <div><p className="text-xs font-mono text-amber-300 uppercase tracking-widest">SIN JAPAN operations</p><h2 className="font-semibold mt-1">管理者報告</h2><p className="text-sm text-muted-foreground mt-1">ドライバーの稼働・未報告・事故・欠勤・確認事項を、この公式LINEへ送信します。</p></div>
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-5">
              {["9:00", "12:00", "17:00"].map((time) => <div key={time} className="border border-border bg-background px-3 py-2 text-center font-mono text-sm">{time}</div>)}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">管理者LINE</span><span className={sinJapanStatus?.managerLineConfigured ? "text-emerald-400" : "text-amber-300"}>{sinJapanStatus?.managerLineConfigured ? "送信可能" : "連携待ち"}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">未確認の管理者報告</span><span>{sinJapanEscalations.length}件</span></div>
            </div>
            <Button asChild variant="outline" className="rounded-none w-full mt-5"><a href="/sin-japan-line">SIN JAPAN LINEの報告を管理</a></Button>
          </div>
          <div className="border border-border bg-card">
            <div className="p-5 border-b border-border flex items-center justify-between gap-3"><div><p className="text-xs font-mono text-amber-300 uppercase tracking-widest">Manager report preview</p><h2 className="font-semibold mt-1">次回送信される管理者報告</h2></div><span className="text-xs text-muted-foreground">9時・12時・17時</span></div>
            <pre className="p-5 whitespace-pre-wrap text-sm leading-7 font-sans max-h-[320px] overflow-y-auto min-h-48">{sinJapanManagerReport || "SIN JAPAN LINEのドライバー登録後に、管理者報告の内容が表示されます。"}</pre>
          </div>
        </section>

        <section className="grid xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center justify-between"><div className="flex gap-2 items-center"><Link2 className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">本人専用LINEを連携</h2></div><span className={`text-xs px-2 py-1 border ${profile.lineConfigured ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}`}>{profile.lineConfigured ? "API設定済み" : "API設定待ち"}</span></div>
              <div className="p-5 grid md:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground text-xs mb-1">1. シークレット</p><p>Replit Secretsに <code>LINE_CHANNEL_SECRET</code> と <code>LINE_CHANNEL_ACCESS_TOKEN</code> を安全に登録します。</p></div>
                <div><p className="text-muted-foreground text-xs mb-1">2. Webhook URL</p><p className="break-all">LINE DevelopersのWebhook URLを以下に設定します。</p><code className="block mt-2 text-[11px] text-emerald-300 break-all">{profile.webhookUrl}</code></div>
                <div><p className="text-muted-foreground text-xs mb-1">3. 本人確認コード</p><div className="font-mono text-lg tracking-[0.2em] text-emerald-400 py-1">{profile.linkCode}</div><p>公式LINEへ「連携コード {profile.linkCode}」と送信します。</p></div>
              </div>
              {profile.linked && <div className="px-5 pb-5"><Button variant="outline" className="rounded-none" size="sm" disabled={busy === "line-test"} onClick={() => void testLine()}>{busy === "line-test" ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <MessageCircle className="w-3.5 h-3.5 mr-2" />}接続テストを送る</Button></div>}
            </div>

            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center gap-2"><BellRing className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">調査テーマ</h2></div>
              <div className="p-5"><div className="flex gap-2"><Input value={topicText} onChange={(e) => setTopicText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTopic()} placeholder="例: 物流2026年問題のニュース" className="rounded-none" /><Button onClick={addTopic} className="rounded-none"><Plus className="w-4 h-4" /></Button></div><div className="flex flex-wrap gap-2 mt-3">{profile.reportTopics.length ? profile.reportTopics.map((topic) => <button key={topic} onClick={() => void saveProfile({ reportTopics: profile.reportTopics.filter((item) => item !== topic) })} className="border border-border px-2 py-1 text-xs hover:border-destructive hover:text-destructive">{topic} ×</button>) : <>{DEFAULT_REPORT_TOPICS.map((topic) => <span key={topic} className="border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 px-2 py-1 text-xs">{topic}</span>)}<p className="basis-full text-xs text-muted-foreground mt-1">未設定の場合は、この4テーマを毎朝自動で収集します。</p></>}</div></div>
            </div>

            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-400" /><div><h2 className="font-semibold">情報整理・横断検索</h2><p className="text-xs text-muted-foreground mt-1">思いつき、会社情報、判断メモを残し、会話・TODO・記憶・ニュースから探せます。</p></div></div>
              <div className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2"><Input value={searchText} onChange={(e) => setSearchText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void searchKnowledge()} placeholder="例: 先週の採用の話、あの会社の情報" className="rounded-none" /><Button variant="outline" onClick={() => void searchKnowledge()} disabled={busy === "search"} className="rounded-none">{busy === "search" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}</Button></div>
                {searchResults.length > 0 && <div className="space-y-2 max-h-48 overflow-y-auto">{searchResults.map((item, index) => <div key={`${item.source}-${index}`} className="border border-border p-3 text-sm"><div className="flex gap-2 items-center mb-1"><span className="text-[10px] uppercase tracking-wider text-emerald-400">{NOTE_CATEGORIES[item.category] || item.category}</span><span className="text-xs text-muted-foreground">{formatTime(item.createdAt)}</span></div><p className="font-medium">{item.title}</p><p className="text-muted-foreground whitespace-pre-wrap mt-1">{item.content}</p></div>)}</div>}
                <div className="flex flex-col sm:flex-row gap-2"><Input value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addNote()} placeholder="情報を整理メモとして保存…" className="rounded-none" /><select value={noteCategory} onChange={(e) => setNoteCategory(e.target.value)} className="h-10 border border-input bg-background px-3 text-sm">{Object.entries(NOTE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Button onClick={() => void addNote()} className="rounded-none"><Plus className="w-4 h-4" /></Button></div>
                {notes.length > 0 && <div className="grid md:grid-cols-2 gap-2">{notes.slice(0, 8).map((note) => <div key={note.id} className="border border-border p-3 text-sm group"><div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider text-emerald-400">{NOTE_CATEGORIES[note.category] || note.category}</span><button onClick={() => void removeNote(note)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></div><p className="font-medium mt-1">{note.title}</p><p className="text-muted-foreground mt-1 line-clamp-3">{note.content}</p></div>)}</div>}
              </div>
            </div>

            <div className="border border-border bg-card">
              <div className="p-5 border-b border-border flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-400" /><h2 className="font-semibold">秘書に相談する</h2></div><span className="text-xs text-muted-foreground">「壁打ち: 」から送ると整理モードになります</span></div>
             <div className="p-5 space-y-3 max-h-80 overflow-y-auto">{chatHistory.length === 0 ? <p className="text-sm text-muted-foreground">「明日のTODOに見積もり作成を追加」「今月の目標を覚えて」など、自然な文章で話しかけられます。</p> : chatHistory.map((message, index) => <div key={index} className={`whitespace-pre-wrap break-words text-[15px] leading-7 p-4 border ${message.role === "user" ? "ml-8 border-border bg-muted/30" : "mr-8 border-emerald-500/20 bg-emerald-500/5"}`}>{message.content}</div>)}</div>
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