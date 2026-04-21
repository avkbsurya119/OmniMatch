import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LiveCounter from "@/components/LiveCounter";
import ModuleCard from "@/components/ModuleCard";
import heroBg from "@/assets/hero-bg.jpg";
import { useAuth } from "@/hooks/AuthContext";
import { toast } from "sonner";

const modules = [
  {
    emoji: "🩸",
    name: "BloodBridge",
    tagline: "Real-time blood matching",
    description: "Instant blood group matching with nearby verified donors. Smart shortage prediction and urgency-based alerts for hospitals.",
    path: "/blood-bridge",
    color: "text-blood",
    bgColor: "bg-blood",
    borderColor: "border-blood/20",
    stats: "2.3M donors",
  },
  {
    emoji: "💉",
    name: "ThalCare",
    tagline: "Recurring transfusion support",
    description: "Dedicated donor matching for Thalassemia patients. Automated scheduling, transfusion calendars, and 7-day advance alerts.",
    path: "/thal-care",
    color: "text-thal",
    bgColor: "bg-thal",
    borderColor: "border-thal/20",
    stats: "4.2L patients",
  },
  {
    emoji: "⏱️",
    name: "PlateletAlert",
    tagline: "5-day expiry, zero waste",
    description: "Cancer patient platelet matching with 5-day viability tracking. Compatible score beyond blood group. Apheresis calendar.",
    path: "/platelet-alert",
    color: "text-platelet",
    bgColor: "bg-platelet",
    borderColor: "border-platelet/20",
    stats: "48hr match",
  },
  {
    emoji: "🍼",
    name: "MilkBridge",
    tagline: "Nourishing premature lives",
    description: "Connecting lactating mothers with NICUs and orphanages. Milk Passport QR system, pasteurization tracking, and impact stories.",
    path: "/milk-bridge",
    color: "text-milk",
    bgColor: "bg-milk",
    borderColor: "border-milk/20",
    stats: "27M babies",
  },
];

const steps = [
  {
    icon: "📋",
    step: "01",
    title: "Register & Verify",
    description: "Sign up with Aadhaar + Mobile OTP. Upload medical documents for instant verification. Get your Trust Score badge.",
    color: "text-blood",
  },
  {
    icon: "🤖",
    step: "02",
    title: "Smart Match",
    description: "Our AI engine matches donors with patients based on blood group, HLA type, location proximity, availability, and urgency score.",
    color: "text-secondary",
  },
  {
    icon: "🤝",
    step: "03",
    title: "Connect & Save",
    description: "Receive real-time alerts. Connect via secure in-app messaging. Coordinate with hospitals. Log your donation and earn trust points.",
    color: "text-accent",
  },
];

const partners = [
  "AIIMS Delhi", "Tata Memorial", "Apollo Hospitals", "NOTTO", "NACO",
  "Red Cross India", "Rotary Blood Bank", "iBlood"
];

export default function Index() {
  const { role } = useAuth();
  const navigate = useNavigate();

  const handleFindDonors = () => {
    if (!role) {
      toast.error("Please log in to continue", {
        description: "You need to be logged in to find donors.",
        action: {
          label: "Login",
          onClick: () => navigate("/login"),
        },
      });
      return;
    }
    navigate("/blood-bridge");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt="OmniMatch - Connecting donors with patients"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-foreground/85 via-foreground/70 to-primary/60" />
        </div>

        {/* Decorative elements */}
        <div className="absolute top-24 right-10 w-64 h-64 rounded-full bg-primary/10 blur-3xl animate-float" />
        <div className="absolute bottom-16 left-10 w-48 h-48 rounded-full bg-accent/15 blur-3xl animate-float" style={{ animationDelay: "2s" }} />

        <div className="container mx-auto px-4 relative pt-24 pb-16">
          <div className="max-w-3xl">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-6"
            >
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="font-body text-sm font-semibold text-primary-foreground">
                India's #1 Life-Saving Donation Platform
              </span>
            </motion.div>

            {/* Main headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-5xl md:text-7xl font-black text-primary-foreground leading-[1.05] mb-5"
            >
              Connect.
              <span className="block gradient-text-amber">Save Lives.</span>
              Instantly.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="font-body text-lg md:text-xl text-primary-foreground/80 leading-relaxed max-w-xl mb-8"
            >
              Blood · Platelets · Plasma · Mother's Milk.
              <br />
              Four modules. One platform. Zero delays. <strong className="text-accent">Thousands saved daily.</strong>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              {/* Find Donors Now — requires login */}
              <Button
                size="lg"
                onClick={handleFindDonors}
                className="font-body font-bold text-base px-8 py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary-lg rounded-xl"
              >
                Find Donors Now <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
              <Link to="/register">
                <Button
                  size="lg"
                  variant="outline"
                  className="font-body font-bold text-base px-8 py-6 !bg-transparent border-2 border-primary-foreground/60 text-primary-foreground hover:!bg-primary-foreground/10 rounded-xl"
                >
                  Register to Donate
                </Button>
              </Link>
            </motion.div>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex flex-wrap gap-5 mt-10"
            >
              {[
                { icon: <CheckCircle2 className="w-4 h-4" />, label: "Aadhaar Verified" },
                { icon: <Users className="w-4 h-4" />, label: "12L+ Active Donors" },
                { icon: <Zap className="w-4 h-4" />, label: "< 5 min Matching" },
              ].map(({ icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-primary-foreground/80">
                  <span className="text-accent">{icon}</span>
                  <span className="font-body text-sm font-medium">{label}</span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
          <div className="w-5 h-8 rounded-full border-2 border-primary-foreground/40 flex items-start justify-center p-1">
            <motion.div
              animate={{ y: [0, 10, 0] }}