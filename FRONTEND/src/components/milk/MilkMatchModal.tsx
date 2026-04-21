import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Users, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, MilkShortageAlert } from "@/lib/api";
import { toast } from "sonner";

interface MilkMatch {
  milk_donor_id: string;
  donor_id: string;
  name: string;
  city: string;
  quantity_ml: number;
  distance_km: number | null;
  distance: string;
  match_score: number;
  verified: boolean;
  pincode_match: boolean;
}

interface MilkMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: MilkShortageAlert | null;
  matches: MilkMatch[];
  isLoading: boolean;
  onMatchCreated?: () => void;
}

export default function MilkMatchModal({
  isOpen,
  onClose,
  request,
  matches,
  isLoading,
  onMatchCreated,
}: MilkMatchModalProps) {
  const handleCreateMatch = async (match: MilkMatch) => {
    if (!request) return;

    try {
      await api.milk.createMatch({
        request_id: request.id,
        donor_id: match.donor_id,
        milk_donor_id: match.milk_donor_id
      });
      toast.success(`Match request sent to ${match.name}!`);
      onMatchCreated?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to create match");
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-2xl bg-card rounded-3xl border-2 border-milk/20 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
          >
            <div className="bg-milk p-6 flex justify-between items-center">
              <div>
                <h3 className="font-display text-xl font-bold">Matched Donors</h3>
                <p className="text-foreground/70 text-xs font-body">
                  {request?.hospital} - {request?.quantity_needed}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-milk mb-4" />
                  <p className="text-muted-foreground">Finding compatible donors...</p>
                </div>
              ) : matches.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />