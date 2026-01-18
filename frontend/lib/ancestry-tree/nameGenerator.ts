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

  // Additional Flora (50+)
  'Yarrow', 'Tansy', 'Fennel', 'Dock', 'Coltsfoot', 'Comfrey', 'Borage',
  'Catmint', 'Mayweed', 'Ragwort', 'Bindweed', 'Mallow', 'Chicory', 'Dandelion',
  'Buttercup', 'Bluebell', 'Foxglove', 'Snapdragon', 'Cornflower', 'Larkspur',
  'Meadowsweet', 'Campion', 'Betony', 'Agrimony', 'Vervain', 'Chamomile',
  'Cowslip', 'Oxlip', 'Snowdrop', 'Crocus', 'Daffodil', 'Hyacinth', 'Tulip',
  'Hemlock', 'Nightshade', 'Aconite', 'Wolfsbane', 'Monkshood', 'Hellebore',
  'Yew', 'Elder', 'Blackthorn', 'Whitethorn', 'Hawthorn', 'Dogwood', 'Spindle',
  'Buckthorn', 'Privet', 'Honeysuckle', 'Clematis',

  // Additional Fauna (50+)
  'Adder', 'Asp', 'Basilisk', 'Boar', 'Buck', 'Bull', 'Colt', 'Cub',
  'Doe', 'Drake', 'Fawn', 'Foal', 'Hart', 'Hind', 'Kid', 'Lamb',
  'Leveret', 'Mare', 'Pup', 'Ram', 'Stag', 'Stallion', 'Whelp',
  'Cuckoo', 'Curlew', 'Dunlin', 'Egret', 'Grebe', 'Gull', 'Harrier',
  'Ibis', 'Jackdaw', 'Kestrel', 'Kingfisher', 'Lapwing', 'Merlin', 'Nightjar',
  'Peregrine', 'Pheasant', 'Plover', 'Quail', 'Redwing', 'Rook', 'Sandpiper',
  'Snipe', 'Stork', 'Tern', 'Warbler', 'Woodcock', 'Yellowhammer',

  // Minerals/Gems (30+)
  'Crystal', 'Diamond', 'Ruby', 'Sapphire', 'Opal', 'Pearl', 'Topaz',
  'Garnet', 'Amethyst', 'Quartz', 'Jasper', 'Agate', 'Obsidian', 'Basalt',
  'Pumice', 'Chalk', 'Limestone', 'Sandstone', 'Shale', 'Mica', 'Pyrite',
  'Galena', 'Ore', 'Nugget', 'Shard', 'Splinter', 'Chip', 'Fragment',
  'Jewel', 'Gem',

  // Celestial/Cosmic (25+)
  'Meteor', 'Asteroid', 'Nebula', 'Galaxy', 'Nova', 'Pulsar', 'Quasar',
  'Zenith', 'Nadir', 'Apex', 'Equinox', 'Solstice', 'Orbit', 'Phase',
  'Crescent', 'Gibbous', 'Quarter', 'Half', 'Full', 'Waning', 'Waxing',
  'Corona', 'Halo', 'Nimbus', 'Aura',

  // Sound/Music (20+)
  'Chord', 'Note', 'Pitch', 'Tone', 'Harmonic', 'Discord', 'Cadence',
  'Tempo', 'Rhythm', 'Meter', 'Verse', 'Stanza', 'Chorus', 'Refrain',
  'Lullaby', 'Ballad', 'Dirge', 'Anthem', 'Hymn', 'Canticle',
];

