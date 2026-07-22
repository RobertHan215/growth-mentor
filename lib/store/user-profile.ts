/**
 * User Profile Store
 * Persists avatar, nickname & bio to localStorage
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { asset } from '@/lib/branding';

/** Predefined avatar options (basePath-aware) */
export const AVATAR_OPTIONS = [
  asset('/avatars/user.png'),
  asset('/avatars/teacher-2.png'),
  asset('/avatars/assist-2.png'),
  asset('/avatars/clown-2.png'),
  asset('/avatars/curious-2.png'),
  asset('/avatars/note-taker-2.png'),
  asset('/avatars/thinker-2.png'),
] as const;

export interface UserProfileState {
  /** Local avatar path or data-URL (for custom uploads) */
  avatar: string;
  nickname: string;
  bio: string;
  setAvatar: (avatar: string) => void;
  setNickname: (nickname: string) => void;
  setBio: (bio: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      avatar: AVATAR_OPTIONS[0],
      nickname: '',
      bio: '',
      setAvatar: (avatar) => set({ avatar }),
      setNickname: (nickname) => set({ nickname }),
      setBio: (bio) => set({ bio }),
    }),
    {
      name: 'user-profile-storage',
      // Old localStorage values lack basePath — rewrite on rehydrate.
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<UserProfileState>;
        return {
          ...current,
          ...p,
          avatar: p.avatar ? asset(p.avatar) : current.avatar,
        };
      },
    },
  ),
);
