export interface VideoPlaybackDetails {
  type: 'html5' | 'embed' | 'hls';
  url: string;
  mimeType?: string;
  durationSeconds?: number;
}

export interface IVideoProvider {
  readonly providerName: string;

  /**
   * Resolves raw storage key, external ID, or direct URL into an accessible playback object.
   */
  resolvePlayback(videoRef: string): Promise<VideoPlaybackDetails>;

  /**
   * Validates whether a provided reference is supported by this provider.
   */
  validateReference(videoRef: string): Promise<boolean>;
}
