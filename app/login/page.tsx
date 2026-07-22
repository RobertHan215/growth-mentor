'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast.error('登录失败', {
          description: '用户名或密码错误',
        });
      } else {
        router.push('/');
      }
    } catch (error) {
      toast.error('登录失败', {
        description: '发生未知错误，请重试',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = (provider: string) => {
    signIn(provider, { callbackUrl: '/' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-slate-800 rounded-2xl shadow-xl">
        <div className="text-center">
          <img src="/logo-horizontal.png" alt="易鑫大学堂" className="h-20 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">欢迎登录</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            易鑫大学堂 - AI互动课堂平台
          </p>
        </div>

        <form onSubmit={handleCredentialsLogin} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              用户名
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              required
              className="w-full"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              密码
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              className="w-full"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '登录中...' : '登录'}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-200 dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-400">
              或使用以下方式登录
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="outline"
            onClick={() => handleOAuthLogin('wecom')}
            className="flex flex-col items-center py-4 h-auto"
          >
            <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
            </svg>
            <span className="text-xs">企业微信</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => handleOAuthLogin('dingtalk')}
            className="flex flex-col items-center py-4 h-auto"
          >
            <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
            <span className="text-xs">钉钉</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => handleOAuthLogin('lark')}
            className="flex flex-col items-center py-4 h-auto"
          >
            <svg className="w-6 h-6 mb-1" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="4" />
            </svg>
            <span className="text-xs">飞书</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
