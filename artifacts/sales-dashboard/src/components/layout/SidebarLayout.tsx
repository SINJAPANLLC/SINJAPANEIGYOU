import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard,
  Building2,
  Users,
  FileText,
  Send,
  History,
  LogOut,
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
  const { signOut } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <Sidebar className="border-r border-border">
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
