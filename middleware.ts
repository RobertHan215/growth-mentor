import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function redirectToLogin(req: NextRequest) {
  // clone nextUrl so basePath is preserved (new URL('/login', req.url) drops it)
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 公开路径，不需要认证
  const publicPaths = ['/login', '/api/auth', '/api/server-providers', '/callback'];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 静态资源不需要认证
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') // 文件资源
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Admin 路由需要 admin 权限
  if (pathname.startsWith('/admin')) {
    if (token?.role !== 'admin') {
      return redirectToLogin(req);
    }
    return NextResponse.next();
  }

  // 其他路径需要认证
  if (!token) {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
