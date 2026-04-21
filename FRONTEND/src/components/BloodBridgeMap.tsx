import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

interface Donor {
  id: string | number;
  name: string;
  blood_group: string;
  city: string;
  trust_score: number;
  distance_km: number;
  lat: number;
  lng: number;
}

interface HospitalLocation {
  lat: number;
  lng: number;
  name: string;
}

interface BloodBridgeMapProps {
  donors?: Donor[];
  hospitalLocation?: HospitalLocation | null;
}

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const BloodBridgeMap = ({ donors = [], hospitalLocation }: BloodBridgeMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    // Always destroy previous instance before creating a new one
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    if (!mapRef.current) return;

    import("leaflet").then((L) => {
      // Guard: component may have unmounted during async import
      if (!mapRef.current || mapInstanceRef.current) return;

      const center: [number, number] = hospitalLocation
        ? [hospitalLocation.lat, hospitalLocation.lng]
        : [20.5937, 78.9629]; // India center fallback
      const zoom = hospitalLocation ? 10 : 5;

      const map = L.default.map(mapRef.current, { center, zoom });
      mapInstanceRef.current = map;

      L.default
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 18,
        })
        .addTo(map);

      // ── Blue pin: Hospital ──────────────────────────────────────────────
      const blueIcon = new L.default.Icon({
        iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      if (hospitalLocation) {
        L.default
          .marker([hospitalLocation.lat, hospitalLocation.lng], {
            icon: blueIcon,
            zIndexOffset: 1000,
          })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:160px;font-family:sans-serif">
              <p style="margin:0 0 4px;font-weight:700;color:#1d4ed8;font-size:14px">🏥 ${hospitalLocation.name}</p>
              <p style="margin:0;font-size:11px;color:#6b7280">Your Hospital Location</p>
            </div>`
          )
          .openPopup();