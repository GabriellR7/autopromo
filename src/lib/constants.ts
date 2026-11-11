import type { BodyType, CarStatus, FuelType, Transmission } from './types';

export const APP_NAME = 'AutoPromo';

export const LEGAL_DISCLAIMER = `${APP_NAME} is a listing and referral platform. We do not buy, sell or broker vehicles. All sales and title transfers are made directly between the owner and the buyer.`;

export const POPULAR_MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge', 'Ford', 'GMC',
  'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia', 'Land Rover', 'Lexus', 'Lincoln', 'Mazda',
  'Mercedes-Benz', 'Mini', 'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Subaru', 'Tesla', 'Toyota',
  'Volkswagen', 'Volvo',
];

export const TRANSMISSIONS: { value: Transmission; label: string }[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
  { value: 'cvt', label: 'CVT' },
];

export const FUEL_TYPES: { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'plug_in_hybrid', label: 'Plug-in Hybrid' },
  { value: 'electric', label: 'Electric' },
  { value: 'flex', label: 'Flex Fuel' },
];

export const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'van', label: 'Van / Minivan' },
  { value: 'wagon', label: 'Wagon' },
  { value: 'convertible', label: 'Convertible' },
];

export const STATUS_LABELS: Record<CarStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  active: 'Active',
  pending_sale: 'Pending sale',
  sold: 'Sold',
  paused: 'Paused',
};

export const RADIUS_OPTIONS = [10, 25, 50, 100, 250];

export const MAX_PHOTOS = 20;

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

export function labelFor<T extends string>(list: { value: T; label: string }[], value: T) {
  return list.find((i) => i.value === value)?.label ?? value;
}
