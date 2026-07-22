'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { asset, installBasePathFetch } from '@/lib/branding';

// Ensure bare fetch('/api/...') picks up NEXT_PUBLIC_BASE_PATH before any child effects run.
installBasePathFetch();

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props) {
  // next-auth client defaults to /api/auth; must include Next basePath or it gets HTML 404.
  return <SessionProvider basePath={asset('/api/auth')}>{children}</SessionProvider>;
}
