/**
 * src/lib/api.ts
 * ──────────────────────────────────────────────────────────────────
 * Single API client for the OmniMatch frontend.
 * Place this file at:  FRONTEND/src/lib/api.ts
 *
 * Add to your FRONTEND/.env:
 *   VITE_API_URL=http://localhost:8000
 *
 * Usage in any component / page:
 *   import { api } from "@/lib/api"
 *   const donors = await api.blood.getDonors({ blood_group: "O-" })
 * ──────────────────────────────────────────────────────────────────
 */

const BASE = import.meta.env.VITE_API_URL ?? "";

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function req<T>(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined | null>
): Promise<T> {
    let url: URL | string;

    if (BASE) {
        const urlObj = new URL(BASE + path);
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
            });
        }
        url = urlObj.toString();
    } else {
        let relativePath = path;
        if (params) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) searchParams.set(k, String(v));
            });
            const queryString = searchParams.toString();
            if (queryString) relativePath += `?${queryString}`;
        }
        url = relativePath;
    }

    const headers: HeadersInit = { "Content-Type": "application/json" };

    const token = localStorage.getItem("lf_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "API request failed");
    }

    return res.json() as Promise<T>;
}

const get = <T>(path: string, params?: Record<string, any>) => req<T>("GET", path, undefined, params);
const post = <T>(path: string, body?: unknown) => req<T>("POST", path, body);
const patch = <T>(path: string, body?: unknown) => req<T>("PATCH", path, body);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: "blood_request" | "blood_response" | "general";
    created_at: string;
    is_read: boolean;
}

export interface PlatformStats {
    matches_today: number;
    lives_impacted: number;
    active_donors_online: number;
    hospitals_connected: number;
}

export interface BloodDonor {
    id: string; name: string; city: string; group: string;
    trust: number; trust_score: number; is_verified: boolean;
    available: boolean; eligible_to_donate: boolean;
    last_donated: string; distance_km: number | null; distance: string;
    lat?: number; lng?: number;
}

export interface BloodRequest {
    id: string; hospital: string; group: string; units: number;
    urgency: string; timeLeft: string; city: string; posted: string;
    hours_left?: number;
}

export interface BloodShortage {
    blood_group: string; requests: number; donors_available: number;
    deficit: number; severity: string;
}

export interface ThalPatient {
    id: string; name: string; age: number | null; group: string;
    hospital: string; hospital_id: string; freq: string; nextDate: string;
    donor: string; donor_status: string | null; donor_mobile?: string | null;
    current_match_id: string | null; current_donor_id: string | null;
    countdown: string; days_until: number | null; is_urgent: boolean;
    is_critical: boolean; needs_match_now: boolean;
    past_donor_ids: string[];
    prediction?: {
        method: "adaptive" | "fallback";
        predicted_days: number;
        confidence: number;
        trend: string;
        trend_detail: string;
    };
}

export interface CalendarDay {
    day: string; date: string; has: boolean;
    label: string | null; patients: string[];
}

export interface ThalAssignment {
    match_id: string; patient_id: string; patient_name: string;
    blood_group: string; next_transfusion: string; days_until: number | null;
    countdown: string; frequency: string; hospital: string; hospital_contact?: string | null;
    status: string; assigned_at: string; is_urgent: boolean;
}

export interface ThalPatientHistory {
    patient_id: string; patient_name: string; blood_group: string;
    frequency: number; total: number;
    history: Array<{
        match_id: string; donor_name: string; donor_group: string;
        donor_city: string; status: string; date: string;
    }>;
}

export interface ThalDashboardStats {
    due_today: number; due_this_week: number;
    overdue: number; unmatched: number; total_active: number;
}

export interface PlateletRequest {
    id: string; patient: string; real_name?: string; cancer: string; group: string;
    units: number; expiry: string; urgency: string;
    hospital: string; hospital_city: string; hospital_id: string;
    days_left: number; hours_left: number; is_critical: boolean;
}

export interface PlateletDonor {
    id: string; name: string; group: string; compat: number; trust: number;
    lastApheresis: string; nextAvail: string; city: string;
}

