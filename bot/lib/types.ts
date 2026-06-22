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
};

export type PostState = {
  lastIndex: number;
  /** @deprecated use todayDate */
  lastPostedDate?: string | null;
  todayDate: string | null;
  postsToday: number;
  postedSlots: string[];
  history: PostHistoryEntry[];
};
