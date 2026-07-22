import type { OAuthConfig, OAuthUserConfig } from 'next-auth/providers/oauth';

interface WecomProfile {
  userid: string;
  name: string;
  avatar?: string;
  email?: string;
}

export default function WecomProvider<P extends WecomProfile>(
  options: OAuthUserConfig<P>,
): OAuthConfig<P> {
  return {
    id: 'wecom',
    name: '企业微信',
    type: 'oauth',
    authorization: {
      url: 'https://open.weixin.qq.com/connect/oauth2/authorize',
      params: {
        appid: options.clientId,
        response_type: 'code',
        scope: 'snsapi_privateinfo',
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
        id: profile.userid,
        name: profile.name,
        email: profile.email,
        image: profile.avatar,
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
