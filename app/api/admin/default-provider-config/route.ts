import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  getDefaultProviderConfig,
  saveDefaultProviderConfig,
  toPublicDefaultProviderConfig,
} from '@/lib/server/default-provider-config';
import { apiError, apiSuccess } from '@/lib/server/api-response';

function adminOnly(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session as { user?: { role?: string } } | null)?.user?.role === 'admin';
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!adminOnly(session)) {
    return apiError('INVALID_REQUEST', 403, 'Admin only');
  }

  const config = await getDefaultProviderConfig();
  return apiSuccess({ defaults: toPublicDefaultProviderConfig(config) });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!adminOnly(session)) {
    return apiError('INVALID_REQUEST', 403, 'Admin only');
  }

  const body = await req.json();
  const current = await getDefaultProviderConfig();

  // If front-end passes '******' for ttsVoicesMap apiKey, restore from current
  if (body && Array.isArray(body.ttsVoicesMap)) {
    body.ttsVoicesMap = body.ttsVoicesMap.map((item: any) => {
      const existing = current.ttsVoicesMap?.find((e) => e.voiceId === item.voiceId);
      if (item.apiKey === '******' && existing) {
        return {
          ...item,
          apiKey: existing.apiKey,
        };
      }
      return item;
    });
  }

  const config = await saveDefaultProviderConfig({
    ...current,
    ...body,
  });
  return apiSuccess({ defaults: toPublicDefaultProviderConfig(config) });
}
