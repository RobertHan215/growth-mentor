import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // 公开路径，不需要认证
        const publicPaths = ['/login', '/api/auth'];

        if (publicPaths.some((path) => pathname.startsWith(path))) {
          return true;
        }

        // 静态资源不需要认证
        if (
          pathname.startsWith('/_next') ||
          pathname.startsWith('/favicon') ||
          pathname.includes('.') // 文件资源
        ) {
          return true;
        }

        // 其他路径需要认证
        return !!token;
      },
    },
  },
);

export const config = {
  matcher: [
    /*
     * 匹配所有路径除了:
     * - _next/static (静态文件)
     * - _next/image (图片优化文件)
     * - favicon.ico (网站图标)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
