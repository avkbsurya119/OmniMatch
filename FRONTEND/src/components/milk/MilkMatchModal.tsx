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
                  <p className="text-muted-foreground">No matching donors found in this area.</p>
                  <p className="text-sm text-muted-foreground mt-2">Try expanding your search radius.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {matches.map((match) => (
                    <div key={match.milk_donor_id} className="rounded-xl border p-4 hover:border-milk/40 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-milk/10 flex items-center justify-center text-2xl">
                            🤱
                          </div>
                          <div>
                            <p className="font-display font-bold flex items-center gap-2">
                              {match.name}
                              {match.verified && <Sparkles size={14} className="text-amber-500" />}
                            </p>
                            <p className="font-body text-xs text-muted-foreground">
                              {match.city} - {match.distance || "Same area"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-lg font-bold text-milk">{match.quantity_ml}ml</div>
                          <div className="font-body text-[10px] text-muted-foreground">daily</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex gap-2">
                          <Badge className="bg-secondary/10 text-secondary border-0 text-[10px]">
                            {match.match_score}% match
                          </Badge>
                          {match.pincode_match && (
                            <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">
                              Same pincode
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="bg-milk text-foreground font-bold rounded-lg"
                          onClick={() => handleCreateMatch(match)}
                        >
                          Request
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
