import prisma from '../lib/db';
import bcrypt from 'bcryptjs';

async function createAdmin() {
  const username = 'admin';
  const password = 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name: '管理员',
        email: 'admin@yixin.com',
        providerType: 'credentials',
        role: 'admin',
      },
    });

    console.log('✅ 管理员账户创建成功！');
    console.log('----------------------------------');
    console.log('用户名:', username);
    console.log('密码:', password);
    console.log('----------------------------------');
    console.log('请登录后立即修改密码！');
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      console.log('⚠️  管理员账户已存在，跳过创建');
    } else {
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
