import { useState, useRef, useCallback } from 'react';
import { createLogger } from '@/lib/logger';
import {
  calculateRmsLevel,
  createSilenceAutoStopDetector,
  DEFAULT_SILENCE_AUTO_STOP_OPTIONS,
} from '@/lib/audio/silence-auto-stop';

const log = createLogger('AudioRecorder');

// TypeScript declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed in lib.dom
    SpeechRecognition: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed in lib.dom
    webkitSpeechRecognition: any;
  }
}

export interface UseAudioRecorderOptions {
  onTranscription?: (text: string, audioUrl?: string) => void;
  onError?: (error: string) => void;
  autoStopOnSilence?: boolean;
  minRecordingMs?: number;
  silenceDurationMs?: number;
  silenceThreshold?: number;
  maxRecordingMs?: number;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const {
    onTranscription,
    onError,
    autoStopOnSilence = false,
    minRecordingMs = DEFAULT_SILENCE_AUTO_STOP_OPTIONS.minRecordingMs,
    silenceDurationMs = DEFAULT_SILENCE_AUTO_STOP_OPTIONS.silenceDurationMs,
    silenceThreshold = DEFAULT_SILENCE_AUTO_STOP_OPTIONS.silenceThreshold,
    maxRecordingMs = DEFAULT_SILENCE_AUTO_STOP_OPTIONS.maxRecordingMs,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartedAtRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Web Speech API not typed
  const speechRecognitionRef = useRef<any>(null);
  // Synchronous lock to prevent rapid re-entry (React state updates are async)
  const busyRef = useRef(false);

  const clearRecordingTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanupVoiceActivityDetection = useCallback(() => {
    if (vadFrameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {
        /* best-effort cleanup */
      });
    }
  }, []);

