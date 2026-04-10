import { useState, useEffect, useMemo } from "react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FileText, Plus, Building2, Trash2, Sparkles, Loader2, ChevronDown, ChevronUp } from "lucide-react";
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

const STARTER_TEMPLATES: Array<{ label: string; name: string; subjectTemplate: string; htmlTemplate: string }> = [
  {
    label: "ミニマル・モノクロ",
    name: "ミニマル初回アプローチ",
    subjectTemplate: "{{company_name}}様へ — {{service_name}}のご紹介",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;color:#111111;">
  <div style="padding:56px 56px 0;">
    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#bbb;margin-bottom:48px;">{{service_name}}</div>
    <h1 style="font-size:36px;font-weight:800;line-height:1.1;margin:0 0 28px;letter-spacing:-0.03em;">{{company_name}}様、<br>はじめまして。</h1>
    <div style="width:32px;height:3px;background:#111;margin-bottom:32px;"></div>
    <p style="font-size:15px;line-height:1.9;color:#555;margin:0 0 20px;">突然のご連絡、失礼いたします。私どもは<strong style="color:#111;">{{service_name}}</strong>を提供しております。</p>
    <p style="font-size:15px;line-height:1.9;color:#555;margin:0 0 40px;">貴社の営業活動をより効率的にするために、一度お話しさせていただけますでしょうか。</p>
    <a href="{{service_url}}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;padding:16px 40px;margin-bottom:56px;">詳細を見る →</a>
  </div>
  <div style="border-top:1px solid #f0f0f0;padding:24px 56px;font-size:10px;color:#ccc;letter-spacing:0.08em;display:flex;justify-content:space-between;">
    <span>{{service_name}}</span>
    <a href="#unsubscribe" style="color:#ccc;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "ダーク・グラデーション",
    name: "ダークグラデーション提案",
    subjectTemplate: "【{{service_name}}】{{company_name}}様の課題を解決する方法",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#080810;color:#ffffff;">
  <div style="background:linear-gradient(135deg,#0d0d1a 0%,#1a0533 40%,#0a1628 100%);padding:64px 48px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;background:radial-gradient(circle,rgba(139,92,246,0.3) 0%,transparent 70%);pointer-events:none;"></div>
    <div style="position:absolute;bottom:-40px;left:-40px;width:160px;height:160px;background:radial-gradient(circle,rgba(59,130,246,0.2) 0%,transparent 70%);pointer-events:none;"></div>
    <div style="display:inline-block;border:1px solid rgba(139,92,246,0.4);padding:5px 16px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(167,139,250,0.9);margin-bottom:32px;">{{service_name}}</div>
    <h1 style="font-size:38px;font-weight:900;line-height:1.1;margin:0 0 16px;letter-spacing:-0.03em;">{{company_name}}様へ<br><span style="background:linear-gradient(90deg,#c084fc,#60a5fa,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">特別なご提案</span></h1>
    <p style="font-size:15px;color:rgba(255,255,255,0.5);margin:0;line-height:1.7;">貴社の成長をサポートするソリューション</p>
  </div>
  <div style="padding:48px;background:#0d0d18;">
    <p style="font-size:15px;line-height:1.9;color:#9ca3af;margin:0 0 28px;">突然のご連絡、失礼いたします。私どもは<strong style="color:#e5e7eb;">{{service_name}}</strong>を運営しております。</p>
    <p style="font-size:15px;line-height:1.9;color:#9ca3af;margin:0 0 36px;">{{company_name}}様のビジネスに貢献できると確信し、ご連絡いたしました。</p>
    <div style="margin-bottom:36px;border:1px solid #1f2937;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,rgba(139,92,246,0.1),rgba(59,130,246,0.05));padding:20px 24px;border-bottom:1px solid #1f2937;display:flex;align-items:center;gap:12px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;flex-shrink:0;"></div>
        <span style="font-size:13px;color:#d1d5db;">AIによる完全自動化で工数を<strong style="color:#c084fc;">70%削減</strong></span>
      </div>
      <div style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(16,185,129,0.05));padding:20px 24px;border-bottom:1px solid #1f2937;display:flex;align-items:center;gap:12px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;"></div>
        <span style="font-size:13px;color:#d1d5db;">30日間<strong style="color:#60a5fa;">無料トライアル</strong>で即日開始</span>
      </div>
      <div style="background:linear-gradient(135deg,rgba(16,185,129,0.1),rgba(139,92,246,0.05));padding:20px 24px;display:flex;align-items:center;gap:12px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#10b981;flex-shrink:0;"></div>
        <span style="font-size:13px;color:#d1d5db;">導入企業<strong style="color:#34d399;">97%</strong>が継続利用</span>
      </div>
    </div>
    <a href="{{service_url}}" style="display:block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;padding:18px;text-align:center;font-weight:800;border-radius:8px;">無料で試してみる →</a>
  </div>
  <div style="padding:20px 48px;background:#080810;text-align:center;font-size:10px;color:#374151;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#374151;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "エレガント・クリーム",
    name: "エレガント高級感メール",
    subjectTemplate: "{{company_name}}様へ — ご検討いただきたいご提案",
    htmlTemplate: `<div style="max-width:560px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;background:#f8f5f0;color:#2c2218;">
  <div style="padding:56px 56px 0;text-align:center;">
    <div style="font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#9b8b7a;margin-bottom:16px;">— {{service_name}} —</div>
    <div style="width:60px;height:1px;background:linear-gradient(90deg,transparent,#9b8b7a,transparent);margin:0 auto 48px;"></div>
  </div>
  <div style="padding:0 56px 48px;">
    <p style="font-size:12px;letter-spacing:0.15em;text-transform:uppercase;color:#9b8b7a;font-family:'Helvetica Neue',sans-serif;margin:0 0 20px;">{{company_name}} 御中</p>
    <h1 style="font-size:28px;font-weight:700;line-height:1.35;margin:0 0 32px;color:#1a140e;letter-spacing:-0.01em;">拝啓、貴社のご発展を<br>心よりお慶び申し上げます。</h1>
    <p style="font-size:14px;line-height:2.1;color:#5c4e42;margin:0 0 20px;">この度は、弊社サービス<strong style="color:#2c2218;border-bottom:1px solid #c4a882;">{{service_name}}</strong>についてご案内申し上げたく、ご連絡いたしました。</p>
    <p style="font-size:14px;line-height:2.1;color:#5c4e42;margin:0 0 40px;">貴社のご状況に合わせた最適なプランをご提案できますため、ぜひ一度ご覧いただけますと幸いでございます。</p>
    <div style="background:#fff;border:1px solid #e8ddd0;padding:28px 32px;margin-bottom:36px;">
      <p style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#9b8b7a;font-family:'Helvetica Neue',sans-serif;margin:0 0 16px;">ご提案の要点</p>
      <p style="font-size:13px;line-height:2;color:#5c4e42;margin:0;">— &nbsp;貴社専用のカスタマイズプラン<br>— &nbsp;専任担当者による伴走サポート<br>— &nbsp;初月無料でリスクなく開始可能</p>
    </div>
    <div style="text-align:center;margin-bottom:40px;">
      <a href="{{service_url}}" style="display:inline-block;background:#2c2218;color:#f8f5f0;text-decoration:none;font-size:10px;letter-spacing:0.25em;text-transform:uppercase;padding:16px 48px;font-family:'Helvetica Neue',sans-serif;font-weight:600;">詳細はこちら</a>
    </div>
    <p style="font-size:12px;line-height:2;color:#9b8b7a;font-family:'Helvetica Neue',sans-serif;margin:0;">敬具 &nbsp;/&nbsp; {{service_name}} 営業部</p>
  </div>
  <div style="padding:20px 56px;border-top:1px solid #e8ddd0;font-size:9px;color:#c4b9ad;letter-spacing:0.1em;font-family:'Helvetica Neue',sans-serif;text-align:center;">
    {{service_url}} &nbsp;|&nbsp; <a href="#unsubscribe" style="color:#c4b9ad;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "ネオン・サイバー",
    name: "サイバーパンク提案",
    subjectTemplate: "{{company_name}}様、{{service_name}}で営業効率3倍へ",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Courier New',Courier,monospace;background:#020617;color:#e2e8f0;">
  <div style="background:#020617;border-bottom:1px solid #0e7490;padding:32px 48px;">
    <div style="font-size:9px;letter-spacing:0.3em;color:#0e7490;margin-bottom:4px;">// INITIALIZING_SESSION</div>
    <div style="font-size:22px;font-weight:700;color:#22d3ee;letter-spacing:0.05em;">{{service_name}}</div>
  </div>
  <div style="padding:48px;border-bottom:1px solid #0f172a;">
    <h1 style="font-size:32px;font-weight:700;line-height:1.15;margin:0 0 8px;letter-spacing:-0.02em;">こんにちは、<br><span style="color:#22d3ee;">{{company_name}}</span><span style="color:#ffffff;">様。</span></h1>
    <div style="width:100%;height:1px;background:linear-gradient(90deg,#22d3ee,#8b5cf6,transparent);margin:24px 0 28px;"></div>
    <p style="font-size:14px;line-height:1.9;color:#94a3b8;margin:0 0 20px;">私たちは<strong style="color:#e2e8f0;">{{service_name}}</strong>を通じて、B2B営業チームの効率を劇的に向上させています。</p>
    <p style="font-size:14px;line-height:1.9;color:#94a3b8;margin:0 0 36px;">30分のデモセッションで、貴社の課題に対する具体的な解決策をご提示できます。</p>
    <div style="margin-bottom:36px;">
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid #22d3ee;padding:16px 20px;margin-bottom:8px;">
        <span style="font-size:10px;color:#22d3ee;letter-spacing:0.1em;">01 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">AIによる自動リード収集</span>
      </div>
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid #8b5cf6;padding:16px 20px;margin-bottom:8px;">
        <span style="font-size:10px;color:#8b5cf6;letter-spacing:0.1em;">02 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">パーソナライズドメール自動生成</span>
      </div>
      <div style="background:#0f172a;border:1px solid #1e293b;border-left:3px solid #f472b6;padding:16px 20px;">
        <span style="font-size:10px;color:#f472b6;letter-spacing:0.1em;">03 /</span>
        <span style="font-size:13px;color:#cbd5e1;margin-left:12px;">リアルタイム開封・クリック追跡</span>
      </div>
    </div>
    <a href="{{service_url}}" style="display:block;border:1px solid #22d3ee;color:#22d3ee;text-decoration:none;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;padding:16px;text-align:center;">[ デモを予約する ]</a>
  </div>
  <div style="padding:20px 48px;font-size:9px;color:#1e293b;letter-spacing:0.15em;text-align:center;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#1e293b;text-decoration:none;">UNSUBSCRIBE</a>
  </div>
</div>`,
  },
  {
    label: "ボールド・レッド",
    name: "インパクト強調メール",
    subjectTemplate: "{{company_name}}様だけへの限定ご提案 — {{service_name}}",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;">
  <div style="background:#e11d48;padding:12px 48px;text-align:right;">
    <span style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.7);">{{service_name}}</span>
  </div>
  <div style="padding:64px 48px 48px;">
    <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#e11d48;margin-bottom:16px;">Limited Offer</div>
    <h1 style="font-size:40px;font-weight:900;line-height:1.0;margin:0 0 8px;letter-spacing:-0.04em;color:#0f0f0f;">{{company_name}}様<br>だけへの</h1>
    <h1 style="font-size:40px;font-weight:900;line-height:1.0;margin:0 0 36px;letter-spacing:-0.04em;color:#e11d48;">特別提案。</h1>
    <p style="font-size:15px;line-height:1.9;color:#444;margin:0 0 20px;">突然のご連絡、失礼いたします。私どもは<strong>{{service_name}}</strong>を提供しております。</p>
    <p style="font-size:15px;line-height:1.9;color:#444;margin:0 0 40px;">他社では実現できない結果を、私たちなら提供できます。まずは詳細をご確認ください。</p>
    <div style="background:#fff5f7;border-left:4px solid #e11d48;padding:20px 24px;margin-bottom:40px;">
      <p style="font-size:14px;font-weight:700;color:#0f0f0f;margin:0 0 8px;">今だけの特典</p>
      <p style="font-size:13px;color:#666;line-height:1.8;margin:0;">初月完全無料 &nbsp;+&nbsp; オンボーディングサポート無料<br>さらに導入コンサルティング（通常¥50,000）を無償提供</p>
    </div>
    <a href="{{service_url}}" style="display:block;background:#e11d48;color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;padding:20px;text-align:center;font-weight:800;">今すぐ確認する →</a>
  </div>
  <div style="padding:20px 48px;border-top:1px solid #f3f4f6;font-size:10px;color:#d1d5db;display:flex;justify-content:space-between;">
    <span>{{service_name}}</span>
    <a href="#unsubscribe" style="color:#d1d5db;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "グラスモーフィズム",
    name: "グラスモーフィズム提案",
    subjectTemplate: "{{company_name}}様、未来の営業を体験してください — {{service_name}}",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);">
  <div style="padding:56px 48px;">
    <div style="background:rgba(255,255,255,0.12);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.25);border-radius:16px;padding:48px;margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:28px;">{{service_name}}</div>
      <h1 style="font-size:34px;font-weight:800;line-height:1.15;margin:0 0 20px;letter-spacing:-0.02em;color:#ffffff;">{{company_name}}様、<br>営業の未来へ<br>ようこそ。</h1>
      <p style="font-size:15px;line-height:1.9;color:rgba(255,255,255,0.75);margin:0 0 32px;">{{service_name}}は、最先端のAI技術で貴社の営業活動を変革します。</p>
      <div style="display:flex;gap:12px;margin-bottom:36px;flex-wrap:wrap;">
        <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:16px 20px;flex:1;min-width:140px;">
          <div style="font-size:24px;font-weight:900;color:#fff;margin-bottom:4px;">97%</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:0.05em;">顧客満足度</div>
        </div>
        <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:16px 20px;flex:1;min-width:140px;">
          <div style="font-size:24px;font-weight:900;color:#fff;margin-bottom:4px;">3x</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:0.05em;">営業効率向上</div>
        </div>
        <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:16px 20px;flex:1;min-width:140px;">
          <div style="font-size:24px;font-weight:900;color:#fff;margin-bottom:4px;">30日</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.6);letter-spacing:0.05em;">無料トライアル</div>
        </div>
      </div>
      <a href="{{service_url}}" style="display:block;background:#ffffff;color:#764ba2;text-decoration:none;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;padding:18px;text-align:center;font-weight:800;border-radius:8px;">無料で始める →</a>
    </div>
    <div style="text-align:center;font-size:10px;color:rgba(255,255,255,0.35);letter-spacing:0.1em;">
      {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:rgba(255,255,255,0.35);text-decoration:none;">配信停止</a>
    </div>
  </div>
</div>`,
  },
  {
    label: "ストライプ・ゴールド",
    name: "プレミアムゴールド提案",
    subjectTemplate: "【VIP限定】{{company_name}}様へ {{service_name}}よりご案内",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#0c0a06;color:#f5f0e8;">
  <div style="background:linear-gradient(135deg,#1a1500 0%,#0c0a06 100%);padding:0 0 0;border-bottom:1px solid #3d3000;">
    <div style="background:linear-gradient(90deg,#b8860b,#ffd700,#b8860b);padding:3px 0;"></div>
    <div style="padding:40px 48px 36px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:18px;font-weight:700;letter-spacing:0.08em;color:#ffd700;">{{service_name}}</div>
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#8a6d00;border:1px solid #3d3000;padding:5px 12px;">VIP</div>
    </div>
  </div>
  <div style="padding:52px 48px;">
    <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#8a6d00;margin:0 0 20px;">{{company_name}} 様へ</p>
    <h1 style="font-size:32px;font-weight:800;line-height:1.2;margin:0 0 28px;letter-spacing:-0.02em;color:#f5f0e8;">選ばれた企業だけが<br>手にする、<span style="color:#ffd700;">特別な機会</span>。</h1>
    <p style="font-size:14px;line-height:2;color:#9e9280;margin:0 0 20px;">私どもは厳選した企業様のみにご案内しております。<strong style="color:#f5f0e8;">{{service_name}}</strong>が貴社に提供できる価値をご覧ください。</p>
    <p style="font-size:14px;line-height:2;color:#9e9280;margin:0 0 40px;">限定オファーの詳細は下記よりご確認いただけます。</p>
    <div style="border:1px solid #3d3000;padding:28px 32px;margin-bottom:40px;background:#0f0c02;">
      <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:#8a6d00;margin-bottom:16px;">限定特典</div>
      <div style="font-size:13px;color:#c4b89a;line-height:2.1;">
        — &nbsp;専任アカウントマネージャー配置<br>
        — &nbsp;初月利用料100%オフ<br>
        — &nbsp;カスタム機能開発（最大3件）無料
      </div>
    </div>
    <a href="{{service_url}}" style="display:block;background:linear-gradient(135deg,#b8860b,#ffd700,#b8860b);color:#0c0a06;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:20px;text-align:center;font-weight:900;">特別オファーを確認する →</a>
  </div>
  <div style="background:linear-gradient(90deg,#b8860b,#ffd700,#b8860b);padding:1px 0;"></div>
  <div style="padding:20px 48px;background:#080600;text-align:center;font-size:9px;color:#3d3000;letter-spacing:0.1em;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#3d3000;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "スプリット・ビジュアル",
    name: "スプリットレイアウト提案",
    subjectTemplate: "{{company_name}}様へ — {{service_name}}からのご提案",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:50%;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);padding:56px 36px;vertical-align:top;">
        <div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:32px;">{{service_name}}</div>
        <div style="font-size:42px;font-weight:900;line-height:0.9;color:#ffffff;margin-bottom:20px;letter-spacing:-0.04em;">変革の<br>時。</div>
        <div style="width:24px;height:3px;background:linear-gradient(90deg,#a78bfa,#60a5fa);margin-bottom:24px;"></div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.8;">{{company_name}}様の<br>可能性を解き放つ</div>
      </td>
      <td style="width:50%;background:#ffffff;padding:56px 36px;vertical-align:top;">
        <p style="font-size:13px;line-height:2;color:#555;margin:0 0 20px;">突然のご連絡、失礼いたします。</p>
        <p style="font-size:13px;line-height:2;color:#555;margin:0 0 28px;">私どもは<strong style="color:#111;">{{service_name}}</strong>を通じ、多くの企業様の営業効率化を支援してまいりました。</p>
        <div style="margin-bottom:28px;">
          <div style="font-size:11px;color:#999;letter-spacing:0.1em;margin-bottom:8px;">導入効果</div>
          <div style="background:#f9f9f9;padding:12px 16px;margin-bottom:6px;font-size:12px;color:#333;border-left:2px solid #a78bfa;">工数 <strong>70%</strong> 削減</div>
          <div style="background:#f9f9f9;padding:12px 16px;margin-bottom:6px;font-size:12px;color:#333;border-left:2px solid #60a5fa;">返信率 <strong>2.8倍</strong> 向上</div>
          <div style="background:#f9f9f9;padding:12px 16px;font-size:12px;color:#333;border-left:2px solid #34d399;">ROI <strong>320%</strong> 達成</div>
        </div>
        <a href="{{service_url}}" style="display:block;background:#0f0c29;color:#fff;text-decoration:none;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;padding:14px;text-align:center;font-weight:700;">詳細を見る →</a>
      </td>
    </tr>
  </table>
  <div style="padding:16px 48px;background:#fafafa;border-top:1px solid #f0f0f0;text-align:center;font-size:10px;color:#ccc;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#ccc;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "ウェーブ・アクア",
    name: "アクアウェーブ提案",
    subjectTemplate: "{{company_name}}様へ、{{service_name}}が解決します",
    htmlTemplate: `<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;">
  <div style="background:linear-gradient(160deg,#0ea5e9 0%,#0284c7 40%,#075985 100%);padding:60px 48px 80px;position:relative;overflow:hidden;">
    <div style="position:absolute;bottom:-30px;left:0;right:0;height:60px;background:#ffffff;border-radius:50% 50% 0 0;"></div>
    <div style="font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.6);margin-bottom:28px;">{{service_name}}</div>
    <h1 style="font-size:36px;font-weight:800;line-height:1.15;margin:0;color:#ffffff;letter-spacing:-0.02em;">{{company_name}}様の<br>課題、私たちが<br>解決します。</h1>
  </div>
  <div style="padding:48px;">
    <p style="font-size:15px;line-height:1.9;color:#475569;margin:0 0 24px;">突然のご連絡、失礼いたします。<strong style="color:#0ea5e9;">{{service_name}}</strong>の営業担当でございます。</p>
    <p style="font-size:15px;line-height:1.9;color:#475569;margin:0 0 36px;">貴社のビジネス成長に向けて、具体的な提案をご用意しております。</p>
    <div style="display:flex;gap:16px;margin-bottom:40px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;text-align:center;padding:24px 16px;background:#f0f9ff;border-radius:12px;">
        <div style="font-size:28px;font-weight:900;color:#0284c7;margin-bottom:4px;">∞</div>
        <div style="font-size:11px;color:#64748b;letter-spacing:0.05em;">無制限利用</div>
      </div>
      <div style="flex:1;min-width:140px;text-align:center;padding:24px 16px;background:#f0f9ff;border-radius:12px;">
        <div style="font-size:28px;font-weight:900;color:#0284c7;margin-bottom:4px;">24h</div>
        <div style="font-size:11px;color:#64748b;letter-spacing:0.05em;">サポート対応</div>
      </div>
      <div style="flex:1;min-width:140px;text-align:center;padding:24px 16px;background:#f0f9ff;border-radius:12px;">
        <div style="font-size:28px;font-weight:900;color:#0284c7;margin-bottom:4px;">30日</div>
        <div style="font-size:11px;color:#64748b;letter-spacing:0.05em;">無料体験</div>
      </div>
    </div>
    <a href="{{service_url}}" style="display:block;background:linear-gradient(135deg,#0ea5e9,#0284c7);color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;padding:18px;text-align:center;font-weight:800;border-radius:8px;">無料で始める →</a>
  </div>
  <div style="padding:20px 48px;border-top:1px solid #f1f5f9;text-align:center;font-size:10px;color:#cbd5e1;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#cbd5e1;text-decoration:none;">配信停止</a>
  </div>
</div>`,
  },
  {
    label: "アニメ：パルスネオン",
    name: "パルスネオン提案",
    subjectTemplate: "{{company_name}}様、光る未来へ — {{service_name}}",
    htmlTemplate: `<!DOCTYPE html>
<html>
<head>
<style>
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 20px rgba(139,92,246,0.4), 0 0 60px rgba(139,92,246,0.15); }
    50% { box-shadow: 0 0 40px rgba(139,92,246,0.8), 0 0 100px rgba(139,92,246,0.3); }
  }
  @keyframes shimmer {
    0% { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-8px); }
  }
  @keyframes slide-in {
    from { opacity:0; transform: translateX(-20px); }
    to { opacity:1; transform: translateX(0); }
  }
  .pulse-card {
    animation: pulse-glow 3s ease-in-out infinite;
  }
  .shimmer-text {
    background: linear-gradient(90deg, #c084fc 0%, #ffffff 40%, #60a5fa 60%, #c084fc 100%);
    background-size: 600px auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: shimmer 3s linear infinite;
  }
  .float-icon {
    display: inline-block;
    animation: float 3s ease-in-out infinite;
  }
  .slide-row { animation: slide-in 0.6s ease both; }
  .slide-row:nth-child(1) { animation-delay: 0.1s; }
  .slide-row:nth-child(2) { animation-delay: 0.25s; }
  .slide-row:nth-child(3) { animation-delay: 0.4s; }
</style>
</head>
<body style="margin:0;padding:0;background:#060612;">
<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#060612;color:#e2e8f0;">

  <!-- Header -->
  <div style="padding:56px 48px 40px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#8b5cf6,#60a5fa,#8b5cf6,transparent);"></div>
    <div class="float-icon" style="width:40px;height:40px;border:1px solid rgba(139,92,246,0.5);border-radius:50%;margin:0 auto 20px;background:radial-gradient(circle,rgba(139,92,246,0.3),transparent);"></div>
    <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(139,92,246,0.7);margin-bottom:20px;">{{service_name}}</div>
    <h1 style="font-size:36px;font-weight:900;line-height:1.1;margin:0;letter-spacing:-0.03em;">
      <span class="shimmer-text">{{company_name}}様へ、<br>特別なご提案</span>
    </h1>
  </div>

  <!-- Pulse card -->
  <div style="padding:0 48px 40px;">
    <div class="pulse-card" style="background:linear-gradient(135deg,#1a0a2e,#0d1333);border:1px solid rgba(139,92,246,0.3);border-radius:16px;padding:36px;">
      <p style="font-size:15px;line-height:2;color:#a78bfa;margin:0 0 20px;">突然のご連絡、失礼いたします。<strong style="color:#e2e8f0;">{{service_name}}</strong>の担当でございます。</p>
      <p style="font-size:15px;line-height:2;color:#94a3b8;margin:0 0 32px;">{{company_name}}様のビジネスを次のステージへ引き上げる、具体的な提案をご用意しました。</p>

      <!-- Animated rows -->
      <div class="slide-row" style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid rgba(139,92,246,0.15);">
        <div style="width:8px;height:8px;border-radius:50%;background:#8b5cf6;flex-shrink:0;box-shadow:0 0 8px #8b5cf6;"></div>
        <span style="font-size:13px;color:#d1d5db;">AIによる<strong style="color:#c084fc;">完全自動化</strong>で工数70%削減</span>
      </div>
      <div class="slide-row" style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid rgba(96,165,250,0.15);">
        <div style="width:8px;height:8px;border-radius:50%;background:#60a5fa;flex-shrink:0;box-shadow:0 0 8px #60a5fa;"></div>
        <span style="font-size:13px;color:#d1d5db;"><strong style="color:#93c5fd;">30日間無料</strong>トライアルで即日開始</span>
      </div>
      <div class="slide-row" style="display:flex;align-items:center;gap:12px;padding:14px 0;">
        <div style="width:8px;height:8px;border-radius:50%;background:#34d399;flex-shrink:0;box-shadow:0 0 8px #34d399;"></div>
        <span style="font-size:13px;color:#d1d5db;">導入企業<strong style="color:#6ee7b7;">97%</strong>が半年以内にROI達成</span>
      </div>

      <a href="{{service_url}}" style="display:block;margin-top:32px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:18px;text-align:center;font-weight:800;border-radius:10px;">デモを体験する →</a>
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:20px 48px;border-top:1px solid rgba(139,92,246,0.1);text-align:center;font-size:10px;color:#374151;letter-spacing:0.1em;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#374151;text-decoration:none;">配信停止</a>
  </div>
</div>
</body>
</html>`,
  },
  {
    label: "アニメ：オーロラ",
    name: "オーロラグロー提案",
    subjectTemplate: "{{company_name}}様、{{service_name}}からの輝くご提案",
    htmlTemplate: `<!DOCTYPE html>
<html>
<head>
<style>
  @keyframes aurora {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes bounce-dot {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.5); opacity: 0.7; }
  }
  .aurora-bg {
    background: linear-gradient(270deg, #12c2e9, #c471ed, #f64f59, #12c2e9);
    background-size: 400% 400%;
    animation: aurora 6s ease infinite;
  }
  .fade-up { animation: fade-up 0.8s ease both; }
  .fade-up:nth-child(1) { animation-delay: 0.1s; }
  .fade-up:nth-child(2) { animation-delay: 0.3s; }
  .fade-up:nth-child(3) { animation-delay: 0.5s; }
  .dot1 { animation: bounce-dot 1.4s ease-in-out infinite; }
  .dot2 { animation: bounce-dot 1.4s ease-in-out 0.2s infinite; }
  .dot3 { animation: bounce-dot 1.4s ease-in-out 0.4s infinite; }
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
<div style="max-width:600px;margin:0 auto;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#ffffff;">

  <!-- Aurora header -->
  <div class="aurora-bg" style="padding:64px 48px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,0.25);"></div>
    <div style="position:relative;z-index:1;">
      <!-- Loading dots -->
      <div style="display:flex;justify-content:center;gap:6px;margin-bottom:28px;">
        <div class="dot1" style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>
        <div class="dot2" style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>
        <div class="dot3" style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>
      </div>
      <div style="font-size:10px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.7);margin-bottom:16px;">{{service_name}}</div>
      <h1 style="font-size:38px;font-weight:900;line-height:1.1;margin:0;color:#ffffff;letter-spacing:-0.03em;text-shadow:0 2px 20px rgba(0,0,0,0.3);">{{company_name}}様、<br>変化の波に<br>乗りませんか。</h1>
    </div>
  </div>

  <!-- Content -->
  <div style="padding:48px;">
    <p class="fade-up" style="font-size:15px;line-height:2;color:#475569;margin:0 0 20px;">突然のご連絡、失礼いたします。<strong style="color:#111;">{{service_name}}</strong>の担当でございます。</p>
    <p class="fade-up" style="font-size:15px;line-height:2;color:#475569;margin:0 0 36px;">{{company_name}}様の未来に向けた、具体的な変革プランをご用意しております。ぜひ一度ご覧ください。</p>

    <!-- Feature cards with animation delay -->
    <div style="display:flex;gap:12px;margin-bottom:40px;flex-wrap:wrap;">
      <div class="fade-up" style="flex:1;min-width:140px;padding:20px;background:linear-gradient(135deg,#fdf4ff,#fce7f3);border-radius:12px;border:1px solid #f0abfc;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#86198f;margin-bottom:4px;padding-top:4px;">即日導入</div>
        <div style="font-size:11px;color:#a21caf;">セットアップ15分</div>
      </div>
      <div class="fade-up" style="flex:1;min-width:140px;padding:20px;background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:12px;border:1px solid #93c5fd;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#1d4ed8;margin-bottom:4px;padding-top:4px;">AI自動化</div>
        <div style="font-size:11px;color:#2563eb;">工数70%削減</div>
      </div>
      <div class="fade-up" style="flex:1;min-width:140px;padding:20px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-radius:12px;border:1px solid #86efac;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#15803d;margin-bottom:4px;padding-top:4px;">成果保証</div>
        <div style="font-size:11px;color:#16a34a;">30日返金OK</div>
      </div>
    </div>

    <a href="{{service_url}}" style="display:block;background:linear-gradient(135deg,#c471ed,#12c2e9);color:#fff;text-decoration:none;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;padding:20px;text-align:center;font-weight:800;border-radius:10px;box-shadow:0 8px 32px rgba(196,113,237,0.3);">無料で始める →</a>
  </div>

  <div style="padding:20px 48px;border-top:1px solid #f1f5f9;text-align:center;font-size:10px;color:#cbd5e1;">
    {{service_name}} &nbsp;·&nbsp; <a href="#unsubscribe" style="color:#cbd5e1;text-decoration:none;">配信停止</a>
  </div>
</div>
</body>
</html>`,
  },
  {
    label: "アニメ：タイプライター",
    name: "タイプライター演出提案",
    subjectTemplate: "{{company_name}}様、{{service_name}}よりメッセージ",
    htmlTemplate: `<!DOCTYPE html>
<html>
<head>
<style>
  @keyframes typing {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes blink {
    0%, 100% { border-color: transparent; }
    50% { border-color: #111; }
  }
  @keyframes reveal {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes underline-draw {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes counter-up {
    from { opacity: 0; transform: scale(0.5); }
    to { opacity: 1; transform: scale(1); }
  }
  .typewriter {
    display: inline-block;
    overflow: hidden;
    white-space: nowrap;
    border-right: 2px solid #111;
    animation: typing 1.8s steps(20, end) 0.3s both,
               blink 0.75s step-end 2.1s 4;
  }
  .reveal { animation: reveal 0.7s ease both; }
  .reveal:nth-child(1) { animation-delay: 2.2s; }
  .reveal:nth-child(2) { animation-delay: 2.5s; }
  .reveal:nth-child(3) { animation-delay: 2.8s; }
  .underline-anim {
    display: block;
    height: 2px;
    background: #111;
    animation: underline-draw 0.5s ease 2s both;
  }
  .counter { animation: counter-up 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both; }
  .counter:nth-child(1) { animation-delay: 2.4s; }
  .counter:nth-child(2) { animation-delay: 2.6s; }
  .counter:nth-child(3) { animation-delay: 2.8s; }
</style>
</head>
<body style="margin:0;padding:0;background:#fafafa;">
<div style="max-width:600px;margin:0 auto;font-family:'Courier New',Courier,monospace;background:#ffffff;border:1px solid #e5e7eb;">

  <!-- Terminal header -->
  <div style="background:#1a1a1a;padding:14px 20px;display:flex;align-items:center;gap:8px;">
    <div style="width:12px;height:12px;border-radius:50%;background:#ff5f57;"></div>
    <div style="width:12px;height:12px;border-radius:50%;background:#febc2e;"></div>
    <div style="width:12px;height:12px;border-radius:50%;background:#28c840;"></div>
    <span style="font-size:11px;color:#666;margin-left:12px;letter-spacing:0.1em;">{{service_name}} — message.txt</span>
  </div>

  <!-- Typewriter area -->
  <div style="padding:48px;background:#fafafa;">
    <div style="font-size:11px;color:#999;margin-bottom:16px;letter-spacing:0.1em;">// {{service_name}} より {{company_name}} 様へ</div>
    <h1 style="font-size:28px;font-weight:700;line-height:1.2;margin:0 0 4px;color:#111;letter-spacing:-0.02em;">
      <span class="typewriter">{{company_name}}様、はじめまして。</span>
    </h1>
    <span class="underline-anim"></span>
  </div>

  <!-- Body -->
  <div style="padding:0 48px 48px;background:#ffffff;">
    <p class="reveal" style="font-size:14px;line-height:2.1;color:#444;margin:0 0 16px;font-family:'Helvetica Neue',sans-serif;">突然のご連絡、失礼いたします。私どもは<strong style="color:#111;">{{service_name}}</strong>を提供しております。</p>
    <p class="reveal" style="font-size:14px;line-height:2.1;color:#444;margin:0 0 36px;font-family:'Helvetica Neue',sans-serif;">貴社の営業活動をAIで効率化し、より多くの商談を生み出す仕組みをご提案いたします。</p>

    <!-- Stats -->
    <div class="reveal" style="display:flex;gap:0;margin-bottom:40px;border:1px solid #e5e7eb;">
      <div class="counter" style="flex:1;text-align:center;padding:24px 12px;border-right:1px solid #e5e7eb;">
        <div style="font-size:32px;font-weight:900;color:#111;margin-bottom:4px;">70%</div>
        <div style="font-size:10px;color:#999;letter-spacing:0.1em;text-transform:uppercase;font-family:'Helvetica Neue',sans-serif;">工数削減</div>
      </div>
      <div class="counter" style="flex:1;text-align:center;padding:24px 12px;border-right:1px solid #e5e7eb;">
        <div style="font-size:32px;font-weight:900;color:#111;margin-bottom:4px;">3x</div>
        <div style="font-size:10px;color:#999;letter-spacing:0.1em;text-transform:uppercase;font-family:'Helvetica Neue',sans-serif;">返信率向上</div>
      </div>
      <div class="counter" style="flex:1;text-align:center;padding:24px 12px;">
        <div style="font-size:32px;font-weight:900;color:#111;margin-bottom:4px;">30日</div>
        <div style="font-size:10px;color:#999;letter-spacing:0.1em;text-transform:uppercase;font-family:'Helvetica Neue',sans-serif;">無料体験</div>
      </div>
    </div>

    <a href="{{service_url}}" style="display:block;background:#111;color:#fff;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:18px;text-align:center;font-weight:700;font-family:'Helvetica Neue',sans-serif;">詳細を確認する →</a>
  </div>

  <!-- Footer -->
  <div style="padding:20px 48px;border-top:1px solid #e5e7eb;font-size:9px;color:#d1d5db;letter-spacing:0.1em;display:flex;justify-content:space-between;font-family:'Helvetica Neue',sans-serif;">
    <span>{{service_name}}</span>
    <a href="#unsubscribe" style="color:#d1d5db;text-decoration:none;">配信停止</a>
  </div>
</div>
</body>
</html>`,
  },
];

export default function TemplatesPage() {
  const { selectedBusinessId } = useBusiness();
  const { toast } = useToast();
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiDescription, setAiDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showStarters, setShowStarters] = useState(false);
  const [previewMode, setPreviewMode] = useState<"text" | "code" | "preview" | "split">("text");

  // ---- Simple text field local state ----
  type SF = { brand: string; sub: string; hook: string; detail1: string; detail2: string; feat: string };
  const [sf, setSf] = useState<SF>({ brand: "", sub: "", hook: "", detail1: "", detail2: "", feat: "" });
  const [sfBaseHtml, setSfBaseHtml] = useState("");

  // --- Helpers ---
  function xField(html: string, cls: string) {
    return html.match(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)<\\/p>`))?.[1] ?? "";
  }
  function xFeat(html: string) {
    return (html.match(/class="sin-f"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "").replace(/<br\s*\/?>/gi, "\n");
  }
  function xHeader(html: string) {
    const m = html.match(/<div style="background:linear-gradient[\s\S]*?<p style="color:#fff[^>]*>([\s\S]*?)<\/p>\s*<p style="color:rgba[\s\S]*?>([\s\S]*?)<\/p>/);
    return m ? { brand: m[1], sub: m[2] } : { brand: "", sub: "" };
  }
  function iField(html: string, cls: string, v: string) {
    return html.replace(new RegExp(`(class="${cls}"[^>]*>)[\\s\\S]*?(<\\/p>)`), `$1${v}$2`);
  }
  function iFeat(html: string, v: string) {
    return html.replace(/(class="sin-f"[\s\S]*?<p[^>]*>)([\s\S]*?)(<\/p>)/, `$1${v.replace(/\n/g, "<br>")}$3`);
  }
  function iHeader(html: string, brand: string, sub: string) {
    let r = html.replace(/(<div style="background:linear-gradient[\s\S]*?<p style="color:#fff[^>]*>)([\s\S]*?)(<\/p>)/, `$1${brand}$3`);
    return r.replace(/(<p style="color:rgba\(255,255,255,\.65\)[^>]*>)([\s\S]*?)(<\/p>)/, `$1${sub}$3`);
  }
  function buildHtmlFromSf(base: string, fields: SF) {
    let h = iHeader(base, fields.brand, fields.sub);
    h = iField(h, "sin-p1", fields.hook);
    h = iField(h, "sin-p2", fields.detail1);
    h = iField(h, "sin-p3", fields.detail2);
    h = iFeat(h, fields.feat);
    return h;
  }

  // Live preview HTML derived from local state
  const sfPreviewHtml = useMemo(() => {
    if (!sfBaseHtml) return "";
    return buildHtmlFromSf(sfBaseHtml, sf);
  }, [sf, sfBaseHtml]);

  // When template selection changes, init local state
  useEffect(() => {
    if (!selectedTemplateId) return;
    const tpl = (queryClient.getQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId ?? undefined })) as any[])?.find((t: any) => t.id === selectedTemplateId);
    if (!tpl) return;
    const hdr = xHeader(tpl.htmlTemplate);
    setSf({
      brand: hdr.brand,
      sub: hdr.sub,
      hook: xField(tpl.htmlTemplate, "sin-p1"),
      detail1: xField(tpl.htmlTemplate, "sin-p2"),
      detail2: xField(tpl.htmlTemplate, "sin-p3"),
      feat: xFeat(tpl.htmlTemplate),
    });
    setSfBaseHtml(tpl.htmlTemplate);
  }, [selectedTemplateId]);

  function handleSfChange(key: keyof SF, value: string) {
    setSf(prev => ({ ...prev, [key]: value }));
  }

  // Commit simple-field changes to queryClient (called on save)
  function commitSfToHtml() {
    if (!selectedTemplate || !sfBaseHtml) return;
    const newHtml = buildHtmlFromSf(sfBaseHtml, sf);
    const updated = ((templates || []) as any[]).map((t: any) =>
      t.id === selectedTemplate.id ? { ...t, htmlTemplate: newHtml } : t
    );
    queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
    setSfBaseHtml(newHtml);
    return newHtml;
  }

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
    defaultValues: { name: "", subjectTemplate: "", htmlTemplate: "" },
  });

  const handleAiGenerate = async () => {
    if (!aiDescription.trim() || aiDescription.trim().length < 5) {
      toast({ title: "説明文を5文字以上入力してください", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ description: aiDescription }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失敗");
      form.reset({ name: data.name, subjectTemplate: data.subjectTemplate, htmlTemplate: data.htmlTemplate });
      setIsAiOpen(false);
      setAiDescription("");
      setShowStarters(false);
      setIsCreateOpen(true);
      toast({ title: "AIがテンプレートを生成しました。内容を確認して保存してください。" });
    } catch (err: any) {
      toast({ title: err.message || "AI生成に失敗しました", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const applyStarter = (starter: typeof STARTER_TEMPLATES[0]) => {
    form.reset({ name: starter.name, subjectTemplate: starter.subjectTemplate, htmlTemplate: starter.htmlTemplate });
    setShowStarters(false);
    setIsCreateOpen(true);
  };

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
        <h1 className="font-bold tracking-tight text-sm uppercase font-mono">メールテンプレート</h1>

        <div className="flex items-center gap-2">
          {/* AI生成ダイアログ */}
          <Dialog open={isAiOpen} onOpenChange={setIsAiOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border">
                <Sparkles className="w-3 h-3 mr-2" /> AI生成
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> AIでテンプレートを生成
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-mono">どんなメールを作りたいか説明してください</Label>
                  <Textarea
                    value={aiDescription}
                    onChange={e => setAiDescription(e.target.value)}
                    placeholder="例: SaaS営業ツールを中小企業に紹介する初回アプローチメール。丁寧で押しつけがましくない感じで。無料トライアルへの誘導を含める。"
                    className="rounded-none border-border text-sm h-32 resize-none"
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-muted-foreground">業種・トーン・目的などを具体的に書くほど精度が上がります</p>
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => { setIsAiOpen(false); setAiDescription(""); }} className="rounded-none text-xs uppercase tracking-widest" disabled={isGenerating}>
                  キャンセル
                </Button>
                <Button onClick={handleAiGenerate} disabled={isGenerating || aiDescription.trim().length < 5} className="rounded-none text-xs uppercase tracking-widest">
                  {isGenerating ? <><Loader2 className="w-3 h-3 mr-2 animate-spin" />生成中...</> : <><Sparkles className="w-3 h-3 mr-2" />生成する</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* スターターテンプレート選択 */}
          <Dialog open={showStarters} onOpenChange={setShowStarters}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="rounded-none h-8 text-xs uppercase tracking-widest border-border">
                テンプレートから選ぶ
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-4xl max-h-[90vh] flex flex-col">
              <DialogHeader className="shrink-0">
                <DialogTitle className="font-bold">スターターテンプレートを選ぶ</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3 mt-4">
                {STARTER_TEMPLATES.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => applyStarter(s)}
                    className="text-left border border-border p-4 hover:border-foreground hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground group-hover:text-foreground">{s.label}</span>
                    </div>
                    <div className="text-sm font-bold mb-1 truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.subjectTemplate}</div>
                    <div
                      className="mt-3 rounded overflow-hidden border border-border bg-white"
                      style={{ height: 80, pointerEvents: "none" }}
                    >
                      <iframe
                        srcDoc={s.htmlTemplate}
                        title={s.label}
                        className="w-full h-full border-0 scale-75 origin-top-left"
                        style={{ width: "133%", height: "133%", transform: "scale(0.75)", transformOrigin: "top left" }}
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </button>
                ))}
              </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 手動作成ダイアログ */}
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) form.reset(); }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-none h-8 text-xs uppercase tracking-widest bg-foreground text-background hover:bg-foreground/90">
                <Plus className="w-3 h-3 mr-2" /> 新規作成
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-none border-border max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-bold">テンプレートを作成</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreateSubmit)} className="space-y-4 mt-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">テンプレート名</FormLabel>
                      <FormControl><Input placeholder="例: 初回アプローチv1" className="rounded-none border-border" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="subjectTemplate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">件名テンプレート</FormLabel>
                      <FormControl><Input placeholder="{{company_name}}様へ特別なご提案" className="rounded-none border-border" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="htmlTemplate" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase font-mono">HTML本文</FormLabel>
                      <FormControl><Textarea placeholder="<p>こんにちは...</p>" className="rounded-none border-border font-mono text-xs h-40 resize-none" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); form.reset(); }} className="rounded-none text-xs uppercase tracking-widest">キャンセル</Button>
                    <Button type="submit" disabled={createMutation.isPending} className="rounded-none text-xs uppercase tracking-widest">作成する</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左カラム */}
        <div className="w-1/3 min-w-[280px] border-r border-border bg-card flex flex-col">
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1,2].map(i => <div key={i} className="h-16 animate-pulse bg-muted/40 border border-border" />)}
              </div>
            ) : templates?.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <FileText className="w-6 h-6 text-muted-foreground mx-auto opacity-30" />
                <p className="text-sm text-muted-foreground">テンプレートがありません</p>
                <p className="text-xs text-muted-foreground">「テンプレートから選ぶ」または「AI生成」で始めましょう</p>
              </div>
            ) : (
              <div className="divide-y divide-border border-b border-border">
                {templates?.map(template => (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`p-4 cursor-pointer transition-colors group relative ${selectedTemplateId === template.id ? 'bg-muted border-l-2 border-l-foreground' : 'hover:bg-muted/50 border-l-2 border-l-transparent'}`}
                  >
                    <div className="pr-8">
                      <h4 className="font-bold text-sm truncate">{template.name}</h4>
                      <p className="text-xs text-muted-foreground truncate mt-1">{template.subjectTemplate}</p>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost" size="icon"
                          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-none"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-none border-border">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-bold">テンプレートを削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription className="text-muted-foreground">
                            「{template.name}」を削除します。この操作は元に戻せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(template.id)}
                            className="rounded-none text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            削除する
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold tracking-tight truncate">{selectedTemplate.name}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-none text-xs uppercase tracking-widest h-8 border-border text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        削除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none border-border">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="font-bold">テンプレートを削除しますか？</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                          「{selectedTemplate.name}」を削除します。この操作は元に戻せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none text-xs uppercase tracking-widest">キャンセル</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(selectedTemplate.id)}
                          className="rounded-none text-xs uppercase tracking-widest bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button
                    onClick={() => {
                      const finalHtml = previewMode === "text" ? (commitSfToHtml() ?? selectedTemplate.htmlTemplate) : selectedTemplate.htmlTemplate;
                      handleUpdate(selectedTemplate.id, {
                        name: selectedTemplate.name,
                        subjectTemplate: selectedTemplate.subjectTemplate,
                        htmlTemplate: finalHtml,
                      });
                    }}
                    disabled={updateMutation.isPending}
                    size="sm"
                    className="rounded-none text-xs uppercase tracking-widest h-8"
                  >
                    {updateMutation.isPending ? "保存中..." : "変更を保存"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">テンプレート名</Label>
                <Input
                  value={selectedTemplate.name}
                  onChange={e => {
                    const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, name: e.target.value } : t);
                    queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                  }}
                  className="rounded-none border-border font-bold text-lg h-12"
                />
              </div>

              <div className="space-y-2 shrink-0">
                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">件名テンプレート</Label>
                <Input
                  value={selectedTemplate.subjectTemplate}
                  onChange={e => {
                    const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, subjectTemplate: e.target.value } : t);
                    queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                  }}
                  className="rounded-none border-border"
                />
              </div>

              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">本文</Label>
                  <div className="flex text-xs border border-border">
                    {(["text", "code", "preview", "split"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPreviewMode(mode)}
                        className={`px-3 py-1 font-mono uppercase tracking-widest transition-colors ${previewMode === mode ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {mode === "text" ? "テキスト" : mode === "code" ? "HTML" : mode === "preview" ? "プレビュー" : "分割"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ---- テキスト編集モード ---- */}
                {previewMode === "text" && (
                  <div className="flex-1 flex border border-border min-h-0">
                    <div className="w-1/2 overflow-y-auto p-4 space-y-4 bg-muted/5">
                      {!(sf.hook || sf.detail1 || sf.detail2 || sf.feat) && (
                        <p className="text-xs text-muted-foreground font-mono">このテンプレートはテキスト編集に対応していません。HTMLタブで直接編集してください。</p>
                      )}
                      {(sf.brand || sf.sub) && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">ヘッダーブランド名</label>
                          <Input
                            value={sf.brand}
                            onChange={e => handleSfChange("brand", e.target.value)}
                            className="rounded-none border-border text-sm h-9"
                            placeholder="合同会社SIN JAPAN"
                          />
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">サブテキスト（英字）</label>
                          <Input
                            value={sf.sub}
                            onChange={e => handleSfChange("sub", e.target.value)}
                            className="rounded-none border-border text-xs h-8"
                            placeholder="LIGHT CARGO / DELIVERY SERVICE"
                          />
                        </div>
                      )}
                      {sf.hook && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">フック文（冒頭）</label>
                          <Textarea
                            value={sf.hook}
                            onChange={e => handleSfChange("hook", e.target.value)}
                            className="rounded-none border-border text-sm resize-none h-16"
                          />
                        </div>
                      )}
                      {sf.detail1 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">本文①</label>
                          <Textarea
                            value={sf.detail1}
                            onChange={e => handleSfChange("detail1", e.target.value)}
                            className="rounded-none border-border text-sm resize-none h-24"
                          />
                        </div>
                      )}
                      {sf.detail2 && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">本文②</label>
                          <Textarea
                            value={sf.detail2}
                            onChange={e => handleSfChange("detail2", e.target.value)}
                            className="rounded-none border-border text-sm resize-none h-24"
                          />
                        </div>
                      )}
                      {sf.feat && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">特徴リスト（改行で区切る）</label>
                          <Textarea
                            value={sf.feat}
                            onChange={e => handleSfChange("feat", e.target.value)}
                            className="rounded-none border-border text-sm resize-none h-28 font-mono"
                          />
                        </div>
                      )}
                    </div>
                    <div className="w-1/2 border-l border-border bg-white overflow-hidden">
                      <iframe
                        srcDoc={sfPreviewHtml || selectedTemplate.htmlTemplate}
                        title="メールプレビュー"
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  </div>
                )}

                {/* ---- HTMLコード / プレビュー / 分割 ---- */}
                {previewMode !== "text" && (
                  <div className="flex-1 flex border border-border min-h-0">
                    {(previewMode === "code" || previewMode === "split") && (
                      <Textarea
                        value={selectedTemplate.htmlTemplate}
                        onChange={e => {
                          const updated = (templates || []).map(t => t.id === selectedTemplate.id ? { ...t, htmlTemplate: e.target.value } : t);
                          queryClient.setQueryData(getListTemplatesQueryKey({ businessId: selectedBusinessId }), updated);
                        }}
                        className={`resize-none rounded-none border-0 font-mono text-xs p-4 shadow-none focus-visible:ring-0 leading-relaxed bg-muted/10 ${previewMode === "split" ? "w-1/2" : "flex-1"}`}
                      />
                    )}
                    {(previewMode === "preview" || previewMode === "split") && (
                      <div className={`${previewMode === "split" ? "w-1/2 border-l border-border" : "flex-1"} bg-white overflow-hidden`}>
                        <iframe
                          srcDoc={selectedTemplate.htmlTemplate || "<p style='color:#999;font-family:sans-serif;padding:16px'>HTMLを入力するとここにプレビューが表示されます</p>"}
                          title="メールプレビュー"
                          className="w-full h-full border-0"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    )}
                  </div>
                )}
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
