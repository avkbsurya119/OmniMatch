import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2, Sparkles, Clock, MapPin, CheckCircle, XCircle, Loader2,
  Calendar, Bell, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, getCurrentUserId } from "@/lib/api";
import { toast } from "sonner";

interface NearbyRequest {
  id: string;
  hospital: string;
  city: string;
  quantity: string;
  volume_ml: number;
  urgency: string;
  timeLeft: string;
  distance: string;
  distance_km: number | null;
  pincode_match: boolean;
}

interface PendingMatch {
  id: string;
  request_id: string;
  hospital_name: string;
  hospital_city: string;
  volume_ml: number;
  urgency: string;
  status: string;
  pickup_date?: string;
  pickup_time?: string;
  created_at: string;
}

interface MilkDonorRequestsProps {
  nearbyRequests: NearbyRequest[];
  onRefresh: () => void;
}

export default function MilkDonorRequests({ nearbyRequests, onRefresh }: MilkDonorRequestsProps) {
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [offeringTo, setOfferingTo] = useState<string | null>(null);
  const donorId = getCurrentUserId();

  // Fetch pending matches for this donor
  const fetchMatches = async () => {
    if (!donorId) return;
    try {
      const matches = await api.milk.getDonorMatches(donorId);
      setPendingMatches(matches);
    } catch (e) {
      console.log("Could not fetch donor matches:", e);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [donorId]);

  // Accept or Decline a pending match
  const handleRespondToMatch = async (matchId: string, status: "accepted" | "declined") => {
    if (!donorId) {
      toast.error("Please login to respond");
      return;
    }
    setRespondingTo(matchId);
    try {
      await api.milk.respondToMatch(matchId, { donor_id: donorId, status });
      toast.success(
        status === "accepted"
          ? "You've accepted! The hospital will contact you for pickup."
          : "Request declined. Thank you for considering."
      );
      await fetchMatches();
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || "Failed to respond");
    } finally {
      setRespondingTo(null);
    }
  };

  // Donor clicks "I Can Help" on a nearby request
  const handleOfferHelp = async (request: NearbyRequest) => {
    if (!donorId) {
      toast.error("Please login to offer help");
      return;
    }

    setOfferingTo(request.id);
    try {
      // FIX: Pass donorId directly — backend looks up milk_donor_id internally.
      // We do NOT call getDonorDetail(donorId) because that endpoint expects
      // a milk_donor UUID, not the user's donor UUID.
      await api.milk.createMatch({
        request_id: request.id,
        donor_id: donorId,
        // milk_donor_id is optional; backend will locate it from donor_id
      });
      toast.success(`Offer sent to ${request.hospital}! They'll coordinate pickup with you.`);
      await fetchMatches();
      onRefresh();
    } catch (e: any) {
      if (e.message?.includes("already exists")) {
        toast.info("You've already offered to help with this request.");
      } else {
        toast.error(e.message || "Failed to send offer");
      }
    } finally {
      setOfferingTo(null);
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency?.toUpperCase()) {
      case "CRITICAL": return "bg-blood text-white";
      case "URGENT":   return "bg-amber-500 text-white";
      default:         return "bg-muted text-muted-foreground";
    }
  };

  const getMatchStatusConfig = (status: string) => {
    switch (status) {
      case "pending":          return { badge: "bg-amber-100 text-amber-700",   label: "PENDING" };
      case "accepted":         return { badge: "bg-green-100 text-green-700",   label: "ACCEPTED" };
      case "pickup_scheduled": return { badge: "bg-blue-100 text-blue-700",     label: "PICKUP SCHEDULED" };
      case "collected":        return { badge: "bg-purple-100 text-purple-700", label: "COLLECTED" };
      case "delivered":        return { badge: "bg-secondary/15 text-secondary",label: "DELIVERED" };
      case "declined":         return { badge: "bg-red-100 text-red-700",       label: "DECLINED" };
      default:                 return { badge: "bg-muted text-muted-foreground", label: status?.toUpperCase() };
    }
  };

  const pendingList   = pendingMatches.filter(m => m.status === "pending");
  const activeList    = pendingMatches.filter(m => ["accepted", "pickup_scheduled", "collected"].includes(m.status));
  const completedList = pendingMatches.filter(m => m.status === "delivered");

  return (
    <div className="space-y-8">

      {/* ── Requests Waiting for Your Response ─────────────────────────── */}
      {pendingList.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-bold flex items-center gap-2">
            <Bell className="w-5 h-5 text-blood animate-pulse" />
            Requests Waiting for Your Response
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingList.map((match) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border-2 border-blood/30 bg-blood/5 p-5 shadow-card"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-5 h-5 text-blood" />
                  <h4 className="font-display font-bold flex-1">{match.hospital_name}</h4>
                  <Badge className={`text-[9px] ${getUrgencyBadge(match.urgency)}`}>
                    {match.urgency}
                  </Badge>
                </div>
                <p className="font-body text-sm text-muted-foreground mb-3 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {match.hospital_city}
                </p>
                <p className="font-display text-lg font-bold text-milk mb-4">
                  {match.volume_ml}ml
                  <span className="font-body text-xs text-muted-foreground font-normal ml-1">needed</span>
                </p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-secondary text-white font-bold rounded-xl"
                    onClick={() => handleRespondToMatch(match.id, "accepted")}
                    disabled={respondingTo === match.id}
                  >
                    {respondingTo === match.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <><CheckCircle className="w-4 h-4 mr-1" /> Accept</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 font-bold rounded-xl"
                    onClick={() => handleRespondToMatch(match.id, "declined")}
                    disabled={respondingTo === match.id}
                  >
                    <XCircle className="w-4 h-4 mr-1" /> Decline
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ── Your Active Donations ───────────────────────────────────────── */}
      {activeList.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-secondary" />
            Your Active Donations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeList.map((match) => {
              const cfg = getMatchStatusConfig(match.status);
              return (
                <div
                  key={match.id}
                  className="rounded-2xl border-2 border-secondary/30 bg-secondary/5 p-5 shadow-card"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-secondary" />
                      <h4 className="font-display font-bold">{match.hospital_name}</h4>
                    </div>
                    <Badge className={`text-[9px] ${cfg.badge}`}>{cfg.label}</Badge>
                  </div>

                  {match.status === "pickup_scheduled" && match.pickup_date && (
                    <div className="bg-blue-50 rounded-xl p-3 mb-2">
                      <p className="font-body text-xs text-blue-700 font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Pickup: {match.pickup_date}{match.pickup_time ? ` at ${match.pickup_time}` : ""}
                      </p>
                    </div>
                  )}

                  {match.status === "accepted" && (
                    <p className="font-body text-xs text-muted-foreground italic">
                      Hospital will schedule pickup soon...
                    </p>
                  )}

                  {match.status === "collected" && (
                    <p className="font-body text-xs text-purple-700 font-medium">
                      Your donation has been collected. Thank you!
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Nearby NICU Requests ────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="font-display text-xl font-bold">Nearby NICU Requests</h3>
        {nearbyRequests.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/5">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
            <p className="font-body text-muted-foreground">No urgent requests in your area right now.</p>
            <p className="font-body text-sm text-muted-foreground mt-2">
              We'll notify you when NICUs need your help.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nearbyRequests.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-2xl border-2 border-milk/20 bg-card p-5 shadow-card hover:border-milk/40 transition-all"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-5 h-5 text-milk" />
                  <h4 className="font-display font-bold">{req.hospital}</h4>
                </div>
                <p className="font-body text-sm text-muted-foreground mb-3 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {req.city}
                </p>
                <div className="flex items-center gap-4 mb-4">
                  <div>
                    <p className="font-display text-lg font-bold text-milk">{req.quantity}</p>
                    <p className="font-body text-[10px] text-muted-foreground">needed</p>
                  </div>
                  {req.distance && (
                    <div>
                      <p className="font-display text-lg font-bold">{req.distance}</p>
                      <p className="font-body text-[10px] text-muted-foreground">away</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2 flex-wrap">
                    <Badge className={getUrgencyBadge(req.urgency)}>{req.urgency}</Badge>
                    {req.pincode_match && (
                      <Badge className="bg-green-100 text-green-700 border-0 text-[9px]">
                        Your area
                      </Badge>
                    )}
                  </div>
                  <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {req.timeLeft}
                  </span>
                </div>
                <Button
                  className="w-full bg-milk text-foreground font-bold rounded-xl"
                  onClick={() => handleOfferHelp(req)}
                  disabled={offeringTo === req.id}
                >
                  {offeringTo === req.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "I Can Help"
                  )}
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Donation History ────────────────────────────────────────────── */}
      {completedList.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display text-xl font-bold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-secondary" />
            Your Donation History
          </h3>
          <div className="rounded-2xl border bg-card p-4">
            {completedList.slice(0, 10).map((match) => (
              <div key={match.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-body font-semibold text-sm">{match.hospital_name}</p>
                  <p className="font-body text-xs text-muted-foreground">{match.hospital_city}</p>
                </div>
                <Badge className="bg-secondary/15 text-secondary border-0">Delivered</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}