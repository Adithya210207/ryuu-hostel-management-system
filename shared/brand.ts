// The Ryuu logo and building image (AI-generated for this project) are in public/images/ and are used by default.
// Set NEXT_PUBLIC_PLACEHOLDER_BRANDING=true to show neutral placeholders instead.
const owner = process.env.NEXT_PUBLIC_PLACEHOLDER_BRANDING !== 'true';
export const BRAND = {
  houseLogo: owner ? '/images/ryuu-house-logo.png' : '/images/placeholder/house-logo.png',
  wordmark: owner ? '/images/ryuu-logo.webp' : '/images/placeholder/wordmark.png',
  exterior: owner ? '/images/ryuu-exterior.webp' : '/images/photos/inside-balcony.webp',
  exteriorAlt: owner ? 'AI-generated concept image of the Ryuu building' : 'Concept illustration of a hostel balcony',
  exteriorCaption: owner ? 'Building concept · AI-generated' : 'Concept illustration',
};
