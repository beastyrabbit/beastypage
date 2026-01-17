import type { CatName, LifeStage } from './types';

const PREFIXES: string[] = [
  // Nature - Sky/Weather (50+)
  'Sun', 'Moon', 'Star', 'Storm', 'Thunder', 'Lightning', 'Rain', 'Snow', 'Frost',
  'Ice', 'Hail', 'Cloud', 'Sky', 'Dawn', 'Dusk', 'Twilight', 'Night', 'Shadow',
  'Dark', 'Light', 'Bright', 'Blaze', 'Fire', 'Flame', 'Ember', 'Ash', 'Smoke',
  'Wind', 'Breeze', 'Gale', 'Mist', 'Fog', 'Dew', 'Drizzle', 'Sleet', 'Shimmer',
  'Spark', 'Flash', 'Flicker', 'Gleam', 'Glimmer', 'Glow', 'Ray', 'Beam', 'Shine',
  'Solar', 'Lunar', 'Comet', 'Aurora', 'Eclipse',

  // Flora (80+)
  'Oak', 'Willow', 'Birch', 'Pine', 'Cedar', 'Maple', 'Ash', 'Elm', 'Alder',
  'Rowan', 'Holly', 'Ivy', 'Fern', 'Moss', 'Lichen', 'Bramble', 'Thorn', 'Briar',
  'Rose', 'Lily', 'Daisy', 'Violet', 'Poppy', 'Tulip', 'Primrose', 'Marigold',
  'Blossom', 'Petal', 'Bloom', 'Flower', 'Seed', 'Sprout', 'Leaf', 'Branch',
  'Twig', 'Root', 'Bark', 'Timber', 'Wood', 'Forest', 'Grove', 'Meadow', 'Clover',
  'Heather', 'Lavender', 'Sage', 'Mint', 'Thyme', 'Sorrel', 'Nettle', 'Reed',
  'Rush', 'Sedge', 'Bracken', 'Gorse', 'Juniper', 'Hazel', 'Acorn', 'Berry',
  'Cherry', 'Apple', 'Plum', 'Peach', 'Pear', 'Olive', 'Laurel', 'Palm', 'Fir',
  'Spruce', 'Aspen', 'Beech', 'Hickory', 'Magnolia', 'Wisteria', 'Orchid', 'Lotus',
  'Jasmine', 'Gardenia', 'Zinnia', 'Aster', 'Dahlia', 'Peony', 'Iris', 'Pansy',

  // Fauna - Prey (40+)
  'Mouse', 'Vole', 'Shrew', 'Rabbit', 'Hare', 'Squirrel', 'Chipmunk', 'Mole',
  'Finch', 'Sparrow', 'Robin', 'Wren', 'Thrush', 'Dove', 'Pigeon', 'Lark',
  'Swallow', 'Swift', 'Martin', 'Jay', 'Magpie', 'Cricket', 'Moth', 'Butterfly',
  'Beetle', 'Bee', 'Wasp', 'Ant', 'Spider', 'Frog', 'Toad', 'Newt', 'Salamander',
  'Fish', 'Trout', 'Pike', 'Minnow', 'Carp', 'Bass', 'Perch', 'Salmon',

  // Fauna - Predators (30+)
  'Fox', 'Wolf', 'Hawk', 'Eagle', 'Falcon', 'Owl', 'Crow', 'Raven', 'Badger',
  'Otter', 'Weasel', 'Stoat', 'Marten', 'Ferret', 'Lynx', 'Puma', 'Jaguar',
  'Leopard', 'Lion', 'Tiger', 'Bear', 'Serpent', 'Snake', 'Viper', 'Adder',
  'Cobra', 'Python', 'Heron', 'Crane', 'Osprey', 'Kite', 'Buzzard',

  // Colors (60+)
  'Black', 'White', 'Gray', 'Grey', 'Silver', 'Golden', 'Gold', 'Amber',
  'Russet', 'Copper', 'Bronze', 'Tan', 'Brown', 'Fawn', 'Tawny', 'Ginger',
  'Red', 'Crimson', 'Scarlet', 'Rust', 'Orange', 'Apricot', 'Peach', 'Yellow',
  'Cream', 'Ivory', 'Pale', 'Sandy', 'Dusty', 'Ashen', 'Smoky', 'Charcoal',
  'Ebony', 'Jet', 'Onyx', 'Blue', 'Azure', 'Cobalt', 'Indigo', 'Violet',
  'Purple', 'Lavender', 'Lilac', 'Pink', 'Rose', 'Coral', 'Salmon', 'Green',
  'Emerald', 'Jade', 'Olive', 'Sage', 'Mint', 'Teal', 'Cyan', 'Aqua', 'Marine',
  'Spotted', 'Striped', 'Dappled', 'Speckled', 'Mottled',

  // Terrain/Landscape (50+)
  'Stone', 'Rock', 'Boulder', 'Pebble', 'Flint', 'Slate', 'Granite', 'Marble',
  'Sand', 'Dust', 'Mud', 'Clay', 'Dirt', 'Earth', 'Soil', 'Gravel', 'Crag',
  'Cliff', 'Ridge', 'Peak', 'Summit', 'Mountain', 'Hill', 'Valley', 'Gorge',
  'Canyon', 'Ravine', 'Gully', 'Hollow', 'Cave', 'Cavern', 'Pool', 'Pond',
  'Lake', 'River', 'Stream', 'Creek', 'Brook', 'Spring', 'Marsh', 'Swamp',
  'Bog', 'Fen', 'Delta', 'Shore', 'Beach', 'Coast', 'Tide', 'Wave', 'Ripple',

  // Descriptive - Physical (60+)
  'Swift', 'Quick', 'Fast', 'Fleet', 'Nimble', 'Agile', 'Lithe', 'Sleek',
  'Strong', 'Brave', 'Bold', 'Fierce', 'Wild', 'Feral', 'Savage', 'Sharp',
  'Keen', 'Bright', 'Clever', 'Wise', 'Sly', 'Cunning', 'Crafty', 'Wily',
  'Small', 'Little', 'Tiny', 'Short', 'Tall', 'Long', 'Big', 'Large', 'Heavy',
  'Light', 'Soft', 'Silky', 'Velvet', 'Fuzzy', 'Fluffy', 'Shaggy', 'Bristle',
  'Spiky', 'Jagged', 'Ragged', 'Torn', 'Broken', 'Crooked', 'Twisted', 'Bent',
  'Straight', 'Curly', 'Kinked', 'Spotted', 'Striped', 'Patched', 'Freckled',
  'Scarred', 'Notched', 'Nicked', 'Half', 'One', 'Lost', 'Running',

  // Descriptive - Personality (40+)
  'Quiet', 'Silent', 'Still', 'Calm', 'Gentle', 'Kind', 'Sweet', 'Loving',
  'Warm', 'Cold', 'Cool', 'Icy', 'Chilly', 'Frozen', 'Burning', 'Blazing',
  'Fierce', 'Proud', 'Noble', 'Loyal', 'True', 'Just', 'Fair', 'Honest',
  'Shy', 'Timid', 'Meek', 'Humble', 'Daring', 'Reckless', 'Careful', 'Cautious',
  'Eager', 'Ready', 'Willing', 'Happy', 'Merry', 'Jolly', 'Grim', 'Stern',

  // Time/Age (20+)
  'Ancient', 'Old', 'Elder', 'Young', 'New', 'Fresh', 'Early', 'Late',
  'Morning', 'Evening', 'Midnight', 'Noon', 'Spring', 'Summer', 'Autumn', 'Winter',
  'Falling', 'Rising', 'Waning', 'Waxing', 'Fading', 'Growing',

  // Miscellaneous (30+)
  'Tall', 'Low', 'High', 'Deep', 'Shallow', 'Thick', 'Thin', 'Wide', 'Narrow',
  'Hollow', 'Solid', 'Dense', 'Loose', 'Tight', 'Open', 'Hidden', 'Lost',
  'Found', 'Wandering', 'Roaming', 'Drifting', 'Floating', 'Sinking', 'Diving',
  'Leaping', 'Jumping', 'Tumbling', 'Rolling', 'Spinning', 'Dancing',
];

