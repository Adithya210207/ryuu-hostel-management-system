// The hostel owner's logo and building render are not in the public repository.
// Set NEXT_PUBLIC_OWNER_BRANDING=true (in .env.local) when those files are in public/images/;
// otherwise neutral placeholders are used, e.g. on the public demo.
const owner = process.env.NEXT_PUBLIC_OWNER_BRANDING === 'true';
export const BRAND = {
  houseLogo: owner ? '/images/ryuu-house-logo.png' : '/images/placeholder/house-logo.png',
  wordmark: owner ? '/images/ryuu-logo.webp' : '/images/placeholder/wordmark.png',
  exterior: owner ? '/images/ryuu-exterior.webp' : '/images/photos/inside-balcony.webp',
  exteriorAlt: owner ? 'Proposed Ryuu building, architectural render' : 'Concept illustration of a hostel balcony',
  exteriorCaption: owner ? 'Proposed exterior · Architectural render' : 'Concept illustration',
};
