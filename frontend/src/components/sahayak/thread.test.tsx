/**
 * The conversation thread, and the claim it must not make.
 *
 * A chat interface implies memory. This product has none: every question is
 * answered on its own evidence, and nothing from an earlier turn changes what
 * the corpus returns for a later one. A reader who believed otherwise would
 * take a later answer as having accounted for something they said three turns
 * ago — and act on it.
 *
 * So the thread has to say what it is, keep its failures visible, and never
 * carry text the reader cannot see.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ConversationThread, type Turn } from '@/components/sahayak/ConversationThread';

const TURNS: Turn[] = [
  {
    id: 1,
    question: 'Can a classical formulation be patented?',
    sent: 'Can a classical formulation be patented?',
    outcome: 'answered',
    confidence: 'moderate',
    sources: 4,
  },
  {
    id: 2,
    question: 'What about the trade mark?',
    sent: 'Can a classical formulation be patented? What about the trade mark?',
    outcome: 'declined',
    confidence: 'abstain',
    sources: 0,
  },
];

describe('the conversation thread', () => {
  it('says plainly that nothing is remembered', () => {
    render(<ConversationThread turns={TURNS} currentId={2} onRevisit={() => {}} />);
    expect(screen.getByText(/not a memory/i)).toBeInTheDocument();
    expect(screen.getByText(/answered on its own evidence/i)).toBeInTheDocument();
  });

  it('keeps a declined question in the thread', () => {
    // A thread with the refusals dropped would read as a product that always
    // answers, which is the impression this whole repository exists to avoid.
    render(<ConversationThread turns={TURNS} currentId={2} onRevisit={() => {}} />);
    expect(screen.getByText('What about the trade mark?')).toBeInTheDocument();
    expect(screen.getByText(/sources did not carry it/i)).toBeInTheDocument();
  });

  it('shows the outcome beside each question, not just the question', () => {
    render(<ConversationThread turns={TURNS} currentId={2} onRevisit={() => {}} />);
    expect(screen.getByText(/moderate confidence, 4 source/i)).toBeInTheDocument();
  });

  it('marks a follow-up that carried the question before it', () => {
    render(<ConversationThread turns={TURNS} currentId={2} onRevisit={() => {}} />);
    // Shown only where `sent` differs from `question` — exactly where a reader
    // needs to know something was carried.
    expect(screen.getByText(/asked together with the question before/i)).toBeInTheDocument();
  });

  it('does not claim carrying on a question that carried nothing', () => {
    render(<ConversationThread turns={[TURNS[0]!]} currentId={1} onRevisit={() => {}} />);
    expect(screen.queryByText(/asked together with/i)).not.toBeInTheDocument();
  });

  it('stays out of the way until there is a conversation', () => {
    const { container } = render(
      <ConversationThread turns={[TURNS[0]!]} currentId={1} onRevisit={() => {}} />,
    );
    // One question is not a thread, and a heading over a list of one is noise.
    expect(container.textContent).toBe('');
  });

  it('re-asks exactly the text that was sent, not the shortened question', () => {
    const revisited: Turn[] = [];
    render(
      <ConversationThread turns={TURNS} currentId={1} onRevisit={(t) => revisited.push(t)} />,
    );
    return userEvent.click(screen.getByText('What about the trade mark?')).then(() => {
      expect(revisited[0]?.sent).toBe(
        'Can a classical formulation be patented? What about the trade mark?',
      );
    });
  });

  it('marks which turn is showing', () => {
    render(<ConversationThread turns={TURNS} currentId={1} onRevisit={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[1]).not.toHaveAttribute('aria-current');
  });
});
