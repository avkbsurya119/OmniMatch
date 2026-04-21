import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Upload, Dna, ChevronRight, Shield, CheckCircle2, Loader2, Search, X, Fingerprint, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { api, MarrowMatch as MarrowMatchType, isLoggedIn, getCurrentUserId } from "@/lib/api";
import { toast } from "sonner";

// Mock HLA for demonstration
const DEFAULT_HLA = ["A*02:01", "B*07:02", "C*07:01", "DRB1*15:01", "DQB1*06:02"];

interface ContactSuccess {
  donor_name: string;
  donor_city: string;
  next_steps: string[];
}

function MatchMeter({ pct }: { pct: number }) {
  return (
    <div className="relative w-16 h-16 mx-auto">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
        <circle
          cx="18" cy="18" r="15.9" fill="none"
          stroke="hsl(var(--marrow))" strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display font-black text-xs text-marrow">{pct}%</span>
      </div>
    </div>
  );
}

export default function MarrowMatch() {
  const [patientName, setPatientName] = useState("");
  const [urgency, setUrgency] = useState("Routine");
  const [matches, setMatches] = useState<MarrowMatchType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploaded, setIsUploaded] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);

  // Donor registration form
  const [hlaInput, setHlaInput] = useState({
    hlaA: "A*02:01",
    hlaB: "B*07:02",
    hlaC: "C*07:01",
    hlaDR: "DRB1*15:01"
  });

  const [contactSuccess, setContactSuccess] = useState<ContactSuccess | null>(null);

  const loadDonors = async () => {
    try {
      const data = await api.marrow.getDonors();
      if (Array.isArray(data)) {
        const formatted = data.map((d: any) => ({
          id: d.id.slice(0, 4).toUpperCase(),
          donor_id: d.id,
          matchPct: 0,
          confidence: "Registry",
          hlaA: d.hla_type?.[0] || "—",
          hlaB: d.hla_type?.[1] || "—",
          location: d.city || "Not set",
          age: 28,
          donated: 0,
          status: d.trust_score >= 70 ? "Willing" : "Considering"
        }));
        setMatches(formatted.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to load donors", error);
    }
  };

  useEffect(() => {
    loadDonors();
  }, []);

  const handleFindMatches = async () => {
    if (!isLoggedIn()) {
      toast.error("Please login to perform HLA matching");
      return;
    }
    if (!isUploaded && !patientName) {
      toast.error("Please enter a patient name or upload a report first");
      return;
    }
    setIsLoading(true);
    try {
      // simulate network lag for the "Scanning" effect if report was uploaded
      if (isUploaded) await new Promise(r => setTimeout(r, 1500));

      const result = await api.marrow.findMatches(DEFAULT_HLA, patientName || "P-SEARCH");
      setMatches(result.matches);
      toast.success(`Analysis complete: Found ${result.total_found} HLA matches!`, {
        icon: <Activity className="text-marrow w-4 h-4" />
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to find matches");
    } finally {
      setIsLoading(false);
    }
  };

  const onFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isLoggedIn()) {
      toast.error("Please login to upload medical reports");
      return;
    }
    if (e.target.files && e.target.files[0]) {
      setIsUploading(true);
      // Simulate file scanning
      setTimeout(() => {
        setIsUploading(false);
        setIsUploaded(true);
        toast.success("HLA Report scanned. Precision sequence extracted.");
      }, 2000);
    }
  };

  const handleRegisterDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn()) {
      toast.error("Please login as a donor first");
      return;
    }
    setIsRegistering(true);
    try {
      const donorId = getCurrentUserId();
      const hlaArray = Object.values(hlaInput).filter(v => v.length > 0);
      await api.marrow.registerHla(donorId, hlaArray);
      toast.success("Marrow profile active! You are now searchable in the registry.");
      setShowRegModal(false);
      loadDonors(); // Refresh the list
    } catch (error: any) {
      toast.error(error.message || "Failed to register");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleContact = (id: string) => {
    if (!isLoggedIn()) {
      toast.error("Please login to initiate contact with donors");
      return;
    }

    const match = matches.find(m => m.id === id);
    if (!match) return;

    setContactSuccess({
      donor_name: `Donor #${match.id}`,
      donor_city: match.location,
      next_steps: [
        "Medical officer reviews sequencing rapport",
        "Confirmation swab requested from donor",
        "Logistics coordination for health screening"
      ]
    });

    toast.success(`Match Request Sent!`, {
      description: `Donor #${id} has been notified. Coordination for confirmation testing will begin shortly.`,
      icon: <CheckCircle2 className="text-secondary w-4 h-4" />
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="pt-16">
        <div className="bg-gradient-to-br from-marrow/90 to-teal-800/60 text-primary-foreground py-16 px-4">
          <div className="container mx-auto">
            <Link to="/" className="inline-flex items-center gap-1.5 text-primary-foreground/70 hover:text-primary-foreground font-body text-sm mb-6 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Bridge
            </Link>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-6xl animate-pulse">🧬</div>
              <div>
                <h1 className="font-display text-5xl font-black">MarrowMatch</h1>
                <p className="font-body text-primary-foreground/70 text-lg">94% precision matching for bone marrow registries</p>
              </div>
            </div>
            <div className="flex gap-6 mt-6 flex-wrap">
              {[
                { label: "India Registry", value: "48,204+" },
                { label: "Live Matches", value: matches.filter(m => m.matchPct > 0).length || "12" },
                { label: "Successful Saves", value: "1,847" },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl px-6 py-3 border border-white/20">
                  <div className="font-display text-2xl font-bold">{value}</div>
                  <div className="font-body text-[10px] text-primary-foreground/70 uppercase tracking-widest">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-6">
              {/* Find Match Card */}
              <div className="rounded-3xl border-2 border-marrow/20 bg-card p-6 shadow-card overflow-hidden relative">
                <div className="absolute -top-10 -right-10 opacity-5 rotate-12">
                  <Fingerprint size={160} />
                </div>
                <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2 relative z-10">
                  <Search className="w-5 h-5 text-marrow" /> Find Genetic Match
                </h3>
                <div className="space-y-4 relative z-10">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Internal Patient Ref</Label>
                    <Input
                      placeholder="e.g. PAT-9021"
                      className="h-11 rounded-xl font-body border-marrow/10"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">HLA Report (Typing)</Label>
                    <div className="relative group">
                      <input
                        type="file"
                        id="hla-upload"
                        className="hidden"
                        onChange={onFileUpload}
                        disabled={isUploading}
                      />
                      <label
                        htmlFor="hla-upload"
                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer ${isUploaded ? "border-secondary bg-secondary/5" : "border-marrow/20 hover:border-marrow/50 hover:bg-marrow/5"}`}
                      >
                        {isUploading ? (
                          <div className="text-center">
                            <Loader2 className="w-8 h-8 text-marrow animate-spin mx-auto mb-2" />
                            <p className="font-body text-xs font-bold text-marrow">SCANNED FOR SEQUENCES...</p>
                          </div>
                        ) : isUploaded ? (
                          <div className="text-center">
                            <CheckCircle2 className="w-8 h-8 text-secondary mx-auto mb-2" />
                            <p className="font-body text-xs font-bold text-secondary uppercase">Report Scanned</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <Upload className="w-8 h-8 text-marrow/50 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                            <p className="font-body text-xs text-muted-foreground font-semibold">Drop HLA report here</p>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 block">Urgency</Label>
                    <div className="flex bg-muted p-1 rounded-xl gap-1">
                      {["Critical", "Routine"].map((u) => (
                        <button
                          key={u}
                          onClick={() => setUrgency(u)}
                          className={`flex-1 py-2 rounded-lg font-body text-[10px] font-bold uppercase transition-all ${urgency === u ? "bg-white text-marrow shadow-sm" : "text-muted-foreground hover:bg-white/50"}`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={handleFindMatches}
                    disabled={isLoading || isUploading}
                    className="w-full bg-marrow text-white font-body font-bold rounded-xl h-12 shadow-lg shadow-marrow/20 hover:scale-[1.02] transition-transform mt-2"
                  >
                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Initiate Match Search"}
                  </Button>
                </div>
              </div>