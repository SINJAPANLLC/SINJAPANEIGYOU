import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, Terminal, BarChart2, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col relative selection:bg-foreground selection:text-background">
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-50 bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>

      <header className="border-b border-border/40 py-4 px-6 flex justify-between items-center z-10 relative bg-background/80 backdrop-blur-sm">
        <div className="font-mono text-sm tracking-tighter uppercase font-bold flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span>営業自動化ダッシュボード</span>
        </div>
        <div className="flex gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="rounded-none tracking-widest text-xs uppercase" data-testid="link-signin">
              ログイン
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="rounded-none tracking-widest text-xs uppercase bg-foreground text-background hover:bg-foreground/90" data-testid="link-signup">
              無料で始める
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 z-10 relative">
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
            <Link href="/sign-up">
              <Button size="lg" className="rounded-none h-14 px-8 text-sm tracking-widest uppercase flex items-center gap-2 bg-foreground text-background hover:bg-foreground/90 w-full sm:w-auto" data-testid="btn-hero-cta">
                システムを開始する <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" size="lg" className="rounded-none h-14 px-8 text-sm tracking-widest uppercase w-full sm:w-auto" data-testid="btn-hero-secondary">
                ログイン
              </Button>
            </Link>
          </div>
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
              Bloombergターミナルのように。転換率・キャンペーン状況をリアルタイムで把握できます。
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="py-8 text-center text-xs font-mono text-muted-foreground border-t border-border/40 z-10 relative">
        © {new Date().getFullYear()} 営業自動化ダッシュボード. システム稼働中.
      </footer>
    </div>
  );
}
