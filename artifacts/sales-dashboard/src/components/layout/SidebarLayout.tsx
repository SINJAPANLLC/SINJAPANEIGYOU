import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import {
  Building2,
  Users,
  FileText,
  History,
  LogOut,
  ChevronDown,
  Clock,
  MessageSquare,
  Newspaper,
  MapPin,
  Music2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navigation = [
  { name: "ビジネス", href: "/businesses", icon: Building2 },
  { name: "リスト", href: "/leads", icon: Users },
  { name: "テンプレート", href: "/templates", icon: FileText },
  { name: "送信ログ", href: "/email-logs", icon: History },
  { name: "スケジュール", href: "/schedule", icon: Clock },
];

const navigationExtra = [
  { name: "PR-FREE", href: "/pr-free", icon: Newspaper },
  { name: "SNS", href: "/sns", icon: MessageSquare },
  { name: "TikTok DM", href: "/tiktok-dm", icon: Music2 },
  { name: "ジモティー", href: "/jimoty", icon: MapPin },
];

export function SidebarLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useAuth();
  const { businesses, selectedBusinessId, setSelectedBusinessId, isLoading } = useBusiness();

  const selectedBusiness = businesses?.find(b => b.id === selectedBusinessId);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
        <Sidebar className="border-r border-border">
          <SidebarContent className="px-3 py-4">
            {/* ビジネス切替 */}
            <div className="mb-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 px-2">ビジネス</div>
              {isLoading ? (
                <div className="h-9 animate-pulse bg-muted/40 border border-border rounded-none" />
              ) : businesses && businesses.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="w-full flex items-center justify-between px-3 py-2 border border-border bg-muted/20 hover:bg-muted/50 transition-colors text-sm font-medium">
                      <span className="truncate">{selectedBusiness?.name ?? "未選択"}</span>
                      <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-2 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="rounded-none border-border w-[--radix-dropdown-menu-trigger-width]" align="start">
                    {businesses.map(b => (
                      <DropdownMenuItem
                        key={b.id}
                        onClick={() => setSelectedBusinessId(b.id)}
                        className={`rounded-none cursor-pointer text-sm ${b.id === selectedBusinessId ? "font-bold bg-muted" : ""}`}
                      >
                        {b.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link href="/businesses" className="block px-3 py-2 text-xs text-muted-foreground border border-dashed border-border hover:border-foreground transition-colors">
                  ビジネスを作成 →
                </Link>
              )}
            </div>

            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 px-2">メニュー</div>
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
            <div className="my-3 border-t border-border" />
            <SidebarMenu>
              {navigationExtra.map((item) => {
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

        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
