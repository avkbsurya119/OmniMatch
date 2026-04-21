import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, CheckCircle2, AlertCircle, Clock,
  Users, Activity, Plus, Shield, Star,
  ChevronRight, BarChart3, Loader2, ArrowRight, MapPin, Timer, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/AuthContext";
import { api, getCurrentUserId, BloodRequest } from "@/lib/api";
import { toast } from "sonner";

const MODULE_CONFIG: Record<string, {
  key: string; label: string; emoji: string; path: string;
  color: string; bg: string; border: string; gradient: string; description: string;
  genderRestricted?: "male" | "female";
}> = {
  blood: { key: "blood", label: "Blood Donation", emoji: "🩸", path: "/blood-bridge", color: "text-blood", bg: "bg-blood/10", border: "border-blood/30", gradient: "from-red-600 to-rose-700", description: "Match with patients who urgently need your blood type." },
  thal: { key: "thal", label: "ThalCare", emoji: "💉", path: "/thal-care", color: "text-thal", bg: "bg-thal/10", border: "border-thal/30", gradient: "from-purple-500 to-indigo-600", description: "Help thalassemia patients with their recurring transfusion needs." },
  platelet: { key: "platelet", label: "Platelet Donation", emoji: "⏱️", path: "/platelet-alert", color: "text-platelet", bg: "bg-platelet/10", border: "border-platelet/30", gradient: "from-amber-500 to-orange-600", description: "5-day viability window. Cancer patients depend on you." },
  milk: { key: "milk", label: "Milk Donation", emoji: "🍼", path: "/milk-bridge", color: "text-milk", bg: "bg-milk/10", border: "border-milk/30", gradient: "from-pink-400 to-rose-500", description: "Donate breast milk to save premature infants in NICUs.", genderRestricted: "female" },
};

function ModuleCard({ mod, index }: { mod: typeof MODULE_CONFIG[string]; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }}>
      <Link to={mod.path}>
        <div className={`group rounded-2xl border-2 ${mod.border} bg-card p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1`}>
          <div className="flex items-start justify-between mb-4">
            <div className={`w-12 h-12 rounded-xl ${mod.bg} flex items-center justify-center text-2xl`}>{mod.emoji}</div>
            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all mt-1" />
          </div>
          <div className="font-display font-bold text-base text-foreground mb-0.5">{mod.label}</div>
          <p className="font-body text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
          {mod.genderRestricted && <Badge className="mt-2 text-[10px] bg-pink-100 text-pink-700 border-0 font-body">Women donors</Badge>}
        </div>
      </Link>
    </motion.div>
  );
}

function BloodModulePanel() {
  const [requests, setRequests] = useState<BloodRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const id = getCurrentUserId();
    if (!id) { setLoading(false); return; }
    api.blood.getRequestsForDonor(id).then(setRequests).catch(() => { }).finally(() => setLoading(false));
  }, []);
  return (
    <div className="rounded-2xl border-2 border-blood/20 bg-card overflow-hidden">
      <div className="bg-gradient-to-r from-red-600 to-rose-700 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🩸</span>
          <div><div className="font-display font-bold text-white text-base">Blood Donation</div><div className="font-body text-white/70 text-xs">Urgent requests matching your blood type</div></div>
        </div>
        <Link to="/blood-bridge"><Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 font-body text-xs rounded-lg">View All <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
      </div>
      <div className="p-4">
        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-blood" /></div>
          : requests.length === 0 ? <div className="text-center py-6"><Heart className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="font-body text-sm text-muted-foreground">No urgent requests right now.</p></div>
            : <div className="space-y-2">{requests.slice(0, 3).map((req, i) => (
              <motion.div key={req.id || i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-blood/20 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blood/10 flex items-center justify-center font-display font-bold text-blood text-sm shrink-0">{req.group}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-body font-bold text-sm text-foreground truncate">{req.hospital}</div>
                  <div className="font-body text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{req.city} · <Clock className="w-3 h-3" />{req.posted}</div>
                </div>
                <Badge className={`text-[10px] border-0 font-body shrink-0 ${req.urgency === "CRITICAL" ? "bg-blood/15 text-blood" : "bg-platelet/15 text-platelet"}`}>{req.urgency}</Badge>
                <Button size="sm" onClick={() => toast.success(`Response sent to ${req.hospital}!`)} className="bg-blood text-white font-body font-semibold rounded-lg text-xs px-3 h-8 shrink-0">Respond</Button>
              </motion.div>
            ))}</div>}
      </div>
    </div>
  );
}

