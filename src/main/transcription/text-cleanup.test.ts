import { describe, expect, it } from 'vitest';
import { cleanRecognizedText } from './text-cleanup';

describe('cleanRecognizedText', () => {
  it('keeps ordinary speech as it is', () => {
    expect(cleanRecognizedText('  Да, да, я OBS включил. Ну нет, нет, нет. ')).toBe('Да, да, я OBS включил. Ну нет, нет, нет.');
  });

  it('drops a piece that is only a known subtitle phrase', () => {
    expect(cleanRecognizedText('Продолжение следует...')).toBe('');
    expect(cleanRecognizedText('Спасибо за просмотр!')).toBe('');
    expect(cleanRecognizedText('Thanks for watching!')).toBe('');
    expect(cleanRecognizedText('Субтитры сделал DimaTorzok')).toBe('');
    expect(cleanRecognizedText('Редактор субтитров А.Синецкая Корректор А.Егорова')).toBe('');
  });

  it('keeps a known phrase that is part of a longer sentence', () => {
    expect(cleanRecognizedText('Спасибо за просмотр презентации, теперь к делу.')).toBe(
      'Спасибо за просмотр презентации, теперь к делу.',
    );
  });

  it('cuts a phrase repeated over and over down to one', () => {
    expect(cleanRecognizedText('Ну что, ну что, ну что, ну что, ну что, поехали')).toBe('Ну что, поехали');
    expect(cleanRecognizedText('да да да да да да да')).toBe('да');
    // Одно слово четыре раза подряд — бывает и в жизни.
    expect(cleanRecognizedText('нет нет нет нет')).toBe('нет нет нет нет');
    expect(cleanRecognizedText('Я думаю. Я думаю. Я думаю. Я думаю.')).toBe('Я думаю.');
  });

  it('keeps up to three repeats', () => {
    expect(cleanRecognizedText('нет, нет, нет')).toBe('нет, нет, нет');
  });

  it('shortens a long run of one letter', () => {
    expect(cleanRecognizedText('Эээээээээээээээээээ')).toBe('Эээ');
    expect(cleanRecognizedText('Ммм, понятно')).toBe('Ммм, понятно');
  });

  it('gives an empty string for an empty piece', () => {
    expect(cleanRecognizedText('   ')).toBe('');
  });
});
