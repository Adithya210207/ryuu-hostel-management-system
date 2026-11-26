# Ryuu Version 2: photo prompts

Updated for the real facilities: three room types (3 sharing non-AC, 200 sq ft · 4 sharing AC, 300 sq ft · 5 sharing non-AC, 440 sq ft), balcony in every room, steel cot with a six-inch Kurlon mattress, steel cupboard with safety locker, attached bathroom with heat pump hot water, water softener (no hard water), Water Doctor purifier on every floor, high-speed Wi-Fi, gym, home theatre, Bosch front-loading washing machines, lift, UPS, car and bike parking, 24/7 security with CCTV, homemade veg food daily, non-veg two days a week, eggs every morning.

**Status (8 Nov 2026):** all 29 generated images are in place, converted from `Image assets/*.png` to `public/images/photos/<slot>.webp`. To swap one, drop a new PNG with the same slot name into `Image assets` and ask for it to be reconverted. The three room photos still show about seven or eight beds each, so they need regenerating with the correct bed counts.

The homepage (`public/site/index.html`) has photo slots marked `data-photo="…"`. Until your images arrive, slots show either a Version 1 image or a warm orange swirl placeholder. Generate an image, **name the file with its slot name** (for example `amenity-gym.png`), and send it over. It will be converted to WebP and put in place.

**Style line to add to the end of every prompt** (keeps the set consistent):
> Photorealistic editorial interior photography, warm natural daylight, warm white walls, light grey and timber accents, small touches of marigold orange and deep indigo, clean and uncluttered, a well-kept men's PG hostel in Bengaluru, Karnataka (comfortable and premium but not a luxury hotel), 35mm lens, soft shadows. No text, no logos, no watermark, no faces.

Images made with AI stay labelled "Illustrative" on the site until real photographs replace them. Prompts show no faces so nothing looks like a real resident. If you can photograph the real building, real photos are always better for these same slots.

## 1. Round photo for "Hello" (top) and "Home" (footer) — square 1:1

| Slot | Prompt |
|---|---|
| `hero-round` (also used for `footer-round`) | Abstract macro photograph of flowing silk fabric folds in marigold orange and saffron with deep indigo shadows, glossy light reflections, a swirling composition centred so it works inside a circle. No objects. |

## 2. Inside Ryuu (sideways-scrolling cards) — landscape 3:2

| Slot | Prompt |
|---|---|
| `inside-room` | A shared hostel room: steel cots with thick white Kurlon mattresses and indigo and orange bedsheets, tall grey steel cupboards with small safety lockers, a ceiling fan, a glass door opening to a balcony, afternoon sun. *Can reuse `room-three` instead.* |
| `inside-balcony` | A small private balcony of a hostel room with a black metal and glass railing, two potted areca palms, a folding chair and a cup of filter coffee on a ledge, clothes drying on a slim stand, Bengaluru rooftops and trees beyond, soft morning light. |
| `inside-dining` | A bright hostel dining room with a long table set with stainless steel plates of homemade South Indian food: idli, sambar, chutney and boiled eggs in a bowl, simple chairs, morning light through open windows. |
| `inside-gym` | A compact, clean in-house gym on an upper floor: a treadmill, an exercise bike, a rack of light dumbbells, yoga mats rolled in a corner, a wall mirror, large windows with daylight. |
| `inside-building` | *Keep the owner's building image* (no new image needed), or a real photo of the finished building. |

## 3. Amenities (the turning wheel) — portrait 4:5

| Slot | Prompt |
|---|---|
| `amenity-ac` | Close view of a white Mitsubishi split AC unit high on a warm white wall above a neatly made steel cot in a four sharing room, a light curtain gently moving, cool calm afternoon light. |
| `amenity-hot-water` | A clean attached bathroom: light grey tiles, a wall-mounted shower with steam rising, a chrome mixer tap, a folded towel on a rail, bright and spotless. |
| `amenity-soft-water` | Close-up of clear water flowing from a chrome tap into a white washbasin, sparkling and clean with no scale marks, droplets catching the light, soft blue-white tones. |
| `amenity-balcony` | Looking out from inside a hostel room through an open glass balcony door: potted plants, a black metal railing, green trees and blue sky outside, sheer curtain moving in the breeze. |
| `amenity-wifi` | A laptop and a smartphone on a light timber study table beside a steel cot, an open notebook and earphones, evening lamp light, a calm study-from-home moment. |
| `amenity-gym` | Close view of dumbbells on a rack and a water bottle on a yoga mat in a bright in-house gym, a treadmill blurred in the background, morning light. *Can reuse `inside-gym` instead.* |
| `amenity-laundry` | A clean laundry room with two front-loading Bosch-style white washing machines side by side, a laundry basket of folded clothes on top, light grey tiles, bright daylight. |
| `amenity-parking` | A tidy covered ground-floor parking area under a residential building in Bengaluru: one silver hatchback and three scooters parked neatly, white pillars, a black metal and timber gate, daylight. |

## 4. Rooms and care (stacking cards) — landscape 4:3

