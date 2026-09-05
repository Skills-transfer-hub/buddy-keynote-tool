import { env } from 'cloudflare:workers';
import { sharedRequest } from '@/lib/shared/server';
export function POST(request: Request) {
  return sharedRequest(
    request,
    env as unknown as Parameters<typeof sharedRequest>[1],
  );
}
