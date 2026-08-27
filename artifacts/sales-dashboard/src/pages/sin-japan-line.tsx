import { ArrowUpRight, Building2, CheckCircle2, Link2, MessageCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const operatingAreas = [
  { icon: MessageCircle, title: "お問い合わせ対応", description: "SIN JAPANへの相談や問い合わせを受け取る窓口です。" },
  { icon: Sparkles, title: "情報発信", description: "採用・営業・事業のお知らせを届ける準備ができます。" },
  { icon: Building2, title: "会社運用", description: "個人用AI秘書の公式LINEとは分けて管理します。" },
];

export default function SinJapanLinePage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 md:p-10">
        <header className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400 font-mono">Company communication</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mt-3">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">SIN JAPAN LINE</h1>
              <p className="text-muted-foreground mt-3 max-w-xl leading-relaxed">
                合同会社SIN JAPANの会社用LINEを管理する専用スペースです。
                個人用AI秘書の公式LINEとは分けて運用できます。
              </p>
            </div>
            <span className="inline-flex items-center gap-2 border border-amber-500/40 text-amber-300 px-3 py-2 text-xs w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              連携準備中
            </span>
          </div>
        </header>

        <section className="border border-border bg-card p-6 md:p-8 mb-6">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-emerald-400 uppercase tracking-widest font-mono">Next step</p>
              <h2 className="text-xl font-semibold mt-2">SIN JAPAN LINEを連携する</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">
                LINE公式アカウントのチャネル情報を設定すると、このスペースから会社用のメッセージ運用を始められます。
                外部への送信は、設定後も確認してから実行します。
              </p>
              <div className="flex flex-wrap gap-3 mt-6">
                <Button asChild className="rounded-none bg-emerald-600 hover:bg-emerald-500">
                  <Link href="/official-line">LINE設定を確認する <ArrowUpRight className="w-4 h-4 ml-2" /></Link>
                </Button>
                <Button variant="outline" className="rounded-none" disabled>
                  チャネルを設定する
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4 mb-6">
          {operatingAreas.map(({ icon: Icon, title, description }) => (
            <div key={title} className="border border-border bg-card p-5">
              <Icon className="w-5 h-5 text-emerald-400 mb-4" />
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">{description}</p>
            </div>
          ))}
        </section>

        <section className="border border-border bg-card">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">連携ステータス</h2>
            <p className="text-xs text-muted-foreground mt-1">会社用LINEの接続状況を確認できます。</p>
          </div>
          <div className="divide-y divide-border">
            {[
              ["LINEチャネル", "未設定"],
              ["Webhook", "未設定"],
              ["自動応答", "準備中"],
            ].map(([label, status]) => (
              <div key={label} className="flex items-center justify-between px-5 py-4 text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className="inline-flex items-center gap-2 text-amber-300">
                  <CheckCircle2 className="w-3.5 h-3.5" />{status}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}