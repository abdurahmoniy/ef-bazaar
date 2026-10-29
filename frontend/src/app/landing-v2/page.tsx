import { permanentRedirect } from 'next/navigation';

/** Keep existing bookmarks working after publishing the design at the root. */
export default function LandingV2Page() {
  permanentRedirect('/');
}
