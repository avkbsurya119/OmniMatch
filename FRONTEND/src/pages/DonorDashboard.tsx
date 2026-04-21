import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    Heart, MapPin, CheckCircle2, AlertCircle, Clock,
    Activity, Plus, Shield, Star, Loader2, ArrowRight,
    Droplets, Timer, Baby, Dna, HeartPulse, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/AuthContext";
import { api, getCurrentUserId, BloodRequest } from "@/lib/api";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// MODULE CONFIG — one entry per donor_type
// ─────────────────────────────────────────────────────────────────────────────
const MODULE_CONFIG: Record<string, {
    key: string;
    label: string;
    emoji: string;
    path: string;
    color: string;        // tailwind text color
    bg: string;           // tailwind bg color
    border: string;       // tailwind border color
    gradient: string;     // hero gradient
    description: string;
    genderRestricted?: "male" | "female";
}> = {
    blood: {
        key: "blood",
        label: "Blood Donation",
        emoji: "🩸",
        path: "/blood-bridge",
        color: "text-blood",
        bg: "bg-blood/10",
        border: "border-blood/30",
        gradient: "from-red-600 to-rose-700",
        description: "Match with patients who urgently need your blood type.",
    },
    platelet: {
        key: "platelet",
        label: "Platelet Donation",
        emoji: "⏱️",
        path: "/platelet-alert",
        color: "text-platelet",
        bg: "bg-platelet/10",
        border: "border-platelet/30",
        gradient: "from-amber-500 to-orange-600",
        description: "5-day viability window. Cancer patients depend on you.",
    },
    milk: {
        key: "milk",
        label: "Milk Donation",
        emoji: "🍼",
        path: "/milk-bridge",
        color: "text-milk",
        bg: "bg-milk/10",
        border: "border-milk/30",
        gradient: "from-pink-400 to-rose-500",
        description: "Donate breast milk to save premature infants in NICUs.",
        genderRestricted: "female",
    },
    marrow: {
        key: "marrow",
        label: "Bone Marrow",
        emoji: "🧬",
        path: "/marrow-match",
        color: "text-marrow",
        bg: "bg-marrow/10",
        border: "border-marrow/30",
        gradient: "from-violet-600 to-purple-700",
        description: "HLA-compatible marrow donation — a second chance at life.",
    },
    organ: {
        key: "organ",
        label: "Organ Donation",
        emoji: "🫁",
        path: "/last-gift",
        color: "text-organ",
        bg: "bg-organ/10",
        border: "border-organ/30",
        gradient: "from-teal-500 to-emerald-600",
        description: "Pledge your organs and give recipients a life-saving gift.",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// MOCK donation history (replace with real API call later)
// ─────────────────────────────────────────────────────────────────────────────
const mockHistory = [
    { date: "Feb 15, 2025", type: "🩸 Blood", hospital: "Lilavati Hospital", status: "Fulfilled", impact: "3 lives saved" },
    { date: "Jan 28, 2025", type: "⏱️ Platelets", hospital: "Kokilaben Hospital", status: "Fulfilled", impact: "1 patient helped" },
    { date: "Jan 10, 2025", type: "🩸 Blood", hospital: "Breach Candy Hospital", status: "Fulfilled", impact: "2 lives saved" },
];

// ─────────────────────────────────────────────────────────────────────────────
// MODULE CARD — shown in the "Your Donation Modules" grid
// ─────────────────────────────────────────────────────────────────────────────
function ModuleCard({ mod, index }: { mod: typeof MODULE_CONFIG[string]; index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.07 }}
        >
            <Link to={mod.path}>
                <div className={`group rounded-2xl border-2 ${mod.border} bg-card p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1`}>
                    <div className="flex items-start justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl ${mod.bg} flex items-center justify-center text-2xl`}>
                            {mod.emoji}
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all mt-1" />
                    </div>
                    <div className={`font-display font-bold text-base text-foreground mb-0.5`}>{mod.label}</div>
                    <p className="font-body text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                    {mod.genderRestricted && (
                        <Badge className="mt-2 text-[10px] bg-pink-100 text-pink-700 border-0 font-body">
                            {mod.genderRestricted === "female" ? "Women donors" : "Men donors"}
                        </Badge>
                    )}
                </div>
            </Link>
        </motion.div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOOD MODULE PANEL — inline urgent requests for blood donors
