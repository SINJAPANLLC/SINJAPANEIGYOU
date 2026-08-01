import { Phone } from "lucide-react";

export default function AiTeleapoPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Phone className="w-5 h-5" />
        <h1 className="text-xl font-semibold tracking-tight">AIテレアポ</h1>
      </div>
      <div className="border border-dashed border-border rounded-none p-12 flex flex-col items-center justify-center text-center gap-3">
        <Phone className="w-8 h-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">AIテレアポ機能は準備中です</p>
      </div>
    </div>
  );
}