export interface PlateletMatch {
    match_id: string;
    request_id: string;
    patient_name: string;
    status: "pending" | "accepted" | "declined" | "confirmed" | "completed" | "cancelled";
    donor_name: string;
    donor_blood: string;
    donor_city: string;
    donor_trust: number;
    created_at: string;
    responded_at?: string;
    notes?: string;
    // For donor view
    hospital?: string;
    city?: string;
    contact?: string;
    cancer?: string;
    group?: string;
    units?: number;
    urgency?: string;
}

export interface PlateletDashboard {
    open_requests: number;
    expiring_24h: number;
    apheresis_donors: number;
    pending_matches: number;
    completed_this_week: number;
}

export interface MarrowMatch {
    id: string; donor_id: string; matchPct: number; confidence: string;
    hlaA: string; hlaB: string; location: string;
    age: number | null; donated: number; status: string;
}

export interface OrganViability {
    name: string; emoji: string; window: string;
    viabilityHrs: number; color: string;
}

export interface OrganRecipient {
    id: string; name: string; organ: string; blood: string;
    urgency: number; hospital: string; hospital_city: string;
    wait: string; distance_km: number | null; rank: number;
}

export interface MilkDonor {
    id: string; donor_id: string; name: string; babyAge: string;
    qty: string; area: string; verified: boolean; impact: string;
    pincode?: string; screening_status?: string; is_screened?: boolean;
    trust_score?: number; distance_km?: number | null; distance?: string;
    is_anonymous?: boolean; availability_start?: string; availability_end?: string;
}

export interface MilkBankRow {
    id: string; from: string; donor_id?: string; pasteurized: string;
    expiry: string; qty: string; status: string; cold_chain?: string; type?: string;
}

export interface MilkShortageAlert {
    id: string; hospital: string; city: string;
    infant_name: string | null; quantity_needed: string; message: string;
    urgency?: string; volume_ml?: number; pincode?: string;
    time_left?: string; hours_left?: number;
}

export interface MilkMatch {
    milk_donor_id: string; donor_id: string; name: string;
    city: string; pincode: string; quantity_ml: number;
    distance_km: number | null; distance: string; match_score: number;
    trust_score: number; verified: boolean; is_anonymous: boolean;
    pincode_match: boolean;
}

export interface MilkMatchResult {
    request_id: string; hospital: string; city: string;
    quantity_needed: number; urgency: string;
    total_matches: number; matches: MilkMatch[];
}

export interface MilkDonation {
    passport_id: string; donor_name: string; collection_date: string;
    volume_ml: number; pasteurized: boolean; pasteurization_date?: string;
    pasteurization_method?: string; expiry_date?: string;
    receiving_hospital?: string; receiving_city?: string;
    receiving_infant_ref?: string; status: string;
    quality_check_passed?: boolean; created_at: string;
}

export interface MilkHospitalDashboard {
    hospital: { id: string; name: string; city: string };
    stats: {
        active_requests: number; pending_matches: number;
        accepted_matches: number; total_received_ml: number;
        donations_received: number;
    };
    // BUG FIX 1: status field added — required for the frontend filter
    // .filter(r => ["open", "donor_contacted"].includes(r.status))
    active_requests: Array<{
        id: string;
        infant_ref: string;
        volume_ml: number;
        urgency: string;
        status: string;       // ← FIX: was missing, caused filter to always return []
        created_at: string;
    }>;
    matched_donors: Array<{
        id: string; donor_id: string; milk_donor_id?: string;
        donor_name: string; city: string;
        quantity_ml: number; status: string; request_id: string;
        pickup_date?: string; pickup_time?: string;
    }>;
    donation_history: Array<{
        passport_id: string; donor_name: string; volume_ml: number;
        date: string; status: string;
    }>;
}

export interface DonorDashboard {
    profile: {
        id: string; name: string; initial: string; blood_group: string;
        city: string; is_verified: boolean; donor_types: string[];
        trust_stars: number; is_available: boolean;
    };
    stats: {
        total_donations: number; lives_impacted: number;
        trust_score: number; next_eligible: string;
    };
    urgent_requests: Array<{
        type: string; module: string; group: string; hospital: string;
        distance: string; urgency: string; time: string;
    }>;
    donation_history: Array<{
        date: string; type: string; hospital: string; status: string; impact: string;
    }>;
}

