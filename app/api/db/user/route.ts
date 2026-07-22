import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import bcrypt from 'bcryptjs';

function apiLog(
  name: string,
  method: string,
  url: string,
  body: unknown,
  status: number,
  ms: number,
) {
  const bodyStr = body ? `IN=${JSON.stringify(body)}` : '';
  console.log(`[API] ${name} ${method} ${url} ${status} ${ms}ms ${bodyStr}`);
}

// GET /api/db/user - List all users (admin only)
export async function GET(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const searchParams = request.nextUrl.searchParams;
    const pageStr = searchParams.get('page');
    const limitStr = searchParams.get('limit');
    const search = searchParams.get('search') || '';

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { username: { contains: search } },
      ];
    }

    if (pageStr) {
      const page = parseInt(pageStr || '1');
      const limit = parseInt(limitStr || '10');
      const total = await prisma.user.count({ where });

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          providerType: true,
          enabled: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      apiLog('user', 'GET', url, { page, limit, search }, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: users, total, page, limit });
    }

    // fallback to original all-users list
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        providerType: true,
        enabled: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    apiLog('user', 'GET', url, null, 200, Date.now() - start);
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    apiLog('user', 'GET', url, null, 500, Date.now() - start);
    console.error('User API error:', error);
    return NextResponse.json({ error: 'Failed to get users' }, { status: 500 });
  }
}

// POST /api/db/user - Create / Update / Delete user
export async function POST(request: NextRequest) {
  const start = Date.now();
  const url = request.url;
  try {
    const body = await request.json();
    const { action, data } = body;
    apiLog('user', 'POST', url, { action, data: { ...data, password: data?.password ? '***' : undefined } }, 0, 0);

    if (action === 'create') {
      if (!data.username || !data.password || !data.name) {
        return NextResponse.json({ error: '用户名、密码和姓名为必填项' }, { status: 400 });
      }

      // Check if username already exists
      const existing = await prisma.user.findUnique({
        where: { username: data.username },
      });
      if (existing) {
        return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = await prisma.user.create({
        data: {
          username: data.username,
          passwordHash,
          name: data.name,
          email: data.email || null,
          role: data.role || 'user',
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      apiLog('user', 'POST', url, { action, userId: user.id }, 200, Date.now() - start);
      return NextResponse.json({ success: true, data: user });
    }

    if (action === 'update') {
      if (!data.id) {
        return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: data.id },
      });
      if (!existingUser) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }

      // Rule: Admin or 'admin' account cannot be disabled or change its role.
      const isAdmin = existingUser.role === 'admin' || existingUser.username === 'admin';
      
      if (isAdmin) {
        if (data.enabled === false) {
          return NextResponse.json({ error: '管理员账号无法被禁用' }, { status: 400 });
        }
        if (data.role !== undefined && data.role !== existingUser.role) {
          return NextResponse.json({ error: '管理员账号的角色权限无法修改' }, { status: 400 });
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.password) {
        updateData.passwordHash = await bcrypt.hash(data.password, 10);
      }

      await prisma.user.update({
        where: { id: data.id },
        data: updateData,
      });

      apiLog('user', 'POST', url, { action, userId: data.id }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      if (!data.id) {
        return NextResponse.json({ error: 'Missing user id' }, { status: 400 });
      }

      await prisma.user.delete({
        where: { id: data.id },
      });

      apiLog('user', 'POST', url, { action, userId: data.id }, 200, Date.now() - start);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    apiLog('user', 'POST', url, null, 500, Date.now() - start);
    console.error('User API error:', error);
    return NextResponse.json({ error: 'Failed to process user' }, { status: 500 });
  }
}