const SUFFIXES: string[] = [
  // Body Parts (60+)
  'fur', 'pelt', 'coat', 'tail', 'claw', 'fang', 'tooth', 'whisker', 'ear',
  'eye', 'eyes', 'nose', 'face', 'jaw', 'muzzle', 'snout', 'cheek', 'chin',
  'throat', 'neck', 'chest', 'belly', 'back', 'flank', 'side', 'shoulder',
  'leg', 'paw', 'foot', 'pad', 'toe', 'heel', 'ankle', 'wrist', 'spine',
  'rib', 'bone', 'skull', 'head', 'brow', 'crown', 'heart', 'soul', 'spirit',
  'stripe', 'spot', 'patch', 'mark', 'scar', 'scratch', 'nick', 'mask',
  'blaze', 'tip', 'tuft', 'streak', 'dapple', 'speckle', 'freckle',

  // Nature - Plants (50+)
  'leaf', 'petal', 'bloom', 'blossom', 'flower', 'thorn', 'briar', 'bramble',
  'berry', 'seed', 'stem', 'branch', 'twig', 'bark', 'root', 'moss', 'fern',
  'grass', 'reed', 'rush', 'vine', 'weed', 'herb', 'sprout', 'bud', 'acorn',
  'nettle', 'thistle', 'clover', 'ivy', 'willow', 'oak', 'pine', 'cedar',
  'maple', 'birch', 'alder', 'aspen', 'holly', 'hazel', 'laurel', 'sage',
  'mint', 'basil', 'thyme', 'rose', 'lily', 'daisy', 'poppy', 'orchid',

  // Nature - Weather/Sky (40+)
  'storm', 'cloud', 'rain', 'snow', 'frost', 'ice', 'hail', 'mist', 'fog',
  'dew', 'wind', 'breeze', 'gale', 'thunder', 'lightning', 'flash', 'spark',
  'flame', 'fire', 'blaze', 'ember', 'ash', 'smoke', 'shadow', 'light',
  'flare', 'glow', 'shine', 'shimmer', 'glint', 'gleam', 'ray', 'beam',
  'bolt', 'crack', 'rumble', 'whisper', 'howl', 'gust', 'squall',

  // Nature - Water (35+)
  'stream', 'river', 'creek', 'brook', 'spring', 'pool', 'pond', 'lake',
  'wave', 'ripple', 'splash', 'drop', 'drip', 'fall', 'falls', 'rapid',
  'current', 'tide', 'shore', 'bank', 'spray', 'foam', 'mist', 'eddy',
  'whirl', 'swirl', 'surge', 'flow', 'flood', 'wash', 'wake', 'drift',
  'dip', 'dive', 'swim',

  // Nature - Earth (40+)
  'stone', 'rock', 'boulder', 'pebble', 'dust', 'sand', 'mud', 'clay',
  'earth', 'ground', 'soil', 'dirt', 'gravel', 'slate', 'flint', 'crag',
  'cliff', 'ridge', 'peak', 'hill', 'valley', 'hollow', 'cave', 'den', 'burrow',
  'ledge', 'shelf', 'slope', 'gorge', 'canyon', 'ravine', 'gully', 'dune',
  'mesa', 'bluff', 'knoll', 'mound', 'pit', 'quarry', 'chasm',

  // Actions/Movement (60+)
  'flight', 'leap', 'jump', 'bound', 'spring', 'dash', 'run', 'sprint',
  'chase', 'hunt', 'strike', 'slash', 'swipe', 'bite', 'snap', 'snarl',
  'growl', 'hiss', 'screech', 'call', 'cry', 'song', 'howl', 'yowl', 'wail',
  'step', 'stride', 'tread', 'walk', 'stalk', 'prowl', 'creep', 'sneak',
  'pounce', 'crouch', 'rest', 'sleep', 'dream', 'wish', 'hope', 'surge',
  'charge', 'rush', 'bolt', 'dart', 'dive', 'soar', 'glide', 'swoop',
  'twist', 'spin', 'whirl', 'flip', 'tumble', 'roll', 'slide', 'skid',
  'climb', 'fall', 'drop', 'rise', 'float',

  // Qualities/Descriptive (50+)
  'shine', 'gleam', 'glow', 'shimmer', 'glimmer', 'sparkle', 'glitter',
  'dazzle', 'flare', 'beam', 'ray', 'shade', 'dark', 'night',
  'dawn', 'dusk', 'moon', 'sun', 'star', 'sky', 'weather',
  'storm', 'thunder', 'lightning', 'rainbow', 'aurora', 'haze', 'blur',
  'swift', 'quick', 'fast', 'slow', 'soft', 'hard', 'sharp', 'bright',
  'dim', 'pale', 'deep', 'high', 'low', 'long', 'short', 'wild',
  'calm', 'fierce', 'gentle', 'bold', 'shy',

  // Abstract/Sounds (35+)
  'song', 'whisper', 'murmur', 'roar', 'shriek', 'scream',
  'silence', 'echo', 'voice', 'sound', 'noise', 'tune', 'melody', 'harmony',
  'rhythm', 'beat', 'pulse', 'breath', 'sigh', 'gasp', 'snore', 'purr', 'rumble',
  'chime', 'ring', 'toll', 'hum', 'buzz', 'chirp', 'trill', 'coo', 'croak',
  'rasp', 'crack', 'snap',

  // Time/Seasons (20+)
  'morning', 'evening', 'noon', 'midnight',
  'autumn', 'equinox', 'solstice', 'harvest',
  'twilight', 'daybreak', 'nightfall', 'sundown', 'moonrise', 'starlight',
  'frost', 'thaw', 'bloom', 'wilt', 'fade', 'glow',

  // Fauna/Animal Parts (35+)
  'wing', 'feather', 'talon', 'beak', 'scale', 'fin', 'gill', 'antler',
  'horn', 'hoof', 'mane', 'tuft', 'plume', 'quill', 'barb',
  'shell', 'hide', 'skin', 'wool', 'down', 'crest', 'crown', 'frill',
  'snout', 'tusk', 'fang', 'claw', 'pad', 'print', 'track', 'trail',
  'nest', 'perch', 'roost', 'lair',

  // Additional Nature (40+)
  'meadow', 'field', 'glade', 'grove', 'copse', 'thicket', 'brush', 'scrub',
  'marsh', 'swamp', 'bog', 'fen', 'moor', 'heath', 'prairie', 'steppe',
  'tundra', 'desert', 'oasis', 'jungle', 'forest', 'wood', 'shade', 'canopy',
  'clearing', 'path', 'trail', 'road', 'bridge', 'ford', 'crossing', 'pass',
  'gate', 'gap', 'breach', 'break', 'split', 'crack', 'fissure', 'rift',

  // Appearance/Markings (40+)
  'bluff', 'tuft', 'ring', 'band', 'bar', 'collar', 'bib', 'vest', 'cape',
  'mantle', 'crown', 'cap', 'hood', 'veil', 'shroud', 'cloak', 'wrap',
  'splotch', 'smudge', 'smear', 'blur', 'haze', 'fleck', 'dot', 'point',
  'diamond', 'circle', 'swirl', 'curl', 'coil', 'spiral', 'wave', 'zigzag',
  'chevron', 'arrow', 'lance', 'spear', 'shield', 'crest', 'banner',

  // Emotions/States (35+)
  'joy', 'sorrow', 'rage', 'fury', 'wrath', 'peace', 'calm', 'serenity',
  'hope', 'despair', 'grief', 'bliss', 'agony', 'ecstasy', 'fervor', 'zeal',
  'pride', 'shame', 'glory', 'honor', 'valor', 'courage', 'fear', 'dread',
  'love', 'hate', 'scorn', 'spite', 'malice', 'grace', 'mercy', 'vengeance',
  'spite', 'envy', 'greed',

  // Additional Body/Physical (30+)
  'haunch', 'rump', 'loin', 'shank', 'hock', 'dewclaw', 'carpal', 'tarsal',
  'pinna', 'tragus', 'iris', 'pupil', 'lens', 'cornea', 'sclera', 'retina',
  'maw', 'gullet', 'crop', 'gizzard', 'liver', 'kidney', 'spleen', 'bladder',
  'sinew', 'tendon', 'ligament', 'cartilage', 'marrow', 'membrane',

  // Celestial/Cosmic (25+)
  'moon', 'sun', 'star', 'comet', 'meteor', 'nova', 'nebula', 'void',
  'cosmos', 'abyss', 'chasm', 'vortex', 'maelstrom', 'cyclone', 'tempest',
  'zenith', 'apex', 'summit', 'pinnacle', 'vertex', 'crest', 'crown', 'cap',
  'horizon', 'eclipse',

  // Materials/Textures (25+)
  'silk', 'satin', 'velvet', 'wool', 'cotton', 'linen', 'hemp', 'jute',
  'leather', 'suede', 'fleece', 'felt', 'gauze', 'mesh', 'net', 'web',
  'lace', 'ribbon', 'thread', 'yarn', 'cord', 'rope', 'twine', 'string',
  'fiber',
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
