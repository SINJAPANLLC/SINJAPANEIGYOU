import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Twitter, Plus, Trash2, RefreshCw, User, Zap, FileText, Eye, EyeOff,
  CheckCircle2, XCircle, Sparkles, ChevronRight
} from "lucide-react";

interface XAccount {
  id: number;
  label: string;
  username: string | null;
  isConnected: boolean;
  persona: string | null;
}

interface Rule {
  id: number;
  actionType: string;
  enabled: boolean;
  keywords: string;
  dailyLimit: number;
  intervalSeconds: number;
  replyTemplate: string | null;
  scheduleTimes: string;
  executedToday: number;
  lastRunAt: string | null;
}

interface Log {
  id: number;
  actionType: string;
  targetTweetId: string | null;
  targetUsername: string | null;
  tweetContent: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

interface PersonaData {
  name: string; job: string; tone: string; topics: string; bio: string; style: string;
}

const ACTION_LABELS: Record<string, string> = {
  like: "いいね", retweet: "リツイート", reply: "リプライ", follow: "フォロー",
  followback: "フォロバ", post: "自動投稿", dm: "DM送信",
};
const ACTION_DESCS: Record<string, string> = {
  like:        "キーワードに一致するツイートに自動いいね",
  retweet:     "キーワードに一致するツイートを自動RT",
  reply:       "キーワードに一致するツイートに自動リプライ",
  follow:      "キーワードで検索したユーザーを自動フォロー",
  followback:  "自分をフォローしたユーザーを自動でフォローバック（キーワード不要）",
  post:        "テンプレートまたはAIで生成したツイートを自動投稿",
  dm:          "キーワードで検索したユーザーに自動でDMを送信",
};
const ACTION_TYPES = ["post", "like", "retweet", "reply", "follow", "followback", "dm"];

type SubTab = "account" | "persona" | "rules" | "logs";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "account", label: "アカウント" },
  { id: "persona", label: "ペルソナ" },
  { id: "rules",   label: "自動化ルール" },
  { id: "logs",    label: "実行ログ" },
];

