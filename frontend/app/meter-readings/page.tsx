'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

import AppShell from '@/components/AppShell';
import ActionFeedback from '@/components/ActionFeedback';
import AuthGuard from '@/components/AuthGuard';
import MetricCard from '@/components/MetricCard';
import TableBlock from '@/components/TableBlock';
import { useCondominiumScope } from '@/hooks/useCondominiumScope';
import { useSession } from '@/hooks/useSession';
import { apiFetch } from '@/lib/api';
import { toNumber } from '@/lib/format';

type Period = {
  _id: string;
  fecha_inicio: string;
  fecha_fin: string;
  estado: string;
};

type House = {
  _id: string;
  numero_casa: string;
  es_zona_comun: boolean;
};

type Reading = {
  _id: string;
  house_id: string;
  lectura_anterior: number;
  lectura_actual: number;
  consumo: number;
  observaciones: string;
  foto_medidor_url?: string | null;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1')
  .replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '')
  .replace(/^['"]|['"]$/g, '')
  .replace('/api/v1', '');
const PHOTO_CROP_RATIO = 268 / 161;

type PhotoCrop = {
  src: string;
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  fileName: string;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

const computeCropArea = (crop: PhotoCrop): { x: number; y: number; width: number; height: number } => {
  const maxCropWidth = Math.min(crop.width, crop.height * PHOTO_CROP_RATIO) * 0.96;
  const cropWidth = clamp(maxCropWidth / crop.zoom, crop.width * 0.2, maxCropWidth);
  const cropHeight = cropWidth / PHOTO_CROP_RATIO;

  const freeX = Math.max(crop.width - cropWidth, 0);
  const freeY = Math.max(crop.height - cropHeight, 0);

  const x = clamp(freeX / 2 + (crop.offsetX / 100) * (freeX / 2), 0, freeX);
  const y = clamp(freeY / 2 + (crop.offsetY / 100) * (freeY / 2), 0, freeY);

  return { x, y, width: cropWidth, height: cropHeight };
};

const buildCroppedPhoto = async (crop: PhotoCrop): Promise<File> => {
  const image = new Image();
  image.src = crop.src;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('No se pudo cargar la imagen para recortar.'));
  });

  const area = computeCropArea(crop);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No fue posible procesar el recorte de imagen.');
  }

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error('No se pudo generar la imagen recortada.'));
          return;
        }
        resolve(result);
      },
      'image/jpeg',
      0.92
    );
  });

  const safeBaseName = crop.fileName.replace(/\.[^/.]+$/, '').replace(/\s+/g, '_') || 'meter';
  return new File([blob], `${safeBaseName}_crop.jpg`, { type: 'image/jpeg' });
};