function PlateletModulePanel() {
  const [requests, setRequests] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = getCurrentUserId();
  
  const loadData = () => {
    Promise.all([
      api.platelet.getOpenRequests({ user_id: userId || undefined }),
      userId ? api.platelet.getDonorMatches(userId) : Promise.resolve([])
    ]).then(([r, m]) => {
      setRequests(r.slice(0, 3));
      setMatches(m);
    }).catch(() => { }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);
  return (
    <div className="rounded-2xl border-2 border-platelet/20 bg-card overflow-hidden">
      <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⏱️</span>
          <div><div className="font-display font-bold text-white text-base">Platelet Donation</div><div className="font-body text-white/70 text-xs">Cancer patients with expiring windows</div></div>
        </div>
        <Link to="/platelet-alert"><Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 font-body text-xs rounded-lg">View All <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
      </div>
      <div className="p-4">
        {loading ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-platelet" /></div>
          : requests.length === 0 ? <div className="text-center py-6"><Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" /><p className="font-body text-sm text-muted-foreground">No urgent platelet requests right now.</p></div>
            : <div className="space-y-2">{requests.map((req, i) => (
              <motion.div key={req.id || i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-platelet/20 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-platelet/10 flex items-center justify-center font-display font-bold text-platelet text-sm shrink-0">{req.group}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-body font-bold text-sm text-foreground truncate">{req.patient}</div>
                  <div className="font-body text-xs text-muted-foreground">{req.cancer} · {req.hospital}</div>
                  <div className={`font-body text-[11px] font-bold mt-0.5 ${req.is_critical ? "text-blood" : "text-platelet"}`}>⏰ {req.expiry} remaining</div>
                </div>
                <Badge className={`text-[10px] border-0 font-body shrink-0 ${req.is_critical ? "bg-blood/15 text-blood" : "bg-platelet/15 text-platelet"}`}>{req.urgency}</Badge>
                {(() => {
                  const m = matches.find(x => x.request_id === req.id);
                  if (m) {
                    if (m.status === "pending") {
                      return <Badge className="bg-amber-100 text-amber-700 font-body shrink-0">Pending</Badge>;
                    }
                    if ((m.status === "accepted" || m.status === "confirmed") && m.contact && m.contact !== "No Contact") {
                      return (
                        <a href={`tel:${m.contact}`} className="inline-flex items-center gap-1.5 justify-center bg-blue-100 hover:bg-blue-200 text-blue-700 font-body text-xs px-3 h-8 shrink-0 rounded-lg">
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                      );
                    }
                    return <Badge className="bg-slate-100 text-slate-600 font-body shrink-0 uppercase">{m.status}</Badge>;
                  }
                  return (
                    <Button size="sm"
                      onClick={async () => {
                        try {
                          await api.platelet.createMatch({ request_id: req.id, donor_id: userId! });
                          toast.success("Donation intent recorded!");
                          loadData();
                        } catch (e: any) { toast.error(e.message); }
                      }}
                      className="bg-platelet text-white font-body font-semibold rounded-lg text-xs px-3 h-8 shrink-0">Donate</Button>
                  );
                })()}
              </motion.div>
            ))}</div>}
      </div>
    </div>
  );
}

function SimpleModulePanel({ modKey }: { modKey: string }) {
  const mod = MODULE_CONFIG[modKey];
  if (!mod) return null;
  const tips: Record<string, string[]> = {
    milk: ["Pump or hand-express milk within 6 hours of feeding", "Store in sterile containers and keep refrigerated", "Milk bank will arrange pickup from your location"],
    thal: ["Thalassemia patients require regular blood transfusions", "Join a patient's care network to become their dedicated donor", "Recurring commitments heavily improve their quality of life"],
  };
  return (
    <div className={`rounded-2xl border-2 ${mod.border} bg-card overflow-hidden`}>
      <div className={`bg-gradient-to-r ${mod.gradient} px-5 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{mod.emoji}</span>
          <div><div className="font-display font-bold text-white text-base">{mod.label}</div><div className="font-body text-white/70 text-xs">{mod.description}</div></div>
        </div>
        <Link to={mod.path}><Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 font-body text-xs rounded-lg">Open Module <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
      </div>
      <div className="p-4">
        <p className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Tips</p>
        <div className="space-y-2">{(tips[modKey] || []).map((tip, i) => (
          <div key={i} className="flex items-start gap-2">
            <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${mod.color}`} />
            <p className="font-body text-xs text-muted-foreground">{tip}</p>
          </div>
        ))}</div>
      </div>
    </div>
  );
}

