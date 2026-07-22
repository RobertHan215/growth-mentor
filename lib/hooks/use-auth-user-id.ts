'use client';

import { useSession } from 'next-auth/react';

export function useAuthUserId(): string | undefined {
  const { data: session } = useSession();
  return session?.user?.id;
}
