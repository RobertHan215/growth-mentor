import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';

interface LarkProfile {
  open_id: string;
  name: string;
  avatar_url?: string;
  email?: string;
  mobile?: string;
}

export default function LarkProvider<P extends LarkProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: 'lark',
    name: '飞书',
    type: 'oauth',
    authorization: {
      url: 'https://passport.feishu.cn/suite/passport/page/authorize',
      params: {
        response_type: 'code',
        scope: 'contact:user.base:readonly',
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
        id: profile.open_id,
        name: profile.name,
        email: profile.email,
        image: profile.avatar_url,
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
