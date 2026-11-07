'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Crop,
  FileUp,
  Gift,
  Handshake,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { BookCropEditor } from '@/components/book-crop-editor';
import { NotificationPermissionDialog } from '@/components/notification-permission-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createBookRecognitionQueue } from '@/lib/book-recognition';
import { sanitizeBookTitle } from '@/lib/book-title';
import {
  canApplySuggestedTitle,
  MAX_CAPTURE_PHOTOS,
  validateCaptureFile,
  type CropBounds,
} from '@/lib/capture-drafts';

type Availability = 'loan' | 'donation';
type Photo = {
  id: string;
  file: File;
  url: string;
  availability: Availability;
  done: boolean;
  notice: string;
};
type Draft = {
  id: string;
  photoId: string;
  ocrKey: string;
  blob: Blob;
  url: string;
  bounds: CropBounds;
  title: string;
  titleEdited: boolean;
  ocr: 'pending' | 'done' | 'error';
  availability: Availability;
  saving: boolean;
  uploadAttempted: boolean;
  savedId?: string;
  error: string;
  titleError: string;
  removed: boolean;
};
type Queue = ReturnType<typeof createBookRecognitionQueue>;
const wholePhoto = { x: 0, y: 0, width: 1, height: 1 };

export function BookUploader({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [screen, setScreen] = useState<'pick' | 'camera' | 'review'>('pick');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [availability, setAvailability] = useState<Availability>('loan');
  const [openingCamera, setOpeningCamera] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{
    photoId: string;
    draftId?: string;
  } | null>(null);
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const photosRef = useRef<Photo[]>([]);
  const draftsRef = useRef<Draft[]>([]);
  const queue = useRef<Queue | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cameraAttempt = useRef(0);
  const mounted = useRef(true);
  const urls = useRef(new Set<string>());
  const requestControllers = useRef(new Set<AbortController>());
  const syncingTitles = useRef(new Set<string>());
  const serverTitles = useRef(new Map<string, string>());
  const serverVersions = useRef(new Map<string, number>());
  const firstBookSaved = useRef(false);
  const savingBatchRef = useRef(false);
  const shutterBusy = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function updatePhotos(update: (current: Photo[]) => Photo[]) {
    const next = update(photosRef.current);
    photosRef.current = next;
    if (mounted.current) setPhotos(next);
  }
  function updateDrafts(update: (current: Draft[]) => Draft[]) {
    const next = update(draftsRef.current);
    draftsRef.current = next;
    if (mounted.current) setDrafts(next);
  }
  function preview(blob: Blob) {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }
  function stopCamera() {
    cameraAttempt.current += 1;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setOpeningCamera(false);
  }
  function fallbackPhoto(photoId: string) {
    const photo = photosRef.current.find((item) => item.id === photoId);
    if (!photo || draftsRef.current.some((item) => item.photoId === photoId))
      return;
    const id = crypto.randomUUID();
    updateDrafts((current) => [
      ...current,
      {
        id,
        photoId,
        ocrKey: id,
        blob: photo.file,
        url: preview(photo.file),
        bounds: wholePhoto,
        title: '',
        titleEdited: false,
        ocr: 'error',
        availability: photo.availability,
        saving: false,
        uploadAttempted: false,
        error: '',
        titleError: '',
        removed: false,
      },
    ]);
  }

  async function requestJson(
    path: string,
    init: RequestInit,
    allowConflict = false,
  ) {
    const controller = new AbortController();
    requestControllers.current.add(controller);
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(path, {
        ...init,
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        error?: string;
        bookId?: string;
        isFirstBook?: boolean;
        updatedAt?: number;
        title?: string;
        availability?: Availability;
      };
      if (!response.ok && !(allowConflict && response.status === 409))
        throw new Error(
          payload.error || 'Não foi possível salvar. Tente novamente.',
        );
      return { ...payload, httpStatus: response.status };
    } finally {
      window.clearTimeout(timeout);
      requestControllers.current.delete(controller);
    }
  }

  // Serialize title writes per book, then re-read the latest draft. Late OCR or an
  // earlier request can never be the final write over a newer manual correction.
  async function syncTitle(id: string) {
    if (syncingTitles.current.has(id) || !mounted.current) return;
    syncingTitles.current.add(id);
    try {
      let conflicts = 0;
      while (mounted.current) {
        const draft = draftsRef.current.find((item) => item.id === id);
        if (!draft?.savedId || draft.removed) break;
        const desired = sanitizeBookTitle(draft.title);
        const desiredMetadata = JSON.stringify([desired, draft.availability]);
        if (serverTitles.current.get(id) === desiredMetadata) {
          updateDrafts((current) =>
            current.map((item) =>
              item.id === id ? { ...item, titleError: '' } : item,
            ),
          );
          break;
        }
        const expectedUpdatedAt = serverVersions.current.get(id);
        if (!expectedUpdatedAt)
          throw new Error('Versão do livro indisponível.');
        const result = await requestJson(
          `/api/books/${draft.savedId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: desired,
              availability: draft.availability,
              expectedUpdatedAt,
            }),
          },
          true,
        );
        if (!result.updatedAt) throw new Error('Versão do livro indisponível.');
        serverVersions.current.set(id, result.updatedAt);
        if (result.httpStatus === 409) {
          serverTitles.current.set(
            id,
            JSON.stringify([result.title, result.availability]),
          );
          conflicts += 1;
          if (conflicts > 3)
            throw new Error('O livro foi alterado em outra tela.');
          continue;
        }
        serverTitles.current.set(id, desiredMetadata);
        updateDrafts((current) =>
          current.map((item) =>
            item.id === id ? { ...item, titleError: '' } : item,
          ),
        );
      }
    } catch {
      // An aborted PATCH may still commit. Keep its version for CAS, but never
      // treat the cached metadata as proof of the server state after uncertainty.
      serverTitles.current.delete(id);
      updateDrafts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                titleError:
                  'Livro salvo, mas o título ainda não foi atualizado. Tente novamente.',
              }
            : item,
        ),
      );
    } finally {
      syncingTitles.current.delete(id);
    }
  }

  function recognitionQueue() {
    if (queue.current) return queue.current;
    queue.current = createBookRecognitionQueue(
      {
        onCrops: ({ photoId, crops, source }) => {
          const photo = photosRef.current.find((item) => item.id === photoId);
          if (
            !photo ||
            !mounted.current ||
            draftsRef.current.some((item) => item.photoId === photoId)
          )
            return;
          updateDrafts((current) => [
            ...current,
            ...crops.map(
              (crop): Draft => ({
                id: crypto.randomUUID(),
                photoId,
                ocrKey: crop.id,
                blob: crop.blob,
                url: preview(crop.blob),
                bounds: crop.bounds,
                title: '',
                titleEdited: false,
                ocr: 'pending',
                availability: photo.availability,
                saving: false,
                uploadAttempted: false,
                error: '',
                titleError: '',
                removed: false,
              }),
            ),
          ]);
          if (source === 'whole-photo')
            updatePhotos((current) =>
              current.map((item) =>
                item.id === photoId
                  ? {
                      ...item,
                      notice:
                        'Não separamos várias capas com confiança. Confira a foto ou adicione recortes.',
                    }
                  : item,
              ),
            );
        },
        onTitle: ({ cropId, title, status }) => {
          const draft = draftsRef.current.find(
            (item) => item.ocrKey === cropId,
          );
          if (!draft || !mounted.current) return;
          updateDrafts((current) =>
            current.map((item) =>
              item.id === draft.id
                ? {
                    ...item,
                    ocr: status === 'error' ? 'error' : 'done',
                    title:
                      canApplySuggestedTitle(item.titleEdited, item.removed) &&
                      title
                        ? title
                        : item.title,
                  }
                : item,
            ),
          );
          if (draft.savedId) void syncTitle(draft.id);
        },
        onWarning: ({ photoId, message }) => {
          updatePhotos((current) =>
            current.map((item) =>
              item.id === photoId ? { ...item, notice: message } : item,
            ),
          );
        },
        onDone: ({ photoId }) => {
          if (!mounted.current) return;
          fallbackPhoto(photoId);
          updatePhotos((current) =>
            current.map((item) =>
              item.id === photoId ? { ...item, done: true } : item,
            ),
          );
        },
      },
      { maxPending: MAX_CAPTURE_PHOTOS },
    );
    return queue.current;
  }

  function addPhoto(file: File) {
    const rejection = validateCaptureFile(file, {
      count: photosRef.current.length,
      bytes: photosRef.current.reduce((sum, photo) => sum + photo.file.size, 0),
    });
    if (rejection) {
      setError(rejection);
      return;
    }
    const id = crypto.randomUUID();
    updatePhotos((current) => [
      ...current,
      { id, file, url: preview(file), availability, done: false, notice: '' },
    ]);
    setError('');
    setNotice('Foto guardada neste lote. Pode fotografar a próxima.');
    if (!recognitionQueue().enqueue(file, id)) {
      fallbackPhoto(id);
      updatePhotos((current) =>
        current.map((photo) =>
          photo.id === id
            ? {
                ...photo,
                done: true,
                notice:
                  'A fila de reconhecimento está cheia. A foto foi mantida; você pode recortar e nomear depois.',
              }
            : photo,
        ),
      );
    }
  }

  async function openCamera() {
    stopCamera();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'A câmera não está disponível neste navegador. Use Enviar fotos.',
      );
      setScreen('pick');
      return;
    }
    const attempt = cameraAttempt.current;
    setOpeningCamera(true);
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      if (!mounted.current || attempt !== cameraAttempt.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = nextStream;
      setOpeningCamera(false);
      setScreen('camera');
    } catch {
      if (attempt !== cameraAttempt.current || !mounted.current) return;
      setOpeningCamera(false);
      setError(
        'Não foi possível abrir a câmera. Libere a permissão ou envie fotos.',
      );
      setScreen('pick');
    }
  }

  async function takePhoto() {
    const currentVideo = video.current;
    if (
      shutterBusy.current ||
      !currentVideo?.videoWidth ||
      !currentVideo.videoHeight
    )
      return;
    shutterBusy.current = true;
    setTakingPhoto(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(
        1,
        3200 / Math.max(currentVideo.videoWidth, currentVideo.videoHeight),
      );
      canvas.width = Math.round(currentVideo.videoWidth * scale);
      canvas.height = Math.round(currentVideo.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível tirar a foto.');
      context.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92),
      );
      if (!blob) throw new Error('Não foi possível tirar a foto.');
      if (mounted.current)
        addPhoto(new File([blob], 'livros.jpg', { type: 'image/jpeg' }));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Tente fotografar novamente.',
      );
    } finally {
      shutterBusy.current = false;
      if (mounted.current) setTakingPhoto(false);
    }
  }

  function review() {
    stopCamera();
    setScreen('review');
  }
  function skipRecognition(photoId: string) {
    queue.current?.cancel(photoId);
    fallbackPhoto(photoId);
    updatePhotos((current) =>
      current.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              done: true,
              notice:
                'Reconhecimento interrompido. Confira os recortes e preencha títulos somente se quiser.',
            }
          : photo,
      ),
    );
    updateDrafts((current) =>
      current.map((draft) =>
        draft.photoId === photoId ? { ...draft, ocr: 'done' } : draft,
      ),
    );
  }

  async function saveBook(id: string) {
    const draft = draftsRef.current.find((item) => item.id === id);
    if (!draft || draft.saving || draft.savedId || draft.removed) return;
    let title: string;
    try {
      title = sanitizeBookTitle(draft.title);
    } catch {
      updateDrafts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                error:
                  'Use um título de até 200 caracteres ou deixe em branco.',
              }
            : item,
        ),
      );
      return;
    }
    updateDrafts((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, saving: true, uploadAttempted: true, error: '' }
          : item,
      ),
    );
    const form = new FormData();
    form.set(
      'photo',
      draft.blob,
      `livro-${id}.${draft.blob.type === 'image/png' ? 'png' : draft.blob.type === 'image/webp' ? 'webp' : draft.blob.type === 'image/gif' ? 'gif' : 'jpg'}`,
    );
    form.set('availability', draft.availability);
    form.set('title', title);
    form.set('uploadId', id);
    try {
      const payload = await requestJson('/api/books', {
        method: 'POST',
        body: form,
      });
      if (!payload.bookId)
        throw new Error('Resposta incompleta. Tente salvar novamente.');
      // A retry may replay an earlier committed upload. Always reconcile current metadata.
      serverTitles.current.set(
        id,
        JSON.stringify([payload.title, payload.availability]),
      );
      if (payload.updatedAt) serverVersions.current.set(id, payload.updatedAt);
      if (payload.isFirstBook) firstBookSaved.current = true;
      updateDrafts((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, saving: false, savedId: payload.bookId, error: '' }
            : item,
        ),
      );
      await syncTitle(id);
    } catch (caught) {
      updateDrafts((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                saving: false,
                error:
                  caught instanceof Error && caught.name !== 'AbortError'
                    ? caught.message
                    : 'O envio não foi confirmado. Tente novamente; não criaremos uma cópia.',
              }
            : item,
        ),
      );
    }
  }

  async function saveAll() {
    if (savingBatchRef.current) return;
    savingBatchRef.current = true;
    setSavingBatch(true);
    const ids = draftsRef.current
      .filter((draft) => !draft.removed && !draft.savedId)
      .map((draft) => draft.id);
    try {
      for (const id of ids) {
        if (!mounted.current) break;
        await saveBook(id);
      }
    } finally {
      savingBatchRef.current = false;
      if (mounted.current) setSavingBatch(false);
    }
  }

  function hasPendingMetadata(draft: Draft) {
    if (!draft.savedId || draft.removed) return false;
    try {
      return (
        serverTitles.current.get(draft.id) !==
        JSON.stringify([sanitizeBookTitle(draft.title), draft.availability])
      );
    } catch {
      return true;
    }
  }

  function leave() {
    stopCamera();
    queue.current?.dispose();
    queue.current = null;
    window.location.assign('/minha-estante');
  }
  function finish() {
    if (
      shutterBusy.current ||
      draftsRef.current.some((draft) => draft.saving) ||
      syncingTitles.current.size
    ) {
      setError('Aguarde terminar o envio antes de voltar para a estante.');
      return;
    }
    const unsaved = draftsRef.current.filter(
      (draft) => !draft.savedId && !draft.removed,
    ).length;
    const recognizing =
      photosRef.current.some((photo) => !photo.done) ||
      draftsRef.current.some(
        (draft) => !draft.removed && draft.ocr === 'pending',
      );
    const titleFailures = draftsRef.current.some(
      (draft) => draft.titleError || hasPendingMetadata(draft),
    );
    const uncertainUploads = draftsRef.current.some(
      (draft) => draft.uploadAttempted && !draft.savedId,
    );
    if (
      (unsaved || recognizing || titleFailures) &&
      !window.confirm(
        `${uncertainUploads ? 'Alguns envios não foram confirmados e podem já estar na estante. ' : ''}${unsaved ? `${unsaved} livro(s) ainda não foram salvos. ` : ''}${recognizing ? 'O reconhecimento ainda está em andamento. ' : ''}${titleFailures ? 'Há títulos com atualização pendente. ' : ''}Ao sair, os dados deste lote que ainda não foram salvos serão descartados. Sair mesmo assim?`,
      )
    )
      return;
    if (
      firstBookSaved.current &&
      !('Notification' in window && Notification.permission === 'granted')
    ) {
      stopCamera();
      setNotificationPromptOpen(true);
      return;
    }
    leave();
  }

  useEffect(() => {
    mounted.current = true;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        photosRef.current.some((photo) => !photo.done) ||
        draftsRef.current.some(
          (draft) =>
            !draft.removed &&
            (!draft.savedId ||
              draft.saving ||
              draft.ocr === 'pending' ||
              draft.titleError ||
              hasPendingMetadata(draft)),
        ) ||
        syncingTitles.current.size
      ) {
        event.preventDefault();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        cameraAttempt.current += 1;
        setOpeningCamera(false);
        if (stream.current) {
          stream.current.getTracks().forEach((track) => track.stop());
          stream.current = null;
          setScreen('pick');
          setNotice('A câmera foi pausada. Suas fotos continuam neste lote.');
        }
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    const urlSet = urls.current;
    const controllers = requestControllers.current;
    return () => {
      mounted.current = false;
      cameraAttempt.current += 1;
      stream.current?.getTracks().forEach((track) => track.stop());
      queue.current?.dispose();
      queue.current = null;
      controllers.forEach((controller) => controller.abort());
      urlSet.forEach((url) => URL.revokeObjectURL(url));
      urlSet.clear();
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (screen === 'camera' && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current
        .play()
        .catch(() =>
          setError('Toque em Fotografar quando a câmera estiver pronta.'),
        );
    }
  }, [screen]);

  const visible = drafts.filter((draft) => !draft.removed);
  const unsaved = visible.filter((draft) => !draft.savedId).length;
  const saved = visible.filter((draft) => draft.savedId).length;
  const pendingPhotos = photos.filter((photo) => !photo.done).length;
  const pendingTitles = visible.filter(
    (draft) => draft.ocr === 'pending',
  ).length;
  const editingPhoto = editing
    ? photos.find((photo) => photo.id === editing.photoId)
    : undefined;
  const editingDraft = editing?.draftId
    ? drafts.find((draft) => draft.id === editing.draftId)
    : undefined;

  if (!open)
    return (
      <Button className="h-12 rounded-2xl px-5" onClick={() => setOpen(true)}>
        <Camera /> Adicionar livros
      </Button>
    );

  return (
    <section className="rounded-[22px] border border-[#275b4b]/15 bg-card p-4 shadow-[0_18px_55px_rgb(44_43_37/8%)] sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
        Adicionar livros
      </p>
      <h2 className="mt-1 font-heading text-2xl font-bold">
        Uma foto, várias capas
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Deixe as capas visíveis, lado a lado, sem sobrepor. Você pode continuar
        fotografando enquanto separamos as capas e tentamos ler os títulos no
        próprio aparelho.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        O primeiro uso baixa os modelos e pode demorar. Fotos não são enviadas
        para serviços de IA. Confira os recortes; os títulos são sugestões.
        Mantenha esta tela aberta até salvar.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Novos livros:</span>
        <Button
          size="sm"
          variant={availability === 'loan' ? 'default' : 'outline'}
          onClick={() => setAvailability('loan')}
          aria-pressed={availability === 'loan'}
        >
          <Handshake /> Empréstimo
        </Button>
        <Button
          size="sm"
          variant={availability === 'donation' ? 'default' : 'outline'}
          onClick={() => setAvailability('donation')}
          aria-pressed={availability === 'donation'}
        >
          <Gift /> Doação
        </Button>
      </div>
      <Input
        ref={fileInput}
        className="hidden"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={(event) => {
          for (const file of Array.from(event.target.files ?? []))
            addPhoto(file);
          event.target.value = '';
          setScreen('review');
        }}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        <Button
          className="h-12"
          disabled={openingCamera || photos.length >= MAX_CAPTURE_PHOTOS}
          onClick={() => void openCamera()}
        >
          <Camera /> {openingCamera ? 'Abrindo…' : 'Abrir câmera'}
        </Button>
        <Button
          className="h-12"
          variant="outline"
          disabled={photos.length >= MAX_CAPTURE_PHOTOS}
          onClick={() => fileInput.current?.click()}
        >
          <FileUp /> Enviar fotos
        </Button>
        {openingCamera && (
          <Button variant="ghost" onClick={stopCamera}>
            Cancelar abertura
          </Button>
        )}
        {photos.length > 0 && (
          <Button
            className="col-span-2 h-12"
            variant="outline"
            onClick={review}
          >
            Revisar {visible.length || photos.length}{' '}
            {visible.length ? 'livros' : 'fotos'}
          </Button>
        )}
      </div>
      {notice && (
        <output className="mt-3 block text-sm text-[#275b4b]">{notice}</output>
      )}
      {error && (
        <p
          className="mt-3 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <p className="mt-3 text-sm" aria-live="polite">
          {photos.length} foto(s) · {visible.length} livro(s) · {saved} salvo(s)
          {pendingPhotos > 0
            ? ` · ${pendingPhotos} foto(s) em processamento`
            : ''}
          {pendingTitles > 0 ? ` · ${pendingTitles} título(s) em leitura` : ''}
        </p>
      )}

      {screen === 'camera' && (
        <div className="fixed inset-0 z-[100] bg-black text-white">
          <video
            ref={video}
            className="size-full object-contain"
            autoPlay
            muted
            playsInline
          />
          <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/90 to-transparent p-4 pb-12">
            <p className="font-semibold">
              {photos.length} foto(s) guardada(s) · {visible.length} livro(s)
            </p>
            <p className="mt-1 text-sm">
              {pendingPhotos || pendingTitles
                ? 'Reconhecimento em segundo plano. Pode fotografar a próxima.'
                : 'Capas lado a lado, sem sobrepor.'}
            </p>
            <p className="mt-1 text-xs">
              Novos livros: {availability === 'loan' ? 'empréstimo' : 'doação'}
            </p>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12">
            {error && (
              <p role="alert" className="mb-3 rounded-xl bg-black/80 p-3">
                {error}
              </p>
            )}
            {notice && <output className="mb-3 block text-sm">{notice}</output>}
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
              <Button
                className="h-16 bg-white text-black hover:bg-white/90"
                disabled={takingPhoto || photos.length >= MAX_CAPTURE_PHOTOS}
                onClick={() => void takePhoto()}
              >
                {takingPhoto ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Camera />
                )}{' '}
                Fotografar
              </Button>
              <Button
                className="h-16 border-white/40 bg-black/50 text-white"
                variant="outline"
                onClick={() => {
                  stopCamera();
                  setScreen(photos.length ? 'review' : 'pick');
                }}
              >
                Parar e revisar
              </Button>
            </div>
          </div>
        </div>
      )}

      {screen === 'review' && photos.length > 0 && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Confira antes de salvar</h3>
              <p className="text-sm text-muted-foreground">
                Pode salvar sem esperar o OCR. Os títulos encontrados depois
                serão atualizados enquanto esta tela estiver aberta.
              </p>
            </div>
            <Button
              onClick={() => void saveAll()}
              disabled={savingBatch || !unsaved}
            >
              {savingBatch ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check />
              )}{' '}
              {savingBatch ? 'Salvando…' : `Salvar ${unsaved} livro(s)`}
            </Button>
          </div>
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              className="rounded-xl border bg-background/60 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="relative h-20 w-24 shrink-0">
                  <Image
                    fill
                    unoptimized
                    src={photo.url}
                    alt={`Foto original ${index + 1}`}
                    sizes="96px"
                    className="rounded-lg object-contain"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Foto {index + 1} ·{' '}
                    {
                      visible.filter((draft) => draft.photoId === photo.id)
                        .length
                    }{' '}
                    livro(s)
                  </p>
                  {!photo.done && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Detectando capas ou lendo títulos…
                    </p>
                  )}
                  {photo.notice && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {photo.notice}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !photo.done &&
                        !drafts.some((draft) => draft.photoId === photo.id)
                      }
                      onClick={() => setEditing({ photoId: photo.id })}
                    >
                      <Plus /> Adicionar recorte
                    </Button>
                    {!photo.done && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => skipRecognition(photo.id)}
                      >
                        Continuar sem reconhecimento
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((draft, index) => (
              <article
                key={draft.id}
                className="overflow-hidden rounded-2xl border bg-background"
              >
                <div className="relative aspect-[4/3] bg-[#e8dfcd]">
                  <Image
                    fill
                    unoptimized
                    src={draft.url}
                    alt={draft.title || `Livro ${index + 1}`}
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-contain"
                  />
                </div>
                <div className="space-y-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold">Livro {index + 1}</p>
                    {draft.savedId && (
                      <span className="text-xs font-semibold text-[#275b4b]">
                        Salvo ✓
                      </span>
                    )}
                  </div>
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`title-${draft.id}`}
                  >
                    Título sugerido (opcional)
                  </label>
                  <Input
                    id={`title-${draft.id}`}
                    value={draft.title}
                    maxLength={200}
                    placeholder={
                      draft.ocr === 'pending'
                        ? 'Lendo no aparelho… pode seguir'
                        : 'Sem título identificado'
                    }
                    onChange={(event) =>
                      updateDrafts((current) =>
                        current.map((item) =>
                          item.id === draft.id
                            ? {
                                ...item,
                                title: event.target.value,
                                titleEdited: true,
                              }
                            : item,
                        ),
                      )
                    }
                    onBlur={() => {
                      if (draft.savedId) void syncTitle(draft.id);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.titleEdited
                      ? 'Sua edição será preservada.'
                      : draft.ocr === 'pending'
                        ? 'OCR em segundo plano. Não é preciso esperar.'
                        : draft.ocr === 'error'
                          ? 'Não conseguimos ler o título. Pode deixar vazio.'
                          : draft.title
                            ? 'Confira a sugestão; o OCR pode confundir título e autor.'
                            : 'Título não identificado. Pode deixar vazio.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      disabled={draft.saving || Boolean(draft.savedId)}
                      variant={
                        draft.availability === 'loan' ? 'default' : 'outline'
                      }
                      onClick={() =>
                        updateDrafts((current) =>
                          current.map((item) =>
                            item.id === draft.id
                              ? { ...item, availability: 'loan' }
                              : item,
                          ),
                        )
                      }
                    >
                      Empréstimo
                    </Button>
                    <Button
                      size="sm"
                      disabled={draft.saving || Boolean(draft.savedId)}
                      variant={
                        draft.availability === 'donation'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() =>
                        updateDrafts((current) =>
                          current.map((item) =>
                            item.id === draft.id
                              ? { ...item, availability: 'donation' }
                              : item,
                          ),
                        )
                      }
                    >
                      Doação
                    </Button>
                  </div>
                  {!draft.savedId && (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={
                          savingBatch || draft.saving || draft.uploadAttempted
                        }
                        onClick={() =>
                          setEditing({
                            photoId: draft.photoId,
                            draftId: draft.id,
                          })
                        }
                      >
                        <Crop /> Ajustar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={draft.saving || draft.uploadAttempted}
                        onClick={() =>
                          updateDrafts((current) =>
                            current.map((item) =>
                              item.id === draft.id
                                ? { ...item, removed: true }
                                : item,
                            ),
                          )
                        }
                      >
                        <Trash2 /> Descartar
                      </Button>
                    </div>
                  )}
                  {draft.saving && (
                    <output className="block text-sm">Salvando foto…</output>
                  )}
                  {draft.error && (
                    <p role="alert" className="text-sm text-destructive">
                      {draft.error} O recorte fica protegido até confirmar o
                      envio. Depois você pode remover o livro pela estante.
                    </p>
                  )}
                  {draft.titleError && (
                    <div>
                      <p role="alert" className="text-sm text-destructive">
                        {draft.titleError}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void syncTitle(draft.id)}
                      >
                        Tentar título novamente
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 border-t pt-4">
            <Button
              disabled={savingBatch || !unsaved}
              onClick={() => void saveAll()}
            >
              {savingBatch ? 'Salvando…' : `Salvar ${unsaved} livro(s)`}
            </Button>
            <Button variant="outline" disabled={savingBatch} onClick={finish}>
              Voltar para minha estante
            </Button>
          </div>
        </div>
      )}
      {editingPhoto && editing && (
        <BookCropEditor
          sourceUrl={editingPhoto.url}
          initialBounds={editingDraft?.bounds ?? wholePhoto}
          onCancel={() => setEditing(null)}
          onSave={(blob, bounds) => {
            const currentDraft = draftsRef.current.find(
              (item) => item.id === editing.draftId,
            );
            if (
              editing.draftId &&
              (!currentDraft ||
                currentDraft.removed ||
                currentDraft.uploadAttempted ||
                currentDraft.savedId ||
                currentDraft.saving)
            ) {
              throw new Error(
                'Este livro já começou a ser enviado. Feche o recorte para manter a foto salva.',
              );
            }
            const id = editing.draftId ?? crypto.randomUUID();
            const ocrKey = crypto.randomUUID();
            const url = preview(blob);
            updateDrafts((current) =>
              editing.draftId
                ? current.map((item) =>
                    item.id === id
                      ? {
                          ...item,
                          blob,
                          bounds,
                          url,
                          ocrKey,
                          ocr: 'pending',
                          title: item.titleEdited ? item.title : '',
                        }
                      : item,
                  )
                : [
                    ...current,
                    {
                      id,
                      photoId: editing.photoId,
                      ocrKey,
                      blob,
                      url,
                      bounds,
                      title: '',
                      titleEdited: false,
                      ocr: 'pending',
                      availability: editingPhoto.availability,
                      saving: false,
                      uploadAttempted: false,
                      error: '',
                      titleError: '',
                      removed: false,
                    },
                  ],
            );
            if (
              !recognitionQueue().enqueueCrop(blob, {
                photoId: `edited-${ocrKey}`,
                cropId: ocrKey,
              })
            )
              updateDrafts((current) =>
                current.map((item) =>
                  item.id === id ? { ...item, ocr: 'error' } : item,
                ),
              );
            setEditing(null);
          }}
        />
      )}
      {notificationPromptOpen && (
        <NotificationPermissionDialog
          completionLabel="Voltar para minha estante"
          onComplete={leave}
        />
      )}
    </section>
  );
}
