import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Terminal, BarChart2, Zap, LayoutTemplate } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";

type PublicPage = {
  id: number;
  slug: string;
  title: string;
  description: string;
  headline: string;
  businessName: string;
};

export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const [pages, setPages] = useState<PublicPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/business-pages")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setPages(data);
        setIsLoading(false);
      })
      .catch(() => {
        setPages([]);
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative selection:bg-foreground selection:text-background font-sans">
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

      <header className="border-b border-border/40 py-4 px-6 flex justify-between items-center z-10 relative bg-background/80 backdrop-blur-sm">
        <div className="font-mono text-sm tracking-tighter uppercase font-bold flex items-center gap-2">
          <Terminal className="w-4 h-4" />
           <span>SIN JAPAN Sales</span>
        </div>
        <div className="flex gap-4">
          {isLoaded && isSignedIn ? (
            <Link href="/businesses">
              <Button className="rounded-none tracking-widest text-xs uppercase bg-foreground text-background hover:bg-foreground/90">
                管理画面へ <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/sign-in">
                <Button variant="ghost" className="rounded-none tracking-widest text-xs uppercase">
                  ログイン
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button className="rounded-none tracking-widest text-xs uppercase bg-foreground text-background hover:bg-foreground/90">
                  無料で始める
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-start px-6 py-24 z-10 relative w-full">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl w-full text-center space-y-8"
        >
          <div className="inline-block border border-border px-3 py-1 rounded-full text-xs font-mono tracking-widest uppercase mb-4">
            システム v2.0 稼働中
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1]">
            日本のB2B営業を、<br />自動化する。
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
            精密で洗練された、一切の無駄を省いたコックピット。リードの収集からAIメール生成・一括送信まで、営業プロセスを完全自動化します。
          </p>
          
          <div className="pt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            {isLoaded && isSignedIn ? (
              <Link href="/businesses">
                <Button size="lg" className="rounded-none h-14 px-8 text-sm tracking-widest flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto">
                  管理画面を開く <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            ) : (
              <Link href="/sign-in">
                <Button size="lg" className="rounded-none h-14 px-8 text-sm tracking-widest flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto">
                  システムを開始する <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            )}
          </div>
        </motion.div>

        {/* Public LPs section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mt-32 max-w-5xl w-full"
        >
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold tracking-tight">登録されているサービス</h2>
            <p className="text-muted-foreground mt-2 text-sm">システムを通じて展開されている公開サービス一覧</p>
          </div>
          
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 border border-border bg-muted/20 animate-pulse"></div>
              ))}
            </div>
          ) : pages.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {pages.map((page) => (
                <Link key={page.id} href={`/lp/${page.slug}`}>
                  <div className="group border border-border p-6 hover:bg-muted/10 transition-colors flex flex-col h-full bg-card cursor-pointer">
                    <div className="text-[10px] font-mono tracking-widest uppercase text-muted-foreground mb-3">
                      {page.businessName}
                    </div>
                    <h3 className="font-bold text-lg leading-tight mb-2 group-hover:underline underline-offset-4 decoration-border">
                      {page.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                      {page.description}
                    </p>
                    <div className="flex items-center text-xs font-medium uppercase tracking-widest text-foreground gap-2">
                      詳細を見る <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border border-border bg-muted/5">
              <LayoutTemplate className="w-8 h-8 mx-auto text-muted-foreground opacity-30 mb-3" />
              <p className="text-sm text-muted-foreground">公開されているサービスはまだありません</p>
            </div>
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-px bg-border max-w-5xl w-full border border-border"
        >
          <div className="bg-background p-10 flex flex-col items-center text-center space-y-4 hover:bg-muted/20 transition-colors">
            <div className="w-12 h-12 border border-border flex items-center justify-center rounded-full mb-2">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="font-bold tracking-tight">モノクロームの明快さ</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              データは密度高く、UIは洗練されたスペース感。余計な色を排除した集中できる作業環境。
            </p>
          </div>
          <div className="bg-background p-10 flex flex-col items-center text-center space-y-4 hover:bg-muted/20 transition-colors">
            <div className="w-12 h-12 border border-border flex items-center justify-center rounded-full mb-2">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold tracking-tight">外科的な効率性</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              3カラムのリード処理画面。作成・プレビュー・送信を画面切り替え不要でこなせます。
            </p>
          </div>
          <div className="bg-background p-10 flex flex-col items-center text-center space-y-4 hover:bg-muted/20 transition-colors">
            <div className="w-12 h-12 border border-border flex items-center justify-center rounded-full mb-2">
              <BarChart2 className="w-5 h-5" />
            </div>
            <h3 className="font-bold tracking-tight">圧倒的な可視性</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              監査機能、LP管理、転換率をリアルタイムで把握できる統合ターミナル。
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="py-8 text-center text-xs font-mono text-muted-foreground border-t border-border/40 z-10 relative">
        © {new Date().getFullYear()} SIN JAPAN Sales. システム稼働中.
      </footer>
    </div>
  );
}
