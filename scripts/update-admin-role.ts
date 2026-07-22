import prisma from '../lib/db';

async function updateAdminRole() {
  try {
    const user = await prisma.user.update({
      where: { username: 'admin' },
      data: { role: 'admin' },
    });

    console.log('✅ 管理员角色更新成功！');
    console.log('用户名:', user.username);
    console.log('角色:', user.role);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('更新失败:', error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminRole();