import { supabase, CAR_PHOTOS_BUCKET } from './supabase';
import { compressImage } from './image';
import type { Car, CarPhoto, CarStatus, CarWithPhotos } from './types';

export async function fetchMyListings(ownerId: string): Promise<CarWithPhotos[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('*, car_photos(id, url, position)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as CarWithPhotos[];
}

export async function fetchMyListing(carId: string) {
  const [{ data: car, error }, { data: priv }, { data: photos }] = await Promise.all([
    supabase.from('cars').select('*').eq('id', carId).maybeSingle(),
    supabase.from('car_private').select('vin').eq('car_id', carId).maybeSingle(),
    supabase.from('car_photos').select('*').eq('car_id', carId).order('position'),
  ]);
  if (error) throw error;
  return {
    car: car as Car | null,
    vin: (priv?.vin as string | null | undefined) ?? '',
    photos: (photos ?? []) as CarPhoto[],
  };
}

export type CarInput = Partial<
  Pick<
    Car,
    | 'make' | 'model' | 'year' | 'trim_level' | 'mileage' | 'exterior_color' | 'transmission' | 'fuel_type'
    | 'body_type' | 'price' | 'description' | 'zip' | 'city' | 'state' | 'lat' | 'lng' | 'commission_type'
    | 'commission_value' | 'allow_any_verified_promoter' | 'status' | 'sold_price'
  >
>;

export async function createListing(ownerId: string, input: CarInput): Promise<Car> {
  const { data, error } = await supabase
    .from('cars')
    .insert({ ...input, owner_id: ownerId, status: 'draft' })
    .select('*')
    .single();
  if (error) throw error;
  return data as Car;
}

export async function updateListing(carId: string, input: CarInput): Promise<Car> {
  const { data, error } = await supabase.from('cars').update(input).eq('id', carId).select('*').single();
  if (error) throw error;
  return data as Car;
}

export async function saveVin(carId: string, vin: string) {
  const clean = vin.trim().toUpperCase();
  const { error } = await supabase.from('car_private').upsert({ car_id: carId, vin: clean || null });
  if (error) throw error;
}

export async function setListingStatus(carId: string, status: CarStatus, soldPrice?: number) {
  return updateListing(carId, { status, ...(soldPrice ? { sold_price: soldPrice } : {}) });
}

export async function deleteListing(car: Pick<Car, 'id' | 'owner_id'>) {
  // Remove photo files first (DB rows cascade when the car is deleted).
  const folder = `${car.owner_id}/${car.id}`;
  const { data: files } = await supabase.storage.from(CAR_PHOTOS_BUCKET).list(folder, { limit: 100 });
  if (files?.length) {
    await supabase.storage.from(CAR_PHOTOS_BUCKET).remove(files.map((f) => `${folder}/${f.name}`));
  }
  const { error } = await supabase.from('cars').delete().eq('id', car.id);
  if (error) throw error;
}

/* ---------------- Photos ---------------- */

export async function uploadCarPhoto(ownerId: string, carId: string, file: File, position: number): Promise<CarPhoto> {
  const blob = await compressImage(file);
  const path = `${ownerId}/${carId}/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(CAR_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from(CAR_PHOTOS_BUCKET).getPublicUrl(path);
  const { data, error } = await supabase
    .from('car_photos')
    .insert({ car_id: carId, storage_path: path, url: pub.publicUrl, position })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(CAR_PHOTOS_BUCKET).remove([path]);
    throw error;
  }
  return data as CarPhoto;
}

export async function deleteCarPhoto(photo: CarPhoto) {
  const { error } = await supabase.from('car_photos').delete().eq('id', photo.id);
  if (error) throw error;
  if (photo.storage_path) await supabase.storage.from(CAR_PHOTOS_BUCKET).remove([photo.storage_path]);
}

export async function savePhotoOrder(photos: CarPhoto[]) {
  const results = await Promise.all(
    photos.map((p, i) => supabase.from('car_photos').update({ position: i }).eq('id', p.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

/** Turns DB/trigger errors into messages a user understands. */
export function friendlyDbError(message: string) {
  if (message.includes('car_private_vin_check')) return 'The VIN must have 17 characters (letters I, O and Q are not used).';
  if (message.includes('commission_percent_range')) return 'Percentage commission can be at most 20%.';
  if (message.includes('active_requires_location')) return 'Add a valid ZIP code before publishing.';
  if (message.includes('active_requires_price')) return 'Set an asking price before publishing.';
  if (message.includes('row-level security')) return 'You do not have permission to do that.';
  if (message.includes('violates check constraint')) return 'Some fields have invalid values. Please review the form.';
  return message;
}
