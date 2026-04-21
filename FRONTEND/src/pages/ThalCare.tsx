import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Calendar, Clock, Plus, ChevronRight,
  X, UserCheck, AlertTriangle, CheckCircle, Loader2, RefreshCw,
  History, Heart, ShieldCheck, XCircle, Activity, Users, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BloodBridgeMap from "@/components/BloodBridgeMap";
import { useAuth } from "@/hooks/AuthContext";
import {
  api, getCurrentUserId, getCurrentRole,
  type ThalPatient, type CalendarDay, type ThalAssignment, type ThalPatientHistory, type ThalDashboardStats,
  type BloodDonor,
} from "@/lib/api";

// ── Extended type (backward compat) ───────────────────────────────────────────
type ThalPatientExt = ThalPatient;

interface ThalMatch {
  donor_id: string;
  name: string;
  blood_group: string;
  city: string;
  trust_score: number;
  is_verified: boolean;
  match_score?: number;
  days_since_donation?: number | null;
  lifetime_donations?: number;
  distance_km?: number | null;
}

interface MatchResult {
  patient_name: string;
  blood_group: string;
  next_transfusion: string;
  days_until: number | null;
  early_warning: string | null;
  excluded_donors: number;
  matches: ThalMatch[];
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = localStorage.getItem("lf_token");
  const url = BASE ? BASE + path : path;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Donor Status Badge ────────────────────────────────────────────────────────
function DonorStatusBadge({ status, name }: { status: string | null; name: string }) {
  if (!status || name === "Unmatched") {
    return (
      <span className="font-body font-semibold text-xs text-blood flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> Unmatched
      </span>
    );
  }
  const cfg: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    pending:   { bg: "bg-amber-500/15", text: "text-amber-600", icon: <Clock className="w-3 h-3" />, label: `Pending — ${name}` },
    accepted:  { bg: "bg-green-500/15", text: "text-green-600", icon: <CheckCircle className="w-3 h-3" />, label: `Confirmed — ${name}` },
    fulfilled: { bg: "bg-thal/15",      text: "text-thal",      icon: <ShieldCheck className="w-3 h-3" />, label: `Fulfilled — ${name}` },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span className={`font-body font-semibold text-xs ${c.text} flex items-center gap-1`}>
      {c.icon} {c.label}
    </span>
  );
}