function DonorDashboard() {
  const [available, setAvailable] = useState(true);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [donorHistory, setDonorHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const { userName, profile } = useAuth();
  const name = profile?.name || userName || "Donor";
  const initial = name.charAt(0).toUpperCase();
  const bloodGroup = profile?.blood_group || "—";
  const city = profile?.city || "—";
  const isVerified = profile?.is_verified ?? false;
  const trustScore = profile?.trust_score ? (profile.trust_score / 10).toFixed(1) : "5.0";
  const donorTypes = (profile?.donor_types || []) as string[];
  const activeModules = Object.values(MODULE_CONFIG).filter(m => {
    if (m.key === "thal" && donorTypes.includes("blood")) return true;
    return donorTypes.includes(m.key);
  });
  useEffect(() => { if (activeModules.length > 0 && !activeModule) setActiveModule(activeModules[0].key); }, [donorTypes]);

  const userId = getCurrentUserId();
  useEffect(() => {
    if (!userId) { setHistoryLoading(false); return; }
    Promise.allSettled([
      api.blood.getDonorHistory(userId),
      api.platelet.getDonorMatches(userId)
    ]).then(([bloodRes, plateletRes]) => {
      let merged: any[] = [];
      if (bloodRes.status === "fulfilled") merged = merged.concat(bloodRes.value);
      if (plateletRes.status === "fulfilled") {
        const platMapped = plateletRes.value.map(m => ({
          created_at: m.created_at,
          responded_at: m.responded_at,
          urgency: m.urgency,
          hospital: m.hospital,
          status: m.status,
          type: "platelet"
        }));
        merged = merged.concat(platMapped);
      }
      merged.sort((a, b) => new Date(b.responded_at || b.created_at).getTime() - new Date(a.responded_at || a.created_at).getTime());
      setDonorHistory(merged);
    }).finally(() => setHistoryLoading(false));
  }, [userId]);

  return (
    <div className="space-y-6">
      {/* Profile Hero */}
      <div className="rounded-2xl bg-gradient-hero p-6 text-primary-foreground relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center text-3xl font-bold font-display shrink-0">{initial}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-2xl font-bold">{name}</h2>
              {isVerified && <Badge className="bg-accent/20 text-accent border-0 font-body text-xs"><Shield className="w-3 h-3 mr-1" />Verified</Badge>}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {activeModules.length > 0 ? activeModules.map(m => (
                <span key={m.key} className="inline-flex items-center gap-1 bg-primary-foreground/15 text-primary-foreground/90 text-[11px] font-body font-semibold px-2 py-0.5 rounded-full">{m.emoji} {m.label}</span>
              )) : <span className="font-body text-primary-foreground/60 text-sm">No donation types registered yet</span>}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1"><Star className="w-4 h-4 text-accent fill-current" /><span className="font-body text-sm font-bold">{trustScore} Trust Score</span></div>
              <span className="font-body text-sm text-primary-foreground/60">{city}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-body text-sm font-medium text-primary-foreground/80">Available</span>
            <button onClick={() => setAvailable(!available)} className={`w-12 h-6 rounded-full transition-all duration-300 relative ${available ? "bg-accent" : "bg-primary-foreground/30"}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-primary-foreground transition-all duration-300 ${available ? "right-1" : "left-1"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: "🩸", label: "Blood Group", value: bloodGroup, color: "text-blood" },
          { icon: "📍", label: "City", value: city, color: "text-primary" },
          { icon: "⭐", label: "Trust Score", value: trustScore, color: "text-accent" },
          { icon: "🎗️", label: "Modules Active", value: activeModules.length, color: "text-secondary" },
        ].map(({ icon, label, value, color }) => (
          <div key={label} className="rounded-xl bg-card border border-border p-4 shadow-card text-center">
            <div className="text-2xl mb-1">{icon}</div>
            <div className={`font-display text-2xl font-bold ${color}`}>{value}</div>
            <div className="font-body text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {activeModules.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-10 text-center">
          <div className="text-4xl mb-3">🎗️</div>
          <h3 className="font-display text-lg font-bold mb-2">No donation types registered</h3>
          <p className="font-body text-sm text-muted-foreground">Your profile does not have any donor types set yet. Contact support or re-register.</p>
        </div>
      )}

      {/* Module Tabs */}
      {activeModules.length > 1 && (
        <div>
          <p className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Your Donation Modules</p>
          <div className="flex flex-wrap gap-2">
            {activeModules.map(mod => (
              <button key={mod.key} onClick={() => setActiveModule(mod.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-body font-bold text-sm transition-all border-2 ${activeModule === mod.key ? `${mod.bg} ${mod.border} ${mod.color} shadow-sm` : "border-border bg-card text-muted-foreground hover:border-border/80"}`}>
                <span>{mod.emoji}</span><span>{mod.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active Panel */}
      <AnimatePresence mode="wait">
        {activeModule && (
          <motion.div key={activeModule} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            {activeModule === "blood" && <BloodModulePanel />}
            {activeModule === "platelet" && <PlateletModulePanel />}
            {(activeModule === "milk" || activeModule === "thal") && <SimpleModulePanel modKey={activeModule} />}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Access Grid */}
      {activeModules.length > 1 && (
        <div>
          <p className="font-body text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Quick Access</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeModules.map((mod, i) => <ModuleCard key={mod.key} mod={mod} index={i} />)}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <h3 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-secondary" />Donation History</h3>
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>{["Date", "Type", "Hospital", "Status", "Impact"].map(h => <th key={h} className="font-body text-xs font-semibold text-muted-foreground px-4 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {historyLoading && (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground font-body text-sm">Loading...</td></tr>
              )}
              {!historyLoading && donorHistory.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground font-body text-sm">No donation history yet.</td></tr>
              )}
              {!historyLoading && donorHistory.map((row: any, i: number) => (
                <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                  <td className="font-body text-sm px-4 py-3 text-muted-foreground">
                    {row.responded_at ? new Date(row.responded_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : new Date(row.created_at).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" })}
                  </td>
                  <td className="font-body text-sm px-4 py-3 font-medium">
                    {row.type === "platelet" ? "⏱️ Platelet" : "🩸 Blood"}
                  </td>
                  <td className="font-body text-sm px-4 py-3 text-muted-foreground">{row.hospital || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge className={`border-0 font-body text-xs ${
                      row.status === "fulfilled" ? "bg-secondary/15 text-secondary" :
                      row.status === "accepted"  ? "bg-blue-500/15 text-blue-600" :
                      row.status === "declined"  ? "bg-blood/10 text-blood" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {row.status?.charAt(0).toUpperCase() + row.status?.slice(1)}
                    </Badge>
                  </td>
                  <td className="font-body text-sm px-4 py-3 text-accent font-semibold">
                    {row.status === "fulfilled" ? "1 life helped 🎉" : row.status === "accepted" ? "Awaiting donation" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const HOSPITAL_MODULES = [
  { name: "BloodBridge", emoji: "🩸", tagline: "Blood donor matching", description: "Post urgent blood requests and match with verified donors in real time.", path: "/blood-bridge", accent: "border-blood/30 hover:border-blood", badge: "text-blood", icon_bg: "bg-blood/10" },
  { name: "ThalCare", emoji: "💉", tagline: "Thalassemia transfusions", description: "Manage recurring transfusion schedules and donor assignments for Thal patients.", path: "/thal-care", accent: "border-thal/30 hover:border-thal", badge: "text-thal", icon_bg: "bg-thal/10" },
  { name: "PlateletAlert", emoji: "⏱️", tagline: "Platelet expiry tracking", description: "Track platelet viability windows and match cancer patients with apheresis donors.", path: "/platelet-alert", accent: "border-platelet/30 hover:border-platelet", badge: "text-platelet", icon_bg: "bg-platelet/10" },
  { name: "MilkBridge", emoji: "🍼", tagline: "Human milk bank", description: "Connect with lactating donors and manage milk bank inventory for NICUs.", path: "/milk-bridge", accent: "border-milk/30 hover:border-milk", badge: "text-milk", icon_bg: "bg-milk/10" },
];

function HospitalDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [thalPatients, setThalPatients] = useState<any[]>([]);
  const [plateletReqs, setPlateletReqs] = useState<any[]>([]);
  const [remLoading, setRemLoading] = useState(true);
  const hospitalId = getCurrentUserId();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hospitalId) { setLoading(false); return; }
    api.dashboard.getHospital(hospitalId).then(setData).catch(e => setError(e.message || "Failed to load dashboard")).finally(() => setLoading(false));
  }, [hospitalId]);

  useEffect(() => {
    const fetch = async () => {