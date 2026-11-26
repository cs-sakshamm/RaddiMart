import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  fetchCatalogue: vi.fn(),
  getSessionUser: vi.fn(),
  createListing: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../src/lib/supabase.js', () => ({
  getSupabaseClient: () => mocks.getSupabaseClient(),
}));
vi.mock('../src/lib/listingsApi.js', () => ({
  fetchCatalogue: (supabase) => mocks.fetchCatalogue(supabase),
  getSessionUser: (supabase) => mocks.getSessionUser(supabase),
  createListing: (supabase, payload) => mocks.createListing(supabase, payload),
}));
vi.mock('../src/lib/listings.js', () => ({
  calculateIndicativePrice: (weight, rate) =>
    Number(weight) > 0 && rate ? Number(weight) * rate : null,
  formatAmount: (value) => `Rs ${value}`,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../src/components/DashboardNav.jsx', () => ({ default: () => null }));

import DashboardCreateListing from '../src/components/DashboardCreateListing.jsx';

const CATALOGUE = {
  categories: [
    {
      id: 'cat-ewaste',
      name: 'E-waste',
      subcategories: [
        { id: 'sub-pcbs', name: 'PCBs' },
        { id: 'sub-cables', name: 'Cables and wires' },
      ],
    },
    {
      id: 'cat-metals',
      name: 'Metals',
      subcategories: [{ id: 'sub-copper', name: 'Copper' }],
    },
  ],
  rateByCategory: { 'cat-ewaste': 10 },
};

let container;
let root;

function render() {
  return act(async () => {
    root.render(<DashboardCreateListing />);
  });
}

function submit() {
  return act(async () => {
    container
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

function changeValue(element, value) {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

function change(element, value) {
  return act(async () => {
    changeValue(element, value);
  });
}

function optionLabels(element) {
  return Array.from(element.options, (option) => option.textContent);
}

function buttonNamed(name) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent.includes(name),
  );
}

async function fillValidForm() {
  await change(container.querySelector('#category'), 'cat-ewaste');
  await change(container.querySelector('#subcategory'), 'sub-pcbs');
  await change(container.querySelector('#weight'), '12.5');
  await change(container.querySelector('#condition'), 'Used');
  await change(container.querySelector('#address'), '12 Test Street, Pune');
  await change(container.querySelector('#zone'), 'Pune West');
}

beforeEach(() => {
  vi.resetAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.getSupabaseClient.mockReturnValue({ configured: true });
  mocks.getSessionUser.mockResolvedValue({ id: 'consumer-1' });
  mocks.createListing.mockResolvedValue({ data: { id: 'listing-1', warning: '' }, error: null });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

describe('DashboardCreateListing catalogue states', () => {
  it('shows categories and subcategories, and resets the subcategory on category change', async () => {
    mocks.fetchCatalogue.mockResolvedValue({ data: CATALOGUE, error: null });

    await render();

    expect(optionLabels(container.querySelector('#category'))).toEqual([
      'Select a category',
      'E-waste',
      'Metals',
    ]);

    await change(container.querySelector('#category'), 'cat-ewaste');
    expect(optionLabels(container.querySelector('#subcategory'))).toEqual([
      'Select subcategory',
      'PCBs',
      'Cables and wires',
    ]);

    await change(container.querySelector('#subcategory'), 'sub-pcbs');
    expect(container.querySelector('#subcategory').value).toBe('sub-pcbs');

    await change(container.querySelector('#category'), 'cat-metals');
    expect(container.querySelector('#subcategory').value).toBe('');
    expect(optionLabels(container.querySelector('#subcategory'))).toEqual([
      'Select subcategory',
      'Copper',
    ]);
  });

  it('shows a retry button on catalogue failure and recovers when retry succeeds', async () => {
    let failFirstLoad;
    mocks.fetchCatalogue
      .mockReturnValueOnce(new Promise((resolve) => { failFirstLoad = resolve; }))
      .mockResolvedValueOnce({ data: CATALOGUE, error: null });

    await act(async () => {
      root.render(<DashboardCreateListing />);
    });
    expect(container.textContent).toContain('Loading the material catalogue…');

    await act(async () => {
      failFirstLoad({ data: null, error: 'Could not load the material catalogue.' });
    });
    expect(container.textContent).toContain('Could not load the material catalogue.');
    expect(container.textContent).toContain('Retry loading catalogue');

    await act(async () => {
      buttonNamed('Retry loading catalogue').click();
    });

    expect(mocks.fetchCatalogue).toHaveBeenCalledTimes(2);
    expect(container.querySelector('#category')).not.toBeNull();
  });

  it('keeps the configured empty state when the catalogue truly has no categories', async () => {
    mocks.fetchCatalogue.mockResolvedValue({
      data: { categories: [], rateByCategory: {} },
      error: null,
    });

    await render();

    expect(container.textContent).toContain('No material categories have been configured yet.');
    expect(container.querySelector('#category')).toBeNull();
  });
});

describe('DashboardCreateListing submission', () => {
  beforeEach(() => {
    mocks.fetchCatalogue.mockResolvedValue({ data: CATALOGUE, error: null });
  });

  it('requires the mandatory fields before calling the API', async () => {
    await render();
    await submit();

    expect(container.textContent).toContain(
      'Please choose a material category and condition, and enter the pickup address.',
    );
    expect(mocks.createListing).not.toHaveBeenCalled();
  });

  it('rejects a stale category id', async () => {
    await render();
    await change(container.querySelector('#category'), 'cat-ewaste');
    await change(container.querySelector('#condition'), 'Used');
    await change(container.querySelector('#address'), '12 Test Street');

    const category = container.querySelector('#category');
    Object.defineProperty(category, 'value', { configurable: true, get: () => 'stale-category' });
    await act(async () => {
      category.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit();

    expect(container.textContent).toContain('Choose a valid material category.');
    expect(mocks.createListing).not.toHaveBeenCalled();
  });

  it('preserves entered values on failure and maps valid values into the listing API', async () => {
    await render();
    await fillValidForm();

    mocks.createListing.mockResolvedValueOnce({
      data: null,
      error: 'Failed to create the listing. Please try again.',
    });
    await submit();

    expect(container.textContent).toContain('Failed to create the listing. Please try again.');
    expect(container.querySelector('#weight').value).toBe('12.5');
    expect(container.querySelector('#address').value).toBe('12 Test Street, Pune');

    mocks.createListing.mockResolvedValueOnce({ data: { id: 'listing-1', warning: '' }, error: null });
    await submit();

    expect(mocks.createListing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'consumer-1',
        categoryId: 'cat-ewaste',
        subcategoryId: 'sub-pcbs',
        approximateWeight: '12.5',
        condition: 'Used',
        address: '12 Test Street, Pune',
        pickupZone: 'Pune West',
      }),
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/listing/listing-1', { replace: true });
  });
});
