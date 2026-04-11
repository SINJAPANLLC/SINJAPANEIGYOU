import { useState, useEffect, CSSProperties } from "react";
import {
  Twitter,
  Heart,
  Repeat2,
  MessageCircle,
  UserPlus,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  RefreshCw,
  Eye,
  EyeOff,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useBusiness } from "@/contexts/BusinessContext";

type ActionType = "like" | "retweet" | "reply" | "follow";

interface Rule {
  id: number;
  actionType: ActionType;
  enabled: boolean;
  keywords: string;
  dailyLimit: number;
  intervalSeconds: number;
  replyTemplate: string | null;
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

interface Account {
  username: string | null;
  isConnected: boolean;
}

const ACTION_CONFIG: Record<ActionType, { label: string; icon: React.ElementType; color: string; desc: string }> = {
  like:     { label: "いいね",     icon: Heart,         color: "#E0245E", desc: "キーワードを含むツイートに自動いいね" },
  retweet:  { label: "リツイート", icon: Repeat2,       color: "#17BF63", desc: "キーワードを含むツイートを自動RT" },
  reply:    { label: "リプライ",   icon: MessageCircle, color: "#1DA1F2", desc: "キーワードを含むツイートに自動リプ" },
  follow:   { label: "フォロー",   icon: UserPlus,      color: "#794BC4", desc: "キーワードで検索したユーザーを自動フォロー" },
};

const STATUS_STYLE: Record<string, CSSProperties> = {
  success: { background: "#14532d", color: "#86efac", border: "1px solid #22c55e" },
  error:   { background: "#450a0a", color: "#fca5a5", border: "1px solid #ef4444" },
};

export default function SnsPage() {
  const { toast } = useToast();
  const { selectedBusinessId } = useBusiness();

  const [activeTab, setActiveTab] = useState<"account" | "post" | "rules" | "logs">("account");
  const [account, setAccount] = useState<Account | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [loadingRules, setLoadingRules] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [running, setRunning] = useState<ActionType | null>(null);
  const [editingRule, setEditingRule] = useState<ActionType | null>(null);

  // アカウント接続フォーム
  const [creds, setCreds] = useState({ apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "", bearerToken: "" });
  const [showSecrets, setShowSecrets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [forceEdit, setForceEdit] = useState(false);

  // 投稿フォーム
  const [postText, setPostText] = useState("");
  const [posting, setPosting] = useState(false);

  // ルール編集フォーム
  const [ruleForm, setRuleForm] = useState<{ keywords: string; dailyLimit: number; intervalSeconds: number; replyTemplate: string }>({
    keywords: "", dailyLimit: 30, intervalSeconds: 120, replyTemplate: "",
  });

  useEffect(() => {
    if (!selectedBusinessId) return;
    fetchAccount();
    if (activeTab === "rules") fetchRules();
    if (activeTab === "logs") fetchLogs();
  }, [selectedBusinessId, activeTab]);

  async function fetchAccount() {
    setLoadingAccount(true);
    try {
      const res = await fetch(`/api/x/account?businessId=${selectedBusinessId}`, { credentials: "include" });
      const data = await res.json();
      setAccount(data);
    } catch {
      setAccount(null);
    } finally {
      setLoadingAccount(false);
    }
  }

  async function fetchRules() {
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/x/rules?businessId=${selectedBusinessId}`, { credentials: "include" });
      const data = await res.json();
      setRules(data);
    } finally {
      setLoadingRules(false);
    }
  }

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/x/logs?businessId=${selectedBusinessId}`, { credentials: "include" });
      const data = await res.json();
      setLogs(data);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleConnect() {
    if (!creds.apiKey || !creds.apiSecret || !creds.accessToken || !creds.accessTokenSecret) {
      toast({ title: "すべての認証情報を入力してください", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/x/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: selectedBusinessId, ...creds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `@${data.username} に接続しました` });
      setCreds({ apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "", bearerToken: "" });
      setForceEdit(false);
      fetchAccount();
    } catch (err: any) {
      toast({ title: err.message ?? "接続に失敗しました", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    await fetch(`/api/x/account?businessId=${selectedBusinessId}`, { method: "DELETE", credentials: "include" });
    toast({ title: "接続を解除しました" });
    fetchAccount();
  }

  async function handleSaveRule(actionType: ActionType) {
    try {
      const res = await fetch(`/api/x/rules/${actionType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: selectedBusinessId, ...ruleForm, enabled: rules.find(r => r.actionType === actionType)?.enabled ?? false }),
      });
      if (!res.ok) throw new Error("保存に失敗");
      toast({ title: "保存しました" });
      setEditingRule(null);
      fetchRules();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  }

  async function handleToggleRule(rule: Rule) {
    await fetch(`/api/x/rules/${rule.actionType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        businessId: selectedBusinessId,
        enabled: !rule.enabled,
        keywords: rule.keywords,
        dailyLimit: rule.dailyLimit,
        intervalSeconds: rule.intervalSeconds,
        replyTemplate: rule.replyTemplate,
      }),
    });
    fetchRules();
  }

  async function handleRun(actionType: ActionType) {
    setRunning(actionType);
    try {
      const res = await fetch(`/api/x/run/${actionType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: selectedBusinessId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `${ACTION_CONFIG[actionType].label} を ${data.executed} 件実行しました` });
      fetchRules();
    } catch (err: any) {
      toast({ title: err.message ?? "実行に失敗しました", variant: "destructive" });
    } finally {
      setRunning(null);
    }
  }

  function openEditRule(rule: Rule) {
    setRuleForm({
      keywords: rule.keywords,
      dailyLimit: rule.dailyLimit,
      intervalSeconds: rule.intervalSeconds,
      replyTemplate: rule.replyTemplate ?? "",
    });
    setEditingRule(rule.actionType as ActionType);
  }

  async function handlePost() {
    if (!postText.trim()) { toast({ title: "本文を入力してください", variant: "destructive" }); return; }
    if (postText.length > 280) { toast({ title: "280文字以内で入力してください", variant: "destructive" }); return; }
    setPosting(true);
    try {
      const res = await fetch("/api/x/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ businessId: selectedBusinessId, text: postText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "投稿しました！" });
      setPostText("");
    } catch (err: any) {
      toast({ title: err.message ?? "投稿に失敗しました", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  const tabs = [
    { id: "account" as const, label: "アカウント" },
    { id: "post"    as const, label: "投稿" },
    { id: "rules"   as const, label: "自動化ルール" },
    { id: "logs"    as const, label: "実行ログ" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ヘッダー */}
      <div className="border-b border-border px-6 py-4 shrink-0 flex items-center gap-3">
        <Twitter className="w-5 h-5" style={{ color: "#1DA1F2" }} />
        <div>
          <h1 className="text-lg font-bold tracking-tight font-mono uppercase">X (Twitter) 自動化</h1>
          <p className="text-xs text-muted-foreground mt-0.5">いいね・RT・リプライ・フォローを自動化します</p>
        </div>
        {!loadingAccount && account?.isConnected && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400 border border-green-900/50 bg-green-950/30 px-2 py-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            @{account.username}
          </span>
        )}
      </div>

      {/* タブ */}
      <div className="border-b border-border flex shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── 投稿タブ ── */}
        {activeTab === "post" && (
          <div className="max-w-lg space-y-4">
            {!account?.isConnected && (
              <div className="border border-dashed border-border p-4 text-xs text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                先にアカウントタブでX APIを接続してください
              </div>
            )}
            <div className="border border-border p-5 space-y-4">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ツイート作成</div>
              <Textarea
                placeholder="いまどうしてる？"
                value={postText}
                onChange={e => setPostText(e.target.value)}
                className="rounded-none text-sm min-h-[120px] resize-none"
                disabled={!account?.isConnected}
              />
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono tabular-nums ${postText.length > 280 ? "text-red-400" : postText.length > 240 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {postText.length} / 280
                </span>
                <Button
                  className="rounded-none"
                  onClick={handlePost}
                  disabled={posting || !account?.isConnected || postText.length === 0 || postText.length > 280}
                >
                  {posting ? (
                    <span className="flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" />投稿中...</span>
                  ) : (
                    <span className="flex items-center gap-2"><Twitter className="w-3.5 h-3.5" />投稿する</span>
                  )}
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground border border-border/50 p-3 space-y-1">
              <div className="font-mono uppercase tracking-wider mb-2">ヒント</div>
              <div>・ハッシュタグ <code className="bg-muted px-1">#軽貨物</code> を入れると検索流入が増えます</div>
              <div>・URLは自動短縮されます（23文字として計算）</div>
              <div>・投稿ログは「実行ログ」タブで確認できます</div>
            </div>
          </div>
        )}

        {/* ── アカウントタブ ── */}
        {activeTab === "account" && (
          <div className="max-w-lg space-y-6">
            {loadingAccount ? (
              <div className="h-24 animate-pulse bg-muted/30 border border-border" />
            ) : account?.isConnected && !forceEdit ? (
              <div className="border border-green-900/40 bg-green-950/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                  <div>
                    <div className="font-bold text-sm">@{account.username}</div>
                    <div className="text-xs text-muted-foreground">X API 接続済み</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="rounded-none text-xs" onClick={() => { setForceEdit(true); setCreds({ apiKey: "", apiSecret: "", accessToken: "", accessTokenSecret: "", bearerToken: "" }); }}>
                    変更する
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-none text-xs text-muted-foreground" onClick={handleDisconnect}>
                    接続解除
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border border-border p-5 space-y-4">
                {forceEdit && (
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-amber-400 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      新しい認証情報を入力してください
                    </div>
                    <button onClick={() => setForceEdit(false)} className="text-xs text-muted-foreground hover:text-foreground">キャンセル</button>
                  </div>
                )}
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">X API 認証情報</div>

                <div className="flex justify-end">
                  <button
                    onClick={() => setShowSecrets(!showSecrets)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {showSecrets ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showSecrets ? "隠す" : "表示"}
                  </button>
                </div>

                {[
                  { key: "apiKey",             label: "API Key (Consumer Key)" },
                  { key: "apiSecret",          label: "API Secret (Consumer Secret)" },
                  { key: "accessToken",        label: "Access Token" },
                  { key: "accessTokenSecret",  label: "Access Token Secret" },
                  { key: "bearerToken",        label: "Bearer Token（任意）" },
                ].map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{label}</label>
                    <Input
                      type={showSecrets ? "text" : "password"}
                      placeholder="••••••••"
                      value={creds[key as keyof typeof creds]}
                      onChange={e => setCreds(prev => ({ ...prev, [key]: e.target.value }))}
                      className="rounded-none font-mono text-sm"
                    />
                  </div>
                ))}

                <Button className="rounded-none w-full" onClick={handleConnect} disabled={saving}>
                  {saving ? "接続テスト中..." : "接続する"}
                </Button>
              </div>
            )}

            <div className="border border-amber-900/40 bg-amber-950/20 p-4 flex gap-3">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="font-bold text-amber-400">API取得方法</div>
                <div>1. <a href="https://developer.twitter.com" target="_blank" rel="noreferrer" className="underline text-blue-400">developer.twitter.com</a> でアプリを作成</div>
                <div>2. Read/Write 権限を設定</div>
                <div>3. API Key・Access Token を生成してここに貼り付け</div>
                <div className="mt-1 text-amber-300/80">送信上限: いいね/RT 1日1,000件・フォロー 400件（Basic以上）</div>
              </div>
            </div>
          </div>
        )}

        {/* ── ルールタブ ── */}
        {activeTab === "rules" && (
          <div className="space-y-3 max-w-2xl">
            {!account?.isConnected && (
              <div className="border border-dashed border-border p-4 text-xs text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                先にアカウントタブでX APIを接続してください
              </div>
            )}

            {loadingRules ? (
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-20 animate-pulse bg-muted/30 border border-border" />)}
              </div>
            ) : (
              (["like", "retweet", "reply", "follow"] as ActionType[]).map(actionType => {
                const rule = rules.find(r => r.actionType === actionType);
                const cfg = ACTION_CONFIG[actionType];
                const Icon = cfg.icon;
                const isEditing = editingRule === actionType;

                return (
                  <div key={actionType} className="border border-border">
                    {/* カードヘッダー */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Icon className="w-4 h-4 shrink-0" style={{ color: cfg.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold">{cfg.label}</div>
                        <div className="text-xs text-muted-foreground">{cfg.desc}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rule && (
                          <>
                            <span className="text-xs text-muted-foreground font-mono">{rule.executedToday}/{rule.dailyLimit}件</span>
                            <button
                              onClick={() => handleRun(actionType)}
                              disabled={!account?.isConnected || running !== null}
                              className="flex items-center gap-1 text-xs px-2 py-1 border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors disabled:opacity-40"
                            >
                              {running === actionType
                                ? <RefreshCw className="w-3 h-3 animate-spin" />
                                : <Zap className="w-3 h-3" />
                              }
                              今すぐ実行
                            </button>
                            <button
                              onClick={() => handleToggleRule(rule)}
                              disabled={!account?.isConnected}
                              className={`text-xs px-2 py-1 border font-mono transition-colors disabled:opacity-40 ${
                                rule.enabled
                                  ? "bg-foreground text-background border-foreground"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {rule.enabled ? "有効" : "無効"}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => {
                            if (isEditing) { setEditingRule(null); return; }
                            if (rule) openEditRule(rule);
                            else setEditingRule(actionType);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground border border-border px-2 py-1 transition-colors"
                        >
                          {isEditing ? "閉じる" : "設定"}
                        </button>
                      </div>
                    </div>

                    {/* キーワードプレビュー */}
                    {rule?.keywords && !isEditing && (
                      <div className="px-4 pb-2 text-xs text-muted-foreground font-mono truncate border-t border-border/50 pt-2">
                        キーワード: {rule.keywords}
                      </div>
                    )}

                    {/* 設定フォーム */}
                    {isEditing && (
                      <div className="border-t border-border p-4 space-y-3 bg-muted/10">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">キーワード（カンマ区切りで複数指定）</label>
                          <Input
                            placeholder="軽貨物, 物流, 運送会社"
                            value={ruleForm.keywords}
                            onChange={e => setRuleForm(p => ({ ...p, keywords: e.target.value }))}
                            className="rounded-none text-sm font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">1日の上限件数</label>
                            <Input
                              type="number"
                              value={ruleForm.dailyLimit}
                              onChange={e => setRuleForm(p => ({ ...p, dailyLimit: Number(e.target.value) }))}
                              className="rounded-none text-sm font-mono"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">実行間隔（秒）</label>
                            <Input
                              type="number"
                              value={ruleForm.intervalSeconds}
                              onChange={e => setRuleForm(p => ({ ...p, intervalSeconds: Number(e.target.value) }))}
                              className="rounded-none text-sm font-mono"
                            />
                          </div>
                        </div>
                        {actionType === "reply" && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">リプライ文面（{"{{tweet}}"} で対象ツイート冒頭を挿入）</label>
                            <Textarea
                              placeholder="はじめまして！配送のご相談があればお気軽にどうぞ🚚"
                              value={ruleForm.replyTemplate}
                              onChange={e => setRuleForm(p => ({ ...p, replyTemplate: e.target.value }))}
                              className="rounded-none text-sm min-h-[80px]"
                            />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-none" onClick={() => handleSaveRule(actionType)}>保存</Button>
                          <Button size="sm" variant="outline" className="rounded-none" onClick={() => setEditingRule(null)}>キャンセル</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── ログタブ ── */}
        {activeTab === "logs" && (
          <div className="max-w-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                実行ログ（最新100件）
              </div>
              <Button size="sm" variant="outline" className="rounded-none h-7 w-7 p-0" onClick={fetchLogs}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>

            {loadingLogs ? (
              <div className="space-y-1">
                {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse bg-muted/30 border border-border" />)}
              </div>
            ) : logs.length === 0 ? (
              <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                実行ログがありません
              </div>
            ) : (
              <div className="space-y-1">
                {logs.map(log => {
                  const cfg = ACTION_CONFIG[log.actionType as ActionType];
                  const Icon = cfg?.icon ?? Zap;
                  return (
                    <div key={log.id} className="flex items-start gap-3 border border-border px-3 py-2.5">
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: cfg?.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold">{cfg?.label ?? log.actionType}</span>
                          {log.targetUsername && (
                            <span className="text-xs text-muted-foreground font-mono">@{log.targetUsername}</span>
                          )}
                          <span
                            className="text-[10px] px-1.5 py-0.5 font-mono ml-auto"
                            style={STATUS_STYLE[log.status] ?? STATUS_STYLE.error}
                          >
                            {log.status === "success" ? "成功" : "エラー"}
                          </span>
                        </div>
                        {log.tweetContent && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{log.tweetContent}</div>
                        )}
                        {log.errorMessage && (
                          <div className="text-xs text-red-400 mt-0.5">{log.errorMessage}</div>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(log.createdAt).toLocaleString("ja-JP", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