// ── Register Patient Modal ────────────────────────────────────────────────────
function RegisterModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const hospitalId = getCurrentUserId();
  const [form, setForm] = useState({
    name: "", blood_group: "",
    transfusion_frequency_days: 21, last_transfusion_date: "", dob: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.thal.registerPatient({
        name: form.name,
        blood_group: form.blood_group,
        hospital_id: hospitalId,
        transfusion_frequency_days: Number(form.transfusion_frequency_days),
        last_transfusion_date: form.last_transfusion_date || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border-2 border-thal/30 rounded-2xl p-7 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl font-bold text-foreground">Register Patient</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">Patient Name *</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Full name"
              required
              className="rounded-xl border-thal/20 focus:border-thal"
            />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">Blood Group *</label>
            <select
              value={form.blood_group}
              onChange={e => setForm(f => ({ ...f, blood_group: e.target.value }))}
              required
              className="w-full rounded-xl border border-thal/20 bg-background px-3 py-2 text-sm font-body focus:border-thal outline-none"
            >
              <option value="">Select blood group</option>
              {bloodGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">Date of Birth</label>
            <Input
              type="date"
              value={form.dob}
              onChange={e => setForm(f => ({ ...f, dob: e.target.value }))}
              className="rounded-xl border-thal/20 focus:border-thal"
            />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">
              Transfusion Frequency (days)
            </label>
            <Input
              type="number"
              value={form.transfusion_frequency_days}
              onChange={e => setForm(f => ({ ...f, transfusion_frequency_days: parseInt(e.target.value) }))}
              min={7} max={60}
              className="rounded-xl border-thal/20 focus:border-thal"
            />
          </div>
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">Last Transfusion Date</label>
            <Input
              type="date"
              value={form.last_transfusion_date}
              onChange={e => setForm(f => ({ ...f, last_transfusion_date: e.target.value }))}
              className="rounded-xl border-thal/20 focus:border-thal"
            />
          </div>

          {/* Auto-filled hospital notice */}
          <div className="bg-thal/8 border border-thal/20 rounded-xl px-4 py-2 font-body text-xs text-thal flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Patient will be registered under your hospital account.
          </div>

          {error && (
            <div className="bg-blood/10 border border-blood/30 rounded-xl px-4 py-2 text-blood font-body text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-thal text-primary-foreground font-body font-bold rounded-xl mt-1"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            {loading ? "Registering…" : "Register Patient"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Find Donor Modal ──────────────────────────────────────────────────────────
function FindDonorModal({
  patient,
  onClose,
  onAssigned,
}: {
  patient: ThalPatientExt;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    apiFetch<MatchResult>(`/thal/patients/${patient.id}/matches`)
      .then(setResult)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [patient.id]);

  async function assignDonor(donorId: string) {
    setAssigning(donorId);
    setError("");
    try {
      await api.thal.assignDonor({ patient_id: patient.id, donor_id: donorId });
      setSuccess("Donor assigned! Notification sent.");
      setTimeout(() => { onAssigned(); onClose(); }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigning(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border-2 border-thal/30 rounded-2xl p-7 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Find Donor</h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              for <span className="text-thal font-semibold">{patient.name}</span> · {patient.group}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-thal" />
            <p className="font-body text-sm">Finding compatible donors…</p>
          </div>
        )}

        {!loading && result && (
          <>
            {result.early_warning && (
              <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-amber-600 font-body text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {result.early_warning}
              </div>
            )}
            {result.excluded_donors > 0 && (
              <div className="mb-4 bg-thal/8 border border-thal/20 rounded-xl px-4 py-2 font-body text-xs text-thal flex items-center gap-2">
                <UserCheck className="w-4 h-4 shrink-0" />
                {result.excluded_donors} donor(s) excluded — already donated to this patient before
              </div>
            )}
            {result.matches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground font-body text-sm">
                No eligible new donors found for {patient.group}.
              </div>
            ) : (
              <div className="space-y-3">
                {result.matches.map((d, i) => (
                  <div
                    key={d.donor_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-thal/20 bg-thal/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-thal/15 flex items-center justify-center font-display font-bold text-thal text-sm relative">
                        {d.blood_group}
                        {i === 0 && <span className="absolute -top-1 -right-1 text-[10px]">⭐</span>}
                      </div>
                      <div>
                        <div className="font-body font-semibold text-sm text-foreground flex items-center gap-1.5">
                          {d.name}
                          {d.match_score != null && (
                            <span className="text-[10px] font-body font-bold text-thal bg-thal/10 px-1.5 py-0.5 rounded-full">
                              Score {d.match_score}
                            </span>
                          )}
                        </div>
                        <div className="font-body text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                          <span>{d.city}</span>
                          <span>·</span>
                          <span>Trust {d.trust_score}%</span>
                          {d.days_since_donation != null && (
                            <><span>·</span><span>{d.days_since_donation}d ago</span></>
                          )}
                          {(d.lifetime_donations ?? 0) > 0 && (
                            <><span>·</span><span>{d.lifetime_donations} past</span></>
                          )}
                          {d.distance_km != null && (
                            <><span>·</span><span>{d.distance_km} km</span></>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => assignDonor(d.donor_id)}
                      disabled={assigning === d.donor_id || !!success}
                      className="bg-thal text-primary-foreground font-body text-xs rounded-lg shrink-0"
                    >
                      {assigning === d.donor_id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Request"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="mt-4 bg-blood/10 border border-blood/30 rounded-xl px-4 py-2 text-blood font-body text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}
        {success && (
          <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-2 text-green-600 font-body text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" /> {success}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Mark Transfusion Done Modal ───────────────────────────────────────────────
function MarkDoneModal({
  patient,
  onClose,
  onDone,
}: {
  patient: ThalPatientExt;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [transDate, setTransDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.thal.markDone(patient.id, transDate);
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border-2 border-thal/30 rounded-2xl p-7 w-full max-w-sm shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-bold">Mark Transfusion Done</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="font-body text-sm text-muted-foreground mb-4">
          Recording transfusion for <span className="text-foreground font-semibold">{patient.name}</span>. This will reset the cycle.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-body text-xs font-semibold text-muted-foreground mb-1 block">Transfusion Date</label>
            <Input
              type="date"
              value={transDate}
              max={today}
              onChange={e => setTransDate(e.target.value)}
              className="rounded-xl border-thal/20 focus:border-thal"
            />
          </div>
          {error && (
            <div className="bg-blood/10 border border-blood/30 rounded-xl px-4 py-2 text-blood font-body text-xs">
              {error}
            </div>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-thal text-primary-foreground font-body font-bold rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            {loading ? "Saving…" : "Mark as Done"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

// ── Patient History Modal ─────────────────────────────────────────────────────
function HistoryModal({
  patient,
  onClose,
}: {
  patient: ThalPatientExt;
  onClose: () => void;
}) {
  const [data, setData] = useState<ThalPatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.thal.getPatientHistory(patient.id)
      .then(setData)
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false));
  }, [patient.id]);

  const statusColors: Record<string, string> = {
    fulfilled: "bg-green-500/15 text-green-600",
    accepted: "bg-blue-500/15 text-blue-600",
    pending: "bg-amber-500/15 text-amber-600",
    declined: "bg-red-500/15 text-red-500",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-card border-2 border-thal/30 rounded-2xl p-7 w-full max-w-lg shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
              <History className="w-5 h-5 text-thal" /> Transfusion History
            </h2>
            <p className="font-body text-xs text-muted-foreground mt-0.5">
              <span className="text-thal font-semibold">{patient.name}</span> · {patient.group} · {patient.freq}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin text-thal" />
            <p className="font-body text-sm">Loading history…</p>
          </div>
        )}

        {error && (
          <div className="bg-blood/10 border border-blood/30 rounded-xl px-4 py-2 text-blood font-body text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {!loading && data && (
          <>
            {data.history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground font-body text-sm">
                No transfusion records yet for this patient.
              </div>
            ) : (
              <div className="relative pl-6 space-y-4">
                {/* Timeline line */}
                <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-thal/20" />
                {data.history.map((h, i) => (
                  <div key={h.match_id} className="relative">
                    {/* Timeline dot */}
                    <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 border-card ${h.status === "fulfilled" ? "bg-green-500" : h.status === "accepted" ? "bg-blue-500" : h.status === "declined" ? "bg-red-400" : "bg-amber-500"}`} />
                    <div className="p-3 rounded-xl border border-thal/15 bg-thal/3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="font-body font-semibold text-sm text-foreground">{h.donor_name}</div>
                        <Badge className={`font-body text-[10px] border-0 ${statusColors[h.status] || "bg-muted text-muted-foreground"}`}>
                          {h.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 font-body text-xs text-muted-foreground">
                        <span>{h.donor_group}</span>
                        <span>·</span>
                        <span>{h.donor_city}</span>
                        <span>·</span>
                        <span>{h.date}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

// ── Donor Assignments Section ─────────────────────────────────────────────────
function DonorAssignments({ onRefresh }: { onRefresh: () => void }) {
  const donorId = getCurrentUserId();
  const [assignments, setAssignments] = useState<ThalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ matchId: string; msg: string; type: "success" | "error" } | null>(null);

  function fetchAssignments() {
    if (!donorId) return;
    setLoading(true);
    api.thal.getDonorAssignments(donorId)
      .then(setAssignments)
      .catch(() => setAssignments([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchAssignments(); }, [donorId]);

  async function handleRespond(matchId: string, action: "accept" | "decline") {
    if (!donorId) return;
    setResponding(matchId);
    setFeedback(null);
    try {
      const res = await api.thal.respond({ match_id: matchId, donor_id: donorId, action });
      setFeedback({ matchId, msg: res.message, type: "success" });
      setTimeout(() => { fetchAssignments(); onRefresh(); setFeedback(null); }, 2000);
    } catch (err: any) {
      setFeedback({ matchId, msg: err.message, type: "error" });
    } finally {
      setResponding(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-thal" /> My ThalCare Assignments
        </h3>
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-thal" /> My ThalCare Assignments
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchAssignments} className="text-thal font-body text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {assignments.length === 0 ? (
        <div className="text-center py-10 rounded-xl border-2 border-dashed border-thal/20 bg-thal/3">
          <Heart className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-body text-sm text-muted-foreground">No pending ThalCare assignments.</p>
          <p className="font-body text-xs text-muted-foreground mt-1">When a hospital assigns you to a patient, it will appear here.</p>
        </div>
      ) : (
        assignments.map((a, i) => (
          <motion.div
            key={a.match_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`rounded-2xl border-2 bg-card p-5 shadow-card transition-all ${
              a.is_urgent ? "border-blood/40 shadow-blood/10" : "border-thal/30"
            }`}
          >
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-thal/10 flex items-center justify-center text-lg font-display font-bold text-thal">
                  {a.blood_group}
                </div>
                <div>
                  <div className="font-body font-bold text-foreground">{a.patient_name}</div>
                  <div className="font-body text-xs text-muted-foreground">{a.hospital}</div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  className={`font-body text-xs border-0 ${
                    a.is_urgent ? "bg-blood/15 text-blood" : "bg-thal/15 text-thal"
                  }`}
                >
                  <Clock className="w-3 h-3 mr-1" /> {a.countdown}
                </Badge>
                <Badge className={`font-body text-[10px] border-0 ${
                  a.status === "accepted" ? "bg-green-500/15 text-green-600" : "bg-amber-500/15 text-amber-600"
                }`}>
                  {a.status === "accepted" ? "✓ Accepted" : "⏳ Pending"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
              <div>
                <div className="font-body text-xs text-muted-foreground">Next Transfusion</div>
                <div className="font-body font-semibold text-xs text-foreground">{a.next_transfusion}</div>
              </div>
              <div>
                <div className="font-body text-xs text-muted-foreground">Frequency</div>
                <div className="font-body font-semibold text-xs text-foreground">{a.frequency}</div>
              </div>
              <div>
                <div className="font-body text-xs text-muted-foreground">Assigned</div>
                <div className="font-body font-semibold text-xs text-foreground">{a.assigned_at}</div>
              </div>
            </div>

            {feedback?.matchId === a.match_id && (
              <div className={`mt-3 rounded-xl px-4 py-2 font-body text-xs flex items-center gap-2 ${
                feedback.type === "success" ? "bg-green-500/10 border border-green-500/30 text-green-600"
                  : "bg-blood/10 border border-blood/30 text-blood"
              }`}>
                {feedback.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {feedback.msg}
              </div>
            )}

            {a.status === "pending" && (
              <div className="flex gap-2 mt-4">
                <Button
                  size="sm"
                  onClick={() => handleRespond(a.match_id, "accept")}
                  disabled={responding === a.match_id}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-body text-xs rounded-lg"
                >
                  {responding === a.match_id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRespond(a.match_id, "decline")}
                  disabled={responding === a.match_id}
                  className="flex-1 border-red-400 text-red-500 font-body text-xs rounded-lg hover:bg-red-500 hover:text-white"
                >
                  <XCircle className="w-3 h-3 mr-1" /> Decline
                </Button>
              </div>
            )}

            {a.status === "accepted" && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="bg-green-500/8 border border-green-500/20 rounded-xl px-4 py-2 font-body text-xs text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  You've confirmed this assignment. The hospital will contact you for scheduling.
                </div>
                {a.hospital_contact && (