import { getChatGPTUser } from '@/app/chatgpt-auth';
import { saveProfileName } from '@/db/repository';

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  try {
    const name = await saveProfileName(user, body.name);
    return Response.json({ name });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar seu nome.',
      },
      { status: 400 },
    );
  }
}
