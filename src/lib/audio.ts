import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';

/**
 * EVA Audio Manager — TTS playback only.
 *
 * Receives base64-encoded MP3 from ElevenLabs via the server WS,
 * writes to a temp file, and plays via react-native-sound.
 *
 * Always-listening / PTT mic input is handled in week-4/conversation-mode
 * and will be integrated once that branch is stable.
 */

// ── TTS playback ──────────────────────────────────────────────────────────────

/**
 * Play base64-encoded MP3 audio from ElevenLabs TTS.
 */
export async function playTTSAudio(audioBase64: string): Promise<void> {
  try {
    const tempPath = `${RNFS.CachesDirectoryPath}/eva_tts.mp3`;
    await RNFS.writeFile(tempPath, audioBase64, 'base64');

    await new Promise<void>((resolve, reject) => {
      Sound.setCategory('Playback', true);
      const sound = new Sound(tempPath, '', err => {
        if (err) {
          reject(err);
          return;
        }
        sound.play(success => {
          sound.release();
          if (success) resolve();
          else reject(new Error('TTS playback failed'));
        });
      });
    });
  } catch (err) {
    console.error('[audio] TTS playback error:', err);
  }
}
