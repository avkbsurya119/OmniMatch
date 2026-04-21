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
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {["Passport ID", "Donor", "Pasteurized", "Expiry", "Qty", "Cold Chain Status", "Track"].map((h) => (
                  <th key={h} className="font-display text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-6 py-4 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 font-body text-xs text-muted-foreground">
                    Loading log entries...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 font-body text-xs text-muted-foreground italic">
                    No milk shipments currently in processing.
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const statusConfig = getStatusConfig(row.status);
                  const StatusIcon = statusConfig.icon;
                  const isUrgent = row.status === "Expiring Soon" || row.status === "Low Stock" || row.status === "Expired";

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 hover:bg-milk/5 transition-colors group ${
                        isUrgent ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <td className="font-body text-xs font-bold px-6 py-4 text-milk group-hover:underline cursor-pointer">
                        {row.id}
                      </td>
                      <td className="font-body text-sm font-semibold px-6 py-4">{row.from}</td>
                      <td className="font-body text-xs px-6 py-4 text-muted-foreground">{row.pasteurized}</td>
                      <td className={`font-body text-xs px-6 py-4 ${isUrgent ? "text-amber-700 font-semibold" : "text-muted-foreground"}`}>
                        {row.expiry}
                        {isUrgent && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                      </td>
                      <td className="font-body text-sm font-black px-6 py-4 text-foreground/80">{row.qty}</td>
                      <td className="px-6 py-4">
                        <Badge className={`text-[9px] uppercase px-2 py-0.5 border-0 font-bold flex items-center gap-1 w-fit ${statusConfig.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {row.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => onViewPassport(row.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-muted group-hover:bg-milk/20 group-hover:text-milk transition-all"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
          <Shield className="w-4 h-4" />
        </div>
        <p className="font-body text-[11px] text-orange-900 leading-tight">
          Each sample in MilkBridge is tracked via <strong>Milk Passport</strong> with full cold-chain visibility.
          We guarantee rigorous pasteurization protocols following WHO guidelines.
        </p>
      </div>
    </div>
  );
}
