import { QrCode, Shield, AlertTriangle, Truck, CheckCircle, Package, Snowflake } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MilkBankRow } from "@/lib/api";

interface MilkPassportTableProps {
  data: MilkBankRow[];
  isLoading: boolean;
  onViewPassport: (id: string) => void;
}

// Cold-chain status progression
const COLD_CHAIN_STATUSES = {
  "Collected": { icon: Package, color: "bg-blue-100 text-blue-700", order: 1 },
  "Pasteurized": { icon: Snowflake, color: "bg-cyan-100 text-cyan-700", order: 2 },
  "Available": { icon: CheckCircle, color: "bg-secondary/15 text-secondary", order: 3 },
  "Reserved": { icon: Package, color: "bg-purple-100 text-purple-700", order: 4 },
  "In Transit": { icon: Truck, color: "bg-blue-100 text-blue-700", order: 5 },
  "Delivered": { icon: CheckCircle, color: "bg-green-100 text-green-700", order: 6 },
  "Expiring Soon": { icon: AlertTriangle, color: "bg-amber-100 text-amber-700", order: 0 },
  "Low Stock": { icon: AlertTriangle, color: "bg-amber-100 text-amber-700", order: 0 },
  "Expired": { icon: AlertTriangle, color: "bg-red-100 text-red-700", order: 0 },
};

export default function MilkPassportTable({ data, isLoading, onViewPassport }: MilkPassportTableProps) {
  // Count items that are expiring soon or expired
  const expiringCount = data.filter(r =>
    r.status === "Expiring Soon" || r.status === "Low Stock"
  ).length;
  const expiredCount = data.filter(r => r.status === "Expired").length;

  const getStatusConfig = (status: string) => {
    return COLD_CHAIN_STATUSES[status as keyof typeof COLD_CHAIN_STATUSES] || {
      icon: Package,
      color: "bg-muted text-muted-foreground",
      order: 99
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-bold flex items-center gap-2">
          Milk Bank Registry
          <Badge className="bg-milk/20 text-milk border-0 font-body text-[10px] h-5 rounded-full uppercase font-black">
            Milk Passport
          </Badge>
        </h3>
        {(expiringCount > 0 || expiredCount > 0) && (
          <div className="flex gap-2">
            {expiringCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 border-0 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {expiringCount} expiring soon
              </Badge>
            )}
            {expiredCount > 0 && (
              <Badge className="bg-red-100 text-red-700 border-0 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {expiredCount} expired
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Cold-chain legend */}
      <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-xl">
        <span className="font-body text-[10px] text-muted-foreground uppercase tracking-widest mr-2">Cold Chain:</span>
        {["Collected", "Pasteurized", "Available", "In Transit", "Delivered"].map((status) => {
          const config = getStatusConfig(status);
          const Icon = config.icon;
          return (
            <div key={status} className="flex items-center gap-1">
              <Icon className="w-3 h-3 text-muted-foreground" />
              <span className="font-body text-[10px] text-muted-foreground">{status}</span>
              {status !== "Delivered" && <span className="text-muted-foreground mx-1">→</span>}
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border-2 border-border/50 bg-card overflow-hidden shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">