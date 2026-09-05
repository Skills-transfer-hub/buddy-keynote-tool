import { sharedRequest, json } from '@/lib/shared/server';
import { getSharedBindings } from '@/lib/shared/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return await sharedRequest(
      request,
      getSharedBindings(),
      (await context.params).id,
    );
  } catch {
    return json({ error: 'Le serveur de partage n’est pas configuré.' }, 503);
  }
}
