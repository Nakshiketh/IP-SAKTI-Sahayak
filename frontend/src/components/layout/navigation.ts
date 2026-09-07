/**
 * The six routes, in the one order they appear anywhere.
 *
 * Header, mobile menu and any future site map read this list, so the navigation
 * cannot say one thing in two places. There are no dropdowns and no second
 * level: six destinations is the whole product surface.
 */
export interface NavItem {
  to: string;
  /** Key in the `common` namespace under `nav`. */
  labelKey: 'home' | 'sahayak' | 'covered' | 'howItWorks' | 'sources' | 'about';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'home' },
  { to: '/sahayak', labelKey: 'sahayak' },
  { to: '/what-is-covered', labelKey: 'covered' },
  { to: '/how-it-works', labelKey: 'howItWorks' },
  { to: '/sources', labelKey: 'sources' },
  { to: '/about', labelKey: 'about' },
] as const;
