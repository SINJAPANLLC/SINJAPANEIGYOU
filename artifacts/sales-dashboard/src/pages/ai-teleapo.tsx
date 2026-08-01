import { useState, useEffect, useCallback, useRef } from "react";
import { Phone, Plus, Save, Trash2, PhoneCall, PhoneOff, Clock, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Wifi, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  id: number;
  name: string;
  systemPrompt: string;
  firstMessage: string;
  targetNumbers: string; // JSON string[]
  excludeNumbers: string;
  maxCallsPerDay: number;
  scheduleStart: string;
  scheduleEnd: string;
  enabled: boolean;
  createdAt: string;
}

interface TeleapoCall {
  id: number;
  campaignId: number | null;
  phoneNumber: string;
  twilioCallSid: string | null;
  status: string;
  outcome: string | null;
  transcript: string; // JSON
  summary: string | null;
  durationSec: number | null;
  avgLatencyMs: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

type Tab = "settings" | "dial" | "logs";

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  interested: { label: "興味あり", color: "text-green-400" },
  "not-interested": { label: "興味なし", color: "text-zinc-400" },
  appointment: { label: "アポ獲得", color: "text-blue-400" },
  "no-answer": { label: "不在", color: "text-yellow-400" },
  rejected: { label: "架電拒否", color: "text-red-400" },
  callback: { label: "再架電", color: "text-orange-400" },
  unknown: { label: "不明", color: "text-zinc-500" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "待機", color: "text-zinc-400" },
  dialing: { label: "発信中", color: "text-yellow-400" },
  "in-progress": { label: "通話中", color: "text-green-400" },
  completed: { label: "完了", color: "text-zinc-300" },
  failed: { label: "失敗", color: "text-red-400" },
  "no-answer": { label: "不在", color: "text-yellow-400" },
  busy: { label: "話中", color: "text-orange-400" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function latencyColor(ms: number | null) {
  if (ms === null) return "text-zinc-500";
  if (ms < 500) return "text-green-400";
  if (ms < 1000) return "text-yellow-400";
  return "text-red-400";
}

function latencyBar(ms: number | null) {
  if (ms === null) return 0;
  return Math.min(100, Math.round((ms / 2000) * 100));
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseNumbers(raw: string): string[] {
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AiTeleapoPage() {
  const [tab, setTab] = useState<Tab>("settings");

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Draft form
  const [draft, setDraft] = useState<Partial<Campaign>>({});
  const [targetText, setTargetText] = useState(""); // textarea: one number per line
  const [excludeText, setExcludeText] = useState("");

  // Dial tab
  const [dialNumber, setDialNumber] = useState("");
  const [dialCampaignId, setDialCampaignId] = useState<number | null>(null);
  const [activeCall, setActiveCall] = useState<TeleapoCall | null>(null);
  const [dialing, setDialing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Logs tab
  const [calls, setCalls] = useState<TeleapoCall[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  // Twilio config warning
  const [twilioMissing, setTwilioMissing] = useState(false);

  const { isSignedIn } = useAuth();

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/teleapo/campaigns", { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json() as Campaign[];
    setCampaigns(data);
    if (data.length > 0 && !selectedId) {
      setSelectedId(data[0].id);
    }
  }, [selectedId]);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    const res = await fetch("/api/teleapo/calls", { credentials: "include" });
    if (res.ok) setCalls(await res.json() as TeleapoCall[]);
    setLoadingLogs(false);
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    fetchCampaigns();
  }, [isSignedIn, fetchCampaigns]);

  useEffect(() => {
    if (tab === "logs") fetchLogs();
  }, [tab, fetchLogs]);

  // Sync draft when selected campaign changes
  useEffect(() => {
    const c = campaigns.find(c => c.id === selectedId);
    if (c) {
      setDraft(c);
      setTargetText(parseNumbers(c.targetNumbers).join("\n"));
      setExcludeText(parseNumbers(c.excludeNumbers).join("\n"));
    } else {
      setDraft({});
      setTargetText("");
      setExcludeText("");
    }
  }, [selectedId, campaigns]);

  // Poll active call status
  useEffect(() => {
    if (activeCall && (activeCall.status === "dialing" || activeCall.status === "in-progress")) {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/teleapo/calls?campaignId=0`, { credentials: "include" });
        if (!res.ok) return;
        const all = await res.json() as TeleapoCall[];
        const updated = all.find(c => c.id === activeCall.id);
        if (updated) {
          setActiveCall(updated);
          if (updated.status === "completed" || updated.status === "failed" || updated.status === "no-answer") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 2000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeCall?.id, activeCall?.status]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function createCampaign() {
    const res = await fetch("/api/teleapo/campaigns", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新規キャンペーン" }),
    });
    if (!res.ok) return;
    const row = await res.json() as Campaign;
    setCampaigns(prev => [row, ...prev]);
    setSelectedId(row.id);
  }

  async function saveCampaign() {
    if (!selectedId) return;
    setSaving(true);
    const body = {
      ...draft,
      targetNumbers: targetText.split("\n").map(s => s.trim()).filter(Boolean),
      excludeNumbers: excludeText.split("\n").map(s => s.trim()).filter(Boolean),
    };
    const res = await fetch(`/api/teleapo/campaigns/${selectedId}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json() as Campaign;
      setCampaigns(prev => prev.map(c => c.id === selectedId ? updated : c));
    }
    setSaving(false);
  }

  async function deleteCampaign() {
    if (!selectedId || !confirm("このキャンペーンを削除しますか？")) return;
    await fetch(`/api/teleapo/campaigns/${selectedId}`, { method: "DELETE", credentials: "include" });
    setCampaigns(prev => prev.filter(c => c.id !== selectedId));
    setSelectedId(null);
  }

  async function handleDial() {
    if (!dialNumber.trim()) return;
    setDialing(true);
    setTwilioMissing(false);

    // 1. Create call record
    const createRes = await fetch("/api/teleapo/calls", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: dialNumber.trim(), campaignId: dialCampaignId }),
    });
    if (!createRes.ok) { setDialing(false); return; }
    const call = await createRes.json() as TeleapoCall;
    setActiveCall(call);

    // 2. Dial
    const dialRes = await fetch(`/api/teleapo/calls/${call.id}/dial`, {
      method: "POST",
      credentials: "include",
    });
    if (!dialRes.ok) {
      const err = await dialRes.json() as { error: string };
      if (err.error?.includes("Twilio未設定")) setTwilioMissing(true);
      setActiveCall(prev => prev ? { ...prev, status: "failed" } : null);
    } else {
      const updated = await dialRes.json() as { twilioSid: string };
      setActiveCall(prev => prev ? { ...prev, status: "dialing", twilioCallSid: updated.twilioSid } : null);
    }
    setDialing(false);
  }

