declare module 'react-native-live-audio-stream' {
  type InitOptions = {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    audioSource?: number;
    bufferSize?: number;
    wavFile?: string;
  };

  const LiveAudioStream: {
    init: (options: InitOptions) => void;
    start: () => void;
    stop: () => void;
    on: (event: 'data', handler: (data: string) => void) => void;
  };

  export default LiveAudioStream;
}