export interface AdminDashboard {
    stats: {
        pending_verifications: number; flagged_accounts: number;
        total_users: number; todays_matches: number;
    };
    verification_queue: {
        donors: Array<{ id: string; name: string; type: string; city: string; docs: string; time: string }>;
        hospitals: Array<{ id: string; name: string; type: string; city: string; docs: string; time: string }>;
    };
    flagged_accounts: Array<{ id: string; name: string; city: string; trust_score: number }>;
}


// ── API surface ───────────────────────────────────────────────────────────────

export const api = {

    // ── Platform ────────────────────────────────────────────────────────────────

    stats: () =>
        get<PlatformStats>("/stats"),


    // ── Auth ────────────────────────────────────────────────────────────────────

    auth: {
        registerDonor: (body: {
            first_name: string; last_name: string; mobile: string;
            aadhaar?: string; dob?: string; gender?: string;
            city: string; pincode?: string; blood_group: string;
            donor_types: string[]; email: string; password: string;
            lat?: number; lng?: number;
        }) => post("/auth/register/donor", body),

        registerHospital: (body: {
            name: string; reg_number: string; license?: string;
            address: string; city: string; contact_person: string;
            contact_mobile: string; contact_email: string; password: string;
        }) => post("/auth/register/hospital", body),

        login: async (email: string, password: string, role = "donor") => {
            const data = await post<{ access_token: string; user_id: string; role: string; redirect: string; profile: any }>(
                "/auth/login", { email, password, role }
            );
            localStorage.setItem("lf_token", data.access_token);
            localStorage.setItem("lf_user_id", data.user_id);
            localStorage.setItem("lf_role", data.role);

            // Critical sync with AuthContext keys
            localStorage.setItem("lfc_token", data.access_token);
            localStorage.setItem("lfc_user_id", data.user_id);
            localStorage.setItem("lfc_role", data.role);
            localStorage.setItem("lfc_orgType", data.role);

            return data;
        },

        logout: () => {
            localStorage.removeItem("lf_token");
            localStorage.removeItem("lf_user_id");
            localStorage.removeItem("lf_role");
            localStorage.removeItem("lfc_role");
            localStorage.removeItem("lfc_userName");
            localStorage.removeItem("lfc_orgType");
            localStorage.removeItem("lfc_profile");
        },

        sendOtp: (mobile: string) => post("/auth/otp/send", { mobile }),
        verifyOtp: (mobile: string, otp: string) => post("/auth/otp/verify", { mobile, otp }),
    },


    // ── Notifications ───────────────────────────────────────────────────────────

    notifications: {
        get: (userId: string) =>
            get<Notification[]>(`/notifications/${userId}`),

        markRead: (notificationIds: string[]) =>
            post<{ success: boolean }>("/notifications/mark-read", { ids: notificationIds }),
    },


    // ── BloodBridge ─────────────────────────────────────────────────────────────

    blood: {
        getDonors: (params?: { blood_group?: string; city?: string; pincode?: string; lat?: number; lng?: number; limit?: number }) =>
            get<BloodDonor[]>("/blood/donors", params),

        getOpenRequests: () =>
            get<BloodRequest[]>("/blood/requests/open"),

        postRequest: (body: { hospital_id: string; blood_group: string; units: number; urgency: string; notes?: string }) =>
            post("/blood/requests", body),

        requestDonor: (body: { hospital_id: string; donor_id: string; blood_group: string; units: number; urgency: string }) =>
            post("/blood/donors/request", body),

        respondToRequest: (body: { request_id: string; donor_id: string; action: "accept" | "decline" }) =>
            post("/blood/respond", body),

        getRequestsForDonor: (donorId: string) =>
            get<BloodRequest[]>("/blood/requests/for-donor", { donor_id: donorId }),

        getHospitalRequests: (hospitalId: string) =>
            get("/blood/requests/hospital", { hospital_id: hospitalId }),

        getDonorHistory: (donorId: string) =>
            get("/blood/history/donor", { donor_id: donorId }),
