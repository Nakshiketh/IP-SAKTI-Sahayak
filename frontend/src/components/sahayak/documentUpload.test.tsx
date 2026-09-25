/**
 * Reading a file, and the three promises the surface makes about it.
 *
 * The text is shown before anything is asked; it is labelled as the reader's
 * own rather than as a source; and nothing is submitted for them. Each is a
 * promise a later edit could quietly drop, so each is pinned here.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentUpload } from '@/components/sahayak/DocumentUpload';

const READ = {
  filename: 'formulation.txt',
  kind: 'text',
  characters: 61,
  pages: null,
  truncated: false,
  text: 'Our product combines Ashwagandha and Shilajit for oral use.',
  stated_facts: ['oral_use'],
  missing_facts: ['classical_formulation'],
  label: 'USER DOCUMENT — not an authoritative source',
};

function serverReturns(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          resolve(
            new Response(JSON.stringify(body), {
              status,
              headers: { 'Content-Type': 'application/json' },
            }),
          ),
        ),
    ),
  );
}

async function choose(name = 'formulation.txt', type = 'text/plain') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, new File(['some notes'], name, { type }));
}

afterEach(() => vi.unstubAllGlobals());

describe('reading a document', () => {
  it('shows the extracted text before anything is asked', async () => {
    serverReturns(200, READ);
    render(<DocumentUpload onText={() => {}} />);
    await choose();

    // A PDF often holds something other than what the person expects, and a
    // scanned page holds no text at all. They see it first, always.
    await waitFor(() => expect(screen.getByText(/Ashwagandha and Shilajit/)).toBeInTheDocument());
  });

  it("labels it as the reader's own document, not as a source", async () => {
    serverReturns(200, READ);
    render(<DocumentUpload onText={() => {}} />);
    await choose();

    await waitFor(() =>
      expect(screen.getByText(/not an authoritative source/i)).toBeInTheDocument(),
    );
  });

  it('renders the label the server sent rather than one composed here', async () => {
    // If this component built the label itself, a later edit could simplify it
    // away and nothing would fail. It comes down the wire, so it cannot.
    serverReturns(200, { ...READ, label: 'USER DOCUMENT — changed by the server' });
    render(<DocumentUpload onText={() => {}} />);
    await choose();

    await waitFor(() => expect(screen.getByText(/changed by the server/)).toBeInTheDocument());
  });

  it('submits nothing for the reader — the text goes to the box', async () => {
    const handed: string[] = [];
    serverReturns(200, READ);
    render(<DocumentUpload onText={(text) => handed.push(text)} />);
    await choose();

    await waitFor(() => expect(screen.getByText(/Ashwagandha/)).toBeInTheDocument());
    expect(handed).toEqual([]);

    await userEvent.click(screen.getByRole('button', { name: /question box/i }));
    expect(handed).toEqual([READ.text]);
  });

  it('says that nothing is stored', async () => {
    serverReturns(200, READ);
    render(<DocumentUpload onText={() => {}} />);
    await choose();

    await waitFor(() => expect(screen.getByText(/nothing is uploaded to storage/i)).toBeTruthy());
  });

  it("shows the server's reason for a refusal rather than a generic failure", async () => {
    serverReturns(415, {
      detail: { code: 'wrong_type', message: 'That file is named .pdf but is not a PDF.' },
    });
    render(<DocumentUpload onText={() => {}} />);
    await choose('trick.pdf', 'application/pdf');

    // "Invalid input" tells a reader nothing they can act on.
    await waitFor(() => expect(screen.getByText(/is not a PDF/)).toBeInTheDocument());
  });

  it('lets a reader remove a document they changed their mind about', async () => {
    serverReturns(200, READ);
    render(<DocumentUpload onText={() => {}} />);
    await choose();

    await waitFor(() => expect(screen.getByText(/Ashwagandha/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByText(/Ashwagandha/)).not.toBeInTheDocument();
  });
});
