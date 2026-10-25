import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";

export interface RiderPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  updatedAt: string;
  active: boolean;
}

export default function RiderMap({ riders }: { riders: RiderPoint[] }) {
  const center: [number, number] = riders.length
    ? [riders.reduce((s, r) => s + r.lat, 0) / riders.length, riders.reduce((s, r) => s + r.lng, 0) / riders.length]
    : [6.5244, 3.3792]; // Lagos
  return (
    <MapContainer center={center} zoom={riders.length ? 12 : 10} className="h-80 w-full rounded-xl" scrollWheelZoom={false}>
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {riders.map((r) => (
        <CircleMarker
          key={r.id}
          center={[r.lat, r.lng]}
          radius={9}
          pathOptions={{ color: r.active ? "#F2751A" : "#64748b", fillColor: r.active ? "#F2751A" : "#64748b", fillOpacity: 0.85 }}
        >
          <Tooltip permanent direction="top" offset={[0, -8]}>
            {r.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
