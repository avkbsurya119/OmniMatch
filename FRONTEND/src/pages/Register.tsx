import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Heart, ArrowLeft, CheckCircle2, Eye, EyeOff, ChevronRight, ChevronLeft } from "lucide-react";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/AuthContext";
import { toast } from "sonner";

const donorTypes = [
  { id: "blood", label: "Blood", emoji: "🩸" },
  { id: "platelet", label: "Platelets", emoji: "⏱️" },
  { id: "milk", label: "Breast Milk", emoji: "🍼", womenOnly: true },
];

const bloodGroups = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

function DonorRegister() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [showPass, setShowPass] = useState(false);
  const [bloodGroup, setBloodGroup] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState<string | null>(null);
  const [otpExpiry, setOtpExpiry] = useState<number | null>(null);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [gender, setGender] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpError, setOtpError] = useState("");
  const navigate = useNavigate();

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [dob, setDob] = useState("");
  const [city, setCity] = useState("");
  const [pincode, setPincode] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const toggleType = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSendOtp = () => {
    if (!mobile || mobile.length < 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setOtpExpiry(Date.now() + 2 * 60 * 1000); // 2 mins
    setOtpSent(true);
    setOtpVerified(false);
    setEnteredOtp("");
    setError("");
    setOtpError("");
  };

  const handleVerifyOtp = () => {
    setOtpError("");
    if (!generatedOtp || !otpExpiry) return;
    if (Date.now() > otpExpiry) {
      setOtpError("OTP Expired! Please request a new one.");
      return;
    }
    if (enteredOtp === generatedOtp) {
      setOtpVerified(true);
      setOtpError("");
      setError("");
    } else {
      setOtpError("Incorrect OTP! Please try again.");
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (password !== confirmPass) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await api.auth.registerDonor({
        first_name: firstName,
        last_name: lastName,
        mobile,
        aadhaar: aadhaar || undefined,
        dob: dob || undefined,
        gender: gender || undefined,
        city,
        pincode: pincode || undefined,
        blood_group: bloodGroup,
        donor_types: selected,
        email,
        password,
      });
      toast.success("Account created successfully! Please log in to continue.");
      navigate("/login");
    } catch (e: any) {
      let msg = e.message || "Registration failed";
      if (typeof msg === "object" || msg === "[object Object]") {
          msg = "Please check all required fields and try again.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${s <= step ? "bg-gradient-primary" : "bg-muted"
              }`}
          />
        ))}
      </div>

      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="font-display text-xl font-bold text-foreground">Personal Details</h3>
            <p className="font-body text-sm text-muted-foreground">Step 1 of 3</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">First Name</Label>
              <Input placeholder="Arjun" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-11 rounded-xl font-body" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">Last Name</Label>
              <Input placeholder="Sharma" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-11 rounded-xl font-body" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="font-body font-semibold text-sm">Mobile Number</Label>
            <div className="flex gap-2">
              <Input type="tel" placeholder="+91 98765 43210" value={mobile} onChange={(e) => setMobile(e.target.value)} disabled={otpVerified} className="h-11 rounded-xl font-body flex-1" />
              <Button variant="outline" type="button" onClick={handleSendOtp} disabled={otpVerified} className="h-11 border-primary text-primary hover:bg-primary hover:text-primary-foreground rounded-xl font-body min-w-[80px]">
                {otpSent ? (otpVerified ? <CheckCircle2 className="w-5 h-5 mx-auto" /> : "Resend") : "OTP"}
              </Button>
            </div>
          </div>
          {otpSent && !otpVerified && generatedOtp && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-sm font-body text-primary text-center">
              Mock OTP: <span className="font-bold text-lg tracking-widest ml-1">{generatedOtp}</span> (valid for 2 mins)
            </div>
          )}
          {otpSent && !otpVerified && (
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">Enter OTP</Label>
              <div className="flex gap-2">
                <Input placeholder="6-digit OTP" maxLength={6} value={enteredOtp} onChange={(e) => { setEnteredOtp(e.target.value); setOtpError(""); }} className="h-11 rounded-xl font-body tracking-[0.3em] text-center flex-1" />
                <Button type="button" onClick={handleVerifyOtp} className="h-11 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-body">
                  Verify
                </Button>
              </div>
              {otpError && <p className="font-body text-xs text-blood font-semibold mt-1">{otpError}</p>}
            </div>
          )}
          {otpVerified && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-sm font-body text-green-600 flex items-center justify-center gap-2 font-semibold">
              <CheckCircle2 className="w-5 h-5" /> Phone Number Verified
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="font-body font-semibold text-sm">Aadhaar Number</Label>
            <Input placeholder="XXXX XXXX XXXX" value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} className="h-11 rounded-xl font-body" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">Date of Birth</Label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-11 rounded-xl font-body" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">Gender</Label>
              <div className="flex gap-2">
                {["Male", "Female", "Other"].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`flex-1 h-11 rounded-xl border-2 font-body text-xs font-semibold transition-all ${gender === g
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">City</Label>
              <Input placeholder="Mumbai" value={city} onChange={(e) => setCity(e.target.value)} className="h-11 rounded-xl font-body" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-body font-semibold text-sm">PIN Code</Label>
              <Input placeholder="400001" value={pincode} onChange={(e) => setPincode(e.target.value)} className="h-11 rounded-xl font-body" />
            </div>
          </div>
          <Button onClick={() => {
            if (!firstName.trim() || !mobile.trim() || !city.trim()) {
              setError("Please fill in your name, mobile number, and city before continuing.");
              return;
            }
            if (!otpVerified) {
              setError("Please verify your mobile number with OTP before continuing.");
              return;
            }
            setError("");
            setStep(2);
          }} className="w-full h-12 bg-gradient-primary text-primary-foreground font-body font-bold rounded-xl shadow-primary">
            Continue <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          {error && step === 1 && <p className="font-body text-sm text-blood font-semibold text-center">{error}</p>}
        </motion.div>
      )}

      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
          <div className="text-center mb-4">
            <h3 className="font-display text-xl font-bold text-foreground">Donation Preferences</h3>
            <p className="font-body text-sm text-muted-foreground">Step 2 of 3 — Select what you'd like to donate</p>
          </div>

          {/* Blood group */}
          <div className="space-y-2">
            <Label className="font-body font-semibold text-sm">Blood Group</Label>
            <div className="grid grid-cols-4 gap-2">
              {bloodGroups.map((bg) => (
                <button
                  key={bg}
                  onClick={() => setBloodGroup(bg)}
                  className={`h-11 rounded-xl border-2 font-display font-bold text-sm transition-all ${bloodGroup === bg
                    ? "border-blood bg-blood/10 text-blood"
                    : "border-border text-muted-foreground hover:border-blood/30"
                    }`}
                >
                  {bg}
                </button>
              ))}
            </div>
          </div>

          {/* Donation types */}
          <div className="space-y-2">
            <Label className="font-body font-semibold text-sm">What would you like to donate?</Label>
            <div className="grid grid-cols-2 gap-2">
              {donorTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  disabled={type.womenOnly && gender === "Male"}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${selected.includes(type.id)
                    ? "border-primary bg-primary/8 text-primary"
                    : "border-border hover:border-primary/30"
                    }`}
                >
                  <span className="text-xl">{type.emoji}</span>
                  <div>
                    <div className="font-body text-sm font-semibold text-foreground">{type.label}</div>
                    {type.womenOnly && (
                      <div className="font-body text-xs text-muted-foreground">Women only</div>
                    )}
                  </div>
                  {selected.includes(type.id) && (
                    <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ID Upload */}
          <div className="space-y-2">
            <Label className="font-body font-semibold text-sm">Upload Government ID</Label>
            <FileUploadZone
              accept="image/*,.pdf"
              maxSizeMB={5}
              hint="Aadhaar, PAN, Voter ID (max 5 MB)"
              accentClass="primary"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1 h-12 border-border font-body rounded-xl"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="flex-1 h-12 bg-gradient-primary text-primary-foreground font-body font-bold rounded-xl shadow-primary"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </motion.div>
      )}

      {step === 3 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="font-display text-xl font-bold text-foreground">Create Account</h3>
            <p className="font-body text-sm text-muted-foreground">Step 3 of 3 — Almost there!</p>
          </div>
          <div className="space-y-1.5">
            <Label className="font-body font-semibold text-sm">Email Address</Label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl font-body" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-body font-semibold text-sm">Password</Label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}