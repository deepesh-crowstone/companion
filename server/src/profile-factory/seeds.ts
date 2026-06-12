import type {
  BioStyle,
  PersonaSeed,
  PhotoScene,
  ProfileLayout,
} from "./types.js";

/**
 * Persona seed sampler — the variation engine.
 *
 * Structure (which sections, which prompts, how many photos) is decided here
 * in code, so profile diversity is guaranteed by sampling instead of hoping
 * the LLM varies itself. The LLM only fills in content for the sampled
 * structure.
 */

const FIRST_NAMES = [
  "Aanya", "Aditi", "Aisha", "Akriti", "Amaira", "Ananya", "Anika", "Anjali",
  "Ankita", "Anushka", "Aparna", "Arushi", "Avni", "Bhavya", "Charvi",
  "Damini", "Devika", "Diya", "Esha", "Gauri", "Hiral", "Ira", "Ishita",
  "Jasmine", "Jhanvi", "Juhi", "Kavya", "Khushi", "Kiara", "Kritika",
  "Lavanya", "Mahi", "Malvika", "Meher", "Mira", "Mitali", "Naina", "Navya",
  "Neha", "Nidhi", "Niharika", "Nikita", "Nitya", "Oviya", "Pari", "Pooja",
  "Prachi", "Priya", "Rhea", "Ritika", "Riya", "Roshni", "Ruhi", "Saanvi",
  "Sahana", "Saloni", "Sanya", "Sara", "Shanaya", "Shifa", "Shreya",
  "Simran", "Sneha", "Suhana", "Tanvi", "Tara", "Trisha", "Urvi", "Vaani",
  "Vedika", "Vidhi", "Yamini", "Zoya", "Ishani", "Kanika", "Mannat",
  "Pankhuri", "Reet", "Sia", "Tisha",
];

const CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Pune", "Hyderabad", "Chennai", "Kolkata",
  "Jaipur", "Chandigarh", "Ahmedabad", "Gurgaon", "Indore",
];

type Archetype = {
  id: string;
  professions: string[];
  vibe: string;
  sceneTags: string[];
};

const ARCHETYPES: Archetype[] = [
  {
    id: "fitness",
    professions: ["pilates instructor", "physiotherapist", "nutritionist", "HR analyst who lives at the gym"],
    vibe: "high-energy, playful, motivational but self-aware about it",
    sceneTags: ["fitness", "outdoor"],
  },
  {
    id: "bookworm",
    professions: ["editor at a publishing house", "content writer", "PhD student in literature", "librarian"],
    vibe: "dry wit, literary references, soft-spoken but sharp",
    sceneTags: ["books", "cozy"],
  },
  {
    id: "artsy",
    professions: ["graphic designer", "illustrator", "architecture student", "tattoo artist"],
    vibe: "whimsical, observational, finds beauty in mundane things",
    sceneTags: ["art", "cozy"],
  },
  {
    id: "corporate",
    professions: ["management consultant", "product manager", "investment analyst", "brand manager"],
    vibe: "fast-talking, ambitious, ironic about hustle culture while hustling",
    sceneTags: ["city", "evening"],
  },
  {
    id: "foodie",
    professions: ["pastry chef", "food blogger", "restaurant marketing lead", "home baker with a day job"],
    vibe: "warm, indulgent, strong opinions about biryani",
    sceneTags: ["food", "city"],
  },
  {
    id: "traveler",
    professions: ["travel photographer", "flight attendant", "freelance UX researcher", "NGO program coordinator"],
    vibe: "restless, story-teller, collects places and people",
    sceneTags: ["travel", "outdoor"],
  },
  {
    id: "musician",
    professions: ["music teacher", "indie singer-songwriter", "radio jockey", "sound engineer"],
    vibe: "moody in a charming way, lyrics in bio energy",
    sceneTags: ["music", "evening"],
  },
  {
    id: "petparent",
    professions: ["veterinary intern", "pet groomer turned entrepreneur", "school teacher", "data analyst"],
    vibe: "nurturing, goofy, will show you 400 photos of her pet",
    sceneTags: ["pets", "cozy", "outdoor"],
  },
  {
    id: "filmbuff",
    professions: ["assistant director", "film student", "social media manager", "screenwriter"],
    vibe: "quotes movies, dramatic on purpose, hot takes about cinema",
    sceneTags: ["film", "evening", "city"],
  },
  {
    id: "founder",
    professions: ["D2C startup founder", "early-stage VC analyst", "indie app developer", "cafe owner"],
    vibe: "curious, intense, asks too many questions, sleeps too little",
    sceneTags: ["city", "cozy", "evening"],
  },
];

