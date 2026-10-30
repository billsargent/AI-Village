import { describe, expect, it } from 'vitest';
import { archiveOldBoardPosts, createBoard, postToBoard } from './board.js';

describe('postToBoard', () => {
  it('appends a post with an increasing id', () => {
    let board = createBoard();
    board = postToBoard(board, 'hesper', 'Meeting Starday at noon.', 3);
    board = postToBoard(board, 'ada', 'Lost a basket near the mill.', 4);

    expect(board.posts).toEqual([
      { id: 1, author: 'hesper', text: 'Meeting Starday at noon.', postedDay: 3 },
      { id: 2, author: 'ada', text: 'Lost a basket near the mill.', postedDay: 4 },
    ]);
    expect(board.nextId).toBe(3);
  });
});

describe('archiveOldBoardPosts', () => {
  it('removes a post once it is 14 days old', () => {
    let board = createBoard();
    board = postToBoard(board, 'hesper', 'Old note.', 0);

    expect(archiveOldBoardPosts(board, 13).posts).toHaveLength(1);
    expect(archiveOldBoardPosts(board, 14).posts).toHaveLength(0);
  });

  it('keeps a recent post untouched', () => {
    let board = createBoard();
    board = postToBoard(board, 'hesper', 'Fresh note.', 10);

    expect(archiveOldBoardPosts(board, 12).posts).toHaveLength(1);
  });
});
