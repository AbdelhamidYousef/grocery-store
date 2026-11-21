import type { FoodInfo } from '@store/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { makeProduct, makeVariant } from '../../../test/fixtures';
import { renderApp, renderWithProviders } from '../../../test/render';
import { API, server } from '../../../test/server';

import { NutritionPanel } from './NutritionPanel';

const food: FoodInfo = {
  nutrition: {
    energyKj: 960,
    energyKcal: 230,
    fat: 12,
    saturates: 2,
    carbs: 440,
    sugars: 30,
    fibre: 60,
    protein: 70,
    salt: 11,
  },
  ingredients: 'WHEAT flour, water, salt, MILK powder.',
  allergens: ['gluten', 'milk'],
  dietary: ['vegetarian'],
};

describe('NutritionPanel', () => {
  it('prints an EU-style table per 100 g, with nutrients in tenths of a gram as decimals', () => {
    renderWithProviders(<NutritionPanel food={food} unit="g" />);
    const table = within(screen.getByTestId('nutrition-table'));
    expect(table.getByText('per 100 g')).toBeInTheDocument();
    const row = (name: string) => table.getByRole('row', { name: new RegExp(`^${name}`) });
    expect(row('Energy')).toHaveTextContent('960 kJ / 230 kcal');
    expect(row('Fat')).toHaveTextContent('1.2 g');
    expect(row('of which saturates')).toHaveTextContent('0.2 g');
    expect(row('Carbohydrate')).toHaveTextContent('44 g');
    expect(row('Salt')).toHaveTextContent('1.1 g');
  });

  it('says per 100 ml for a liquid', () => {
    renderWithProviders(<NutritionPanel food={food} unit="ml" />);
    expect(screen.getByText('per 100 ml')).toBeInTheDocument();
  });

  it('puts the allergens in the ingredients in bold, in normal case', () => {
    renderWithProviders(<NutritionPanel food={food} unit="g" />);
    const ingredients = screen.getByTestId('ingredients');
    expect(ingredients).toHaveTextContent('Wheat flour, water, salt, milk powder.');
    const bold = [...ingredients.querySelectorAll('strong')].map((n) => n.textContent);
    expect(bold).toEqual(['Wheat', 'milk']);
  });

  it('lists the allergens in words, or says there are none', () => {
    const { unmount } = renderWithProviders(<NutritionPanel food={food} unit="g" />);
    expect(screen.getByTestId('allergens')).toHaveTextContent(
      'Contains: Cereals containing gluten, Milk',
    );
    unmount();
    renderWithProviders(<NutritionPanel food={{ ...food, allergens: [] }} unit="g" />);
    expect(screen.getByTestId('allergens')).toHaveTextContent('No allergens declared.');
  });
});

describe('product page: nutrition tab', () => {
  it('has a "Nutrition & ingredients" tab and dietary tags for food', async () => {
    server.use(
      http.get(`${API}/products/rope-tug`, () =>
        HttpResponse.json({
          data: makeProduct({
            food,
            variants: [makeVariant({ isDefault: true, netAmount: 500, netUnit: 'ml' })],
          }),
        }),
      ),
    );
    renderApp('/products/rope-tug');
    await userEvent.click(await screen.findByRole('tab', { name: 'Nutrition & ingredients' }));
    expect(await screen.findByTestId('nutrition-table')).toBeInTheDocument();
    expect(screen.getByText('per 100 ml')).toBeInTheDocument();
    expect(screen.getByTestId('dietary-tag')).toHaveTextContent('Vegetarian');
  });

  it('has no such tab for a product that is not food', async () => {
    renderApp('/products/rope-tug');
    await screen.findByRole('tab', { name: 'Description' });
    expect(screen.queryByRole('tab', { name: 'Nutrition & ingredients' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('dietary-tag')).not.toBeInTheDocument();
  });
});
