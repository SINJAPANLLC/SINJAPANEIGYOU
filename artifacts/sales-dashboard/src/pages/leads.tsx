import { useState, useEffect } from "react";
import { 
  useListLeads, 
  useSearchLeads,
  useGenerateAiEmail,
  getListLeadsQueryKey 
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Search, Sparkles, Building2, Globe, Mail, Phone, MapPin, Send, Filter } from "lucide-react";
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchLocation, setSearchLocation] = useState("");
  const [searchLimit, setSearchLimit] = useState([10]);

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

  const selectedLead = leads?.find(l => l.id === selectedLeadId);

  useEffect(() => {
    if (selectedLead && (!emailSubject || !emailBody)) {
      setEmailSubject(`提案: ${selectedLead.companyName}様へ`);
      setEmailBody(`<p>${selectedLead.companyName}様</p>\n<p>はじめまして。</p>`);
    }
  }, [selectedLeadId, selectedLead]);

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

  const handleGenerateAi = () => {
    if (!selectedLeadId) return;
    
    setIsGenerating(true);
    generateEmailMutation.mutate(
      { data: { leadId: selectedLeadId } },
      {
        onSuccess: (res) => {
          setEmailSubject(res.subject);
          setEmailBody(res.html);
          setIsGenerating(false);
          toast({ title: "AIメールを生成しました" });
        },
        onError: () => {
          setIsGenerating(false);
          toast({ title: "AI生成に失敗しました", variant: "destructive" });
        }
      }
    );
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
          
          <Button size="sm" className="rounded-none h-8 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90" data-testid="btn-bulk-send">
            <Send className="w-3 h-3 mr-2" /> 一括送信
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左カラム: リード一覧 */}
        <div className="w-1/4 min-w-[300px] border-r border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border bg-muted/20">
            <Input placeholder="リードを絞り込む..." className="h-8 rounded-none border-border text-xs" />
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
                    className={`p-3 cursor-pointer transition-colors group ${selectedLeadId === lead.id ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50 border-l-2 border-l-transparent'}`}
                    data-testid={`lead-item-${lead.id}`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-bold text-sm truncate pr-2 group-hover:text-foreground">{lead.companyName || '社名不明'}</h4>
                      <span className={`text-[10px] px-1.5 py-0.5 border font-mono uppercase tracking-wider whitespace-nowrap shrink-0 ${STATUS_COLORS[lead.status]}`}>
                        {STATUS_LABELS[lead.status]}
                      </span>
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
                <div className="text-xs font-mono font-bold tracking-widest uppercase">作成中</div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleGenerateAi}
                  disabled={isGenerating}
                  className="h-7 rounded-none text-[10px] uppercase tracking-widest border-primary/20 text-primary hover:bg-primary/5"
                  data-testid="btn-ai-generate"
                >
                  <Sparkles className="w-3 h-3 mr-2" />
                  {isGenerating ? "生成中..." : "AIで生成"}
                </Button>
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
              リードを選択してメールを作成
            </div>
          )}
        </div>

        {/* 右カラム: 情報・プレビュー */}
        <div className="flex-1 min-w-[300px] bg-card flex flex-col overflow-hidden">
          {selectedLeadId && selectedLead ? (
            <>
              <div className="h-12 border-b border-border flex items-center px-4 shrink-0 bg-muted/10">
                <div className="text-xs font-mono font-bold tracking-widest uppercase">ターゲット情報・プレビュー</div>
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
                    <div className="border border-border bg-background min-h-[300px] p-6">
                      {emailBody ? (
                        <div 
                          dangerouslySetInnerHTML={{ __html: emailBody }}
                          className="prose prose-sm dark:prose-invert max-w-none text-sm"
                        />
                      ) : (
                        <div className="text-center text-muted-foreground text-xs font-mono py-12">本文未入力</div>
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
