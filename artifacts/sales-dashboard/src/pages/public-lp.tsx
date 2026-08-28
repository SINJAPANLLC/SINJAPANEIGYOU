import { useEffect, useState, FormEvent } from "react";
import { useRoute } from "wouter";
import { ArrowRight, CheckCircle2, Terminal, Building2, Globe, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";

type PageData = {
  page: {
    id: number;
    businessId: number;
    slug: string;
    title: string;
    description: string;
    headline: string;
    subheadline: string;
    targetAudience: string | null;
    painPoints: string[] | null;
    benefits: string[] | null;
    faq: Array<{ question: string; answer: string }> | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    ogImageUrl: string | null;
  };
  business: {
    name: string;
    companyName: string | null;
    serviceUrl: string | null;
  };
};

export default function PublicLpPage() {
  const [match, params] = useRoute("/lp/:slug");
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [formState, setFormState] = useState<"idle" | "submitting" | "success" | "error">("idle");

  useEffect(() => {
    if (!params?.slug) return;
    setLoading(true);
    fetch(`/api/public/business-pages/${params.slug}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((json: PageData) => {
        setData(json);
        setLoading(false);
        // Track view
        fetch(`/api/public/business-pages/${params.slug}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType: "page_view", path: window.location.pathname }),
        }).catch(() => {});

        // Set SEO
        document.title = json.page.title;
        const setMeta = (name: string, content: string, isProperty = false) => {
          const attr = isProperty ? "property" : "name";
          let el = document.querySelector(`meta[${attr}="${name}"]`);
          if (!el) {
            el = document.createElement("meta");
            el.setAttribute(attr, name);
            document.head.appendChild(el);
          }
          el.setAttribute("content", content);
        };
        setMeta("description", json.page.description);
        setMeta("og:title", json.page.title, true);
        setMeta("og:description", json.page.description, true);
        if (json.page.ogImageUrl) setMeta("og:image", json.page.ogImageUrl, true);

        // Canonical
        let canonical = document.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement("link");
          canonical.setAttribute("rel", "canonical");
          document.head.appendChild(canonical);
        }
        canonical.setAttribute(
          "href",
          `${window.location.origin}/api/public/business-pages/${encodeURIComponent(json.page.slug)}/page`,
        );

        // JSON-LD
        let jsonLd = document.querySelector('script[id="dynamic-json-ld"]');
        if (!jsonLd) {
          jsonLd = document.createElement("script");
          jsonLd.setAttribute("type", "application/ld+json");
          jsonLd.setAttribute("id", "dynamic-json-ld");
          document.head.appendChild(jsonLd);
        }
        jsonLd.textContent = JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": json.page.title,
          "description": json.page.description,
          "publisher": {
            "@type": "Organization",
            "name": json.business.companyName || json.business.name
          }
        });
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [params?.slug]);

  const handleCtaClick = () => {
    if (!params?.slug) return;
    fetch(`/api/public/business-pages/${params.slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "cta_click", path: window.location.pathname }),
    }).catch(() => {});
  };

  const isContactAnchor = data?.page.ctaUrl === "#contact";

  const handleInquiry = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!params?.slug) return;
    const formData = new FormData(e.currentTarget);
    setFormState("submitting");

    fetch(`/api/public/business-pages/${params.slug}/inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: formData.get("companyName"),
        name: formData.get("contactName"),
        email: formData.get("email"),
        message: formData.get("message"),
        consent: formData.get("consent") === "on",
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        setFormState("success");
      })
      .catch(() => {
        setFormState("error");
      });
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 border border-border rounded-full animate-spin border-t-foreground"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-center p-6">
        <Terminal className="w-12 h-12 mb-6 text-muted-foreground opacity-30" />
        <h1 className="text-2xl font-bold tracking-tight mb-2">ページが見つかりません</h1>
        <p className="text-muted-foreground text-sm">指定されたURLは存在しないか、非公開になっています。</p>
      </div>
    );
  }

  const { page, business } = data;

  return (
    <div className="min-h-[100dvh] bg-[#fdfdfd] dark:bg-[#0a0a0a] text-zinc-900 dark:text-zinc-100 flex flex-col selection:bg-zinc-900 selection:text-white dark:selection:bg-white dark:selection:text-zinc-900 font-sans">
      <header className="border-b border-zinc-200 dark:border-zinc-800/50 py-5 px-6 flex justify-between items-center z-10 sticky top-0 bg-[#fdfdfd]/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md">
        <div className="font-bold text-sm tracking-widest flex items-center gap-2">
          <div className="w-4 h-4 bg-zinc-900 dark:bg-zinc-100 rounded-sm"></div>
          {business.name}
        </div>
        {page.ctaUrl && (
          <a
            href={page.ctaUrl}
            target={isContactAnchor ? undefined : "_blank"}
            rel={isContactAnchor ? undefined : "noreferrer"}
            onClick={handleCtaClick}
          >
            <Button size="sm" variant="outline" className="rounded-none text-xs uppercase tracking-widest border-zinc-200 dark:border-zinc-800">
              公式ページへ
            </Button>
          </a>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center w-full z-10 relative">
        
        {/* Hero Section */}
        <section className="w-full py-24 md:py-32 px-6 flex flex-col items-center text-center border-b border-zinc-200 dark:border-zinc-800/50">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-4xl w-full space-y-8"
          >
            <div className="inline-block border border-zinc-200 dark:border-zinc-800 px-3 py-1 rounded-full text-[10px] font-mono tracking-widest uppercase mb-4 text-zinc-500 dark:text-zinc-400">
              {business.companyName || "ご案内"}
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.15] text-zinc-900 dark:text-zinc-50">
              {page.headline}
            </h1>
            <p className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto leading-relaxed font-light">
              {page.subheadline}
            </p>
            
            <div className="pt-8">
              {page.ctaUrl ? (
                <a
                  href={page.ctaUrl}
                  target={isContactAnchor ? undefined : "_blank"}
                  rel={isContactAnchor ? undefined : "noreferrer"}
                  onClick={handleCtaClick}
                  className="inline-block"
                >
                  <Button size="lg" className="rounded-none h-14 px-8 text-sm tracking-widest bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 flex items-center gap-3 w-full sm:w-auto">
                    {page.ctaLabel || "詳細を見る"} <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Button size="lg" onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })} className="rounded-none h-14 px-8 text-sm tracking-widest bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 flex items-center gap-3 w-full sm:w-auto">
                  お問い合わせ <ArrowRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </motion.div>
        </section>

        {/* Details Section */}
        <section className="w-full max-w-5xl px-6 py-24 md:py-32 grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-24">
          
          {page.painPoints && page.painPoints.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="space-y-8"
            >
              <h2 className="text-sm font-mono tracking-widest uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                現状の課題
              </h2>
              <ul className="space-y-6">
                {page.painPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="w-6 h-6 rounded-full border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs text-zinc-400">{i + 1}</span>
                    </div>
                    <span className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

          {page.benefits && page.benefits.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="space-y-8"
            >
              <h2 className="text-sm font-mono tracking-widest uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                提供する価値
              </h2>
              <ul className="space-y-6">
                {page.benefits.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <CheckCircle2 className="w-6 h-6 text-zinc-900 dark:text-zinc-100 shrink-0 mt-0.5" />
                    <span className="text-zinc-700 dark:text-zinc-300 leading-relaxed">{benefit}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </section>

        {/* FAQ Section */}
        {page.faq && page.faq.length > 0 && (
          <section className="w-full py-24 md:py-32 bg-zinc-50 dark:bg-zinc-900/50 border-y border-zinc-200 dark:border-zinc-800/50 px-6 flex flex-col items-center">
            <div className="max-w-3xl w-full">
              <h2 className="text-2xl font-bold tracking-tight mb-12 text-center">よくあるご質問</h2>
              <div className="space-y-6">
                {page.faq.map((item, i) => (
                  <div key={i} className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 p-6 rounded-sm">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 mb-2 flex gap-3">
                      <span className="text-zinc-400 font-mono">Q.</span>
                      {item.question}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed flex gap-3">
                      <span className="text-zinc-400 font-mono">A.</span>
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Contact Form & Company Info */}
        <section id="contact" className="w-full max-w-5xl px-6 py-24 md:py-32 grid grid-cols-1 md:grid-cols-5 gap-16">
          
          <div className="md:col-span-2 space-y-8">
            <h2 className="text-sm font-mono tracking-widest uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              運営・提供元
            </h2>
            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
              {business.companyName && (
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{business.companyName}</span>
                </div>
              )}
              {business.serviceUrl && (
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 shrink-0" />
                  <a href={business.serviceUrl} target="_blank" rel="noreferrer" className="hover:underline underline-offset-4">
                    {business.serviceUrl.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <p className="leading-relaxed">
                  サービスに関するご質問やご相談は、右記のフォームより承っております。<br />
                  担当者より順次ご案内申し上げます。
                </p>
              </div>
            </div>
          </div>

          <div className="md:col-span-3">
            <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 p-8 md:p-10 rounded-sm">
              <h3 className="font-bold text-xl mb-6">ご相談・お問い合わせ</h3>
              
              <AnimatePresence mode="wait">
                {formState === "success" ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-12 space-y-4"
                  >
                    <CheckCircle2 className="w-12 h-12 text-zinc-900 dark:text-zinc-100 mx-auto" />
                    <p className="font-bold text-lg">お問い合わせを受け付けました</p>
                    <p className="text-sm text-zinc-500">内容を確認のうえ、担当者よりご連絡いたします。</p>
                    <Button variant="outline" onClick={() => setFormState("idle")} className="mt-4 rounded-none">
                      戻る
                    </Button>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onSubmit={handleInquiry}
                    className="space-y-5"
                  >
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">貴社名 / 組織名</label>
                      <Input name="companyName" required className="rounded-none border-zinc-200 dark:border-zinc-800 bg-transparent h-10" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">ご担当者名</label>
                        <Input name="contactName" required className="rounded-none border-zinc-200 dark:border-zinc-800 bg-transparent h-10" />
                      <label className="flex items-start gap-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                        <input type="checkbox" name="consent" required className="mt-0.5 h-4 w-4 accent-zinc-900" />
                        <span>入力した情報をお問い合わせへの回答に利用することに同意します。</span>
                      </label>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">メールアドレス</label>
                        <Input name="email" type="email" required className="rounded-none border-zinc-200 dark:border-zinc-800 bg-transparent h-10" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono tracking-widest uppercase text-zinc-500">ご相談内容</label>
                      <Textarea name="message" required className="rounded-none border-zinc-200 dark:border-zinc-800 bg-transparent min-h-[120px] resize-y" />
                    </div>
                    
                    {formState === "error" && (
                      <p className="text-xs text-red-500">送信に失敗しました。時間をおいて再度お試しください。</p>
                    )}

                    <Button 
                      type="submit" 
                      disabled={formState === "submitting"}
                      className="w-full rounded-none h-12 tracking-widest bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {formState === "submitting" ? (
                        <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> 送信中...</span>
                      ) : (
                        <span className="flex items-center gap-2"><Send className="w-4 h-4" /> 送信する</span>
                      )}
                    </Button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

      </main>
      
      <footer className="py-8 text-center text-xs font-mono text-zinc-400 dark:text-zinc-600 border-t border-zinc-200 dark:border-zinc-800/50 z-10 relative">
        © {new Date().getFullYear()} {business.companyName || business.name}.
      </footer>
    </div>
  );
}
