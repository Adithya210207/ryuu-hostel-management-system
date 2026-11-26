# Ryuu image assets

The supplied `ryuu-house-logo.png` (104×68, 11 October 2026) replaces only the lowercase jn homepage header symbol, per the owner’s clarification. Other branding remains as before. The original full logo banner remains in the footer. Do not expand this into a site-wide rebrand.

On 11 October 2026, WebP derivatives of the logo, exterior and three concept PNGs were generated at quality 82, preserving dimensions and originals. Homepage references now use these smaller files. In the protected development tunnel only, the six public photos are embedded in the homepage to avoid delayed image requests being redirected to the interactive Cloudflare login. Production retains ordinary WebP URLs.

The logo and the exterior image are AI-generated for this project. The exterior is a concept image, not a photograph of a real building.

The three `*-concept.png` assets were created with the built-in image generation tool on 16 September 2026. They are fictional illustrative placeholders, not property photographs. The homepage explicitly labels them and they must be replaced with actual photos before launch. Keep filenames or update the gallery entries in `components/public/PublicHome.tsx` when replacing them.

## Prompts

### room-concept.png

Use case: stylized-concept. Asset type: illustrative placeholder for Ryuu men's hostel website, labelled as concept in website. Generate a polished architectural interior concept render of a comfortable three-sharing men's hostel room in Bengaluru, Karnataka. Three separate single beds with ivory linen, muted terracotta throws, light timber personal lockable wardrobes, warm white walls, ceiling fans and a discreet wall AC. Peaceful natural afternoon light and simple practical furnishings, generous but realistic space. Wide landscape image, appealing editorial architectural composition with window light. No people, no text, no logos, no watermark. This is a fictional concept, not a photograph of an existing property.

### dining-concept.png

Use case: stylized-concept. Asset type: illustrative placeholder for Ryuu hostel website. Generate a polished architectural concept render of a modest bright hostel dining room in Bengaluru. A long communal pale timber table, simple warm wooden chairs, stainless steel plates with a tasteful South Indian breakfast setting for three and small potted plants, terracotta and cream accents, gentle sunlight through open windows. Practical homely room, not luxury hotel. Editorial wide landscape architectural composition. No people, no text, no logos, no watermark. Fictional concept imagery.

### quiet-corner-concept.png

Use case: stylized-concept. Asset type: illustrative placeholder for Ryuu men's hostel website. Generate a polished architectural concept render of a tranquil modest hostel reading corner near a large sunlit window in Bengaluru. Light timber study table, open notebook and ceramic tea cup, practical chair, a leafy plant and cotton cream curtains. Warm ivory walls and tiny muted terracotta accents, soft morning shadows, calm grounded Indian home feeling. Wide landscape editorial architectural composition. No people, no text, no logos, no watermark. Fictional concept imagery.

## Motion provenance

The locally hosted `public/fonts/inter-latin-variable.woff2` is the Inter Latin variable font from the supplied reference's Google Fonts subset. Inter is distributed under the SIL Open Font License; the copyright notice and full licence are included in `public/fonts/Inter-LICENSE.txt`, sourced from https://github.com/rsms/inter/blob/master/LICENSE.txt. No remote font request is needed by the public-page typography.

The public design adapts the owner's existing Ryuu prototype and the animation reference https://www.syahrilarfianalmazril.my.id/. That prototype contains the reference's two-stroke handwritten hello path. The maintained React animation controller and all Ryuu page content are implemented in this project. The public footer credits the reference. Confirm rights for any retained reference artwork before public launch; compiled website metadata does not itself establish a licence to every asset. No reference portfolio photographs, branding, personal data, or compiled JavaScript bundles are shipped.

