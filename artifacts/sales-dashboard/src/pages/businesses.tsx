import { useState } from "react";
import { useListBusinesses, useCreateBusiness, useUpdateBusiness, useDeleteBusiness, getListBusinessesQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Edit2, Trash2, Building2, Globe, Mail, User } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/contexts/AuthContext";

const businessSchema = z.object({
  name: z.string().min(1, "名前は必須です"),
  companyName: z.string().optional().nullable(),
  serviceUrl: z.string().url("有効なURLを入力してください").optional().nullable().or(z.literal('')),
  senderName: z.string().optional().nullable(),
  senderEmail: z.string().email("有効なメールアドレスを入力してください").optional().nullable().or(z.literal('')),
  signatureHtml: z.string().optional().nullable(),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

export default function BusinessesPage() {
  const { toast } = useToast();
  const { isSignedIn } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBusinessId, setEditingBusinessId] = useState<number | null>(null);

  const { data: businesses, isLoading } = useListBusinesses({
    query: {
      enabled: !!isSignedIn,
      queryKey: getListBusinessesQueryKey()
    }
  });

  const createMutation = useCreateBusiness();
  const updateMutation = useUpdateBusiness();
  const deleteMutation = useDeleteBusiness();

  const form = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: "",
      companyName: "",
      serviceUrl: "",
      senderName: "",
      senderEmail: "",
      signatureHtml: "",
    },
  });

  const onSubmit = (data: BusinessFormValues) => {
    if (editingBusinessId) {
      updateMutation.mutate(
        { id: editingBusinessId, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
            setIsCreateOpen(false);
            setEditingBusinessId(null);
            toast({ title: "ビジネスを更新しました" });
          },
          onError: () => toast({ title: "更新に失敗しました", variant: "destructive" })
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
            setIsCreateOpen(false);
            toast({ title: "ビジネスを作成しました" });
          },
          onError: () => toast({ title: "作成に失敗しました", variant: "destructive" })
        }
      );
    }
  };

  const handleEdit = (business: any) => {
    form.reset({
      name: business.name,
      companyName: business.companyName || "",
      serviceUrl: business.serviceUrl || "",
      senderName: business.senderName || "",
      senderEmail: business.senderEmail || "",
      signatureHtml: business.signatureHtml || "",
    });
    setEditingBusinessId(business.id);
    setIsCreateOpen(true);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
          toast({ title: "ビジネスを削除しました" });
        },
        onError: () => toast({ title: "削除に失敗しました", variant: "destructive" })
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    setIsCreateOpen(open);
    if (!open) {
      setTimeout(() => {
        setEditingBusinessId(null);
        form.reset({
          name: "",
          companyName: "",
          serviceUrl: "",
          senderName: "",
          senderEmail: "",
          signatureHtml: "",
        });
      }, 200);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="border-b border-border p-6 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ビジネス</h1>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">ワークスペース・送信者情報の管理</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="rounded-none tracking-widest text-xs uppercase h-10 px-6">
              <Plus className="w-4 h-4 mr-2" /> 新規作成
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="font-bold tracking-tight">
                {editingBusinessId ? "ビジネスを編集" : "新規ビジネスを作成"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">ワークスペース名 *</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 営業チームA" className="rounded-none border-border" {...field} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">会社名</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 株式会社サンプル" className="rounded-none border-border" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="serviceUrl"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">サービスURL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.co.jp" type="url" className="rounded-none border-border" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="senderName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">送信者名</FormLabel>
                        <FormControl>
                          <Input placeholder="例: 山田 太郎" className="rounded-none border-border" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="senderEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">送信者メール</FormLabel>
                        <FormControl>
                          <Input placeholder="yamada@example.co.jp" type="email" className="rounded-none border-border" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="signatureHtml"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">メール署名 (HTML)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="<p>よろしくお願いします。<br/>山田 太郎</p>" 
                            className="rounded-none border-border font-mono text-xs h-32" 
                            {...field} 
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-none text-xs uppercase tracking-widest">
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-none text-xs uppercase tracking-widest">
                    {createMutation.isPending || updateMutation.isPending ? "保存中..." : "保存する"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3].map(i => (
              <div key={i} className="h-48 border border-border animate-pulse bg-muted/20"></div>
            ))}
          </div>
        ) : businesses?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-4 border border-dashed border-border p-12">
            <Building2 className="w-12 h-12 text-muted-foreground" />
            <h3 className="text-lg font-bold">ビジネスがありません</h3>
            <p className="text-sm text-muted-foreground max-w-sm">最初のビジネスワークスペースを作成して、リードとキャンペーンの管理を始めましょう。</p>
            <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="rounded-none mt-4 text-xs tracking-widest uppercase">
              ワークスペースを作成
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses?.map((business, i) => (
              <motion.div
                key={business.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="border border-border bg-card flex flex-col group hover:border-foreground/30 transition-colors"
                data-testid={`business-card-${business.id}`}
              >
                <div className="p-5 flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="font-bold text-lg leading-tight truncate pr-4">{business.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider truncate">
                        {business.companyName || '会社名未設定'}
                      </p>
                    </div>
                    <div className="w-8 h-8 shrink-0 bg-primary text-primary-foreground flex items-center justify-center font-mono text-xs font-bold">
                      {business.name.substring(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {business.serviceUrl && (
                      <div className="flex items-center gap-2 text-muted-foreground truncate">
                        <Globe className="w-4 h-4 shrink-0" />
                        <span className="truncate">{business.serviceUrl}</span>
                      </div>
                    )}
                    {business.senderEmail && (
                      <div className="flex items-center gap-2 text-muted-foreground truncate">
                        <Mail className="w-4 h-4 shrink-0" />
                        <span className="truncate">{business.senderEmail}</span>
                      </div>
                    )}
                    {business.senderName && (
                      <div className="flex items-center gap-2 text-muted-foreground truncate">
                        <User className="w-4 h-4 shrink-0" />
                        <span className="truncate">{business.senderName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border p-3 bg-muted/10 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(business)} className="rounded-none text-xs" data-testid={`btn-edit-${business.id}`}>
                    <Edit2 className="w-4 h-4 mr-2" /> 編集
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-none text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" data-testid={`btn-delete-${business.id}`}>
                        <Trash2 className="w-4 h-4 mr-2" /> 削除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-bold">本当に削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription>
                          ビジネス「{business.name}」と関連するすべてのデータが完全に削除されます。この操作は元に戻せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(business.id)}
                          className="rounded-none text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
