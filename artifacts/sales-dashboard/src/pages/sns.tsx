import { useState } from "react";
import {
  Instagram,
  Twitter,
  Facebook,
  Linkedin,
  Plus,
  Send,
  Settings,
  Users,
  Clock,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  MessageSquare,
  Trash2,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Platform = "instagram" | "twitter" | "facebook" | "linkedin";

interface PlatformConfig {
  id: Platform;
  label: string;
  icon: React.ElementType;
  color: string;
  dmLimit: string;
  note: string;
}

const PLATFORMS: PlatformConfig[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    color: "#E1306C",
    dmLimit: "1日 50〜100件",
    note: "ビジネスアカウント推奨。新規アカウントは制限あり。",
  },
  {
    id: "twitter",
    label: "Twitter / X",
    icon: Twitter,
    color: "#1DA1F2",
    dmLimit: "1日 500件（APIプランによる）",
    note: "Basic以上のAPIプランが必要。",
  },
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    color: "#1877F2",
    dmLimit: "1日 50件（個人） / ページは別途",
    note: "Messengerページ経由での自動化が安定。",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    color: "#0A66C2",
    dmLimit: "1日 20〜30件（InMail）",
    note: "Sales Navigator推奨。接続リクエストも自動化可能。",
  },
];

interface AccountSetting {
  username: string;
  connected: boolean;
}

interface DmTemplate {
  id: string;
  name: string;
  content: string;
  platform: Platform;
}

interface DmJob {
  id: string;
  platform: Platform;
  templateName: string;
  targets: number;
  sent: number;
  status: "running" | "paused" | "done" | "error";
  createdAt: string;
}

const MOCK_JOBS: DmJob[] = [
  {
    id: "1",
    platform: "instagram",
    templateName: "軽貨物荷主向けDM",
    targets: 80,
    sent: 43,
    status: "running",
    createdAt: "2026-04-11",
  },
  {
    id: "2",
    platform: "linkedin",
    templateName: "人材採用企業向け",
    targets: 30,
    sent: 30,
    status: "done",
    createdAt: "2026-04-10",
  },
];

const JOB_STATUS_STYLES: Record<DmJob["status"], { label: string; color: string; bg: string; border: string }> = {
  running: { label: "送信中", color: "#86efac", bg: "#14532d", border: "#22c55e" },
  paused:  { label: "停止中", color: "#fde68a", bg: "#451a03", border: "#f59e0b" },
  done:    { label: "完了",   color: "#93c5fd", bg: "#1e3a5f", border: "#3b82f6" },
  error:   { label: "エラー", color: "#fca5a5", bg: "#450a0a", border: "#ef4444" },
};

