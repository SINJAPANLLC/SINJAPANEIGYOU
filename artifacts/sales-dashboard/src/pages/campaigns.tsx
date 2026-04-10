import { useState } from "react";
import { 
  useListCampaigns, 
  useCreateCampaign, 
  useUpdateCampaign, 
  useListTemplates,
  useSendCampaign,
  getListCampaignsQueryKey 
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Send, Play, Pause, FileText, CheckCircle2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  running: "実行中",
  completed: "完了",
  paused: "一時停止"
};

const campaignSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  templateId: z.coerce.number().min(1, "テンプレートは必須です"),
});

type CampaignFormValues = z.infer<typeof campaignSchema>;

export default function CampaignsPage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: campaigns, isLoading } = useListCampaigns(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
        queryKey: getListCampaignsQueryKey({ businessId: selectedBusinessId ?? undefined })
      }
    }
  );

  const { data: templates } = useListTemplates(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId
      }
    }
  );

  const createMutation = useCreateCampaign();
  const updateMutation = useUpdateCampaign();
  const sendMutation = useSendCampaign();

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "",
      templateId: 0,
    },
  });

  const onSubmit = (data: CampaignFormValues) => {
    if (!selectedBusinessId) return;
    
    createMutation.mutate(
      { data: { ...data, businessId: selectedBusinessId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          setIsCreateOpen(false);
          toast({ title: "キャンペーンを作成しました" });
          form.reset();
        },
        onError: () => toast({ title: "キャンペーンの作成に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleStatusChange = (id: number, status: "draft" | "running" | "completed" | "paused") => {
    updateMutation.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ title: `ステータスを「${CAMPAIGN_STATUS_LABELS[status]}」に更新しました` });
        },
        onError: () => toast({ title: "ステータスの更新に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleDeleteCampaign = async (id: number) => {
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
      toast({ title: "キャンペーンを削除しました" });
    } catch {
      toast({ title: "削除に失敗しました", variant: "destructive" });
    }
  };

  const handleSendCampaign = (id: number) => {
    sendMutation.mutate(
      { id },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListCampaignsQueryKey() });
          toast({ 
            title: "キャンペーンを送信しました", 
            description: `送信: ${res.sent}件 / 失敗: ${res.failed}件 / スキップ: ${res.skipped}件` 
          });
        },
        onError: () => toast({ title: "キャンペーン送信に失敗しました", variant: "destructive" })
      }
    );
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-md border border-dashed border-border p-12">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-bold">ビジネスを選択してください</h2>
          <p className="text-muted-foreground text-sm">キャンペーンを管理するには、ビジネスを選択してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="border-b border-border p-6 shrink-0 flex items-center justify-between bg-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">キャンペーン</h1>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">一括送信オペレーション管理</p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-none tracking-widest text-xs uppercase h-10 px-6 bg-foreground text-background hover:bg-foreground/90">
              新規キャンペーン
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="font-bold">キャンペーンを作成</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">キャンペーン名</FormLabel>
                      <FormControl>
                        <Input placeholder="例: Q3_アウトリーチ_第1弾" className="rounded-none border-border font-mono text-sm" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="templateId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">使用テンプレート</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value ? field.value.toString() : undefined}>
                        <FormControl>
                          <SelectTrigger className="rounded-none border-border">
                            <SelectValue placeholder="テンプレートを選択" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="rounded-none border-border">
                          {templates?.map(t => (
                            <SelectItem key={t.id} value={t.id.toString()} className="rounded-none cursor-pointer">{t.name}</SelectItem>
                          ))}
                          {(!templates || templates.length === 0) && (
                            <SelectItem value="0" disabled>テンプレートがありません</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-none text-xs uppercase tracking-widest">キャンセル</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="rounded-none text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">作成する</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-24 border border-border animate-pulse bg-muted/20"></div>)}
          </div>
        ) : campaigns?.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-muted-foreground font-mono text-sm">
            キャンペーンがありません
          </div>
        ) : (
          <div className="space-y-4 max-w-5xl mx-auto">
            {campaigns?.map(campaign => {
              const template = templates?.find(t => t.id === campaign.templateId);
              
              return (
                <div key={campaign.id} className="border border-border bg-card flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 hover:border-foreground/30 transition-colors">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-lg truncate font-mono">{campaign.name}</h3>
                      <span className={`text-[10px] px-2 py-0.5 border font-mono uppercase tracking-wider whitespace-nowrap
                        ${campaign.status === 'running' ? 'bg-primary/10 text-primary border-primary/20' : 
                          campaign.status === 'completed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                          'bg-muted text-muted-foreground border-border'}
                      `}>
                        {CAMPAIGN_STATUS_LABELS[campaign.status]}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-mono">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[200px]">{template?.name || `テンプレート #${campaign.templateId}`}</span>
                      </div>
                      <div>
                        作成: {format(new Date(campaign.createdAt), 'yyyy年M月d日 HH:mm', { locale: ja })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 md:border-l md:border-border md:pl-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-none text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-bold">キャンペーンを削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground text-sm">
                            「{campaign.name}」を削除します。この操作は取り消せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteCampaign(campaign.id)} className="rounded-none text-xs uppercase tracking-widest bg-destructive text-white hover:bg-destructive/90">削除する</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    {campaign.status === 'draft' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleStatusChange(campaign.id, 'running')}
                        className="rounded-none h-8 text-xs border-border uppercase tracking-widest"
                      >
                        <Play className="w-3 h-3 mr-2" /> 開始
                      </Button>
                    )}
                    {campaign.status === 'running' && (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleStatusChange(campaign.id, 'paused')}
                          className="rounded-none h-8 text-xs border-border uppercase tracking-widest"
                        >
                          <Pause className="w-3 h-3 mr-2" /> 一時停止
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleSendCampaign(campaign.id)}
                          disabled={sendMutation.isPending}
                          className="rounded-none h-8 text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          <Send className="w-3 h-3 mr-2" /> 今すぐ送信
                        </Button>
                      </>
                    )}
                    {campaign.status === 'paused' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleStatusChange(campaign.id, 'running')}
                        className="rounded-none h-8 text-xs border-border uppercase tracking-widest"
                      >
                        <Play className="w-3 h-3 mr-2" /> 再開
                      </Button>
                    )}
                    {(campaign.status === 'running' || campaign.status === 'paused') && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => handleStatusChange(campaign.id, 'completed')}
                        className="rounded-none h-8 text-xs text-muted-foreground hover:text-foreground uppercase tracking-widest"
                      >
                        <CheckCircle2 className="w-3 h-3 mr-2" /> 完了にする
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
