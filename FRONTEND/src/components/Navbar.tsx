import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Heart, LogOut, LayoutDashboard, Settings, Bell, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/AuthContext";
import { api } from "@/lib/api";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const { role, userName, logout, notifications, unreadCount, markNotificationsRead } = useAuth();

  const profileRef = useRef<HTMLDivElement>(null);
  const alertsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    api.auth.logout();  // clear localStorage tokens
    logout();           // clear React state
    navigate("/");
  };

  const handleAlertsOpen = () => {
    const opening = !alertsOpen;
    setAlertsOpen(opening);
    setProfileOpen(false);

    // Mark as read when CLOSING, not opening
    if (!opening && unreadCount > 0) {
      markNotificationsRead();
    }
  };

  const handleProfileOpen = () => {
    setProfileOpen((p) => !p);
    setAlertsOpen(false);
  };

  const isHome = location.pathname === "/";
  const textColor = scrolled || !isHome ? "text-foreground" : "text-primary-foreground";

  // Only show unread notifications in the dropdown (they disappear once read)
  const unreadNotifications = notifications.filter((n) => !n.is_read);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled || !isHome
      ? "bg-card/95 backdrop-blur-md shadow-card border-b border-border"
      : "bg-transparent"
      }`}>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-primary">
              <Heart className="w-5 h-5 text-primary-foreground fill-current" />
            </div>
            <div className="leading-tight">
              <span className={`font-display font-bold text-lg ${textColor}`}>OmniMatch</span>
              <span className={`font-body text-xs block -mt-1 font-semibold tracking-widest uppercase ${scrolled || !isHome ? "text-primary" : "text-accent"}`}>
                Connect
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/dashboard"
              className={`font-body text-sm font-medium transition-colors hover:opacity-80 ${textColor}`}
            >
              Dashboard
            </Link>

            <Link
              to="/ai-companion"
              className={`font-body text-sm font-bold flex items-center gap-1.5 transition-colors hover:opacity-80 ${textColor}`}
            >
              <span className="animate-pulse text-lg">✨</span> AI Companion
            </Link>

            {!role ? (
              <>
                <Link to="/login">
                  <Button variant="outline" size="sm" className={`font-body font-semibold border-2 ${scrolled || !isHome
                    ? "border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    : "!bg-transparent border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/10"
                    }`}>
                    Login
                  </Button>
                </Link>
                <Link to="/register">
                  <Button size="sm" className="font-body font-semibold bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-primary">
                    Donate / Register
                  </Button>
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-2">

                {/* ── Alerts button ── */}
                <div className="relative" ref={alertsRef}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAlertsOpen}
                    className="border-border font-body rounded-xl gap-1.5 relative"
                  >
                    <Bell className="w-4 h-4" />
                    Alerts
                    {unreadCount > 0 && (
                      <Badge className="ml-0.5 bg-primary text-primary-foreground text-xs border-0">
                        {unreadCount}
                      </Badge>
                    )}
                  </Button>

                  <AnimatePresence>
                    {alertsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl shadow-lg border border-border overflow-hidden z-50"
                      >
                        <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
                          <span className="font-display font-bold text-sm text-foreground">Notifications</span>
                          {unreadNotifications.length > 0 && (
                            <Badge className="bg-primary/10 text-primary border-0 text-xs font-body">
                              {unreadNotifications.length} new
                            </Badge>
                          )}
                        </div>

                        <div className="max-h-80 overflow-y-auto">
                          {unreadNotifications.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                              <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="font-body text-sm text-muted-foreground font-semibold">All caught up!</p>
                              <p className="font-body text-xs text-muted-foreground mt-0.5">No new notifications</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-border">
                              {unreadNotifications.map((n) => (
                                <div key={n.id} className="px-4 py-3 hover:bg-muted/40 transition-colors">
                                  <div className="flex items-start gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 mt-0.5 ${n.type === "blood_request" ? "bg-blood/10 text-blood" :
                                      n.type === "blood_response" ? "bg-secondary/10 text-secondary" :
                                        "bg-primary/10 text-primary"
                                      }`}>
                                      {n.type === "blood_request" ? "🩸" :
                                        n.type === "blood_response" ? "✅" : "🔔"}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-body font-semibold text-sm text-foreground">{n.title}</p>
                                      <p className="font-body text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                                      <div className="flex items-center gap-1 mt-1">
                                        <Clock className="w-3 h-3 text-muted-foreground" />
                                        <span className="font-body text-[10px] text-muted-foreground">
                                          {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>