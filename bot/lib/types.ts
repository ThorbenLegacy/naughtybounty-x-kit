export type PostEntry = {
  id: string;
  text: string;
  image?: string;
  link?: string;
  /** Ohne # — wird automatisch ergänzt */
  hashtags?: string[];
  colorScheme?: "dark" | "light";
  mediaType?: "image" | "video" | "creative";
};

export type PostsFile = {
  account: string;
  link: string;
  posts: PostEntry[];
};

export type ScheduleConfig = {
  postsPerDay: number;
  timezone: string;
  slots: string[];
};

export type PostHistoryEntry = {
  date: string;
  postId: string;
  tweetId?: string;
  slot?: string;
  /** Relativer Pfad des geposteten Bildes (exports/… oder exports-light/…) */
  image?: string;
  colorScheme?: "dark" | "light";
};

export type PostFailureEntry = {
  at: string;
  date: string;
  slot?: string;
  postId: string;
  index?: number;
  message: string;
  code?: number;
};

export type PostState = {
  lastIndex: number;
  /** @deprecated use todayDate */
  lastPostedDate?: string | null;
  todayDate: string | null;
  postsToday: number;
  postedSlots: string[];
  /** Manuell gewählter Post-Index; null = automatisch nach Historie */
  queueIndex?: number | null;
  history: PostHistoryEntry[];
  /** Letzter fehlgeschlagener Post-Versuch (bis zum nächsten Erfolg) */
  lastFailure?: PostFailureEntry | null;
  /** Verlauf der Fehler (max. 50) */
  failures?: PostFailureEntry[];
};
