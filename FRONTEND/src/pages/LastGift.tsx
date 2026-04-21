import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Clock, MapPin, Heart, QrCode,
  ChevronRight, Check, Loader2, RefreshCw, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { api, OrganViability, OrganRecipient, getCurrentUserId, isLoggedIn } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Fallback data used when the API has no rows yet ──────────────────────────
const FALLBACK_ORGANS: OrganViability[] = [
  { name: "Heart", emoji: "❤️", window: "4–6 hrs", viabilityHrs: 5, color: "text-blood" },
  { name: "Liver", emoji: "🫀", window: "12–24 hrs", viabilityHrs: 18, color: "text-thal" },
  { name: "Kidney", emoji: "🫘", window: "24–36 hrs", viabilityHrs: 30, color: "text-organ" },
  { name: "Lungs", emoji: "🫁", window: "4–6 hrs", viabilityHrs: 5, color: "text-marrow" },
  { name: "Pancreas", emoji: "🔬", window: "12–18 hrs", viabilityHrs: 15, color: "text-platelet" },
  { name: "Cornea", emoji: "👁️", window: "5–7 days", viabilityHrs: 144, color: "text-milk" },
];

// ── Viability timer bar ──────────────────────────────────────────────────────
function ViabilityTimer({ name, hrs, maxHrs }: { name: string; hrs: number; maxHrs: number }) {
  const pct = (hrs / maxHrs) * 100;
  const remaining = Math.round(hrs * 0.6);
  return (
    <div className="p-3 rounded-xl border border-border bg-card">
      <div className="flex justify-between items-center mb-2">
        <span className="font-body text-xs font-semibold text-foreground">{name}</span>
        <span className={`font-display font-bold text-sm ${hrs < 8 ? "text-blood animate-pulse" : "text-organ"}`}>
          {remaining}h left
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${hrs < 8 ? "bg-blood" : "bg-organ"}`}
          style={{ width: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function LastGift() {
  const { toast } = useToast();
  const navigate = useNavigate();

  // ── Data state ──
  const [organs, setOrgans] = useState<OrganViability[]>([]);
  const [recipients, setRecipients] = useState<OrganRecipient[]>([]);
  const [stats, setStats] = useState({ pledged: "—", organTypes: "—", livesSaved: "—" });

  // ── Loading / error ──
  const [loadingOrgans, setLoadingOrgans] = useState(true);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [errorOrgans, setErrorOrgans] = useState(false);
  const [errorRecipients, setErrorRecipients] = useState(false);

  // ── Pledge flow ──
  const [selectedOrgans, setSelectedOrgans] = useState<string[]>([]);
  const [pledging, setPledging] = useState(false);
  const [pledgeResult, setPledgeResult] = useState<{ id: string; organs: string[] } | null>(null);

  // ── Matching ──
  const [matchingId, setMatchingId] = useState<string | null>(null);

  // ── Fetch organ viability data ──
  const fetchOrgans = async () => {
    setLoadingOrgans(true);
    setErrorOrgans(false);
    try {
      const data = await api.organ.getViability();
      setOrgans(data && data.length > 0 ? data : FALLBACK_ORGANS);
    } catch {
      setOrgans(FALLBACK_ORGANS);
      setErrorOrgans(true);
    } finally {
      setLoadingOrgans(false);
    }
  };

  // ── Fetch recipients ──
  const fetchRecipients = async () => {
    setLoadingRecipients(true);
    setErrorRecipients(false);
    try {
      const data = await api.organ.getRecipients();
      setRecipients(data || []);
    } catch {
      setRecipients([]);
      setErrorRecipients(true);
    } finally {
      setLoadingRecipients(false);
    }
  };

  // ── Fetch platform stats ──
  const fetchStats = async () => {
    try {
      const s = await api.stats();
      setStats({
        pledged: s.active_donors_online > 999
          ? `${(s.active_donors_online / 1000).toFixed(1)}K`
          : String(s.active_donors_online || 0),
        organTypes: "6",
        livesSaved: s.lives_impacted?.toLocaleString() || "0",
      });
    } catch {
      setStats({ pledged: "—", organTypes: "6", livesSaved: "—" });
    }
  };

  useEffect(() => {
    fetchOrgans();
    fetchRecipients();
    fetchStats();
  }, []);

  // ── Toggle organ selection ──
  const toggleOrgan = (organName: string) => {
    setSelectedOrgans((prev) =>
      prev.includes(organName)
        ? prev.filter((o) => o !== organName)
        : [...prev, organName]
    );
  };

  // ── Pledge card button ──
  const handlePledge = async () => {
    if (!isLoggedIn()) {
      toast({
        title: "Login Required",
        description: "Please log in to pledge your organs.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (selectedOrgans.length === 0) {
      toast({
        title: "No Organs Selected",
        description: "Please select at least one organ to pledge.",
        variant: "destructive",
      });
      return;
    }

    setPledging(true);
    try {
      const result = await api.organ.createPledge({
        donor_id: getCurrentUserId(),
        organs: selectedOrgans,
        family_consent: false,
      });
      setPledgeResult({ id: result.pledge_id_short, organs: result.organs_pledged });
      toast({
        title: "🎉 Pledge Saved!",
        description: `Pledge ID: ${result.pledge_id_short} — ${result.organs_pledged.join(", ")}`,
      });
      setSelectedOrgans([]);
    } catch (err: any) {
      toast({
        title: "Pledge Failed",
        description: err.message || "Could not save your pledge. Please try again.",
        variant: "destructive",
      });
    } finally {
      setPledging(false);
    }
  };

  // ── Match button on recipients ──
  const handleMatch = async (recipient: OrganRecipient) => {
    if (!isLoggedIn()) {
      toast({
        title: "Login Required",
        description: "Please log in to match with a recipient.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    setMatchingId(recipient.id);
    // Simulate a brief processing moment
    await new Promise((r) => setTimeout(r, 600));
    toast({
      title: `Matching with ${recipient.name}`,
      description: `Organ: ${recipient.organ} · Blood: ${recipient.blood} · Hospital: ${recipient.hospital}. A coordinator will contact you shortly.`,
    });
    setMatchingId(null);
  };

  // ── Skeleton rows helper ──
  const CardSkeleton = () => (
    <div className="rounded-xl border-2 border-border bg-card p-4 space-y-3">
      <Skeleton className="h-8 w-8 rounded-lg mx-auto" />
      <Skeleton className="h-4 w-20 mx-auto" />
      <Skeleton className="h-3 w-16 mx-auto" />
    </div>
  );

  const RecipientSkeleton = () => (
    <div className="rounded-xl border-2 border-organ/20 bg-card p-4 flex items-center gap-4">
      <Skeleton className="w-10 h-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-8 w-16 rounded-lg" />
    </div>
  );

  // ── The organs to display (for pledge card + viability grid) ──
  const displayOrgans = organs.length > 0 ? organs : FALLBACK_ORGANS;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* ── Hero banner ─────────────────────────────────────────────── */}
        <div className="bg-gradient-to-br from-organ/90 to-cyan-700/60 text-primary-foreground py-16 px-4">
          <div className="container mx-auto">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground font-body text-sm mb-6"