export default function MeterReadingsPage(): React.ReactNode {
  const { session } = useSession();
  const role = session?.user.rol;
  const readOnly = role === 'admin';
  const [periods, setPeriods] = useState<Period[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);
  const [refreshFlag, setRefreshFlag] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCrop, setPhotoCrop] = useState<PhotoCrop | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [form, setForm] = useState({
    house_id: '',
    lectura_anterior: 0,
    lectura_actual: 0,
    observaciones: ''
  });

  const { condominiums, selectedCondominiumId, setSelectedCondominiumId, queryParam, ready } = useCondominiumScope(session);

  useEffect(() => {
    if (!session || !ready) return;

    Promise.all([apiFetch<Period[]>(`/billing-periods${queryParam}`), apiFetch<House[]>(`/houses${queryParam}`)])
      .then(([periodData, houseData]) => {
        setPeriods(periodData);
        setHouses(houseData);
        if (periodData.length > 0) {
          setSelectedPeriod(periodData[0]._id);
        }
        if (houseData.length > 0) {
          setForm((prev) => ({ ...prev, house_id: houseData[0]._id }));
        }
      })
      .catch((err) => setError(err.message));
  }, [queryParam, ready, session]);

  useEffect(() => {
    if (!selectedPeriod) return;
    apiFetch<Reading[]>(`/meter-readings?billing_period_id=${selectedPeriod}`)
      .then(setReadings)
      .catch((err) => setError(err.message));
  }, [refreshFlag, selectedPeriod]);

  const cropArea = useMemo(() => (photoCrop ? computeCropArea(photoCrop) : null), [photoCrop]);

  const onPhotoSelected = (file: File | null): void => {
    setPhotoFile(file);
    if (!file) {
      setPhotoCrop(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || '');
      const image = new Image();
      image.onload = () => {
        setPhotoCrop({
          src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          zoom: 1.35,
          offsetX: 0,
          offsetY: 0,
          fileName: file.name
        });
      };
      image.onerror = () => {
        setError('No se pudo cargar la previsualización de la foto.');
        setPhotoCrop(null);
      };
      image.src = src;
    };
    reader.onerror = () => {
      setError('No se pudo leer la foto seleccionada.');
      setPhotoCrop(null);
    };
    reader.readAsDataURL(file);
  };

  const saveReading = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLoadingAction(true);
    setError('');
    setNotice('');

    try {
      const reading = await apiFetch<Reading>('/meter-readings', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          billing_period_id: selectedPeriod,
          lectura_anterior: Number(form.lectura_anterior),
          lectura_actual: Number(form.lectura_actual)
        })
      });

      if (photoFile) {
        if (!photoCrop) {
          throw new Error('La foto aún se está preparando. Intenta nuevamente en unos segundos.');
        }
        const croppedPhoto = await buildCroppedPhoto(photoCrop);
        const formData = new FormData();
        formData.append('file', croppedPhoto);
        await apiFetch(`/meter-readings/${reading._id}/photo`, {
          method: 'POST',
          body: formData
        });
        setPhotoFile(null);
        setPhotoCrop(null);
        setPhotoInputKey((value) => value + 1);
        setNotice('Lectura y foto del medidor guardadas con éxito.');
      } else {
        setNotice('Lectura guardada con éxito.');
      }
      setRefreshFlag((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la lectura.');
    } finally {
      setLoadingAction(false);
    }
  };

  const houseById = useMemo(() => Object.fromEntries(houses.map((house) => [house._id, house.numero_casa])), [houses]);
  const totalConsumption = readings.reduce((acc, item) => acc + Number(item.consumo || 0), 0);
  const readingsWithPhoto = readings.filter((item) => item.foto_medidor_url).length;

  return (
    <AuthGuard allowedRoles={['superadmin', 'operador']}>
      <AppShell>
        <section className="space-y-6">
          <header>
            <h2 className="font-[var(--font-title)] text-3xl text-pine-900">Registro de Lecturas</h2>
            <p className="mt-1 text-sm text-pine-700">Carga lecturas del periodo con foto del medidor para soporte en factura.</p>
          </header>

          <ActionFeedback
            loading={loadingAction}
            loadingText="Guardando lectura de energía..."
            success={notice}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Lecturas registradas" value={readings.length} />
            <MetricCard title="Lecturas con foto" value={readingsWithPhoto} />
            <MetricCard title="Consumo total periodo" value={`${toNumber(totalConsumption)} kWh`} />
            <MetricCard title="Casas activas" value={houses.length} />
          </div>

          {role === 'superadmin' ? (
            <div className="soft-card max-w-md rounded-2xl p-4">
              <label className="text-sm text-pine-700">
                Condominio
                <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={selectedCondominiumId} onChange={(e) => setSelectedCondominiumId(e.target.value)}>
                  {condominiums.map((condo) => (
                    <option key={condo._id} value={condo._id}>
                      {condo.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="soft-card max-w-md rounded-2xl p-4">
            <label className="text-sm text-pine-700">
              Periodo
              <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
                {periods.map((period) => (
                  <option key={period._id} value={period._id}>
                    {period.fecha_inicio} - {period.fecha_fin} ({period.estado})
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!readOnly ? (
            <form onSubmit={saveReading} className="soft-card space-y-4 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-pine-900">Captura de lectura</h3>
                <span className="rounded-full bg-pine-100 px-3 py-1 text-xs font-semibold text-pine-700">Periodo activo</span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-sm text-pine-700 xl:col-span-2">
                  Casa
                  <select className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.house_id} onChange={(e) => setForm({ ...form, house_id: e.target.value })}>
                    {houses.map((house) => (
                      <option key={house._id} value={house._id}>
                        {house.numero_casa} {house.es_zona_comun ? '(zona común)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-pine-700">
                  Lectura anterior
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" type="number" min={0} step="0.01" value={form.lectura_anterior} onChange={(e) => setForm({ ...form, lectura_anterior: Number(e.target.value) })} required />
                </label>
                <label className="text-sm text-pine-700">
                  Lectura actual
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" type="number" min={0} step="0.01" value={form.lectura_actual} onChange={(e) => setForm({ ...form, lectura_actual: Number(e.target.value) })} required />
                </label>
                <label className="text-sm text-pine-700 md:col-span-2 xl:col-span-4">
                  Observaciones
                  <input className="mt-1 w-full rounded-xl px-3 py-2.5" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Opcional" />
                </label>
              </div>

              <label className="text-sm text-pine-700">
                Foto del medidor (JPG, PNG, WEBP)
                <input
                  key={photoInputKey}
                  className="mt-1 w-full rounded-xl bg-white px-3 py-2.5"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => onPhotoSelected(e.target.files?.[0] || null)}
                />
              </label>

              {photoCrop && cropArea ? (
                <div className="rounded-2xl border border-pine-200 bg-pine-50 p-3">
                  <p className="text-sm font-semibold text-pine-900">Recorte de foto del medidor</p>
                  <p className="text-xs text-pine-700">
                    Ajusta el encuadre para que se vea claramente la lectura y el serial.
                  </p>

                  <div className="relative mt-3 overflow-hidden rounded-lg border border-pine-300 bg-white">
                    <img src={photoCrop.src} alt="Previsualización foto medidor" className="h-auto w-full" />
                    <div
                      className="pointer-events-none absolute border-2 border-lime-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]"
                      style={{
                        left: `${(cropArea.x / photoCrop.width) * 100}%`,
                        top: `${(cropArea.y / photoCrop.height) * 100}%`,
                        width: `${(cropArea.width / photoCrop.width) * 100}%`,
                        height: `${(cropArea.height / photoCrop.height) * 100}%`
                      }}
                    />
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <label className="text-xs text-pine-700">
                      Zoom
                      <input
                        className="mt-1 w-full"
                        type="range"
                        min={1}
                        max={3}
                        step={0.05}
                        value={photoCrop.zoom}
                        onChange={(e) =>
                          setPhotoCrop((prev) =>
                            prev ? { ...prev, zoom: Number(e.target.value) } : prev
                          )
                        }
                      />
                    </label>
                    <label className="text-xs text-pine-700">
                      Mover horizontal
                      <input
                        className="mt-1 w-full"
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={photoCrop.offsetX}
                        onChange={(e) =>
                          setPhotoCrop((prev) =>
                            prev ? { ...prev, offsetX: Number(e.target.value) } : prev
                          )
                        }
                      />
                    </label>
                    <label className="text-xs text-pine-700">
                      Mover vertical
                      <input
                        className="mt-1 w-full"
                        type="range"
                        min={-100}
                        max={100}
                        step={1}
                        value={photoCrop.offsetY}
                        onChange={(e) =>
                          setPhotoCrop((prev) =>
                            prev ? { ...prev, offsetY: Number(e.target.value) } : prev
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ) : null}

              <button className="rounded-xl bg-pine-700 px-4 py-2.5 font-semibold text-white" type="submit">
                {loadingAction ? 'Guardando...' : 'Guardar lectura'}
              </button>
            </form>
          ) : null}

          <TableBlock
            columns={['Casa', 'Lectura anterior', 'Lectura actual', 'Consumo kWh', 'Observaciones', 'Foto medidor']}
            rows={readings.map((item) => ({
              Casa: houseById[item.house_id] || item.house_id,
              'Lectura anterior': toNumber(item.lectura_anterior),
              'Lectura actual': toNumber(item.lectura_actual),
              'Consumo kWh': toNumber(item.consumo),
              Observaciones: item.observaciones || '-',
              'Foto medidor': item.foto_medidor_url ? (
                <a
                  className="text-pine-700 underline"
                  href={`${API_BASE}${item.foto_medidor_url}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver foto
                </a>
              ) : (
                'Sin foto'
              )
            }))}
          />
        </section>
      </AppShell>
    </AuthGuard>
  );
}
