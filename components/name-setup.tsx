'use client';

import { LoaderCircle, UserRound } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PERSON_NAME_MAX_LENGTH } from '@/lib/person-name';

export function NameSetup({ returnTo }: { returnTo: string }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function saveName(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível salvar seu nome.');
      }
      window.location.assign(returnTo);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível salvar seu nome.',
      );
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh items-start bg-[#f6f1e8] px-4 py-4 sm:place-items-center sm:px-5 sm:py-10">
      <section className="w-full max-w-md rounded-[24px] border bg-card p-5 shadow-[0_24px_80px_rgb(44_43_37/12%)] sm:rounded-[30px] sm:p-8">
        <span className="grid size-12 place-items-center rounded-2xl bg-[#e8f2ed] text-[#275b4b]">
          <UserRound className="size-6" />
        </span>
        <h1 className="mt-4 font-heading text-[2rem] font-bold leading-tight tracking-[-0.05em] sm:mt-5 sm:text-4xl">
          Como podemos chamar você?
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          Use um nome ou nome e sobrenome. Ele aparecerá nos pedidos e na sua
          estante.
        </p>
        <form className="mt-5 sm:mt-6" onSubmit={saveName}>
          <label className="block text-sm font-semibold" htmlFor="profile-name">
            Nome
            <Input
              id="profile-name"
              className="mt-2 h-12 rounded-xl bg-background"
              autoComplete="name"
              maxLength={PERSON_NAME_MAX_LENGTH}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              placeholder="Ex.: Ana ou Ana Lima"
              required
            />
          </label>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Até 21 caracteres e no máximo um espaço.
          </p>
          {error && (
            <p
              className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          <Button
            className="mt-5 h-12 w-full rounded-2xl"
            disabled={busy}
            type="submit"
          >
            {busy && <LoaderCircle className="animate-spin" />}
            Continuar
          </Button>
        </form>
      </section>
    </main>
  );
}
