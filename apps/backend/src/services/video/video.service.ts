import { IVideoProvider, VideoPlaybackDetails } from './video-provider.interface.js';
import { directUrlVideoProvider } from './direct-url.provider.js';

export class VideoService {
  private provider: IVideoProvider;

  constructor(provider: IVideoProvider = directUrlVideoProvider) {
    this.provider = provider;
  }

  setProvider(provider: IVideoProvider): void {
    this.provider = provider;
  }

  async getPlayback(videoRef: string): Promise<VideoPlaybackDetails> {
    return this.provider.resolvePlayback(videoRef);
  }

  async validate(videoRef: string): Promise<boolean> {
    return this.provider.validateReference(videoRef);
  }
}

export const videoService = new VideoService();
