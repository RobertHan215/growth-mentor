'use client';

/**
 * One-on-One TTS Hook
 *
 * Lightweight TTS hook for the one-on-one training mode.
 * Reads TTS configuration from the global Settings Store and supports both
 * browser-native (Web Speech API) and server-side TTS providers.
 *
 * Unlike `useDiscussionTTS` (designed for multi-agent queue-based playback),
 * this hook provides a simple speak/cancel interface for single-message TTS.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/settings';
import { useBrowserTTS } from '@/lib/hooks/use-browser-tts';

export interface UseOneOnOneTTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onGenerated?: (url: string) => void;
}

export function useOneOnOneTTS(options: UseOneOnOneTTSOptions = {}) {
  const { onStart, onEnd, onError, onGenerated } = options;

  // ── Settings store ──
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsSpeed = useSettingsStore((s) => s.ttsSpeed);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const useFrontendTTSConfig = useSettingsStore((s) => s.useFrontendTTSConfig);

  // ── State ──
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep callback refs to avoid stale closures
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  const onGeneratedRef = useRef(onGenerated);
  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
    onGeneratedRef.current = onGenerated;
  }, [onStart, onEnd, onError, onGenerated]);

  // ── Browser TTS (fallback) ──
  const {
    speak: browserSpeak,
    cancel: browserCancel,
    isSpeaking: browserIsSpeaking,
    availableVoices,
  } = useBrowserTTS({
    rate: ttsSpeed,
    onStart: () => {
      setIsSpeaking(true);
      onStartRef.current?.();
    },
    onEnd: () => {
      setIsSpeaking(false);
      onEndRef.current?.();
    },
    onError: (err) => {
      setIsSpeaking(false);
      onErrorRef.current?.(err);
    },
  });

  // Keep availableVoices in a ref so the speak closure can always see the latest list
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    availableVoicesRef.current = availableVoices;
  }, [availableVoices]);

  const isBrowserProvider = ttsProviderId === 'browser-native-tts';

  // ── Cancel any active playback ──
  const cancel = useCallback(() => {
    // Cancel browser TTS
    browserCancel();
    // Cancel server TTS
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, [browserCancel]);

  // ── Speak ──
  const speak = useCallback(
    async (text: string, templateId?: string) => {
      // Cancel any previous playback first
      cancel();

      if (!text.trim()) return;

      // ── Browser native TTS ──
      if (isBrowserProvider) {
        browserSpeak(text);
        return;
      }

      // ── Server-side TTS ──
      setIsSpeaking(true);
      onStartRef.current?.();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const providerConfig = ttsProvidersConfig[ttsProviderId];
        const res = await fetch('/api/generate/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            audioId: `oto-${Date.now()}`,
            ttsProviderId,
            ttsVoice,
            ttsSpeed,
            ttsApiKey: providerConfig?.apiKey,
            ttsBaseUrl: providerConfig?.serverBaseUrl || providerConfig?.baseUrl,
            useFrontendTTSConfig,
            templateId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(errData.error || `TTS API error: ${res.status}`);
        }

        const data = await res.json();
        if (!data.base64) throw new Error('No audio data in TTS response');

        if (data.url) {
          onGeneratedRef.current?.(data.url);
        }

        // Decode base64 → data URL → Audio (use data.url directly if available)
        const audioUrl = data.url || `data:audio/${data.format || 'mp3'};base64,${data.base64}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.addEventListener('ended', () => {
          audioRef.current = null;
          setIsSpeaking(false);
          onEndRef.current?.();
        });
        audio.addEventListener('error', () => {
          audioRef.current = null;
          setIsSpeaking(false);
          onErrorRef.current?.('Audio playback failed');
        });

        await audio.play();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // Cancelled, no-op
        // ── Fallback to browser TTS (prefer Microsoft Huihui) ──
        const voices = availableVoicesRef.current;
        const huihui =
          voices.find((v) => v.name.toLowerCase().includes('huihui')) ??
          voices.find(
            (v) => v.lang.startsWith('zh') && v.name.toLowerCase().includes('microsoft'),
          ) ??
          voices.find((v) => v.lang.startsWith('zh-CN')) ??
          null;
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'zh-CN';
          utter.rate = ttsSpeed;
          if (huihui) utter.voice = huihui;
          utter.onstart = () => {
            setIsSpeaking(true);
            onStartRef.current?.();
          };
          utter.onend = () => {
            setIsSpeaking(false);
            onEndRef.current?.();
          };
          utter.onerror = () => {
            setIsSpeaking(false);
          };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        } else {
          setIsSpeaking(false);
          onErrorRef.current?.((err as Error).message || 'TTS 生成失败');
        }
      }
    },
    [
      cancel,
      isBrowserProvider,
      browserSpeak,
      ttsProviderId,
      ttsVoice,
      ttsSpeed,
      ttsProvidersConfig,
      useFrontendTTSConfig,
    ],
  );

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      browserCancel();
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, [browserCancel]);

  return {
    speak,
    cancel,
    isSpeaking: isBrowserProvider ? browserIsSpeaking : isSpeaking,
    availableVoices,
  };
}
