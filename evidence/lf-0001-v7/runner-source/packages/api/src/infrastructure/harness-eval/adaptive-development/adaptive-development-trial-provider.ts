import type { AdaptiveDevelopmentCollector } from './adaptive-development-collector.js';
import type { AdaptiveDevelopmentTrialStore } from './adaptive-development-trial-store.js';
import type {
  AdaptiveDevelopmentEpisodeWindowSelector,
  AdaptiveDevelopmentTrialReceipt,
} from './adaptive-development-types.js';

export interface AdaptiveDevelopmentEpisodeSummary {
  episodeId: string;
  startedAt: string;
  actorCatId?: string;
  modelId?: string;
  harnessVersion?: string;
  projectPath?: string;
  worktree?: string;
}

export interface ResolvedAdaptiveDevelopmentWindow {
  windowStartMs: number;
  windowEndMs: number;
  observedEpisodes: AdaptiveDevelopmentEpisodeSummary[];
  receipts: AdaptiveDevelopmentTrialReceipt[];
  incompleteEpisodeIds: string[];
}

export class AdaptiveDevelopmentTrialProvider {
  constructor(
    private readonly store: AdaptiveDevelopmentTrialStore,
    private readonly collector: AdaptiveDevelopmentCollector,
  ) {}

  resolve(
    selector: Omit<AdaptiveDevelopmentEpisodeWindowSelector, 'ownerUserId'>,
    context: { ownerUserId: string },
  ): ResolvedAdaptiveDevelopmentWindow {
    if (!context.ownerUserId) {
      throw new Error('owner_user_required: adaptive-development trial reads require ownerUserId');
    }
    const episodes = this.store.listEpisodesInWindow({ ...selector, ownerUserId: context.ownerUserId });
    if (episodes.length === 0) {
      throw new Error(
        `no_adaptive_development_episodes_in_window: window=[${selector.windowStartMs},${selector.windowEndMs})`,
      );
    }

    const receipts: AdaptiveDevelopmentTrialReceipt[] = [];
    const incompleteEpisodeIds: string[] = [];
    for (const episode of episodes) {
      const receipt = this.collector.collectEpisode(episode.episodeId);
      if (receipt) receipts.push(receipt);
      else incompleteEpisodeIds.push(episode.episodeId);
    }

    return {
      windowStartMs: selector.windowStartMs,
      windowEndMs: selector.windowEndMs,
      observedEpisodes: episodes.map((episode) => ({
        episodeId: episode.episodeId,
        startedAt: episode.startedAt,
        ...(episode.actorCatId ? { actorCatId: episode.actorCatId } : {}),
        ...(episode.modelId ? { modelId: episode.modelId } : {}),
        ...(episode.harnessVersion ? { harnessVersion: episode.harnessVersion } : {}),
        ...(episode.projectPath ? { projectPath: episode.projectPath } : {}),
        ...(episode.worktree ? { worktree: episode.worktree } : {}),
      })),
      receipts,
      incompleteEpisodeIds,
    };
  }
}
