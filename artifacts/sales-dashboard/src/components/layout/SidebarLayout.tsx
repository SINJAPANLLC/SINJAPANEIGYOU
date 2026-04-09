import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Send,
  History,
  LogOut,
  ChevronDown,
  Plus
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navigation = [
  { name: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { name: "ビジネス", href: "/businesses", icon: Building2 },
  { name: "リード", href: "/leads", icon: Users },
  { name: "テンプレート", href: "/templates", icon: FileText },
  { name: "キャンペーン", href: "/campaigns", icon: Send },
  { name: "送信ログ", href: "/email-logs", icon: History },
];

export function SidebarLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { businesses, selectedBusinessId, setSelectedBusinessId, isLoading } = useBusiness();

  const selectedBusiness = businesses?.find((b) => b.id === selectedBusinessId);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar className="border-r border-border">
          <SidebarHeader className="border-b border-border p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center justify-between w-full p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors border border-transparent hover:border-border" data-testid="business-selector-trigger">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-8 h-8 rounded-sm bg-primary text-primary-foreground">
                      <AvatarFallback className="rounded-sm bg-primary text-primary-foreground font-mono text-xs">
                        {selectedBusiness ? selectedBusiness.name.substring(0, 2).toUpperCase() : "..."}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold leading-tight">
                        {isLoading ? "読込中..." : selectedBusiness?.name || "未選択"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                        ワークスペース
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[240px] rounded-none border-border">
                <DropdownMenuLabel className="font-mono text-xs uppercase tracking-widest text-muted-foreground">ビジネスを選択</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                {businesses?.map((business) => (
                  <DropdownMenuItem
                    key={business.id}
                    onClick={() => setSelectedBusinessId(business.id)}
                    className={`cursor-pointer rounded-none ${selectedBusinessId === business.id ? 'bg-muted' : ''}`}
                    data-testid={`business-option-${business.id}`}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className="w-6 h-6 bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold font-mono">
                        {business.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate text-sm">{business.name}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-border" />
                <Link href="/businesses">
                  <DropdownMenuItem className="cursor-pointer rounded-none text-muted-foreground">
                    <Plus className="w-4 h-4 mr-2" />
                    <span className="text-sm">ビジネスを管理</span>
                  </DropdownMenuItem>
                </Link>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarHeader>

          <SidebarContent className="px-3 py-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-4 px-2">メニュー</div>
            <SidebarMenu>
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton asChild isActive={isActive} className="rounded-none">
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                          isActive 
                            ? "bg-foreground text-background font-medium" 
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`nav-${item.name}`}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.name}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-border p-4">
            <button
              onClick={() => signOut()}
              className="flex items-center gap-3 px-3 py-2 w-full text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              data-testid="btn-signout"
            >
              <LogOut className="w-4 h-4" />
              <span>ログアウト</span>
            </button>
          </SidebarFooter>
        </Sidebar>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
