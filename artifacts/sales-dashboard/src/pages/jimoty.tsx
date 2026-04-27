import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2, Loader2, PlayCircle, ExternalLink, MapPin, Building2,
  AlertCircle, CheckCircle2, Clock, Plus, Star, User, Users,
  RefreshCw, Send, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Prefecture map ───────────────────────────────────────────────────────────
const PREFECTURES: { label: string; value: string }[] = [
  { label: "北海道", value: "hokkaido" },
  { label: "青森県", value: "aomori-ken" },
  { label: "岩手県", value: "iwate-ken" },
  { label: "宮城県", value: "miyagi-ken" },
  { label: "秋田県", value: "akita-ken" },
  { label: "山形県", value: "yamagata-ken" },
  { label: "福島県", value: "fukushima-ken" },
  { label: "茨城県", value: "ibaraki-ken" },
  { label: "栃木県", value: "tochigi-ken" },
  { label: "群馬県", value: "gunma-ken" },
  { label: "埼玉県", value: "saitama-ken" },
  { label: "千葉県", value: "chiba-ken" },
  { label: "東京都", value: "tokyo-to" },
  { label: "神奈川県", value: "kanagawa-ken" },
  { label: "新潟県", value: "niigata-ken" },
  { label: "富山県", value: "toyama-ken" },
  { label: "石川県", value: "ishikawa-ken" },
  { label: "福井県", value: "fukui-ken" },
  { label: "山梨県", value: "yamanashi-ken" },
  { label: "長野県", value: "nagano-ken" },
  { label: "岐阜県", value: "gifu-ken" },
  { label: "静岡県", value: "shizuoka-ken" },
  { label: "愛知県", value: "aichi-ken" },
  { label: "三重県", value: "mie-ken" },
  { label: "滋賀県", value: "shiga-ken" },
  { label: "京都府", value: "kyoto-fu" },
  { label: "大阪府", value: "osaka-fu" },
  { label: "兵庫県", value: "hyogo-ken" },
  { label: "奈良県", value: "nara-ken" },
  { label: "和歌山県", value: "wakayama-ken" },
  { label: "鳥取県", value: "tottori-ken" },
  { label: "島根県", value: "shimane-ken" },
  { label: "岡山県", value: "okayama-ken" },
  { label: "広島県", value: "hiroshima-ken" },
  { label: "山口県", value: "yamaguchi-ken" },
  { label: "徳島県", value: "tokushima-ken" },
  { label: "香川県", value: "kagawa-ken" },
  { label: "愛媛県", value: "ehime-ken" },
  { label: "高知県", value: "kochi-ken" },
  { label: "福岡県", value: "fukuoka-ken" },
  { label: "佐賀県", value: "saga-ken" },
  { label: "長崎県", value: "nagasaki-ken" },
  { label: "熊本県", value: "kumamoto-ken" },
  { label: "大分県", value: "oita-ken" },
  { label: "宮崎県", value: "miyazaki-ken" },
  { label: "鹿児島県", value: "kagoshima-ken" },
  { label: "沖縄県", value: "okinawa-ken" },
];

