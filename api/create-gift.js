import { put } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

function decodeDataUrl(value, expectedPrefix) {
  if (typeof value !== 'string' || !value.startsWith(expectedPrefix)) {
    throw new Error('Файл имеет неподдерживаемый формат.');
  }
  const comma = value.indexOf(',');
  if (comma < 0) throw new Error('Не удалось прочитать файл.');
  return Buffer.from(value.slice(comma + 1), 'base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Разрешён только POST-запрос.' });
  }

  try {
    const { name, message, photos = [], music = '' } = req.body || {};
    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'Напиши имя получателя.' });
    }
    if (!Array.isArray(photos) || photos.length > 5) {
      return res.status(400).json({ error: 'Можно добавить не больше 5 фотографий.' });
    }

    let estimated = 0;
    for (const p of photos) estimated += Math.floor(String(p).length * 0.75);
    if (music) estimated += Math.floor(String(music).length * 0.75);
    if (estimated > MAX_TOTAL_BYTES) {
      return res.status(413).json({ error: 'Файлы слишком большие. Выбери меньше фотографий или более короткий MP3 (общий размер после сжатия — до 3 МБ).' });
    }

    const id = randomBytes(8).toString('hex');
    const photoUrls = [];

    for (let i = 0; i < photos.length; i++) {
      const data = photos[i];
      if (typeof data !== 'string' || !data.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Одна из фотографий имеет неверный формат.' });
      }
      const mime = data.slice(5, data.indexOf(';'));
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        return res.status(400).json({ error: 'Поддерживаются JPG, PNG и WebP.' });
      }
      const bytes = decodeDataUrl(data, `data:${mime};base64`);
      const blob = await put(`gifts/${id}/photo-${i + 1}.jpg`, bytes, {
        access: 'public',
        contentType: mime,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      photoUrls.push(blob.url);
    }

    let musicUrl = '';
    if (music) {
      if (typeof music !== 'string' || !music.startsWith('data:audio/')) {
        return res.status(400).json({ error: 'Музыкальный файл имеет неверный формат.' });
      }
      const mime = music.slice(5, music.indexOf(';'));
      if (!['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav'].includes(mime)) {
        return res.status(400).json({ error: 'Выбери MP3, M4A, AAC, OGG или WAV.' });
      }
      const bytes = decodeDataUrl(music, `data:${mime};base64`);
      const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'm4a';
      const blob = await put(`gifts/${id}/music.${ext}`, bytes, {
        access: 'public', contentType: mime, addRandomSuffix: false, allowOverwrite: true,
      });
      musicUrl = blob.url;
    }

    const gift = {
      id,
      name: String(name).trim().slice(0, 50),
      message: String(message || '').trim().slice(0, 2000),
      photos: photoUrls,
      music: musicUrl,
      createdAt: new Date().toISOString(),
    };
    const saved = await put(`gifts/${id}/gift.json`, JSON.stringify(gift), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return res.status(200).json({
      id,
      url: `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}/?id=${id}`,
      stored: saved.url,
    });
  } catch (error) {
    console.error('create-gift failed:', error);
    const message = error?.message || 'Неизвестная ошибка';
    return res.status(500).json({ error: `Не удалось сохранить подарок: ${message}` });
  }
}
