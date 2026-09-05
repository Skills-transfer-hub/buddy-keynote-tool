import { sharedRequest, json } from '@/lib/shared/server';
import { getSharedBindings } from '@/lib/shared/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    return await sharedRequest(request, getSharedBindings());
  } catch {
    return json({ error: 'Le serveur de partage n’est pas configuré.' }, 503);
  }
}
