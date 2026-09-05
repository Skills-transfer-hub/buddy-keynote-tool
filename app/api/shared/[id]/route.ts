import { env } from 'cloudflare:workers';
import { sharedRequest } from '@/lib/shared/server';
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return sharedRequest(
    request,
    env as unknown as Parameters<typeof sharedRequest>[1],
    (await context.params).id,
  );
}