const CRON_PRESETS = [
  { label: "毎日 9:00 JST",  value: "0 0 * * *" },
  { label: "毎日 11:00 JST", value: "0 2 * * *" },
  { label: "毎日 14:00 JST", value: "0 5 * * *" },
  { label: "毎日 18:00 JST", value: "0 9 * * *" },
  { label: "毎日 21:00 JST", value: "0 12 * * *" },
  { label: "カスタム",        value: "custom" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface JimotyAccount { id: number; label: string; email: string; isDefault: boolean; accountType: string; createdAt: string; }
interface JimotyPost { id: number; businessId: number | null; businessName: string | null; accountId: number | null; title: string; body: string; status: string; postedAt: string | null; jimotyUrl: string | null; errorMsg: string | null; createdAt: string; }
interface BizWithAccount { id: number; name: string; jimotyAccountId: number | null; }
interface JimotyStatus { configured: boolean; accountCount: number; hasEnvCreds: boolean; scheduledTime: string; cronExpression: string; area: string; }
interface Preview { title: string; body: string; }
interface PanelState { selectedBiz: number | ""; area: string; preview: Preview | null; generating: boolean; }

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft:  { label: "下書き",   color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: <Clock className="w-3 h-3" /> },
  posted: { label: "投稿済み", color: "bg-green-500/20 text-green-400 border-green-500/30",   icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "失敗",     color: "bg-red-500/20 text-red-400 border-red-500/30",          icon: <AlertCircle className="w-3 h-3" /> },
};

function PrefectureSelect({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`bg-background border border-border text-sm rounded-none px-2 py-1 h-8 ${className}`}>
      {PREFECTURES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  );
}

// ─── AccountForm ─────────────────────────────────────────────────────────────
function AccountForm({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [accountType, setAccountType] = useState<"business" | "personal">("business");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jimoty/accounts", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, email, password, isDefault, accountType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "作成失敗");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/status"] });
      toast({ title: "✅ アカウントを追加しました" });
      onSave();
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  return (
    <div className="border border-border bg-muted/10 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">新しいアカウント</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input placeholder="ラベル（例：法人アカウント）" value={label} onChange={e => setLabel(e.target.value)} className="rounded-none text-sm h-8" />
        <Input placeholder="メールアドレス" type="email" value={email} onChange={e => setEmail(e.target.value)} className="rounded-none text-sm h-8" />
        <Input placeholder="パスワード" type="password" value={password} onChange={e => setPassword(e.target.value)} className="rounded-none text-sm h-8" />
        <div className="flex gap-4 items-center h-8">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="accountType" value="business" checked={accountType === "business"} onChange={() => setAccountType("business")} />
            法人・ビジネス
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="accountType" value="personal" checked={accountType === "personal"} onChange={() => setAccountType("personal")} />
            個人
          </label>
        </div>
      </div>
      {accountType === "business" && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
          デフォルトアカウントにする
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="rounded-none h-8 gap-1.5" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !label || !email || !password}>
          {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}追加
        </Button>
        <Button size="sm" variant="ghost" className="rounded-none h-8" onClick={onCancel}>キャンセル</Button>
      </div>
    </div>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({ post, accounts }: { post: JimotyPost; accounts: JimotyAccount[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/jimoty/posts/${post.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("削除失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      toast({ title: "🗑️ 削除しました" });
    },
  });

  const sc = statusConfig[post.status] ?? statusConfig.draft;
  const account = accounts.find(a => a.id === post.accountId);
  const isPersonal = account?.accountType === "personal";

  return (
    <div className="border border-border bg-card">
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`inline-flex items-center gap-1 text-[10px] border px-1.5 py-0.5 ${sc.color}`}>
                {sc.icon}{sc.label}
              </span>
              {post.businessName ? (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" />{post.businessName}</span>
              ) : (
                <span className="text-[10px] text-purple-400 flex items-center gap-1"><Users className="w-3 h-3" />個人投稿</span>
              )}
              {account && (
                <span className={`text-[10px] flex items-center gap-1 ${isPersonal ? "text-purple-400" : "text-blue-400"}`}>
                  <User className="w-3 h-3" />{account.label}
                </span>
              )}
            </div>
            <p className="text-sm font-medium truncate">{post.title}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground"
              onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            {post.jimotyUrl && (
              <a href={post.jimotyUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none"><ExternalLink className="w-3.5 h-3.5" /></Button>
              </a>
            )}
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-red-400"
              onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="border-t border-border pt-2 space-y-1">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{post.body}</p>
            {post.errorMsg && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1">⚠ {post.errorMsg}</p>
            )}
          </div>
        )}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>作成: {new Date(post.createdAt).toLocaleString("ja-JP")}</span>
          {post.postedAt && <span>投稿: {new Date(post.postedAt).toLocaleString("ja-JP")}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── PostingPanel ─────────────────────────────────────────────────────────────
function PostingPanel({
  account, businesses, defaultArea, onClose,
}: {
  account: JimotyAccount;
  businesses: BizWithAccount[];
  defaultArea: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPersonal = account.accountType === "personal";

  const [state, setState] = useState<PanelState>({
    selectedBiz: "",
    area: defaultArea,
    preview: null,
    generating: false,
  });
  const [posting, setPosting] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const setPreview = (p: Preview | null) => {
    setState(s => ({ ...s, preview: p }));
    if (p) { setEditTitle(p.title); setEditBody(p.body); }
  };

  const generatePreview = async () => {
    setState(s => ({ ...s, generating: true, preview: null }));
    try {
      const url = isPersonal ? "/api/jimoty/preview-personal" : `/api/jimoty/preview/${state.selectedBiz}`;
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失敗");
      setPreview({ title: data.title, body: data.body });
    } catch (err: unknown) {
      toast({ title: "❌ " + (err instanceof Error ? err.message : "生成失敗"), variant: "destructive" });
    } finally {
      setState(s => ({ ...s, generating: false }));
    }
  };

  const postNow = async () => {
    setPosting(true);
    try {
      const url = isPersonal
        ? `/api/jimoty/personal-post/${account.id}`
        : `/api/jimoty/generate-and-post/${state.selectedBiz}`;
      const body: Record<string, unknown> = { area: state.area };
      if (!isPersonal) body.accountId = account.id;
      if (state.preview) { body.title = editTitle; body.body = editBody; }
      const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "失敗");
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] });
      toast({ title: data.url ? `✅ 投稿完了 (${data.accountLabel ?? ""})` : "✅ " + data.message });
      onClose();
    } catch (err: unknown) {
      toast({ title: "❌ " + (err instanceof Error ? err.message : "失敗"), variant: "destructive" });
    } finally {
      setPosting(false);
    }
  };

  const canGenerate = isPersonal || (state.selectedBiz !== "");
  const hasPreview = !!state.preview;

  return (
    <div className={`border-t p-3 space-y-3 ${isPersonal ? "border-purple-500/20 bg-purple-500/5" : "border-border bg-muted/10"}`}>
      {/* Row 1: Business select (business only) + Area */}
      <div className="flex flex-wrap gap-2 items-center">
        {!isPersonal && (
          <select value={state.selectedBiz} onChange={e => setState(s => ({ ...s, selectedBiz: e.target.value as any, preview: null }))}
            className="flex-1 min-w-[140px] bg-background border border-border text-sm rounded-none px-2 py-1 h-8">
            <option value="">-- ビジネスを選択 --</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <PrefectureSelect value={state.area} onChange={v => setState(s => ({ ...s, area: v }))} className="min-w-[110px]" />
        </div>
        <Button size="sm" variant="outline" className="rounded-none h-8 gap-1.5 shrink-0"
          disabled={!canGenerate || state.generating}
          onClick={generatePreview}>
          {state.generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {hasPreview ? "再生成" : "AI文章生成"}
        </Button>
      </div>

      {/* Row 2: Preview */}
      {hasPreview && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">生成された文章（編集可能）</p>
          <Input value={editTitle} onChange={e => setEditTitle(e.target.value)}
            className="rounded-none text-sm h-8 font-medium" placeholder="タイトル" />
          <textarea value={editBody} onChange={e => setEditBody(e.target.value)}
            rows={5}
            className="w-full bg-background border border-border rounded-none px-2 py-1.5 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-border"
            placeholder="本文" />
          <div className="flex gap-2">
            <Button size="sm" className={`rounded-none h-8 gap-1.5 ${isPersonal ? "bg-purple-600 hover:bg-purple-700" : ""}`}
              disabled={posting || !editTitle || !editBody}
              onClick={postNow}>
              {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              この内容で投稿する
            </Button>
            <Button size="sm" variant="ghost" className="rounded-none h-8" onClick={onClose}>キャンセル</Button>
          </div>
        </div>
      )}

      {/* Quick post without preview */}
      {!hasPreview && (
        <div className="flex gap-2">
          <Button size="sm" className={`rounded-none h-8 gap-1.5 ${isPersonal ? "bg-purple-600 hover:bg-purple-700" : ""}`}
            disabled={posting || !canGenerate}
            onClick={postNow}>
            {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            AI生成して即投稿
          </Button>
          <Button size="sm" variant="ghost" className="rounded-none h-8" onClick={onClose}>キャンセル</Button>
        </div>
      )}
    </div>
  );
}

// ─── SettingsTab ──────────────────────────────────────────────────────────────
function SettingsTab({ status }: { status: JimotyStatus | undefined }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [area, setArea] = useState(status?.area ?? "osaka-fu");
  const [cronPreset, setCronPreset] = useState(() => {
    const found = CRON_PRESETS.find(p => p.value !== "custom" && p.value === status?.cronExpression);
    return found ? found.value : "custom";
  });
  const [cronCustom, setCronCustom] = useState(status?.cronExpression ?? "0 2 * * *");

  const effectiveCron = cronPreset === "custom" ? cronCustom : cronPreset;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jimoty/settings", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, cronExpression: effectiveCron }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存失敗");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/status"] });
      toast({ title: "✅ 設定を保存しました" });
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="border border-border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <p className="text-sm font-medium">デフォルト投稿エリア（都道府県）</p>
        </div>
        <div className="flex items-center gap-3">
          <PrefectureSelect value={area} onChange={setArea} className="flex-1 max-w-[220px]" />
          <p className="text-xs text-muted-foreground">各投稿パネルで個別に上書き可能</p>
        </div>
      </div>

      <div className="border border-border p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          <p className="text-sm font-medium">自動投稿スケジュール（CRON）</p>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map(p => (
              <button key={p.value} onClick={() => setCronPreset(p.value)}
                className={`text-xs px-3 py-1 border transition-colors ${cronPreset === p.value ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {p.label}
              </button>
            ))}
          </div>
          {cronPreset === "custom" && (
            <div className="space-y-1">
              <Input value={cronCustom} onChange={e => setCronCustom(e.target.value)}
                placeholder="例: 0 2 * * * (UTC)" className="rounded-none text-sm h-8 font-mono max-w-[240px]" />
              <p className="text-[10px] text-muted-foreground">※ UTC時間で入力（JSTは-9時間）</p>
            </div>
          )}
          {cronPreset !== "custom" && (
            <p className="text-xs text-muted-foreground font-mono">{effectiveCron} (UTC)</p>
          )}
        </div>
        <div className="text-xs text-muted-foreground border border-border/50 bg-muted/10 p-2">
          現在の設定: <span className="font-mono">{status?.cronExpression ?? "—"}</span>
        </div>
      </div>

      <Button size="sm" className="rounded-none gap-2" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
        設定を保存
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function JimotyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "accounts" | "assign" | "settings">("posts");
  const [openPostPanel, setOpenPostPanel] = useState<number | null>(null);

  const { data: accounts = [] } = useQuery<JimotyAccount[]>({
    queryKey: ["/api/jimoty/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery<JimotyPost[]>({
    queryKey: ["/api/jimoty/posts"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/posts", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: status } = useQuery<JimotyStatus>({
    queryKey: ["/api/jimoty/status"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/status", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const { data: businesses = [] } = useQuery<BizWithAccount[]>({
    queryKey: ["/api/jimoty/businesses"],
    queryFn: async () => {
      const res = await fetch("/api/jimoty/businesses", { credentials: "include" });
      if (!res.ok) throw new Error("取得失敗");
      return res.json();
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("削除失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/businesses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/status"] });
      toast({ title: "🗑️ アカウントを削除しました" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      toast({ title: "✅ デフォルトアカウントを変更しました" });
    },
  });

  const setTypeMutation = useMutation({
    mutationFn: async ({ id, accountType }: { id: number; accountType: string }) => {
      const res = await fetch(`/api/jimoty/accounts/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountType }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/accounts"] });
      toast({ title: "✅ アカウント種別を変更しました" });
    },
  });

  const assignAccountMutation = useMutation({
    mutationFn: async ({ bizId, accountId }: { bizId: number; accountId: number | null }) => {
      const res = await fetch(`/api/jimoty/businesses/${bizId}/account`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!res.ok) throw new Error("更新失敗");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jimoty/businesses"] });
      toast({ title: "✅ アカウントを割り当てました" });
    },
  });

  const runDailyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/jimoty/run-daily", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "実行失敗");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "✅ " + (data.message ?? "日次投稿を開始しました") });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/jimoty/posts"] }), 3000);
    },
    onError: (err: Error) => toast({ title: "❌ " + err.message, variant: "destructive" }),
  });

  const postedCount = posts.filter(p => p.status === "posted").length;
  const failedCount = posts.filter(p => p.status === "failed").length;
  const businessAccounts = accounts.filter(a => a.accountType === "business");

  const tabs = [
    { id: "posts",    label: "投稿履歴" },
    { id: "accounts", label: `アカウント (${accounts.length})` },
    { id: "assign",   label: "割り当て" },
    { id: "settings", label: "設定" },
  ] as const;

  const defaultArea = status?.area ?? "osaka-fu";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          <h1 className="text-xl font-bold tracking-tight">ジモティー自動投稿</h1>
        </div>
        <Button size="sm" className="rounded-none gap-2"
          onClick={() => runDailyMutation.mutate()}
          disabled={runDailyMutation.isPending || !status?.configured}>
          {runDailyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
          全ビジネス一括投稿
        </Button>
      </div>

      {/* Status banner */}
      <div className={`border p-3 text-sm flex items-start gap-2 ${status?.configured ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-yellow-500/30 bg-yellow-500/10 text-yellow-400"}`}>
        {status?.configured ? (
          <>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{accounts.length}件のアカウント設定済み</p>
              <p className="text-xs mt-0.5">
                CRON: <span className="font-mono">{status.cronExpression}</span>
                {" "}· エリア: {PREFECTURES.find(p => p.value === status.area)?.label ?? status.area}
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="font-medium">アカウントタブからジモティーのアカウントを追加してください</p>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">総投稿数</p>
          <p className="text-2xl font-bold mt-1">{posts.length}</p>
        </div>
        <div className="border border-green-500/30 bg-green-500/5 p-3">
          <p className="text-[10px] text-green-400 uppercase tracking-wider">投稿済み</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{postedCount}</p>
        </div>
        <div className="border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-[10px] text-red-400 uppercase tracking-wider">失敗</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{failedCount}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm border-b-2 transition-colors ${activeTab === tab.id ? "border-foreground text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Accounts tab ── */}
      {activeTab === "accounts" && (
        <div className="space-y-2">
          {accounts.map(account => {
            const isPersonal = account.accountType === "personal";
            const isOpen = openPostPanel === account.id;
            return (
              <div key={account.id} className={`border ${isPersonal ? "border-purple-500/30" : "border-border"}`}>
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{account.label}</span>
                      {isPersonal ? (
                        <span className="text-[10px] border border-purple-500/40 bg-purple-500/10 text-purple-400 px-1.5 py-0.5 flex items-center gap-1">
                          <Users className="w-2.5 h-2.5" />個人・人脈
                        </span>
                      ) : account.isDefault ? (
                        <span className="text-[10px] border border-yellow-500/40 bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 flex items-center gap-1">
                          <Star className="w-2.5 h-2.5" />デフォルト
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{isPersonal ? "個人名・メールアドレス非公開" : account.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant={isOpen ? "secondary" : "ghost"} className="rounded-none h-7 text-xs gap-1 px-2"
                      onClick={() => setOpenPostPanel(isOpen ? null : account.id)}>
                      <MapPin className="w-3 h-3" />今すぐ投稿
                    </Button>
                    {!isPersonal && !account.isDefault && (
                      <Button size="sm" variant="ghost" className="rounded-none h-7 text-xs gap-1 px-2"
                        onClick={() => setDefaultMutation.mutate(account.id)} disabled={setDefaultMutation.isPending}>
                        <Star className="w-3 h-3" />デフォルト
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-none h-7 text-xs px-2 text-muted-foreground"
                      onClick={() => setTypeMutation.mutate({ id: account.id, accountType: isPersonal ? "business" : "personal" })}
                      disabled={setTypeMutation.isPending}>
                      {isPersonal ? "法人に変更" : "個人に変更"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-red-400"
                      onClick={() => deleteAccountMutation.mutate(account.id)} disabled={deleteAccountMutation.isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {isOpen && (
                  <PostingPanel
                    account={account}
                    businesses={businesses}
                    defaultArea={defaultArea}
                    onClose={() => setOpenPostPanel(null)}
                  />
                )}
              </div>
            );
          })}

          {showAddAccount ? (
            <AccountForm onSave={() => setShowAddAccount(false)} onCancel={() => setShowAddAccount(false)} />
          ) : (
            <Button variant="outline" size="sm" className="rounded-none gap-2 w-full" onClick={() => setShowAddAccount(true)}>
              <Plus className="w-4 h-4" />アカウントを追加
            </Button>
          )}
        </div>
      )}

      {/* ── Assign tab ── */}
      {activeTab === "assign" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">各ビジネスに使用するジモティーアカウントを設定してください。未設定の場合はデフォルトアカウントが使用されます。</p>
          {businesses.map(biz => (
            <div key={biz.id} className="border border-border p-3 flex items-center justify-between gap-3">
              <span className="text-sm truncate flex-1">{biz.name}</span>
              <select className="bg-background border border-border text-sm rounded-none px-2 py-1 h-8"
                value={biz.jimotyAccountId ?? ""}
                onChange={e => assignAccountMutation.mutate({ bizId: biz.id, accountId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">デフォルト</option>
                {businessAccounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* ── Settings tab ── */}
      {activeTab === "settings" && <SettingsTab status={status} />}

      {/* ── Posts tab ── */}
      {activeTab === "posts" && (
        <div className="space-y-2">
          {postsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />読み込み中...
            </div>
          ) : posts.length === 0 ? (
            <div className="border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
              まだ投稿履歴がありません
            </div>
          ) : (
            posts.map(post => <PostCard key={post.id} post={post} accounts={accounts} />)
          )}
        </div>
      )}
    </div>
  );
}