// ─────────────────────────────────────────────────────────────────────────────
function BloodModulePanel() {
    const [requests, setRequests] = useState<BloodRequest[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const id = getCurrentUserId();
        if (!id) { setLoading(false); return; }
        api.blood.getRequestsForDonor(id)
            .then(setRequests)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="rounded-2xl border-2 border-blood/20 bg-card overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-rose-700 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">🩸</span>
                    <div>
                        <div className="font-display font-bold text-white text-base">Blood Donation</div>
                        <div className="font-body text-white/70 text-xs">Urgent requests matching your blood type</div>
                    </div>
                </div>
                <Link to="/blood-bridge">
                    <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 font-body text-xs rounded-lg">
                        View All <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                </Link>
            </div>
            <div className="p-4">
                {loading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-blood" /></div>
                ) : requests.length === 0 ? (
                    <div className="text-center py-6">
                        <Heart className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                        <p className="font-body text-sm text-muted-foreground">No urgent requests right now.</p>
                        <p className="font-body text-xs text-muted-foreground mt-1">We'll alert you when someone needs your blood type.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {requests.slice(0, 3).map((req, i) => (
                            <motion.div key={req.id || i}
                                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                                className="rounded-xl border border-blood/20 bg-blood/3 p-3 flex items-center gap-3"
                            >
                                <div className="w-10 h-10 rounded-lg bg-blood/10 flex items-center justify-center font-display font-bold text-blood text-sm shrink-0">
                                    {req.group}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-body font-bold text-sm text-foreground truncate">{req.hospital}</div>
                                    <div className="font-body text-xs text-muted-foreground flex items-center gap-1">
                                        <MapPin className="w-3 h-3" />{req.city} · <Clock className="w-3 h-3" />{req.posted}
                                    </div>
                                </div>
                                <Badge className={`text-[10px] border-0 font-body shrink-0 ${req.urgency === "CRITICAL" ? "bg-blood/15 text-blood" : "bg-platelet/15 text-platelet"}`}>
                                    {req.urgency}
                                </Badge>
                                <Button size="sm" onClick={() => toast.success(`Response sent to ${req.hospital}!`)}
                                    className="bg-blood text-white font-body font-semibold rounded-lg text-xs px-3 h-8 shrink-0">
                                    Respond
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATELET MODULE PANEL
// ─────────────────────────────────────────────────────────────────────────────
function PlateletModulePanel() {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const userId = getCurrentUserId();

    useEffect(() => {
        api.platelet.getOpenRequests({ user_id: userId || undefined })
            .then((r) => setRequests(r.slice(0, 3)))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="rounded-2xl border-2 border-platelet/20 bg-card overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">⏱️</span>
                    <div>
                        <div className="font-display font-bold text-white text-base">Platelet Donation</div>
                        <div className="font-body text-white/70 text-xs">Cancer patients with expiring windows</div>
                    </div>
                </div>
                <Link to="/platelet-alert">
                    <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 font-body text-xs rounded-lg">
                        View All <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                </Link>
            </div>
            <div className="p-4">
                {loading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-platelet" /></div>
                ) : requests.length === 0 ? (
                    <div className="text-center py-6">
                        <Timer className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                        <p className="font-body text-sm text-muted-foreground">No urgent platelet requests right now.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {requests.map((req, i) => (
                            <motion.div key={req.id || i}
                                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                                className="rounded-xl border border-platelet/20 bg-platelet/3 p-3 flex items-center gap-3"
                            >
                                <div className="w-10 h-10 rounded-lg bg-platelet/10 flex items-center justify-center font-display font-bold text-platelet text-sm shrink-0">
                                    {req.group}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-body font-bold text-sm text-foreground truncate">{req.patient}</div>
                                    <div className="font-body text-xs text-muted-foreground">{req.cancer} · {req.hospital}</div>
                                    <div className={`font-body text-[11px] font-bold mt-0.5 ${req.is_critical ? "text-blood" : "text-platelet"}`}>
                                        ⏰ {req.expiry} remaining
                                    </div>
                                </div>
                                <Badge className={`text-[10px] border-0 font-body shrink-0 ${req.is_critical ? "bg-blood/15 text-blood" : "bg-platelet/15 text-platelet"}`}>
                                    {req.urgency}
                                </Badge>
                                <Button size="sm"
                                    onClick={async () => {
                                        try {
                                            await api.platelet.createMatch({ request_id: req.id, donor_id: userId! });
                                            toast.success("Donation intent recorded!");
                                        } catch (e: any) { toast.error(e.message); }
                                    }}
                                    className="bg-platelet text-white font-body font-semibold rounded-lg text-xs px-3 h-8 shrink-0">
                                    Donate
                                </Button>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE PANEL — for milk, marrow, organ (navigate to module page)
// ─────────────────────────────────────────────────────────────────────────────
function SimpleModulePanel({ modKey }: { modKey: string }) {
    const mod = MODULE_CONFIG[modKey];
    if (!mod) return null;