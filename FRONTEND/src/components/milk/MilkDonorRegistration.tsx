import { useState } from "react";
import { Loader2, Droplets, Heart, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { api, getCurrentUserId, isLoggedIn } from "@/lib/api";
import { toast } from "sonner";

interface MilkDonorRegistrationProps {
  onSuccess?: () => void;
}

export default function MilkDonorRegistration({ onSuccess }: MilkDonorRegistrationProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    babyAge: "",
    qty: 0,
    location: "",
    pincode: "",
    isAnonymous: false,
    availabilityStart: "08:00",
    availabilityEnd: "20:00"
  });

  const handleRegisterDonor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn()) {
      toast.error("Please login to register as a donor");
      return;
    }
    const donorId = getCurrentUserId();

    if (!donorId) {
      toast.error("Your session is missing a user ID. Please log out and log in again.");
      return;
    }

    if (!formData.babyAge || formData.qty <= 0) {
      toast.error("Please fill in baby's age and quantity");
      return;
    }

    setIsSubmitting(true);
    try {
      const ageM = parseInt(formData.babyAge) || 1;
      await api.milk.registerDonor({
        donor_id: donorId,
        baby_age_months: ageM,
        quantity_ml_per_day: formData.qty,
        city: formData.location || undefined,
        pincode: formData.pincode || undefined,
        is_anonymous: formData.isAnonymous,
        availability_start: formData.availabilityStart,
        availability_end: formData.availabilityEnd
      });
      toast.success("Successfully registered as a milk donor!");
      setFormData({
        babyAge: "", qty: 0, location: "", pincode: "",
        isAnonymous: false, availabilityStart: "08:00", availabilityEnd: "20:00"
      });
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to register as donor");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-milk/30 bg-card p-6 shadow-card overflow-hidden relative">
      <div className="absolute -top-6 -right-6 text-milk/10 transform rotate-12">
        <Droplets size={120} />
      </div>
      <h3 className="font-display text-lg font-bold mb-4 flex items-center gap-2 relative z-10">
        <Heart className="w-5 h-5 text-milk" /> Register to Donate
        <Badge className="bg-milk/20 text-milk border-0 font-body text-[10px] ml-auto uppercase font-black">NICU Priority</Badge>
      </h3>
      <form onSubmit={handleRegisterDonor} className="space-y-4 relative z-10">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="font-body text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Baby's Age (Months)</Label>
            <Input
              placeholder="e.g. 3"
              type="number"
              min={0}
              max={24}