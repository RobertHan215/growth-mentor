import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/db';
import WecomProvider from './providers/wecom';
import DingTalkProvider from './providers/dingtalk';
import LarkProvider from './providers/lark';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: '用户名', type: 'text' },
        password: { label: '密码', type: 'password' },
      },
      async authorize(credentials) {
        console.log('[Auth] authorize called, username:', credentials?.username);
        console.log('[Auth] DATABASE_URL:', process.env.DATABASE_URL);
        if (!credentials?.username || !credentials?.password) {
          console.log('[Auth] missing credentials');
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { username: credentials.username },
          });
          console.log(
            '[Auth] user from DB:',
            user ? { id: user.id, username: user.username, hasHash: !!user.passwordHash } : null,
          );

          if (!user || !user.passwordHash) {
            console.log('[Auth] no user or no passwordHash');
            return null;
          }

          const passwordMatch = await bcrypt.compare(credentials.password, user.passwordHash);
          console.log('[Auth] password match:', passwordMatch);

          if (!passwordMatch) {
            return null;
          }

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.avatar,
            role: user.role,
          } as const;
        } catch (err) {
          console.error('[Auth] DB error:', err);
          return null;
        }
      },
    }),
    WecomProvider({
      clientId: process.env.WECOM_CORPID || '',
      clientSecret: process.env.WECOM_SECRET || '',
    }),
    DingTalkProvider({
      clientId: process.env.DINGTALK_APPKEY || '',
      clientSecret: process.env.DINGTALK_APPSECRET || '',
    }),
    LarkProvider({
      clientId: process.env.LARK_APP_ID || '',
      clientSecret: process.env.LARK_APP_SECRET || '',
    }),
  ],
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account, profile }: any) {
      if (account?.provider === 'credentials') {
        return true;
      }

      if (account?.provider && profile) {
        const providerId = profile.sub || profile.id || user.id;
        const existingUser = await prisma.user.findFirst({
          where: {
            providerType: account.provider,
            providerId: providerId,
          },
        });

        if (!existingUser) {
          await prisma.user.create({
            data: {
              name: user.name || 'User',
              email: user.email,
              avatar: user.image,
              providerType: account.provider,
              providerId: providerId,
            },
          });
        }
      }

      return true;
    },
  },
};

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: string;
  }
}
