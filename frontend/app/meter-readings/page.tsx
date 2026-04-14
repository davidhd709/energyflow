'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';

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

type PrefillReading = {
  lectura_anterior: number;
  source: 'actual' | 'periodo_anterior' | 'historico' | 'default';
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1')
  .replace(/^NEXT_PUBLIC_API_URL\s*=\s*/i, '')
  .replace(/^['"]|['"]$/g, '')
  .replace('/api/v1', '');
const MIN_CROP_PERCENT = 8;

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PhotoCrop = {
  src: string;
  width: number;
  height: number;
  rect: CropRect;
  fileName: string;
};

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

type CropDragState =
  | {
      mode: 'move';
      startX: number;
      startY: number;
      startRect: CropRect;
    }
  | {
      mode: 'resize';
      handle: ResizeHandle;
      startX: number;
      startY: number;
      startRect: CropRect;
    }
  | {
      mode: 'create';
      startX: number;
      startY: number;
    };

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

const buildCroppedPhoto = async (crop: PhotoCrop): Promise<File> => {
  const image = new Image();
  image.src = crop.src;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('No se pudo cargar la imagen para recortar.'));
  });

  const area = {
    x: (crop.rect.x / 100) * crop.width,
    y: (crop.rect.y / 100) * crop.height,
    width: (crop.rect.width / 100) * crop.width,
    height: (crop.rect.height / 100) * crop.height
  };
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
  const [loadingPrefill, setLoadingPrefill] = useState(false);
  const [lecturaAnteriorAuto, setLecturaAnteriorAuto] = useState<number>(0);
  const [prefillSource, setPrefillSource] = useState<PrefillReading['source']>('default');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCrop, setPhotoCrop] = useState<PhotoCrop | null>(null);
  const [cropDrag, setCropDrag] = useState<CropDragState | null>(null);
  const [photoInputKey, setPhotoInputKey] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    house_id: '',
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

  useEffect(() => {
    if (!selectedPeriod || !form.house_id) return;
    setLoadingPrefill(true);
    apiFetch<PrefillReading>(`/meter-readings/prefill?billing_period_id=${selectedPeriod}&house_id=${form.house_id}`)
      .then((data) => {
        setLecturaAnteriorAuto(Number(data.lectura_anterior || 0));
        setPrefillSource(data.source || 'default');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingPrefill(false));
  }, [form.house_id, selectedPeriod, refreshFlag]);

  const onPhotoSelected = (file: File | null): void => {
    setPhotoFile(file);
    if (!file) {
      setPhotoCrop(null);
      setCropDrag(null);
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
          rect: { x: 12, y: 12, width: 76, height: 76 },
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

  const getPointerPercent = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const container = cropContainerRef.current;
    if (!container) return null;
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100),
      y: clamp(((clientY - bounds.top) / bounds.height) * 100, 0, 100)
    };
  };

  const startCreateCrop = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!photoCrop) return;
    cropContainerRef.current?.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event.clientX, event.clientY);
    if (!point) return;
    setCropDrag({ mode: 'create', startX: point.x, startY: point.y });
    setPhotoCrop((prev) =>
      prev
        ? {
            ...prev,
            rect: { x: point.x, y: point.y, width: MIN_CROP_PERCENT, height: MIN_CROP_PERCENT }
          }
        : prev
    );
  };

  const startMoveCrop = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (!photoCrop) return;
    cropContainerRef.current?.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event.clientX, event.clientY);
    if (!point) return;
    setCropDrag({
      mode: 'move',
      startX: point.x,
      startY: point.y,
      startRect: { ...photoCrop.rect }
    });
  };

  const startResizeCrop = (handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    if (!photoCrop) return;
    cropContainerRef.current?.setPointerCapture(event.pointerId);
    const point = getPointerPercent(event.clientX, event.clientY);
    if (!point) return;
    setCropDrag({
      mode: 'resize',
      handle,
      startX: point.x,
      startY: point.y,
      startRect: { ...photoCrop.rect }
    });
  };

  const applyDragToCrop = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!cropDrag || !photoCrop) return;
    const point = getPointerPercent(event.clientX, event.clientY);
    if (!point) return;

    if (cropDrag.mode === 'create') {
      const x = Math.min(cropDrag.startX, point.x);
      const y = Math.min(cropDrag.startY, point.y);
      const width = Math.max(MIN_CROP_PERCENT, Math.abs(point.x - cropDrag.startX));
      const height = Math.max(MIN_CROP_PERCENT, Math.abs(point.y - cropDrag.startY));
      setPhotoCrop((prev) =>
        prev
          ? {
              ...prev,
              rect: {
                x: clamp(x, 0, 100 - MIN_CROP_PERCENT),
                y: clamp(y, 0, 100 - MIN_CROP_PERCENT),
                width: clamp(width, MIN_CROP_PERCENT, 100 - clamp(x, 0, 100)),
                height: clamp(height, MIN_CROP_PERCENT, 100 - clamp(y, 0, 100))
              }
            }
          : prev
      );
      return;
    }

    if (cropDrag.mode === 'move') {
      const dx = point.x - cropDrag.startX;
      const dy = point.y - cropDrag.startY;
      const nextX = clamp(cropDrag.startRect.x + dx, 0, 100 - cropDrag.startRect.width);
      const nextY = clamp(cropDrag.startRect.y + dy, 0, 100 - cropDrag.startRect.height);
      setPhotoCrop((prev) => (prev ? { ...prev, rect: { ...prev.rect, x: nextX, y: nextY } } : prev));
      return;
    }

    const dx = point.x - cropDrag.startX;
    const dy = point.y - cropDrag.startY;
    const start = cropDrag.startRect;
    const startRight = start.x + start.width;
    const startBottom = start.y + start.height;
    let x = start.x;
    let y = start.y;
    let right = startRight;
    let bottom = startBottom;

    if (cropDrag.handle === 'nw' || cropDrag.handle === 'sw') {
      x = clamp(start.x + dx, 0, startRight - MIN_CROP_PERCENT);
    }
    if (cropDrag.handle === 'ne' || cropDrag.handle === 'se') {
      right = clamp(startRight + dx, start.x + MIN_CROP_PERCENT, 100);
    }
    if (cropDrag.handle === 'nw' || cropDrag.handle === 'ne') {
      y = clamp(start.y + dy, 0, startBottom - MIN_CROP_PERCENT);
    }
    if (cropDrag.handle === 'sw' || cropDrag.handle === 'se') {
      bottom = clamp(startBottom + dy, start.y + MIN_CROP_PERCENT, 100);
    }

    setPhotoCrop((prev) =>
      prev
        ? {
            ...prev,
            rect: {
              x,
              y,
              width: clamp(right - x, MIN_CROP_PERCENT, 100),
              height: clamp(bottom - y, MIN_CROP_PERCENT, 100)
            }
          }
        : prev
    );
  };

  const endCropDrag = (event?: ReactPointerEvent<HTMLDivElement>): void => {
    if (event && cropContainerRef.current?.hasPointerCapture(event.pointerId)) {
      cropContainerRef.current.releasePointerCapture(event.pointerId);
    }
    setCropDrag(null);
  };

  const stopCamera = (): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  };

  const openCamera = async (): Promise<void> => {
    setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite acceso a cámara.');
      }
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      setCameraOpen(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : 'No se pudo activar la cámara.');
      stopCamera();
    }
  };

  const captureFromCamera = async (): Promise<void> => {
    if (!videoRef.current) {
      setCameraError('La cámara no está lista.');
      return;
    }

    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setCameraError('No se pudo capturar la imagen.');
      return;
    }

    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) {
      setCameraError('No se pudo capturar la foto del medidor.');
      return;
    }

    const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    onPhotoSelected(file);
    stopCamera();
  };

  useEffect(
    () => () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    },
    []
  );

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
                  <input className="mt-1 w-full rounded-xl bg-slate-50 px-3 py-2.5" type="number" min={0} step="0.01" value={lecturaAnteriorAuto} readOnly />
                  <span className="mt-1 block text-xs text-pine-600">
                    {loadingPrefill
                      ? 'Buscando lectura anterior...'
                      : prefillSource === 'periodo_anterior'
                        ? 'Tomada automáticamente del periodo anterior.'
                        : prefillSource === 'actual'
                          ? 'Lectura anterior del registro actual.'
                          : prefillSource === 'historico'
                            ? 'Tomada del último histórico disponible.'
                            : 'Sin histórico previo: se usará 0.00.'}
                  </span>
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

              <div className="rounded-2xl border border-pine-200 bg-pine-50 p-3">
                <p className="text-sm font-semibold text-pine-900">Foto del medidor</p>
                <p className="text-xs text-pine-700">Puedes subir archivo o tomar foto con cámara antes de recortar.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <label className="inline-flex cursor-pointer items-center rounded-xl bg-white px-3 py-2 text-sm text-pine-800 shadow-sm ring-1 ring-pine-200">
                    Subir archivo
                    <input
                      key={photoInputKey}
                      className="hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => onPhotoSelected(e.target.files?.[0] || null)}
                    />
                  </label>
                  <button type="button" className="rounded-xl bg-pine-700 px-3 py-2 text-sm font-semibold text-white" onClick={openCamera}>
                    Activar cámara
                  </button>
                  {cameraOpen ? (
                    <button type="button" className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800" onClick={stopCamera}>
                      Cerrar cámara
                    </button>
                  ) : null}
                </div>
                {cameraError ? <p className="mt-2 text-xs text-red-600">{cameraError}</p> : null}
                {cameraOpen ? (
                  <div className="mt-3 space-y-2">
                    <div className="overflow-hidden rounded-lg border border-pine-300 bg-black">
                      <video ref={videoRef} className="h-auto w-full" autoPlay playsInline muted />
                    </div>
                    <button type="button" className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" onClick={captureFromCamera}>
                      Capturar foto
                    </button>
                  </div>
                ) : null}
              </div>

              {photoCrop ? (
                <div className="rounded-2xl border border-pine-200 bg-pine-50 p-3">
                  <p className="text-sm font-semibold text-pine-900">Recorte de foto del medidor</p>
                  <p className="text-xs text-pine-700">
                    Arrastra el marco verde para moverlo y usa las esquinas para ajustar el área libremente.
                  </p>

                  <div
                    ref={cropContainerRef}
                    className="relative mt-3 overflow-hidden rounded-lg border border-pine-300 bg-white touch-none select-none"
                    onPointerDown={startCreateCrop}
                    onPointerMove={applyDragToCrop}
                    onPointerUp={endCropDrag}
                    onPointerCancel={endCropDrag}
                    onPointerLeave={endCropDrag}
                  >
                    <img src={photoCrop.src} alt="Previsualización foto medidor" className="h-auto w-full" draggable={false} />
                    <div
                      className="absolute border-2 border-lime-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                      onPointerDown={startMoveCrop}
                      style={{
                        left: `${photoCrop.rect.x}%`,
                        top: `${photoCrop.rect.y}%`,
                        width: `${photoCrop.rect.width}%`,
                        height: `${photoCrop.rect.height}%`
                      }}
                    >
                      <div
                        className="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-lime-600 bg-white"
                        onPointerDown={(event) => startResizeCrop('nw', event)}
                      />
                      <div
                        className="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-lime-600 bg-white"
                        onPointerDown={(event) => startResizeCrop('ne', event)}
                      />
                      <div
                        className="absolute -bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-lime-600 bg-white"
                        onPointerDown={(event) => startResizeCrop('sw', event)}
                      />
                      <div
                        className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-lime-600 bg-white"
                        onPointerDown={(event) => startResizeCrop('se', event)}
                      />
                    </div>
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
