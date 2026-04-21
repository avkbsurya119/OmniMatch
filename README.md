<div align="center">

# 🩸 OmniMatch

### AI-Powered Life-Saving Donation Ecosystem

**Connecting Hospitals. Empowering Donors. Saving Lives.**

[![Track](https://img.shields.io/badge/Track-Healthcare-red?style=for-the-badge)]()

> *"The crisis isn't a shortage of donors. It's a complete absence of connection."*

</div>

---

## 👥 Team DevNova

- Amritha S Nidhi
- Anaswara K
- Duddekunta Yuva Hasini
- AVK Bhavan Surya

---

## 💡 Why We Built This

Ravi is 8 years old. He has thalassemia. Every 20 days, his parents take 2 days off work, call 15–20 hospitals, post on WhatsApp groups, and beg strangers for blood. Not because donors don't exist — but because **no system connects them**.

OmniMatch changes that. The donor is matched before Ravi even leaves home.

> *This isn't a tech project. This is infrastructure that saves lives.*

---

## 📊 The Crisis Is Real

| Stat | Number |
|---|---|
| 🩸 Blood Units Needed Annually (India) | **15 Million** |
| ✅ Actually Collected | **11 Million** |
| ❌ Gap | **4 Million Units** |
| 💔 Thalassemia Patients (need transfusions every 15–25 days, for life) | **100,000+** |

**The technology exists. The willingness exists. The coordination layer is missing. That's OmniMatch.**

---

## ❗ Problem Statement: 5 Critical Gaps

1. **No Central System** — Hospitals, blood banks, and donors operate in complete isolation with zero real-time connection
2. **Social Media Dependency** — Families resort to WhatsApp and Facebook in emergencies — unverified, slow, and unreliable
3. **Manual Coordination** — Phone-based calling wastes critical minutes during trauma and emergency situations
4. **Family Burden** — The entire responsibility of finding donors falls on the patient's family during their worst moments
5. **Chronic Patient Crisis** — Thalassemia and oncology patients face the same emergency repeatedly with no long-term plan

> *There is no verified, centralized, intelligent system connecting hospitals and donors across India.*

---

## ✅ Our Solution: One Platform. Four Life-Saving Modules.

```
Hospital raises request  →  AI Engine matches donors  →  Donors receive instant alerts & respond
```

**Core capabilities:**
- 📍 Real-Time Geolocation Matching
- 🤖 AI-Powered Predictive Alerts
- 📱 App + SMS Notifications (works offline)
- 🔐 Aadhaar-Verified Identity (via ABDM API)

---

## 🧩 4 Modules — Every Critical Donation Need. Covered.

### 🩸 BloodBridge — Real-Time Blood Matching
A trauma patient requires 3 units of O-negative blood. The hospital enters the request. Nearby compatible donors receive instant alerts. Donors who accept are connected directly with the hospital.

**Key Features:**
- Dynamic geolocation routing
- Compatibility-based matching
- Real-time notification system
- Map view for visual donor proximity

---

### 🕐 PlateletAlert — Critical Care & Oncology Support
Platelets have a maximum shelf life of **5 days** — timing is critical. A chemotherapy patient urgently requires platelet donation. The system identifies nearby platelet donors and facilitates timely scheduling for apheresis donations.

**Key Features:**
- Time-sensitive coordination
- Dedicated platelet donor identification
- Direct hospital-donor scheduling

---

### 💊 ThalCare — Chronic Transfusion Management
Hospitals register patients with recurring transfusion needs (e.g., every 15–25 days). The system tracks each patient's cycle and proactively pre-matches a compatible donor 3–4 days before the due date — preventing last-minute emergencies and avoiding repeat donor-patient pairings for safety.

**Key Features:**
- Automated transfusion cycle tracking
- Proactive donor pre-matching
- Donor-patient pairing history to avoid repeat donations

---

### 🍼 MilkBridge — Neonatal Human Milk Network
A premature baby in NICU requires screened donor breast milk. Verified lactating mothers within a nearby region are matched with the hospital.

**Key Features:**
- NICU integration
- Secure tracking system ("Milk Passport")
- Screening and safe distribution workflow

---

### 🤖 OmniMatch AI — Intelligent Donor Assistant
An AI-powered assistant that:
- Answers donor eligibility questions
- Provides post-donation guidance
- Clarifies medical procedures
- Reduces hesitation among first-time donors

---

## ⚙️ Application Flow

```
Step 1: Donor Registration
        └─ Blood group, location (pincode), contact details, medical eligibility
        └─ Optional: Aadhaar verification via ABDM API
        └─ Privacy option: anonymous profile

Step 2: Hospital Registration
        └─ Verified hospitals only can raise donation requests

Step 3: Raise a Request
        └─ Blood group / donation type, units required, location, urgency level

Step 4: Smart Matching
        └─ Medical compatibility rules applied
        └─ Nearby donors identified via geolocation
        └─ Real-time alerts sent via App + SMS

Step 5: Donor Response
        └─ Donor sees hospital name, blood group needed, distance, urgency
        └─ Accept or decline with one tap

Step 6: Hospital Notification
        └─ Hospital instantly notified on donor acceptance
        └─ Contact enabled for coordination
```

---

## 🏗️ Technical Architecture

### Frontend
- **React** + **TypeScript** + **Tailwind CSS**
- Donor & Hospital dashboards
- Map view (donor proximity)
- Mobile responsive

### Backend
- **Python** + **FastAPI**
- AI Matching Engine
- Geolocation Processing
- Alert Logic & Scheduling

### Database & Infrastructure
- **Supabase (PostgreSQL)**
- **Row Level Security (RLS)** — patient data never exposed
- **WebSocket** — real-time donor-hospital sync
- **Twilio** — SMS alerts (works without internet)
- **Ayushman Bharat Digital Mission API** — Aadhaar auth

---

## 🔐 Security Highlights

| Feature | Detail |
|---|---|
| 🔒 RLS | Patient data is never exposed to unauthorized parties |
| ⚡ WebSocket | Real-time donor-hospital synchronization |
| 📡 Twilio SMS | Fallback that works without internet |
| 🪪 Aadhaar Auth | Identity verification via ABDM API |
| 👤 Donor Anonymity | Optional — hospitals see only medical/location info |

---

## 📈 Why OmniMatch Is Different

| Feature | Existing Systems | OmniMatch |
|---|---|---|
| Donor-Hospital Connection | Manual / Social Media | AI-matched, real-time |
| Chronic Patient Planning | Reactive, crisis-based | Proactive — ThalCare cycle tracking |
| Donor Verification | None | Aadhaar-linked via ABDM API |
| Notification Channel | App only | App + SMS offline-safe |
| Privacy Control | None | Optional donor anonymity |
| Neonatal Milk Network | Not available | MilkBridge + Milk Passport |

> *OmniMatch is not just a blood app — it is a complete donation coordination ecosystem.*

---

## 🌍 Impact & Relevance

- **Patient Impact** — Faster matching = higher survival in trauma, cancer, and chronic conditions. ThalCare eliminates the recurring crisis cycle entirely.
- **Family Impact** — Removes emotional and logistical burden from families at their most vulnerable moment.
- **Hospital Impact** — Structured digital requests replace chaotic manual calls. Staff coordination time drops dramatically.
- **National Impact** — Bridges India's 4-million-unit blood gap by activating existing donor willingness through smart coordination.

### Alignment with National Initiatives
- ✅ Ayushman Bharat Digital Mission
- ✅ National Health Policy 2017
- ✅ National Blood Policy Goals
- ✅ SDG 3 — Good Health & Well-Being

---

## 🛠️ Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase account

### Frontend Setup

```bash
# Clone the repository
git clone https://github.com/your-org/omnimatch.git
cd omnimatch/FRONTEND

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and set:
# VITE_API_URL=http://localhost:8001

# Start development server
npm run dev
```

> 🌐 Frontend runs at: http://localhost:5173

---

### Backend Setup

```bash
cd ../BACKEND

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and set your Supabase credentials, Twilio keys, etc.

# Start the server
uvicorn main:app --reload --port 8001
```

> ⚙️ Backend API runs at: http://localhost:8001

---

### Environment Variables

#### Frontend (`FRONTEND/.env`)
```env
VITE_API_URL=http://localhost:8001
```

#### Backend (`BACKEND/.env`)
```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

---

## 🧪 Testing

### Register Test Accounts
1. Go to `/register` → create a **donor** account
2. Go to `/register?type=hospital` → create a **hospital** account

### Test Flows
- **Donor:** Register for module → See nearby requests → Respond
- **Hospital:** Post request → Find matches → Coordinate pickup

### API Testing
```bash
# Health check
curl http://localhost:8001/

# Get milk donors
curl http://localhost:8001/milk/donors
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m "feat: add your feature"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/your-feature
   ```
5. Open a Pull Request

### Module Ownership
- Each module (BloodBridge, PlateletAlert, ThalCare, MilkBridge) can be developed independently
- MilkBridge components are in `FRONTEND/src/components/milk/`
- Keep module-specific code in module-owned files to avoid conflicts

---

## 📄 License

MIT License — see [LICENSE](./LICENSE)

---

## 🙏 Acknowledgements

Built with purpose for every donor who said yes, and every patient still waiting.


---

<div align="center">

**OmniMatch** · *Because the right match shouldn't be a miracle. It should be a system.*

</div>
