import { useState } from "react";
import { 
  useListTemplates, 
  useCreateTemplate, 
  useUpdateTemplate, 
  useDeleteTemplate, 
  getListTemplatesQueryKey 
} from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { FileText, Plus, Building2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";

const templateSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  subjectTemplate: z.string().min(1, "件名テンプレートは必須です"),
  htmlTemplate: z.string().min(1, "HTMLテンプレートは必須です"),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

export default function TemplatesPage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: templates, isLoading } = useListTemplates(
    { businessId: selectedBusinessId ?? undefined },
    {
      query: {
        enabled: !!selectedBusinessId,
        queryKey: getListTemplatesQueryKey({ businessId: selectedBusinessId ?? undefined })
      }
    }
  );

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      subjectTemplate: "",
      htmlTemplate: "",
    },
  });

  const onCreateSubmit = (data: TemplateFormValues) => {
    if (!selectedBusinessId) return;
    
    createMutation.mutate(
      { data: { ...data, businessId: selectedBusinessId } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          setIsCreateOpen(false);
          setSelectedTemplateId(res.id);
          toast({ title: "テンプレートを作成しました" });
          form.reset();
        },
        onError: () => toast({ title: "テンプレートの作成に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleUpdate = (id: number, data: Partial<TemplateFormValues>) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          toast({ title: "テンプレートを保存しました" });
        },
        onError: () => toast({ title: "保存に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTemplatesQueryKey() });
          if (selectedTemplateId === id) setSelectedTemplateId(null);
          toast({ title: "テンプレートを削除しました" });
        },
        onError: () => toast({ title: "削除に失敗しました", variant: "destructive" })
      }
    );
  };

  if (!selectedBusinessId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="text-center space-y-4 max-w-md border border-dashed border-border p-12">
          <Building2 className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-lg font-bold">ビジネスを選択してください</h2>
          <p className="text-muted-foreground text-sm">メールテンプレートを管理するには、ビジネスを選択してください。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-card">
        <div>
          <h1 className="font-bold tracking-tight text-sm uppercase font-mono">メールテンプレート</h1>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-none h-8 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">
              <Plus className="w-3 h-3 mr-2" /> 新規テンプレート
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="font-bold">テンプレートを作成</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">テンプレート名</FormLabel>
                      <FormControl>
                        <Input placeholder="例: 初回アプローチv1" className="rounded-none border-border" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subjectTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">件名テンプレート</FormLabel>
                      <FormControl>
                        <Input placeholder="{{companyName}}様へ特別なご提案" className="rounded-none border-border" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="htmlTemplate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">HTML本文</FormLabel>
                      <FormControl>
                        <Textarea placeholder="<p>こんにちは...</p>" className="rounded-none border-border font-mono text-xs h-32" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-none text-xs uppercase tracking-widest">キャンセル</Button>
                  <Button type="submit" disabled={createMutation.isPending} className="rounded-none text-xs uppercase tracking-widest">作成する</Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左カラム: テンプレート一覧 */}
        <div className="w-1/3 min-w-[300px] border-r border-border bg-card flex flex-col">
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1,2].map(i => <div key={i} className="h-16 animate-pulse bg-muted/40 border border-border"></div>)}
              </div>
            ) : templates?.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">テンプレートがありません</div>
            ) : (
              <div className="divide-y divide-border border-b border-border">
                {templates?.map(template => (
                  <div 
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`p-4 cursor-pointer transition-colors group relative ${selectedTemplateId === template.id ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50 border-l-2 border-l-transparent'}`}
                  >
                    <div className="pr-8">
                      <h4 className="font-bold text-sm truncate group-hover:text-foreground">{template.name}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-1">{template.subjectTemplate}</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* 右カラム: エディタ */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedTemplateId && selectedTemplate ? (
            <div className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold tracking-tight">テンプレートを編集</h2>
                <Button 
                  onClick={() => handleUpdate(selectedTemplate.id, {
                    name: selectedTemplate.name,
                    subjectTemplate: selectedTemplate.subjectTemplate,
                    htmlTemplate: selectedTemplate.htmlTemplate
                  })}
                  disabled={updateMutation.isPending}
                  className="rounded-none text-xs uppercase tracking-widest h-8"
                >
                  {updateMutation.isPending ? "保存中..." : "変更を保存"}
                </Button>
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">テンプレート名</Label>
                <Input 
                  value={selectedTemplate.name}
                  onChange={e => {
                    const newTemplates = [...(templates || [])];
                    const idx = newTemplates.findIndex(t => t.id === selectedTemplate.id);
                    if (idx !== -1) {
                      newTemplates[idx] = { ...newTemplates[idx], name: e.target.value };
                      queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), newTemplates);
                    }
                  }}
                  className="rounded-none border-border font-bold text-lg h-12"
                />
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">件名テンプレート</Label>
                <Input 
                  value={selectedTemplate.subjectTemplate}
                  onChange={e => {
                    const newTemplates = [...(templates || [])];
                    const idx = newTemplates.findIndex(t => t.id === selectedTemplate.id);
                    if (idx !== -1) {
                      newTemplates[idx] = { ...newTemplates[idx], subjectTemplate: e.target.value };
                      queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), newTemplates);
                    }
                  }}
                  className="rounded-none border-border"
                />
              </div>

              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">HTML本文</Label>
                <div className="flex-1 flex border border-border">
                  <Textarea 
                    value={selectedTemplate.htmlTemplate}
                    onChange={e => {
                      const newTemplates = [...(templates || [])];
                      const idx = newTemplates.findIndex(t => t.id === selectedTemplate.id);
                      if (idx !== -1) {
                        newTemplates[idx] = { ...newTemplates[idx], htmlTemplate: e.target.value };
                        queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), newTemplates);
                      }
                    }}
                    className="flex-1 resize-none rounded-none border-0 font-mono text-xs p-4 shadow-none focus-visible:ring-0 leading-relaxed bg-muted/10"
                  />
                  <div className="w-1/2 border-l border-border bg-card p-4 overflow-y-auto prose prose-sm dark:prose-invert max-w-none text-sm">
                    <div dangerouslySetInnerHTML={{ __html: selectedTemplate.htmlTemplate || '<div class="text-muted-foreground text-xs font-mono">プレビュー</div>' }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground p-8 text-center font-mono text-xs uppercase tracking-widest">
              <div className="space-y-4">
                <FileText className="w-8 h-8 mx-auto opacity-20" />
                <p>テンプレートを選択して編集</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