/** Appearance fragments combined into a consistent identity description. */
const SKIN_TONES = [
  "luminous fair skin",
  "glowing wheatish skin",
  "radiant warm brown skin",
  "beautiful dusky skin with a golden undertone",
];
const HAIR_STYLES = [
  "long lustrous straight black hair with a healthy shine",
  "long glossy wavy dark brown hair",
  "shoulder-length voluminous wavy black hair",
  "thick curly dark hair with natural bounce",
  "long silky black hair in a loose braid",
  "sleek chin-length bob with shine",
  "thick wavy hair with subtle burgundy highlights",
];
const FACE_DETAILS = [
  "dimples and a radiant megawatt smile",
  "high sculpted cheekbones and soft full lips",
  "a tiny beauty mark that adds charm",
  "perfectly shaped thick eyebrows framing doe eyes",
  "a delicate gold nose ring",
  "a small nose stud",
  "flawless skin with the faintest freckles",
  "soft glam makeup — glowing skin, defined eyes, natural lip color",
];
const BUILDS = [
  "slim toned hourglass figure",
  "petite delicate frame with graceful posture",
  "fit sculpted athletic body",
  "curvy feminine silhouette",
  "tall statuesque model proportions",
];
const EYES = [
  "large luminous dark brown doe eyes",
  "deep sparkling black eyes with long lashes",
  "striking hazel-green eyes",
  "warm almond-shaped eyes that catch the light",
];
const APPEAL = [
  "a breathtakingly symmetrical face",
  "gorgeous model-tier features",
  "stunning natural beauty",
  "the kind of face that turns heads on the street",
];

const BIO_STYLES: (BioStyle | null)[] = [
  "one-liner",
  "one-liner",
  "short-paragraph",
  "short-paragraph",
  "short-paragraph",
  "list",
  null, // some profiles skip the bio entirely
];

export const PROMPT_POOL = [
  "Two truths and a lie",
  "My simple pleasures",
  "Green flags I look out for",
  "We'll get along if",
  "My most controversial opinion",
  "My idea of a perfect first date",
  "I'm weirdly attracted to",
  "A non-negotiable for me",
  "My happy place",
  "The last thing that made me cry happy tears",
  "I quote too much from",
  "My love language is",
  "A typical Sunday looks like",
  "I'm overly competitive about",
  "My best travel story",
  "If I could teleport anywhere right now",
  "My comfort food at 2am",
  "A shower thought I can't shake off",
  "I want someone who",
  "Don't hate me if I",
  "My toxic trait is",
  "The fastest way to my heart",
  "I geek out about",
  "A typical Friday night for me",
  "Currently obsessed with",
  "I'll never shut up about",
  "First round is on me if",
  "My walk-out song would be",
  "Beach holiday or mountain trip",
  "Chai or coffee — choose wisely",
  "My family will love that I",
  "I promise I won't judge you for",
  "The hill I will absolutely die on",
  "Something I learned about myself recently",
  "What makes me laugh way too hard",
  "I'm secretly really good at",
  "If you laugh at my bad jokes",
  "Ask me about the time I",
  "My red flags, honestly",
  "Rate my playlist before you swipe",
];

const BASICS_POOL = [
  "Height",
  "Zodiac",
  "Education",
  "Drinking",
  "Diet",
  "Languages",
  "Pets",
  "Exercise",
  "Hometown",
];

/** Anchor portrait settings (slot 0) — clean face-forward shots. */
const ANCHOR_SCENES: PhotoScene[] = [
  { id: "anchor_balcony", description: "standing on an apartment balcony at golden hour, dreamy warm backlight making her skin glow, gorgeous confident smile at the camera, wearing a well-fitted elegant kurti" },
  { id: "anchor_cafe_window", description: "sitting by a cafe window, soft portrait light sculpting her cheekbones and jawline, stunning engaging smile at the camera, wearing a flattering fitted top" },
  { id: "anchor_terrace", description: "on a rooftop terrace at sunset golden hour, hair catching golden light, breathtaking radiant smile at the camera, wearing a fitted denim jacket over a plain tee" },
  { id: "anchor_plain_wall", description: "standing against a pastel wall in open-shade portrait light, gorgeous three-quarter angle, magnetic smile at the camera, wearing a stylish fitted summer top" },
  { id: "anchor_park_bench", description: "sitting on a park bench in golden-hour glow, looking at the camera with a stunning inviting smile, wearing a flattering fitted shirt" },
];

