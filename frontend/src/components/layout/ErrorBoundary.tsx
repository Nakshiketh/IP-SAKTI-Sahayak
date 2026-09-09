import { Component, type ErrorInfo, type ReactNode } from 'react';

import { BoundaryMessage } from '@/components/layout/BoundaryMessage';

/**
 * The last line before a white screen.
 *
 * React unmounts the whole tree when a render throws, and the result is a blank
 * page with no explanation — which on a product that answers regulatory
 * questions reads as "the answer was withheld" rather than "the interface
 * broke". So the boundary says which of those it is, in as many words. The copy
 * and the two recoveries are in `BoundaryMessage`.
 *
 * It does not report anywhere. There is no error-reporting service in this
 * product, and adding one would send the reader's page and state to a third
 * party — which the privacy page says does not happen.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The console, and nowhere else. In development this is what a developer
    // needs; in production it is visible to a reader who goes looking and to
    // nobody who does not.
    console.error('Unhandled error while rendering', error, info.componentStack);
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return <BoundaryMessage onRetry={() => this.setState({ error: null })} />;
  }
}