  const cleanupAutoStop = useCallback(() => {
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }

    cleanupVoiceActivityDetection();
  }, [cleanupVoiceActivityDetection]);

  const stopActiveMediaRecorder = useCallback(() => {
    cleanupAutoStop();

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    busyRef.current = false;
    setIsRecording(false);
    clearRecordingTimer();
  }, [cleanupAutoStop, clearRecordingTimer]);

  // Send audio to server for transcription
  const transcribeAudio = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        // Get current ASR configuration from settings store
        // Note: This requires importing useSettingsStore in browser context
        if (typeof window !== 'undefined') {
          const { useSettingsStore } = await import('@/lib/store/settings');
          const { asrProviderId, asrLanguage, asrProvidersConfig, useFrontendASRConfig } =
            useSettingsStore.getState();

          formData.append('providerId', asrProviderId);
          formData.append('language', asrLanguage);

          // Append API key and base URL if configured
          const providerConfig = asrProvidersConfig?.[asrProviderId];
          if (providerConfig?.apiKey?.trim()) {
            formData.append('apiKey', providerConfig.apiKey);
          }
          if (providerConfig?.baseUrl?.trim()) {
            formData.append('baseUrl', providerConfig.baseUrl);
          }
          if (providerConfig?.thirdPartyEndpointType) {
            formData.append('thirdPartyEndpointType', providerConfig.thirdPartyEndpointType);
          }
          formData.append('useFrontendASRConfig', String(useFrontendASRConfig));
        }

        const response = await fetch('/api/transcription', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Transcription failed');
        }

        const result = await response.json();
        onTranscription?.(result.text, result.url);
      } catch (error) {
        log.error('Transcription error:', error);
        onError?.(error instanceof Error ? error.message : '语音识别失败，请重试');
      } finally {
        setIsProcessing(false);
        setRecordingTime(0);
      }
    },
    [onTranscription, onError],
  );

  // Start recording
  const startRecording = useCallback(async () => {
    // Synchronous lock — React state is async so isRecording may be stale
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Get current ASR configuration
      if (typeof window !== 'undefined') {
        const { useSettingsStore } = await import('@/lib/store/settings');
        const { asrProviderId, asrLanguage } = useSettingsStore.getState();

        // Use browser native ASR if configured
        if (asrProviderId === 'browser-native') {
          // Check if Speech Recognition is supported
          if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
            onError?.('您的浏览器不支持语音识别功能');
            busyRef.current = false;
            return;
          }

          const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          const recognition = new SpeechRecognition();

          recognition.lang = asrLanguage || 'zh-CN';
          recognition.continuous = false;
          recognition.interimResults = false;

          recognition.onstart = () => {
            setIsRecording(true);
            setRecordingTime(0);

            // Start timer
            timerRef.current = setInterval(() => {
              setRecordingTime((prev) => prev + 1);
            }, 1000);
          };

          recognition.onresult = (event: {
            results: {
              [index: number]: { [index: number]: { transcript: string } };
            };
          }) => {
            const transcript = event.results[0][0].transcript;
            onTranscription?.(transcript);
          };

          recognition.onerror = (event: { error: string }) => {
            log.error('Speech recognition error:', event.error);
            let errorMessage = '语音识别失败';

            switch (event.error) {
              case 'aborted':
                // Non-fatal: caused by our own cancel/stop logic or rapid toggle
                busyRef.current = false;
                setIsRecording(false);
                setRecordingTime(0);
                if (timerRef.current) {
                  clearInterval(timerRef.current);
                  timerRef.current = null;
                }
                return;
              case 'no-speech':
                errorMessage = '未检测到语音输入';
                break;
              case 'audio-capture':
                errorMessage = '无法访问麦克风';
                break;
              case 'not-allowed':
                errorMessage = '麦克风权限被拒绝';
                break;
              case 'network':
                errorMessage = '网络错误';
                break;
              default:
                errorMessage = `语音识别错误: ${event.error}`;
            }

            onError?.(errorMessage);
            busyRef.current = false;
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.onend = () => {
            busyRef.current = false;
            setIsRecording(false);
            setRecordingTime(0);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
          };

          recognition.start();
          speechRecognitionRef.current = recognition;
          return;
        }
      }

      // Use MediaRecorder for server-side ASR
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // ─── Web Audio Gain 节点增益处理 ───
      let mediaStreamForRecorder = stream;
      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

        if (AudioContextCtor) {
          const audioContext = new AudioContextCtor();
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          
          // 创建 Gain 节点放大音量，放大 7 倍
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 7.0;

          const destination = audioContext.createMediaStreamDestination();
          
          // 连线：source -> gainNode -> destination
          source.connect(gainNode);
          gainNode.connect(destination);

          // 用放大后的流来录音
          mediaStreamForRecorder = destination.stream;
        }
      } catch (audioCtxErr) {
        log.warn('Failed to initialize Web Audio API Gain Node, falling back to raw stream:', audioCtxErr);
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(mediaStreamForRecorder, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        cleanupAutoStop();
        clearRecordingTimer();
        mediaRecorderRef.current = null;

        // Stop all audio tracks for both stream and target stream
        stream.getTracks().forEach((track) => track.stop());
        try {
          mediaStreamForRecorder.getTracks().forEach((track) => track.stop());
        } catch (_) {}

        // Merge audio chunks
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });

        // Send to server for transcription
        await transcribeAudio(audioBlob);
        busyRef.current = false;
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingStartedAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();

      if (autoStopOnSilence && maxRecordingMs > 0) {
        maxRecordingTimerRef.current = setTimeout(() => {
          stopActiveMediaRecorder();
        }, maxRecordingMs);
      }

      if (autoStopOnSilence && typeof window !== 'undefined' && audioContextRef.current) {
        try {
          const audioContext = audioContextRef.current;
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);

          const detector = createSilenceAutoStopDetector({
            minRecordingMs,
            silenceDurationMs,
            silenceThreshold,
            maxRecordingMs,
          });
          const timeDomainData = new Uint8Array(analyser.fftSize);

          const pollVoiceLevel = () => {
            if (mediaRecorder.state !== 'recording') return;

            analyser.getByteTimeDomainData(timeDomainData);
            const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const elapsedMs = now - recordingStartedAtRef.current;
            const level = calculateRmsLevel(timeDomainData);

            if (detector.shouldStop({ level, elapsedMs, nowMs: now })) {
              stopActiveMediaRecorder();
              return;
            }

            vadFrameRef.current = window.requestAnimationFrame(pollVoiceLevel);
          };

          vadFrameRef.current = window.requestAnimationFrame(pollVoiceLevel);
        } catch (error) {
          log.warn('Failed to start silence detection:', error);
          cleanupVoiceActivityDetection();
        }
      }

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      busyRef.current = false;
      cleanupAutoStop();
      log.error('Failed to start recording:', error);
      const errorName = error instanceof DOMException ? error.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        onError?.('麦克风权限被拒绝，请在浏览器地址栏允许麦克风权限后重试');
      } else {
        onError?.('无法访问麦克风，请检查权限设置');
      }
    }
  }, [
    autoStopOnSilence,
    cleanupAutoStop,
    cleanupVoiceActivityDetection,
    clearRecordingTimer,
    maxRecordingMs,
    minRecordingMs,
    onTranscription,
    onError,
    silenceDurationMs,
    silenceThreshold,
    stopActiveMediaRecorder,
    transcribeAudio,
  ]);

  // Stop recording
  const stopRecording = useCallback(() => {
    // Stop Speech Recognition if active
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      busyRef.current = false;
      setIsRecording(false);
      clearRecordingTimer();
      return;
    }

    // Stop MediaRecorder if active
    if (mediaRecorderRef.current) {
      stopActiveMediaRecorder();
    }
  }, [clearRecordingTimer, stopActiveMediaRecorder]);

  // Cancel recording
  const cancelRecording = useCallback(() => {
    // Cancel Speech Recognition if active
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.onresult = null; // Prevent transcription callback
      speechRecognitionRef.current.onerror = null; // Suppress browser abort error events
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);
      clearRecordingTimer();
      return;
    }

    // Cancel MediaRecorder if active
    if (mediaRecorderRef.current) {
      cleanupAutoStop();
      // Stop recording without transcription
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop all audio tracks
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      mediaRecorderRef.current = null;

      busyRef.current = false;
      setIsRecording(false);
      setRecordingTime(0);
      clearRecordingTimer();

      audioChunksRef.current = [];
    }
  }, [cleanupAutoStop, clearRecordingTimer]);

  return {
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
