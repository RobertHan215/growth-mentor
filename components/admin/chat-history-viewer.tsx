'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { User, Bot, Volume2, VolumeX } from 'lucide-react';

interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

interface MessageType {
  role: string;
  content?: string;
  parts?: MessagePart[];
  senderName?: string;
  senderAvatar?: string;
  audioUrl?: string;
  metadata?: {
    senderName?: string;
    senderAvatar?: string;
    originalRole?: 'teacher' | 'agent' | 'user';
    agentId?: string;
    agentColor?: string;
    createdAt?: number;
  };
  timestamp?: number;
}

interface ChatHistoryViewerProps {
  messages: unknown; // Can be string (needs parsing) or array
  autoplayActive?: boolean;
  autoplayInterval?: number; // 秒
  autoScrollEnabled?: boolean;
  playbackRate?: number; // 播放倍速
  onAutoplayFinished?: () => void;
}

export function ChatHistoryViewer({
  messages: rawMessages,
  autoplayActive = false,
  autoplayInterval = 1.0,
  autoScrollEnabled = true,
  playbackRate = 1.0,
  onAutoplayFinished,
}: ChatHistoryViewerProps) {
  let messages: MessageType[] = [];
  const [playingAudioUrl, setPlayingAudioUrl] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  
  // ── 新增自动播放状态 ──
  const [currentPlayingIndex, setCurrentPlayingIndex] = React.useState<number | null>(null);
  const autoplayTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const messagesRefs = React.useRef<Record<number, HTMLDivElement | null>>({});

  try {
    if (typeof rawMessages === 'string') {
      messages = JSON.parse(rawMessages);
    } else if (Array.isArray(rawMessages)) {
      messages = rawMessages;
    }
  } catch (e) {
    console.error('Failed to parse chat messages', e);
  }

  // 查找下一个有音频的消息 index
  const findNextAudioMessageIndex = React.useCallback(
    (startIndex: number): number => {
      for (let i = startIndex; i < messages.length; i++) {
        if (messages[i].audioUrl) {
          return i;
        }
      }
      return -1;
    },
    [messages],
  );

  // 依次播放具体某一条消息的音频
  const playMessageAudio = React.useCallback(
    (index: number) => {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const msg = messages[index];
      if (!msg || !msg.audioUrl) {
        // 如果数据异常，尝试播下一条
        const nextIndex = findNextAudioMessageIndex(index + 1);
        if (nextIndex !== -1) {
          playMessageAudio(nextIndex);
        } else {
          setCurrentPlayingIndex(null);
          onAutoplayFinished?.();
        }
        return;
      }

      const audio = new Audio(msg.audioUrl);
      audio.playbackRate = playbackRate; // 设置倍速
      audioRef.current = audio;
      setPlayingAudioUrl(msg.audioUrl);
      setCurrentPlayingIndex(index);

      // 平滑滚动并聚焦
      if (autoScrollEnabled) {
        setTimeout(() => {
          const element = messagesRefs.current[index];
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);
      }

      audio.play().catch((err) => {
        console.error('Failed to play audio during autoplay:', err);
        // 如果播放失败，等待间隔后自动播放下一条，防止卡死
        autoplayTimerRef.current = setTimeout(() => {
          const nextIndex = findNextAudioMessageIndex(index + 1);
          if (nextIndex !== -1) {
            playMessageAudio(nextIndex);
          } else {
            setCurrentPlayingIndex(null);
            onAutoplayFinished?.();
          }
        }, autoplayInterval * 1000);
      });

      audio.onended = () => {
        setPlayingAudioUrl(null);
        audioRef.current = null;

        // 音频播放完后，等待 autoplayInterval 秒再播放下一句
        autoplayTimerRef.current = setTimeout(() => {
          const nextIndex = findNextAudioMessageIndex(index + 1);
          if (nextIndex !== -1) {
            playMessageAudio(nextIndex);
          } else {
            setCurrentPlayingIndex(null);
            onAutoplayFinished?.();
          }
        }, autoplayInterval * 1000);
      };
    },
    [messages, autoScrollEnabled, autoplayInterval, playbackRate, findNextAudioMessageIndex, onAutoplayFinished],
  );

  // 监听外部的连播激活状态
  React.useEffect(() => {
    if (autoplayActive) {
      const startIndex = currentPlayingIndex !== null ? currentPlayingIndex : 0;
      const targetIndex = findNextAudioMessageIndex(startIndex);
      if (targetIndex !== -1) {
        playMessageAudio(targetIndex);
      } else {
        onAutoplayFinished?.();
      }
    } else {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setPlayingAudioUrl(null);
      }
      setCurrentPlayingIndex(null);
    }
  }, [autoplayActive]);

  // 监听倍速变化，并实时应用到当前播放的 audio 实例上
  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // 切换不同的对话数据时，立即清空状态并打断连播
  React.useEffect(() => {
    if (autoplayActive) {
      onAutoplayFinished?.();
    }
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingAudioUrl(null);
    }
    setCurrentPlayingIndex(null);
  }, [rawMessages]);

  // 组件卸载时安全清理
  React.useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) {
        clearTimeout(autoplayTimerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handlePlayAudio = (url: string, index?: number) => {
    // 手动播放时，如果连播正开着，先打断它
    if (autoplayActive) {
      onAutoplayFinished?.();
    }

    if (playingAudioUrl === url) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingAudioUrl(null);
      if (index === currentPlayingIndex) {
        setCurrentPlayingIndex(null);
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audio.playbackRate = playbackRate; // 设置倍速
      audioRef.current = audio;
      setPlayingAudioUrl(url);
      if (index !== undefined) {
        setCurrentPlayingIndex(index);
      }
      audio.play().catch((err) => {
        console.error('Failed to play audio:', err);
        setPlayingAudioUrl(null);
        setCurrentPlayingIndex(null);
      });
      audio.onended = () => {
        setPlayingAudioUrl(null);
        audioRef.current = null;
        if (index === currentPlayingIndex) {
          setCurrentPlayingIndex(null);
        }
      };
    }
  };

  // Helper to extract text content from message
  const getMessageContent = (msg: MessageType): string => {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.parts)) {
      return msg.parts
        .filter((part) => part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('');
    }
    return '';
  };

  const formatMessageTime = (timestamp?: number) => {
    if (!timestamp) return null;
    const normalized = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getMonth() + 1}-${date.getDate()} ${date
      .getHours()
      .toString()
      .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="space-y-6 py-6 max-h-[600px] overflow-y-auto px-4 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 bg-slate-50/30 dark:bg-slate-950/10 rounded-2xl border border-slate-100 dark:border-slate-800/80 transition-all duration-300"
    >
      {messages.map((msg, index) => {
        const content = getMessageContent(msg);
        if (!content) return null;

        const isUser = msg.role === 'user' || msg.metadata?.originalRole === 'user';
        const senderName =
          msg.metadata?.senderName || msg.senderName || (isUser ? '用户' : 'AI 助手');
        const avatar = msg.metadata?.senderAvatar || msg.senderAvatar;
        const color = msg.metadata?.agentColor || (isUser ? '#EF4444' : '#3B82F6');
        const messageTime = formatMessageTime(msg.metadata?.createdAt || msg.timestamp);
        const isCurrentPlaying = index === currentPlayingIndex;

        return (
          <div
            key={index}
            ref={(el) => {
              messagesRefs.current[index] = el;
            }}
            className={cn(
              'flex gap-4 items-start group transition-all duration-300 rounded-2xl p-2',
              isUser ? 'flex-row-reverse' : 'flex-row',
              isCurrentPlaying && (isUser 
                ? 'bg-rose-500/5 dark:bg-rose-950/10 scale-[1.01]' 
                : 'bg-blue-500/5 dark:bg-blue-950/10 scale-[1.01]')
            )}
          >
            {/* Avatar container with dynamic ring */}
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 text-xs font-semibold overflow-hidden shadow-sm transition-all duration-300 group-hover:scale-105 border-2',
                isUser 
                  ? 'border-red-100 dark:border-red-950/50 bg-gradient-to-br from-red-400 to-red-500' 
                  : 'border-blue-100 dark:border-blue-950/50 bg-gradient-to-br from-blue-400 to-blue-500',
                isCurrentPlaying && (isUser 
                  ? 'ring-4 ring-rose-450 border-rose-350 scale-105 shadow-md shadow-rose-500/30' 
                  : 'ring-4 ring-blue-400 border-blue-350 scale-105 shadow-md shadow-blue-500/30')
              )}
              style={!isUser && color && !isCurrentPlaying ? { borderColor: `${color}33`, backgroundColor: color } : undefined}
            >
              {avatar ? (
                <img src={avatar} alt={senderName} className="w-full h-full object-cover" />
              ) : isUser ? (
                <User className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </div>

            {/* Bubble details */}
            <div className={cn('flex flex-col max-w-[72%]', isUser ? 'items-end' : 'items-start')}>
              {/* Name & Time */}
              <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                <span>{senderName}</span>
                {messageTime && (
                  <>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span>{messageTime}</span>
                  </>
                )}
              </div>

              {/* Text Bubble */}
              <div
                className={cn(
                  'px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words border transition-all duration-300',
                  isUser
                    ? cn(
                        'bg-gradient-to-br from-red-500 via-rose-500 to-rose-600 border-red-400/20 text-white rounded-tr-none shadow-sm shadow-red-500/10 dark:shadow-none',
                        isCurrentPlaying && 'ring-4 ring-rose-450 border-rose-350 shadow-[0_0_25px_rgba(244,63,94,0.65)]'
                      )
                    : cn(
                        'bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm text-slate-800 dark:text-slate-100 border-slate-200/60 dark:border-slate-800/80 rounded-tl-none shadow-sm',
                        isCurrentPlaying && 'ring-4 ring-blue-500 border-blue-450 shadow-[0_0_25px_rgba(59,130,246,0.65)] bg-gradient-to-br from-blue-50/20 to-white dark:from-slate-900/40 dark:to-slate-900'
                      )
                )}
              >
                {content}
              </div>
              {msg.audioUrl && (
                <button
                  onClick={() => handlePlayAudio(msg.audioUrl!, index)}
                  className={cn(
                    'mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all shadow-sm border border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900',
                    playingAudioUrl === msg.audioUrl
                      ? 'text-red-500 border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/20'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                    isUser ? 'ml-auto' : 'mr-auto'
                  )}
                >
                  {playingAudioUrl === msg.audioUrl ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 animate-pulse" /> 停止播放
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5" /> 播放语音
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