type TaggedScene = PhotoScene & { tags: string[] };

const SCENE_POOL: TaggedScene[] = [
  { id: "mirror_selfie", tags: ["generic", "cozy"], description: "taking a gorgeous mirror selfie in her bedroom at warm golden fairy-light glow, phone at chest height with face fully visible, fitted jeans and a flattering crop top, looking stunning" },
  { id: "cafe_laugh", tags: ["generic", "food", "cozy"], description: "sitting at a cozy cafe table laughing mid-conversation, holding a cappuccino, soft warm window light making her skin glow" },
  { id: "golden_hour_walk", tags: ["generic", "outdoor", "fitness"], description: "walking outdoors at golden hour in a leafy park, athleisure wear, hair in a ponytail, caught mid-stride smiling away from the camera" },
  { id: "saree_evening", tags: ["generic", "evening"], description: "dressed up for an evening out in an elegant fitted saree with subtle jewelry, looking breathtaking, soft golden string-light bokeh at a rooftop restaurant" },
  { id: "gym_mirror", tags: ["fitness"], description: "post-workout gym mirror selfie looking gorgeous and glowing, fitted sports top and leggings, flattering overhead gym light, phone at chest height with face fully visible" },
  { id: "yoga_home", tags: ["fitness", "cozy"], description: "mid-stretch on a yoga mat in a bright living room, comfortable activewear, morning light through the window" },
  { id: "trek_view", tags: ["travel", "outdoor", "fitness"], description: "standing at a Himalayan trek viewpoint with a small backpack, windbreaker, big genuine grin, valley hazy behind her" },
  { id: "beach_sunset", tags: ["travel", "outdoor"], description: "on a beach at sunset in a flowy kurta with rolled-up jeans, hair loose in the breeze, holding her sandals in one hand" },
  { id: "train_window", tags: ["travel"], description: "leaning by an open train window with morning light, casual travel clothes, candid look out at the passing landscape then back at the camera" },
  { id: "bookstore", tags: ["books", "cozy"], description: "browsing shelves in a crowded second-hand bookstore, holding two books, soft warm light, looking over her shoulder at the camera with a soft smile" },
  { id: "reading_chai", tags: ["books", "cozy"], description: "curled up in a reading nook with an open novel and a steel tumbler of chai, oversized sweater, fairy lights and a messy bookshelf behind" },
  { id: "art_easel", tags: ["art"], description: "painting at an easel in a sunlit room, paint-streaked apron over casual clothes, holding a brush, looking over her shoulder at the camera" },
  { id: "gallery_visit", tags: ["art", "city"], description: "standing in a minimal art gallery in front of a large abstract painting, smart-casual outfit, candid half-smile" },
  { id: "office_candid", tags: ["city"], description: "candid at a modern office cafeteria in a blazer over a tee, holding a coffee, laughing at something off-camera" },
  { id: "conference", tags: ["city"], description: "at a conference hall entrance wearing a lanyard, business-casual outfit, holding a notebook, confident smile" },
  { id: "street_food", tags: ["food", "city"], description: "eating pani puri at a busy street food stall at dusk, one hand cupped under the puri, eyes wide mid-laugh" },
  { id: "kitchen_baking", tags: ["food", "cozy"], description: "in a home kitchen with a little flour on her cheek, kneading dough, apron over casual clothes, warm light" },
  { id: "concert", tags: ["music", "evening"], description: "in a concert crowd with stage lights glowing behind, band tee, arms slightly raised, joyful candid shot" },
  { id: "guitar_couch", tags: ["music", "cozy"], description: "sitting cross-legged on a couch with an acoustic guitar, comfy hoodie, mid-strum looking up at the camera" },
  { id: "dog_park", tags: ["pets", "outdoor"], description: "crouching in a park next to a golden retriever, holding its leash, both looking delighted, casual weekend clothes" },
  { id: "cat_couch", tags: ["pets", "cozy"], description: "on a couch with a cat curled on her lap, holding a mug, oversized tee, soft evening lamp light" },
  { id: "cinema", tags: ["film", "evening"], description: "holding a popcorn tub outside a retro single-screen cinema at night, neon marquee glow on her face, playful grin" },
  { id: "scooter", tags: ["city", "generic"], description: "leaning against a parked scooter on a colorful old-city street, helmet under one arm, sunglasses pushed up into her hair" },
  { id: "bazaar", tags: ["city", "generic"], description: "walking through a vibrant bazaar lane with hanging fabric stalls, holding a tote bag, candid look back at the camera" },
  { id: "rain_window", tags: ["cozy", "generic"], description: "by a rain-streaked window holding a cup of chai, monsoon outside, cozy shawl, wistful small smile" },
  { id: "rooftop_night", tags: ["evening", "city"], description: "at a rooftop party at night with city lights bokeh behind, smart casual dress, holding a mocktail, mid-laugh" },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function buildAppearance(age: number): string {
  return (
    `a stunningly beautiful ${age}-year-old Indian woman with ${pick(SKIN_TONES)}, ` +
    `${pick(APPEAL)}, ${pick(HAIR_STYLES)}, ${pick(EYES)}, ${pick(FACE_DETAILS)}, ` +
    `and a ${pick(BUILDS)}`
  );
}

function buildLayout(): ProfileLayout {
  const bioStyle = pick(BIO_STYLES);
  const prompts = shuffle(PROMPT_POOL).slice(0, randomInt(2, 4));
  // 80% of profiles show basics badges.
  const basicsLabels =
    Math.random() < 0.8 ? shuffle(BASICS_POOL).slice(0, randomInt(3, 5)) : [];

  const blocks: string[] = [];
  if (bioStyle) blocks.push("bio");
  prompts.forEach((_, i) => blocks.push(`prompt:${i}`));
  blocks.push("interests");
  if (basicsLabels.length > 0) blocks.push("basics");

  // Shuffle, but keep the bio in the top half so profiles still read naturally.
  let sectionOrder = shuffle(blocks);
  const bioIdx = sectionOrder.indexOf("bio");
  if (bioIdx > Math.floor(sectionOrder.length / 2)) {
    sectionOrder.splice(bioIdx, 1);
    sectionOrder = [
      ...sectionOrder.slice(0, 1),
      "bio",
      ...sectionOrder.slice(1),
    ];
  }

  return {
    photoCount: randomInt(4, 6),
    prompts,
    basicsLabels,
    bioStyle,
    interestCount: randomInt(4, 8),
    sectionOrder,
  };
}

function buildScenes(archetype: Archetype, photoCount: number): PhotoScene[] {
  const gallerySlots = photoCount - 1;

  // Guarantee 1-2 "signature" scenes for the archetype's primary tag (a pet
  // parent should actually have a pet photo), then fill with the wider pool.
  const signature = shuffle(
    SCENE_POOL.filter((s) => s.tags.includes(archetype.sceneTags[0])),
  ).slice(0, Math.min(2, gallerySlots));

  const remaining = SCENE_POOL.filter((s) => !signature.includes(s));
  const matching = remaining.filter((s) =>
    s.tags.some((t) => archetype.sceneTags.includes(t)),
  );
  const generic = remaining.filter(
    (s) => s.tags.includes("generic") && !matching.includes(s),
  );
  const rest = remaining.filter(
    (s) => !matching.includes(s) && !generic.includes(s),
  );

  const ordered = shuffle(
    [
      ...signature,
      ...shuffle(matching),
      ...shuffle(generic),
      ...shuffle(rest),
    ].slice(0, gallerySlots),
  );

  return [
    pick(ANCHOR_SCENES),
    ...ordered.map(({ id, description }) => ({ id, description })),
  ];
}

/**
 * Samples a fresh persona seed. Pass names/combos already in the DB so the
 * catalog stays diverse.
 */
export function samplePersonaSeed(options: {
  usedNames: Set<string>;
  usedArchetypeCity: Set<string>;
}): PersonaSeed {
  const availableNames = FIRST_NAMES.filter(
    (n) => !options.usedNames.has(n.toLowerCase()),
  );
  const name =
    availableNames.length > 0 ? pick(availableNames) : pick(FIRST_NAMES);

  let archetype = pick(ARCHETYPES);
  let city = pick(CITIES);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!options.usedArchetypeCity.has(`${archetype.id}|${city}`)) break;
    archetype = pick(ARCHETYPES);
    city = pick(CITIES);
  }

  const age = randomInt(21, 32);
  const layout = buildLayout();

  return {
    name,
    age,
    city,
    archetype: archetype.id,
    profession: pick(archetype.professions),
    vibe: archetype.vibe,
    appearance: buildAppearance(age),
    layout,
    scenes: buildScenes(archetype, layout.photoCount),
  };
}

export function slugForSeed(seed: PersonaSeed): string {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${seed.name.toLowerCase()}-${suffix}`;
}
