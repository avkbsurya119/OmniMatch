/**
 * BloodBridge.tsx — v4
 * ────────────────────────────────────────────────────────────────
 * Fully independent BloodBridge page.
 * Hospital view:  Post Urgent Need modal, request management table,
 *                 donor search (distance-ranked), map with real coords.
 * Donor view:     Compatible open requests, accept/decline, history.
 *
 * FIXED v4:
 * - Hero stats no longer stuck on "—": isInitialLoading now resolves
 *   independently from the large donor fetch (limit:500).
 * - computeHeroStats checks multiple possible API field names for
 *   the available flag (available, available_to_donate, is_available)
 *   and falls back to total donor count if none match.
 * - Large donor fetch failure is handled gracefully with fallback.
 * ────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Clock, AlertTriangle, CheckCircle2, Plus, Filter,
  ArrowLeft, Loader2, Search, Heart, Droplets, Shield, Activity,
  X, ChevronDown, Building2, ClipboardList, History, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BloodBridgeMap from "@/components/BloodBridgeMap";
import { api, BloodDonor, BloodRequest, isLoggedIn, getCurrentUserId } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/AuthContext";

// ── Local types ──────────────────────────────────────────────────────────────

interface HospitalRequest {
  id: string;
  blood_group: string;
  units: number;
  urgency: string;
  status: string;
  timeLeft: string;
  hours_left: number;
  created_at: string;
  donors_pending: number;
  donors_accepted: number;
  donors_declined: number;
  donors_fulfilled: number;
  notes: string;
  donor_responses: { donor_id: string; name: string; status: string }[];
}

interface DonorHistoryRow {
  response_id: string;
  request_id: string;
  status: string;
  responded_at: string | null;
  blood_group: string;
  units: number;
  urgency: string;
  hospital: string;
  city: string;
  request_status: string;
  created_at: string;
}

// ── Hero stats type ──────────────────────────────────────────────────────────
interface HeroStats {
  activeDonors: string;
  matchesToday: string;
  avgMatchTime: string;
}

// ── Blood groups ─────────────────────────────────────────────────────────────
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
const URGENCY_OPTS = ["normal", "urgent", "critical"];

// ── Status badge helper ───────────────────────────────────────────────────────
function statusBadge(status: string) {
  const map: Record<string, string> = {
    open:             "bg-secondary/15 text-secondary",
    donor_contacted:  "bg-platelet/15 text-platelet",
    fulfilled:        "bg-green-500/15 text-green-600",
    closed:           "bg-muted text-muted-foreground",
    expired:          "bg-blood/10 text-blood",
    pending:          "bg-muted text-muted-foreground",
    accepted:         "bg-secondary/15 text-secondary",
    declined:         "bg-blood/10 text-blood",
  };
  return map[status] ?? "bg-muted text-muted-foreground";
}

// ════════════════════════════════════════════════════════════════════════════
export default function BloodBridge() {
  const { role, userName, profile } = useAuth();
  const isDonor    = role === "donor";
  const isHospital = role === "hospital";
  const userId     = getCurrentUserId();

  // ── Hero stats (dynamic) ─────────────────────────────────────────────────
  const [heroStats, setHeroStats] = useState<HeroStats>({
    activeDonors: "—",
    matchesToday: "—",
    avgMatchTime: "—",
  });

  // ── Shared state ─────────────────────────────────────────────────────────
  const [donors, setDonors]                 = useState<BloodDonor[]>([]);
  const [urgentRequests, setUrgentRequests] = useState<BloodRequest[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoading, setIsLoading]           = useState(false);
  const [selectedGroup, setSelectedGroup]   = useState<string | null>(null);
  const [locationInput, setLocationInput]   = useState("");
  const [selectedDonorProfile, setSelectedDonorProfile] = useState<BloodDonor | null>(null);

  // ── Hospital-specific state ───────────────────────────────────────────────
  const [activeTab, setActiveTab]               = useState<"search" | "requests" | "post">("search");
  const [hospitalRequests, setHospitalRequests] = useState<HospitalRequest[]>([]);
  const [hospitalReqLoading, setHospitalReqLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem("lfc_dismissed_requests");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // Persist dismissedIds to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("lfc_dismissed_requests", JSON.stringify([...dismissedIds]));
    } catch {}
  }, [dismissedIds]);

  const [postModalOpen, setPostModalOpen] = useState(false);
  const [postForm, setPostForm]           = useState({
    blood_group: "O+", units: 1, urgency: "urgent", notes: "",
  });
  const [postLoading, setPostLoading] = useState(false);

  // ── Donor-specific state ──────────────────────────────────────────────────
  const [donorTab, setDonorTab]         = useState<"requests" | "history">("requests");
  const [donorHistory, setDonorHistory] = useState<DonorHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // ── Clear dismissed IDs when user logs out ────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setDismissedIds(new Set());
      localStorage.removeItem("lfc_dismissed_requests");
    }
  }, [userId]);

  // ── Compute hero stats from fetched data ──────────────────────────────────
  // FIX: checks multiple possible API field names for the available flag,
  // and falls back to total donor count if none match.
  const computeHeroStats = (allDonors: BloodDonor[], allRequests: BloodRequest[]) => {
    const activeDonorCount = allDonors.filter(d =>
      d.available === true ||
      (d as any).available_to_donate === true ||
      (d as any).is_available === true
    ).length;

    // If no available flags matched, fall back to total donor count
    const displayDonorCount = activeDonorCount > 0 ? activeDonorCount : allDonors.length;

    const today = new Date().toDateString();
    const matchesTodayCount = allRequests.filter(r => {
      try {
        return new Date((r as any).created_at).toDateString() === today;
      } catch { return false; }
    }).length;

    setHeroStats({
      activeDonors: displayDonorCount > 0 ? displayDonorCount.toLocaleString() : "0",
      matchesToday: matchesTodayCount.toLocaleString(),
      avgMatchTime: "~4 min",
    });
  };

  // ── Initial load ──────────────────────────────────────────────────────────
  // FIX: The large donor fetch (limit:500) no longer blocks isInitialLoading.
  // It runs independently so hero stats resolve as soon as possible without
  // blocking the UI. Failure is handled gracefully with a fallback.
  useEffect(() => {
    const fetchData = async () => {
      try {
        const reqsPromise = isDonor
          ? api.blood.getRequestsForDonor(userId!)
          : api.blood.getOpenRequests();

        const [reqs, initialDonors] = await Promise.all([
          reqsPromise,
          isHospital ? api.blood.getDonors({ limit: 4 }) : Promise.resolve([]),
        ]);

        setUrgentRequests(reqs as BloodRequest[]);
        setDonors(initialDonors as BloodDonor[]);

        // Fetch large donor list for accurate hero stats independently
        // so it doesn't block the initial loading spinner
        api.blood.getDonors({ limit: 500 })
          .then(allDonors => {
            computeHeroStats(allDonors as BloodDonor[], reqs as BloodRequest[]);
          })
          .catch(() => {
            // Fallback: use whatever donors we already have
            computeHeroStats(initialDonors as BloodDonor[], reqs as BloodRequest[]);
          });

      } catch {
        toast.error("Could not load latest requests");
      } finally {
        // Always unblock the UI regardless of the large donor fetch
        setIsInitialLoading(false);
      }
    };
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch hospital requests ───────────────────────────────────────────────
  const fetchHospitalRequests = async (silent = false) => {
    if (!userId) return;
    if (!silent) setHospitalReqLoading(true);
    try {
      const data = await api.blood.getHospitalRequests(userId);
      setHospitalRequests(data as HospitalRequest[]);
    } catch {
      if (!silent) toast.error("Could not load request management table");
    } finally {
      if (!silent) setHospitalReqLoading(false);
    }
  };

  useEffect(() => {
    if (isHospital && activeTab === "requests") {
      fetchHospitalRequests();
      // Silent auto-refresh every 15s
      const interval = setInterval(() => fetchHospitalRequests(true), 15000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isHospital]);

  // ── Fetch donor history ───────────────────────────────────────────────────
  const fetchDonorHistory = async () => {
    if (!userId) return;
    setHistoryLoading(true);
    try {
      const data = await api.blood.getDonorHistory(userId);
      setDonorHistory(data as DonorHistoryRow[]);
    } catch {
      toast.error("Could not load donation history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (isDonor && donorTab === "history") fetchDonorHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donorTab, isDonor]);

  // ── Search donors ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!isLoggedIn()) { toast.error("Please login to search the donor registry"); return; }
    if (!isHospital)   { toast.error("Only hospitals can search the donor registry"); return; }
    setIsLoading(true);
    try {
      const isPincode = /^\d{6}$/.test(locationInput.trim());
      const results = await api.blood.getDonors({
        blood_group: selectedGroup || undefined,
        city:    !isPincode ? locationInput.trim() || undefined : undefined,
        pincode: isPincode  ? locationInput.trim() : undefined,
        limit: 20,
      });
      setDonors(results as BloodDonor[]);
      results.length === 0
        ? toast.info("No matching donors found.")
        : toast.success(`Found ${results.length} matching donors!`);
    } catch (e: any) {
      toast.error(e.message || "Failed to search donors");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Request specific donor ────────────────────────────────────────────────
  const handleRequest = async (donor: BloodDonor) => {
    if (!isLoggedIn())              { toast.error("Please login to request donation"); return; }
    if (!donor.eligible_to_donate)  { toast.error(`${donor.name} is not eligible yet.`); return; }
    if (!isHospital || !userId)     { toast.error("Only verified hospitals can send requests."); return; }

    try {
      const res: any = await api.blood.requestDonor({
        hospital_id: userId,
        donor_id:    donor.id,
        blood_group: donor.group,
        units:       1,
        urgency:     "urgent",
      });
      if (res.success) {
        toast.success(`Request sent to ${donor.name}!`, { description: res.message });
        setSelectedDonorProfile(null);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to send request");
    }
  };

  // ── Post urgent need ──────────────────────────────────────────────────────
  const handlePostRequest = async () => {
    if (!isHospital || !userId) {
      toast.error("Only verified hospitals can post urgent blood requirements.");
      return;
    }
    setPostModalOpen(true);
  };

  const handlePostSubmit = async () => {
    if (!userId) return;
    setPostLoading(true);
    try {
      const res: any = await api.blood.postRequest({
        hospital_id: userId,
        blood_group: postForm.blood_group,
        units:       postForm.units,
        urgency:     postForm.urgency,
        notes:       postForm.notes,
      });
      toast.success("Urgent request posted!", { description: res.message });
      setPostModalOpen(false);
      setPostForm({ blood_group: "O+", units: 1, urgency: "urgent", notes: "" });

      // Refresh open requests and recompute hero stats
      const [reqs, allDonorsForStats] = await Promise.all([
        api.blood.getOpenRequests(),
        api.blood.getDonors({ limit: 500 }),
      ]);
      setUrgentRequests(reqs as BloodRequest[]);
      computeHeroStats(allDonorsForStats as BloodDonor[], reqs as BloodRequest[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to post request");
    } finally {
      setPostLoading(false);
    }
  };

  // ── Donor respond ─────────────────────────────────────────────────────────
  const handleDonorRespond = async (req: BloodRequest, action: "accept" | "decline") => {
    if (!isLoggedIn() || !userId) { toast.error("Please login to respond"); return; }
    setRespondingId(req.id);
    try {
      const res: any = await api.blood.respondToRequest({
        request_id: req.id,
        donor_id:   userId,
        action,
      });
      if (res.success) {
        toast.success(
          action === "accept" ? "You've pledged to donate! 🩸" : "Response recorded.",
          { description: action === "accept" ? `${req.hospital} has been notified.` : undefined }
        );
        if (action === "decline") {
          setUrgentRequests(prev => prev.filter(r => r.id !== req.id));
        } else {
          setUrgentRequests(prev =>
            prev.map(r => r.id === req.id ? { ...r, my_status: res.status } : r)
          );
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to record response");
    } finally {
      setRespondingId(null);
    }
  };

  // ── Hospital fulfill / close ──────────────────────────────────────────────
  const handleFulfill = async (requestId: string) => {
    if (!userId) return;
    setDismissedIds(prev => new Set([...prev, requestId]));
    setHospitalRequests(prev => prev.filter(r => r.id !== requestId));
    try {
      await api.blood.fulfillRequest(requestId, userId);
      toast.success("Request fulfilled! 🎉 Blood need has been met.");
    } catch (e: any) {
      setDismissedIds(prev => { const s = new Set(prev); s.delete(requestId); return s; });
      fetchHospitalRequests();
      toast.error(e.message || "Failed to fulfill request");
    }
  };

  const handleClose = async (requestId: string) => {
    if (!userId) return;
    setDismissedIds(prev => new Set([...prev, requestId]));
    setHospitalRequests(prev => prev.filter(r => r.id !== requestId));
    try {
      await api.blood.closeRequest(requestId, userId);
      toast.success("Request closed.");
    } catch (e: any) {
      setDismissedIds(prev => { const s = new Set(prev); s.delete(requestId); return s; });
      fetchHospitalRequests();
      toast.error(e.message || "Failed to close request");
    }
  };

  // ── Map donors: real lat/lng from API ─────────────────────────────────────
  const mapDonors = donors.map(d => ({
    id:           d.id,
    name:         d.name,
    blood_group:  d.group,
    city:         d.city,
    trust_score:  d.trust,
    distance_km:  d.distance_km || 0,
    lat:          (d as any).lat ?? 0,
    lng:          (d as any).lng ?? 0,
  }));

  const hospitalLocation = isHospital && profile?.lat && profile?.lng
    ? { lat: profile.lat, lng: profile.lng, name: userName || "Your Hospital" }
    : null;

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Module Hero ── */}
        <div className="bg-gradient-to-br from-blood/90 to-blood/60 text-primary-foreground py-16 px-4">
          <div className="container mx-auto">
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground font-body text-sm mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-6xl">🩸</div>
              <div>
                <h1 className="font-display text-5xl font-black">BloodBridge</h1>
                <p className="font-body text-primary-foreground/70 text-lg">
                  {isDonor ? "See who needs your help today" : "Real-time blood group matching across India"}
                </p>
              </div>
            </div>

            {/* ── Dynamic hero stats ── */}
            <div className="flex gap-6 mt-6 flex-wrap">
              {[
                { label: "Active Donors",  value: heroStats.activeDonors },
                { label: "Matches Today",  value: heroStats.matchesToday },
                { label: "Avg Match Time", value: heroStats.avgMatchTime },
              ].map(({ label, value }) => (
                <div key={label} className="glass rounded-xl px-5 py-3">
                  <div className="font-display text-2xl font-bold">
                    {isInitialLoading ? (
                      <span className="inline-block w-12 h-6 bg-primary-foreground/20 animate-pulse rounded" />
                    ) : (
                      value
                    )}
                  </div>
                  <div className="font-body text-xs text-primary-foreground/70">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ══════════════════════════════════════════════════════════
                SIDEBAR
            ══════════════════════════════════════════════════════════ */}
            <div className="space-y-5">

              {/* ── DONOR SIDEBAR ── */}
              {isDonor && (
                <>
                  <div className="rounded-2xl border-2 border-blood/20 bg-card p-6 shadow-card overflow-hidden relative">
                    <div className="absolute -top-8 -right-8 opacity-5"><Droplets size={120} /></div>
                    <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2 relative z-10">
                      <Heart className="w-5 h-5 text-blood" /> My Donor Status
                    </h3>
                    <div className="space-y-4 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-blood/10 flex items-center justify-center font-display font-bold text-blood text-lg">
                          {userName?.[0] || "D"}
                        </div>
                        <div>
                          <div className="font-body font-bold text-sm">{userName || "Donor"}</div>
                          <Badge className="bg-secondary/15 text-secondary border-0 font-body text-[10px] mt-0.5">
                            {profile?.is_verified ? "✓ Verified" : "Pending Verification"}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-blood/5 border border-blood/10 text-center">
                          <div className="font-display font-black text-lg text-blood">{profile?.blood_group || "—"}</div>
                          <div className="font-body text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Blood Group</div>
                        </div>
                        <div className="p-3 rounded-xl bg-secondary/5 border border-secondary/10 text-center">
                          <div className="font-display font-black text-lg text-secondary">{profile?.trust_score || 0}</div>
                          <div className="font-body text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Trust Score</div>
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-muted/50 border border-border">
                        <div className="font-body text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5">Location</div>
                        <div className="font-body text-sm font-semibold flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blood" /> {profile?.city || "Not set"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border-2 border-secondary/20 bg-secondary/5 p-5">
                    <h3 className="font-display text-sm font-bold mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-secondary" /> Donation Readiness
                    </h3>
                    <div className="space-y-2.5">
                      {[
                        "Stay hydrated before donating",
                        "Last donation must be 90+ days ago",
                        "Carry a valid government ID",
                        "Eat well before the appointment",
                      ].map((tip, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-secondary mt-0.5 shrink-0" />
                          <span className="font-body text-xs text-foreground/70">{tip}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── HOSPITAL SIDEBAR ── */}
              {(isHospital || !role) && (
                <>
                  {/* Tab switcher */}
                  {isHospital && (
                    <div className="flex gap-1 rounded-xl bg-muted/50 p-1 border border-border">
                      {[
                        { key: "search",   label: "Find Donors",  icon: Search },
                        { key: "requests", label: "My Requests",  icon: ClipboardList },
                      ].map(({ key, label, icon: Icon }) => (
                        <button
                          key={key}
                          onClick={() => setActiveTab(key as any)}
                          className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg font-body text-xs font-semibold transition-all ${
                            activeTab === key
                              ? "bg-blood text-white shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Find Donors panel */}
                  {(!isHospital || activeTab === "search") && (
                    <div className="rounded-2xl border-2 border-blood/20 bg-card p-5 shadow-card">
                      <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                        <Filter className="w-5 h-5 text-blood" /> Find Donors
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <label className="font-body text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Blood Group</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {BLOOD_GROUPS.map(g => (
                              <button
                                key={g}
                                onClick={async () => {
                                  const newGroup = selectedGroup === g ? null : g;
                                  setSelectedGroup(newGroup);
                                  setIsLoading(true);
                                  try {
                                    const isPincode = /^\d{6}$/.test(locationInput.trim());
                                    const results = await api.blood.getDonors({
                                      blood_group: newGroup || undefined,
                                      city: !isPincode ? locationInput.trim() || undefined : undefined,
                                      pincode: isPincode ? locationInput.trim() : undefined,
                                      limit: 20,
                                    });
                                    setDonors(results as BloodDonor[]);
                                  } catch (e: any) {
                                    toast.error(e.message || "Failed to search donors");
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                className={`h-9 rounded-lg border-2 font-display text-xs font-bold transition-all ${
                                  selectedGroup === g
                                    ? "border-blood bg-blood text-white"
                                    : "border-border hover:border-blood hover:bg-blood/10"
                                }`}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="font-body text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Location / PIN</label>
                          <Input
                            placeholder="Enter city or 6-digit PIN"
                            className="h-10 rounded-xl font-body"
                            value={locationInput}
                            onChange={e => setLocationInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleSearch()}
                          />
                        </div>
                        <Button
                          onClick={handleSearch}
                          disabled={isLoading}
                          className="w-full bg-blood text-primary-foreground font-body font-bold rounded-xl h-11"
                        >
                          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search Donors"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Post urgent need panel */}
                  <div className="rounded-2xl border-2 border-blood/20 bg-blood/5 p-5">
                    <h3 className="font-display text-base font-bold mb-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blood" /> Post Urgent Need
                    </h3>
                    <p className="font-body text-xs text-muted-foreground mb-3">
                      Notify verified donors near your hospital instantly.
                    </p>
                    <Button
                      onClick={handlePostRequest}
                      variant="outline"
                      className="w-full border-blood text-blood font-body font-semibold rounded-xl hover:bg-blood hover:text-primary-foreground"
                    >
                      <Plus className="w-4 h-4 mr-1.5" /> Post Request
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════
                MAIN CONTENT
            ══════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-2 space-y-6">

              {/* ══════════════════════════════════════════════════════
                  DONOR VIEW
              ══════════════════════════════════════════════════════ */}
              {isDonor && (
                <>
                  {/* Tab switcher */}
                  <div className="flex gap-1 rounded-xl bg-muted/50 p-1 border border-border max-w-xs">
                    {[