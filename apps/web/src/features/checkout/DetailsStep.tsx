import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { TEST_IDS } from '../../lib/test-ids';

import { DetailsSchema, SHIPPING_COUNTRIES, type Details, type DetailsInput } from './details';

// Step 1. Validation is the API's own schema, so "what the form accepts" and "what the server
// accepts" cannot drift; the server stays the judge (it re-validates and prices everything).
// Guests see a sign-in hint, signed-in shoppers a "save this address" box.
export function DetailsStep({
  defaults,
  signedIn,
  saveAddress,
  onSaveAddressChange,
  onSubmit,
}: {
  defaults: DetailsInput;
  signedIn: boolean;
  saveAddress: boolean;
  onSaveAddressChange: (value: boolean) => void;
  onSubmit: (details: Details) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DetailsInput, unknown, Details>({
    resolver: zodResolver(DetailsSchema),
    defaultValues: defaults,
  });
  const a = errors.shippingAddress;

  return (
    <form
      onSubmit={(e) => void handleSubmit(onSubmit)(e)}
      noValidate
      className="flex flex-col gap-4"
    >
      {!signedIn && (
        <p className="text-sm" data-testid={TEST_IDS.checkoutSignInHint}>
          Have an account?{' '}
          <Link to="/login?next=/checkout" className="font-semibold text-primary-strong underline">
            Sign in
          </Link>{' '}
          to use your saved details. Or just carry on as a guest.
        </p>
      )}
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        hint="We send your order confirmation here."
        error={errors.email?.message}
        data-testid={TEST_IDS.checkoutEmail}
        {...register('email')}
      />
      <Input
        label="Full name"
        autoComplete="shipping name"
        error={a?.fullName?.message}
        {...register('shippingAddress.fullName')}
      />
      <Input
        label="Address line 1"
        autoComplete="shipping address-line1"
        error={a?.line1?.message}
        {...register('shippingAddress.line1')}
      />
      <Input
        label="Address line 2 (optional)"
        autoComplete="shipping address-line2"
        error={a?.line2?.message}
        {...register('shippingAddress.line2')}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Postal code"
          autoComplete="shipping postal-code"
          error={a?.postalCode?.message}
          {...register('shippingAddress.postalCode')}
        />
        <Input
          label="City"
          autoComplete="shipping address-level2"
          error={a?.city?.message}
          {...register('shippingAddress.city')}
        />
      </div>
      <Input
        label="Region (optional)"
        autoComplete="shipping address-level1"
        error={a?.region?.message}
        {...register('shippingAddress.region')}
      />
      <Select
        label="Country"
        autoComplete="shipping country"
        hint="We ship inside Europe."
        error={a?.country?.message}
        {...register('shippingAddress.country')}
      >
        {SHIPPING_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </Select>
      <Input
        label="Phone (optional)"
        type="tel"
        autoComplete="shipping tel"
        hint="Only for the courier."
        error={a?.phone?.message}
        {...register('shippingAddress.phone')}
      />
      {signedIn && (
        <Checkbox
          label="Save this address to my account"
          checked={saveAddress}
          onChange={(e) => onSaveAddressChange(e.target.checked)}
          data-testid={TEST_IDS.checkoutSaveAddress}
        />
      )}
      <Button
        type="submit"
        size="lg"
        className="self-stretch sm:self-end"
        data-testid={TEST_IDS.checkoutContinueShipping}
      >
        Continue to shipping
      </Button>
    </form>
  );
}
