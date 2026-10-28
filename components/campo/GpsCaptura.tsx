'use client';
import { useEffect, useRef, useState } from 'react';

export type LecturaGps = { lat: number; lon: number; altitud: number | null; precision: number; hora: string };

// Toma lecturas durante hasta 45 s y conserva la de menor error. Nunca inventa coordenadas.
export default function GpsCaptura({ umbral, inicial, onLectura, onFallo, deshabilitado }: {
  umbral: number;
  inicial?: LecturaGps | null;
  onLectura: (l: LecturaGps) => void;
  onFallo?: (motivo: string) => void;
  deshabilitado?: boolean;
}) {
  const [mejor, setMejor] = useState<LecturaGps | null>(inicial || null);
  const [actual, setActual] = useState<number | null>(null);
  const [midiendo, setMidiendo] = useState(false);
  const [error, setError] = useState('');
  const watch = useRef<number | null>(null);
  const tope = useRef<any>(null);
  const mejorRef = useRef<LecturaGps | null>(inicial || null);

  useEffect(() => () => detener(), []);

  function detener() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (tope.current) clearTimeout(tope.current);
    setMidiendo(false);
  }

  function terminar() {
    detener();
    const m = mejorRef.current;
    if (m) {
      onLectura(m);
      if (m.precision > umbral) onFallo?.(`precision:${m.precision}`);
    } else {
      setError('No se obtuvo ninguna lectura. Verifique que la ubicación del teléfono esté activa e intente de nuevo.');
      onFallo?.('sin_lectura');
    }
  }

  function iniciar() {
    if (!('geolocation' in navigator)) {
      setError('Este dispositivo no permite obtener la ubicación.');
      onFallo?.('no_soportado');
      return;
    }
    setError('');
    mejorRef.current = null;
    setMejor(null);
    setMidiendo(true);
    let buenas = 0;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const l: LecturaGps = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          altitud: pos.coords.altitude,
          precision: Math.round(pos.coords.accuracy * 10) / 10,
          hora: new Date(pos.timestamp).toISOString(),
        };
        setActual(l.precision);
        if (!mejorRef.current || l.precision < mejorRef.current.precision) {
          mejorRef.current = l;
          setMejor(l);
        }
        if (l.precision <= umbral && ++buenas >= 3) terminar();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          detener();
          setError('Permiso de ubicación denegado. Actívelo en la configuración del navegador para este sitio.');
          onFallo?.('permiso');
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 45000 },
    );
    tope.current = setTimeout(terminar, 45000);
  }

  const cumple = mejor && mejor.precision <= umbral;
  return (
    <div className="space-y-2">
      {mejor && (
        <div className={`rounded-lg p-3 text-sm ${cumple ? 'bg-verde-claro text-green-900' : 'bg-sol-claro text-sol-oscuro'}`}>
          <div className="font-bold">{cumple ? 'Ubicación válida' : `Precisión insuficiente: se exige ≤ ${umbral} m`}</div>
          <div>Lat {mejor.lat.toFixed(7)} · Lon {mejor.lon.toFixed(7)} · Precisión {mejor.precision} m</div>
        </div>
      )}
      {midiendo && (
        <p className="text-sm text-slate-600">Midiendo… precisión actual {actual ?? '—'} m. Permanezca frente a la puerta principal, a cielo abierto.</p>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {midiendo ? (
        <button type="button" className="btn-secundario w-full" onClick={terminar}>Usar la mejor lectura</button>
      ) : (
        <button type="button" className="btn-primario w-full" onClick={iniciar} disabled={deshabilitado}>
          {mejor ? 'Volver a capturar ubicación' : 'Capturar ubicación'}
        </button>
      )}
    </div>
  );
}
