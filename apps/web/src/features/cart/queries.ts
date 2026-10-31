import type { Variant } from '@store/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import {
  addCartItem,
  fetchCart,
  outOfStockDetails,
  removeCartItem,
  updateCartItem,
  type CartWarning,
  type WebCart,
  type WebCartItem,
} from '../../api/cart';
import { useToast } from '../../components/ui/Toast';
import { keys } from '../../lib/query-client';
import { track } from '../../lib/track';
import { formErrorMessage } from '../auth/form-errors';

import { withLineQuantity } from './cart-math';

// ---------- notices ----------
// The API reports a warning once (reading the cart repairs it, so the next read is calm). If the
// page only looked at the latest response, the notice would vanish the moment anything refetched
// the cart, for instance the header badge. So every cart that arrives parks its warnings in this
// small cache entry, where they stay until the shopper dismisses them.
export const noticeKey = (w: Pick<CartWarning, 'code' | 'variantId'>) => `${w.code}:${w.variantId}`;

function rememberNotices(queryClient: QueryClient, warnings: CartWarning[]): void {
  if (warnings.length === 0) return;
  queryClient.setQueryData<CartWarning[]>(keys.cartNotices, (current = []) => {
    const incoming = new Set(warnings.map(noticeKey));
    return [...current.filter((w) => !incoming.has(noticeKey(w))), ...warnings];
  });
}

export function useCartNotices() {
  const queryClient = useQueryClient();
  // Never fetches (initialData + infinite staleTime): it only reads and subscribes to the cache.
  const { data } = useQuery<CartWarning[]>({
    queryKey: keys.cartNotices,
    queryFn: () => [],
    initialData: [],
    staleTime: Infinity,
  });
  const dismiss = (key: string) =>
    queryClient.setQueryData<CartWarning[]>(keys.cartNotices, (current = []) =>
      current.filter((w) => noticeKey(w) !== key),
    );
  return { notices: data, dismiss };
}

// ---------- reading ----------
// Every write lands here, so notices are parked no matter which request produced the cart.
function setCart(queryClient: QueryClient, cart: WebCart): void {
  rememberNotices(queryClient, cart.warnings);
  queryClient.setQueryData(keys.cart, cart);
}

export function useCart() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.cart,
    queryFn: async ({ signal }) => {
      const cart = await fetchCart(signal);
      rememberNotices(queryClient, cart.warnings);
      return cart;
    },
    // Shorter than the catalog's minute: the cart is the one page where stale stock or prices
    // matter, and it is cheap to read.
    staleTime: 15_000,
  });
}

// ---------- writing ----------
export function cartErrorMessage(error: unknown): string {
  const stock = outOfStockDetails(error);
  if (stock) {
    if (stock.maxQty === 0) return 'Sorry, this item has just sold out.';
    if (stock.inCart >= stock.maxQty) {
      return `You already have all ${stock.maxQty} we can offer in your cart.`;
    }
    return `Only ${stock.maxQty} available, and you have ${stock.inCart} in your cart.`;
  }
  return formErrorMessage(error);
}

// All cart writes share one scope id, so TanStack Query runs them one after another instead of in
// parallel. Without it, tapping "+" three times fires three requests whose answers can arrive out
// of order, and the older answer would overwrite the newer one in the cache.
const CART_SCOPE = { id: 'cart' } as const;

function useAddCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    scope: CART_SCOPE,
    mutationFn: addCartItem,
    onSuccess: (cart) => setCart(queryClient, cart),
  });
}

// Optimistic update (plan 7.5), in the three steps TanStack Query names:
//  onMutate: stop in-flight cart reads (they would overwrite our guess), remember the cache, and
//            write the expected cart so the UI answers instantly;
//  onError:  put the remembered cache back (rollback), and refetch because the server knows best;
//  onSuccess: the server returned the whole real cart, so replace the guess with it.
function useLineMutation<V>(
  request: (vars: V) => Promise<WebCart>,
  guess: (cart: WebCart, vars: V) => WebCart,
) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: CART_SCOPE,
    mutationFn: request,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: keys.cart });
      const previous = queryClient.getQueryData<WebCart>(keys.cart);
      if (previous) queryClient.setQueryData(keys.cart, guess(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(keys.cart, context.previous);
      void queryClient.invalidateQueries({ queryKey: keys.cart });
    },
    onSuccess: (cart) => setCart(queryClient, cart),
  });
}

export function useCartActions() {
  const toast = useToast();
  const update = useLineMutation(
    ({ id, quantity }: { id: string; quantity: number }) => updateCartItem(id, { quantity }),
    (cart, { id, quantity }) => withLineQuantity(cart, id, quantity),
  );
  const remove = useLineMutation(
    ({ id }: { id: string }) => removeCartItem(id),
    (cart, { id }) => withLineQuantity(cart, id, 0),
  );
  return {
    setQuantity: (item: WebCartItem, quantity: number) =>
      update.mutate(
        { id: item.id, quantity },
        { onError: (error) => toast.show(cartErrorMessage(error), 'error') },
      ),
    remove: (item: WebCartItem) =>
      remove.mutate(
        { id: item.id },
        {
          onSuccess: () => {
            track({
              name: 'remove_from_cart',
              item: {
                id: item.productId,
                name: item.productName,
                price: item.unitPriceCents,
                variant: item.sku,
              },
              quantity: item.quantity,
            });
            toast.show(`Removed ${item.productName} from your cart`);
          },
          onError: (error) => toast.show(cartErrorMessage(error), 'error'),
        },
      ),
  };
}

// What the PDP button calls: add, then track, then a toast with a way to the cart. A refusal
// (409 OUT_OF_STOCK) becomes a plain-language toast that says how many can be had.
export function useAddToCartAction(product: { id: string; name: string }) {
  const add = useAddCartItem();
  const toast = useToast();
  const navigate = useNavigate();
  return {
    pending: add.isPending,
    add: (variant: Variant, quantity: number) =>
      add.mutate(
        { variantId: variant.id, quantity },
        {
          onSuccess: () => {
            track({
              name: 'add_to_cart',
              item: {
                id: product.id,
                name: product.name,
                price: variant.priceCents,
                variant: variant.sku,
              },
              quantity,
            });
            toast.show(`Added ${quantity} x ${product.name} to your cart`, 'success', {
              label: 'View cart',
              onAction: () => void navigate('/cart'),
            });
          },
          onError: (error) => toast.show(cartErrorMessage(error), 'error'),
        },
      ),
  };
}
