import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, RefreshCw, Play, CheckCircle2, XCircle,
  Eye, EyeOff, Send, Clock, BarChart2, MessageSquare,
} from "lucide-react";

const TIKTOK_COLOR = "#fe2c55";

interface TikTokAccount {
  id: number;
  label: string;
  username: string | null;
  isConnected: boolean;
  createdAt: string;
}

interface DmRule {
  id: number;
  accountId: number;
  enabled: boolean;
  targetHashtag: string;
  targetKeyword: string;
  messageTemplate: string;
  dailyLimit: number;
  executedToday: number;
  lastRunAt: string | null;
  scheduleTimes: string;
  minFollowers: number;
  genderFilter: "any" | "female" | "male";
}

interface DmLog {
  id: number;
  targetUsername: string | null;
  targetUserId: string | null;
  message: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

type Tab = "account" | "rule" | "logs";

function AddAccountModal({ onAdded, onCancel }: { onAdded: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [sessionCookie, setSessionCookie] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!sessionCookie.trim()) { toast({ title: "セッションCookieを入力してください", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/tiktok/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, sessionCookie: sessionCookie.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: data.account.username ? `@${data.account.username} を追加しました` : "アカウントを追加しました" });
      if (data.warning) toast({ title: data.warning, variant: "destructive" });
      onAdded();
    } catch (err: any) {
      toast({ title: err.message ?? "追加に失敗しました", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border w-full max-w-lg shadow-2xl">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-mono uppercase tracking-wider">
            <Plus className="w-4 h-4" style={{ color: TIKTOK_COLOR }} />
            TikTok アカウント追加
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">表示名（任意）</label>
            <Input placeholder="例：法人アカウント" value={label} onChange={e => setLabel(e.target.value)} className="rounded-none" />
          </div>
          <div className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400 space-y-1">
            <div className="font-medium">セッションCookieの取得方法</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>PCブラウザでTikTokにログイン</li>
              <li>F12 → アプリケーション → Cookie → www.tiktok.com</li>
              <li>「sessionid」の値をコピー</li>
            </ol>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">sessionid（TikTok Cookie）</label>
              <button onClick={() => setShow(!show)} className="text-xs text-muted-foreground flex items-center gap-1">
                {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            </div>
            <Input
              type={show ? "text" : "password"}
              placeholder="sessionidの値を貼り付け"
              value={sessionCookie}
              onChange={e => setSessionCookie(e.target.value)}
              className="rounded-none font-mono text-xs"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="rounded-none flex-1" onClick={onCancel}>キャンセル</Button>
            <Button className="rounded-none flex-1" onClick={submit} disabled={loading}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
              追加 & 接続確認
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountPanel({ account, onDeleted }: { account: TikTokAccount; onDeleted: () => void }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("account");
  const [rule, setRule] = useState<DmRule | null>(null);
  const [ruleEdit, setRuleEdit] = useState<DmRule | null>(null);
  const [logs, setLogs] = useState<DmLog[]>([]);
  const [loadingRule, setLoadingRule] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchRule = useCallback(async () => {
    setLoadingRule(true);
    try {
      const res = await fetch(`/api/tiktok/accounts/${account.id}/rule`, { credentials: "include" });
      const data = await res.json();
      setRule(data);
      setRuleEdit({ ...data });
    } catch { } finally { setLoadingRule(false); }
  }, [account.id]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/tiktok/accounts/${account.id}/logs`, { credentials: "include" });
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch { } finally { setLoadingLogs(false); }
  }, [account.id]);

  useEffect(() => {
    if (tab === "rule") fetchRule();
    if (tab === "logs") fetchLogs();
  }, [tab, fetchRule, fetchLogs]);

  async function handleDelete() {
    if (!confirm(`「${account.label}」を削除しますか？`)) return;
    try {
      await fetch(`/api/tiktok/accounts/${account.id}`, { method: "DELETE", credentials: "include" });
      onDeleted();
    } catch { toast({ title: "削除に失敗しました", variant: "destructive" }); }
  }

  async function handleSaveRule() {
    if (!ruleEdit) return;
    setSavingRule(true);
    try {
      const res = await fetch(`/api/tiktok/accounts/${account.id}/rule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(ruleEdit),
      });
      if (!res.ok) throw new Error("保存失敗");
      toast({ title: "DMルールを保存しました" });
      await fetchRule();
    } catch { toast({ title: "保存に失敗しました", variant: "destructive" }); }
    finally { setSavingRule(false); }
  }

  async function handleRun() {
    setRunning(true);
    try {
      const res = await fetch(`/api/tiktok/accounts/${account.id}/run`, {
        method: "POST", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: data.message });
      setTimeout(() => fetchLogs(), 5000);
    } catch (err: any) {
      toast({ title: err.message ?? "実行に失敗しました", variant: "destructive" });
    } finally { setRunning(false); }
  }

  function toggleHour(hour: number) {
    if (!ruleEdit) return;
    const current = ruleEdit.scheduleTimes ? ruleEdit.scheduleTimes.split(",").map(Number) : [];
    const next = current.includes(hour) ? current.filter(h => h !== hour) : [...current, hour].sort((a, b) => a - b);
    setRuleEdit(r => r ? { ...r, scheduleTimes: next.join(",") } : r);
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "account", label: "アカウント", icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: "rule", label: "DMルール", icon: <Send className="w-3.5 h-3.5" /> },
    { id: "logs", label: "実行ログ", icon: <BarChart2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border flex gap-0 px-6 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
              tab === t.id ? "border-[#fe2c55] text-[#fe2c55]" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "account" && (
          <div className="max-w-md space-y-4">
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
                  <div className="text-xs text-muted-foreground">{account.username ? `@${account.username}` : "セッション未確認"}</div>
                </div>
                {account.isConnected ? <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" /> : <XCircle className="w-4 h-4 text-muted-foreground ml-auto" />}
              </div>
              <div className="text-xs text-muted-foreground border border-border/50 bg-muted/5 p-3">
                セッションCookieを更新する場合は、このアカウントを削除して再追加してください。
              </div>
            </div>
          </div>
        )}

        {tab === "rule" && (
          <div className="max-w-lg space-y-4">
            {loadingRule ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 読み込み中...
              </div>
            ) : ruleEdit && (
              <>
                <div className="border border-border p-5 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">ターゲット設定</div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">ターゲットハッシュタグ（例: 軽貨物）</label>
                    <Input
                      placeholder="#軽貨物"
                      value={ruleEdit.targetHashtag}
                      onChange={e => setRuleEdit(r => r ? { ...r, targetHashtag: e.target.value } : r)}
                      className="rounded-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">ターゲットキーワード（例: 軽貨物 ドライバー）</label>
                    <Input
                      placeholder="軽貨物 ドライバー 募集"
                      value={ruleEdit.targetKeyword}
                      onChange={e => setRuleEdit(r => r ? { ...r, targetKeyword: e.target.value } : r)}
                      className="rounded-none"
                    />
                  </div>
                </div>

                <div className="border border-border p-5 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">DMメッセージテンプレート</div>
                  <div className="text-xs text-muted-foreground">
                    <code className="bg-muted px-1">{"{{username}}"}</code> でユーザー名に自動置換されます
                  </div>
                  <Textarea
                    placeholder={"はじめまして。\n合同会社SIN JAPANの大谷と申します。\n\n突然のご連絡失礼いたします。\n\nTikTokでのご活動を拝見し、\n発信内容や方向性に大きな可能性を感じ、ご連絡させていただきました。\n\n初期費用は一切不要で、\n売上に応じたレベニューシェア（成果報酬型）でのご提携を想定しております。\n\nもし少しでもご興味があれば、ぜひ一度お話の機会を頂戴できましたら幸いです。"}
                    value={ruleEdit.messageTemplate}
                    onChange={e => setRuleEdit(r => r ? { ...r, messageTemplate: e.target.value } : r)}
                    className="rounded-none min-h-[240px] text-sm"
                  />
                </div>

                <div className="border border-border p-5 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ターゲットフィルター</div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">性別フィルター</label>
                    <div className="flex gap-2">
                      {(["any", "female", "male"] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => setRuleEdit(r => r ? { ...r, genderFilter: g } : r)}
                          className={`px-3 py-1.5 text-xs border rounded-none transition-colors ${
                            ruleEdit.genderFilter === g
                              ? "border-[#fe2c55] bg-[#fe2c55]/10 text-[#fe2c55]"
                              : "border-border text-muted-foreground hover:border-foreground"
                          }`}
                        >
                          {g === "any" ? "指定なし" : g === "female" ? "女性のみ" : "男性のみ"}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground/70 mt-1">
                      ※ プロフィール・自己紹介文のキーワードと絵文字で判定（推定）
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">最低フォロワー数</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={1000}
                        value={ruleEdit.minFollowers}
                        onChange={e => setRuleEdit(r => r ? { ...r, minFollowers: Number(e.target.value) } : r)}
                        className="rounded-none w-36"
                      />
                      <span className="text-xs text-muted-foreground">人以上</span>
                    </div>
                    <div className="flex gap-1.5 mt-1.5">
                      {[0, 1000, 5000, 10000, 50000].map(v => (
                        <button
                          key={v}
                          onClick={() => setRuleEdit(r => r ? { ...r, minFollowers: v } : r)}
                          className={`px-2 py-1 text-xs border rounded-none transition-colors ${
                            ruleEdit.minFollowers === v
                              ? "border-[#fe2c55] bg-[#fe2c55]/10 text-[#fe2c55]"
                              : "border-border text-muted-foreground hover:border-foreground"
                          }`}
                        >
                          {v === 0 ? "制限なし" : v >= 10000 ? `${v / 10000}万+` : `${v.toLocaleString()}+`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border border-border p-5 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">実行設定</div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">1日の送信上限</label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={ruleEdit.dailyLimit}
                      onChange={e => setRuleEdit(r => r ? { ...r, dailyLimit: Number(e.target.value) } : r)}
                      className="rounded-none w-32"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">自動実行時刻（JST）</label>
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 24 }, (_, h) => {
                        const selected = ruleEdit.scheduleTimes ? ruleEdit.scheduleTimes.split(",").map(Number).includes(h) : false;
                        return (
                          <button
                            key={h}
                            onClick={() => toggleHour(h)}
                            className={`w-9 h-7 text-xs border transition-colors rounded-none ${selected ? "border-[#fe2c55] bg-[#fe2c55]/10 text-[#fe2c55]" : "border-border text-muted-foreground hover:border-foreground"}`}
                          >
                            {h}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleEdit.enabled}
                      onChange={e => setRuleEdit(r => r ? { ...r, enabled: e.target.checked } : r)}
                      className="accent-[#fe2c55]"
                    />
                    <span className="text-sm">自動実行を有効にする</span>
                  </label>
                </div>

                {rule && (
                  <div className="border border-border/50 bg-muted/5 p-3 text-xs text-muted-foreground flex items-center gap-4">
                    <span>本日送信: <span className="text-foreground font-medium">{rule.executedToday}</span> / {rule.dailyLimit}</span>
                    {rule.lastRunAt && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />最終実行: {new Date(rule.lastRunAt).toLocaleString("ja-JP")}</span>}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button className="rounded-none flex-1" onClick={handleSaveRule} disabled={savingRule}>
                    {savingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" /> : null}
                    保存
                  </Button>
                  <Button
                    className="rounded-none flex-1 gap-2"
                    style={{ backgroundColor: TIKTOK_COLOR }}
                    onClick={handleRun}
                    disabled={running}
                  >
                    {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    今すぐ実行
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "logs" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">送信ログ（最新100件）</div>
              <button onClick={fetchLogs} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
              </button>
            </div>
            {loadingLogs ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-4">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> 読み込み中...
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">ログがありません</div>
            ) : (
              <div className="border border-border divide-y divide-border">
                {logs.map(log => (
                  <div key={log.id} className="px-4 py-3 flex items-start gap-3 text-xs">
                    {log.status === "success"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      : log.status === "skipped"
                        ? <span className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400 text-[10px] font-bold leading-3.5">SKIP</span>
                        : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {log.targetUsername ? `@${log.targetUsername}` : log.targetUserId}
                        {log.status === "skipped" && <span className="text-amber-400/70 font-normal">スキップ</span>}
                      </div>
                      {log.message && <div className="text-muted-foreground truncate mt-0.5">{log.message}</div>}
                      {log.errorMessage && <div className={`mt-0.5 ${log.status === "skipped" ? "text-amber-400/80" : "text-red-400"}`}>{log.errorMessage}</div>}
                    </div>
                    <div className="text-muted-foreground shrink-0">{new Date(log.createdAt).toLocaleString("ja-JP")}</div>
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

export default function TikTokDmPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: accounts = [], isLoading } = useQuery<TikTokAccount[]>({
    queryKey: ["tiktok-accounts"],
    queryFn: () => fetch("/api/tiktok/accounts", { credentials: "include" }).then(r => r.json()),
  });

  useEffect(() => {
    if (!selectedId && accounts.length > 0) setSelectedId(accounts[0].id);
  }, [accounts, selectedId]);

  const selected = accounts.find(a => a.id === selectedId) ?? null;

  return (
    <div className="flex h-full min-h-0">
      {showAdd && (
        <AddAccountModal
          onAdded={() => { setShowAdd(false); queryClient.invalidateQueries({ queryKey: ["tiktok-accounts"] }); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* 左パネル: アカウント一覧 */}
      <div className="w-60 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold" style={{ color: TIKTOK_COLOR }}>TikTok</span>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">DM</span>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoading ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">読み込み中...</div>
          ) : accounts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <div className="text-xs text-muted-foreground mb-3">アカウントがありません</div>
              <Button size="sm" className="rounded-none w-full text-xs gap-1" onClick={() => setShowAdd(true)}>
                <Plus className="w-3.5 h-3.5" /> アカウント追加
              </Button>
            </div>
          ) : (
            accounts.map(acc => (
              <button
                key={acc.id}
                onClick={() => setSelectedId(acc.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-2.5 transition-colors ${
                  selectedId === acc.id ? "bg-muted/50 border-r-2 border-[#fe2c55]" : "hover:bg-muted/30"
                }`}
              >
                <div className={`w-2 h-2 rounded-full shrink-0 ${acc.isConnected ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{acc.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{acc.username ? `@${acc.username}` : "未確認"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* 右パネル: 詳細 */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        {selected ? (
          <AccountPanel
            key={selected.id}
            account={selected}
            onDeleted={() => {
              setSelectedId(null);
              queryClient.invalidateQueries({ queryKey: ["tiktok-accounts"] });
            }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            左のアカウントを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
