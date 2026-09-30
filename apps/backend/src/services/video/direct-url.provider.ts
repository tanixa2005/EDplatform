import { IVideoProvider, VideoPlaybackDetails } from './video-provider.interface.js';

export class DirectUrlVideoProvider implements IVideoProvider {
  readonly providerName = 'direct-url';

  async resolvePlayback(videoRef: string): Promise<VideoPlaybackDetails> {
    const isEmbed = videoRef.includes('youtube.com') || videoRef.includes('youtu.be') || videoRef.includes('vimeo.com');

    return {
      type: isEmbed ? 'embed' : 'html5',
      url: videoRef,
      mimeType: isEmbed ? undefined : 'video/mp4'
    };
  }

  async validateReference(videoRef: string): Promise<boolean> {
    if (!videoRef || typeof videoRef !== 'string') return false;
    try {
      new URL(videoRef);
      return true;
    } catch {
      return false;
    }
  }
}

export const directUrlVideoProvider = new DirectUrlVideoProvider();