  async function updateOutcome(callId: number, outcome: string) {
    await fetch(`/api/teleapo/calls/${callId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    setCalls(prev => prev.map(c => c.id === callId ? { ...c, outcome } : c));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedCampaign = campaigns.find(c => c.id === selectedId);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Phone className="w-5 h-5" />
          <h1 className="text-base font-semibold tracking-tight">AIテレアポ</h1>
          <span className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 uppercase tracking-wider">Beta</span>
        </div>
        <button
          onClick={createCampaign}
          className="flex items-center gap-2 text-xs px-3 py-1.5 border border-border hover:bg-muted transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          新規キャンペーン
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["settings", "dial", "logs"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 ${
              tab === t
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "settings" ? "設定" : t === "dial" ? "発信" : "ログ"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* ── 設定タブ ── */}
        {tab === "settings" && (
          <div className="flex h-full min-h-0">
            {/* Campaign list sidebar */}
            <div className="w-48 border-r border-border shrink-0 overflow-y-auto">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground px-3 pt-4 pb-2">キャンペーン</div>
              {campaigns.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">まだありません</p>
              )}
              {campaigns.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-border/50 ${
                    selectedId === c.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Settings form */}
            <div className="flex-1 p-6 overflow-y-auto">
              {!selectedId ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Phone className="w-8 h-8 opacity-30" />
                  <p className="text-sm">キャンペーンを選択または作成してください</p>
                </div>
              ) : (
                <div className="max-w-3xl space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">キャンペーン名</label>
                        <input
                          className="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors"
                          value={draft.name ?? ""}
                          onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">開始時刻</label>
                          <input
                            type="time"
                            className="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                            value={draft.scheduleStart ?? "09:00"}
                            onChange={e => setDraft(p => ({ ...p, scheduleStart: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">終了時刻</label>
                          <input
                            type="time"
                            className="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                            value={draft.scheduleEnd ?? "18:00"}
                            onChange={e => setDraft(p => ({ ...p, scheduleEnd: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">最大架電数/日</label>
                        <input
                          type="number"
                          min={1} max={500}
                          className="w-full bg-transparent border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                          value={draft.maxCallsPerDay ?? 10}
                          onChange={e => setDraft(p => ({ ...p, maxCallsPerDay: Number(e.target.value) }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">ターゲット電話番号（1行1件）</label>
                        <textarea
                          rows={6}
                          className="w-full bg-transparent border border-border px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground resize-none"
                          placeholder={"+81-90-1234-5678\n+81-3-1234-5678"}
                          value={targetText}
                          onChange={e => setTargetText(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">除外リスト（1行1件）</label>
                        <textarea
                          rows={3}
                          className="w-full bg-transparent border border-border px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground resize-none"
                          placeholder="+81-90-0000-0000"
                          value={excludeText}
                          onChange={e => setExcludeText(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Right column */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">AIシステムプロンプト（トーク台本）</label>
                        <textarea
                          rows={10}
                          className="w-full bg-transparent border border-border px-3 py-2 text-xs focus:outline-none focus:border-foreground resize-none"
                          placeholder={"あなたは株式会社SINJAPANの営業AIです。\n軽貨物配送の外注先を探している企業に対して、自社サービスを提案します。\n・丁寧かつ簡潔に話す\n・相手の状況を聞いてから提案する\n・アポ取りを目標とする"}
                          value={draft.systemPrompt ?? ""}
                          onChange={e => setDraft(p => ({ ...p, systemPrompt: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">最初のセリフ（電話に出た直後）</label>
                        <textarea
                          rows={4}
                          className="w-full bg-transparent border border-border px-3 py-2 text-xs focus:outline-none focus:border-foreground resize-none"
                          placeholder="お世話になります。株式会社SINJAPANと申します。少々お時間よろしいでしょうか？"
                          value={draft.firstMessage ?? ""}
                          onChange={e => setDraft(p => ({ ...p, firstMessage: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={saveCampaign}
                      disabled={saving}
                      className="flex items-center gap-2 text-xs px-4 py-2 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? "保存中..." : "保存"}
                    </button>
                    <button
                      onClick={deleteCampaign}
                      className="flex items-center gap-2 text-xs px-3 py-2 border border-border text-muted-foreground hover:text-red-400 hover:border-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      削除
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 発信タブ ── */}
        {tab === "dial" && (
          <div className="p-6 space-y-6 max-w-2xl">
            {twilioMissing && (
              <div className="flex items-start gap-3 border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-yellow-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Twilio未設定</p>
                  <p className="text-yellow-400/80">TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER をSecretに設定してください。</p>
                </div>
              </div>
            )}

            {/* Dial form */}
            <div className="space-y-4 border border-border p-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">発信設定</div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">電話番号</label>
                <input
                  className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:border-foreground transition-colors"
                  placeholder="+81-90-1234-5678"
                  value={dialNumber}
                  onChange={e => setDialNumber(e.target.value)}
                  disabled={dialing}
                />
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground block mb-1">キャンペーン（任意）</label>
                <select
                  className="w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-foreground"
                  value={dialCampaignId ?? ""}
                  onChange={e => setDialCampaignId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">なし（デフォルト設定）</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleDial}
                disabled={dialing || !dialNumber.trim()}
                className="flex items-center gap-2 text-sm px-5 py-2.5 bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 w-full justify-center"
              >
                <PhoneCall className="w-4 h-4" />
                {dialing ? "発信中..." : "発信する"}
              </button>
            </div>

            {/* Live call monitor */}
            {activeCall && (
              <div className="border border-border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">ライブモニター</div>
                  <div className={`flex items-center gap-1.5 text-xs font-mono ${STATUS_LABELS[activeCall.status]?.color ?? "text-zinc-400"}`}>
                    {(activeCall.status === "dialing" || activeCall.status === "in-progress") && (
                      <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                    )}
                    {STATUS_LABELS[activeCall.status]?.label ?? activeCall.status}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">電話番号</div>
                    <div className="font-mono">{activeCall.phoneNumber}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">通話時間</div>
                    <div className="font-mono">{activeCall.durationSec != null ? `${activeCall.durationSec}秒` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Twilio SID</div>
                    <div className="font-mono text-[10px] truncate">{activeCall.twilioCallSid ?? "—"}</div>
                  </div>
                </div>

                {/* Latency display */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      <Wifi className="w-3 h-3" />
                      AI応答ラグ
                    </div>
                    <span className={`text-sm font-mono font-bold ${latencyColor(activeCall.avgLatencyMs)}`}>
                      {activeCall.avgLatencyMs != null ? `${activeCall.avgLatencyMs}ms` : "計測中..."}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        activeCall.avgLatencyMs == null ? "w-0" :
                        activeCall.avgLatencyMs < 500 ? "bg-green-400" :
                        activeCall.avgLatencyMs < 1000 ? "bg-yellow-400" : "bg-red-400"
                      }`}
                      style={{ width: `${latencyBar(activeCall.avgLatencyMs)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>0ms</span><span>500ms</span><span>1000ms</span><span>2000ms+</span>
                  </div>
                </div>

                {/* Outcome buttons (after call) */}
                {(activeCall.status === "completed") && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">結果</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(OUTCOME_LABELS).map(([key, { label, color }]) => (
                        <button
                          key={key}
                          onClick={() => updateOutcome(activeCall.id, key)}
                          className={`text-xs px-3 py-1 border transition-colors ${
                            activeCall.outcome === key
                              ? `border-current ${color} bg-current/10`
                              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcript preview */}
                {(() => {
                  try {
                    const items = JSON.parse(activeCall.transcript) as { role: string; text: string }[];
                    if (items.length === 0) return null;
                    return (
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">文字起こし</div>
                        <div className="space-y-1 max-h-48 overflow-y-auto text-xs border border-border p-3">
                          {items.map((item, i) => (
                            <div key={i} className={`flex gap-2 ${item.role === "assistant" ? "text-blue-400" : "text-zinc-300"}`}>
                              <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-12">
                                {item.role === "assistant" ? "AI" : "相手"}
                              </span>
                              <span>{item.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  } catch { return null; }
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── ログタブ ── */}
        {tab === "logs" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">通話ログ（最新100件）</div>
              <button
                onClick={fetchLogs}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? "animate-spin" : ""}`} />
                更新
              </button>
            </div>

            {calls.length === 0 && !loadingLogs && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                <PhoneOff className="w-8 h-8 opacity-30" />
                <p className="text-sm">通話ログはまだありません</p>
              </div>
            )}

            <div className="space-y-px">
              {calls.map(call => {
                const statusInfo = STATUS_LABELS[call.status] ?? { label: call.status, color: "text-zinc-400" };
                const outcomeInfo = call.outcome ? OUTCOME_LABELS[call.outcome] : null;
                const isExpanded = expandedLog === call.id;
                const transcript = (() => {
                  try { return JSON.parse(call.transcript) as { role: string; text: string }[]; } catch { return []; }
                })();

                return (
                  <div key={call.id} className="border border-border">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedLog(isExpanded ? null : call.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-xs font-mono ${statusInfo.color}`}>{statusInfo.label}</span>
                        <span className="font-mono text-sm">{call.phoneNumber}</span>
                        {outcomeInfo && (
                          <span className={`text-xs px-2 py-0.5 border border-current/30 ${outcomeInfo.color}`}>
                            {outcomeInfo.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                        {call.durationSec != null && (
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{call.durationSec}秒</span>
                        )}
                        {call.avgLatencyMs != null && (
                          <span className={`flex items-center gap-1 font-mono ${latencyColor(call.avgLatencyMs)}`}>
                            <Wifi className="w-3 h-3" />{call.avgLatencyMs}ms
                          </span>
                        )}
                        <span>{fmt(call.createdAt)}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                        {call.summary && (
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">要約</div>
                            <p className="text-xs text-zinc-300">{call.summary}</p>
                          </div>
                        )}

                        {transcript.length > 0 && (
                          <div>
                            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">文字起こし</div>
                            <div className="space-y-1 max-h-56 overflow-y-auto text-xs bg-muted/20 border border-border p-3">
                              {transcript.map((item, i) => (
                                <div key={i} className={`flex gap-2 ${item.role === "assistant" ? "text-blue-400" : "text-zinc-300"}`}>
                                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground w-12">
                                    {item.role === "assistant" ? "AI" : "相手"}
                                  </span>
                                  <span>{item.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Outcome editor */}
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">結果</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(OUTCOME_LABELS).map(([key, { label, color }]) => (
                              <button
                                key={key}
                                onClick={() => updateOutcome(call.id, key)}
                                className={`text-xs px-3 py-1 border transition-colors ${
                                  call.outcome === key
                                    ? `border-current ${color} bg-current/10`
                                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
