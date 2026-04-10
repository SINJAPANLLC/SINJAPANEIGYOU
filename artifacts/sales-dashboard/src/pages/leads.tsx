import { useState, useEffect } from "react";
import { 
  useListLeads, 
  useSearchLeads,
  useGenerateAiEmail,
  useListTemplates,
  getListLeadsQueryKey 
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Sparkles, Building2, Globe, Mail, Phone, MapPin, Send, Filter, FileText, ChevronDown, CheckSquare, Square, Minus, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_LABELS: Record<string, string> = {
  unsent: "未送信",
  sent: "送信済",
  replied: "返信あり",
  ng: "NG",
  unsubscribed: "配信停止"
};

const STATUS_COLORS: Record<string, string> = {
  unsent: "bg-muted text-muted-foreground border-border",
  sent: "bg-primary/10 text-primary border-primary/20",
  replied: "bg-green-500/10 text-green-500 border-green-500/20",
  ng: "bg-destructive/10 text-destructive border-destructive/20",
  unsubscribed: "bg-muted/50 text-muted-foreground border-border"
};

export default function LeadsPage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();
  
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [checkedLeadIds, setCheckedLeadIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchLimit, setSearchLimit] = useState([10]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [isBulkSending, setIsBulkSending] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({ companyName: "", email: "", websiteUrl: "", phone: "", address: "" });

  const { data: leads, isLoading: leadsLoading } = useListLeads(
    { businessId: selectedBusinessId ?? undefined, status: statusFilter !== "all" ? statusFilter : undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
        queryKey: getListLeadsQueryKey({ businessId: selectedBusinessId ?? undefined, status: statusFilter !== "all" ? statusFilter : undefined })
      }
    }
  );

  const searchMutation = useSearchLeads();
  const generateEmailMutation = useGenerateAiEmail();

  const { data: templates } = useListTemplates(
    { businessId: selectedBusinessId ?? undefined },
    { query: { enabled: !!selectedBusinessId } }
  );
  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const selectedLead = leads?.find(l => l.id === selectedLeadId);

  useEffect(() => {
    setSelectedTemplateId(null);
    setEmailSubject(selectedLead ? `提案: ${selectedLead.companyName}様へ` : "");
    setEmailBody(selectedLead ? `<p>${selectedLead.companyName}様</p>\n<p>はじめまして。</p>` : "");
  }, [selectedLeadId]);

  useEffect(() => {
    setCheckedLeadIds(new Set());
    setSelectedLeadId(null);
  }, [selectedBusinessId]);

  const handleSearch = () => {
    if (!selectedBusinessId || !searchKeyword) return;
    
    searchMutation.mutate(
      {
        data: {
          businessId: selectedBusinessId,
          keyword: searchKeyword,
          location: searchLocation || undefined,
          maxResults: searchLimit[0]
        }
      },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          setIsSearchOpen(false);
          toast({ title: `${res.saved}件の新規リストを収集しました（発見: ${res.found}件）` });
        },
        onError: () => toast({ title: "リスト収集に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleGenerateAi = async () => {
    if (!selectedLeadId || !selectedBusinessId) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/email/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadId: selectedLeadId, businessId: selectedBusinessId }),
      });
      if (!res.ok) throw new Error("AI generation failed");
      const data = await res.json();
      setEmailSubject(data.subject);
      setEmailBody(data.html);
      toast({ title: "AIメールを生成しました" });
    } catch {
      toast({ title: "AI生成に失敗しました", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCheck = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!leads) return;
    if (checkedLeadIds.size === leads.length) {
      setCheckedLeadIds(new Set());
    } else {
      setCheckedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  const handleAddLead = async () => {
    if (!selectedBusinessId || !addForm.companyName.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessId: selectedBusinessId,
          companyName: addForm.companyName.trim(),
          email: addForm.email.trim() || null,
          websiteUrl: addForm.websiteUrl.trim() || null,
          phone: addForm.phone.trim() || null,
          address: addForm.address.trim() || null,
          status: "unsent",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "リードを追加しました" });
      setAddForm({ companyName: "", email: "", websiteUrl: "", phone: "", address: "" });
      setIsAddOpen(false);
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey({ businessId: selectedBusinessId ?? undefined }) });
    } catch {
      toast({ title: "追加に失敗しました", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  const handleApplyTemplate = (templateId: number) => {
    const tmpl = templates?.find(t => t.id === templateId);
    if (!tmpl || !selectedLead) return;
    const company = selectedLead.companyName ?? "御社";
    setEmailSubject(tmpl.subjectTemplate.replace(/{{company_name}}/g, company));
    setEmailBody(tmpl.htmlTemplate.replace(/{{company_name}}/g, company));
    setSelectedTemplateId(templateId);
    toast({ title: `「${tmpl.name}」を適用しました` });
  };

  const handleDeleteLead = async (leadId: number) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "リードを削除しました" });
      if (selectedLeadId === leadId) setSelectedLeadId(null);
      setCheckedLeadIds(prev => { const n = new Set(prev); n.delete(leadId); return n; });
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey({ businessId: selectedBusinessId ?? undefined }) });
    } catch {
      toast({ title: "削除に失敗しました", variant: "destructive" });
    }
  };

  const handleBulkDelete = async () => {
    if (checkedLeadIds.size === 0) return;
    try {
      await Promise.all(Array.from(checkedLeadIds).map(id =>
        fetch(`/api/leads/${id}`, { method: "DELETE", credentials: "include" })
      ));
      toast({ title: `${checkedLeadIds.size}件のリードを削除しました` });
      setCheckedLeadIds(new Set());
      if (checkedLeadIds.has(selectedLeadId ?? -1)) setSelectedLeadId(null);
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey({ businessId: selectedBusinessId ?? undefined }) });
    } catch {
      toast({ title: "削除に失敗しました", variant: "destructive" });
    }
  };

  const handleBulkSend = async () => {
    if (checkedLeadIds.size === 0) return;
    if (!emailSubject || !emailBody) {
      toast({ title: "件名と本文を入力してください", variant: "destructive" });
      return;
    }
    setIsBulkSending(true);
    try {
      const useSubject = selectedTemplate ? selectedTemplate.subjectTemplate : emailSubject;
      const useHtml = selectedTemplate ? selectedTemplate.htmlTemplate : emailBody;
      const res = await fetch("/api/leads/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ leadIds: Array.from(checkedLeadIds), subject: useSubject, html: useHtml }),
      });
      if (!res.ok) throw new Error("Send failed");
      const data = await res.json() as { sent: number; failed: number; skipped: number };
      toast({ title: `送信完了: ${data.sent}件成功 / ${data.failed}件失敗 / ${data.skipped}件スキップ（メールなし）` });
      setCheckedLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey({ businessId: selectedBusinessId ?? undefined }) });
    } catch {
      toast({ title: "一括送信に失敗しました", variant: "destructive" });
    } finally {
      setIsBulkSending(false);
    }
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-md border border-dashed border-border p-12">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-bold">ビジネスを選択してください</h2>
          <p className="text-muted-foreground text-sm">リストを管理するには、ビジネスワークスペースを選択してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div className="flex items-center gap-4">
          <h1 className="font-bold tracking-tight text-sm uppercase font-mono">リスト</h1>
          
          <div className="h-4 w-px bg-border mx-2"></div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-none h-8 text-xs border-border" data-testid="filter-status">
                <Filter className="w-3 h-3 mr-2" />
                {statusFilter === "all" ? "すべて" : STATUS_LABELS[statusFilter]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="rounded-none border-border">
              <DropdownMenuItem onClick={() => setStatusFilter("all")} className="text-xs rounded-none cursor-pointer">すべて</DropdownMenuItem>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <DropdownMenuItem key={key} onClick={() => setStatusFilter(key)} className="text-xs rounded-none cursor-pointer">{label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          {/* 手動追加ダイアログ */}
          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setAddForm({ companyName: "", email: "", websiteUrl: "", phone: "", address: "" }); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border">
                <Plus className="w-3 h-3 mr-2" /> 手動追加
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle className="font-bold tracking-tight">リードを手動追加</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">会社名 *</Label>
                  <Input
                    placeholder="例: 株式会社〇〇"
                    value={addForm.companyName}
                    onChange={e => setAddForm(f => ({ ...f, companyName: e.target.value }))}
                    className="rounded-none border-border h-9"
                    onKeyDown={e => { if (e.key === "Enter" && addForm.companyName.trim()) handleAddLead(); }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">メールアドレス</Label>
                  <Input
                    type="email"
                    placeholder="例: info@example.co.jp"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    className="rounded-none border-border h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">ウェブサイトURL</Label>
                  <Input
                    placeholder="例: https://example.co.jp"
                    value={addForm.websiteUrl}
                    onChange={e => setAddForm(f => ({ ...f, websiteUrl: e.target.value }))}
                    className="rounded-none border-border h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">電話番号</Label>
                    <Input
                      placeholder="例: 03-0000-0000"
                      value={addForm.phone}
                      onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                      className="rounded-none border-border h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">住所</Label>
                    <Input
                      placeholder="例: 東京都渋谷区"
                      value={addForm.address}
                      onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                      className="rounded-none border-border h-9"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)} className="rounded-none text-xs uppercase tracking-widest h-9">キャンセル</Button>
                <Button
                  onClick={handleAddLead}
                  disabled={!addForm.companyName.trim() || isAdding}
                  className="rounded-none text-xs uppercase tracking-widest h-9"
                >
                  {isAdding ? "追加中..." : "追加"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border" data-testid="btn-collect-leads">
                <Search className="w-3 h-3 mr-2" /> リスト収集
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="font-bold tracking-tight">新規リードを収集</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">キーワード *</Label>
                  <Input 
                    placeholder="例: 軽貨物 東京" 
                    value={searchKeyword} 
                    onChange={e => setSearchKeyword(e.target.value)}
                    className="rounded-none border-border h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">地域 (任意)</Label>
                  <Input 
                    placeholder="例: 東京都渋谷区" 
                    value={searchLocation} 
                    onChange={e => setSearchLocation(e.target.value)}
                    className="rounded-none border-border h-10"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">最大件数</Label>
                    <span className="font-mono text-sm font-bold">{searchLimit[0]}件</span>
                  </div>
                  <Slider 
                    min={1} max={50} step={1} 
                    value={searchLimit} 
                    onValueChange={setSearchLimit}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSearchOpen(false)} className="rounded-none text-xs uppercase tracking-widest h-10">キャンセル</Button>
                <Button 
                  onClick={handleSearch} 
                  disabled={!searchKeyword || searchMutation.isPending}
                  className="rounded-none text-xs uppercase tracking-widest h-10"
                >
                  {searchMutation.isPending ? "収集中..." : "収集開始"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {checkedLeadIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none h-8 text-xs uppercase tracking-widest border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3 h-3 mr-2" />
                  {checkedLeadIds.size}件を削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-none border-border">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-bold">リードを削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground text-sm">
                    選択した {checkedLeadIds.size} 件のリードを削除します。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkDelete} className="rounded-none text-xs uppercase tracking-widest bg-destructive text-white hover:bg-destructive/90">削除する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            size="sm"
            className="rounded-none h-8 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"
            disabled={checkedLeadIds.size === 0 || isBulkSending}
            onClick={handleBulkSend}
            data-testid="btn-bulk-send"
          >
            <Send className="w-3 h-3 mr-2" />
            {isBulkSending ? "送信中..." : checkedLeadIds.size > 0 ? `${checkedLeadIds.size}件を一括送信` : "一括送信"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左カラム: リード一覧 */}
        <div className="w-1/4 min-w-[300px] border-r border-border bg-card flex flex-col">
          <div className="border-b border-border bg-muted/20">
            <div className="p-3 pb-2">
              <Input placeholder="リードを絞り込む..." className="h-8 rounded-none border-border text-xs" />
            </div>
            {/* 全選択バー */}
            {leads && leads.length > 0 && (
              <div
                className="px-3 pb-2 flex items-center gap-2 cursor-pointer select-none"
                onClick={toggleAll}
              >
                <div className="flex items-center justify-center w-4 h-4 shrink-0">
                  {checkedLeadIds.size === 0 ? (
                    <Square className="w-4 h-4 text-muted-foreground" />
                  ) : checkedLeadIds.size === leads.length ? (
                    <CheckSquare className="w-4 h-4 text-foreground" />
                  ) : (
                    <Minus className="w-4 h-4 text-foreground" />
                  )}
                </div>
                <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                  {checkedLeadIds.size > 0 ? `${checkedLeadIds.size}件選択中` : "全て選択"}
                </span>
              </div>
            )}
          </div>
          <ScrollArea className="flex-1">
            {leadsLoading ? (
              <div className="p-4 space-y-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-16 animate-pulse bg-muted/40 border border-border"></div>
                ))}
              </div>
            ) : leads?.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">リードが見つかりません</div>
            ) : (
              <div className="divide-y divide-border border-b border-border">
                {leads?.map(lead => (
                  <div 
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`p-3 cursor-pointer transition-colors group flex items-start gap-2.5 ${selectedLeadId === lead.id ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50 border-l-2 border-l-transparent'} ${checkedLeadIds.has(lead.id) ? 'bg-primary/5' : ''}`}
                    data-testid={`lead-item-${lead.id}`}
                  >
                    {/* チェックボックス */}
                    <div
                      className="mt-0.5 shrink-0"
                      onClick={(e) => toggleCheck(lead.id, e)}
                    >
                      <Checkbox
                        checked={checkedLeadIds.has(lead.id)}
                        className="rounded-none border-border data-[state=checked]:bg-foreground data-[state=checked]:border-foreground"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h4 className="font-bold text-sm truncate pr-2 group-hover:text-foreground">{lead.companyName || '社名不明'}</h4>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 border font-mono uppercase tracking-wider whitespace-nowrap ${STATUS_COLORS[lead.status]}`}>
                            {STATUS_LABELS[lead.status]}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-destructive"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono">
                        {lead.score !== null && lead.score !== undefined && (
                          <span className="flex items-center text-primary/70">
                            <Sparkles className="w-3 h-3 mr-1" /> {lead.score}
                          </span>
                        )}
                        {lead.websiteUrl && <span className="truncate max-w-[100px]">{lead.websiteUrl.replace(/^https?:\/\//, '')}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 中央カラム: メール作成 */}
        <div className="w-2/5 min-w-[400px] border-r border-border bg-background flex flex-col relative">
          {selectedLeadId ? (
            <>
              <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-muted/10">
                <div className="text-xs font-mono font-bold tracking-widest uppercase">メール作成</div>
                <div className="flex items-center gap-2">
                  {/* テンプレート選択 */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isApplyingTemplate}
                        className="h-7 rounded-none text-[10px] uppercase tracking-widest border-border"
                      >
                        <FileText className="w-3 h-3 mr-1.5" />
                        {isApplyingTemplate ? "適用中..." : selectedTemplate ? selectedTemplate.name : "テンプレート"}
                        <ChevronDown className="w-3 h-3 ml-1.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-none border-border w-[240px] p-0">
                      <ScrollArea className="max-h-[300px]">
                        <div className="p-1">
                          {(!templates || templates.length === 0) && (
                            <DropdownMenuItem disabled className="text-xs text-muted-foreground rounded-none">
                              テンプレートがありません
                            </DropdownMenuItem>
                          )}
                          {templates?.map(t => (
                            <DropdownMenuItem
                              key={t.id}
                              onClick={() => handleApplyTemplate(t.id)}
                              className={`rounded-none cursor-pointer text-xs ${t.id === selectedTemplateId ? "font-bold bg-muted" : ""}`}
                            >
                              <FileText className="w-3 h-3 mr-2 shrink-0" />
                              <span className="truncate">{t.name}</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </ScrollArea>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleGenerateAi}
                    disabled={isGenerating}
                    className="h-7 rounded-none text-[10px] uppercase tracking-widest border-primary/20 text-primary hover:bg-primary/5"
                    data-testid="btn-ai-generate"
                  >
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    {isGenerating ? "生成中..." : "AI生成"}
                  </Button>
                </div>
              </div>
              <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
                <div className="space-y-1 shrink-0">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">件名</Label>
                  <Input 
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    className="rounded-none border-border font-bold shadow-none focus-visible:ring-1 focus-visible:ring-border"
                  />
                </div>
                <div className="space-y-1 flex-1 flex flex-col min-h-0">
                  <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">本文 (HTML)</Label>
                  <Textarea 
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    className="flex-1 resize-none rounded-none border-border font-mono text-xs p-4 shadow-none focus-visible:ring-1 focus-visible:ring-border leading-relaxed"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8 text-center font-mono text-xs uppercase tracking-widest">
              <div className="space-y-3">
                <Mail className="w-8 h-8 mx-auto opacity-20" />
                <p>リードを選択してメールを作成</p>
              </div>
            </div>
          )}
        </div>

        {/* 右カラム: 情報・プレビュー */}
        <div className="flex-1 min-w-[300px] bg-card flex flex-col overflow-hidden">
          {selectedLeadId && selectedLead ? (
            <>
              <div className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0 bg-muted/10">
                <div className="text-xs font-mono font-bold tracking-widest uppercase">ターゲット情報・プレビュー</div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-none border-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-bold">リードを削除しますか？</AlertDialogTitle>
                      <AlertDialogDescription className="text-muted-foreground text-sm">
                        「{selectedLead.companyName}」を削除します。この操作は取り消せません。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteLead(selectedLeadId!)} className="rounded-none text-xs uppercase tracking-widest bg-destructive text-white hover:bg-destructive/90">削除する</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold tracking-tight border-b border-border pb-2">{selectedLead.companyName || '不明'}</h3>
                    
                    <div className="grid grid-cols-1 gap-3 text-sm">
                      {selectedLead.websiteUrl && (
                        <div className="flex items-start gap-3">
                          <Globe className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <a href={selectedLead.websiteUrl} target="_blank" rel="noreferrer" className="hover:underline break-all">{selectedLead.websiteUrl}</a>
                        </div>
                      )}
                      {selectedLead.email && (
                        <div className="flex items-start gap-3">
                          <Mail className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="break-all">{selectedLead.email}</span>
                        </div>
                      )}
                      {selectedLead.phone && (
                        <div className="flex items-start gap-3">
                          <Phone className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span>{selectedLead.phone}</span>
                        </div>
                      )}
                      {selectedLead.address && (
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span>{selectedLead.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border pb-1">ライブプレビュー</div>
                    <div className="border border-border bg-white min-h-[500px]">
                      {emailBody ? (
                        <iframe
                          srcDoc={emailBody}
                          title="メールプレビュー"
                          className="w-full border-0 block"
                          style={{ minHeight: 500 }}
                          sandbox="allow-same-origin"
                          onLoad={(e) => {
                            const iframe = e.currentTarget;
                            const doc = iframe.contentDocument;
                            if (doc) {
                              const h = doc.documentElement.scrollHeight;
                              iframe.style.height = Math.max(500, h) + "px";
                            }
                          }}
                        />
                      ) : (
                        <div className="text-center text-muted-foreground text-xs font-mono py-24">本文未入力</div>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex-1 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay"></div>
          )}
        </div>
      </div>
    </div>
  );
}
