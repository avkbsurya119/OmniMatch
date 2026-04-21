import { motion } from "framer-motion";
import { MapPin, Sparkles, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MilkDonor } from "@/lib/api";

interface MilkDonorCardProps {
  donor: MilkDonor;
  index: number;
  role: string;
  onRequest: (donor: MilkDonor) => void;
}

export default function MilkDonorCard({ donor, index, role, onRequest }: MilkDonorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-3xl border-2 border-milk/10 bg-card p-5 shadow-card hover:border-milk/40 transition-all group"
    >
      <div className="w-14 h-14 rounded-2xl bg-milk/10 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 transition-transform">
        {donor.is_anonymous ? "🤱" : "👩‍🍼"}
      </div>
      <div className="text-center mb-4">
        <div className="font-display font-bold text-md flex items-center justify-center gap-1.5 min-h-[28px]">
          {donor.name}
          {donor.verified && <Sparkles size={14} className="text-amber-500 fill-amber-500" />}
          {donor.is_screened && <Shield size={14} className="text-secondary" />}
        </div>
        {donor.babyAge && (
          <div className="font-body text-[11px] text-muted-foreground uppercase tracking-widest mt-1">
            Baby Age: {donor.babyAge}
          </div>
        )}
        <div className="font-body text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
          <MapPin className="w-3 h-3" /> {donor.area}
          {donor.distance && <span className="text-milk">({donor.distance})</span>}
        </div>
      </div>

      <div className="p-3 rounded-2xl bg-milk/5 border border-milk/20 text-center mb-4 shadow-inner">
        <div className="font-display font-black text-xl text-milk">{donor.qty}</div>
        <div className="font-body text-[10px] font-bold text-muted-foreground uppercase opacity-70">daily surplus</div>
      </div>

      <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
        <Badge className="bg-secondary/10 text-secondary border-0 font-body text-[10px] h-6 px-3 rounded-full flex gap-1">
          {donor.impact}
        </Badge>
        {donor.is_screened && (
          <Badge className="bg-green-100 text-green-700 border-0 font-body text-[9px]">
            SCREENED
          </Badge>
        )}
        {donor.screening_status === "pending" && (
          <Badge className="bg-amber-100 text-amber-700 border-0 font-body text-[9px]">
            PENDING SCREEN
          </Badge>
        )}
      </div>

      <Button
        onClick={() => onRequest(donor)}
        size="sm"
        className="w-full bg-milk text-foreground font-body text-xs font-bold rounded-xl h-10 hover:shadow-lg shadow-milk/10"
      >
        {role === "hospital" ? "Request Match" : "Contact NICU"}
      </Button>
    </motion.div>
  );
}
