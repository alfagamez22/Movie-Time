import type { PlaybackOptions } from '@/lib/media/embed';
import type { MediaExperienceConfig } from '@/lib/media/experience';
import type { MediaEntry, SeasonDetails } from '@/lib/media/types';

export interface WatchPlayerProps {
  entry: MediaEntry;
  experience: MediaExperienceConfig;
  initialPlayback: PlaybackOptions;
  initialSeasonDetails?: SeasonDetails | null;
}
