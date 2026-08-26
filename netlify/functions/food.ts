import { authorize, denied, json } from './_shared/auth';

const cleanBarcode = (value: string | null) => (value ?? '').replace(/\D/g, '');

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'solo GET' }, 405);
  const auth = authorize(request);
  if (!auth.ok) return denied();

  const barcode = cleanBarcode(new URL(request.url).searchParams.get('barcode'));
  if (!/^\d{8,14}$/.test(barcode)) return json({ error: 'barcode non valido' }, 400);

  const fields = [
    'code', 'product_name', 'brands', 'serving_size', 'quantity', 'image_front_url',
    'nutriments', 'nutrition_data_per', 'nutrition_grades', 'ingredients_text', 'allergens',
  ].join(',');
  const response = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,
    { headers: { 'user-agent': 'VINZ.MON/1.2 (private personal app)' }, signal: AbortSignal.timeout(8000) },
  );
  if (!response.ok) return json({ error: 'database alimentare non disponibile' }, 502);
  const body = await response.json() as { status?: number; product?: Record<string, unknown> };
  if (body.status !== 1 || !body.product) return json({ found: false, barcode });
  return json({ found: true, barcode, source: 'Open Food Facts', product: body.product });
}
