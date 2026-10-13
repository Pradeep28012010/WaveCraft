import { create } from 'zustand';

export type FeedbackType = 'bug' | 'feature' | 'general';

export interface FeedbackDiagnostics {
  userAgent: string;
  platform: string;
  appVersion: string;
  viewport: string;
  audioEngine?: string;
  currentTrack?: string;
  isOnline: boolean;
}

interface FeedbackStore {
  isOpen: boolean;
  initialType: FeedbackType;
  initialCategory?: string;
  openFeedback: (type?: FeedbackType, category?: string) => void;
  closeFeedback: () => void;
}

export const useFeedbackStore = create<FeedbackStore>((set) => ({
  isOpen: false,
  initialType: 'bug',
  initialCategory: undefined,
  openFeedback: (initialType = 'bug', initialCategory) =>
    set({ isOpen: true, initialType, initialCategory }),
  closeFeedback: () => set({ isOpen: false })
}));