export default function SnsPage() {
  const { toast } = useToast();
  const [activePlatform, setActivePlatform] = useState<Platform>("instagram");
  const [activeTab, setActiveTab] = useState<"account" | "templates" | "jobs" | "schedule">("account");

  const [accounts, setAccounts] = useState<Record<Platform, AccountSetting>>({
    instagram: { username: "", connected: false },
    twitter:   { username: "", connected: false },
    facebook:  { username: "", connected: false },
    linkedin:  { username: "", connected: false },
  });

  const [templates, setTemplates] = useState<DmTemplate[]>([
    {
      id: "t1",
      platform: "instagram",
      name: "軽貨物荷主向けDM",
      content: "はじめまして、合同会社SIN JAPANの大谷と申します。\n\n貴社の配送業務に関してご提案がございます。\n軽貨物の配送コスト削減についてお話しできますでしょうか？\n\nよろしくお願いいたします。",
    },
  ]);

  const [newTemplate, setNewTemplate] = useState({ name: "", content: "" });
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [jobs, setJobs] = useState<DmJob[]>(MOCK_JOBS);

  const platform = PLATFORMS.find(p => p.id === activePlatform)!;
  const PlatformIcon = platform.icon;
  const platformTemplates = templates.filter(t => t.platform === activePlatform);

  function handleConnect() {
    const username = accounts[activePlatform].username.trim();
    if (!username) {
      toast({ title: "ユーザー名を入力してください", variant: "destructive" });
      return;
    }
    setAccounts(prev => ({ ...prev, [activePlatform]: { username, connected: true } }));
    toast({ title: `${platform.label} に接続しました` });
  }

  function handleDisconnect() {
    setAccounts(prev => ({ ...prev, [activePlatform]: { username: prev[activePlatform].username, connected: false } }));
    toast({ title: "接続を解除しました" });
  }

  function handleAddTemplate() {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) {
      toast({ title: "テンプレート名と本文を入力してください", variant: "destructive" });
      return;
    }
    setTemplates(prev => [...prev, {
      id: Date.now().toString(),
      platform: activePlatform,
      name: newTemplate.name,
      content: newTemplate.content,
    }]);
    setNewTemplate({ name: "", content: "" });
    setShowNewTemplate(false);
    toast({ title: "テンプレートを保存しました" });
  }

  function handleDeleteTemplate(id: string) {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function toggleJob(id: string) {
    setJobs(prev => prev.map(j =>
      j.id === id ? { ...j, status: j.status === "running" ? "paused" : "running" } : j
    ));
  }

  const tabs: { id: typeof activeTab; label: string; icon: React.ElementType }[] = [
    { id: "account",   label: "アカウント", icon: Settings },
    { id: "templates", label: "テンプレート", icon: MessageSquare },
    { id: "jobs",      label: "送信ジョブ", icon: Send },
    { id: "schedule",  label: "スケジュール", icon: Clock },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border px-6 py-4 shrink-0">
        <h1 className="text-lg font-bold tracking-tight font-mono uppercase">SNS DM 自動化</h1>
        <p className="text-xs text-muted-foreground mt-0.5">複数SNSプラットフォームのDM送信を自動化します</p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* プラットフォーム選択サイドバー */}
        <div className="w-44 shrink-0 border-r border-border flex flex-col py-3 gap-1 px-2">
          {PLATFORMS.map(p => {
            const Icon = p.icon;
            const isActive = activePlatform === p.id;
            const isConnected = accounts[p.id].connected;
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left w-full ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? undefined : p.color }} />
                <span className="flex-1 truncate">{p.label}</span>
                {isConnected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* プラットフォームヘッダー */}
          <div className="border-b border-border px-6 py-3 flex items-center gap-3 shrink-0">
            <PlatformIcon className="w-5 h-5" style={{ color: platform.color }} />
            <span className="font-bold text-sm">{platform.label}</span>
            <span className="text-xs text-muted-foreground border border-border px-2 py-0.5 font-mono">
              上限: {platform.dmLimit}
            </span>
            {accounts[activePlatform].connected ? (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="w-3.5 h-3.5" /> 接続済
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <XCircle className="w-3.5 h-3.5" /> 未接続
              </span>
            )}
          </div>

          {/* タブ */}
          <div className="border-b border-border flex shrink-0">
            {tabs.map(t => {
              const TabIcon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition-colors ${
                    activeTab === t.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TabIcon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* タブコンテンツ */}
          <div className="flex-1 overflow-y-auto p-6">

            {/* アカウント設定 */}
            {activeTab === "account" && (
              <div className="max-w-lg space-y-6">
                <div className="border border-border p-4 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">アカウント接続</div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">ユーザー名 / ID</label>
                    <Input
                      placeholder={`@${platform.id}_username`}
                      value={accounts[activePlatform].username}
                      onChange={e => setAccounts(prev => ({ ...prev, [activePlatform]: { ...prev[activePlatform], username: e.target.value } }))}
                      className="rounded-none font-mono text-sm"
                      disabled={accounts[activePlatform].connected}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">パスワード / APIキー</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className="rounded-none font-mono text-sm"
                      disabled={accounts[activePlatform].connected}
                    />
                  </div>
                  <div className="flex gap-2">
                    {accounts[activePlatform].connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none"
                        onClick={handleDisconnect}
                      >
                        接続解除
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-none"
                        onClick={handleConnect}
                      >
                        接続する
                      </Button>
                    )}
                  </div>
                </div>

                <div className="border border-amber-900/40 bg-amber-950/20 p-4 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-amber-400">注意事項</div>
                    <div className="text-xs text-muted-foreground">{platform.note}</div>
                    <div className="text-xs text-muted-foreground">送信上限を超えるとアカウントが一時停止される場合があります。</div>
                  </div>
                </div>

                <div className="border border-border p-4 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">送信制限設定</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">1日の送信上限</label>
                      <Input type="number" defaultValue={30} className="rounded-none font-mono text-sm" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">送信間隔（秒）</label>
                      <Input type="number" defaultValue={120} className="rounded-none font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* テンプレート */}
            {activeTab === "templates" && (
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    {platform.label} テンプレート（{platformTemplates.length}件）
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none text-xs gap-1"
                    onClick={() => setShowNewTemplate(true)}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新規作成
                  </Button>
                </div>

                {showNewTemplate && (
                  <div className="border border-border p-4 space-y-3 bg-muted/10">
                    <Input
                      placeholder="テンプレート名"
                      value={newTemplate.name}
                      onChange={e => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                      className="rounded-none text-sm"
                    />
                    <Textarea
                      placeholder="DM本文（{{company}}などの変数が使えます）"
                      value={newTemplate.content}
                      onChange={e => setNewTemplate(prev => ({ ...prev, content: e.target.value }))}
                      className="rounded-none text-sm min-h-[120px] font-mono"
                    />
                    <div className="text-xs text-muted-foreground">
                      使用可能変数: <code className="bg-muted px-1">{"{{company}}"}</code> <code className="bg-muted px-1">{"{{name}}"}</code> <code className="bg-muted px-1">{"{{industry}}"}</code>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="rounded-none" onClick={handleAddTemplate}>保存</Button>
                      <Button size="sm" variant="outline" className="rounded-none" onClick={() => setShowNewTemplate(false)}>キャンセル</Button>
                    </div>
                  </div>
                )}

                {platformTemplates.length === 0 && !showNewTemplate ? (
                  <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                    テンプレートがありません。「新規作成」から追加してください。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {platformTemplates.map(t => (
                      <div key={t.id} className="border border-border p-4 group">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold">{t.name}</span>
                          <button
                            onClick={() => handleDeleteTemplate(t.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">{t.content}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 送信ジョブ */}
            {activeTab === "jobs" && (
              <div className="max-w-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">送信ジョブ</div>
                  <Button size="sm" className="rounded-none text-xs gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    新規ジョブ
                  </Button>
                </div>

                {jobs.length === 0 ? (
                  <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                    ジョブがありません
                  </div>
                ) : (
                  <div className="space-y-2">
                    {jobs.map(job => {
                      const p = PLATFORMS.find(p => p.id === job.platform)!;
                      const JobIcon = p.icon;
                      const statusStyle = JOB_STATUS_STYLES[job.status];
                      const progress = Math.round((job.sent / job.targets) * 100);
                      return (
                        <div key={job.id} className="border border-border p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <JobIcon className="w-4 h-4" style={{ color: p.color }} />
                              <span className="text-sm font-bold">{job.templateName}</span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 font-mono"
                                style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}
                              >
                                {statusStyle.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(job.status === "running" || job.status === "paused") && (
                                <button
                                  onClick={() => toggleJob(job.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {job.status === "running"
                                    ? <Pause className="w-4 h-4" />
                                    : <Play className="w-4 h-4" />
                                  }
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mb-2">
                            <span><Users className="w-3 h-3 inline mr-1" />{job.targets}件対象</span>
                            <span><Send className="w-3 h-3 inline mr-1" />{job.sent}件送信済</span>
                            <span className="ml-auto">{job.createdAt}</span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-foreground transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-1 text-right">{progress}%</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* スケジュール */}
            {activeTab === "schedule" && (
              <div className="max-w-lg space-y-6">
                <div className="border border-border p-4 space-y-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">自動送信スケジュール</div>
                  <div className="space-y-3">
                    {[
                      { label: "月〜金 09:00〜12:00", active: true },
                      { label: "月〜金 13:00〜17:00", active: true },
                      { label: "土曜 10:00〜12:00", active: false },
                    ].map((s, i) => (
                      <div key={i} className="flex items-center justify-between border border-border px-3 py-2">
                        <span className="text-sm font-mono">{s.label}</span>
                        <button
                          className={`text-xs px-2 py-0.5 font-mono border transition-colors ${
                            s.active
                              ? "bg-foreground text-background border-foreground"
                              : "text-muted-foreground border-border"
                          }`}
                        >
                          {s.active ? "有効" : "無効"}
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" className="rounded-none text-xs gap-1">
                    <Plus className="w-3.5 h-3.5" />
                    時間帯を追加
                  </Button>
                </div>

                <div className="border border-border p-4 space-y-3">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ターゲット自動取得</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    リストページで収集した企業のSNSアカウントを自動検索し、DMターゲットに追加します。
                  </p>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="auto-target" className="accent-foreground" />
                    <label htmlFor="auto-target" className="text-xs text-muted-foreground">
                      メール送信済みリードのSNSアカウントを自動検索する
                    </label>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
