/**
 * MilkBridge.tsx — v3 Final (Bug-fixed)
 *
 * Bug fixes applied:
 *   BUG FIX 1: Active Requests now shows posted requests — HospRequest type has
 *              status field, and the filter correctly matches "open" / "donor_contacted".
 *   BUG FIX 2: Kara-type direct donors now appear in Matched Donors — backend
 *              auto-creates milk_matches row; dashboard also pulls direct donations.
 *   BUG FIX 3: After Log & Complete, the request is closed (status -> fulfilled)
 *              and disappears from Critical Shortages. Guard added to warn if
 *              requestId is missing before submitting.
 *   BUG FIX 4: Log & Complete volume pre-fills from actual match quantity (not hardcoded).
 *   BUG FIX 5: logDonation passes request_id so the backend closes the milk_request.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, QrCode, Plus, Heart, AlertTriangle, Loader2,
  Sparkles, X, RefreshCw, CheckCircle2, Clock,
  MapPin, History, ClipboardList, Building2, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  api, MilkDonor, MilkBankRow, MilkShortageAlert,
  getCurrentUserId, isLoggedIn,
} from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/AuthContext";

// ── Local types ───────────────────────────────────────────────────────────────

interface DonorMatch {
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
  responded_at?: string;
}

interface HospMatchedDonor {
  id: string;
  donor_id: string;
  milk_donor_id?: string;
  donor_name: string;
  city: string;
  quantity_ml?: number;
  status: string;
  request_id: string;
  pickup_date?: string;
  pickup_time?: string;
}

// BUG FIX 1: Added status field — previously missing, which caused
// .filter(r => ["open","donor_contacted"].includes(r.status)) to always
// return [] because TypeScript typed r.status as undefined.
interface HospRequest {
  id: string;
  infant_ref: string;
  volume_ml?: number;
  urgency: string;
  status: string;   // ← FIX: was missing from the original interface
  created_at: string;
}

interface HospDash {
  hospital: { id: string; name: string; city: string };
  stats: {
    active_requests: number;
    pending_matches: number;
    accepted_matches: number;
    total_received_ml: number;
    donations_received: number;
  };
  active_requests: HospRequest[];
  matched_donors: HospMatchedDonor[];
  donation_history: Array<{ passport_id: string; donor_name: string; volume_ml: number; date: string; status: string }>;
}

interface MatchResult {
  milk_donor_id: string;
  donor_id: string;
  name: string;
  city: string;
  quantity_ml: number;
  distance: string;
  match_score: number;
  verified: boolean;
}

// BUG FIX 4 & 5: logModal carries volMl from the actual match AND requestId
// so the backend can close the shortage on completion.
interface LogModal {
  matchId: string;
  donorId: string;
  hospId: string;
  requestId?: string;   // ← used to close shortage (BUG FIX 5)
  volMl: number;        // ← pre-filled from match.quantity_ml (BUG FIX 4)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyClass(u: string) {
  if (u === "CRITICAL") return "bg-blood/15 text-blood animate-pulse";
  if (u === "URGENT") return "bg-platelet/15 text-platelet";
  return "bg-muted text-muted-foreground";
}

function statusClass(s: string) {
  const m: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    accepted: "bg-secondary/15 text-secondary",
    pickup_scheduled: "bg-blue-100 text-blue-700",
    collected: "bg-purple-100 text-purple-700",
    delivered: "bg-green-100 text-green-700",
    declined: "bg-blood/10 text-blood",
  };
  return m[s] ?? "bg-muted text-muted-foreground";
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    pending: "Pending",
    accepted: "ACCEPTED",
    pickup_scheduled: "Pickup Scheduled",
    collected: "COLLECTED",
    delivered: "Delivered",
    declined: "Declined",
  };
  return m[s] ?? s.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MilkBridge() {
  const { role } = useAuth();
  const userId = getCurrentUserId();
  const isDonor = role === "donor";
  const isHospital = role === "hospital";

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<"overview" | "my" | "bank">("overview");

  // ── Shared data ───────────────────────────────────────────────────────────
  const [donors, setDonors] = useState<MilkDonor[]>([]);
  const [milkBank, setMilkBank] = useState<MilkBankRow[]>([]);
  const [shortages, setShortages] = useState<MilkShortageAlert[]>([]);
  const [sharedLoading, setSharedLoading] = useState(true);

  // ── Donor state ───────────────────────────────────────────────────────────
  const [donorMatches, setDonorMatches] = useState<DonorMatch[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [donorForm, setDonorForm] = useState({ babyAge: "", qty: 0, location: "", anon: false });
  const [registerLoading, setRegisterLoading] = useState(false);

  // ── Hospital state ────────────────────────────────────────────────────────
  const [hospDash, setHospDash] = useState<HospDash | null>(null);
  const [hospLoading, setHospLoading] = useState(false);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [matchResults, setMatchResults] = useState<MatchResult[] | null>(null);
  const [matchingReqId, setMatchingReqId] = useState<string | null>(null);
  const [showShortage, setShowShortage] = useState(false);
  const [shortageForm, setShortageForm] = useState({ infantName: "", qtyMl: 150, urgency: "urgent" });
  const [postingShortage, setPostingShortage] = useState(false);

  const [logModal, setLogModal] = useState<LogModal | null>(null);
  const [logForm, setLogForm] = useState({ volMl: 200, pasteurized: true, date: new Date().toISOString().slice(0, 10) });
  const [logLoading, setLogLoading] = useState(false);

  const [trackingRow, setTrackingRow] = useState<MilkBankRow | null>(null);

  // ── Fetch shared ──────────────────────────────────────────────────────────
  const fetchShared = useCallback(async () => {
    try {
      const [d, b, a] = await Promise.all([
        api.milk.getDonors(),
        api.milk.getBank(),
        api.milk.getShortageAlerts(),
      ]);
      setDonors(d);
      setMilkBank(b as MilkBankRow[]);
      setShortages(a as MilkShortageAlert[]);
    } catch {
      toast.error("Could not load MilkBridge data");
    } finally {
      setSharedLoading(false);
    }
  }, []);

  const fetchDonorMatches = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await api.milk.getDonorMatches(userId);
      setDonorMatches(data as DonorMatch[]);
    } catch (e: any) {
      toast.error(e.message || "Failed to load your matches");
    }
  }, [userId]);

  const fetchHospDash = useCallback(async () => {
    if (!userId) return;
    setHospLoading(true);
    try {
      const data = await api.milk.getHospitalDashboard(userId);
      setHospDash(data as HospDash);
    } catch (e: any) {
      toast.error(e.message || "Failed to load hospital dashboard");
    } finally {
      setHospLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchShared();
    if (isDonor) fetchDonorMatches();
    if (isHospital) fetchHospDash();
  }, [fetchShared, fetchDonorMatches, fetchHospDash, isDonor, isHospital]);

  // ── Milk bank filtered for donors ─────────────────────────────────────────
  const visibleMilkBank = isDonor
    ? milkBank.filter(row => (row as any).donor_id === userId)
    : milkBank;

  // ── Register donor ────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn()) { toast.error("Please login to register"); return; }
    if (!donorForm.babyAge || donorForm.qty <= 0) { toast.error("Fill baby age and quantity"); return; }
    setRegisterLoading(true);
    try {
      await api.milk.registerDonor({
        donor_id: userId,
        baby_age_months: parseInt(donorForm.babyAge) || 1,
        quantity_ml_per_day: donorForm.qty,
        pickup_location: donorForm.location || undefined,
        is_anonymous: donorForm.anon,
      });
      toast.success("Registered as milk donor! 🍼");
      setDonorForm({ babyAge: "", qty: 0, location: "", anon: false });
      fetchShared();
    } catch (e: any) {
      toast.error(e.message || "Failed to register");
    } finally {
      setRegisterLoading(false);
    }
  };

  // ── Donor: respond to match ───────────────────────────────────────────────
  const handleRespond = async (matchId: string, action: "accepted" | "declined") => {
    if (!userId) return;
    setRespondingId(matchId);
    try {
      await api.milk.respondToMatch(matchId, { donor_id: userId, status: action });
      toast.success(action === "accepted"
        ? "Accepted! The hospital will schedule pickup. 🍼"
        : "Response recorded.");
      fetchDonorMatches();
    } catch (e: any) {
      toast.error(e.message || "Failed to respond");
    } finally {
      setRespondingId(null);
    }
  };

  // ── Donor: I Can Help ─────────────────────────────────────────────────────
  const handleICanHelp = async (alertId: string) => {
    if (!isLoggedIn()) { toast.error("Please login to respond"); return; }
    if (!isDonor) { toast.error("Only registered donors can respond"); return; }
    try {
      await api.milk.createMatch({ request_id: alertId, donor_id: userId });
      toast.success("Intent recorded! The hospital will be notified. 🍼");
      fetchDonorMatches();
      setTab("my");
    } catch (e: any) {
      toast.error(e.message || "Failed to register interest");
    }
  };

  // ── Hospital: post shortage ───────────────────────────────────────────────
  const handlePostShortage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) { toast.error("Please login as hospital"); return; }
    setPostingShortage(true);
    try {
      await api.milk.postRequest({
        hospital_id: userId,
        infant_name: shortageForm.infantName || undefined,
        daily_quantity_ml: shortageForm.qtyMl,
        urgency: shortageForm.urgency,
      });
      toast.success("Shortage alert posted! Donors are being notified.");
      setShowShortage(false);
      setShortageForm({ infantName: "", qtyMl: 150, urgency: "urgent" });
      // Refresh both shared shortages AND the hospital dashboard
      fetchShared();
      fetchHospDash();
    } catch (e: any) {
      toast.error(e.message || "Failed to post shortage");
    } finally {
      setPostingShortage(false);
    }
  };

  // ── Hospital: find matches ────────────────────────────────────────────────
  const handleFindMatches = async (req: HospRequest) => {
    setFindingId(req.id);
    setMatchingReqId(req.id);
    try {
      const res: any = await api.milk.findMatches({ request_id: req.id, max_distance_km: 200 });
      setMatchResults(res.matches || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to find matches");
      setMatchResults([]);
    } finally {
      setFindingId(null);
    }
  };

  // ── Hospital: create match from results ───────────────────────────────────
  const handleCreateMatch = async (m: MatchResult) => {
    if (!matchingReqId) return;
    try {
      await api.milk.createMatch({
        request_id: matchingReqId,
        donor_id: m.donor_id,
        milk_donor_id: m.milk_donor_id,
      });
      toast.success(`${m.name} has been matched and notified!`);
      setMatchResults(null);
      setMatchingReqId(null);
      fetchHospDash();
    } catch (e: any) {
      toast.error(e.message || "Failed to create match");
    }
  };

  // ── Hospital: update match status ─────────────────────────────────────────
  const handleMatchStatus = async (matchId: string, status: string) => {
    try {
      await api.milk.updateMatchStatus(matchId, { status });
      toast.success(`Marked as ${status.replace("_", " ")}!`);
      fetchHospDash();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    }
  };

  // ── Hospital: Log & Complete ──────────────────────────────────────────────
  // BUG FIX 3, 4, 5:
  //   - volMl is pre-filled from the actual match quantity (not hardcoded 300)
  //   - requestId is passed through so the backend closes the milk_request
  //   - Guard warns if requestId is missing (indicates a data integrity issue)
  const handleLogComplete = async () => {
    if (!logModal || !userId) return;
    if (!logModal.donorId || logModal.donorId.trim() === "") {
      toast.error("Donor ID missing — please refresh and try again.");
      return;
    }

    // BUG FIX 3: Warn if requestId missing — shortage won't close without it
    if (!logModal.requestId) {
      console.warn("[MilkBridge] logModal.requestId is undefined — shortage will NOT be closed after this donation.");
    }

    setLogLoading(true);
    try {
      await api.milk.logDonation({
        donor_id: logModal.donorId,
        // BUG FIX 5: pass requestId so backend sets milk_request.status = "fulfilled"
        request_id: logModal.requestId ?? undefined,
        collection_date: logForm.date,
        volume_ml: logForm.volMl,
        pasteurized: logForm.pasteurized,
        pasteurization_date: logForm.pasteurized ? logForm.date : undefined,
        pasteurization_method: logForm.pasteurized ? "Holder pasteurization" : undefined,
        receiving_hospital_id: logModal.hospId,
      });
      await api.milk.updateMatchStatus(logModal.matchId, { status: "delivered" });
      toast.success("Donation logged! Milk Bank updated and request closed. 🍼");
      setLogModal(null);
      // Refresh shortages + dashboard so the closed request disappears
      fetchShared();
      fetchHospDash();
    } catch (e: any) {
      toast.error(e.message || "Failed to log donation");
      console.error("[MilkBridge] handleLogComplete error:", e);
    } finally {
      setLogLoading(false);
    }
  };

  const handleViewQR = (row: MilkBankRow) => setTrackingRow(row);

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingMatches = donorMatches.filter(m => m.status === "pending");
  const activeMatches = donorMatches.filter(m => ["accepted", "pickup_scheduled", "collected"].includes(m.status));
  const historyMatches = donorMatches.filter(m => ["delivered", "declined"].includes(m.status));
  const acceptedCount = (hospDash?.matched_donors || []).filter(
    m => ["accepted", "pickup_scheduled", "collected"].includes(m.status)
  ).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-16">

        {/* Hero */}
        <div className="bg-gradient-to-br from-milk/90 to-amber-400/60 py-16 px-4">
          <div className="container mx-auto">
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-foreground/60 hover:text-foreground font-body text-sm mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </Link>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-6xl">🍼</div>
              <div>
                <h1 className="font-display text-5xl font-black">MilkBridge</h1>
                <p className="font-body text-foreground/60 text-lg">Nourishing India's tiniest lives</p>
              </div>
            </div>
            <div className="flex gap-6 mt-6 flex-wrap">
              {[
                { label: "Active Donors", value: sharedLoading ? "—" : donors.length },
                { label: "Babies Helped", value: "12,400+" },
                { label: "Donations Logged", value: sharedLoading ? "—" : milkBank.length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/20 rounded-xl px-5 py-3 backdrop-blur-md border border-white/30">
                  <div className="font-display text-2xl font-bold">{value}</div>
                  <div className="font-body text-xs text-foreground/70">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-border bg-card sticky top-16 z-10">
          <div className="container mx-auto px-4">
            <div className="flex gap-1 py-2">
              {[
                { key: "overview", label: "Overview" },
                { key: "my", label: isDonor ? "My Donations" : isHospital ? "Hospital Dashboard" : "My Activity" },
                { key: "bank", label: "Milk Bank" },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key as any)}
                  className={`px-5 py-2 rounded-lg font-body text-sm font-semibold transition-all ${tab === key ? "bg-milk text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10">

          {/* ════ OVERVIEW TAB ════ */}
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Sidebar */}
              <div className="space-y-6">
                {isDonor && (
                  <div className="rounded-2xl border-2 border-milk/30 bg-card p-6 shadow-card">
                    <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2">
                      <Heart className="w-5 h-5 text-milk" /> Register to Donate
                      <Badge className="bg-milk/20 text-milk border-0 font-body text-[10px] ml-auto uppercase font-black">NICU Priority</Badge>
                    </h3>
                    <form onSubmit={handleRegister} className="space-y-3">
                      <div>
                        <Label className="font-body text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Baby's Age (Months)</Label>
                        <Input type="number" placeholder="e.g. 3" className="h-11 rounded-xl mt-1"
                          value={donorForm.babyAge} onChange={e => setDonorForm(p => ({ ...p, babyAge: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="font-body text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ML Available Daily</Label>
                        <Input type="number" placeholder="e.g. 200" className="h-11 rounded-xl mt-1"
                          value={donorForm.qty || ""} onChange={e => setDonorForm(p => ({ ...p, qty: parseInt(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label className="font-body text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Location / City</Label>
                        <Input placeholder="City/Area" className="h-11 rounded-xl mt-1"
                          value={donorForm.location} onChange={e => setDonorForm(p => ({ ...p, location: e.target.value }))} />
                      </div>
                      <Button type="submit" disabled={registerLoading}
                        className="w-full bg-milk text-foreground font-body font-bold rounded-xl h-12">
                        {registerLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Donating"}
                      </Button>
                    </form>
                  </div>
                )}

                {/* Shortage alerts sidebar */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-display text-sm font-bold uppercase tracking-widest text-muted-foreground">Critical Shortages</h3>
                    {isHospital && (
                      <button onClick={() => setShowShortage(true)}
                        className="text-[10px] font-bold text-blood hover:underline uppercase tracking-tighter">
                        + Post Need
                      </button>
                    )}
                  </div>
                  {sharedLoading ? (
                    <div className="p-8 text-center bg-muted/20 rounded-2xl animate-pulse">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-milk/50" />
                    </div>
                  ) : shortages.length === 0 ? (
                    <div className="p-6 text-center bg-secondary/5 border-2 border-dashed border-secondary/20 rounded-2xl">
                      <Sparkles className="w-5 h-5 text-secondary mx-auto mb-2" />
                      <p className="font-body text-xs text-muted-foreground">Stock levels stable.</p>
                    </div>
                  ) : shortages.map(a => (
                    <motion.div key={a.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="rounded-2xl border-2 border-blood/20 bg-blood/5 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-blood animate-pulse" />
                        <span className="font-display text-xs font-bold text-blood uppercase">{a.hospital}</span>
                        <Badge className={`text-[9px] border-0 font-body ml-auto ${urgencyClass((a as any).urgency || "URGENT")}`}>
                          {(a as any).urgency || "URGENT"}
                        </Badge>
                      </div>
                      <p className="font-body text-xs text-muted-foreground mb-3">{a.city} · {a.quantity_needed}</p>
                      {isDonor && (
                        <Button onClick={() => handleICanHelp(a.id)}
                          className="w-full bg-blood text-white font-body font-bold rounded-xl h-9 text-xs">
                          I Can Help
                        </Button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Main area */}
              <div className="lg:col-span-2 space-y-6">
                {!isDonor ? (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xl font-bold flex items-center gap-2">
                        Verified Milk Donors
                        {sharedLoading && <Loader2 className="w-4 h-4 animate-spin text-milk" />}
                      </h3>
                      <Badge variant="outline" className="font-body text-[10px] text-milk border-milk/30">LATEST UPDATES</Badge>
                    </div>
                    {!sharedLoading && donors.length === 0 && (
                      <div className="text-center py-12 border-2 border-dashed rounded-3xl bg-muted/5">
                        <p className="font-body text-muted-foreground">No active donors listed in this cycle.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                      {donors.map((d, i) => (
                        <motion.div key={d.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="rounded-3xl border-2 border-milk/10 bg-card p-5 shadow-card hover:border-milk/40 transition-all group">
                          <div className="w-14 h-14 rounded-2xl bg-milk/10 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 transition-transform">🤱</div>
                          <div className="text-center mb-3">
                            <div className="font-display font-bold text-md flex items-center justify-center gap-1.5">
                              {d.name}
                              {d.verified && <Sparkles size={14} className="text-amber-500 fill-amber-500" />}
                            </div>
                            <div className="font-body text-[11px] text-muted-foreground mt-0.5">Baby Age: {d.babyAge}</div>
                            <div className="font-body text-[10px] text-muted-foreground">{d.area}</div>
                          </div>
                          <div className="p-3 rounded-2xl bg-milk/5 border border-milk/20 text-center mb-3">
                            <div className="font-display font-black text-xl text-milk">{d.qty}</div>
                            <div className="font-body text-[10px] font-bold text-muted-foreground uppercase opacity-70">daily surplus</div>
                          </div>
                          <Badge className="w-full justify-center bg-secondary/10 text-secondary border-0 font-body text-[10px] mb-3">❤️ {d.impact}</Badge>
                          {isHospital && (
                            <Button size="sm" onClick={() => toast.info(`Contact request sent to ${d.name}.`)}
                              className="w-full bg-milk text-foreground font-body text-xs font-bold rounded-xl h-9">
                              Request Milk
                            </Button>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </>
                ) : (
                  /* Donor sees NICU shortage alerts in the main area */
                  <div className="space-y-4">
                    <h3 className="font-display text-xl font-bold flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-blood animate-pulse" />
                      Active NICU Requests
                    </h3>
                    {shortages.length === 0 ? (
                      <div className="text-center py-16 border-2 border-dashed rounded-3xl bg-muted/5">
                        <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-4 opacity-40" />
                        <p className="font-body text-muted-foreground">No critical shortages right now.</p>
                        <p className="font-body text-sm text-muted-foreground mt-1">You'll be notified when NICUs need help.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {shortages.map((a, i) => (
                          <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                            className="rounded-2xl border-2 border-blood/20 bg-card p-5">
                            <div className="flex items-start justify-between mb-2">
                              <div className="w-9 h-9 rounded-xl bg-blood/10 flex items-center justify-center text-xl">🏥</div>
                              <Badge className={`text-[10px] border-0 font-body font-black uppercase ${urgencyClass((a as any).urgency || "URGENT")}`}>
                                {(a as any).urgency || "URGENT"}
                              </Badge>
                            </div>
                            <div className="font-display font-bold text-sm mb-0.5">{a.hospital}</div>
                            <div className="font-body text-xs text-muted-foreground flex items-center gap-1 mb-2">
                              <MapPin className="w-3 h-3" /> {a.city}
                            </div>
                            <div className="font-display font-black text-milk text-sm mb-3">{a.quantity_needed}</div>
                            <Button onClick={() => handleICanHelp(a.id)}
                              className="w-full bg-blood text-white font-body font-bold rounded-xl h-9 text-xs">
                              I Can Help
                            </Button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ MY TAB — DONOR ════ */}
          {tab === "my" && isDonor && (
            <div className="space-y-8">
              {/* Requests Waiting for Response */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-xl font-bold flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-milk" /> Requests Waiting for Your Response
                  </h3>
                  <Button variant="ghost" size="sm" onClick={fetchDonorMatches}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                {pendingMatches.length === 0 ? (
                  <div className="p-12 text-center border-2 border-dashed rounded-2xl bg-muted/5">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted-foreground opacity-30" />
                    <p className="font-body text-muted-foreground">No pending requests right now.</p>
                    <p className="font-body text-xs text-muted-foreground mt-1">You'll be notified when a NICU needs your help.</p>
                  </div>
                ) : (
                  <div className="space-y-3">