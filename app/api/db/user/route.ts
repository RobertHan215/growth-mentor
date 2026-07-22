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
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        providerType: true,
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

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email || null;
      if (data.role !== undefined) updateData.role = data.role;
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
