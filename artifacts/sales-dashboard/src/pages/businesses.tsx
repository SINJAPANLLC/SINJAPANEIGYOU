import { useState, useRef } from "react";
import { useListBusinesses, useCreateBusiness, useUpdateBusiness, useDeleteBusiness, getListBusinessesQueryKey } from "@workspace/api-client-react";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useUser } from "@clerk/react";

const businessSchema = z.object({
  name: z.string().min(1, "Name is required"),
  companyName: z.string().optional().nullable(),
  serviceUrl: z.string().url("Must be a valid URL").optional().nullable().or(z.literal('')),
  senderName: z.string().optional().nullable(),
  senderEmail: z.string().email("Must be a valid email").optional().nullable().or(z.literal('')),
  signatureHtml: z.string().optional().nullable(),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

export default function BusinessesPage() {
  const { toast } = useToast();
  const { isSignedIn } = useUser();
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
            toast({ title: "Business updated successfully" });
          },
          onError: () => toast({ title: "Failed to update business", variant: "destructive" })
        }
      );
    } else {
      createMutation.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() });
            setIsCreateOpen(false);
            toast({ title: "Business created successfully" });
          },
          onError: () => toast({ title: "Failed to create business", variant: "destructive" })
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
          toast({ title: "Business deleted" });
        },
        onError: () => toast({ title: "Failed to delete business", variant: "destructive" })
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
          <h1 className="text-2xl font-bold tracking-tight">Businesses</h1>
          <p className="text-muted-foreground text-sm font-mono uppercase tracking-widest mt-1">Manage Workspaces & Identities</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="rounded-none tracking-widest text-xs uppercase h-10 px-6">
              <Plus className="w-4 h-4 mr-2" /> New Business
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] rounded-none border-border">
            <DialogHeader>
              <DialogTitle className="font-bold tracking-tight">
                {editingBusinessId ? "Edit Business" : "Create New Business"}
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Workspace Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Sales Team Alpha" className="rounded-none border-border" {...field} />
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Company Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Corp" className="rounded-none border-border" {...field} value={field.value || ''} />
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Service URL</FormLabel>
                        <FormControl>
                          <Input placeholder="https://example.com" type="url" className="rounded-none border-border" {...field} value={field.value || ''} />
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Sender Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" className="rounded-none border-border" {...field} value={field.value || ''} />
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Sender Email</FormLabel>
                        <FormControl>
                          <Input placeholder="john@example.com" type="email" className="rounded-none border-border" {...field} value={field.value || ''} />
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
                        <FormLabel className="text-xs uppercase tracking-wider font-mono">Email Signature (HTML)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="<p>Best regards,<br/>John Doe</p>" 
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
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="rounded-none text-xs uppercase tracking-widest">
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Business"}
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
            <h3 className="text-lg font-bold">No businesses found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">Create your first business workspace to start managing leads and campaigns.</p>
            <Button onClick={() => setIsCreateOpen(true)} variant="outline" className="rounded-none mt-4 text-xs tracking-widest uppercase">
              Create Workspace
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
                        {business.companyName || 'No Company Name'}
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
                    <Edit2 className="w-4 h-4 mr-2" /> Edit
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="rounded-none text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" data-testid={`btn-delete-${business.id}`}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-bold">Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the business "{business.name}" and all associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(business.id)}
                          className="rounded-none text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
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