// ─────────────────────────────────────────────────────────
// 追加フォーム（モーダル）
// ─────────────────────────────────────────────────────────
function AddAccountForm({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ label: "", apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "", bearerToken: "" });
  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch("/api/x/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `@${data.account.username} を追加しました` });
      onAdded();
    } catch (err: any) {
      toast({ title: err.message ?? "追加に失敗しました", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border w-full max-w-lg shadow-2xl">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
            <Plus className="w-4 h-4 text-[#1DA1F2]" />
            X アカウント追加
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">表示名（任意）</label>
            <Input placeholder="例：法人アカウント" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="rounded-none" />
          </div>
          <div className="border border-border/60 bg-muted/5 p-3 text-xs text-muted-foreground">
            X Developer Portal で取得したAPIキーを入力してください。
          </div>
          <div className="flex justify-end">
            <button onClick={() => setShowSecrets(!showSecrets)} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground">
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? "非表示" : "表示"}
            </button>
          </div>
          {[
            { key: "apiKey", label: "API Key (Consumer Key)" },
            { key: "apiSecret", label: "API Secret (Consumer Secret)" },
            { key: "accessToken", label: "Access Token" },
            { key: "accessTokenSecret", label: "Access Token Secret" },
            { key: "bearerToken", label: "Bearer Token（任意）" },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs text-muted-foreground">{label}</label>
              <Input
                type={showSecrets ? "text" : "password"}
                value={(form as any)[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                className="rounded-none font-mono text-xs"
              />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="rounded-none flex-1" onClick={onCancel}>キャンセル</Button>
            <Button className="rounded-none flex-1" onClick={submit} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              接続テスト & 追加
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// アカウント詳細パネル
// ─────────────────────────────────────────────────────────
function AccountPanel({ account, onDeleted }: { account: XAccount; onDeleted: () => void }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<SubTab>("account");

  // 認証情報変更
  const [editCreds, setEditCreds] = useState(false);
  const [creds, setCreds] = useState({ label: account.label, apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "", bearerToken: "" });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);

  // ペルソナ
  const initPersona = (): PersonaData => {
    try { return { name: "", job: "", tone: "", topics: "", bio: "", style: "", ...JSON.parse(account.persona ?? "{}") }; }
    catch { return { name: "", job: "", tone: "", topics: "", bio: "", style: "" }; }
  };
  const [persona, setPersona] = useState<PersonaData>(initPersona);
  const [savingPersona, setSavingPersona] = useState(false);
  const [personaDesc, setPersonaDesc] = useState("");
  const [generatingPersona, setGeneratingPersona] = useState(false);

  // 投稿
  const [postText, setPostText] = useState("");
  const [postTheme, setPostTheme] = useState("");
  const [posting, setPosting] = useState(false);
  const [generating, setGenerating] = useState(false);

  // ルール
  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [ruleEdits, setRuleEdits] = useState<Record<string, Rule>>({});
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  // ログ
  const [logs, setLogs] = useState<Log[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/rules`, { credentials: "include" });
      const data = await res.json();
      setRules(data);
      const edits: Record<string, Rule> = {};
      for (const r of data) edits[r.actionType] = { ...r };
      setRuleEdits(edits);
    } catch { setRules([]); } finally { setLoadingRules(false); }
  }, [account.id]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/logs`, { credentials: "include" });
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { setLogs([]); } finally { setLoadingLogs(false); }
  }, [account.id]);

  useEffect(() => {
    if (subTab === "rules") fetchRules();
    if (subTab === "logs") fetchLogs();
  }, [subTab, fetchRules, fetchLogs]);

  async function handleSaveCreds() {
    setSaving(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `@${data.username} に接続しました` });
      setEditCreds(false);
    } catch (err: any) {
      toast({ title: err.message ?? "保存に失敗しました", variant: "destructive" });
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirm(`「${account.label}」を削除しますか？`)) return;
    try {
      await fetch(`/api/x/accounts/${account.id}`, { method: "DELETE", credentials: "include" });
      onDeleted();
    } catch { toast({ title: "削除に失敗しました", variant: "destructive" }); }
  }

  async function handleSavePersona() {
    setSavingPersona(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/persona`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ persona }),
      });
      if (!res.ok) throw new Error("保存失敗");
      toast({ title: "ペルソナを保存しました" });
    } catch { toast({ title: "保存に失敗しました", variant: "destructive" }); }
    finally { setSavingPersona(false); }
  }

  async function handleGeneratePersona() {
    if (!personaDesc.trim()) { toast({ title: "アカウントの説明を入力してください", variant: "destructive" }); return; }
    setGeneratingPersona(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/generate-persona`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ description: personaDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPersona(p => ({ ...p, ...data.persona }));
      toast({ title: "ペルソナを生成しました。内容を確認して保存してください。" });
    } catch (err: any) {
      toast({ title: err.message ?? "生成に失敗しました", variant: "destructive" });
    } finally { setGeneratingPersona(false); }
  }

  async function handleGenerateTweet() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ type: "tweet", context: postTheme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPostText(data.text);
    } catch (err: any) { toast({ title: err.message ?? "生成に失敗しました", variant: "destructive" }); }
    finally { setGenerating(false); }
  }

  async function handlePost() {
    setPosting(true);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/post`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ text: postText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "投稿しました！" });
      setPostText("");
    } catch (err: any) { toast({ title: err.message ?? "投稿に失敗しました", variant: "destructive" }); }
    finally { setPosting(false); }
  }

  async function handleSaveRule(actionType: string) {
    const edit = ruleEdits[actionType];
    if (!edit) return;
    setSavingRule(actionType);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/rules/${actionType}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ ...edit, scheduleTimes: edit.scheduleTimes ?? "" }),
      });
      if (!res.ok) throw new Error("保存失敗");
      toast({ title: `${ACTION_LABELS[actionType] ?? actionType} ルールを保存しました` });
      await fetchRules();
    } catch { toast({ title: "保存に失敗しました", variant: "destructive" }); }
    finally { setSavingRule(null); }
  }

  function toggleScheduleHour(actionType: string, hour: number) {
    setRuleEdits(r => {
      const current = r[actionType]?.scheduleTimes ?? "";
      const hours = current ? current.split(",").map(Number) : [];
      const newHours = hours.includes(hour) ? hours.filter(h => h !== hour) : [...hours, hour].sort((a, b) => a - b);
      return { ...r, [actionType]: { ...r[actionType], scheduleTimes: newHours.join(",") } };
    });
  }

  async function handleRun(actionType: string) {
    setRunning(actionType);
    try {
      const res = await fetch(`/api/x/accounts/${account.id}/run/${actionType}`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `${data.executed} 件実行しました` });
      await fetchLogs();
    } catch (err: any) { toast({ title: err.message ?? "実行に失敗しました", variant: "destructive" }); }
    finally { setRunning(null); }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* サブタブ */}
      <div className="border-b border-border flex gap-0 px-6 shrink-0">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
              subTab === t.id
                ? "border-[#1DA1F2] text-[#1DA1F2]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* ── アカウントタブ ── */}
        {subTab === "account" && (
          <div className="max-w-lg space-y-5">
            <div className="border border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">接続情報</div>
                <button onClick={handleDelete} className="text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${account.isConnected ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                <div>
                  <div className="text-sm font-medium">{account.label}</div>
                  <div className="text-xs text-muted-foreground">{account.username ? `@${account.username}` : "未接続"}</div>
                </div>
                {account.isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
              </div>
              {!editCreds ? (
                <Button variant="outline" className="rounded-none w-full text-xs" onClick={() => { setEditCreds(true); setCreds(c => ({ ...c, label: account.label })); }}>
                  認証情報を変更する
                </Button>
              ) : (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">APIキー更新</div>
                    <button onClick={() => setShowSecrets(!showSecrets)} className="text-xs text-muted-foreground flex items-center gap-1">
                      {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                  <Input placeholder="表示名" value={creds.label} onChange={e => setCreds(c => ({ ...c, label: e.target.value }))} className="rounded-none text-xs" />
                  {["apiKey", "apiSecret", "accessToken", "accessTokenSecret", "bearerToken"].map(key => (
                    <Input
                      key={key}
                      type={showSecrets ? "text" : "password"}
                      placeholder={key}
                      value={(creds as any)[key]}
                      onChange={e => setCreds(c => ({ ...c, [key]: e.target.value }))}
                      className="rounded-none font-mono text-xs"
                    />
                  ))}
                  <div className="flex gap-2">
                    <Button variant="outline" className="rounded-none flex-1 text-xs" onClick={() => setEditCreds(false)}>キャンセル</Button>
                    <Button className="rounded-none flex-1 text-xs" onClick={handleSaveCreds} disabled={saving}>
                      {saving ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null} 保存
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ペルソナタブ ── */}
        {subTab === "persona" && (
          <div className="max-w-lg space-y-4">
            {/* AI一発生成 */}
            <div className="border border-[#1DA1F2]/30 bg-[#1DA1F2]/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1DA1F2]" />
                <span className="text-xs font-mono uppercase tracking-wider text-[#1DA1F2]">AIでペルソナを自動生成</span>
              </div>
              <div className="text-xs text-muted-foreground">
                あなたや会社の情報を簡単に書くだけで、AIが全項目を一括で生成します。
              </div>
              <Textarea
                placeholder={"例：合同会社SIN JAPAN代表の大谷和哉。軽貨物と人材紹介が主な事業。フランクで熱血な経営者スタイル。X(@kazuya_otani_8)で業界の裏話や採用情報を発信したい。"}
                value={personaDesc}
                onChange={e => setPersonaDesc(e.target.value)}
                className="rounded-none text-sm min-h-[80px] bg-background"
              />
              <Button
                className="rounded-none w-full gap-2 bg-[#1DA1F2] hover:bg-[#1DA1F2]/90 text-white"
                onClick={handleGeneratePersona}
                disabled={generatingPersona}
              >
                {generatingPersona
                  ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />生成中...</>
                  : <><Sparkles className="w-3.5 h-3.5" />AIでペルソナを生成</>
                }
              </Button>
            </div>

            {/* 手動編集 */}
            <div className="border border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ペルソナ内容（確認・編集）</div>
                <span className="text-[10px] text-muted-foreground">AI生成後に自動反映されます</span>
              </div>
              {[
                { key: "name",   label: "名前・ハンドル名",   placeholder: "大谷 和哉 / @kazuya_otani_8" },
                { key: "job",    label: "職業・役職",         placeholder: "合同会社SIN JAPAN 代表 / 軽貨物・人材事業" },
                { key: "tone",   label: "口調・キャラクター", placeholder: "フランクで熱血。経営者目線で本音を話す。難しい言葉は使わない。" },
                { key: "topics", label: "メイン投稿テーマ",   placeholder: "軽貨物業界、物流の裏側、起業・経営、採用、日常のリアル" },
                { key: "style",  label: "投稿スタイル",       placeholder: "短文多め。結論から書く。たまに本音をぶっちゃける。絵文字は控えめ。" },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <Input
                    placeholder={placeholder}
                    value={persona[key as keyof PersonaData]}
                    onChange={e => setPersona(p => ({ ...p, [key]: e.target.value }))}
                    className="rounded-none text-sm"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">自己紹介文（X の bio ベース）</label>
                <Textarea
                  placeholder="軽貨物・人材の合同会社代表。物流の現場から経営まで全部やってます。起業4年目。採用・外注の相談はDMへ。"
                  value={persona.bio}
                  onChange={e => setPersona(p => ({ ...p, bio: e.target.value }))}
                  className="rounded-none text-sm min-h-[80px]"
                />
              </div>
              <Button className="rounded-none w-full" onClick={handleSavePersona} disabled={savingPersona}>
                {savingPersona ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                ペルソナを保存
              </Button>
            </div>
          </div>
        )}

        {/* ── 自動化ルールタブ ── */}
        {subTab === "rules" && (
          <div className="max-w-2xl space-y-4">
            {loadingRules ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 読み込み中...
              </div>
            ) : ACTION_TYPES.map(actionType => {
              const rule = ruleEdits[actionType];
              if (!rule) return null;
              return (
                <div key={actionType} className="border border-border p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{ACTION_LABELS[actionType]}</span>
                      <div
                        onClick={() => setRuleEdits(e => ({ ...e, [actionType]: { ...e[actionType], enabled: !e[actionType].enabled } }))}
                        className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${rule.enabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full mt-0.5 transition-transform ${rule.enabled ? "translate-x-4.5 ml-0.5" : "ml-0.5"}`} />
                      </div>
                      <span className="text-xs text-muted-foreground">{rule.enabled ? "有効" : "無効"}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none text-xs h-7"
                        onClick={() => handleRun(actionType)}
                        disabled={!!running || !account.isConnected}
                      >
                        {running === actionType ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                        今すぐ実行
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-none text-xs h-7"
                        onClick={() => handleSaveRule(actionType)}
                        disabled={savingRule === actionType}
                      >
                        {savingRule === actionType ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : null}
                        保存
                      </Button>
                    </div>
                  </div>
                  {ACTION_DESCS[actionType] && (
                    <div className="text-[11px] text-muted-foreground/70">{ACTION_DESCS[actionType]}</div>
                  )}

                  {/* フォロバはキーワード不要 */}
                  {actionType !== "followback" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {actionType === "post" ? "投稿テーマ（カンマ区切り、任意）" :
                         actionType === "dm"   ? "検索キーワード（カンマ区切り）" :
                         "キーワード（カンマ区切り）"}
                      </label>
                      <Input
                        value={rule.keywords}
                        onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], keywords: e.target.value } }))}
                        className="rounded-none text-xs"
                        placeholder={
                          actionType === "post" ? "採用, 軽貨物, 物流" :
                          actionType === "dm"   ? "軽貨物ドライバー, 配送業" :
                          "軽貨物, ドライバー"
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">1日の上限</label>
                      <Input type="number" value={rule.dailyLimit} onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], dailyLimit: Number(e.target.value) } }))} className="rounded-none text-xs" />
                    </div>
                  </div>
                  )}
                  {actionType === "followback" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">1日のフォロバ上限</label>
                      <Input type="number" value={rule.dailyLimit} onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], dailyLimit: Number(e.target.value) } }))} className="rounded-none text-xs w-32" />
                    </div>
                  )}

                  {/* リプライ: テンプレート */}
                  {actionType === "reply" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">リプライテンプレート <span className="text-[#1DA1F2]">{"{{tweet}}"}</span> でツイート本文を挿入</label>
                      <Textarea value={rule.replyTemplate ?? ""} onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], replyTemplate: e.target.value } }))} className="rounded-none text-xs min-h-[60px]" placeholder="ありがとうございます！{{tweet}}" />
                    </div>
                  )}

                  {/* 自動投稿: テンプレートまたはAI生成 */}
                  {actionType === "post" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">投稿テンプレート（空の場合はAIがペルソナに沿って自動生成）</label>
                      <Textarea value={rule.replyTemplate ?? ""} onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], replyTemplate: e.target.value } }))} className="rounded-none text-xs min-h-[70px]" placeholder="空欄にするとペルソナ設定をもとにAIが毎回異なる投稿を生成します。固定文を入れる場合はここに書いてください。" />
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                        <Sparkles className="w-3 h-3 text-[#1DA1F2]" /> ペルソナタブを設定しておくとAI生成の精度が上がります
                      </div>
                    </div>
                  )}

                  {/* DM: 本文テンプレート */}
                  {actionType === "dm" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">DM本文テンプレート <span className="text-amber-400">※必須</span></label>
                      <Textarea value={rule.replyTemplate ?? ""} onChange={e => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], replyTemplate: e.target.value } }))} className="rounded-none text-xs min-h-[80px]" placeholder={"はじめまして！軽貨物の仕事を探しているとのことで、ご連絡しました。\nよろしければ詳しいお話をさせてください。"} />
                      <div className="text-[10px] text-amber-500/80 mt-1">X APIの無料プランではDM送信に制限がある場合があります。</div>
                    </div>
                  )}
                  {/* スケジュール時刻 */}
                  <div className="space-y-2 border-t border-border/40 pt-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">自動実行する時刻（複数選択可）</label>
                      {rule.scheduleTimes && (
                        <span className="text-[10px] font-mono text-[#1DA1F2]">
                          {rule.scheduleTimes.split(",").map(h => `${h}:00`).join(" / ")}
                        </span>
                      )}
                    </div>
                    {/* プリセット */}
                    <div className="flex gap-1.5 flex-wrap mb-1">
                      {[
                        { label: "朝・昼・夕", hours: "8,12,18" },
                        { label: "朝・夜", hours: "8,21" },
                        { label: "ビジネス", hours: "9,12,17" },
                        { label: "夜のみ", hours: "20,22" },
                      ].map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], scheduleTimes: preset.hours } }))}
                          className={`text-[10px] px-2 py-0.5 border transition-colors ${
                            rule.scheduleTimes === preset.hours
                              ? "border-[#1DA1F2] text-[#1DA1F2] bg-[#1DA1F2]/10"
                              : "border-border text-muted-foreground hover:border-foreground/40"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setRuleEdits(r => ({ ...r, [actionType]: { ...r[actionType], scheduleTimes: "" } }))}
                        className="text-[10px] px-2 py-0.5 border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/40 transition-colors"
                      >
                        クリア
                      </button>
                    </div>
                    {/* 時間グリッド */}
                    <div className="grid grid-cols-12 gap-0.5">
                      {Array.from({ length: 24 }, (_, h) => {
                        const selectedHours = rule.scheduleTimes ? rule.scheduleTimes.split(",").map(Number) : [];
                        const isSelected = selectedHours.includes(h);
                        return (
                          <button
                            key={h}
                            onClick={() => toggleScheduleHour(actionType, h)}
                            className={`text-[9px] font-mono h-6 transition-colors border ${
                              isSelected
                                ? "bg-[#1DA1F2] border-[#1DA1F2] text-white"
                                : "border-border text-muted-foreground hover:border-[#1DA1F2]/50 hover:text-foreground"
                            }`}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-muted-foreground">スケジュールを設定しない場合は「今すぐ実行」ボタンのみ動作します</div>
                  </div>

                  {(rule.executedToday > 0 || rule.lastRunAt) && (
                    <div className="text-xs text-muted-foreground font-mono flex items-center gap-3 pt-1 border-t border-border/30">
                      <span>今日の実行数: {rule.executedToday}</span>
                      {rule.lastRunAt && <span>最終実行: {new Date(rule.lastRunAt).toLocaleString("ja-JP")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── 実行ログタブ ── */}
        {subTab === "logs" && (
          <div className="max-w-3xl space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">実行ログ</div>
              <Button size="sm" variant="outline" className="rounded-none h-7 text-xs" onClick={fetchLogs} disabled={loadingLogs}>
                <RefreshCw className={`w-3 h-3 mr-1 ${loadingLogs ? "animate-spin" : ""}`} />更新
              </Button>
            </div>
            {loadingLogs ? (
              <div className="text-xs text-muted-foreground flex items-center gap-2 p-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 読み込み中...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-xs text-muted-foreground p-8 text-center border border-border/40 border-dashed">ログはまだありません</div>
            ) : (
              <div className="border border-border divide-y divide-border">
                {logs.map(log => (
                  <div key={log.id} className="px-4 py-3 flex items-start gap-3 text-xs">
                    <span className={`shrink-0 font-mono px-1.5 py-0.5 ${log.status === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-400"}`}>
                      {log.status === "success" ? "OK" : "ERR"}
                    </span>
                    <span className="text-muted-foreground shrink-0 font-mono">{ACTION_LABELS[log.actionType] ?? log.actionType}</span>
                    <span className="text-foreground truncate flex-1">{log.tweetContent ?? log.targetUsername ?? log.targetTweetId ?? ""}</span>
                    {log.errorMessage && <span className="text-red-400 text-xs shrink-0 max-w-[200px] truncate">{log.errorMessage}</span>}
                    <span className="text-muted-foreground/60 shrink-0 font-mono">{new Date(log.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// メインページ
// ─────────────────────────────────────────────────────────
export default function SnsPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/x/accounts", { credentials: "include" });
      const data: XAccount[] = await res.json();
      setAccounts(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
    } catch { setAccounts([]); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { fetchAccounts(); }, []);

  const selected = accounts.find(a => a.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {showAddForm && (
        <AddAccountForm
          onAdded={() => { setShowAddForm(false); fetchAccounts(); }}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* ── 左サイドバー（アカウント一覧） ── */}
      <div className="w-52 shrink-0 border-r border-border flex flex-col h-full">
        <div className="px-4 py-4 border-b border-border flex items-center gap-2">
          <Twitter className="w-4 h-4 text-[#1DA1F2]" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">X アカウント</span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 読み込み中...
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center">
              アカウントがありません
            </div>
          ) : accounts.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`w-full text-left px-4 py-3 flex items-center gap-2.5 transition-colors border-l-2 ${
                selectedId === a.id
                  ? "border-l-[#1DA1F2] bg-[#1DA1F2]/5 text-foreground"
                  : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${a.isConnected ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{a.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{a.username ? `@${a.username}` : "未接続"}</div>
              </div>
              {selectedId === a.id && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-[#1DA1F2]" />}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-border">
          <Button
            className="rounded-none w-full text-xs gap-1"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            アカウント追加
          </Button>
        </div>
      </div>

      {/* ── 右コンテンツ ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* ヘッダー */}
        <div className="border-b border-border px-6 py-4 flex items-center gap-3 shrink-0">
          <Twitter className="w-4 h-4 text-[#1DA1F2]" />
          <h1 className="text-sm font-medium tracking-wide">SNS 自動化</h1>
          {selected && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{selected.label}</span>
              <span className={`ml-auto text-xs px-2 py-0.5 border font-mono ${selected.isConnected ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/5" : "border-border text-muted-foreground"}`}>
                {selected.isConnected ? "接続済み" : "未接続"}
              </span>
            </>
          )}
        </div>

        {/* コンテンツ */}
        <div className="flex-1 min-h-0">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
              <Twitter className="w-10 h-10 text-muted-foreground/30" />
              <div className="text-sm">左のサイドバーからアカウントを選択するか、追加してください</div>
              <Button className="rounded-none gap-2" onClick={() => setShowAddForm(true)}>
                <Plus className="w-4 h-4" />
                最初のアカウントを追加
              </Button>
            </div>
          ) : (
            <AccountPanel
              key={selected.id}
              account={selected}
              onDeleted={() => {
                setSelectedId(null);
                fetchAccounts();
                toast({ title: "アカウントを削除しました" });
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
