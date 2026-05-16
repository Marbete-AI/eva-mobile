import React, {useState, useRef, useCallback, useEffect} from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {
  EvaWsClient,
  type ServerMessage,
  type ConnectionStatus,
} from '../lib/ws-client';
import {sendMessage} from '../lib/api-client';
import {getOrCreateDriverId} from '../lib/driver-identity';
import {playTTSAudio} from '../lib/audio';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting...',
  connected: 'Live',
  disconnected: 'Reconnecting...',
  error: 'Connection error',
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connecting: '#888',
  connected: '#4a9eff',
  disconnected: '#f59e0b',
  error: '#ef4444',
};

const LOADING_TIMEOUT_MS = 15000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'eva';
  text: string;
  requestId?: string;
  trigger?: string;
  feedback?: 'up' | 'down';
  timestamp: Date;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Chat'>;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatScreen({navigation}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>('connecting');
  const [driverIdReady, setDriverIdReady] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const wsRef = useRef<EvaWsClient | null>(null);
  const driverIdRef = useRef<string | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const addMessage = useCallback(
    (partial: Omit<Message, 'id' | 'timestamp'>) => {
      const msg: Message = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
        ...partial,
      };
      setMessages(prev => [...prev, msg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80);
    },
    [],
  );

  const setLoadingWithTimeout = useCallback((value: boolean) => {
    setLoading(value);
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (value) {
      loadingTimerRef.current = setTimeout(() => {
        setLoading(false);
      }, LOADING_TIMEOUT_MS);
    }
  }, []);

  const clearLoading = useCallback(() => {
    setLoadingWithTimeout(false);
  }, [setLoadingWithTimeout]);

  // ── Feedback ──────────────────────────────────────────────────────────────

  const handleFeedback = useCallback(
    (msg: Message, type: 'up' | 'down') => {
      // Optimistic UI update
      setMessages(prev =>
        prev.map(m =>
          m.id === msg.id ? {...m, feedback: type} : m,
        ),
      );
      // Send to server
      wsRef.current?.sendFeedback(
        type === 'up' ? 'thumbs_up' : 'thumbs_down',
        undefined,
        msg.requestId,
      );
    },
    [],
  );

  // ── Server message handler ────────────────────────────────────────────────

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'session_started':
          addMessage({
            role: 'eva',
            text: "Connected. I'm EVA — your co-pilot. Type to get started.",
          });
          break;

        case 'asr_transcript':
          addMessage({role: 'user', text: msg.transcript});
          setLoadingWithTimeout(true);
          break;

        case 'asr_empty':
          clearLoading();
          break;

        case 'eva_response':
          clearLoading();
          addMessage({
            role: 'eva',
            text: msg.text,
            requestId: msg.requestId,
            trigger: msg.trigger,
          });
          break;

        case 'eva_audio':
          void playTTSAudio(msg.audioBase64);
          break;

        case 'cancelled':
          clearLoading();
          break;

        case 'error':
          clearLoading();
          addMessage({role: 'eva', text: `Error: ${msg.message}`});
          break;

        case 'context_update':
        case 'listening_started':
        case 'listening_stopped':
        case 'asr_partial':
          break;
      }
    },
    [addMessage, setLoadingWithTimeout, clearLoading],
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    getOrCreateDriverId().then(id => {
      if (cancelled) return;
      driverIdRef.current = id;
      setDriverIdReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!driverIdReady) return;

    const client = new EvaWsClient({
      driverId: driverIdRef.current ?? undefined,
      onMessage: handleServerMessage,
      onStatusChange: status => {
        setWsStatus(status);
        if (status === 'connected') clearLoading();
      },
    });

    wsRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleServerMessage, driverIdReady]);

  useEffect(() => {
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, []);

  // ── Text send ────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoadingWithTimeout(true);
    addMessage({role: 'user', text});

    if (wsRef.current && wsStatus === 'connected') {
      wsRef.current.sendVoiceInput(text, 1.0);
    } else {
      try {
        const result = await sendMessage(text);
        addMessage({role: 'eva', text: result.response, requestId: result.requestId});
      } catch (err) {
        addMessage({
          role: 'eva',
          text: `Error: ${err instanceof Error ? err.message : 'Unknown'}`,
        });
      } finally {
        clearLoading();
      }
    }
  }, [input, loading, wsStatus, addMessage, setLoadingWithTimeout, clearLoading]);

  // ── Cancel ───────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    wsRef.current?.sendCancel();
    clearLoading();
  }, [clearLoading]);

  // ── Render ───────────────────────────────────────────────────────────────

  const isProactive = (msg: Message) =>
    msg.role === 'eva' && msg.trigger && msg.trigger !== 'voice';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>EVA</Text>
          <Text style={styles.headerSubtitle}>In-cabin AI co-pilot</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.statusBadge}>
            <View
              style={[
                styles.statusDot,
                {backgroundColor: STATUS_COLORS[wsStatus]},
              ]}
            />
            <Text style={[styles.statusLabel, {color: STATUS_COLORS[wsStatus]}]}>
              {STATUS_LABELS[wsStatus]}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          keyboardShouldPersistTaps="handled">

          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {'Type a message below to talk to EVA.'}
              </Text>
            </View>
          )}

          {messages.map(msg => (
            <View key={msg.id}>
              {isProactive(msg) && (
                <Text style={styles.proactiveLabel}>EVA — proactive</Text>
              )}
              <View
                style={[
                  styles.messageBubble,
                  msg.role === 'user' ? styles.userBubble : styles.evaBubble,
                  isProactive(msg) && styles.proactiveBubble,
                ]}>
                {msg.role === 'eva' && !isProactive(msg) && (
                  <Text style={styles.senderLabel}>EVA</Text>
                )}
                <Text
                  style={[
                    styles.messageText,
                    msg.role === 'user'
                      ? styles.userMessageText
                      : styles.evaMessageText,
                  ]}>
                  {msg.text}
                </Text>

                {/* Thumbs feedback — only on EVA messages that have a requestId */}
                {msg.role === 'eva' && msg.requestId && (
                  <View style={styles.feedbackRow}>
                    <TouchableOpacity
                      style={[
                        styles.feedbackButton,
                        msg.feedback === 'up' && styles.feedbackButtonActive,
                      ]}
                      onPress={() => handleFeedback(msg, 'up')}
                      disabled={!!msg.feedback}>
                      <Text style={styles.feedbackIcon}>
                        {msg.feedback === 'up' ? '👍' : '👍'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.feedbackButton,
                        msg.feedback === 'down' && styles.feedbackButtonActiveDown,
                      ]}
                      onPress={() => handleFeedback(msg, 'down')}
                      disabled={!!msg.feedback}>
                      <Text style={styles.feedbackIcon}>
                        {msg.feedback === 'down' ? '👎' : '👎'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          ))}

          {loading && (
            <View style={[styles.messageBubble, styles.evaBubble]}>
              <Text style={styles.senderLabel}>EVA</Text>
              <ActivityIndicator size="small" color="#4a9eff" />
            </View>
          )}
        </ScrollView>

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Type to EVA..."
            placeholderTextColor="#555"
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            editable={true}
          />

          {loading ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                !input.trim() && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!input.trim()}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#0a0a0a'},
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {fontSize: 22, fontWeight: '700', color: '#fff', letterSpacing: 2},
  headerSubtitle: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 12},
  statusBadge: {flexDirection: 'row', alignItems: 'center', gap: 5},
  statusDot: {width: 6, height: 6, borderRadius: 3},
  statusLabel: {fontSize: 11, fontWeight: '600'},
  settingsButton: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#1e1e1e',
  },
  settingsIcon: {fontSize: 16, color: '#666'},
  messageList: {flex: 1},
  messageListContent: {padding: 16, gap: 10},
  emptyState: {flex: 1, alignItems: 'center', paddingTop: 80},
  emptyStateText: {
    color: '#444',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {alignSelf: 'flex-end', backgroundColor: '#1a3a5c'},
  evaBubble: {alignSelf: 'flex-start', backgroundColor: '#1a1a1a'},
  proactiveBubble: {
    backgroundColor: '#1a2a1a',
    borderLeftWidth: 2,
    borderLeftColor: '#4a9e4a',
  },
  proactiveLabel: {
    fontSize: 10,
    color: '#4a9e4a',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  senderLabel: {
    fontSize: 10,
    color: '#4a9eff',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  messageText: {fontSize: 15, lineHeight: 21},
  userMessageText: {color: '#e8f0fe'},
  evaMessageText: {color: '#d0d0d0'},
  feedbackRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  feedbackButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'transparent',
    opacity: 0.5,
  },
  feedbackButtonActive: {
    backgroundColor: '#1a2a1a',
    opacity: 1,
  },
  feedbackButtonActiveDown: {
    backgroundColor: '#2a1a1a',
    opacity: 1,
  },
  feedbackIcon: {fontSize: 16},
  inputRow: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    gap: 8,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#141414',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  sendButton: {
    backgroundColor: '#4a9eff',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  sendButtonDisabled: {backgroundColor: '#1a3a5c', opacity: 0.5},
  sendButtonText: {color: '#fff', fontWeight: '600', fontSize: 14},
  cancelButton: {
    backgroundColor: '#2a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#aa3333',
  },
  cancelText: {color: '#ff6666', fontWeight: '600', fontSize: 14},
});