const SUFFIXES: string[] = [
  // Body Parts (50+)
  'fur', 'pelt', 'coat', 'tail', 'claw', 'fang', 'tooth', 'whisker', 'ear',
  'eye', 'eyes', 'nose', 'face', 'jaw', 'muzzle', 'snout', 'cheek', 'chin',
  'throat', 'neck', 'chest', 'belly', 'back', 'flank', 'side', 'shoulder',
  'leg', 'paw', 'foot', 'pad', 'toe', 'heel', 'ankle', 'wrist', 'spine',
  'rib', 'bone', 'skull', 'head', 'brow', 'crown', 'heart', 'soul', 'spirit',
  'stripe', 'spot', 'patch', 'mark', 'scar', 'scratch', 'nick',

  // Nature - Plants (30+)
  'leaf', 'petal', 'bloom', 'blossom', 'flower', 'thorn', 'briar', 'bramble',
  'berry', 'seed', 'stem', 'branch', 'twig', 'bark', 'root', 'moss', 'fern',
  'grass', 'reed', 'rush', 'vine', 'weed', 'herb', 'sprout', 'bud', 'acorn',
  'nettle', 'thistle', 'clover', 'ivy',

  // Nature - Weather/Sky (25+)
  'storm', 'cloud', 'rain', 'snow', 'frost', 'ice', 'hail', 'mist', 'fog',
  'dew', 'wind', 'breeze', 'gale', 'thunder', 'lightning', 'flash', 'spark',
  'flame', 'fire', 'blaze', 'ember', 'ash', 'smoke', 'shadow', 'light',

  // Nature - Water (20+)
  'stream', 'river', 'creek', 'brook', 'spring', 'pool', 'pond', 'lake',
  'wave', 'ripple', 'splash', 'drop', 'drip', 'fall', 'falls', 'rapid',
  'current', 'tide', 'shore', 'bank',

  // Nature - Earth (25+)
  'stone', 'rock', 'boulder', 'pebble', 'dust', 'sand', 'mud', 'clay',
  'earth', 'ground', 'soil', 'dirt', 'gravel', 'slate', 'flint', 'crag',
  'cliff', 'ridge', 'peak', 'hill', 'valley', 'hollow', 'cave', 'den', 'burrow',

  // Actions/Movement (40+)
  'flight', 'leap', 'jump', 'bound', 'spring', 'dash', 'run', 'sprint',
  'chase', 'hunt', 'strike', 'slash', 'swipe', 'bite', 'snap', 'snarl',
  'growl', 'hiss', 'screech', 'call', 'cry', 'song', 'howl', 'yowl', 'wail',
  'step', 'stride', 'tread', 'walk', 'stalk', 'prowl', 'creep', 'sneak',
  'pounce', 'crouch', 'rest', 'sleep', 'dream', 'wish', 'hope',

  // Qualities (30+)
  'shine', 'gleam', 'glow', 'shimmer', 'glimmer', 'sparkle', 'glitter', 'flash',
  'dazzle', 'blaze', 'flare', 'beam', 'ray', 'shade', 'dark', 'night',
  'dawn', 'dusk', 'moon', 'sun', 'star', 'sky', 'cloud', 'weather', 'breeze',
  'storm', 'thunder', 'lightning', 'rainbow', 'aurora',

  // Abstract/Concepts (25+)
  'song', 'call', 'cry', 'whisper', 'murmur', 'roar', 'shriek', 'scream',
  'silence', 'echo', 'voice', 'sound', 'noise', 'tune', 'melody', 'harmony',
  'rhythm', 'beat', 'pulse', 'breath', 'sigh', 'gasp', 'snore', 'purr', 'rumble',

  // Time/Seasons (15+)
  'dawn', 'dusk', 'night', 'day', 'morning', 'evening', 'noon', 'midnight',
  'spring', 'summer', 'fall', 'winter', 'season', 'moon', 'sun',

  // Fauna (20+)
  'wing', 'feather', 'talon', 'beak', 'scale', 'fin', 'gill', 'antler',
  'horn', 'hoof', 'mane', 'tuft', 'plume', 'quill', 'barb', 'spine',
  'shell', 'hide', 'skin', 'wool',
];

