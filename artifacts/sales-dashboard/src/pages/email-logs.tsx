import { useState } from "react";
import { useListEmailLogs, useListLeads, getListEmailLogsQueryKey } from "@workspace/api-client-react";
import { useBusiness } from "@/contexts/BusinessContext";
import { Building2, Search, Calendar, ChevronRight, Mail } from "lucide-react";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STATUS_LABELS: Record<string, string> = {
  sent: "送信済",
  failed: "失敗",
  bounced: "バウンス",
};

const STATUS_COLORS: Record<string, string> = {
  sent: "bg-green-500/10 text-green-500 border-green-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  bounced: "bg-orange-500/10 text-orange-500 border-orange-500/20",
};

export default function EmailLogsPage() {
  const { selectedBusinessId } = useBusiness();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data: logs, isLoading: logsLoading } = useListEmailLogs(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
        queryKey: getListEmailLogsQueryKey({ businessId: selectedBusinessId ?? undefined })
      }
    }
  );

  const { data: leads } = useListLeads(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
      }
    }
  );

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-md border border-dashed border-border p-12">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-bold">ビジネスを選択してください</h2>
          <p className="text-muted-foreground text-sm">送信ログを表示するには、ビジネスを選択してください。</p>
        </div>
      </div>
    );
  }

  const enrichedLogs = logs?.map(log => {
    const lead = leads?.find(l => l.id === log.leadId);
    return {
      ...log,
      leadName: lead?.companyName || lead?.email || `リード #${log.leadId}`
    };
  }).filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return log.subject.toLowerCase().includes(term) || log.leadName.toLowerCase().includes(term);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="border-b border-border p-6 shrink-0 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">送信ログ</h1>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">送信履歴・テレメトリ</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="ログを検索..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 rounded-none border-border font-mono text-sm h-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table className="border-b border-border">
          <TableHeader className="bg-muted/10 sticky top-0 z-10 shadow-sm shadow-border/50">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-[180px] font-mono text-[10px] uppercase tracking-widest text-muted-foreground">送信日時</TableHead>
              <TableHead className="w-[100px] font-mono text-[10px] uppercase tracking-widest text-muted-foreground">ステータス</TableHead>
              <TableHead className="w-[250px] font-mono text-[10px] uppercase tracking-widest text-muted-foreground">送信先</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">件名</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-mono text-sm">データ読込中...</TableCell>
              </TableRow>
            ) : enrichedLogs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground font-mono text-sm">ログが見つかりません</TableCell>
              </TableRow>
            ) : (
              enrichedLogs?.map((log) => (
                <TableRow 
                  key={log.id} 
                  className="border-border cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setSelectedLog(log)}
                >
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="w-3 h-3 mr-2 shrink-0" />
                      {format(new Date(log.sentAt || log.createdAt), 'yyyy/MM/dd HH:mm', { locale: ja })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-[10px] px-2 py-0.5 border font-mono uppercase tracking-wider whitespace-nowrap inline-flex items-center justify-center min-w-[70px] ${STATUS_COLORS[log.status]}`}>
                      {STATUS_LABELS[log.status] || log.status}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium text-sm truncate max-w-[200px]">
                    {log.leadName}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[300px]">
                    {log.subject}
                  </TableCell>
                  <TableCell className="text-right">
                    <ChevronRight className="w-4 h-4 text-muted-foreground inline-block" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="rounded-none border-border max-w-3xl h-[80vh] flex flex-col p-0 gap-0 bg-background">
          <DialogHeader className="p-6 border-b border-border shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={`text-[10px] px-2 py-0.5 border font-mono uppercase tracking-wider ${selectedLog ? STATUS_COLORS[selectedLog.status] : ''}`}>
                {selectedLog ? (STATUS_LABELS[selectedLog.status] || selectedLog.status) : ''}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {selectedLog && format(new Date(selectedLog.sentAt || selectedLog.createdAt), 'yyyy年M月d日 HH:mm:ss', { locale: ja })}
              </span>
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight pr-8">{selectedLog?.subject}</DialogTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
              <Mail className="w-4 h-4" /> 宛先: <span className="font-medium text-foreground">{selectedLog?.leadName}</span>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 bg-card/50">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-4">メール本文</div>
            <div className="border border-border bg-background p-6 min-h-[200px]">
              {selectedLog?.html ? (
                <div 
                  dangerouslySetInnerHTML={{ __html: selectedLog.html }}
                  className="prose prose-sm dark:prose-invert max-w-none"
                />
              ) : (
                <div className="text-muted-foreground font-mono text-sm">本文データなし</div>
              )}
            </div>
            {selectedLog?.error && (
              <div className="mt-6 border border-destructive/30 bg-destructive/5 p-4 rounded-none">
                <div className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-2">エラートレース</div>
                <div className="font-mono text-xs text-destructive/80 whitespace-pre-wrap">{selectedLog.error}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
