import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Разрешён только GET-запрос.' });
  }
  const id = String(req.query?.id || '');
  if (!/^[a-f0-9]{16}$/.test(id)) {
    return res.status(400).json({ error: 'Ссылка на подарок повреждена.' });
  }
  try {
    const result = await list({ prefix: `gifts/${id}/gift.json`, limit: 10 });
    const blob = result.blobs.find((item) => item.pathname === `gifts/${id}/gift.json`);
    if (!blob) return res.status(404).json({ error: 'Подарок не найден. Возможно, ссылка неполная.' });
    const response = await fetch(blob.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Не удалось прочитать подарок (HTTP ${response.status}).`);
    const gift = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(gift);
  } catch (error) {
    console.error('gift lookup failed:', error);
    return res.status(500).json({ error: `Не удалось открыть подарок: ${error?.message || 'ошибка сервера'}` });
  }
}
