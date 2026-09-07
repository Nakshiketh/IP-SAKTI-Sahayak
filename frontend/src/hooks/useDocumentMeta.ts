import { useEffect } from 'react';

/**
 * Set the document title and description for a route.
 *
 * Distinct per page, because a browser history or a set of open tabs all reading
 * "IP-SAKTI Sahayak" is unusable, and because the title is what a reader sees
 * first when they come back to a tab a week later.
 */
export function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;

    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = 'description';
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [title, description]);
}
