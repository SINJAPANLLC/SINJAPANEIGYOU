import { MessageCircle } from "lucide-react";

export default function OfficialLinePage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0">
        <MessageCircle className="w-5 h-5" />
        <h1 className="text-base font-semibold tracking-tight">公式LINE</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2 text-muted-foreground">
          <MessageCircle className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm">公式LINEの機能を準備中です</p>
        </div>
      </div>
    </div>
  );
}