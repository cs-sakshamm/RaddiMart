// Local, project-owned material photography. These are illustrative material
// images, not photographs of a specific facility or certification evidence.

const IMAGES = {
  'e-waste': {
    src: '/images/materials/e-waste.jpg',
    alt: 'Circuit boards, cables and dismantled electronics sorted for recovery',
  },
  metals: {
    src: '/images/materials/metals.jpg',
    alt: 'Coils of copper and aluminium with brass fittings for recycling',
  },
  paper: {
    src: '/images/materials/paper.jpg',
    alt: 'Bundled cardboard and stacked paper tied for recycling',
  },
  plastics: {
    src: '/images/materials/plastics.jpg',
    alt: 'Clean PET bottles and coloured plastic containers sorted in a crate',
  },
  mixed: {
    src: '/images/materials/collection.jpg',
    alt: 'A collector sorting cardboard, cables and recyclable material at a neighbourhood collection point',
  },
};

function keyFor(categoryName) {
  const name = String(categoryName || '').toLowerCase();
  if (name.includes('e-waste') || name.includes('electronic')) return 'e-waste';
  if (name.includes('metal')) return 'metals';
  if (name.includes('paper') || name.includes('cardboard')) return 'paper';
  if (name.includes('plastic')) return 'plastics';
  return 'mixed';
}

export function materialImage(categoryName) {
  return IMAGES[keyFor(categoryName)];
}

export const MATERIAL_CARDS = [
  {
    name: 'E-waste',
    ...IMAGES['e-waste'],
    note: 'Cables, boards and electronic parts routed for structured recovery.',
  },
  {
    name: 'Metals',
    ...IMAGES.metals,
    note: 'Copper, aluminium and brass sorted before the next recovery stage.',
  },
  {
    name: 'Paper',
    ...IMAGES.paper,
    note: 'Cardboard and paper kept dry and bundled for collection.',
  },
  {
    name: 'Plastics',
    ...IMAGES.plastics,
    note: 'Clean household plastics grouped by material and condition.',
  },
];
