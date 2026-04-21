import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { api, getCurrentUserId, Notification } from "@/lib/api";

export type UserRole = "donor" | "hospital" | "admin" | null;
export type OrgType = "hospital" | "bloodbank" | "orphanage" | "ngo" | null;

export interface UserProfile {
    name?: string;
    city?: string;
    blood_group?: string;
    trust_score?: number;
    is_verified?: boolean;
    donor_types?: string[];
    lat?: number;
    lng?: number;
}

interface AuthContextType {
    role: UserRole;
    orgType: OrgType;
    userName: string;
    profile: UserProfile | null;
    notifications: Notification[];
    unreadCount: number;
    login: (role: UserRole, userName: string, orgType?: OrgType, profile?: UserProfile) => void;
    logout: () => void;
    markNotificationsRead: () => Promise<void>;
    refreshNotifications: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    role: null,
    orgType: null,
    userName: "",
    profile: null,
    notifications: [],
    unreadCount: 0,
    login: () => { },
    logout: () => { },
    markNotificationsRead: async () => { },
    refreshNotifications: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<UserRole>(() => {
        const saved = localStorage.getItem("lfc_role");
        return (saved as UserRole) || null;
    });
    const [orgType, setOrgType] = useState<OrgType>(() => {
        const saved = localStorage.getItem("lfc_orgType");
        return (saved as OrgType) || null;
    });
    const [userName, setUserName] = useState(() => {
        return localStorage.getItem("lfc_userName") || "";
    });
    const [profile, setProfile] = useState<UserProfile | null>(() => {
        const saved = localStorage.getItem("lfc_profile");
        return saved ? JSON.parse(saved) : null;
    });
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    // Fetch notifications for the current user
    const refreshNotifications = useCallback(async () => {
        const userId = getCurrentUserId();
        if (!userId) return;
        try {
            const data = await api.notifications.get(userId);
            setNotifications(data);
        } catch {
            // silently fail — notifications are non-critical
        }
    }, []);

    // Mark all current unread notifications as read
    const markNotificationsRead = useCallback(async () => {
        const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
        if (unreadIds.length === 0) return;
        try {
            await api.notifications.markRead(unreadIds);
            setNotifications((prev) =>
                prev.map((n) => (unreadIds.includes(n.id) ? { ...n, is_read: true } : n))
            );
        } catch {
            // silently fail
        }
    }, [notifications]);
