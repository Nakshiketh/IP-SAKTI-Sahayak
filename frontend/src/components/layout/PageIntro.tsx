/**
 * The opening of a content page: one heading, one sentence saying what the page
 * is for. Pages fill in below it.
 */
export function PageIntro({ heading, standfirst }: { heading: string; standfirst: string }) {
  return (
    <div className="border-b border-rule pb-6">
      <h1 className="text-2xl">{heading}</h1>
      <p className="mt-3 text-md text-muted">{standfirst}</p>
    </div>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <article className="mx-auto max-w-[75rem] px-5 py-12">{children}</article>;
}
