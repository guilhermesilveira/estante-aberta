'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  FileUp,
  Gift,
  Handshake,
  LoaderCircle,
  RotateCcw,
  Square,
} from 'lucide-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Phase = 'pick' | 'camera' | 'preview' | 'saving';
type PhotoSource = 'camera' | 'file';

export function BookUploader({
  defaultOpen = false,
}: {
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [phase, setPhase] = useState<Phase>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<PhotoSource>('camera');
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (phase === 'camera' && video.current && stream.current) {
      video.current.srcObject = stream.current;
      void video.current.play();
    }
  }, [phase]);

  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function stopCamera() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }

  function clearPhoto() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  }

  function showPhoto(nextFile: File, source: PhotoSource) {
    stopCamera();
    clearPhoto();
    setPhotoSource(source);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
    setError('');
    setPhase('preview');
  }

  async function openCamera() {
    clearPhoto();
    stopCamera();
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'A câmera não está disponível neste navegador. Use “Enviar arquivo”.',
      );
      setPhase('pick');
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      setPhase('camera');
    } catch {
      setError(
        'Não foi possível abrir a câmera. Libere a permissão ou envie um arquivo.',
      );
      setPhase('pick');
    }
  }

  async function takePhoto() {
    const currentVideo = video.current;
    if (
      !currentVideo ||
      !currentVideo.videoWidth ||
      !currentVideo.videoHeight
    ) {
      setError(
        'A câmera ainda está iniciando. Tente novamente em um instante.',
      );
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = currentVideo.videoWidth;
    canvas.height = currentVideo.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(currentVideo, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    if (!blob) {
      setError('Não foi possível tirar a foto. Tente novamente.');
      return;
    }
    showPhoto(
      new File([blob], `livro-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      'camera',
    );
  }

  async function saveBook(availability: 'loan' | 'donation') {
    if (!file) return;
    setPhase('saving');
    setError('');
    const formData = new FormData();
    formData.set('photo', file);
    formData.set('availability', availability);

    try {
      const response = await fetch('/api/books', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || 'Não foi possível salvar.');
      clearPhoto();
      setSavedCount((count) => count + 1);
      if (photoSource === 'camera') {
        await openCamera();
      } else {
        setPhase('pick');
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível salvar.',
      );
      setPhase('preview');
    }
  }

  function stopForNow() {
    stopCamera();
    clearPhoto();
    setPhase('pick');
    setOpen(false);
    window.location.assign('/minha-estante');
  }

  if (!open) {
    return (
      <Button className="h-12 rounded-2xl px-5" onClick={() => setOpen(true)}>
        <Camera className="size-5" data-icon="inline-start" />
        Adicionar um livro
      </Button>
    );
  }

  return (
    <section className="rounded-[28px] border border-[#275b4b]/15 bg-card p-4 shadow-[0_18px_55px_rgb(44_43_37/8%)] sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#d35c41]">
          Adicionar livro
        </p>
        <h2 className="mt-1 font-heading text-2xl font-bold tracking-[-0.04em]">
          {phase === 'preview' || phase === 'saving'
            ? 'O que você quer fazer com este livro?'
            : 'Tire uma foto do livro'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Uma foto corresponde a um livro.
        </p>
      </div>

      {savedCount > 0 && phase === 'pick' && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#e8f2ed] px-4 py-3 text-[#275b4b]">
          <span className="grid size-8 place-items-center rounded-full bg-white">
            <Check className="size-4" />
          </span>
          <p className="text-sm font-semibold">
            Livro salvo. Você já pode cadastrar o próximo.
          </p>
        </div>
      )}

      {phase === 'pick' && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Button className="h-24 rounded-2xl text-base" onClick={openCamera}>
            <Camera className="size-6" /> Abrir câmera
          </Button>
          <Button
            className="h-24 rounded-2xl text-base"
            variant="outline"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="size-6" /> Enviar arquivo
          </Button>
          <Input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => {
              const nextFile = event.target.files?.[0];
              if (nextFile) showPhoto(nextFile, 'file');
              event.target.value = '';
            }}
          />
          <Button
            className="sm:col-span-2"
            variant="ghost"
            onClick={stopForNow}
          >
            <Square /> Parar por agora
          </Button>
        </div>
      )}

      {phase === 'camera' && (
        <div className="fixed inset-0 z-[100] bg-black">
          <video
            ref={video}
            className="size-full object-cover"
            autoPlay
            muted
            playsInline
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-20">
            <div className="mx-auto grid w-full max-w-lg grid-cols-2 gap-3">
              <Button
                className="h-14 rounded-2xl bg-white text-black hover:bg-white/90"
                onClick={takePhoto}
              >
                <Check /> Confirmar
              </Button>
              <Button
                className="h-14 rounded-2xl border-white/45 bg-black/35 text-white hover:bg-black/55"
                variant="outline"
                onClick={stopForNow}
              >
                <Square /> Parar
              </Button>
            </div>
          </div>
          {error && (
            <p
              className="absolute inset-x-4 top-5 mx-auto max-w-lg rounded-xl bg-black/70 px-4 py-3 text-center text-sm font-medium text-white"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}

      {(phase === 'preview' || phase === 'saving') && previewUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#151714] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-3xl bg-black">
            <Image
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 760px"
              className="object-contain"
              src={previewUrl}
              alt="Foto do livro"
            />
          </div>
          <div className="mx-auto mt-4 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
            <Button
              className="h-13 rounded-2xl border-white/35 bg-white/10 text-white hover:bg-white/20"
              variant="outline"
              disabled={phase === 'saving'}
              onClick={
                photoSource === 'camera'
                  ? openCamera
                  : () => fileInput.current?.click()
              }
            >
              <RotateCcw /> Nova foto
            </Button>
            <Button
              className="h-13 rounded-2xl bg-[#d35c41] hover:bg-[#bb4d36]"
              disabled={phase === 'saving'}
              onClick={() => saveBook('donation')}
            >
              {phase === 'saving' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Gift />
              )}{' '}
              Doação
            </Button>
            <Button
              className="h-13 rounded-2xl bg-[#387c67] hover:bg-[#2f6a58]"
              disabled={phase === 'saving'}
              onClick={() => saveBook('loan')}
            >
              {phase === 'saving' ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Handshake />
              )}{' '}
              Empréstimo
            </Button>
          </div>
          {error && (
            <p
              className="mx-auto mt-3 w-full max-w-2xl rounded-xl bg-destructive/15 px-4 py-3 text-center text-sm font-medium text-white"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}

      {error && phase === 'pick' && (
        <p
          className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
    </section>
  );
}