const LIFE_STAGE_SUFFIXES: Record<LifeStage, string> = {
  kit: 'kit',
  apprentice: 'paw',
  warrior: '', // Uses regular suffix
  leader: 'star',
  elder: '', // Uses regular suffix
};

export function pickOne<T>(items: T[]): T {
  if (!items.length) {
    throw new Error('Attempted to pick from an empty list');
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function generateWarriorName(
  lifeStage: LifeStage,
  usedNames?: Set<string>
): CatName {
  const maxAttempts = 100;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const prefix = pickOne(PREFIXES);
    let suffix: string;

    if (lifeStage === 'kit') {
      suffix = LIFE_STAGE_SUFFIXES.kit;
    } else if (lifeStage === 'apprentice') {
      suffix = LIFE_STAGE_SUFFIXES.apprentice;
    } else if (lifeStage === 'leader') {
      suffix = LIFE_STAGE_SUFFIXES.leader;
    } else {
      suffix = pickOne(SUFFIXES);
    }

    const full = capitalize(prefix) + suffix;

    if (!usedNames || !usedNames.has(full.toLowerCase())) {
      return { prefix, suffix, full };
    }

    attempts++;
  }

  // Fallback: add a timestamp suffix to guarantee uniqueness
  const prefix = pickOne(PREFIXES);
  const uniqueSuffix = Date.now().toString(36).slice(-4);
  const baseSuffix = lifeStage === 'kit' ? 'kit' :
    lifeStage === 'apprentice' ? 'paw' :
    lifeStage === 'leader' ? 'star' :
    pickOne(SUFFIXES);
  // Include uniqueSuffix in suffix to maintain invariant: full === capitalize(prefix) + suffix
  const suffix = `${baseSuffix}${uniqueSuffix}`;
  const full = capitalize(prefix) + suffix;

  return { prefix, suffix, full };
}

export function updateNameForLifeStage(
  currentName: CatName,
  newLifeStage: LifeStage
): CatName {
  const { prefix } = currentName;
  let suffix: string;

  if (newLifeStage === 'kit') {
    suffix = LIFE_STAGE_SUFFIXES.kit;
  } else if (newLifeStage === 'apprentice') {
    suffix = LIFE_STAGE_SUFFIXES.apprentice;
  } else if (newLifeStage === 'leader') {
    suffix = LIFE_STAGE_SUFFIXES.leader;
  } else {
    // For warriors and elders, keep suffix if they have one, or pick new one
    suffix = currentName.suffix === 'kit' || currentName.suffix === 'paw'
      ? pickOne(SUFFIXES)
      : currentName.suffix;
  }

  const full = capitalize(prefix) + suffix;
  return { prefix, suffix, full };
}

export function getAvailablePrefixes(): string[] {
  return [...PREFIXES];
}

export function getAvailableSuffixes(): string[] {
  return [...SUFFIXES];
}

export function getTotalCombinations(): number {
  // Base combinations: prefix * suffix
  // Plus special suffixes for different life stages
  return PREFIXES.length * (SUFFIXES.length + 3); // +3 for kit, paw, star
}
