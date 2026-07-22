import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';

interface DingTalkProfile {
  unionid: string;
  nickName: string;
  avatarUrl?: string;
  email?: string;
  mobile?: string;
}

export default function DingTalkProvider<P extends DingTalkProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: 'dingtalk',
    name: '钉钉',
    type: 'oauth',
    authorization: {
      url: 'https://login.dingtalk.com/oauth2/auth',
      params: {
        response_type: 'code',
        scope: 'openid',
        prompt: 'consent',
      },
    },
    token: {
      url: 'https://api.dingtalk.com/v1.0/oauth2/userAccessToken',
    },
    userinfo: {
      url: 'https://api.dingtalk.com/v1.0/contact/users/me',
    },
    profile(profile) {
      return {
        id: profile.unionid,
        name: profile.nickName,
        email: profile.email,
        image: profile.avatarUrl,
      };
    },
    style: {
      logo: 'https://img.alicdn.com/imgextra/i1/O1CN01MoJuXw1Z9GYD0eUv6_!!6000000003157-2-tps-500-500.png',
      bg: '#0089FF',
      text: '#fff',
    },
    ...options,
  };
}
