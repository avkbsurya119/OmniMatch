import { motion } from "framer-motion";
import { AlertTriangle, Clock, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MilkShortageAlert } from "@/lib/api";

interface MilkShortageBoardProps {
  alerts: MilkShortageAlert[];
  isLoading: boolean;
  role: string;
  onPostShortage?: () => void;
  onFindMatches?: (alert: MilkShortageAlert) => void;
  onRespond?: (alert: MilkShortageAlert) => void;
}

export default function MilkShortageBoard({
  alerts,
  isLoading,
  role,
  onPostShortage,
  onFindMatches,
  onRespond,
}: MilkShortageBoardProps) {
  const criticalCount = alerts.filter(
    (a) => (a.urgency ?? "").toUpperCase() === "CRITICAL"
  ).length;

  const normalizedUrgency = (urgency?: string) =>
    (urgency ?? "NORMAL").toUpperCase();

  const getUrgencyColor = (urgency?: string) => {
    switch (normalizedUrgency(urgency)) {
      case "CRITICAL":
        return "border-blood/40 bg-blood/10";
      case "URGENT":
        return "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20";
      default:
        return "border-border/40 bg-muted/10";
    }
  };

  const getUrgencyBadge = (urgency?: string) => {
    switch (normalizedUrgency(urgency)) {
      case "CRITICAL":
        return "bg-blood text-white";
      case "URGENT":
        return "bg-amber-500 text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const isHospital = role === "hospital";
  const isDonor = role === "donor";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          Critical Shortages
          {criticalCount > 0 && (
            <Badge className="ml-2 bg-blood/20 text-blood border-0">
              {criticalCount}
            </Badge>
          )}
        </h3>

        {/* ── Only hospitals can post shortage alerts ── */}
        {isHospital && onPostShortage && (
          <button
            onClick={onPostShortage}
            className="text-[10px] font-bold text-blood hover:underline uppercase tracking-tighter"
          >
            + Post Need
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-8 text-center bg-muted/20 rounded-2xl">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-blood/50" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="p-6 text-center bg-secondary/5 border-2 border-dashed border-secondary/20 rounded-2xl">
          <Sparkles className="w-5 h-5 text-secondary mx-auto mb-2" />
          <p className="font-body text-xs text-muted-foreground">
            Stock levels stable across India.
          </p>
        </div>
      ) : (
        alerts.slice(0, 5).map((alert) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`rounded-2xl border-2 p-5 shadow-sm ${getUrgencyColor(alert.urgency)}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle
                className={`w-4 h-4 ${
                  normalizedUrgency(alert.urgency) === "CRITICAL"
                    ? "text-blood animate-pulse"