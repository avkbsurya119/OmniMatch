import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Timer, Plus, Star, Loader2,
  Search, X, Heart, CheckCircle, XCircle, Clock,
  AlertTriangle, Zap, Calendar, MessageSquare,
  TrendingUp, Users, Activity, ChevronRight,
  Bell, Shield, RefreshCw, Info, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  api, PlateletRequest, PlateletDonor, PlateletMatch, PlateletDashboard,
  getCurrentUserId, isLoggedIn
} from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ExpiryTimer({ label, hours }: { label: string; hours: number }) {
  const pct = Math.min(100, (hours / 120) * 100);
  const isCritical = hours < 24;
  const isWarning = hours < 48;
  const color = isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-amber-400";
  const textColor = isCritical ? "text-red-600" : isWarning ? "text-amber-600" : "text-amber-500";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="font-body text-xs text-muted-foreground">{label}</span>
        <span className={`font-body text-xs font-bold ${textColor}`}>
          {hours > 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`}
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function MatchBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending:   { label: "Pending",   cls: "bg-amber-100 text-amber-700 border-amber-200",   icon: <Clock className="w-3 h-3" /> },
    accepted:  { label: "Accepted",  cls: "bg-green-100 text-green-700 border-green-200",   icon: <CheckCircle className="w-3 h-3" /> },
    declined:  { label: "Declined",  cls: "bg-red-100 text-red-700 border-red-200",         icon: <XCircle className="w-3 h-3" /> },
    confirmed: { label: "Confirmed", cls: "bg-blue-100 text-blue-700 border-blue-200",      icon: <Calendar className="w-3 h-3" /> },
    completed: { label: "Completed", cls: "bg-purple-100 text-purple-700 border-purple-200",icon: <CheckCircle className="w-3 h-3" /> },
    cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-600 border-slate-200",   icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${cfg.cls}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 border-red-300",
    URGENT:   "bg-amber-100 text-amber-700 border-amber-300",
    NORMAL:   "bg-green-100 text-green-700 border-green-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${map[urgency] || map.URGENT}`}>
      {urgency}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Appointment Confirmation Modal (Hospital side)
// ─────────────────────────────────────────────────────────────────────────────

interface AppointmentModalProps {
  match: PlateletMatch;
  onClose: () => void;
  onConfirm: (matchId: string, appointmentTime: string, notes: string) => void;
}

function AppointmentModal({ match, onClose, onConfirm }: AppointmentModalProps) {
  const [apptTime, setApptTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptTime) { toast.error("Please pick an appointment date & time"); return; }
    setLoading(true);
    await onConfirm(match.match_id, apptTime, notes);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-card rounded-3xl border-2 border-amber-200 shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-6 text-white flex justify-between items-center">
          <div>
            <h3 className="font-display text-xl font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Confirm Appointment
            </h3>
            <p className="text-white/70 text-xs font-body mt-0.5">
              Schedule apheresis slot for <strong>{match.donor_name}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-xs font-body text-amber-800">
            <p className="font-bold mb-1">Patient: {match.patient_name}</p>
            <p>Donor: {match.donor_name} · {match.donor_blood} · {match.donor_city}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Appointment Date & Time</Label>
            <Input
              type="datetime-local"
              required
              className="rounded-xl font-body"
              value={apptTime}
              onChange={(e) => setApptTime(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Notes for Donor (optional)</Label>
            <textarea
              className="w-full h-20 px-3 py-2 rounded-xl border-2 border-input bg-background font-body text-sm resize-none focus:outline-none focus:border-amber-400"
              placeholder="e.g. Come to Ward 3, Apheresis Lab. Bring your ID card."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold h-11 rounded-xl"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Calendar className="w-4 h-4 mr-1.5" /> Confirm Slot</>}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct Request Modal (Hospital → specific donor)
// ─────────────────────────────────────────────────────────────────────────────

interface DirectRequestModalProps {
  donor: PlateletDonor;
  requests: PlateletRequest[];
  hospitalId: string;
  onClose: () => void;
  onRequest: (donorId: string, requestId: string, message: string) => void;
}

function DirectRequestModal({ donor, requests, hospitalId, onClose, onRequest }: DirectRequestModalProps) {
  const [selectedRequest, setSelectedRequest] = useState(requests[0]?.id || "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Only show requests for THIS hospital
  const myRequests = requests.filter(r => r.hospital_id === hospitalId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) { toast.error("Select a patient request"); return; }
    setLoading(true);
    await onRequest(donor.id, selectedRequest, message);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-card rounded-3xl border-2 border-amber-200 shadow-2xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white flex justify-between items-center">
          <div>
            <h3 className="font-display text-xl font-bold flex items-center gap-2">
              <Zap className="w-5 h-5" /> Request Apheresis
            </h3>
            <p className="text-white/70 text-xs font-body mt-0.5">
              Send a direct donation request to <strong>{donor.name}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
            <div className="w-10 h-10 rounded-2xl bg-amber-200 flex items-center justify-center font-bold text-amber-800 text-lg">
              {donor.name[0]}
            </div>
            <div>
              <p className="font-bold text-sm text-foreground">{donor.name}</p>
              <p className="text-xs text-muted-foreground">{donor.group} · {donor.city} · ⭐ {donor.trust} · Next: {donor.nextAvail}</p>
            </div>
          </div>

          {myRequests.length === 0 ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-body">
              You have no open patient requests to link to this donor. Please add a patient first.
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Link to Patient Request</Label>
              <select
                className="w-full h-10 px-3 rounded-xl border-2 border-input bg-background font-body text-sm"
                value={selectedRequest}
                onChange={(e) => setSelectedRequest(e.target.value)}
                required
              >
                {myRequests.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.patient} · {r.group} · {r.cancer} ({r.urgency})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Message to Donor (optional)</Label>
            <textarea
              className="w-full h-20 px-3 py-2 rounded-xl border-2 border-input bg-background font-body text-sm resize-none focus:outline-none focus:border-amber-400"
              placeholder="e.g. We need you urgently for a 14-year-old leukemia patient. Please respond ASAP."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || myRequests.length === 0}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold h-11 rounded-xl"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 mr-1.5" /> Send Request</>}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const URGENCY_OPTIONS = ["ALL", "CRITICAL", "URGENT", "NORMAL"];

export default function PlateletAlert() {
  const { role } = useAuth();
  const userId = getCurrentUserId();

  const [requests, setRequests]           = useState<PlateletRequest[]>([]);
  const [donors, setDonors]               = useState<PlateletDonor[]>([]);
  const [donorMatches, setDonorMatches]   = useState<PlateletMatch[]>([]);
  const [hospitalMatches, setHospitalMatches] = useState<PlateletMatch[]>([]);
  const [dashboard, setDashboard]         = useState<PlateletDashboard | null>(null);
  const [isLoading, setIsLoading]         = useState(true);
  const [isRefreshing, setIsRefreshing]   = useState(false);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [urgencyFilter, setUrgencyFilter] = useState("ALL");
  const [donorSearch, setDonorSearch]     = useState("");
  const [activeTab, setActiveTab]         = useState<"requests" | "donors" | "matches">("requests");

  // Modals
  const [appointmentModal, setAppointmentModal] = useState<PlateletMatch | null>(null);
  const [directRequestDonor, setDirectRequestDonor] = useState<PlateletDonor | null>(null);

  // Escalating tracking
  const [escalatingIds, setEscalatingIds] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    patient_name: "", cancer_type: "", blood_group: "",
    units: 1, urgency: "urgent"
  });

  // ── Fetch all data ──────────────────────────────────────────────────────────
  const fetchData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const params: Record<string, string> = {};
      if (userId) params.user_id = userId;
      if (urgencyFilter !== "ALL") params.urgency = urgencyFilter.toLowerCase();

      const [openRequests, compatibleDonors, dashData] = await Promise.all([
        api.platelet.getOpenRequests(params),
        api.platelet.getDonors(),
        api.platelet.getDashboard(userId ? { user_id: userId } : undefined),
      ]);
      setRequests(openRequests);
      setDonors(compatibleDonors);
      setDashboard(dashData);

      if (userId && role === "donor") {
        const dm = await api.platelet.getDonorMatches(userId);
        setDonorMatches(dm);
      }
      if (userId && role === "hospital") {
        const hm = await api.platelet.getHospitalMatches(userId);
        setHospitalMatches(hm);
      }
    } catch (err) {
      console.error(err);
      if (!silent) toast.error("Could not load platelet alerts");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [urgencyFilter, role]);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [urgencyFilter, role]);

  // ── Add patient ─────────────────────────────────────────────────────────────
  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn() || role !== "hospital") {
      toast.error("Only verified hospitals can post patient requirements");
      return;
    }
    if (!formData.patient_name || !formData.blood_group) {
      toast.error("Please fill in patient name and blood group");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.platelet.postRequest({ ...formData, hospital_id: userId! });
      toast.success("Patient registered! Compatible donors will be alerted.", {
        icon: <Heart className="text-red-500 w-4 h-4" />
      });
      setShowAddModal(false);
      setFormData({ patient_name: "", cancer_type: "", blood_group: "", units: 1, urgency: "urgent" });
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to register patient");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Donor clicks Donate ─────────────────────────────────────────────────────
  const handleDonate = async (request: PlateletRequest) => {
    if (!isLoggedIn() || role !== "donor") {
      toast.error("Please login as a donor to express donation intent");
      return;
    }
    try {
      await api.platelet.createMatch({ request_id: request.id, donor_id: userId! });
      toast.success("Donation intent recorded! The hospital will coordinate shortly.", {
        description: "You'll receive a notification once your appointment is confirmed.",
        icon: <Heart className="text-red-500 w-4 h-4" />
      });
      fetchData(true);
      setActiveTab("matches");
    } catch (err: any) {
      toast.error(err.message || "Failed to register donation intent");
    }
  };

  // ── Donor/Hospital Match Update ─────────────────────────────────────────────
  const handleMatchUpdate = async (matchId: string, status: string, appointmentTime?: string, notes?: string, trustRating?: number) => {
    try {
      await api.platelet.updateMatch(matchId, {
        status,
        donor_id: userId!,
        appointment_time: appointmentTime,
        notes,
        trust_rating: trustRating,
      });
      const messages: Record<string, string> = {
        accepted:  "✅ Accepted! Awaiting hospital appointment confirmation.",
        declined:  "Request declined.",
        confirmed: "🗓️ Appointment confirmed! Donor has been notified.",
        completed: "🎉 Donation marked complete. A life was saved!",
        cancelled: "Match cancelled.",
      };
      toast.success(messages[status] || `Status: ${status}`);
      fetchData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to update match");
    }
  };

  // ── Escalation ─────────────────────────────────────────────────────────────
  const handleEscalate = async (requestId: string, patientName: string) => {
    setEscalatingIds(prev => new Set(prev).add(requestId));
    try {
      const res = await api.platelet.triggerEscalation(requestId);
      toast.success(`🚨 Escalation sent to ${res.alerted} additional donors!`, {
        description: `All compatible apheresis donors have been alerted for ${patientName}.`
      });
    } catch (err: any) {
      toast.error(err.message || "Escalation failed");
    } finally {
      setEscalatingIds(prev => { const s = new Set(prev); s.delete(requestId); return s; });
    }
  };

  // ── Hospital direct donor request ───────────────────────────────────────────
  const handleDirectRequest = async (donorId: string, requestId: string, message: string) => {
    try {
      await api.platelet.requestDonor({
        hospital_id: userId!,
        donor_id: donorId,
        request_id: requestId,
        message: message || undefined,
      });
      toast.success("Direct apheresis request sent!", {
        description: "The donor has been notified and will respond shortly."
      });
      fetchData(true);
      setActiveTab("matches");
    } catch (err: any) {
      toast.error(err.message || "Failed to send request");
    }
  };

  const filteredRequests = urgencyFilter === "ALL"
    ? requests
    : requests.filter(r => r.urgency === urgencyFilter);

  const filteredDonors = donorSearch.trim()
    ? donors.filter(d =>
        d.name.toLowerCase().includes(donorSearch.toLowerCase()) ||
        d.city.toLowerCase().includes(donorSearch.toLowerCase()) ||
        d.group.toLowerCase().includes(donorSearch.toLowerCase())
      )
    : donors;

  const pendingMatchCount = role === "donor"
    ? donorMatches.filter(m => m.status === "pending").length
    : hospitalMatches.filter(m => m.status === "pending").length;

  const myHospitalRequests = role === "hospital"
    ? requests.filter(r => r.hospital_id === userId)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">

        {/* ── Hero ── */}
        <div className="relative bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-8 right-20 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute bottom-0 left-10 w-48 h-48 rounded-full bg-orange-300/30 blur-2xl" />
          </div>
          <div className="container mx-auto px-4 py-14 relative">
            <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-white/70 hover:text-white font-body text-sm mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </Link>
            <div className="flex items-center gap-4 mb-6">
              <div className="text-5xl drop-shadow-lg">⏱️</div>
              <div>
                <h1 className="font-display text-5xl font-black tracking-tight">PlateletAlert</h1>
                <p className="font-body text-white/75 text-lg mt-1">5-day expiry window. Zero tolerance for waste.</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => fetchData(true)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Stats row */}
            <div className="flex gap-4 flex-wrap">
              {[
                { label: "Active Requests",    value: dashboard?.open_requests ?? requests.length, icon: <Activity className="w-4 h-4" /> },
                { label: "Expiring in 24h",    value: dashboard?.expiring_24h ?? 0,                icon: <Timer className="w-4 h-4" />,    alert: (dashboard?.expiring_24h ?? 0) > 0 },
                { label: "Apheresis Donors",   value: dashboard?.apheresis_donors ?? donors.length, icon: <Users className="w-4 h-4" /> },
                { label: "Pending Matches",    value: dashboard?.pending_matches ?? 0,             icon: <Clock className="w-4 h-4" /> },
                { label: "Done This Week",     value: dashboard?.completed_this_week ?? 0,         icon: <CheckCircle className="w-4 h-4" /> },
              ].map(({ label, value, icon, alert }) => (
                <div key={label}
                  className={`rounded-2xl px-5 py-3 flex items-center gap-3 backdrop-blur-sm border ${alert ? "bg-red-500/30 border-red-300/40" : "bg-white/15 border-white/20"}`}
                >
                  <div className="opacity-80">{icon}</div>
                  <div>
                    <div className="font-display text-2xl font-bold leading-none">
                      {isLoading ? "…" : value}
                    </div>
                    <div className="font-body text-[11px] text-white/70 mt-0.5">{label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10">

          {/* ── Role Banner ── */}
          {isLoggedIn() && (
            <div className={`mb-6 rounded-2xl px-5 py-4 text-sm font-body shadow-sm border ${role === "hospital"
              ? "bg-blue-50/80 border-blue-200 text-blue-800"
              : "bg-emerald-50/80 border-emerald-200 text-emerald-800"
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 animate-pulse ${role === "hospital" ? "bg-blue-500" : "bg-emerald-500"}`} />
                <div className="flex-1">
                  {role === "hospital" ? (
                    <div>
                      <span className="font-bold">Hospital Control Panel — </span>
                      You can view real patient names, confirm donor appointments, mark donations as fulfilled, and escalate critical requests.
                    </div>
                  ) : (
                    <div>
                      <span className="font-bold">Donor Access — </span>
                      Patient names are anonymized. Express donation intent, then receive appointment confirmation from the hospital.
                      <span className="block mt-1 text-emerald-700 font-semibold">
                        🩺 Apheresis standard: minimum 14-day gap between platelet donations required.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Tab Bar ── */}
          {isLoggedIn() && (role === "donor" || role === "hospital") && (
            <div className="flex gap-2 mb-8 bg-muted/40 rounded-2xl p-1 w-fit">
              {[
                { key: "requests", label: "Requests", icon: <Bell className="w-3.5 h-3.5" /> },
                { key: "donors",   label: "Donors",   icon: <Users className="w-3.5 h-3.5" /> },
                {
                  key: "matches",
                  label: role === "hospital" ? "Donation Matches" : "My Matches",
                  icon: <Heart className="w-3.5 h-3.5" />,
                  badge: pendingMatchCount,
                },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`px-4 py-2 rounded-xl font-body font-bold text-sm transition-all flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? "bg-white shadow text-amber-600"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge ? (
                    <span className="bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Left Sidebar ── */}
            <div className="space-y-5">

              {/* Viability Clocks */}
              <div className="rounded-2xl border-2 border-amber-200/60 bg-card p-5 shadow-sm">
                <h3 className="font-display text-base font-bold mb-4 flex items-center gap-2">
                  <Timer className="w-5 h-5 text-amber-500 animate-pulse" /> Viability Clocks
                </h3>
                <div className="space-y-4">
                  {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>
                  ) : requests.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-4 font-body italic">No active clocks</p>
                  ) : (
                    requests.slice(0, 4).map(r => (
                      <div key={r.id} className={`p-3 rounded-xl border ${r.hours_left < 24 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                        <div className="font-body text-xs font-bold text-foreground mb-2">
                          {r.patient} — {r.cancer}
                        </div>
                        <div className="mb-2"><ExpiryTimer label="Expiry" hours={r.hours_left} /></div>
                        {/* Hospital escalation button */}
                        {role === "hospital" && r.hours_left < 48 && (
                          <button
                            onClick={() => handleEscalate(r.id, r.patient)}
                            disabled={escalatingIds.has(r.id)}
                            className="w-full mt-1 text-[10px] font-bold flex items-center justify-center gap-1 text-red-700 bg-red-100 hover:bg-red-200 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                          >
                            {escalatingIds.has(r.id)
                              ? <><Loader2 className="w-3 h-3 animate-spin" /> Escalating…</>
                              : <><Zap className="w-3 h-3" /> Escalate Alert</>}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Patient — hospital only */}
              {(!isLoggedIn() || role === "hospital") && (
                <div className="rounded-2xl border-2 border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
                  <h3 className="font-display text-base font-bold mb-2">Post Platelet Need</h3>
                  <p className="font-body text-xs text-muted-foreground mb-4">
                    {role === "hospital"
                      ? "Register a cancer patient's platelet requirement and alert all compatible donors."
                      : "Hospital login required to post patient requirements."}
                  </p>
                  <Button
                    onClick={() => {
                      if (role !== "hospital") { toast.error("Only verified hospitals can post requests"); return; }
                      setShowAddModal(true);
                    }}
                    disabled={role !== "hospital"}
                    className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-body font-bold rounded-xl h-12 shadow-lg shadow-amber-200 hover:scale-[1.02] transition-transform disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 mr-1.5" /> Add Patient
                  </Button>
                </div>
              )}

              {/* Urgency Filter */}
              <div className="rounded-2xl border-2 border-amber-100 bg-card p-5">
                <h3 className="font-display text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">Filter by Urgency</h3>
                <div className="space-y-2">
                  {URGENCY_OPTIONS.map(u => (
                    <button
                      key={u}
                      onClick={() => setUrgencyFilter(u)}
                      className={`w-full text-left px-3 py-2 rounded-lg font-body text-sm font-bold transition-all flex items-center justify-between ${
                        urgencyFilter === u ? "bg-amber-500 text-white shadow-sm" : "hover:bg-amber-50 text-muted-foreground"
                      }`}
                    >
                      <span>{u === "ALL" ? "All Requests" : u}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${urgencyFilter === u ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
                        {u === "ALL" ? requests.length : requests.filter(r => r.urgency === u).length}