| Slot | Prompt |
|---|---|
| `room-three` | Wide view of a 200 sq ft three sharing AC room from the doorway: three steel cots with Kurlon mattresses, three grey steel cupboards with lockers, two ceiling fans and a large window (no air conditioner), a door to the attached bathroom, a balcony door at the far end, bright morning light. |
| `room-four` | Wide view of a 300 sq ft four sharing AC room from the doorway: two steel cots on each side with Kurlon mattresses, four grey steel cupboards with lockers, a white Mitsubishi split AC on the wall, a door to the attached bathroom, a balcony door at the far end, cool calm light. |
| `room-five` | Wide view of a spacious 440 sq ft five sharing AC room from the doorway: five steel cots with Kurlon mattresses arranged with plenty of floor space, five grey steel cupboards with lockers, ceiling fans and large windows (no air conditioner), a door to the attached bathroom, a balcony door, bright airy daylight. |
| `care-water` | A wall-mounted Water Doctor style RO water purifier in a clean hostel corridor, a steel glass being filled with drinking water, a tidy floor landing beside it, daylight. |
| `care-meals` | A hostel kitchen serving counter with stainless steel vessels of homemade food: rice, sambar, poriyal and a tray of boiled eggs, a stack of clean steel plates, warm light, homely and hygienic. |
| `care-security` | The gated entrance of a residential building at dusk: a lit security cabin, a CCTV camera on a white pillar, a black metal and timber gate, warm entrance lights, safe and welcoming. |
| `care-portal` | A smartphone on a light timber study table showing a clean app dashboard in white, orange and indigo (blurred, unreadable), beside a notebook, a tea cup and a plant, by a sunlit window. |

## 5. Life at Ryuu (photo collage)


| Slot | Ratio | Prompt |
|---|---|---|
| `life-study` | 3:2 landscape | A calm common study area in the evening: a long light timber table with open laptops, books, notebooks and cups of tea, three men seen only from behind as they study together, warm lamp light. |
| `life-coffee` | 3:4 portrait | Two men's hands holding steel tumblers of filter coffee resting on a black metal balcony railing at sunrise, potted plants beside them, soft green trees and Bengaluru rooftops blurred behind. |
| `life-welcome` | 3:4 portrait | A new resident's welcome on a freshly made steel cot: a neatly folded towel and bedsheet, a small potted money plant and a blank handwritten welcome card, a steel cupboard with a locker beside the bed, soft daylight. |
| `life-movies` | 3:2 landscape | A cosy home theatre room in a men's hostel: comfortable sofas and floor cushions facing a large screen with a soft warm glow, dim warm lighting, bowls of popcorn on a low table, no one in the room. |
| `life-dinner` | 3:2 landscape | Dinner time in a bright hostel dining room: a long table with stainless steel plates of homemade food (rice, sambar, poriyal, chapati), four men seen only from behind or as hands passing a bowl, warm evening light. |

## 6. Your everyday (sticky photo frame) — portrait 4:5

| Slot | Prompt |
|---|---|
| `day-meals` | A homemade breakfast on a stainless steel plate: two boiled eggs, idli, sambar and chutney, with a steel tumbler of filter coffee, on a timber table, soft morning light. |
| `day-outpass` | A small trolley suitcase and a backpack waiting by a hostel room door, a phone and a bus ticket on top, soft morning light, ready for a weekend trip home. |
| `day-laundry` | Freshly washed clothes drying on a slim stand on a sunny hostel balcony, a laundry basket at the side, potted plants and green trees beyond. |
| `day-help` | A friendly hostel help desk with a bell, a notice board with pinned colourful notes (unreadable), and a flask of tea, warm daylight. |

## If you want to start with fewer images

These twelve replace every orange placeholder and show all three room types: `hero-round`, `room-three`, `room-four`, `room-five`, `inside-balcony`, `inside-gym`, `amenity-hot-water`, `amenity-soft-water`, `amenity-wifi`, `amenity-laundry`, `care-water`, `care-security`. The rest can keep using the current images for now.

## Ryuu building exterior (ChatGPT / image generator prompt)

Replaces the grey placeholder at `public/images/ryuu-exterior.webp` (1536 × 1024, 3:2). Save as WebP and PNG with the same name.

> Photorealistic daytime exterior of a modern four-storey men's hostel building in Koramangala, Bengaluru: warm cream and terracotta facade, balconies with potted plants on every floor, large windows with visible split-AC outdoor units neatly housed on the side, a gated entrance with a security cabin, a covered car and bike parking bay on the ground floor, a neat tree-lined street with a few auto-rickshaws in the background, soft golden-hour light, wide 3:2 composition. No people, no readable signage, no brand names.

## Ryuu logo (ChatGPT / image generator prompt)

> Design a modern, minimal logo for "Ryuu", a men's hostel in Bengaluru. A rounded-square badge in warm orange (#ef7d1a) with a bold white geometric letter "R" whose leg subtly forms a doorway or a roof line, plus one small indigo (#2e1f7a) dot as an accent. Flat vector style, no gradients beyond a soft one, no mascots, no stock-house clip art. Also provide the wordmark "Ryuu." in a heavy rounded sans-serif (white on near-black #0d0c11, orange full stop) and the tagline "Cool rooms. Calm days. Your city." Transparent background, square 1024×1024 mark and a wide 4:3 lockup.
