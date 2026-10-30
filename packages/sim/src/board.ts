/**
 * The village notice board (spec section 12's role table: Villager gets
 * "post on the board"; spec section 4's retention: "Board posts - Until
 * resolved, or 14 village days - Archived"). Scoped to a plain note - no
 * "resolved" concept yet, since nothing yet produces a resolvable post
 * (that needs the commissions/votes features this deliberately isn't
 * building - see #86).
 */

export interface BoardPost {
  id: number;
  author: string;
  text: string;
  postedDay: number;
}

export interface BoardState {
  posts: readonly BoardPost[];
  nextId: number;
}

export function createBoard(): BoardState {
  return { posts: [], nextId: 1 };
}

export function postToBoard(
  board: BoardState,
  author: string,
  text: string,
  day: number,
): BoardState {
  const post: BoardPost = { id: board.nextId, author, text, postedDay: day };
  return { posts: [...board.posts, post], nextId: board.nextId + 1 };
}

const BOARD_POST_RETENTION_DAYS = 14;

/** Archives (removes) any post older than the retention window. */
export function archiveOldBoardPosts(board: BoardState, day: number): BoardState {
  const posts = board.posts.filter((post) => day - post.postedDay < BOARD_POST_RETENTION_DAYS);
  if (posts.length === board.posts.length) {
    return board;
  }
  return { ...board, posts };
}
