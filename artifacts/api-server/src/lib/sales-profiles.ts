import type { PersonaType } from "./search";

export type SalesProfile = {
  keyword: string;
  persona: PersonaType;
  serviceUrl: string;
};

const COMPANY_SITE = "https://sinjapan.work";

const profiles: Record<string, SalesProfile> = {
  "軽貨物手配": { keyword: "軽貨物 配送委託 荷主 企業", persona: "lightfreight_shipper", serviceUrl: COMPANY_SITE },
  "軽貨物　協力会社様募集": { keyword: "軽貨物 運送会社 協力会社", persona: "lightfreight_carrier", serviceUrl: COMPANY_SITE },
  "トラック手配": { keyword: "トラック輸送 外注 荷主 企業", persona: "freight_shipper", serviceUrl: COMPANY_SITE },
  "一般貨物　協力会社様募集": { keyword: "一般貨物 運送会社 協力会社", persona: "freight_carrier", serviceUrl: COMPANY_SITE },
  "人材紹介　お仕事依頼": { keyword: "採用 人材紹介 企業", persona: "staffing_client", serviceUrl: COMPANY_SITE },
  "人材紹介　協力会社様募集": { keyword: "人材紹介 人材派遣 協力会社", persona: "staffing_agency", serviceUrl: COMPANY_SITE },
  "KEI MATCH": { keyword: "EC 物流 配送委託 荷主", persona: "lightfreight_shipper", serviceUrl: "https://keimatch-sinjapan.com/" },
  "TRA MATCH": { keyword: "一般貨物 輸送委託 荷主", persona: "freight_shipper", serviceUrl: "https://tramatch-sinjapan.com/" },
  "KEI SAIYOU": { keyword: "軽貨物 運送会社 ドライバー採用", persona: "driver_recruiting_partner", serviceUrl: "https://keisaiyou-sinjapan.com/" },
  "SIN JAPAN AI 制作": { keyword: "中小企業 営業DX AI導入", persona: "business_software", serviceUrl: "https://sinjapanai.site/" },
  "TikTok ONE 広告主募集": { keyword: "EC ブランド TikTok 広告 企業", persona: "advertiser", serviceUrl: COMPANY_SITE },
  "フルコミ営業募集": { keyword: "営業代行 代理店 募集 企業", persona: "sales_partner", serviceUrl: COMPANY_SITE },
  "軽貨物ドライバー募集": { keyword: "軽貨物 運送会社 ドライバー採用", persona: "driver_recruiting_partner", serviceUrl: "https://sinjapan.work/keikamotsu-job" },
  "チャットレディ募集": { keyword: "ライブ配信 プロダクション 法人", persona: "livechat_agency", serviceUrl: "https://sinjapan.work/live" },
  "KEI SCHOOL": { keyword: "軽貨物 運送会社 研修 ドライバー教育", persona: "logistics_training", serviceUrl: "https://line.me/ti/g2/E0Bi9Suu125cqm9d2U-Nq3tU3BUO-cXhhYbwzg" },
  "CHAT LOGI": { keyword: "物流会社 配車 業務効率化", persona: "logistics_software", serviceUrl: "https://chat-logi.com/lp" },
  "Chat VAN": { keyword: "軽貨物 運送会社 配車 管理", persona: "logistics_software", serviceUrl: "https://chat-van.com/lp" },
};

export function getSalesProfile(businessName: string): SalesProfile | null {
  return profiles[businessName] || null;
}