import { redirect } from 'next/navigation';

import { requireChatGPTUser, safeRelativeReturnPath } from '@/app/chatgpt-auth';
import { NameSetup } from '@/components/name-setup';
import { getOrCreateProfileName } from '@/db/repository';

export const dynamic = 'force-dynamic';

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  const { return_to: requestedReturnTo } = await searchParams;
  const returnTo = safeRelativeReturnPath(
    requestedReturnTo ?? '/minha-estante',
  );
  return <AuthenticatedRegistration returnTo={returnTo} />;
}

async function AuthenticatedRegistration({ returnTo }: { returnTo: string }) {
  const user = await requireChatGPTUser(
    `/cadastro?return_to=${encodeURIComponent(returnTo)}`,
  );
  const profileName = await getOrCreateProfileName(user);
  if (profileName) redirect(returnTo);

  return <NameSetup returnTo={returnTo} />;
}
