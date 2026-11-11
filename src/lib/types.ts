export type CarStatus = 'draft' | 'pending_review' | 'active' | 'pending_sale' | 'sold' | 'paused';
export type Transmission = 'automatic' | 'manual' | 'cvt';
export type FuelType = 'gasoline' | 'diesel' | 'hybrid' | 'plug_in_hybrid' | 'electric' | 'flex';
export type BodyType =
  | 'sedan'
  | 'suv'
  | 'truck'
  | 'coupe'
  | 'hatchback'
  | 'van'
  | 'wagon'
  | 'convertible';
export type CommissionType = 'fixed' | 'percent';
export type ActiveMode = 'owner' | 'promoter' | 'buyer';
export type PromoterLevel = 'bronze' | 'silver' | 'gold';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  state: string | null;
  is_owner: boolean;
  is_promoter: boolean;
  is_admin: boolean;
  active_mode: ActiveMode;
  onboarded: boolean;
  identity_verified: boolean;
  promoter_level: PromoterLevel;
  accepted_terms_at: string | null;
  promoter_agreement_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarPhoto {
  id: string;
  car_id: string;
  storage_path: string | null;
  url: string;
  position: number;
  created_at: string;
}

export interface Car {
  id: string;
  public_id: number;
  owner_id: string;
  status: CarStatus;
  make: string;
  model: string;
  year: number;
  trim_level: string | null;
  mileage: number;
  vin_last6: string | null;
  exterior_color: string | null;
  transmission: Transmission;
  fuel_type: FuelType;
  body_type: BodyType;
  /** Always set once published; may be null while the listing is a draft. */
  price: number;
  description: string | null;
  zip: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  commission_type: CommissionType;
  commission_value: number;
  allow_any_verified_promoter: boolean;
  views: number;
  published_at: string | null;
  sold_at: string | null;
  sold_price: number | null;
  moderation_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarWithPhotos extends Car {
  car_photos: Pick<CarPhoto, 'id' | 'url' | 'position'>[];
}

export interface PublicOwner {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  identity_verified: boolean;
  created_at: string;
}

export interface CarDetail extends CarWithPhotos {
  owner: PublicOwner | null;
}

export interface PlatformSettings {
  id: number;
  platform_fee_percent: number;
  default_commission_type: CommissionType;
  default_commission_value: number;
  enabled_states: string[];
  max_listings_per_user: number;
  require_listing_approval: boolean;
}
