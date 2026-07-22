import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma as db } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || !session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: 'Missing old or new password' }, { status: 400 });
    }

    // Fetch user
    const user = await db.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: 'User does not use password authentication' }, { status: 400 });
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Incorrect old password' }, { status: 400 });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update user
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
